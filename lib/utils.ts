import type {
  AssistantModelMessage,
  ToolModelMessage,
  UIMessage,
  UIMessagePart,
} from 'ai';
import { type ClassValue, clsx } from 'clsx';
import { formatISO } from 'date-fns';
import { twMerge } from 'tailwind-merge';
import type { DBMessage, Document } from '@/lib/db/schema';
import { ChatSDKError, type ErrorCode } from './errors';
import type { ChatMessage, ChatTools, CustomUIDataTypes } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fetcher = async (url: string) => {
  const response = await fetch(url);

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (
      typeof body === 'object' &&
      body !== null &&
      'code' in body &&
      typeof (body as { code: unknown }).code === 'string'
    ) {
      const { code, cause } = body as { code: string; cause?: string };
      throw new ChatSDKError(code as ErrorCode, cause);
    }

    const message =
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof (body as { error: unknown }).error === 'string'
        ? (body as { error: string }).error
        : response.statusText || 'Request failed';

    throw new ChatSDKError('bad_request:api', message);
  }

  return response.json();
};

export async function fetchWithErrorHandlers(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  try {
    const response = await fetch(input, init);

    if (!response.ok) {
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      if (
        typeof body === 'object' &&
        body !== null &&
        'code' in body &&
        typeof (body as { code: unknown }).code === 'string'
      ) {
        const { code, cause } = body as { code: string; cause?: string };
        throw new ChatSDKError(code as ErrorCode, cause);
      }

      const message =
        typeof body === 'object' &&
        body !== null &&
        'error' in body &&
        typeof (body as { error: unknown }).error === 'string'
          ? (body as { error: string }).error
          : response.statusText || 'Request failed';

      throw new ChatSDKError('bad_request:api', message);
    }

    return response;
  } catch (error: unknown) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new ChatSDKError('offline:chat');
    }

    throw error;
  }
}

export function getLocalStorage(key: string) {
  if (typeof window !== 'undefined') {
    return JSON.parse(localStorage.getItem(key) || '[]');
  }
  return [];
}

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

type ResponseMessageWithoutId = ToolModelMessage | AssistantModelMessage;
type ResponseMessage = ResponseMessageWithoutId & { id: string };

export function getMostRecentUserMessage(messages: UIMessage[]) {
  const userMessages = messages.filter((message) => message.role === 'user');
  return userMessages.at(-1);
}

export function getDocumentTimestampByIndex(
  documents: Document[],
  index: number,
) {
  if (!documents) { return new Date(); }
  if (index > documents.length) { return new Date(); }

  return documents[index].createdAt;
}

export function getTrailingMessageId({
  messages,
}: {
  messages: ResponseMessage[];
}): string | null {
  const trailingMessage = messages.at(-1);

  if (!trailingMessage) { return null; }

  return trailingMessage.id;
}

export function sanitizeText(text: string) {
  return text.replace('<has_function_call>', '');
}

export function convertToUIMessages(messages: DBMessage[]): ChatMessage[] {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

  return messages.map((message) => ({
    id: message.id,
    role: message.role as "user" | "assistant" | "system",
    parts: message.parts as UIMessagePart<CustomUIDataTypes, ChatTools>[],
    metadata: {
      ...(isRecord(message.metadata) ? message.metadata : {}),
      createdAt: formatISO(message.createdAt),
    },
  }));
}

export function getTextFromMessage(message: ChatMessage | UIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (part as { type: 'text'; text: string}).text)
    .join('');
}

/**
 * Sub-agent message restored from the database.
 * Matches the AgentMessage shape from use-multi-session.ts.
 */
export interface AgentMessageFromDB {
  id: string;
  agentName: string;
  sessionId: string;
  assistantId?: string;
  text: string;
  toolCalls: Array<{
    name: string;
    toolCallId?: string;
    status: "completed" | "error";
    result?: unknown;
  }>;
  status: "completed" | "error";
  startedAt: number;
  endedAt?: number;
}

/**
 * Separate sub-agent messages from regular messages loaded from DB.
 * Sub-agent messages are identified by metadata.subAgent === true.
 * Sub-agent messages are saved AFTER the main assistant message in onStreamFinish,
 * so they appear after the parent response in chronological (createdAt) order.
 */
export function extractSubAgentMessages(
  dbMessages: DBMessage[],
): { messages: DBMessage[]; subAgentMessages: AgentMessageFromDB[] } {
  const regular: DBMessage[] = [];
  const subAgent: AgentMessageFromDB[] = [];

  for (const msg of dbMessages) {
    const meta = msg.metadata as Record<string, unknown> | null;
    if (meta?.subAgent === true) {
      const parts = msg.parts as Array<{ type: string; text?: string; toolName?: string; toolCallId?: string; result?: unknown }>;

      // Extract text from text parts
      const text = parts
        .filter((p) => p.type === "text" && p.text)
        .map((p) => p.text)
        .join("");

      // Extract tool calls from tool-call/tool-result parts
      const toolCallParts = parts.filter((p) => p.type === "tool-call");
      const toolResultParts = parts.filter((p) => p.type === "tool-result");

      const toolCalls = toolCallParts.map((tc) => {
        const resultPart = toolResultParts.find(
          (tr) => tr.toolCallId === tc.toolCallId,
        );
        return {
          name: tc.toolName || "unknown",
          toolCallId: tc.toolCallId,
          status: "completed" as const,
          result: resultPart?.result,
        };
      });

      subAgent.push({
        id: msg.id,
        agentName: (meta.agentName as string) || "Agent",
        sessionId: (meta.sessionId as string) || msg.id,
        assistantId: (meta.assistantId as string) || undefined,
        text,
        toolCalls,
        status: ((meta.status as string) === "error" ? "error" : "completed") as "completed" | "error",
        startedAt: meta.startedAt
          ? new Date(meta.startedAt as string).getTime()
          : msg.createdAt.getTime(),
        endedAt: meta.endedAt
          ? new Date(meta.endedAt as string).getTime()
          : undefined,
      });
    } else if (meta?.subAgentDirectChat === true) {
      // Skip direct chat messages — they're loaded on-demand in the modal
    } else {
      regular.push(msg);
    }
  }

  return { messages: regular, subAgentMessages: subAgent };
}
