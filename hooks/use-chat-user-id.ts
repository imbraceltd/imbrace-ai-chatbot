"use client";

import { useEffect, useState } from "react";
import { ensureChatUserId } from "@/lib/auth/api";

const CHAT_USER_ID_KEY = "chatUserId";

/**
 * Read the cached chatUserId from localStorage; if absent, lazy-fetch it via
 * findOrCreateUser. Falls back to "" until the fetch resolves.
 *
 * ImbraceTokenHandler also primes this on auth, but pages may mount before it
 * finishes, and users who bypass selectOrganization (URL token, page reload)
 * have no other code path that sets the value.
 */
export function useChatUserId(): string {
  const [userId, setUserId] = useState<string>(() =>
    typeof window !== "undefined"
      ? window.localStorage.getItem(CHAT_USER_ID_KEY) ?? ""
      : "",
  );

  useEffect(() => {
    if (userId) return;
    let cancelled = false;
    void ensureChatUserId().then((id) => {
      if (!cancelled && id) setUserId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return userId;
}
