/**
 * New chat page – CSR equivalent of app/(chat)/page.tsx
 */

import { useLocation, useSearchParams } from "react-router-dom";
import { Chat } from "@/components/chat";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { generateUUID } from "@/lib/utils";
import { ChatLayout } from "@/pages/chat-layout";
import { useMemo } from "react";
import { useChatUserId } from "@/hooks/use-chat-user-id";

export default function ChatPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const agentFromQuery = searchParams.get("agent") ?? undefined;

  // Reason: React Router's location.key changes on every navigation, even to
  // the same path. Keying useMemo by it means each "New Chat" click regenerates
  // the ID and forces Chat to remount, even when already on `/`.
  const id = useMemo(() => generateUUID(), [location.key]);

  const chatModel = localStorage.getItem("chat-model") ?? DEFAULT_CHAT_MODEL;
  const userId = useChatUserId();

  return (
    <ChatLayout>
      <Chat
        autoResume={false}
        id={id}
        userId={userId}
        initialAssistantId={agentFromQuery ?? null}
        initialChatModel={chatModel}
        initialMessages={[]}
        initialVisibilityType="private"
        isReadonly={false}
        key={id}
      />
      <DataStreamHandler chatId={id} />
    </ChatLayout>
  );
}
