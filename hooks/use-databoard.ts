"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import {
  IMBRACE_BOARD_ID_KEY,
  IMBRACE_BOARD_SCOPE_DISMISSED_KEY,
  IMBRACE_ORG_ID_KEY,
  IMBRACE_TOKEN_KEY,
  IMBRACE_TOKEN_UPDATED_EVENT,
} from "@/lib/imbrace/constants";

export type DataboardMeta = {
  id: string;
  name: string | null;
  description: string | null;
  type: string | null;
  organization_id: string | null;
};

/** Internal: state holding both the raw stored id and the dismissed flag. */
type StoredScopeState = {
  id: string | null;
  dismissed: boolean;
};

function readStoredScope(): StoredScopeState {
  if (typeof window === "undefined") return { id: null, dismissed: false };
  return {
    id: window.localStorage.getItem(IMBRACE_BOARD_ID_KEY),
    dismissed:
      window.localStorage.getItem(IMBRACE_BOARD_SCOPE_DISMISSED_KEY) === "1",
  };
}

function useStoredScope(): StoredScopeState {
  const [state, setState] = useState<StoredScopeState>({
    id: null,
    dismissed: false,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const read = () => setState(readStoredScope());

    read();

    // Reason: `storage` only fires for OTHER tabs, so we'd miss the case
    // where ImbraceTokenHandler / chip / selector update keys in this same
    // tab AFTER the hook's first read. IMBRACE_TOKEN_UPDATED_EVENT is the
    // shared in-tab notification channel.
    const onTokenUpdated = () => read();
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === IMBRACE_BOARD_ID_KEY ||
        e.key === IMBRACE_BOARD_SCOPE_DISMISSED_KEY
      ) {
        read();
      }
    };
    window.addEventListener(IMBRACE_TOKEN_UPDATED_EVENT, onTokenUpdated);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(IMBRACE_TOKEN_UPDATED_EVENT, onTokenUpdated);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return state;
}

/**
 * Returns the *active* scoped board id — the localStorage value when scope
 * has not been dismissed, otherwise null. This is what gates whether
 * `/ai-agent/v2/chat` requests carry `board_id` and whether the mutation
 * broadcast hook fires. Use {@link useStoredBoardId} when you need the raw
 * id regardless of dismiss (e.g. the BoardSelector trigger label).
 */
export function useScopedBoardId(): string | null {
  const { id, dismissed } = useStoredScope();
  if (!id || dismissed) return null;
  return id;
}

/**
 * Returns the raw localStorage board id even when the user has dismissed
 * the scope. Used by the BoardSelector so it stays visible and offers a
 * way to re-engage scope (or switch boards) after a dismiss.
 */
export function useStoredBoardId(): string | null {
  return useStoredScope().id;
}

/**
 * Returns true when the user has dismissed the scope chip but a stored
 * boardId still exists. Useful for UI affordances (e.g. selector trigger
 * label "Select a board" vs the board name).
 */
export function useScopeDismissed(): boolean {
  return useStoredScope().dismissed;
}

// Reason: app-gateway's data-board route responds 401 without imbrace auth
// headers. SWR's default fetcher doesn't include them, so attach
// `x-access-token` + `x-organization-id` from localStorage (where
// imbrace-token-handler stashes them post-auth).
async function databoardFetcher<T>(url: string): Promise<T> {
  const token = window.localStorage.getItem(IMBRACE_TOKEN_KEY) ?? "";
  const orgId = window.localStorage.getItem(IMBRACE_ORG_ID_KEY) ?? "";
  const headers: Record<string, string> = {
    "x-access-token": token,
    "x-organization-id": orgId,
  };
  const response = await fetch(url, {
    method: "GET",
    headers,
  });
  if (!response.ok) {
    throw new Error(`Databoard lookup failed: ${response.status}`);
  }
  return response.json();
}

