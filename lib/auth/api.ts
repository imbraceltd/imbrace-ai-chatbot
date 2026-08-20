/**
 * Client-side auth API calls.
 * Replaces Next.js server actions in app/(auth)/actions.ts
 *
 * All calls go through the Vite proxy:
 *   /appgateway  →  IMBRACE_APP_GATEWAY_URL
 */

import { z } from "zod";
import {
  imbraceSignIn,
  imbraceRequestOTP,
  imbraceVerifyOTP,
  imbraceGetOrganizations,
  imbraceExchangeAccessToken,
  imbraceExchangeAccessTokenWithAccessToken,
  imbraceGetAllOrganizations,
  getAccount,
} from "@/lib/imbrace/api";
import { IMBRACE_TOKEN_KEY, IMBRACE_ORG_ID_KEY } from "@/lib/imbrace/constants";

// ─── Types ───

export type LoginActionState = {
  status: "idle" | "in_progress" | "success" | "failed" | "invalid_data";
  message?: string;
};

export type OTPRequestState = {
  status: "idle" | "in_progress" | "success" | "failed" | "invalid_data";
  message?: string;
};

export type OTPVerifyState = {
  status: "idle" | "in_progress" | "success" | "failed" | "invalid_data";
  message?: string;
};

export type SelectOrgState = {
  status: "idle" | "in_progress" | "success" | "failed";
  message?: string;
};

export type Organization = {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
};

// ─── Helpers ───

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const otpRequestSchema = z.object({
  email: z.string().email(),
});

const otpVerifySchema = z.object({
  email: z.string().email(),
  otp: z.string().min(1),
});

/** Temporary login token stored in memory (between login and org selection) */
let _loginToken: string | null = null;

export function getLoginToken() {
  return _loginToken;
}

export function setLoginToken(token: string | null) {
  _loginToken = token;
}

// ─── Actions ───

