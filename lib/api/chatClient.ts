/**
 * Chat Client API
 * Typed HTTP client for calling messagesuggestion endpoints
 * Replaces direct DB queries in imbrace-chat-bot
 */

import type { Chat, DBMessage, Document, Suggestion, Vote } from "@/lib/db/schema";
import type { VisibilityType } from "@/components/visibility-selector";
import type { ArtifactKind } from "@/components/artifact";
import { IMBRACE_ORG_ID_KEY } from "@/lib/imbrace/constants";
/**
 * Browser-side relative path. Dev: forwarded by Vite proxy to the app-gateway.
 * Prod: served by CloudFront/ingress behavior routing `/ai-agent/*` to the app-gateway.
 * The gateway rewrites `/ai-agent/*` -> `/api/*` before hitting messagesuggestion.
 */
const CHAT_CLIENT_API_URL = "/ai-agent/chat-client";

export class ChatClientApi {
  private baseUrl: string;
  private token: string;
  private organizationId: string;

  constructor(token: string, baseUrl?: string, organizationId?: string) {
    this.baseUrl = baseUrl || CHAT_CLIENT_API_URL;
    this.token = token;
    this.organizationId =
      organizationId ??
      (typeof window !== "undefined"
        ? localStorage.getItem(IMBRACE_ORG_ID_KEY) ?? ""
        : "");
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    // Reason: app-gateway authRouter splits on credential shape.
    //   - SSO JWT (eyJ…): requires Authorization Bearer + x-organization-id together.
    //   - acc_* exchange token: x-access-token alone hits backend /v1/account which
    //     rejects it; sending x-organization-id lets gateway route directly to
    //     platform-service which validates acc_* properly.
    const isJwt = this.token.startsWith("eyJ");
    const authHeaders: Record<string, string> = {
      "x-access-token": this.token,
    };
    if (isJwt) {
      authHeaders["Authorization"] = `Bearer ${this.token}`;
    }
    if (this.organizationId) {
      authHeaders["x-organization-id"] = this.organizationId;
    }
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const message =
        body?.message || body?.cause || response.statusText || "Request failed";
      throw new Error(`ChatClient API error (${response.status}): ${message}`);
    }

    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  // ─── Auth ───

  async findOrCreateUser(): Promise<{ id: string; email: string }> {
    return this.request("/auth/user", { method: "POST" });
  }

  /**
   * Verify email/password credentials (no Imbrace token needed).
   * Can be called as static method: ChatClientApi.verifyCredentials(email, password)
   */
  static async verifyCredentials(
    email: string,
    password: string
  ): Promise<{ id: string; email: string } | null> {
    const url = `${CHAT_CLIENT_API_URL}/auth/verify-credentials`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(
        `ChatClient API error (${response.status}): ${body?.message || "Request failed"}`
      );
    }

