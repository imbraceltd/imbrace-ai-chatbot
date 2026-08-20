"use client";

import { useEffect, useRef } from "react";
import {
  IMBRACE_ORG_ID_COOKIE,
  IMBRACE_ORG_ID_KEY,
  IMBRACE_TOKEN_COOKIE,
  IMBRACE_TOKEN_KEY,
  IMBRACE_TOKEN_UPDATED_EVENT,
  APP_MODE_KEY,
  AGENT_DEMO_AGENT_ID_KEY,
  AGENT_DEMO_EXPANDABLE_KEY,
  IMBRACE_BOARD_ID_KEY,
  IMBRACE_BOARD_SCOPE_DISMISSED_KEY,
} from "@/lib/imbrace/constants";
import { notifyAppModeChanged } from "@/hooks/use-app-mode";
import { useAgentStore } from "@/hooks/use-agent-store";
import { useTranslation } from "@/lib/i18n/client";
import { useSearchParams } from "react-router-dom";
import { ensureChatUserId } from "@/lib/auth/api";

// Helper to get cookie value
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

// Helper to delete cookie
function deleteCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

// Helper to clear all imbrace-related localStorage
function clearImbraceLocalStorage() {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(IMBRACE_TOKEN_KEY);
  window.localStorage.removeItem(IMBRACE_ORG_ID_KEY);
  window.localStorage.removeItem(APP_MODE_KEY);
  window.localStorage.removeItem(AGENT_DEMO_AGENT_ID_KEY);
  window.localStorage.removeItem(AGENT_DEMO_EXPANDABLE_KEY);
  window.localStorage.removeItem(IMBRACE_BOARD_ID_KEY);
  window.localStorage.removeItem(IMBRACE_BOARD_SCOPE_DISMISSED_KEY);

  console.log("[ImbraceTokenHandler] Cleared imbrace localStorage");
}

// Helper to clear all client-accessible auth-related cookies
function clearClientCookies() {
  if (typeof document === "undefined") return;

  // Only clear cookies that are NOT httpOnly (client-accessible)
  const cookiesToClear = [
    IMBRACE_TOKEN_COOKIE,
    IMBRACE_ORG_ID_COOKIE,
  ];

  for (const name of cookiesToClear) {
    deleteCookie(name);
  }

  console.log("[ImbraceTokenHandler] Cleared client cookies");
}

