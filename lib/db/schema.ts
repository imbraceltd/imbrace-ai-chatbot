/**
 * Type definitions for database entities.
 * These types match the PostgreSQL tables managed by messagesuggestion.
 * No Drizzle ORM dependency - pure TypeScript types.
 */

import type { AppUsage } from "../usage";

export type User = {
  id: string;
  email: string;
  password: string | null;
};

export type Chat = {
  id: string;
  createdAt: Date;
  title: string;
  userId: string;
  organizationId: string | null;
  assistantId: string | null;
  visibility: "public" | "private";
  type: "chat" | "sub-agent";
  status: "idle" | "processing";
  lastContext: AppUsage | null;
};

export type DBMessage = {
  id: string;
  chatId: string;
  role: string;
  parts: unknown;
  attachments: unknown;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

export type Vote = {
  chatId: string;
  messageId: string;
  isUpvoted: boolean;
};

export type Document = {
  id: string;
  createdAt: Date;
  title: string;
  content: string | null;
  kind: "text" | "code" | "image" | "sheet" | "imbrace-databoard" | "vibe-code";
  userId: string;
};

export type Suggestion = {
  id: string;
  documentId: string;
  documentCreatedAt: Date;
  originalText: string;
  suggestedText: string;
  description: string | null;
  isResolved: boolean;
  userId: string;
  createdAt: Date;
};
