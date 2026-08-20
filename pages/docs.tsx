import { useSearchParams } from "react-router-dom";

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

interface Param {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

interface ApiEndpoint {
  method: HttpMethod;
  path: string;
  description: string;
  auth: string;
  queryParams?: Param[];
  headers?: Param[];
  requestBody?: {
    contentType: string;
    fields: Param[];
  };
  response: {
    contentType: string;
    description: string;
    example?: string;
  };
}

interface ApiSection {
  id: string;
  title: string;
  description: string;
  endpoints: ApiEndpoint[];
}

// ---------------------------------------------------------------------------
// API Documentation Data
//
// This app is a pure client-side SPA (Vite + React). It has no API routes of
// its own — every path below is proxied to an upstream service:
//
//   /appgateway/*  ->  app-gateway (prefix stripped). Auth, organizations,
//                      marketplace agents, file upload.
//   /ai-agent/*    ->  app-gateway, which rewrites /ai-agent/* -> /api/* on
//                      the AI service. Chat streaming + chat persistence.
//   /config        ->  static env.json baked into the image at build time.
//
// In dev the same mapping is done by the Vite proxy (vite.config.mjs); in the
// Docker image it is done by nginx (.nginx/nginx.template.conf).
// ---------------------------------------------------------------------------

const TOKEN_HEADER_AUTH =
  "x-access-token + x-organization-id (JWT tokens also send Authorization: Bearer)";

const API_SECTIONS: ApiSection[] = [
  {
    id: "authentication",
    title: "Authentication & Organizations",
    description:
      "Client-side Imbrace login flow via the app-gateway (/appgateway/* — the prefix is stripped before forwarding). Sign-in returns a temporary LOGIN token (kept in memory only); selecting an organization exchanges it for an ACCESS token, which is stored in localStorage (imbraceToken / imbraceOrganizationId) and used for all subsequent calls.",
    endpoints: [
      {
        method: "POST",
        path: "/appgateway/backend/v1/login/sign_in",
        description:
          "Password sign-in. Returns a temporary login token used to list organizations and exchange for an access token. Error codes: 40004/40005 invalid credentials, 7 account not verified.",
        auth: "None",
        requestBody: {
          contentType: "application/json",
          fields: [
            {
              name: "email",
              type: "string",
              required: true,
              description: "Account email.",
            },
            {
              name: "password",
              type: "string",
              required: true,
              description: "Account password.",
            },
          ],
        },
        response: {
          contentType: "application/json",
          description: "Login token on success.",
          example: '{ "token": "..." }',
        },
      },
      {
        method: "POST",
        path: "/appgateway/backend/v1/login/_signin_email_request",
        description:
          "Requests an OTP sign-in code by email (6-digit). Error code 40000 = invalid email.",
        auth: "None",
        requestBody: {
          contentType: "application/json",
          fields: [
            {
              name: "email",
              type: "string",
              required: true,
              description: "Email to send the OTP code to.",
            },
          ],
        },
        response: {
          contentType: "application/json",
          description: "200 when the code was sent.",
        },
      },
      {
        method: "POST",
        path: "/appgateway/backend/v1/login/_signin_with_email",
        description:
          "Verifies the OTP code and returns a login token (same as password sign-in).",
        auth: "None",
        requestBody: {
          contentType: "application/json",
          fields: [
            {
              name: "email",
              type: "string",
              required: true,
              description: "Email the OTP was sent to.",
            },
            {
              name: "otp",
              type: "string",
              required: true,
              description: "6-digit verification code.",
            },
          ],
        },
        response: {
          contentType: "application/json",
          description: "Login token on success.",
          example: '{ "token": "..." }',
        },
      },
      {
        method: "GET",
        path: "/appgateway/backend/v2/organizations",
        description:
          "Lists the organizations the signed-in user belongs to (paginated). Used by /select-org.",
        auth: "X-Access-Token (login token)",
        queryParams: [
          {
            name: "limit",
            type: "number",
            required: false,
            description: "Page size (the UI uses 10).",
          },
          {
            name: "skip",
            type: "number",
            required: false,
            description: "Offset for pagination.",
          },
          {
            name: "is_active",
            type: "boolean",
            required: false,
            description: "Filter to active organizations.",
          },
        ],
        response: {
          contentType: "application/json",
          description: "Paginated organization list.",
          example: '{ "data": [{ "id", "name", "is_active", "created_at" }], "has_more": true, "total": 12 }',
        },
      },
      {
        method: "POST",
        path: "/appgateway/backend/v1/access/_exchange_access_token",
        description:
          "Exchanges the login token + chosen organization for an ACCESS token. The SPA stores it in localStorage (imbraceToken) and completes the login flow.",
        auth: "X-Access-Token (login token)",
        requestBody: {
          contentType: "application/json",
          fields: [
            {
              name: "organization_id",
              type: "string",
              required: true,
              description: "Organization chosen on /select-org.",
            },
          ],
        },
        response: {
          contentType: "application/json",
          description: "Access token scoped to the organization.",
          example: '{ "token": "acc_xxxx | eyJ..." }',
        },
      },
      {
        method: "POST",
        path: "/appgateway/backend/v1/access/_exchange_access_token_with_access_token",
        description:
          "Switches organization using the CURRENT access token (no re-login). Used by the org switcher in the sidebar.",
        auth: "X-Access-Token (access token)",
        requestBody: {
          contentType: "application/json",
          fields: [
            {
              name: "organization_id",
              type: "string",
              required: true,
              description: "Organization to switch to.",
            },
          ],
        },
        response: {
          contentType: "application/json",
          description: "New access token scoped to the target organization.",
          example: '{ "token": "..." }',
        },
      },
      {
        method: "GET",
        path: "/appgateway/backend/v1/account",
        description: "Fetches the current account profile for the access token.",
        auth: "X-Access-Token (access token)",
        response: {
          contentType: "application/json",
          description: "Account object (id, email, profile fields).",
        },
      },
    ],
  },
  {
    id: "chat-streaming",
    title: "Chat Streaming",
    description:
      "Main chat endpoint, called by the AI SDK chat transport. Streams the assistant response as AI SDK UI-message SSE chunks. Only the latest user turn is sent (the server reloads prior history); after a human-in-the-loop tool approval the last two messages are sent together with is_tool_approval.",
    endpoints: [
      {
        method: "POST",
        path: "/ai-agent/v2/chat",
        description:
          "Sends a chat message and streams the AI response. The gateway rewrites /ai-agent/* to /api/* before forwarding to the AI service.",
        auth: TOKEN_HEADER_AUTH,
        requestBody: {
          contentType: "application/json",
          fields: [
            {
              name: "id",
              type: "string (UUID)",
              required: true,
              description: "Chat session ID.",
            },
            {
              name: "messages",
              type: "UIMessage[]",
              required: true,
              description:
                "AI SDK UIMessages. Normally only the latest user message; the last assistant + user pair when resubmitting after a tool approval.",
            },
            {
              name: "streamId",
              type: "string",
              required: false,
              description: "Stream ID for resumable streams (same as id).",
            },
            {
              name: "assistant_id",
              type: "string",
              required: true,
              description: "Imbrace assistant (agent) ID selected in the UI.",
            },
            {
              name: "organization_id",
              type: "string",
              required: true,
              description: "Imbrace organization ID.",
            },
            {
              name: "user_id",
              type: "string (UUID)",
              required: true,
              description:
                "Chat user ID returned by /ai-agent/chat-client/auth/user (cached in localStorage.chatUserId).",
            },
            {
              name: "agent_type",
              type: "string",
              required: false,
              description:
                'Agent type from the marketplace agent definition (e.g. "team_lead" routes to the multi-agent flow).',
            },
            {
              name: "core_task",
              type: "string",
              required: false,
              description: "Core task description for multi-agent (team_lead) mode.",
            },
            {
              name: "board_id",
              type: "string",
              required: false,
              description:
                "Databoard scope. When present, the server locks databoard tools to this single board.",
            },
            {
              name: "is_tool_approval",
              type: "boolean",
              required: false,
              description:
                "True when resubmitting after the user approved/denied a tool call.",
            },
            {
              name: "params",
              type: "object",
              required: false,
              description:
                "Optional contact context forwarded from the embedding webapp: { board_id, board_items, conversation_id, contact_name }.",
            },
          ],
        },
        response: {
          contentType: "text/event-stream",
          description:
            "Streaming AI response in AI SDK UI-message stream format (text deltas, tool calls, data parts, error chunks).",
        },
      },
    ],
  },
  {
    id: "sub-agent",
    title: "Sub-Agent Chat",
    description:
      "Conversations with an individual sub-agent inside a multi-agent (team_lead) workflow, opened from the sub-agent modal. New sessions go through /ai-agent/v2/chat; reopening an existing session uses the sub-agent endpoints so history is preserved.",
    endpoints: [
      {
        method: "POST",
        path: "/ai-agent/v2/sub-agent-chat",
        description:
          "Sends a message to an existing sub-agent session and streams the response.",
        auth: TOKEN_HEADER_AUTH,
        requestBody: {
          contentType: "application/json",
          fields: [
            {
              name: "id",
              type: "string (UUID)",
              required: true,
              description: "Modal-local chat ID.",
            },
            {
              name: "messages",
              type: "UIMessage[]",
              required: true,
              description: "Latest user message.",
            },
            {
              name: "assistant_id",
              type: "string",
              required: true,
              description: "Sub-agent assistant ID.",
            },
            {
              name: "organization_id",
              type: "string",
              required: true,
              description: "Imbrace organization ID.",
            },
            {
              name: "session_id",
              type: "string",
              required: true,
              description: "Existing sub-agent session to resume.",
            },
            {
              name: "chat_id",
              type: "string",
              required: true,
              description: "Parent chat ID the sub-agent session belongs to.",
            },
          ],
        },
        response: {
          contentType: "text/event-stream",
          description: "Streaming response in AI SDK UI-message stream format.",
        },
      },
      {
        method: "GET",
        path: "/ai-agent/v2/sub-agent-chat/history",
        description: "Fetches the conversation history of a sub-agent session.",
        auth: TOKEN_HEADER_AUTH,
        queryParams: [
          {
            name: "session_id",
            type: "string",
            required: true,
            description: "Sub-agent session ID.",
          },
          {
            name: "chat_id",
            type: "string",
            required: true,
            description: "Parent chat ID.",
          },
        ],
        response: {
          contentType: "application/json",
          description: "Sub-agent conversation history.",
        },
      },
    ],
  },
  {
    id: "chat-status",
    title: "Chat Status (SSE)",
    description:
      "Processing-status stream used after a page reload while the agent is still working. Opened with the browser EventSource API.",
    endpoints: [
      {
        method: "GET",
        path: "/api/chat-status/:id",
        description:
          "Opens an SSE stream that reports the chat's processing status; the UI refetches messages when it receives { status: \"idle\" }. Note: this is the only call made on the raw /api/* prefix (EventSource cannot set custom headers) — the Vite dev proxy forwards /api/* to the AI service, and nginx rewrites /api/chat-status/* into the gateway's /ai-agent/* namespace.",
        auth: "None (EventSource cannot send custom headers)",
        response: {
          contentType: "text/event-stream",
          description: "Events with processing status data.",
          example: 'data: { "status": "processing" | "idle" }',
        },
      },
    ],
  },
  {
    id: "chat-client-auth",
    title: "Chat-Client: Users",
    description:
      "Persistence API of the AI service, proxied under /ai-agent/chat-client/*. These endpoints manage the chat user record that owns chats, messages, and documents.",
    endpoints: [
      {
        method: "POST",
        path: "/ai-agent/chat-client/auth/user",
        description:
          "Finds or creates the chat user for the current Imbrace token. Called once after org selection; the returned id is cached in localStorage.chatUserId and sent as user_id in every /ai-agent/v2/chat request.",
        auth: TOKEN_HEADER_AUTH,
        response: {
          contentType: "application/json",
          description: "The chat user.",
          example: '{ "id": "uuid", "email": "user@example.com" }',
        },
      },
      {
        method: "POST",
        path: "/ai-agent/chat-client/auth/verify-credentials",
        description: "Verifies email/password credentials (no Imbrace token needed).",
        auth: "None",
        requestBody: {
          contentType: "application/json",
          fields: [
            { name: "email", type: "string", required: true, description: "Email." },
            { name: "password", type: "string", required: true, description: "Password." },
          ],
        },
        response: {
          contentType: "application/json",
          description: "User object, or null when credentials are invalid.",
        },
      },
      {
        method: "POST",
        path: "/ai-agent/chat-client/auth/register",
        description: "Registers a new email/password user. Returns 409 when the user already exists.",
        auth: "None",
        requestBody: {
          contentType: "application/json",
          fields: [
            { name: "email", type: "string", required: true, description: "Email." },
            { name: "password", type: "string", required: true, description: "Password." },
          ],
        },
        response: {
          contentType: "application/json",
          description: "200 on success, 409 when the email is taken.",
          example: '{ "ok": true }',
        },
      },
    ],
  },
  {
    id: "chats",
    title: "Chat-Client: Chats",
    description: "Create, list, update, and delete chat sessions.",
    endpoints: [
      {
        method: "POST",
        path: "/ai-agent/chat-client/chats",
        description:
          "Creates a chat session and saves the initial user message (saves into the existing chat when the ID already exists).",
        auth: TOKEN_HEADER_AUTH,
        requestBody: {
          contentType: "application/json",
          fields: [
            {
              name: "id",
              type: "string (UUID)",
              required: true,
              description: "Chat session ID (client-generated).",
            },
            {
              name: "message",
              type: "object",
              required: true,
              description:
                '{ id?, role: "user", parts: [{type: "text", text} | {type: "file", mediaType, name, url}], metadata? }',
            },
            {
              name: "selectedVisibilityType",
              type: '"public" | "private"',
              required: true,
              description: "Chat visibility.",
            },
            {
              name: "assistantId",
              type: "string",
              required: false,
              description: "Imbrace assistant ID used for this chat.",
            },
            {
              name: "organizationId",
              type: "string",
              required: false,
              description: "Imbrace organization ID.",
            },
            {
              name: "type",
              type: '"chat" | "sub-agent"',
              required: false,
              description: 'Chat type. Defaults to "chat".',
            },
          ],
        },
        response: {
          contentType: "application/json",
          description: "201 if created, 200 if it already existed.",
          example: '{ "ok": true, "id": "uuid", "created": true }',
        },
      },
      {
        method: "GET",
        path: "/ai-agent/chat-client/chats",
        description:
          "Lists chat sessions with cursor-based pagination, most recent first. Used by the sidebar history.",
        auth: TOKEN_HEADER_AUTH,
        queryParams: [
          {
            name: "limit",
            type: "number",
            required: false,
            description: "Number of chats to return.",
          },
          {
            name: "starting_after",
            type: "string",
            required: false,
            description: "Cursor: chats after this chat ID.",
          },
          {
            name: "ending_before",
            type: "string",
            required: false,
            description: "Cursor: chats before this chat ID.",
          },
          {
            name: "organization_id",
            type: "string",
            required: false,
            description: "Filter by organization.",
          },
        ],
        response: {
          contentType: "application/json",
          description: "Paginated chat list.",
          example: '{ "chats": [...], "hasMore": true }',
        },
      },
      {
        method: "GET",
        path: "/ai-agent/chat-client/chats/:id",
        description: "Fetches a single chat session.",
        auth: TOKEN_HEADER_AUTH,
        response: {
          contentType: "application/json",
          description: "Chat object, 404 when not found.",
        },
      },
      {
        method: "PATCH",
        path: "/ai-agent/chat-client/chats/:id",
        description: "Updates chat settings (assigned assistant and/or visibility).",
        auth: TOKEN_HEADER_AUTH,
        requestBody: {
          contentType: "application/json",
          fields: [
            {
              name: "assistantId",
              type: "string | null",
              required: false,
              description: "New assistant ID, or null to unset.",
            },
            {
              name: "visibility",
              type: '"public" | "private"',
              required: false,
              description: "New visibility.",
            },
          ],
        },
        response: {
          contentType: "application/json",
          description: "200 on success.",
          example: '{ "ok": true }',
        },
      },
      {
        method: "DELETE",
        path: "/ai-agent/chat-client/chats/:id",
        description: "Deletes a chat session and all its messages.",
        auth: TOKEN_HEADER_AUTH,
        response: {
          contentType: "application/json",
          description: "The deleted chat object.",
        },
      },
      {
        method: "DELETE",
        path: "/ai-agent/chat-client/chats",
        description:
          "Deletes ALL chats of the current user (optionally only those in one organization).",
        auth: TOKEN_HEADER_AUTH,
        queryParams: [
          {
            name: "organization_id",
            type: "string",
            required: false,
            description: "Restrict deletion to this organization.",
          },
        ],
        response: {
          contentType: "application/json",
          description: "Deletion result.",
          example: '{ "deletedCount": 5 }',
        },
      },
      {
        method: "GET",
        path: "/ai-agent/chat-client/chats/:id/messages",
        description: "Fetches all stored messages of a chat (used when opening /chat/:id).",
        auth: TOKEN_HEADER_AUTH,
        response: {
          contentType: "application/json",
          description: "Array of DB messages (id, chatId, role, parts, metadata, createdAt).",
        },
      },
      {
        method: "POST",
        path: "/ai-agent/chat-client/chats/:id/title",
        description: "Generates and saves a title for the chat from the first user message.",
        auth: TOKEN_HEADER_AUTH,
        requestBody: {
          contentType: "application/json",
          fields: [
            {
              name: "message",
              type: "object",
              required: true,
              description: "{ parts: [...] } — parts of the first user message.",
            },
          ],
        },
        response: {
          contentType: "application/json",
          description: "The generated title.",
          example: '{ "title": "..." }',
        },
      },
    ],
  },
  {
    id: "messages-votes",
    title: "Chat-Client: Messages & Votes",
    description: "Save assistant messages, truncate history, and vote on messages.",
    endpoints: [
      {
        method: "POST",
        path: "/ai-agent/chat-client/messages",
        description: "Saves an assistant message to a chat session after streaming finishes.",
        auth: TOKEN_HEADER_AUTH,
        requestBody: {
          contentType: "application/json",
          fields: [
            {
              name: "message",
              type: "object",
              required: true,
              description:
                '{ id, chatId, role: "assistant", parts: [...], metadata? }',
            },
          ],
        },
        response: {
          contentType: "application/json",
          description: "200 on success.",
          example: '{ "ok": true, "id": "message-uuid" }',
        },
      },
      {
        method: "DELETE",
        path: "/ai-agent/chat-client/messages/:id/trailing",
        description:
          "Deletes a message and everything after it in the chat (used when editing/regenerating a message).",
        auth: TOKEN_HEADER_AUTH,
        response: {
          contentType: "application/json",
          description: "200 on success.",
          example: '{ "ok": true }',
        },
      },
      {
        method: "GET",
        path: "/ai-agent/chat-client/chats/:id/votes",
        description: "Fetches all votes of a chat session.",
        auth: TOKEN_HEADER_AUTH,
        response: {
          contentType: "application/json",
          description: "Array of votes.",
          example: '[{ "chatId", "messageId", "type": "up" | "down" }]',
        },
      },
      {
        method: "PATCH",
        path: "/ai-agent/chat-client/votes",
        description: "Casts or updates an up/down vote on a message.",
        auth: TOKEN_HEADER_AUTH,
        requestBody: {
          contentType: "application/json",
          fields: [
            {
              name: "chatId",
              type: "string (UUID)",
              required: true,
              description: "Chat session ID.",
            },
            {
              name: "messageId",
              type: "string (UUID)",
              required: true,
              description: "Message to vote on.",
            },
            {
              name: "type",
              type: '"up" | "down"',
              required: true,
              description: "Vote type.",
            },
          ],
        },
        response: {
          contentType: "application/json",
          description: "200 on success.",
          example: '{ "ok": true }',
        },
      },
    ],
  },
  {
    id: "documents",
    title: "Chat-Client: Documents (Artifacts)",
    description:
      "Versioned documents backing the artifact panel (text, code, sheet, image, databoard, vibe-code).",
    endpoints: [
      {
        method: "POST",
        path: "/ai-agent/chat-client/documents?id=:id",
        description: "Saves a new version of a document.",
        auth: TOKEN_HEADER_AUTH,
        queryParams: [
          {
            name: "id",
            type: "string (UUID)",
            required: true,
            description: "Document ID.",
          },
        ],
        requestBody: {
          contentType: "application/json",
          fields: [
            { name: "content", type: "string", required: true, description: "Document content." },
            { name: "title", type: "string", required: true, description: "Document title." },
            {
              name: "kind",
              type: "string",
              required: true,
              description:
                'Artifact kind: "text" | "code" | "sheet" | "image" | "imbrace-databoard" | "vibe-code".',
            },
          ],
        },
        response: {
          contentType: "application/json",
          description: "Created document version(s).",
        },
      },
      {
        method: "GET",
        path: "/ai-agent/chat-client/documents/:id",
        description: "Fetches all versions of a document.",
        auth: TOKEN_HEADER_AUTH,
        response: {
          contentType: "application/json",
          description: "Array of document versions, oldest first.",
          example: "[{ id, title, content, kind, createdAt, ... }]",
        },
      },
      {
        method: "GET",
        path: "/ai-agent/chat-client/documents/:id/latest",
        description: "Fetches only the latest version of a document.",
        auth: TOKEN_HEADER_AUTH,
        response: {
          contentType: "application/json",
          description: "Latest document version, 404 when not found.",
        },
      },
      {
        method: "GET",
        path: "/ai-agent/chat-client/documents/latest-by-kind",
        description:
          "Fetches the current user's most recent document of a given kind (e.g. to restore the last vibe-code project).",
        auth: TOKEN_HEADER_AUTH,
        queryParams: [
          {
            name: "kind",
            type: "string",
            required: true,
            description: "Artifact kind to look up.",
          },
        ],
        response: {
          contentType: "application/json",
          description: "Latest document of that kind, or null.",
        },
      },
      {
        method: "DELETE",
        path: "/ai-agent/chat-client/documents/:id",
        description: "Deletes document versions newer than the given timestamp (version rollback).",
        auth: TOKEN_HEADER_AUTH,
        queryParams: [
          {
            name: "timestamp",
            type: "string (ISO date)",
            required: true,
            description: "Versions created after this timestamp are deleted.",
          },
        ],
        response: {
          contentType: "application/json",
          description: "Remaining document versions.",
        },
      },
      {
        method: "GET",
        path: "/ai-agent/chat-client/documents/:id/suggestions",
        description: "Fetches writing suggestions attached to a document.",
        auth: TOKEN_HEADER_AUTH,
        response: {
          contentType: "application/json",
          description: "Array of suggestions.",
        },
      },
    ],
  },
  {
    id: "agents",
    title: "Agents & Prompt Suggestions",
    description: "Marketplace agent definitions and per-agent prompt suggestions.",
    endpoints: [
      {
        method: "GET",
        path: "/appgateway/v3/marketplaces/use-cases",
        description:
          "Lists the marketplace agents (assistants) available to the organization. Populates the agent selector.",
        auth: TOKEN_HEADER_AUTH,
        response: {
          contentType: "application/json",
          description: "Agent list.",
          example: '{ "data": [{ "assistant_id", "name", "agent_type", "core_task", ... }] }',
        },
      },
      {
        method: "GET",
        path: "/ai-agent/chat/get-agent-prompt-suggestion",
        description: "Fetches prompt suggestions for a specific assistant (shown on the empty chat screen).",
        auth: TOKEN_HEADER_AUTH,
        queryParams: [
          {
            name: "assistant_id",
            type: "string",
            required: true,
            description: "Assistant to get suggestions for.",
          },
        ],
        response: {
          contentType: "application/json",
          description: "Suggestion list.",
          example: '{ "success": true, "data": ["...", "..."] }',
        },
      },
    ],
  },
  {
    id: "file-upload",
    title: "File Upload",
    description:
      "Chat attachments are uploaded through the app-gateway to the data-board service, which returns a permanent public S3 URL (no expiry) so attachments stay viewable indefinitely.",
    endpoints: [
      {
        method: "POST",
        path: "/appgateway/data-board/boards/upload",
        description: "Uploads a file and returns its public URL.",
        auth: TOKEN_HEADER_AUTH,
        requestBody: {
          contentType: "multipart/form-data",
          fields: [
            {
              name: "file",
              type: "binary",
              required: true,
              description: "The file to upload.",
            },
          ],
        },
        response: {
          contentType: "application/json",
          description: "Upload result with the permanent public file URL.",
        },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// UI Components
// ---------------------------------------------------------------------------

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  POST: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  PATCH: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  DELETE: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 font-mono text-xs font-bold ${METHOD_COLORS[method]}`}
    >
      {method}
    </span>
  );
}

function ParamTable({
  title,
  params,
}: {
  title: string;
  params: Param[];
}) {
  return (
    <div className="mt-3">
      <h5 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h5>
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-1.5 text-left font-medium">Name</th>
              <th className="px-3 py-1.5 text-left font-medium">Type</th>
              <th className="px-3 py-1.5 text-left font-medium">Required</th>
              <th className="px-3 py-1.5 text-left font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            {params.map((p) => (
              <tr key={p.name} className="border-b border-border last:border-0">
                <td className="px-3 py-1.5 font-mono text-xs">{p.name}</td>
                <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                  {p.type}
                </td>
                <td className="px-3 py-1.5">
                  {p.required ? (
                    <span className="text-xs font-medium text-red-600 dark:text-red-400">
                      Yes
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">No</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">
                  {p.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function buildCurlExample(endpoint: ApiEndpoint): string {
  const auth = endpoint.auth.toLowerCase();
  let url = `{{baseUrl}}${endpoint.path}`;

  if (endpoint.queryParams && endpoint.queryParams.length > 0) {
    const qs = endpoint.queryParams
      .map((p) => `${p.name}=<${p.name}>`)
      .join("&");
    url += `?${qs}`;
  }

  const lines: string[] = [`curl -X ${endpoint.method} '${url}' \\`];

  if (auth.includes("login token")) {
    lines.push("  -H 'x-access-token: {{loginToken}}' \\");
  } else if (auth.includes("access-token") || auth.includes("access token")) {
    lines.push("  -H 'x-access-token: {{accessToken}}' \\");
  }
  if (auth.includes("x-organization-id")) {
    lines.push("  -H 'x-organization-id: {{organizationId}}' \\");
  }

  if (endpoint.headers) {
    for (const h of endpoint.headers) {
      lines.push(`  -H '${h.name}: <${h.type}>' \\`);
    }
  }

  if (endpoint.requestBody) {
    lines.push(`  -H 'Content-Type: ${endpoint.requestBody.contentType}' \\`);
    if (endpoint.requestBody.contentType.includes("json")) {
      const skeleton = Object.fromEntries(
        endpoint.requestBody.fields.map((f) => [f.name, `<${f.type}>`]),
      );
      lines.push(`  -d '${JSON.stringify(skeleton, null, 2)}'`);
    } else if (endpoint.requestBody.contentType.includes("multipart")) {
      endpoint.requestBody.fields.forEach((f, i) => {
        const last = i === endpoint.requestBody!.fields.length - 1;
        lines.push(`  -F '${f.name}=<${f.type}>'${last ? "" : " \\"}`);
      });
    } else {
      lines.push(`  --data-raw '<${endpoint.requestBody.contentType}>'`);
    }
  } else {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/ \\$/, "");
  }

  return lines.join("\n");
}

function CurlBlock({ endpoint }: { endpoint: ApiEndpoint }) {
  const curl = buildCurlExample(endpoint);
  return (
    <div className="mt-3">
      <h5 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        cURL / Postman
      </h5>
      <pre className="overflow-x-auto rounded border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
        {curl}
      </pre>
      <p className="mt-1 text-xs text-muted-foreground">
        Replace <code className="rounded bg-muted px-1 font-mono">{"<...>"}</code>{" "}
        placeholders with real values. In Postman, import via{" "}
        <em>File → Import → Raw text</em> and paste the snippet. Variables{" "}
        <code className="rounded bg-muted px-1 font-mono">{"{{baseUrl}}"}</code>,{" "}
        <code className="rounded bg-muted px-1 font-mono">
          {"{{accessToken}}"}
        </code>
        ,{" "}
        <code className="rounded bg-muted px-1 font-mono">
          {"{{loginToken}}"}
        </code>
        ,{" "}
        <code className="rounded bg-muted px-1 font-mono">
          {"{{organizationId}}"}
        </code>{" "}
        come from the Postman environment (see <em>Postman Setup</em> above).
      </p>
    </div>
  );
}

function EndpointCard({ endpoint }: { endpoint: ApiEndpoint }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <MethodBadge method={endpoint.method} />
        <code className="text-sm font-semibold">{endpoint.path}</code>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        {endpoint.description}
      </p>

      <div className="mt-2 text-xs">
        <span className="font-medium text-muted-foreground">Auth: </span>
        <span className="font-mono">{endpoint.auth}</span>
      </div>

      {endpoint.headers && endpoint.headers.length > 0 && (
        <ParamTable title="Headers" params={endpoint.headers} />
      )}

      {endpoint.queryParams && endpoint.queryParams.length > 0 && (
        <ParamTable title="Query Parameters" params={endpoint.queryParams} />
      )}

      {endpoint.requestBody && (
        <ParamTable
          title={`Request Body (${endpoint.requestBody.contentType})`}
          params={endpoint.requestBody.fields}
        />
      )}

      <div className="mt-3">
        <h5 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Response
        </h5>
        <div className="rounded border border-border bg-muted/30 p-3">
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">Content-Type: </span>
            <span className="font-mono">
              {endpoint.response.contentType}
            </span>
          </div>
          <p className="mt-1 text-sm">{endpoint.response.description}</p>
          {endpoint.response.example && (
            <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 font-mono text-xs">
              {endpoint.response.example}
            </pre>
          )}
        </div>
      </div>

      <CurlBlock endpoint={endpoint} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pages Data
// ---------------------------------------------------------------------------

interface PageInfo {
  path: string;
  title: string;
  auth: string;
  description: string;
  features: string[];
  screenshots?: string[];
}

const PAGES: PageInfo[] = [
  {
    path: "/",
    title: "Home / New Chat",
    auth: "Required (redirects to /login)",
    description:
      "Landing page that starts a new chat session with a client-generated UUID. A global handler (ImbraceTokenHandler) also processes SSO entry on any route: when the Imbrace webapp opens the chatbot with ?imbraceToken=&organizationId=, the token is stored and the user is signed in without the login flow.",
    features: [
      "Auto-generates a unique chat session ID",
      "?agent=<id> pre-selects an assistant",
      "SSO entry params: imbraceToken, organizationId",
      "Mode/scope params: isInsightsIQ, isAgentDemo, agentId, databoardId, lang",
      "Agent selector backed by /appgateway/v3/marketplaces/use-cases",
    ],
    screenshots: ["/docs/page-home.png"],
  },
  {
    path: "/chat/:id",
    title: "Existing Chat",
    auth: "Required (redirects to /login)",
    description:
      "Opens and resumes an existing chat session. Loads messages from the chat-client API. Public chats are viewable read-only by non-owners; private chats are owner-only.",
    features: [
      "Loads history via GET /ai-agent/chat-client/chats/:id/messages",
      "Public/private visibility with access control",
      "Read-only mode for non-owner viewers",
      "Re-attaches to in-flight processing via the chat-status SSE stream",
      "Sub-agent conversations open in a modal (multi-agent workflows)",
    ],
    screenshots: ["/docs/page-chat.png"],
  },
  {
    path: "/login",
    title: "Login",
    auth: "Not required (public only — authenticated users are redirected to /)",
    description:
      "Client-side authentication page with two sign-in methods: password and OTP (email verification with a 6-digit code), both via the app-gateway. On success the temporary login token is kept in memory and the user is sent to /select-org.",
    features: [
      "Tab switcher: Password vs OTP login",
      "OTP: 6-digit code with auto-submit and paste support",
      "60-second resend countdown for OTP",
      "i18n support (multilingual)",
      "Redirects to /select-org after successful auth",
    ],
    screenshots: ["/docs/page-login-password.png", "/docs/page-login-otp.png"],
  },
  {
    path: "/select-org",
    title: "Select Organization",
    auth: "Requires the in-memory login token from /login",
    description:
      "Post-login page where the user picks an organization. Selecting one exchanges the login token for an access token (stored in localStorage), bootstraps the chat user via /ai-agent/chat-client/auth/user, and redirects home.",
    features: [
      "Paginated organization list (10 per page) with infinite scroll",
      "Alphabetical sorting",
      '"Login with another account" option',
      "Token exchange + chat-user bootstrap on selection",
    ],
    screenshots: ["/docs/page-select-org.png"],
  },
  {
    path: "/docs",
    title: "API Documentation",
    auth: "Not required (public)",
    description:
      "This page. Complete API reference and pages documentation for the Imbrace Chatbot application.",
    features: [
      "Tabbed layout: API / Pages",
      "Sticky sidebar TOC navigation",
      "Environment variables reference",
      "Color-coded HTTP method badges",
      "Dark mode support",
    ],
  },
];

// ---------------------------------------------------------------------------
// Page Card Component
// ---------------------------------------------------------------------------

function PageCard({ page }: { page: PageInfo }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <code className="rounded bg-blue-100 px-2 py-0.5 font-mono text-xs font-bold text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
          {page.path}
        </code>
        <span className="text-sm font-semibold">{page.title}</span>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">{page.description}</p>

      <div className="mt-2 text-xs">
        <span className="font-medium text-muted-foreground">Auth: </span>
        <span className="font-mono">{page.auth}</span>
      </div>

      <div className="mt-3">
        <h5 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Key Features
        </h5>
        <ul className="list-inside list-disc space-y-0.5 text-sm text-muted-foreground">
          {page.features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>

      {page.screenshots && page.screenshots.length > 0 && (
        <div className="mt-4">
          <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Screenshots
          </h5>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {page.screenshots.map((src) => (
              <img
                key={src}
                src={src}
                alt={`Screenshot of ${page.title}`}
                className="rounded-lg border border-border"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Link
// ---------------------------------------------------------------------------

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={`inline-block border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:border-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </a>
  );
}

// ---------------------------------------------------------------------------
// Architecture / Env / Postman info sections
// ---------------------------------------------------------------------------

function ArchitectureSection() {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4" id="architecture">
      <h3 className="text-sm font-semibold">Architecture & Proxy Prefixes</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        The chatbot is a pure client-side SPA (Vite + React) with no API routes
        of its own. Every request goes through one of these path prefixes —
        handled by the Vite proxy in dev and by nginx in the Docker image:
      </p>
      <div className="mt-3 overflow-x-auto rounded border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-1.5 text-left font-medium">Prefix</th>
              <th className="px-3 py-1.5 text-left font-medium">Upstream</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border">
              <td className="px-3 py-1.5 font-mono text-xs">/appgateway/*</td>
              <td className="px-3 py-1.5 text-muted-foreground">
                app-gateway — the prefix is stripped before forwarding. Auth,
                organizations, marketplace agents, file upload.
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-3 py-1.5 font-mono text-xs">/ai-agent/*</td>
              <td className="px-3 py-1.5 text-muted-foreground">
                app-gateway, which rewrites{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/ai-agent/*</code>{" "}
                →{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/api/*</code>{" "}
                on the AI service. Chat streaming and the chat-client
                persistence API live here.
              </td>
            </tr>
            <tr className="border-b border-border last:border-0">
              <td className="px-3 py-1.5 font-mono text-xs">/config</td>
              <td className="px-3 py-1.5 text-muted-foreground">
                Static client runtime config (env.json), baked into the image
                at build time from <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.env</code>.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        <span className="font-medium">Auth header convention:</span> every
        authenticated call sends{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">x-access-token</code>{" "}
        and (when an organization is selected){" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">x-organization-id</code>
        . JWT-shaped tokens (starting with{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">eyJ</code>) additionally
        send{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">Authorization: Bearer</code>{" "}
        — the gateway routes JWT and{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">acc_*</code>{" "}
        tokens to different validators.
      </p>
    </div>
  );
}

function PostmanGuideSection() {
  return (
    <div
      className="rounded-lg border border-border bg-muted/30 p-4"
      id="postman-setup"
    >
      <h3 className="text-sm font-semibold">Postman Setup</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Every endpoint below includes a ready-to-paste cURL snippet under the{" "}
        <em>cURL / Postman</em> section. To make the snippets reusable across
        environments, create a Postman environment with these variables:
      </p>
      <div className="mt-3 overflow-x-auto rounded border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-1.5 text-left font-medium">Variable</th>
              <th className="px-3 py-1.5 text-left font-medium">
                How to obtain
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border">
              <td className="px-3 py-1.5 font-mono text-xs">baseUrl</td>
              <td className="px-3 py-1.5 text-muted-foreground">
                The chatbot origin — e.g.{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  http://localhost:6790
                </code>{" "}
                for the Vite dev server, or the deployed URL. The proxy behind
                that origin forwards the request to the right upstream.
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-3 py-1.5 font-mono text-xs">accessToken</td>
              <td className="px-3 py-1.5 text-muted-foreground">
                Your Imbrace ACCESS token — the value the browser stores in{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  localStorage.imbraceToken
                </code>{" "}
                after logging in and selecting an organization (an{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  acc_xxxx
                </code>{" "}
                token or a JWT).
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-3 py-1.5 font-mono text-xs">loginToken</td>
              <td className="px-3 py-1.5 text-muted-foreground">
                The temporary token returned by the sign-in / OTP-verify
                endpoints. Only needed for the organization-list and
                token-exchange calls.
              </td>
            </tr>
            <tr className="border-b border-border last:border-0">
              <td className="px-3 py-1.5 font-mono text-xs">
                organizationId
              </td>
              <td className="px-3 py-1.5 text-muted-foreground">
                Current org ID — the value stored in{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  localStorage.imbraceOrganizationId
                </code>{" "}
                after selecting an organization.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        To import a snippet: in Postman click <em>Import</em> (top-left) →{" "}
        <em>Raw text</em>, paste the cURL block, then <em>Continue → Import</em>
        . Postman will create a request with the headers, query params, and
        body pre-filled; substitute{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
          {"<...>"}
        </code>{" "}
        placeholders with real values before sending.
      </p>
    </div>
  );
}

function EnvVarsSection() {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4" id="env-vars">
      <h3 className="text-sm font-semibold">Environment Variables</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        All configuration lives in{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.env</code>{" "}
        (see{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.env.example</code>
        ). Values are PUBLIC: at Docker build time they are baked into{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">env.json</code>{" "}
        (served to the browser at{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/config</code>
        ) and into the nginx proxy config. In dev, Vite reads the same file for
        its proxy targets. Never put secrets here.
      </p>
      <div className="mt-3 overflow-x-auto rounded border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-1.5 text-left font-medium">Variable</th>
              <th className="px-3 py-1.5 text-left font-medium">Required</th>
              <th className="px-3 py-1.5 text-left font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border">
              <td className="px-3 py-1.5 font-mono text-xs">IMBRACE_BASE_URL</td>
              <td className="px-3 py-1.5">
                <span className="text-xs font-medium text-red-600 dark:text-red-400">Yes</span>
              </td>
              <td className="px-3 py-1.5 text-muted-foreground">
                Base URL of the Imbrace webapp. Exposed to the client via{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/config</code>.
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-3 py-1.5 font-mono text-xs">IMBRACE_APP_GATEWAY_URL</td>
              <td className="px-3 py-1.5">
                <span className="text-xs font-medium text-red-600 dark:text-red-400">Yes</span>
              </td>
              <td className="px-3 py-1.5 text-muted-foreground">
                URL of the Imbrace app-gateway — the single upstream for both{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/appgateway/*</code>{" "}
                and{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/ai-agent/*</code>
                . In the Docker image it is also the default value for{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">BACKEND</code>.
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-3 py-1.5 font-mono text-xs">IMBRACE_NEXT_BEST_ACTION_URL</td>
              <td className="px-3 py-1.5">
                <span className="text-xs text-muted-foreground">No</span>
              </td>
              <td className="px-3 py-1.5 text-muted-foreground">
                URL of the Next-Best-Action service, used by the AICentric
                iframe panel. In dev it is also the Vite proxy target for{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/ai-agent/*</code>{" "}
                and{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/api/*</code>{" "}
                (pointing at a locally running AI service).
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-3 py-1.5 font-mono text-xs">IMBRACE_WORKFLOW_DOMAIN</td>
              <td className="px-3 py-1.5">
                <span className="text-xs text-muted-foreground">No</span>
              </td>
              <td className="px-3 py-1.5 text-muted-foreground">
                Domain of the workflow editor, embedded as an iframe by the
                flow-editor panel.
              </td>
            </tr>
            <tr className="border-b border-border last:border-0">
              <td className="px-3 py-1.5 font-mono text-xs">BACKEND / BACKEND_HOST</td>
              <td className="px-3 py-1.5">
                <span className="text-xs text-muted-foreground">No</span>
              </td>
              <td className="px-3 py-1.5 text-muted-foreground">
                Docker image only: nginx upstream URL and Host header for the
                proxy locations. Default to{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  IMBRACE_APP_GATEWAY_URL
                </code>{" "}
                and its hostname. Never exposed at{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/config</code>.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DocsPage() {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get("tab");
  const activeTab = tab === "pages" ? "pages" : "api";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-background px-6 pt-8">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-3xl font-bold">Imbrace Chatbot Documentation</h1>
          <p className="mt-2 text-muted-foreground">
            Complete reference for API endpoints and application pages.
          </p>

          {/* Tabs */}
          <div className="mt-6 flex border-b border-border">
            <TabLink href="/docs?tab=api" active={activeTab === "api"}>
              API Endpoints
            </TabLink>
            <TabLink href="/docs?tab=pages" active={activeTab === "pages"}>
              Pages
            </TabLink>
          </div>
        </div>
      </header>

      {activeTab === "api" ? (
        <>
          {/* API info header */}
          <div className="border-b border-border bg-background px-6 py-6">
            <div className="mx-auto max-w-6xl space-y-4">
              <ArchitectureSection />

              {/* Error format */}
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <h3 className="text-sm font-semibold">Error Response Format</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Chat-client endpoints (
                  <code className="rounded bg-muted px-1 font-mono text-xs">/ai-agent/chat-client/*</code>
                  ) return errors as (HTTP 400/401/403/404/429/503):
                </p>
                <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 font-mono text-xs">
                  {`{ "code": "error_type:surface", "message": "Human-readable message", "cause": "optional detail" }`}
                </pre>
                <p className="mt-2 text-sm text-muted-foreground">
                  Imbrace platform endpoints (
                  <code className="rounded bg-muted px-1 font-mono text-xs">/appgateway/backend/*</code>
                  ) return numeric error codes, e.g. 40004/40005 (invalid
                  credentials), 40000 (invalid email), 7 (account not
                  verified):
                </p>
                <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 font-mono text-xs">
                  {`{ "code": 40004, "message": "Description of what failed" }`}
                </pre>
              </div>

              <EnvVarsSection />
              <PostmanGuideSection />
            </div>
          </div>

          {/* API Content */}
          <div className="mx-auto flex max-w-6xl gap-8 px-6 py-8">
            {/* Sidebar TOC */}
            <nav className="sticky top-8 hidden h-fit w-56 shrink-0 lg:block">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Sections
              </h3>
              <ul className="space-y-1">
                <li>
                  <a
                    href="#architecture"
                    className="block rounded px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    Architecture
                  </a>
                </li>
                <li>
                  <a
                    href="#env-vars"
                    className="block rounded px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    Environment Variables
                  </a>
                </li>
                <li>
                  <a
                    href="#postman-setup"
                    className="block rounded px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    Postman Setup
                  </a>
                </li>
                {API_SECTIONS.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="block rounded px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Main Content */}
            <main className="min-w-0 flex-1 space-y-12">
              {API_SECTIONS.map((section) => (
                <section key={section.id} id={section.id}>
                  <h2 className="text-xl font-bold">{section.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {section.description}
                  </p>
                  <div className="mt-4 space-y-4">
                    {section.endpoints.map((endpoint) => (
                      <EndpointCard
                        key={`${endpoint.method}-${endpoint.path}`}
                        endpoint={endpoint}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </main>
          </div>
        </>
      ) : (
        /* Pages Content */
        <div className="mx-auto max-w-6xl px-6 py-8">
          <p className="mb-6 text-sm text-muted-foreground">
            All user-facing routes in the application. Each card documents the route
            path, authentication requirements, key features, and main components rendered.
          </p>
          <div className="space-y-4">
            {PAGES.map((page) => (
              <PageCard key={page.path} page={page} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