export function ImbraceTokenHandler() {
  const { fetchAgents, reset: resetAgentStore, selectAgentByAssistantId } = useAgentStore();
  const { i18n } = useTranslation("");
  const [searchParams] = useSearchParams();

  // Use ref to prevent duplicate fetches
  const hasInitialized = useRef(false);
  // Track whether we've already applied the URL lang param (only do it once)
  const hasAppliedUrlLang = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateLanguage = (lang: string | null, source: string) => {
      const validLanguages = ["en", "cn", "zh"];
      if (lang && validLanguages.includes(lang)) {
        if (i18n.language !== lang) {
          console.log(`[ImbraceTokenHandler] Language update from ${source}:`, lang);
          i18n.changeLanguage(lang);
        }
      }
    };

    if (!hasAppliedUrlLang.current) {
      hasAppliedUrlLang.current = true;
      const urlLang = searchParams.get("lang");
      updateLanguage(urlLang, "URL");

      // Clean lang from URL to prevent LanguageDetector from re-reading it
      if (urlLang) {
        const url = new URL(window.location.href);
        url.searchParams.delete("lang");
        window.history.replaceState({}, "", url.toString());
      }
    }

    // Handle postMessage for language updates
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.action === "SET_LANGUAGE" && event.data?.data?.language) {
        updateLanguage(event.data.data.language, "postMessage");
      }
    };

    window.addEventListener("message", handleMessage);

    // Prevent running auth initialization multiple times
    if (hasInitialized.current) {
      return () => window.removeEventListener("message", handleMessage);
    }

    // Step 1a: Read token directly from URL (SSO entry from parent app).
    // Reason: legacy Next.js middleware used to consume `?imbraceToken=…` and
    // bridge it into the `imbrace-token-pending` cookie before redirecting.
    // After the CSR migration, that middleware is gone, so the handler itself
    // must accept URL params as a credential source.
    const urlToken = searchParams.get("imbraceToken");
    const urlOrgId = searchParams.get("organizationId");

    // Step 1b: Read pending auth cookies (legacy server-set bridge)
    const pendingToken = urlToken ?? getCookie(IMBRACE_TOKEN_COOKIE);
    const pendingOrgId = urlOrgId ?? getCookie(IMBRACE_ORG_ID_COOKIE);

    // Step 2: Check existing localStorage token
    const existingToken = window.localStorage.getItem(IMBRACE_TOKEN_KEY);

    console.log("[ImbraceTokenHandler] Auth state:", {
      hasUrlToken: Boolean(urlToken),
      hasPendingToken: Boolean(pendingToken),
      hasPendingOrgId: Boolean(pendingOrgId),
      hasExistingToken: Boolean(existingToken),
    });

    // Case 1: Fresh authentication (pending cookies from auth redirect)
    if (pendingToken) {
      hasInitialized.current = true;
      console.log("[ImbraceTokenHandler] Fresh authentication detected");

      // Clear old data first
      clearImbraceLocalStorage();
      clearClientCookies();
      resetAgentStore();

      const orgId = pendingOrgId || searchParams.get("organizationId");

      // Reason: parent app passes an SSO JWT (eyJ…) in the URL. The rest of the
      // codebase expects an `acc_*` access token — webapp-backed endpoints reject
      // raw JWTs ("Unauthorized - Invalid JWT"). Exchange ONCE here so every
      // consumer sees a uniform `acc_*` value.
      const exchangeJwtForAccessToken = async (): Promise<string> => {
        if (!pendingToken.startsWith("eyJ") || !orgId) return pendingToken;
        try {
          const exchangeResp = await fetch(
            "/appgateway/platform/v1/access/_exchange_access_token",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${pendingToken}`,
                "Content-Type": "application/json",
                Accept: "application/json",
                "X-Access-Token": pendingToken,
                "x-organization-id": orgId,
              },
              body: JSON.stringify({ organization_id: orgId }),
              cache: "no-store",
            }
          );
          if (!exchangeResp.ok) {
            console.warn(
              "[ImbraceTokenHandler] JWT→acc_* exchange failed, using raw JWT",
              exchangeResp.status
            );
            return pendingToken;
          }
          const data = await exchangeResp.json();
          if (typeof data?.token === "string" && data.token) {
            console.log(
              "[ImbraceTokenHandler] Exchanged JWT for acc_*",
              data.token.slice(0, 8)
            );
            return data.token;
          }
          return pendingToken;
        } catch (err) {
          console.warn(
            "[ImbraceTokenHandler] JWT→acc_* exchange error, using raw JWT",
            err
          );
          return pendingToken;
        }
      };

      // Run exchange synchronously inside the effect (await via IIFE)
      void (async () => {
        const storedToken = await exchangeJwtForAccessToken();

        // Save new credentials
        window.localStorage.setItem(IMBRACE_TOKEN_KEY, storedToken);
        console.log("[ImbraceTokenHandler] Imbrace token saved to localStorage");

        if (orgId) {
          window.localStorage.setItem(IMBRACE_ORG_ID_KEY, orgId);
          console.log("[ImbraceTokenHandler] Imbrace organization_id saved to localStorage");
        }

        // Reason: scope chat to a specific databoard when ?databoardId=… is
        // in the URL. The chat transport sends this id with every request and
        // the server locks databoard tools to it. A fresh URL scope also
        // clears the "dismissed" flag — re-engaging scope automatically.
        const databoardId = searchParams.get("databoardId");
        if (databoardId) {
          window.localStorage.setItem(IMBRACE_BOARD_ID_KEY, databoardId);
          window.localStorage.removeItem(IMBRACE_BOARD_SCOPE_DISMISSED_KEY);
          console.log(
            "[ImbraceTokenHandler] Databoard scope saved:",
            databoardId,
          );
        } else {
          window.localStorage.removeItem(IMBRACE_BOARD_ID_KEY);
          window.localStorage.removeItem(IMBRACE_BOARD_SCOPE_DISMISSED_KEY);
        }

        // Notify listeners with the FINAL (post-exchange) token
        window.dispatchEvent(
          new CustomEvent(IMBRACE_TOKEN_UPDATED_EVENT, { detail: storedToken })
        );

        // Prime chatUserId so /v2/chat requests carry a valid uuid. Runs in
        // parallel with agents fetch — pages also lazy-fetch as a fallback.
        void ensureChatUserId();

        // Now fetch base data (agents list)
        console.log("[ImbraceTokenHandler] Fetching base data after authentication...");
        const agents = await fetchAgents();
        console.log("[ImbraceTokenHandler] Base data fetched, agents count:", agents.length);

        // Auto-select agent in agentDemo mode
        const demoAgentIdLocal = searchParams.get("agentId");
        if (demoAgentIdLocal) {
          selectAgentByAssistantId(demoAgentIdLocal, agents);
          console.log("[ImbraceTokenHandler] Auto-selected agent:", demoAgentIdLocal);
        }
      })();

      // Detect and save app mode from URL params
      // agentId alone is enough to enter agentDemo mode
      // isAgentDemo=true controls whether the expand icon is shown
      const isInsightsIQ = searchParams.get("isInsightsIQ") === "true";
      const isAgentDemo = searchParams.get("isAgentDemo") === "true";
      const demoAgentId = searchParams.get("agentId");

      if (demoAgentId) {
        window.localStorage.setItem(APP_MODE_KEY, "agentDemo");
        window.localStorage.setItem(AGENT_DEMO_AGENT_ID_KEY, demoAgentId);
        if (isAgentDemo) {
          window.localStorage.setItem(AGENT_DEMO_EXPANDABLE_KEY, "true");
        } else {
          window.localStorage.removeItem(AGENT_DEMO_EXPANDABLE_KEY);
        }
        console.log("[ImbraceTokenHandler] Mode: agentDemo, agentId:", demoAgentId, "expandable:", isAgentDemo);
      } else if (isInsightsIQ) {
        window.localStorage.setItem(APP_MODE_KEY, "insightsIQ");
        window.localStorage.removeItem(AGENT_DEMO_AGENT_ID_KEY);
        window.localStorage.removeItem(AGENT_DEMO_EXPANDABLE_KEY);
        console.log("[ImbraceTokenHandler] Mode: insightsIQ");
      } else {
        window.localStorage.setItem(APP_MODE_KEY, "manual");
        window.localStorage.removeItem(AGENT_DEMO_AGENT_ID_KEY);
        window.localStorage.removeItem(AGENT_DEMO_EXPANDABLE_KEY);
        console.log("[ImbraceTokenHandler] Mode: manual");
      }
      notifyAppModeChanged();

      // Clean auth + mode params from URL (token must not stay in address bar)
      const urlToClean = new URL(window.location.href);
      for (const key of [
        "imbraceToken",
        "isInsightsIQ",
        "isAgentDemo",
        "agentId",
        "organizationId",
        "databoardId",
      ]) {
        urlToClean.searchParams.delete(key);
      }
      window.history.replaceState({}, "", urlToClean.toString());

      return () => window.removeEventListener("message", handleMessage);
    }

    // Case 2: Page reload with existing token (no pending cookies)
    if (existingToken) {
      hasInitialized.current = true;
      console.log("[ImbraceTokenHandler] Existing token found, fetching agents...");

      // Reason: Reconcile the databoard scope from the URL on every reload
      // — if the user lands on `/` without `?databoardId=…`, drop any stale
      // scope from localStorage so the agent isn't accidentally locked to
      // a previous board. When `databoardId` IS present, refresh it (URL
      // wins). The token-updated event below will trigger SWR re-key.
      const reloadDataboardId = searchParams.get("databoardId");
      if (reloadDataboardId) {
        window.localStorage.setItem(IMBRACE_BOARD_ID_KEY, reloadDataboardId);
        // Reason: a fresh URL scope re-engages — drop the dismissed flag.
        window.localStorage.removeItem(IMBRACE_BOARD_SCOPE_DISMISSED_KEY);
        const urlToClean = new URL(window.location.href);
        urlToClean.searchParams.delete("databoardId");
        window.history.replaceState({}, "", urlToClean.toString());
        console.log(
          "[ImbraceTokenHandler] Databoard scope refreshed on reload:",
          reloadDataboardId,
        );
      } else if (window.localStorage.getItem(IMBRACE_BOARD_ID_KEY)) {
        window.localStorage.removeItem(IMBRACE_BOARD_ID_KEY);
        window.localStorage.removeItem(IMBRACE_BOARD_SCOPE_DISMISSED_KEY);
        console.log(
          "[ImbraceTokenHandler] Cleared stale databoard scope (no ?databoardId= in URL)",
        );
      }

      // Reason: legacy sessions may have stored a raw SSO JWT (eyJ…) before the
      // exchange step was added. webapp endpoints reject JWTs, so upgrade to
      // acc_* once on reload if needed.
      const upgradeIfJwt = async (): Promise<string> => {
        if (!existingToken.startsWith("eyJ")) return existingToken;
        const storedOrgId = window.localStorage.getItem(IMBRACE_ORG_ID_KEY);
        if (!storedOrgId) return existingToken;
        try {
          const exchangeResp = await fetch(
            "/appgateway/platform/v1/access/_exchange_access_token",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${existingToken}`,
                "Content-Type": "application/json",
                Accept: "application/json",
                "X-Access-Token": existingToken,
                "x-organization-id": storedOrgId,
              },
              body: JSON.stringify({ organization_id: storedOrgId }),
              cache: "no-store",
            }
          );
          if (!exchangeResp.ok) {
            console.warn(
              "[ImbraceTokenHandler] JWT→acc_* upgrade failed",
              exchangeResp.status
            );
            return existingToken;
          }
          const data = await exchangeResp.json();
          if (typeof data?.token === "string" && data.token) {
            window.localStorage.setItem(IMBRACE_TOKEN_KEY, data.token);
            console.log(
              "[ImbraceTokenHandler] Upgraded JWT to acc_*",
              data.token.slice(0, 8)
            );
            return data.token;
          }
          return existingToken;
        } catch (err) {
          console.warn("[ImbraceTokenHandler] JWT→acc_* upgrade error", err);
          return existingToken;
        }
      };

      void (async () => {
        const finalToken = await upgradeIfJwt();

        // Prime chatUserId so /v2/chat requests carry a valid uuid. The user
        // may have an access token already (URL hand-off, reload) without
        // having gone through selectOrganization, which is the only other
        // code path that sets this key.
        void ensureChatUserId();

        const agents = await fetchAgents();
        console.log("[ImbraceTokenHandler] Agents fetched on reload, count:", agents.length);

        // Auto-select agent if in agentDemo mode
        const storedAgentId = window.localStorage.getItem(AGENT_DEMO_AGENT_ID_KEY);
        if (storedAgentId) {
          selectAgentByAssistantId(storedAgentId, agents);
          console.log("[ImbraceTokenHandler] Auto-selected agent on reload:", storedAgentId);
        }

        // Notify listeners with the (possibly upgraded) token
        window.dispatchEvent(
          new CustomEvent(IMBRACE_TOKEN_UPDATED_EVENT, { detail: finalToken })
        );
      })();
      return () => window.removeEventListener("message", handleMessage);
    }

    // Case 3: No token at all - user not authenticated
    // Do NOT set hasInitialized here so the effect can re-run after auth completes
    console.log("[ImbraceTokenHandler] No token available - user needs to authenticate");

    return () => window.removeEventListener("message", handleMessage);
  }, [fetchAgents, resetAgentStore, selectAgentByAssistantId, i18n, searchParams]);

  return null;
}
