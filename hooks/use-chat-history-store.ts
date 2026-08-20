"use client";

import { useCallback, useMemo } from "react";
import useSWR from "swr";
import type { Chat } from "@/lib/db/schema";

export type ChatHistoryPage = {
  chats: Chat[];
  hasMore: boolean;
};

export type ChatHistoryStoreState = {
  chats: Chat[];
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  organizationId: string | null;
  pageSize: number;
};

export const initialChatHistoryStoreState: ChatHistoryStoreState = {
  chats: [],
  hasMore: false,
  isLoading: false,
  isLoadingMore: false,
  error: null,
  organizationId: null,
  pageSize: 20,
};

type Selector<T> = (state: ChatHistoryStoreState) => T;

export function useChatHistoryStoreSelector<Selected>(
  selector: Selector<Selected>
) {
  const { data: localState } = useSWR<ChatHistoryStoreState>(
    "chat-history-store",
    null,
    {
      fallbackData: initialChatHistoryStoreState,
    }
  );

  return useMemo(() => {
    if (!localState) {
      return selector(initialChatHistoryStoreState);
    }
    return selector(localState);
  }, [localState, selector]);
}

async function fetchHistoryPage(args: {
  limit: number;
  organizationId: string | null;
  endingBefore: string | null;
}): Promise<ChatHistoryPage> {
  const params = new URLSearchParams();
  params.set("limit", String(args.limit));

  if (args.organizationId) {
    params.set("organization_id", args.organizationId);
  }

  if (args.endingBefore) {
    params.set("ending_before", args.endingBefore);
  }

  const { getClientApi } = await import("@/lib/api/clientApi");
  const api = getClientApi();
  const result = await api.listChats({
    limit: args.limit,
    organization_id: args.organizationId,
    ending_before: args.endingBefore,
    starting_after: null,
  });

  return {
    chats: Array.isArray(result.chats) ? result.chats : [],
    hasMore: Boolean(result.hasMore),
  };
}

export function useChatHistoryStore() {
  const { data: localState, mutate: setLocalState } = useSWR<ChatHistoryStoreState>(
    "chat-history-store",
    null,
    {
      fallbackData: initialChatHistoryStoreState,
    }
  );

  const state = useMemo(() => {
    if (!localState) {
      return initialChatHistoryStoreState;
    }
    return localState;
  }, [localState]);

  const setState = useCallback(
    (
      updater:
        | ChatHistoryStoreState
        | ((current: ChatHistoryStoreState) => ChatHistoryStoreState)
    ) => {
      setLocalState((currentState) => {
        const current = currentState ?? initialChatHistoryStoreState;
        if (typeof updater === "function") {
          return updater(current);
        }
        return updater;
      });
    },
    [setLocalState]
  );

  const setOrganizationId = useCallback(
    (organizationId: string | null) => {
      setState((current) => ({
        ...current,
        organizationId,
      }));
    },
    [setState]
  );

  const reset = useCallback(() => {
    setState(initialChatHistoryStoreState);
  }, [setState]);

  const refresh = useCallback(
    async (args?: { organizationId?: string | null; pageSize?: number }) => {
      const orgId =
        typeof args?.organizationId !== "undefined"
          ? args.organizationId ?? null
          : state.organizationId;

      const limit = args?.pageSize ?? state.pageSize;

      setState((current) => ({
        ...current,
        isLoading: true,
        isLoadingMore: false,
        error: null,
        organizationId: orgId,
      }));

      try {
        const page = await fetchHistoryPage({
          limit,
          organizationId: orgId,
          endingBefore: null,
        });

        setState((current) => ({
          ...current,
          chats: page.chats,
          hasMore: page.hasMore,
          isLoading: false,
          isLoadingMore: false,
          error: null,
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch chat history";
        setState((current) => ({
          ...current,
          isLoading: false,
          isLoadingMore: false,
          error: message,
        }));
      }
    },
    [setState, state.organizationId, state.pageSize]
  );

  const loadMore = useCallback(async () => {
    if (state.isLoading || state.isLoadingMore) {
      return;
    }

    if (!state.hasMore) {
      return;
    }

    const last = state.chats.at(-1);
    if (!last) {
      return;
    }

    setState((current) => ({
      ...current,
      isLoadingMore: true,
      error: null,
    }));

    try {
      const page = await fetchHistoryPage({
        limit: state.pageSize,
        organizationId: state.organizationId,
        endingBefore: last.id,
      });

      setState((current) => ({
        ...current,
        chats: [...current.chats, ...page.chats],
        hasMore: page.hasMore,
        isLoadingMore: false,
        error: null,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load more chats";
      setState((current) => ({
        ...current,
        isLoadingMore: false,
        error: message,
      }));
    }
  }, [
    setState,
    state.chats,
    state.hasMore,
    state.isLoading,
    state.isLoadingMore,
    state.organizationId,
    state.pageSize,
  ]);

  return useMemo(
    () => ({
      state,
      // state slices
      chats: state.chats,
      hasMore: state.hasMore,
      isLoading: state.isLoading,
      isLoadingMore: state.isLoadingMore,
      error: state.error,
      organizationId: state.organizationId,
      pageSize: state.pageSize,
      // actions
      setOrganizationId,
      refresh,
      loadMore,
      reset,
      setState,
    }),
    [state, setOrganizationId, refresh, loadMore, reset, setState]
  );
}




