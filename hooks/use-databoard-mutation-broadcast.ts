"use client";

import { useEffect, useRef } from "react";
import { mutate as swrMutate } from "swr";
import type { ChatMessage } from "@/lib/types";

/**
 * Tools that mutate board ITEMS (rows). Parent dashboard should refresh
 * the FlexibleTable (table-level refetch) on these.
 */
const ITEM_TOOLS: ReadonlySet<string> = new Set([
  "create_board_item",
  "create_board_items",
  "update_board_item",
  "delete_board_item",
]);

/**
 * Tools that mutate board SCHEMA (fields, board itself). Parent dashboard
 * should refetch the boards/schema query AND the table on these.
 */
const SCHEMA_TOOLS: ReadonlySet<string> = new Set([
  "update_board_schema",
  "delete_board",
]);

/**
 * Tools whose success changes the *board list* — adding, removing or
 * renaming a board. After these, the BoardSelector dropdown should
 * re-fetch `/appgateway/data-board/boards` so the new state is reflected
 * immediately (e.g. user creates a new board via chat → it shows up in the
 * picker).
 */
const BOARD_LIST_AFFECTING_TOOLS: ReadonlySet<string> = new Set([
  "create_board",
  "delete_board",
  "update_board_schema",
]);

type MutationEventType =
  | "imbrace.databoard.itemsMutated"
  | "imbrace.databoard.schemaMutated";

type MutationEvent = {
  type: MutationEventType;
  v: 1;
  boardId: string;
  toolName: string;
  toolCallId: string;
  ts: number;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Inspect a tool/dynamic-tool part and return `{ toolName, toolCallId, output }`
 * when it's in the `output-available` state, else null. Handles both
 * static (`type: "tool-<name>"`) and dynamic (`type: "dynamic-tool"`) shapes.
 */
function readOutputAvailableTool(part: unknown): {
  toolName: string;
  toolCallId: string;
  output: unknown;
} | null {
  if (!isPlainObject(part)) return null;
  const state = part["state"];
  if (state !== "output-available") return null;
  const toolCallId = part["toolCallId"];
  if (typeof toolCallId !== "string" || toolCallId.length === 0) return null;

  const type = part["type"];
  if (typeof type === "string" && type.startsWith("tool-")) {
    return {
      toolName: type.slice("tool-".length),
      toolCallId,
      output: part["output"],
    };
  }
  if (type === "dynamic-tool") {
    const toolName = part["toolName"];
    if (typeof toolName !== "string") return null;
    return { toolName, toolCallId, output: part["output"] };
  }
  return null;
}

/** Best-effort detection of an error result so we don't broadcast no-ops. */
function isErrorOutput(output: unknown): boolean {
  if (!isPlainObject(output)) return false;
  if (output["status"] === "error") return true;
  if (typeof output["error"] === "string" && (output["error"] as string).length > 0) {
    return true;
  }
  if (
    typeof output["errorText"] === "string" &&
    (output["errorText"] as string).length > 0
  ) {
    return true;
  }
  return false;
}

function eventTypeFor(toolName: string): MutationEventType | null {
  if (ITEM_TOOLS.has(toolName)) return "imbrace.databoard.itemsMutated";
  if (SCHEMA_TOOLS.has(toolName)) return "imbrace.databoard.schemaMutated";
  return null;
}

/**
 * Watch the chat's assistant messages for tool-output-available parts on
 * databoard mutation tools and broadcast a typed postMessage to the parent
 * window so the embedding dashboard can refresh its table / schema.
 *
 * Dedupes by `toolCallId` across re-renders. Primes the seen-set from the
 * initial messages so re-hydrating chat history does not rebroadcast
 * historical mutations.
 *
 * Targets `"*"` because the receiver enforces origin validation; the payload
 * carries no sensitive data.
 */
export function useDataboardMutationBroadcast(
  messages: ChatMessage[],
  boardId: string | null | undefined,
): void {
  const seenRef = useRef<Set<string> | null>(null);

  // Lazy-init: prime from initial messages on first render so we never re-broadcast historical mutations after a remount or reload.
  if (seenRef.current === null) {
    const seen = new Set<string>();
    for (const msg of messages) {
      if (msg?.role !== "assistant" || !Array.isArray(msg.parts)) continue;
      for (const part of msg.parts) {
        const meta = readOutputAvailableTool(part);
        if (meta) seen.add(meta.toolCallId);
      }
    }
    seenRef.current = seen;
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || !Array.isArray(last.parts)) {
      return;
    }

    const seen = seenRef.current!;
    const isEmbedded = window.parent !== window;

    for (const part of last.parts) {
      const meta = readOutputAvailableTool(part);
      if (!meta) continue;
      if (seen.has(meta.toolCallId)) continue;

      // Always mark seen — even on error — so we never retry a failed call.
      seen.add(meta.toolCallId);
      if (isErrorOutput(meta.output)) continue;

      // 1) Local SWR invalidation — refresh BoardSelector / chip when the
      //    list of boards or a board's metadata changed. Runs regardless
      //    of embedding or scope: the selector is visible when the user
      //    has dismissed scope, and `create_board` can fire from there.
      if (BOARD_LIST_AFFECTING_TOOLS.has(meta.toolName)) {
        void swrMutate(
          (key) =>
            typeof key === "string" &&
            key.includes("/appgateway/data-board/boards"),
          undefined,
          { revalidate: true },
        );
      }

      // 2) Parent dashboard broadcast — only when the chat is iframe-
      //    embedded AND the request was board-scoped (so the parent
      //    knows which board's data to refetch).
      if (!isEmbedded || !boardId) continue;
      const eventType = eventTypeFor(meta.toolName);
      if (!eventType) continue;
      const payload: MutationEvent = {
        type: eventType,
        v: 1,
        boardId,
        toolName: meta.toolName,
        toolCallId: meta.toolCallId,
        ts: Date.now(),
      };
      window.parent.postMessage(payload, "*");
    }
  }, [messages, boardId]);
}
