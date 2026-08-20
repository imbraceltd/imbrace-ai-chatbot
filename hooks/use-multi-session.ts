/**
 * Multi-Session Hook
 * Tracks sub-agent sessions and their messages for multi-agent UI rendering.
 *
 * When the server streams sub-agent events (sub-agent-start, sub-agent-text-delta,
 * sub-agent-tool-call, sub-agent-tool-result, sub-agent-end), this hook aggregates
 * them into AgentMessage objects that can be rendered as separate message blocks.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tool call status within a sub-agent message
 */
export interface AgentToolCall {
  name: string;
  toolCallId?: string;
  status: "pending" | "running" | "completed" | "error";
  result?: unknown;
}

/**
 * Persisted sub-agent session info from Chat.lastContext.subAgentSessions.
 * Used to reuse existing sessions when opening the expand modal.
 */
export interface SubAgentSessionInfo {
  /** The session ID (used for session continuation) */
  sessionId: string;
  /** Sub-agent display name */
  agentName: string;
  /** Sub-agent assistant_id */
  assistantId: string;
  /** When this session was created */
  createdAt: string;
}

/**
 * A message block from a sub-agent
 */
export interface AgentMessage {
  /** Unique ID for this agent message */
  id: string;
  /** Agent display name (e.g. "City Weather Agent") */
  agentName: string;
  /** Session ID on the server */
  sessionId: string;
  /** Accumulated text from the sub-agent */
  text: string;
  /** Tool calls made by this sub-agent */
  toolCalls: AgentToolCall[];
  /** Sub-agent's assistant_id (for direct chat) */
  assistantId?: string;
  /** Current status */
  status: "streaming" | "completed" | "error";
  /** Timestamp when this message started */
  startedAt: number;
  /** Timestamp when this message ended */
  endedAt?: number;
}

/**
 * Sub-agent event types received from the server.
 * AI SDK v5 requires custom data types to start with "data-" prefix.
 */
export type SubAgentEventType =
  | "data-sub-agent-start"
  | "data-sub-agent-text-delta"
  | "data-sub-agent-tool-call"
  | "data-sub-agent-tool-result"
  | "data-sub-agent-end"
  | "data-sub-agent-flow-editor-open";

/**
 * Sub-agent event data from the server stream
 */
export interface SubAgentEvent {
  [key: string]: unknown;
  type: SubAgentEventType;
  agent_name: string;
  session_id: string;
  parent_session_id?: string;
  // For start
  assistant_id?: string;
  // For text-delta
  text?: string;
  // For tool-call / tool-result
  tool_name?: string;
  tool_call_id?: string;
  // For end
  success?: boolean;
  error?: string;
}

/**
 * Check if a data part is a sub-agent event
 */
export function isSubAgentEvent(
  data: Record<string, unknown>,
): data is SubAgentEvent {
  const type = data["type"] as string | undefined;
  return typeof type === "string" && type.startsWith("data-sub-agent-");
}

/**
 * Multi-session hook for tracking sub-agent messages.
 * Accepts optional initial data from DB for hydration on page reload.
 */
