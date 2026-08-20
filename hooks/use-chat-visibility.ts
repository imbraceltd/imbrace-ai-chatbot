"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { getClientApi } from "@/lib/api/clientApi";
import { useChatHistoryStore, useChatHistoryStoreSelector } from "@/hooks/use-chat-history-store";
import type { VisibilityType } from "@/components/visibility-selector";

export function useChatVisibility({
  chatId,
  initialVisibilityType,
}: {
  chatId: string;
  initialVisibilityType: VisibilityType;
}) {
  const historyVisibility = useChatHistoryStoreSelector((state) => {
    const chat = state.chats.find((currentChat) => currentChat.id === chatId);
    return chat?.visibility ?? null;
  });
  const { refresh: refreshChatHistory } = useChatHistoryStore();

  const { data: localVisibility, mutate: setLocalVisibility } = useSWR(
    `${chatId}-visibility`,
    null,
    {
      fallbackData: initialVisibilityType,
    }
  );

  const visibilityType = useMemo(() => {
    return historyVisibility ?? localVisibility;
  }, [historyVisibility, localVisibility]);

  const setVisibilityType = (updatedVisibilityType: VisibilityType) => {
    setLocalVisibility(updatedVisibilityType);
    void refreshChatHistory();

    getClientApi().updateChat(chatId, { visibility: updatedVisibilityType }).catch(() => {});
  };

  return { visibilityType, setVisibilityType };
}
