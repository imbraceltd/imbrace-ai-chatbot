// Cookie names for passing Imbrace auth data to client after auth
export const IMBRACE_TOKEN_COOKIE = "imbrace-token-pending";
export const IMBRACE_ORG_ID_COOKIE = "imbrace-org-id-pending";

// Cookie name for temporary login_access token (between login and org selection)
export const IMBRACE_LOGIN_TOKEN_COOKIE = "imbrace-login-token";

// LocalStorage keys for Imbrace auth
export const IMBRACE_TOKEN_KEY = "imbraceToken";
export const IMBRACE_ORG_ID_KEY = "imbraceOrganizationId";

// LocalStorage key for board scoping. When set, every /v2/chat request
// includes `board_id` and the server locks databoard tools to that single
// board (no create_board, board_id field hardcoded server-side).
export const IMBRACE_BOARD_ID_KEY = "imbraceBoardId";

// LocalStorage flag — when "1", the user has dismissed the scope chip but
// the boardId is kept around so the BoardSelector can offer to re-engage.
// While set, `useScopedBoardId()` returns null (no board_id sent / no
// broadcast). Cleared automatically when the user picks any board from
// the selector or when a fresh `?databoardId=` arrives in the URL.
export const IMBRACE_BOARD_SCOPE_DISMISSED_KEY = "imbraceBoardScopeDismissed";

// Custom event for token updates
export const IMBRACE_TOKEN_UPDATED_EVENT = "imbraceTokenUpdated";

// App mode
export type AppMode = "manual" | "insightsIQ" | "agentDemo";
export const APP_MODE_KEY = "appMode";
export const AGENT_DEMO_AGENT_ID_KEY = "agentDemoAgentId";
export const AGENT_DEMO_EXPANDABLE_KEY = "agentDemoExpandable";

// AICentric Agent IDs
export const SCB_AGENT_ID = "015a68b2-04ec-419b-a6d3-6f764f340449";
export const CHART_AGENT_IDS = [
  "5b36d312-de56-4c3a-95d7-3e01c9c15c8a",
  "0961cf1c-bd5b-4747-9c7a-8abacc373596",
  "8fc11cd9-20e0-4498-b75e-27c38ef86a29",
  "16b44fac-7538-4c23-8364-fc4d4638e718",
  "9f3e7248-e663-4e77-bffb-07ed2efbcd71",
  "93c7da35-6f9f-4e4d-b7fd-c1010f00c9aa",
  "2f7880b4-9fb1-49c2-8fc2-11a4d83b7764",
  "f6d12bc5-1974-4700-8715-420f6d5b7666"
];