    const text = await response.text();
    if (!text || text === "null") return null;
    return JSON.parse(text);
  }

  /**
   * Register a new user with email/password (no Imbrace token needed).
   * Can be called as static method: ChatClientApi.registerUser(email, password)
   */
  static async registerUser(
    email: string,
    password: string
  ): Promise<{ ok: true } | { error: "user_exists" }> {
    const url = `${CHAT_CLIENT_API_URL}/auth/register`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();
    if (response.status === 409) {
      return { error: "user_exists" };
    }
    if (!response.ok) {
      throw new Error(
        `ChatClient API error (${response.status}): ${data?.message || "Request failed"}`
      );
    }
    return data;
  }

  // ─── Chats ───

  async createChat(body: {
    id: string;
    message: {
      id?: string;
      role: "user";
      parts: unknown[];
      metadata?: Record<string, unknown>;
    };
    selectedVisibilityType: VisibilityType;
    assistantId?: string;
    organizationId?: string;
    type?: "chat" | "sub-agent";
  }): Promise<{ ok: true; id: string; created: boolean }> {
    return this.request("/chats", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async listChats(params: {
    limit?: number;
    starting_after?: string | null;
    ending_before?: string | null;
    organization_id?: string | null;
  }): Promise<{ chats: Chat[]; hasMore: boolean }> {
    const searchParams = new URLSearchParams();
    if (params.limit) searchParams.set("limit", String(params.limit));
    if (params.starting_after)
      searchParams.set("starting_after", params.starting_after);
    if (params.ending_before)
      searchParams.set("ending_before", params.ending_before);
    if (params.organization_id)
      searchParams.set("organization_id", params.organization_id);

    const qs = searchParams.toString();
    return this.request(`/chats${qs ? `?${qs}` : ""}`);
  }

  async getChat(id: string): Promise<Chat | null> {
    try {
      return await this.request(`/chats/${id}`);
    } catch {
      return null;
    }
  }

  async updateChat(
    id: string,
    body: {
      assistantId?: string | null;
      visibility?: VisibilityType;
    }
  ): Promise<{ ok: true }> {
    try {
      return await this.request(`/chats/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    } catch (error) {
      // Chat may not exist yet (e.g. PATCH before POST) - treat as no-op
      if (error instanceof Error && error.message.includes("(404)")) {
        return { ok: true };
      }
      throw error;
    }
  }

  async deleteChat(id: string): Promise<Chat> {
    return this.request(`/chats/${id}`, { method: "DELETE" });
  }

  async deleteAllChats(organizationId?: string | null): Promise<{ deletedCount: number }> {
    const query = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";
    return this.request(`/chats${query}`, { method: "DELETE" });
  }

  // ─── Messages ───

  async saveMessage(body: {
    message: {
      id: string;
      chatId: string;
      role: "assistant";
      parts: unknown[];
      metadata?: Record<string, unknown> | null;
    };
  }): Promise<{ ok: true; id: string }> {
    return this.request("/messages", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async getMessages(chatId: string): Promise<DBMessage[]> {
    return this.request(`/chats/${chatId}/messages`);
  }

  async deleteTrailingMessages(messageId: string): Promise<{ ok: true }> {
    return this.request(`/messages/${messageId}/trailing`, {
      method: "DELETE",
    });
  }

  // ─── Votes ───

  async getVotes(chatId: string): Promise<Vote[]> {
    return this.request(`/chats/${chatId}/votes`);
  }

  async voteMessage(body: {
    chatId: string;
    messageId: string;
    type: "up" | "down";
  }): Promise<{ ok: true }> {
    return this.request("/votes", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  // ─── Documents ───

  async saveDocument(
    id: string,
    body: { content: string; title: string; kind: ArtifactKind }
  ): Promise<Document[]> {
    return this.request(`/documents?id=${id}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async getDocuments(id: string): Promise<Document[]> {
    return this.request(`/documents/${id}`);
  }

  async getDocumentById(id: string): Promise<Document | null> {
    try {
      return await this.request(`/documents/${id}/latest`);
    } catch {
      return null;
    }
  }

  async getLatestDocumentByKindAndUser(
    kind: ArtifactKind
  ): Promise<Document | null> {
    return this.request(`/documents/latest-by-kind?kind=${encodeURIComponent(kind)}`);
  }

  async deleteDocuments(
    id: string,
    timestamp: string
  ): Promise<Document[]> {
    return this.request(
      `/documents/${id}?timestamp=${encodeURIComponent(timestamp)}`,
      { method: "DELETE" }
    );
  }

  // ─── Suggestions ───

  async getSuggestions(documentId: string): Promise<Suggestion[]> {
    return this.request(`/documents/${documentId}/suggestions`);
  }

  // ─── Title ───

  async generateTitle(
    chatId: string,
    messageParts: unknown[]
  ): Promise<{ title: string }> {
    return this.request(`/chats/${chatId}/title`, {
      method: "POST",
      body: JSON.stringify({ message: { parts: messageParts } }),
    });
  }
}