export async function imbraceLogin(
  _: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  try {
    const validatedData = loginSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    const response = await fetch(`/appgateway${imbraceSignIn.api}`, {
      method: imbraceSignIn.method,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        email: validatedData.email,
        password: validatedData.password,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const code = errorData?.code;
      if (code === 40004 || code === 40005) return { status: "failed", message: "invalidCredentials" };
      if (code === 7) return { status: "failed", message: "accountNotVerified" };
      return { status: "failed", message: "loginFailed" };
    }

    const data = await response.json();
    setLoginToken(data.token);
    return { status: "success" };
  } catch (error) {
    if (error instanceof z.ZodError) return { status: "invalid_data" };
    return { status: "failed", message: "loginFailed" };
  }
}

export async function imbraceOTPRequest(
  _: OTPRequestState,
  formData: FormData,
): Promise<OTPRequestState> {
  try {
    const validatedData = otpRequestSchema.parse({ email: formData.get("email") });

    const response = await fetch(`/appgateway${imbraceRequestOTP.api}`, {
      method: imbraceRequestOTP.method,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: validatedData.email }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      if (errorData?.code === 40000) return { status: "failed", message: "invalidEmail" };
      return { status: "failed", message: "otpRequestFailed" };
    }

    return { status: "success" };
  } catch (error) {
    if (error instanceof z.ZodError) return { status: "invalid_data" };
    return { status: "failed", message: "otpRequestFailed" };
  }
}

export async function imbraceOTPVerify(
  _: OTPVerifyState,
  formData: FormData,
): Promise<OTPVerifyState> {
  try {
    const validatedData = otpVerifySchema.parse({
      email: formData.get("email"),
      otp: formData.get("otp"),
    });

    const response = await fetch(`/appgateway${imbraceVerifyOTP.api}`, {
      method: imbraceVerifyOTP.method,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: validatedData.email, otp: validatedData.otp }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const message = errorData?.message || "";
      if (message.includes("Too many attempts")) return { status: "failed", message: "tooManyAttempts" };
      if (message.includes("Invalid OTP")) return { status: "failed", message: "invalidOTP" };
      return { status: "failed", message: "otpVerifyFailed" };
    }

    const data = await response.json();
    setLoginToken(data.token);
    return { status: "success" };
  } catch (error) {
    if (error instanceof z.ZodError) return { status: "invalid_data" };
    return { status: "failed", message: "otpVerifyFailed" };
  }
}

export async function fetchOrganizations(
  limit = 10,
  skip = 0,
): Promise<{ organizations: Organization[]; hasMore: boolean; total: number; error?: string }> {
  const loginToken = getLoginToken();
  if (!loginToken) return { organizations: [], hasMore: false, total: 0, error: "noLoginToken" };

  try {
    const apiPath = imbraceGetOrganizations.api(limit, skip, true);
    const response = await fetch(`/appgateway${apiPath}`, {
      method: imbraceGetOrganizations.method,
      headers: {
        Accept: "application/json",
        "X-Access-Token": loginToken,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });

    if (!response.ok) return { organizations: [], hasMore: false, total: 0, error: "fetchFailed" };

    const data = await response.json();
    return {
      organizations: data.data || [],
      hasMore: data.has_more ?? false,
      total: data.total ?? 0,
    };
  } catch {
    return { organizations: [], hasMore: false, total: 0, error: "fetchFailed" };
  }
}

export async function selectOrganization(
  _: SelectOrgState,
  formData: FormData,
): Promise<SelectOrgState> {
  const organizationId = formData.get("organizationId") as string;
  if (!organizationId) return { status: "failed", message: "noOrgId" };

  const loginToken = getLoginToken();
  if (!loginToken) return { status: "failed", message: "noLoginToken" };

  try {
    // Exchange login token for access token
    const exchangeResponse = await fetch(`/appgateway${imbraceExchangeAccessToken.api}`, {
      method: imbraceExchangeAccessToken.method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Access-Token": loginToken,
      },
      body: JSON.stringify({ organization_id: organizationId }),
    });

    if (!exchangeResponse.ok) return { status: "failed", message: "exchangeFailed" };

    const exchangeData = await exchangeResponse.json();
    const imbraceToken = exchangeData.token;

    // Store token and org in localStorage
    localStorage.setItem(IMBRACE_TOKEN_KEY, imbraceToken);
    localStorage.setItem(IMBRACE_ORG_ID_KEY, organizationId);

    // Find or create user in messagesuggestion backend
    await ensureChatUserId();

    // Clear login token
    setLoginToken(null);

    // Dispatch token update event so AuthProvider and ImbraceTokenHandler pick it up
    window.dispatchEvent(
      new CustomEvent("imbraceTokenUpdated", { detail: imbraceToken }),
    );

    return { status: "success" };
  } catch {
    return { status: "failed", message: "selectOrgFailed" };
  }
}

// ─── Organization switching (from chat actions) ───

export type SwitchOrgOrganization = {
  id: string;
  name: string;
  is_active: boolean;
};

export async function fetchAllOrganizations(
  accessToken: string,
): Promise<{ organizations: SwitchOrgOrganization[]; error?: string }> {
  try {
    const apiPath = imbraceGetAllOrganizations.api(true);
    const response = await fetch(`/appgateway${apiPath}`, {
      method: imbraceGetAllOrganizations.method,
      headers: { Accept: "application/json", "X-Access-Token": accessToken },
    });

    if (!response.ok) return { organizations: [], error: "fetchFailed" };

    const data = await response.json();
    const orgs: SwitchOrgOrganization[] = (data.data || []).sort(
      (a: SwitchOrgOrganization, b: SwitchOrgOrganization) => a.name.localeCompare(b.name),
    );
    return { organizations: orgs };
  } catch {
    return { organizations: [], error: "fetchFailed" };
  }
}

export async function switchOrganization(
  accessToken: string,
  organizationId: string,
): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    const response = await fetch(`/appgateway${imbraceExchangeAccessTokenWithAccessToken.api}`, {
      method: imbraceExchangeAccessTokenWithAccessToken.method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Access-Token": accessToken,
      },
      body: JSON.stringify({ organization_id: organizationId }),
    });

    if (!response.ok) return { success: false, error: "switchFailed" };

    const exchangeData = await response.json();
    const newToken = exchangeData.token;

    // Update localStorage
    localStorage.setItem(IMBRACE_TOKEN_KEY, newToken);
    localStorage.setItem(IMBRACE_ORG_ID_KEY, organizationId);

    window.dispatchEvent(
      new CustomEvent("imbraceTokenUpdated", { detail: newToken }),
    );

    return { success: true, token: newToken };
  } catch {
    return { success: false, error: "switchFailed" };
  }
}

// ─── Chat user id bootstrap ───

const CHAT_USER_ID_KEY = "chatUserId";

/**
 * Ensure the messagesuggestion chatUserId is cached in localStorage.
 *
 * Why: the chat transport sends `user_id` in every /ai-agent/v2/chat body, and
 * the server validates it as a UUID. If localStorage is empty (user landed
 * with an existing access token, never went through selectOrganization, or
 * findOrCreateUser failed previously), the request 500s with `Invalid uuid`.
 *
 * Returns the cached id, the freshly fetched id, or null if the lookup failed.
 * Caller must ensure an imbrace token is already set in localStorage.
 */
export async function ensureChatUserId(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const existing = window.localStorage.getItem(CHAT_USER_ID_KEY);
  if (existing) return existing;
  if (!window.localStorage.getItem(IMBRACE_TOKEN_KEY)) return null;
  try {
    const { getClientApi } = await import("@/lib/api/clientApi");
    const user = await getClientApi().findOrCreateUser();
    if (user?.id) {
      window.localStorage.setItem(CHAT_USER_ID_KEY, user.id);
      return user.id;
    }
    return null;
  } catch (e) {
    console.warn("[auth] ensureChatUserId failed:", e);
    return null;
  }
}
