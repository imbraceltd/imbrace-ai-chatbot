"use client";

import { useChat, type UseChatHelpers } from "@ai-sdk/react";
import type { DataUIPart, DynamicToolUIPart } from "ai";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { useWindowSize } from "usehooks-ts";
import type { ImbraceAgent } from "@/hooks/use-agent-store";
import { useAgentStore } from "@/hooks/use-agent-store";
import { useChatHistoryStore } from "@/hooks/use-chat-history-store";
import { useChatProcessingStatus } from "@/hooks/use-chat-processing-status";
import {
  IMBRACE_BOARD_ID_KEY,
  IMBRACE_BOARD_SCOPE_DISMISSED_KEY,
  IMBRACE_ORG_ID_KEY,
  IMBRACE_TOKEN_KEY,
} from "@/lib/imbrace/constants";
import { env } from "@/lib/env";
import { ChatHeader } from "@/components/chat-header";
import { initialArtifactData, useArtifact, useArtifactSelector } from "@/hooks/use-artifact";
import { useAICentric } from "@/hooks/use-ai-centric";
import { useChatVisibility } from "@/hooks/use-chat-visibility";
import type { Vote } from "@/lib/db/schema";
import type { Attachment, ChatMessage, CustomUIDataTypes } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";
import { convertToUIMessages, fetcher, fetchWithErrorHandlers, generateUUID } from "@/lib/utils";
import { AICentric } from "./ai-centric";
import { AiCentricContextSuggestions } from "./ai-centric/context-suggestions";
import { useTranslation } from "@/lib/i18n/client";

import { Artifact } from "./artifact";
import { DataboardScopeChip } from "./databoard-scope-chip";
import { PromptSuggestions } from "./prompt-suggestions";
import { useDataStream } from "./data-stream-provider";
import { Messages } from "./messages";
import { MultimodalInput } from "./multimodal-input";
import { useMultiSession, isSubAgentEvent, type SubAgentEvent, type AgentMessage, type SubAgentSessionInfo } from "@/hooks/use-multi-session";
import { useFlowEditor } from "@/hooks/use-flow-editor";
import { useScopedBoardId } from "@/hooks/use-databoard";
import { useDataboardMutationBroadcast } from "@/hooks/use-databoard-mutation-broadcast";
import { toast } from "./toast";
import type { VisibilityType } from "./visibility-selector";

/**
 * Create a fetch wrapper that intercepts the SSE stream to extract
 * sub-agent events in real-time. The AI SDK's onData callback doesn't
 * reliably fire for data parts during streaming, so we tee() the
 * response body and parse one copy ourselves.
 */
function createStreamInterceptingFetch(
  baseFetch: typeof fetch,
  onSubAgentEvent: (event: SubAgentEvent) => void,
): typeof fetch {
  return async (input, init) => {
    console.log("[StreamInterceptor] fetch called:", typeof input === "string" ? input : (input as Request).url);
    const response = await baseFetch(input, init);

    // Only intercept streaming responses with a body
    if (!response.body) {
      console.log("[StreamInterceptor] no body, skipping interception");
      return response;
    }

    console.log("[StreamInterceptor] tee()-ing response body");
    const [streamForSDK, streamForInterceptor] = response.body.tee();

    // Process the interceptor stream in the background
    void (async () => {
      const reader = streamForInterceptor.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let chunkCount = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log("[StreamInterceptor] stream done after", chunkCount, "chunks");
            break;
          }

          chunkCount++;
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          // Log first few chunks to see SSE format
          if (chunkCount <= 5) {
            console.log(`[StreamInterceptor] chunk #${chunkCount} (${chunk.length} bytes):`, chunk.slice(0, 200));
          }

          // Process complete SSE lines
          const lines = buffer.split("\n");
          // Keep the last incomplete line in the buffer
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;

            const jsonStr = trimmed.slice(5).trim();
            if (!jsonStr || jsonStr === "[DONE]") continue;

            try {
              const parsed = JSON.parse(jsonStr);

              // Check for sub-agent events with data- prefix (AI SDK v5 custom data format).
              // AI SDK v5 wraps custom data as: { type: "data-*", data: { ...payload } }
              if (
                parsed &&
                typeof parsed === "object" &&
                typeof parsed.type === "string" &&
                parsed.type.startsWith("data-sub-agent-") &&
                parsed.data &&
                typeof parsed.data === "object"
              ) {
                // Reconstruct SubAgentEvent from the nested data + type
                const event: SubAgentEvent = {
                  type: parsed.type,
                  ...parsed.data,
                };
                console.log("[StreamInterceptor] FOUND sub-agent event:", event.type, event.agent_name);
                onSubAgentEvent(event);
              }
            } catch {
              // Not valid JSON, skip
            }
          }
        }
      } catch (err) {
        console.log("[StreamInterceptor] stream read error:", err);
      } finally {
        reader.releaseLock();
      }
    })();

    // Return a new response with the SDK's copy of the stream
    return new Response(streamForSDK, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}