export function useMultiSession(initialAgentMessages?: AgentMessage[]) {
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>(
    initialAgentMessages ?? [],
  );
  // Use a ref for O(1) lookup by sessionId during streaming
  const sessionMapRef = useRef<Map<string, AgentMessage>>(new Map());

  // Debug: track when agentMessages state actually changes
  useEffect(() => {
    console.log("[MultiSession] STATE CHANGED - agentMessages:", agentMessages.length, agentMessages.map(m => `${m.agentName}(${m.status})`));
  }, [agentMessages]);

  /**
   * Process an incoming sub-agent event from the server stream.
   *
   * IMPORTANT: Map is the source of truth, mutated synchronously OUTSIDE
   * setAgentMessages(). The state updater rebuilds the array from the map,
   * making it pure and safe for React Strict Mode double-invocation.
   * We also track insertion order in a separate ref so the array order
   * is deterministic.
   */
  const sessionOrderRef = useRef<string[]>([]);

  // Hydrate refs from initial data (persisted sub-agent messages from DB).
  // Runs once on mount so streaming events can build on top of existing data.
  const didHydrateRef = useRef(false);
  useEffect(() => {
    if (didHydrateRef.current) return;
    didHydrateRef.current = true;
    if (initialAgentMessages?.length) {
      const map = sessionMapRef.current;
      const order = sessionOrderRef.current;
      for (const msg of initialAgentMessages) {
        if (!map.has(msg.sessionId)) {
          map.set(msg.sessionId, msg);
          order.push(msg.sessionId);
        }
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // External callback for flow-editor-open events.
  // Set via setFlowEditorCallback; avoids re-creating the intercepting fetch.
  const flowEditorCallbackRef = useRef<((data: { flowId: string; message: string }) => void) | null>(null);
  const setFlowEditorCallback = useCallback(
    (cb: (data: { flowId: string; message: string }) => void) => {
      flowEditorCallbackRef.current = cb;
    },
    [],
  );

  const handleStreamEvent = useCallback((event: SubAgentEvent) => {
    const { type, agent_name, session_id } = event;

    // Handle flow-editor-open without touching agent session state
    if (type === "data-sub-agent-flow-editor-open") {
      const d = event as any;
      flowEditorCallbackRef.current?.({
        flowId: d.flow_id ?? "",
        message: d.message ?? "",
      });
      return;
    }

    const map = sessionMapRef.current;

    switch (type) {
      case "data-sub-agent-start": {
        if (map.has(session_id)) return;
        const newMsg: AgentMessage = {
          id: `agent-${session_id}`,
          agentName: agent_name,
          sessionId: session_id,
          assistantId: event.assistant_id,
          text: "",
          toolCalls: [],
          status: "streaming",
          startedAt: Date.now(),
        };
        map.set(session_id, newMsg);
        sessionOrderRef.current.push(session_id);
        break;
      }

      case "data-sub-agent-text-delta": {
        const existing = map.get(session_id);
        if (!existing) return;
        map.set(session_id, {
          ...existing,
          text: existing.text + (event.text || ""),
        });
        break;
      }

      case "data-sub-agent-tool-call": {
        const existing = map.get(session_id);
        if (!existing) return;
        map.set(session_id, {
          ...existing,
          toolCalls: [
            ...existing.toolCalls,
            {
              name: event.tool_name || "unknown",
              toolCallId: event.tool_call_id,
              status: "running" as const,
            },
          ],
        });
        break;
      }

      case "data-sub-agent-tool-result": {
        const existing = map.get(session_id);
        if (!existing) return;
        map.set(session_id, {
          ...existing,
          toolCalls: existing.toolCalls.map((tc) => {
            if (
              tc.toolCallId === event.tool_call_id ||
              (tc.name === event.tool_name && tc.status === "running")
            ) {
              return { ...tc, status: "completed" as const };
            }
            return tc;
          }),
        });
        break;
      }

      case "data-sub-agent-end": {
        const existing = map.get(session_id);
        if (!existing) return;
        map.set(session_id, {
          ...existing,
          status: event.success ? "completed" : "error",
          endedAt: Date.now(),
        });
        break;
      }

      default:
        return;
    }

    // Rebuild state array from map (pure updater - safe for Strict Mode)
    const order = sessionOrderRef.current;
    setAgentMessages(() =>
      order.map((sid) => map.get(sid)!).filter(Boolean),
    );
  }, []);

  /**
   * Reset all agent messages (e.g., when starting a new conversation)
   */
  const reset = useCallback(() => {
    setAgentMessages([]);
    sessionMapRef.current.clear();
    sessionOrderRef.current = [];
  }, []);

  /**
   * Check if any sub-agent is currently streaming
   */
  const isAnyAgentStreaming = agentMessages.some(
    (m) => m.status === "streaming",
  );

  /**
   * Synchronous check if any sub-agent session has been registered.
   * Unlike agentMessages (async React state), sessionMapRef is updated synchronously
   * in handleStreamEvent, so this is reliable even before React commits the state.
   */
  const hasActiveSessionsSync = useCallback(() => {
    return sessionMapRef.current.size > 0;
  }, []);

  return {
    agentMessages,
    handleStreamEvent,
    setFlowEditorCallback,
    reset,
    isAnyAgentStreaming,
    hasActiveSessionsSync,
  };
}