function pickString(
  source: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function normalizeBoardMeta(
  raw: Record<string, unknown>,
  fallbackId?: string,
): DataboardMeta {
  return {
    id: pickString(raw, "_id", "id") ?? fallbackId ?? "",
    name: pickString(raw, "name"),
    description: pickString(raw, "description"),
    type: pickString(raw, "type"),
    organization_id: pickString(raw, "organization_id", "org_id"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unwrapDataboardEnvelope(payload: unknown): unknown {
  // Webapp returns `{ data: ... }` (sometimes nested under `success`/`data`).
  // Tolerate any of: `{ data: X }`, `{ data: { data: X } }`, or X directly.
  if (!isRecord(payload)) return payload;
  if ("data" in payload && payload["data"] !== undefined) {
    const inner = payload["data"];
    if (isRecord(inner) && "data" in inner && inner["data"] !== undefined) {
      return inner["data"];
    }
    return inner;
  }
  return payload;
}

// Reason: nginx proxies `/appgateway/*` → app-gateway, which mounts the
// data-board service at `/data-board/*` (rewritten to `/api/*` upstream).
// Same-origin call so no CORS preflight, and we get the env-routed gateway
// without depending on `IMBRACE_BASE_URL` runtime config.
const DATABOARD_API_PREFIX = "/appgateway/data-board/boards";

function toBoardListUrl(type: string): string {
  // Reason: data-board service expects the legacy listing query.
  // `limit=0` returns all rows; `is_default=false` hides system boards.
  const params = new URLSearchParams({
    limit: "0",
    skip: "0",
    sort: "-created_at",
    is_default: "false",
    types: type,
  });
  return `${DATABOARD_API_PREFIX}?${params.toString()}`;
}

function toBoardByIdUrl(id: string): string {
  return `${DATABOARD_API_PREFIX}/${id}`;
}

/**
 * Fetch board metadata for the stored databoard id from `?databoardId=…`.
 * Uses the *stored* id (not the active one) so the BoardSelector / chip
 * still know the board name even when the user has dismissed the scope.
 *
 * Callers that care about whether scope is currently active (e.g. for
 * sending `board_id` in chat requests) should use {@link useScopedBoardId}
 * instead.
 *
 * Returns `{ board: null }` when there's no stored id at all.
 */
export function useScopedDataboard() {
  const boardId = useStoredBoardId();

  const { data, error, isLoading } = useSWR<unknown>(
    boardId ? toBoardByIdUrl(boardId) : null,
    databoardFetcher,
  );

  let board: DataboardMeta | null = null;
  if (data) {
    const unwrapped = unwrapDataboardEnvelope(data);
    if (isRecord(unwrapped)) {
      board = normalizeBoardMeta(unwrapped, boardId ?? undefined);
    }
  }

  return {
    boardId,
    board,
    error: error ?? null,
    isLoading: !!boardId && isLoading,
  };
}

export type DataboardSummary = {
  id: string;
  name: string | null;
  type: string | null;
  description: string | null;
};

/**
 * Fetch sibling boards that share the scoped board's `type`. Used by the
 * in-chat BoardSelector dropdown so the user can switch scope without
 * leaving the chat.
 *
 * Returns `{ boards: [] }` when there's no scope or the scoped board's
 * type hasn't loaded yet — callers don't need extra null-guards.
 */
export function useScopedDataboardSiblings() {
  const { boardId, board } = useScopedDataboard();
  const type = board?.type ?? null;

  const { data, error, isLoading } = useSWR<unknown>(
    boardId && type ? toBoardListUrl(type) : null,
    databoardFetcher,
  );

  let allBoards: DataboardSummary[] = [];
  if (data) {
    const unwrapped = unwrapDataboardEnvelope(data);
    if (Array.isArray(unwrapped)) {
      allBoards = unwrapped
        .filter(isRecord)
        .map((b) => {
          const meta = normalizeBoardMeta(b);
          return {
            id: meta.id,
            name: meta.name,
            type: meta.type,
            description: meta.description,
          };
        })
        .filter((b) => b.id.length > 0);
    }
  }

  // Reason: belt-and-suspenders — if the upstream private API ever returns
  // boards of other types (e.g. caching), the client filters again so the
  // selector dropdown never shows mixed types.
  const filtered = type ? allBoards.filter((b) => b.type === type) : allBoards;

  return {
    boardId,
    type,
    boards: filtered,
    error: error ?? null,
    isLoading: !!boardId && !!type && isLoading,
  };
}

/**
 * Switch the scoped board id and re-engage scope (clears the dismissed
 * flag if it was set). Persists to localStorage and notifies the other
 * hooks in the same tab. No-op when called outside the browser.
 */
export function setScopedBoardId(nextBoardId: string): void {
  if (typeof window === "undefined") return;
  if (!nextBoardId || nextBoardId.trim().length === 0) return;
  window.localStorage.setItem(IMBRACE_BOARD_ID_KEY, nextBoardId);
  window.localStorage.removeItem(IMBRACE_BOARD_SCOPE_DISMISSED_KEY);
  window.dispatchEvent(new CustomEvent(IMBRACE_TOKEN_UPDATED_EVENT));
}

/**
 * Dismiss the scope chip without clearing the stored boardId. Subsequent
 * chat requests skip `board_id` and the mutation broadcast goes silent,
 * but the BoardSelector can still surface the previously-scoped board so
 * the user can re-engage by picking any board from the dropdown.
 */
export function dismissScopedBoard(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(IMBRACE_BOARD_SCOPE_DISMISSED_KEY, "1");
  window.dispatchEvent(new CustomEvent(IMBRACE_TOKEN_UPDATED_EVENT));
}
