export const FetchMethod = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  DELETE: "DELETE",
  PATCH: "PATCH",
} as const;

export type FetchMethodType = (typeof FetchMethod)[keyof typeof FetchMethod];

export type ApiEndpoint = {
  api: string;
  method: FetchMethodType;
};

// Reason: paths target app-gateway (/appgateway proxy strips the prefix). The
// `/backend/*` namespace is the legacy/access-token route on app-gateway, which
// is what manual login (acc_*) uses end-to-end. /platform/* would be the SSO
// path; see new-frontend's services/axios/handler.ts for the parallel mapping.

// Auth APIs
export const getAccount: ApiEndpoint = {
  api: "/backend/v1/account",
  method: FetchMethod.GET,
};

// Login APIs (Imbrace sign-in flow)
export const imbraceSignIn: ApiEndpoint = {
  api: "/backend/v1/login/sign_in",
  method: FetchMethod.POST,
};

export const imbraceRequestOTP: ApiEndpoint = {
  api: "/backend/v1/login/_signin_email_request",
  method: FetchMethod.POST,
};

export const imbraceVerifyOTP: ApiEndpoint = {
  api: "/backend/v1/login/_signin_with_email",
  method: FetchMethod.POST,
};

export const imbraceGetOrganizations = {
  api: (limit: number, skip: number, isActive: boolean) =>
    `/backend/v2/organizations?limit=${limit}&skip=${skip}&is_active=${isActive}`,
  method: FetchMethod.GET,
} as const;

export const imbraceExchangeAccessToken: ApiEndpoint = {
  api: "/backend/v1/access/_exchange_access_token",
  method: FetchMethod.POST,
};

export const imbraceExchangeAccessTokenWithAccessToken: ApiEndpoint = {
  api: "/backend/v1/access/_exchange_access_token_with_access_token",
  method: FetchMethod.POST,
};

export const imbraceGetAllOrganizations = {
  api: (isActive: boolean) =>
    `/backend/v2/organizations/_all?is_active=${isActive}`,
  method: FetchMethod.GET,
} as const;

// Agent/Template APIs
export const getTemplates: ApiEndpoint = {
  api: "/v3/marketplaces/use-cases",
  method: FetchMethod.GET,
};

// Chat APIs (via app-gateway: /ai-agent/* is rewritten to /api/* on the gateway)
export const postChat: ApiEndpoint = {
  api: "/ai-agent/v2/chat",
  method: FetchMethod.POST,
};

// File upload
// Reason: data-board's upload returns a PERMANENT public S3 URL (no expiry),
// unlike /files/upload which yields an `s3://` key that must be exchanged for a
// presigned URL valid only 30 min. Using this keeps chat attachments openable
// indefinitely. app-gateway mounts the service at /data-board/* (→ /api/* upstream).
export const uploadFile: ApiEndpoint = {
  api: "/data-board/boards/upload",
  method: FetchMethod.POST,
};

// Prompt suggestions (via app-gateway)
export const getPromptSuggestions: ApiEndpoint = {
  api: "/ai-agent/chat/get-agent-prompt-suggestion",
  method: FetchMethod.GET,
};