// ==============================
// Declarations (helpers/constants)
// ==============================
function createAssistantErrorMessage(text: string): ChatMessage {
  return {
    id: generateUUID(),
    role: "assistant",
    parts: [{ type: "text", text }],
    metadata: { createdAt: new Date().toISOString() },
  } as ChatMessage;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readStringField(
  obj: Record<string, unknown>,
  key: string
): string | undefined {
  const value = obj[key];
  return typeof value === "string" ? value : undefined;
}

function upsertDynamicToolPartToMessages(
  prev: ChatMessage[],
  toolPart: DynamicToolUIPart
): ChatMessage[] {
  for (let i = prev.length - 1; i >= 0; i--) {
    const message = prev[i];
    if (message.role !== "assistant") {
      continue;
    }

    const index = message.parts.findIndex(
      (p) =>
        p.type === "dynamic-tool" &&
        "toolCallId" in p &&
        p.toolCallId === toolPart.toolCallId
    );

    const updatedParts =
      index === -1
        ? ([...message.parts, toolPart] as ChatMessage["parts"])
        : ([
          ...message.parts.slice(0, index),
          toolPart,
          ...message.parts.slice(index + 1),
        ] as ChatMessage["parts"]);

    const updated: ChatMessage = {
      ...message,
      parts: updatedParts,
    } as ChatMessage;

    return [...prev.slice(0, i), updated, ...prev.slice(i + 1)];
  }

  const createdAt = new Date().toISOString();
  const newMessage: ChatMessage = {
    id: generateUUID(),
    role: "assistant",
    parts: [toolPart] as ChatMessage["parts"],
    metadata: { createdAt },
  } as ChatMessage;

  return [...prev, newMessage];
}

function parseDynamicToolStreamPart(dataPart: unknown): DynamicToolUIPart | null {
  if (!isRecord(dataPart)) {
    return null;
  }

  const type = readStringField(dataPart, "type");
  if (!type) {
    return null;
  }

  if (
    type !== "tool-input-start" &&
    type !== "tool-input-available" &&
    type !== "tool-output-available" &&
    type !== "tool-output-error"
  ) {
    return null;
  }

  const toolCallId =
    readStringField(dataPart, "toolCallId") ??
    readStringField(dataPart, "id") ??
    readStringField(dataPart, "callId");

  if (!toolCallId) {
    return null;
  }

  const toolName =
    readStringField(dataPart, "toolName") ??
    readStringField(dataPart, "name") ??
    "tool";

  if (type === "tool-input-start") {
    return {
      type: "dynamic-tool",
      toolName,
      toolCallId,
      state: "input-streaming",
      input: undefined,
    };
  }

  if (type === "tool-input-available") {
    const input = "input" in dataPart ? (dataPart as { input?: unknown }).input : undefined;
    return {
      type: "dynamic-tool",
      toolName,
      toolCallId,
      state: "input-available",
      input,
    };
  }

  if (type === "tool-output-error") {
    const errorText = readStringField(dataPart, "errorText") ?? "Tool execution failed.";
    return {
      type: "dynamic-tool",
      toolName,
      toolCallId,
      state: "output-error",
      input: {},
      errorText,
    };
  }

  // tool-output-available
  const output =
    "output" in dataPart ? (dataPart as { output?: unknown }).output : undefined;
  const inputFromEvent =
    "input" in dataPart ? (dataPart as { input?: unknown }).input : undefined;

  return {
    type: "dynamic-tool",
    toolName,
    toolCallId,
    state: "output-available",
    input: inputFromEvent ?? {},
    output,
  };
}

export function Chat({
  id,
  userId,
  initialAssistantId,
  initialAgentMessages,
  initialMessages,
  initialChatModel,
  initialVisibilityType,
  initialStatus = "idle",
  isReadonly,
  autoResume: _autoResume,
  initialLastContext,
}: {
  id: string;
  userId: string;
  initialAssistantId: string | null;
  initialAgentMessages?: AgentMessage[];
  initialMessages: ChatMessage[];
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  initialStatus?: "idle" | "processing";
  isReadonly: boolean;
  autoResume: boolean;
  initialLastContext?: AppUsage;
}) {
  // ==============================
  // Hooks
  // ==============================
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation("");

  // In CSR mode, refresh messages from DB to sync IDs (nanoid → DB UUID).
  const safeRefresh = useCallback(async () => {
    try {
      const { getClientApi } = await import("@/lib/api/clientApi");
      const dbMessages = await getClientApi().getMessages(id);
      const uiMessages = convertToUIMessages(dbMessages);
      setMessagesRef.current?.(uiMessages);
    } catch {
      // silent — vote will just use stale IDs
    }
  }, [id]);

  const { visibilityType } = useChatVisibility({
    chatId: id,
    initialVisibilityType,
  });

  const { isProcessing } = useChatProcessingStatus({
    chatId: id,
    initialStatus,
    onComplete: () => {
      safeRefresh();
    },
  });

  const { setDataStream } = useDataStream();

  // Persisted agent messages from DB — survives reset() between prompts.
  // Live streaming messages are managed separately by useMultiSession().
  const [persistedAgentMessages, setPersistedAgentMessages] = useState<AgentMessage[]>(
    initialAgentMessages ?? [],
  );

  // Sync persisted agent messages when server component re-renders
  // (e.g., after /* no-op in CSR */void 0 when stream finishes and new sub-agent
  // messages are saved to DB).
  const initialAgentMessageIds = (initialAgentMessages ?? []).map((m) => m.id).join(",");
  const isFirstAgentRenderRef = useRef(true);
  useEffect(() => {
    if (isFirstAgentRenderRef.current) {
      isFirstAgentRenderRef.current = false;
      return;
    }
    setPersistedAgentMessages(initialAgentMessages ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAgentMessageIds]);

  // Live-only multi-session hook — reset() only clears streaming state.
  const multiSession = useMultiSession();
  const multiSessionRef = useRef(multiSession);
  multiSessionRef.current = multiSession;

  // Wire flow editor panel to the multi-session hook's callback ref.
  // This avoids re-creating the intercepting fetch or touching the callback closure.
  const { open: openFlowEditor } = useFlowEditor();
  useEffect(() => {
    multiSession.setFlowEditorCallback(openFlowEditor);
  }, [multiSession.setFlowEditorCallback, openFlowEditor]);

  // Merge persisted (DB) + live (streaming) agent messages for rendering.
  // Deduplicate by session id to prevent duplicates when completed live
  // agents are promoted to persisted state and then reloaded from DB.
  const allAgentMessages = useMemo(() => {
    const seen = new Set(persistedAgentMessages.map((m) => m.id));
    const deduped = [...persistedAgentMessages];
    for (const m of multiSession.agentMessages) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        deduped.push(m);
      }
    }
    return deduped;
  }, [persistedAgentMessages, multiSession.agentMessages]);

  // Reason: Parse sub-agent session registry from Chat.lastContext so the
  // expand modal can reuse existing sessions instead of creating new ones.
  const subAgentSessions = useMemo(() => {
    const ctx = initialLastContext as Record<string, unknown> | undefined;
    return (ctx?.subAgentSessions as SubAgentSessionInfo[]) ?? [];
  }, [initialLastContext]);

  // Debug: track agentMessages changes at Chat level
  useEffect(() => {
    console.log("[Chat] agentMessages - persisted:", persistedAgentMessages.length, "live:", multiSession.agentMessages.length, "total:", allAgentMessages.length);
  }, [persistedAgentMessages, multiSession.agentMessages]);

  // Create a stable intercepting fetch that reads the raw SSE stream
  // for sub-agent events, bypassing the AI SDK's onData timing issues.
  const interceptingFetchRef = useRef<typeof fetch | null>(null);
  if (!interceptingFetchRef.current) {
    interceptingFetchRef.current = createStreamInterceptingFetch(
      fetchWithErrorHandlers,
      (event) => {
        console.log("[StreamInterceptor] sub-agent event:", event.type, event.agent_name);
        multiSessionRef.current.handleStreamEvent(event);
      },
    );
  }

  const [input, setInput] = useState("");
  const [currentModelId] = useState(initialChatModel);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  // Use agent store for selectedAgent
  const { agents, selectedAgent, setSelectedAgent } = useAgentStore();
  const { refresh: refreshChatHistory } = useChatHistoryStore();

  const visibilityTypeRef = useRef(visibilityType);
  const selectedAgentRef = useRef(selectedAgent);
  const tRef = useRef(t);
  tRef.current = t;
  const didHandleStreamErrorRef = useRef(false);
  const setMessagesRef = useRef<UseChatHelpers<ChatMessage>["setMessages"] | null>(
    null
  );
  // Chat row exists in DB only after it had initial messages or the user has sent one.
  const chatPersistedRef = useRef(initialMessages.length > 0);

  // AICentric integration
  const {
    setCurrentAgentId,
    state: aiCentricState,
    isVisible: isAiCentricVisible,
    isSupportedChartAgent,
    isSCBAgent,
    setChartContext,
  } = useAICentric();

  // Keep the latest SCB contact context available to the chat transport
  // closure below (which is created once but must read current values).
  const messageSuggestionContextRef = useRef(
    aiCentricState.messageSuggestionContext
  );
  messageSuggestionContextRef.current = aiCentricState.messageSuggestionContext;

  useEffect(() => {
    setChartContext({ chatId: id, chartId: undefined, chartData: undefined });
  }, []);

  useEffect(() => {
    selectedAgentRef.current = selectedAgent;
  }, [selectedAgent]);

  // Fetch full assistant details when agent selection changes
  const fetchedAssistantIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedAgent?.assistant_id) return;

    // Skip if we already fetched details for this assistant
    if (fetchedAssistantIdRef.current === selectedAgent.assistant_id) return;
    fetchedAssistantIdRef.current = selectedAgent.assistant_id;

    const token =
      typeof window !== "undefined"
        ? window.localStorage.getItem(IMBRACE_TOKEN_KEY)
        : null;

    if (!token) return;

    const organizationId =
      typeof window !== "undefined"
        ? window.localStorage.getItem(IMBRACE_ORG_ID_KEY) ?? ""
        : "";
    const isJwt = token.startsWith("eyJ");
    const headers: Record<string, string> = { "x-access-token": token };
    if (isJwt) headers["Authorization"] = `Bearer ${token}`;
    if (organizationId) headers["x-organization-id"] = organizationId;

    const isBuiltin = selectedAgent.assistant_id.startsWith("builtin");
    const detailsUrl = isBuiltin
      ? `/appgateway/v1/marketplaces/use-cases/builtin-assistants/${selectedAgent.assistant_id}`
      : `/appgateway/ai/v3/assistants/${selectedAgent.assistant_id}`;

    fetch(detailsUrl, {
      headers,
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (!payload) return;
        const data = isBuiltin ? payload.data : payload;
        if (!data) return;
        const newAgentType = data.agent_type ?? selectedAgent.agent_type;
        const newCoreTask = data.core_task ?? selectedAgent.core_task;
        const newMetadata = data.metadata ?? selectedAgent.metadata;

        // Only update if data actually changed
        if (
          newAgentType === selectedAgent.agent_type &&
          newCoreTask === selectedAgent.core_task &&
          JSON.stringify(newMetadata) === JSON.stringify(selectedAgent.metadata)
        ) {
          return;
        }

        const enriched: ImbraceAgent = {
          ...selectedAgent,
          agent_type: newAgentType,
          core_task: newCoreTask,
          metadata: newMetadata,
        };
        console.log("[Chat] enriched agent:", enriched);
        selectedAgentRef.current = enriched;
        setSelectedAgent(enriched);
      })
      .catch(() => {
        // ignore – use the agent as-is
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgent?.assistant_id]);

  // If the URL (new chat) or chat record (existing chat) provides an assistant id,
  // select that agent once the agent list is loaded.
  // Note: we intentionally do NOT auto-select when there is no `initialAssistantId`.
  useEffect(() => {
    if (!initialAssistantId) {
      return;
    }

    if (agents.length === 0) {
      return;
    }

    if (selectedAgentRef.current?.assistant_id === initialAssistantId) {
      return;
    }

    const agentFromId = agents.find(
      (agent) => agent.assistant_id === initialAssistantId
    );

    if (!agentFromId) {
      return;
    }

    setSelectedAgent(agentFromId);
  }, [agents, initialAssistantId, setSelectedAgent]);

  useEffect(() => {
    visibilityTypeRef.current = visibilityType;
  }, [visibilityType]);

  const handleAgentChange = useCallback(
    (agent: ImbraceAgent | null) => {
      // If user explicitly selects a DIFFERENT agent from dropdown:
      // create a new chat with the new agent pre-selected via URL (?agent=...)
      if (
        agent &&
        selectedAgentRef.current &&
        agent.assistant_id !== selectedAgentRef.current.assistant_id
      ) {
        // Update store immediately for UI consistency; new chat will also select via URL param.
        setSelectedAgent(agent);
        navigate(`/?agent=${agent.assistant_id}`);
        /* no-op in CSR */void 0;
        return;
      }

      // First time selection (no agent selected yet) or same agent
      setSelectedAgent(agent);

      // Update chat with selected agent — only if the chat row already exists.
      // For brand-new chats the assistant_id is sent with the first message, so
      // PATCH-ing a non-existent chat would just be a wasted 404 round-trip.
      if (agent && chatPersistedRef.current) {
        import("@/lib/api/clientApi").then(({ getClientApi }) => {
          getClientApi().updateChat(id, { assistantId: agent.assistant_id }).catch(() => {
            // ignore - agent selection still applied locally
          });
        });
      }
    },
    [id, navigate, setSelectedAgent]
  );

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    regenerate,
    addToolApprovalResponse,
  } = useChat<ChatMessage>({
    id,
    messages: initialMessages,
    experimental_throttle: 100,
    generateId: generateUUID,
    // Reason: After addToolApprovalResponse() resolves a needsApproval tool
    // call, auto-resubmit so the server can run the executor and continue.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    transport: new DefaultChatTransport({
      api: "/ai-agent/v2/chat",
      fetch: interceptingFetchRef.current!,
      prepareSendMessagesRequest(request) {
        const imbraceToken =
          typeof window !== "undefined"
            ? window.localStorage.getItem(IMBRACE_TOKEN_KEY) ?? undefined
            : undefined;

        const imbraceOrgId =
          typeof window !== "undefined"
            ? window.localStorage.getItem(IMBRACE_ORG_ID_KEY) ?? undefined
            : undefined;

        // Reason: read userId fresh from storage instead of closing over the
        // prop. ImbraceTokenHandler / useChatUserId may populate this after
        // the transport closure was constructed; relying on the prop would
        // ship an empty string and trigger the server-side "Invalid uuid".
        const chatUserId =
          typeof window !== "undefined"
            ? window.localStorage.getItem("chatUserId") ?? userId
            : userId;

        // Reason: when ?databoardId=… is on the URL, scope every request
        // to that board. Server locks databoard tools to this id and
        // hides create_board. Skip when the user has dismissed the chip
        // — the stored boardId stays around so the BoardSelector can
        // re-engage scope, but requests must NOT carry it until then.
        const scopedBoardId = (() => {
          if (typeof window === "undefined") return undefined;
          const dismissed =
            window.localStorage.getItem(IMBRACE_BOARD_SCOPE_DISMISSED_KEY) ===
            "1";
          if (dismissed) return undefined;
          return window.localStorage.getItem(IMBRACE_BOARD_ID_KEY) ?? undefined;
        })();

        const selectedAgent = selectedAgentRef.current;

        console.log("[Chat] selectedAgent:", selectedAgent);

        if (!selectedAgent) {
          throw new Error(tRef.current("Chat.selectAgent"));
        }

        if (!selectedAgent.assistant_id) {
          console.error("[Chat] selectedAgent has no assistant_id:", selectedAgent);
          throw new Error("Selected agent is missing assistant_id");
        }

        if (!imbraceToken) {
          throw new Error(tRef.current("Chat.missingToken"));
        }

        if (!imbraceOrgId) {
          throw new Error(tRef.current("Chat.missingOrgId"));
        }

        // Reason: app-gateway JWT mode requires Bearer + X-Access-Token + x-organization-id together;
        // acc_* tokens skip Bearer (gateway routes to access-token validator).
        const isJwt = imbraceToken.startsWith("eyJ");
        const headers: Record<string, string> = {
          "x-organization-id": imbraceOrgId,
          "x-access-token": imbraceToken,
        };
        if (isJwt) headers.Authorization = `Bearer ${imbraceToken}`;

        // Reason: For human-in-the-loop tool approvals, the SDK auto-resubmits
        // with no new user message — the trailing assistant message just got
        // an approval-responded part patched in via addToolApprovalResponse.
        // We ship those last two messages (assistant w/ response, optional
        // preceding user) so the server can resume the agent loop with the
        // approval honored. Otherwise we keep the original optimization and
        // ship only the latest user turn — the server reloads history from DB.
        const last = request.messages.at(-1);
        const isToolApprovalSubmit =
          last?.role === "assistant" &&
          Array.isArray(last.parts) &&
          last.parts.some(
            (p) =>
              typeof (p as { type?: unknown }).type === "string" &&
              ((p as { type: string }).type.startsWith("tool-") ||
                (p as { type: string }).type === "dynamic-tool") &&
              (p as { state?: string }).state === "approval-responded",
          );

        const messagesToSend = isToolApprovalSubmit
          ? request.messages.slice(-2)
          : request.messages.slice(-1);

        // SCB agents: when a contact has been selected (from the
        // nextbestaction iframe), forward its board/contact context to the
        // agent so it can scope answers to that customer.
        const scbContext = messageSuggestionContextRef.current;
        // biome-ignore lint/suspicious/noConsole: temporary debug for SCB params
        console.debug("[DEBUG-SCB] prepareSendMessagesRequest context", {
          contactId: scbContext?.contactId,
          contactName: scbContext?.contactName,
          boardId: scbContext?.boardId,
          willAttachParams: Boolean(scbContext?.contactId),
        });
        const scbParams = scbContext?.contactId
          ? {
              board_id: scbContext.boardId,
              board_items: scbContext.boardItemId,
              conversation_id: scbContext.conversationId,
              contact_name: scbContext.contactName,
            }
          : undefined;

        return {
          headers,
          body: {
            id: request.id,
            // Reason: Send UIMessages directly (no convertToModelMessages).
            // The server passes them as `originalMessages` to createUIMessageStream
            // so its internal processUIMessageStream can resolve tool-call
            // parts from the prior turn (otherwise approved-tool execution
            // emits tool-output-available chunks that have no matching
            // tool invocation → "no tool invocation found" error).
            // Server's toModelMessages() converts them to ModelMessages
            // before feeding the agent.
            messages: messagesToSend,
            streamId: request.id,
            assistant_id: selectedAgent.assistant_id,
            organization_id: imbraceOrgId,
            user_id: chatUserId,
            agent_type: selectedAgent.agent_type,
            core_task: selectedAgent.core_task,
            ...(scopedBoardId ? { board_id: scopedBoardId } : {}),
            ...(isToolApprovalSubmit ? { is_tool_approval: true } : {}),
            ...(scbParams ? { params: scbParams } : {}),
          },
        };
      },
    }),
    onData: (dataPart) => {
      // Normalize: AI SDK may deliver data as individual items
      // or as wrapped { type: "data", value: [...] } objects
      const items: unknown[] = [];
      if (isRecord(dataPart)) {
        const partType = readStringField(dataPart, "type");
        if (partType === "data" && Array.isArray((dataPart as any).value)) {
          items.push(...((dataPart as any).value as unknown[]));
        } else {
          items.push(dataPart);
        }
      } else {
        items.push(dataPart);
      }

      for (const item of items) {
        if (!isRecord(item)) continue;

        const itemType = readStringField(item, "type");

        // Handle streamed error chunks from the server
        if (itemType === "error") {
          const errorText =
            readStringField(item, "errorText") ?? tRef.current("Chat.errorOccurred");
          didHandleStreamErrorRef.current = true;
          stop();
          setMessagesRef.current?.((prev) => [
            ...prev,
            createAssistantErrorMessage(errorText),
          ]);
          return;
        }

        // Skip sub-agent events here - they're handled by stream interceptor
        if (isSubAgentEvent(item as Record<string, unknown>)) {
          continue;
        }

        const dynamicToolPart = parseDynamicToolStreamPart(item);
        if (dynamicToolPart) {
          setMessagesRef.current?.((prev) =>
            upsertDynamicToolPartToMessages(prev, dynamicToolPart)
          );
        }

        setDataStream((ds) => (ds ? [...ds, item as unknown as DataUIPart<CustomUIDataTypes>] : []));
      }
    },
    onFinish: async ({ message }) => {
      console.log(`finish stream mgs:${message}`)
      void refreshChatHistory();
      // Sync message IDs from DB so edit/delete operations use correct DB IDs
      safeRefresh();
    },
    onError: (error) => {
      console.error("[Chat] onError:", error, error instanceof Error ? error.message : String(error));

      // If we aborted the request after handling a streamed error part,
      // ignore the follow-up abort/error callback to avoid showing a toast.
      if (didHandleStreamErrorRef.current) {
        didHandleStreamErrorRef.current = false;
        return;
      }

      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.message.includes("aborted"))
      ) {
        return;
      }

      // Don't /* no-op in CSR */void 0 if sub-agents are active - the stream is still
      // processing on the server. Use hasActiveSessionsSync() which checks the
      // ref (synchronous) rather than React state (async/batched).
      if (multiSessionRef.current.hasActiveSessionsSync()) {
        console.log("[Chat] onError: skipping /* no-op in CSR */void 0 - sub-agents active, sessionMap has entries");
        return;
      }

      // Refresh to fetch error message saved by the server
      safeRefresh();
    },
  });

  // Make setMessages available to early-defined callbacks without TDZ issues.
  setMessagesRef.current = setMessages;

  // Reason: when this chat is embedded as an iframe inside a parent dashboard
  // (e.g. new-frontend's DataboardChatWidget) and the URL set a databoard
  // scope, broadcast successful databoard mutations to the parent so it can
  // refresh its FlexibleTable / schema query without a manual reload.
  const scopedBoardIdForBroadcast = useScopedBoardId();
  useDataboardMutationBroadcast(messages, scopedBoardIdForBroadcast);

  // Reason: while the agent is paused waiting for the user to Approve/Deny
  // a tool, block sending new messages — they would jump the queue ahead
  // of the pending decision and confuse the agent loop. The MultimodalInput
  // disables its submit button + shows a toast when the user tries to send.
  const hasPendingApproval = useMemo(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return false;
    const parts = (last as { parts?: unknown }).parts;
    if (!Array.isArray(parts)) return false;
    return parts.some((p: unknown) => {
      if (!p || typeof p !== "object") return false;
      const part = p as { type?: unknown; state?: unknown };
      const isToolish =
        typeof part.type === "string" &&
        (part.type.startsWith("tool-") || part.type === "dynamic-tool");
      return isToolish && part.state === "approval-requested";
    });
  }, [messages]);

  // Reason: useChat's internal messages state doesn't auto-sync when initialMessages
  // prop changes after /* no-op in CSR */void 0. When the SSE hook detects processing is done
  // and triggers /* no-op in CSR */void 0, the server component re-fetches messages from DB,
  // but useChat still holds the old state. This effect syncs the new server data in.
  const initialMessageIds = initialMessages.map((m) => m.id).join(",");
  const isFirstRenderRef = useRef(true);

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    setMessages(initialMessages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessageIds]);

  // Once any message exists, the chat row has been (or is being) persisted —
  // future agent changes can safely PATCH it.
  useEffect(() => {
    if (!chatPersistedRef.current && messages.length > 0) {
      chatPersistedRef.current = true;
    }
  }, [messages.length]);

  const query = searchParams.get("query");

  // Wrap sendMessage to persist user message first, then call Imbrace
  const handleSendMessage = useCallback(
    async (message: Parameters<typeof sendMessage>[0]) => {
      if (!selectedAgentRef.current) {
        toast({
          type: "error",
          description: tRef.current("Chat.selectAgent"),
        });
        throw new Error("missing_agent");
      }

      const imbraceToken =
        typeof window !== "undefined"
          ? window.localStorage.getItem(IMBRACE_TOKEN_KEY)
          : null;

      const imbraceOrgId =
        typeof window !== "undefined"
          ? window.localStorage.getItem(IMBRACE_ORG_ID_KEY)
          : null;

      if (!imbraceToken || !imbraceOrgId) {
        toast({
          type: "error",
          description: tRef.current("Chat.missingToken"),
        });
        throw new Error("missing_imbrace_credentials");
      }

      // Warn (but don't block) when chatUserId is still unresolved. Server
      // validates user_id as UUID and 500s on empty string; surface this so
      // the user understands why their send may fail. Read from storage to
      // pick up a late-resolving lazy fetch.
      const resolvedUserId =
        typeof window !== "undefined"
          ? window.localStorage.getItem("chatUserId") ?? userId
          : userId;
      if (!resolvedUserId) {
        console.warn(
          "[Chat] Sending /v2/chat with empty user_id — server will reject (Invalid uuid)",
        );
        toast({
          type: "error",
          description: tRef.current("Chat.missingUserId"),
        });
      }

      // Promote completed live agents to persisted state before clearing.
      // Without this, agents from the current session (not yet saved to DB)
      // would be lost when reset() clears live streaming state.
      const completedLiveAgents = multiSessionRef.current.agentMessages.filter(
        (m) => m.status === "completed" || m.status === "error",
      );
      if (completedLiveAgents.length > 0) {
        setPersistedAgentMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newAgents = completedLiveAgents.filter((m) => !existingIds.has(m.id));
          return newAgents.length > 0 ? [...prev, ...newAgents] : prev;
        });
      }

      // Reset live streaming state for the new request
      multiSessionRef.current.reset();

      // Update URL to /chat/{id} before streaming starts so that:
      // 1. If user reloads, they land on the right page
      // 2. safeRefresh() can detect we're on /chat/{id} route
      if (typeof window !== "undefined" && !window.location.pathname.includes(`/chat/${id}`)) {
        window.history.replaceState({}, "", `/chat/${id}`);
      }

      // 2. Call Imbrace directly
      try {
        await sendMessage(message);
      } catch (error) {
        // Reset UI state on hard failures (CORS/network)
        stop();
        toast({
          type: "error",
          description:
            error instanceof Error ? error.message : tRef.current("Chat.requestFailed"),
        });
      }
    },
    [id, initialVisibilityType, sendMessage, stop, userId]
  );

  const { data: votes } = useSWR<Vote[]>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    async () => {
      const { getClientApi } = await import("@/lib/api/clientApi");
      return getClientApi().getVotes(id);
    }
  );

  const { setArtifact } = useArtifact();
  const isArtifactVisible = useArtifactSelector(
    (state) => state.isVisible && state.chatId === id
  );

  useEffect(() => {
    if (query && !hasAppendedQuery && selectedAgent) {
      void handleSendMessage({
        role: "user" as const,
        parts: [{ type: "text", text: query }],
      });

      setHasAppendedQuery(true);
      window.history.replaceState({}, "", `/chat/${id}`);
    }
  }, [query, handleSendMessage, hasAppendedQuery, id, selectedAgent]);

  useEffect(() => {
    setCurrentAgentId(selectedAgent?.assistant_id ?? null, {
      enableEchart: selectedAgent?.metadata?.enable_echart ?? false,
      isScb: selectedAgent?.metadata?.is_scb ?? false,
    });
  }, [selectedAgent, setCurrentAgentId]);

  useEffect(() => {
    setArtifact((currentArtifact) => {
      if (currentArtifact.chatId && currentArtifact.chatId !== id) {
        return { ...initialArtifactData, status: "idle" };
      }
      return currentArtifact;
    });
  }, [id, setArtifact]);

  const aiCentricPanelWidth = aiCentricState.isAiCentricCollapsed ? 270 : 750;

  // ==============================
  // Render
  // ==============================
  return (
    <>
      <div className="flex h-dvh w-full min-w-0 flex-row overflow-hidden bg-background">
        <div className="overscroll-behavior-contain flex h-dvh min-w-0 touch-pan-y flex-1 flex-col bg-background">
          <ChatHeader
            initialAssistantId={initialAssistantId}
            isReadonly={isReadonly}
            onAgentChange={handleAgentChange}
            selectedAgent={selectedAgent}
          />

          <Messages
            addToolApprovalResponse={addToolApprovalResponse}
            agentMessages={allAgentMessages}
            chatId={id}
            isArtifactVisible={isArtifactVisible}
            isProcessing={isProcessing}
            isReadonly={isReadonly}
            messages={messages}
            parentChatId={id}
            regenerate={regenerate}
            selectedModelId={initialChatModel}
            sendMessage={handleSendMessage}
            setMessages={setMessages}
            status={status}
            subAgentSessions={subAgentSessions}
            votes={votes}
          />

          <div className="sticky bottom-0 z-1 mx-auto flex w-full max-w-4xl flex-col gap-2 border-t-0 bg-background px-2 pb-3 md:px-4 md:pb-4">
            {!isReadonly && (
              <>
                {/* SCB agents replace the default prompt suggestions with
                    contact-scoped suggestions (AiCentricContextSuggestions). */}
                {!isSCBAgent && (
                  <PromptSuggestions
                    assistantId={selectedAgent?.assistant_id}
                    disabled={
                      status === "streaming" ||
                      status === "submitted" ||
                      isProcessing ||
                      hasPendingApproval
                    }
                    onSuggestionClick={(message) => {
                      // Reason: belt-and-suspenders against rapid clicks while
                      // disabled state hasn't propagated yet.
                      if (hasPendingApproval) return;
                      void handleSendMessage({
                        role: "user" as const,
                        parts: [{ type: "text", text: message }],
                      });
                    }}
                  />
                )}
                <AiCentricContextSuggestions
                  onSuggestionClick={(message) => {
                    setInput(message);
                  }}
                />
                <DataboardScopeChip />
                <MultimodalInput
                  attachments={attachments}
                  chatId={id}
                  hasPendingApproval={hasPendingApproval}
                  input={input}
                  isProcessing={isProcessing}
                  messages={messages}
                  selectedModelId={currentModelId}
                  sendMessage={handleSendMessage}
                  setAttachments={setAttachments}
                  setInput={setInput}
                  setMessages={setMessages}
                  status={status}
                  stop={stop}
                />
              </>
            )}
          </div>
        </div>

        {/* AICentric Panel - separate column (no overlay) */}
        {isAiCentricVisible && (
          <div
            className="h-dvh shrink-0 border-l border-zinc-200 bg-background transition-all duration-300 ease-in-out dark:border-zinc-700"
            style={{ width: `${aiCentricPanelWidth}px` }}
          >
            <AICentric bestNextActionUrl={env.IMBRACE_NEXT_BEST_ACTION_URL} />
          </div>
        )}
      </div>

      <Artifact
        attachments={attachments}
        chatId={id}
        input={input}
        isReadonly={isReadonly}
        messages={messages}
        regenerate={regenerate}
        selectedModelId={currentModelId}
        selectedVisibilityType={visibilityType}
        sendMessage={handleSendMessage}
        setAttachments={setAttachments}
        setInput={setInput}
        setMessages={setMessages}
        status={status}
        stop={stop}
        votes={votes}
      />
    </>
  );
}
