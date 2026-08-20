/**
 * Chat detail page – CSR equivalent of app/(chat)/chat/[id]/page.tsx
 */

import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Chat } from "@/components/chat";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { FlowEditorPanel } from "@/components/flow-editor-panel";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { convertToUIMessages, extractSubAgentMessages } from "@/lib/utils";
import { getClientApi } from "@/lib/api/clientApi";
import { ChatLayout } from "@/pages/chat-layout";
import { useChatUserId } from "@/hooks/use-chat-user-id";
import type { Chat as ChatType, DBMessage } from "@/lib/db/schema";

export default function ChatDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [chat, setChat] = useState<ChatType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const userId = useChatUserId();

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      try {
        const api = getClientApi();
        const [chatData, messagesData] = await Promise.all([
          api.getChat(id!),
          api.getMessages(id!),
        ]);

        if (cancelled) return;

        if (!chatData) {
          setError(true);
          setLoading(false);
          return;
        }

        setChat({ ...chatData, _messages: messagesData });
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <ChatLayout>
        <div className="flex h-full items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground" />
        </div>
      </ChatLayout>
    );
  }

  if (error || !chat) {
    return (
      <ChatLayout>
        <div className="flex h-full flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">Chat not found</p>
          <button
            className="text-primary underline"
            onClick={() => navigate("/")}
            type="button"
          >
            Go to new chat
          </button>
        </div>
      </ChatLayout>
    );
  }

  const messagesFromDb = (chat as any)._messages as DBMessage[] ?? [];
  const { messages: regularMessages, subAgentMessages } = extractSubAgentMessages(messagesFromDb);
  const uiMessages = convertToUIMessages(regularMessages);

  const chatModel = localStorage.getItem("chat-model") ?? DEFAULT_CHAT_MODEL;

  return (
    <ChatLayout>
      <Chat
        autoResume={true}
        id={chat.id}
        userId={userId}
        initialAssistantId={chat.assistantId ?? null}
        initialAgentMessages={subAgentMessages}
        initialChatModel={chatModel}
        initialLastContext={(chat as any).lastContext ?? undefined}
        initialMessages={uiMessages}
        initialStatus={(chat as any).status ?? "idle"}
        initialVisibilityType={chat.visibility}
        isReadonly={false}
      />
      <DataStreamHandler chatId={chat.id} />
      <FlowEditorPanel />
    </ChatLayout>
  );
}
