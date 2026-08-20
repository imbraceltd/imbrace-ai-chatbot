/**
 * Client-side ChatClientApi factory.
 * Replaces createChatClient (which required server-only Next.js APIs).
 *
 * Token is read from localStorage; base URL goes through the Vite proxy.
 */

import { ChatClientApi } from "./chatClient";
import { IMBRACE_TOKEN_KEY, IMBRACE_ORG_ID_KEY } from "@/lib/imbrace/constants";

/** Base URL for the chat-client API. Proxied through `/ai-agent/*` (Vite in dev,
 *  CloudFront/app-gateway in prod). Gateway rewrites the prefix to `/api/*` before
 *  forwarding to messagesuggestion. */
const CLIENT_API_BASE = "/ai-agent/chat-client";

/**
 * Get a ChatClientApi instance using the current localStorage token.
 * Throws if no token is available.
 */
export function getClientApi(): ChatClientApi {
  const token = localStorage.getItem(IMBRACE_TOKEN_KEY) ?? "";
  if (!token) {
    throw new Error("No access token available – user is not authenticated.");
  }
  const organizationId = localStorage.getItem(IMBRACE_ORG_ID_KEY) ?? "";
  return new ChatClientApi(token, CLIENT_API_BASE, organizationId);
}

/**
 * Get token from localStorage (non-throwing, returns empty string if absent).
 */
export function getToken(): string {
  return localStorage.getItem(IMBRACE_TOKEN_KEY) ?? "";
}
