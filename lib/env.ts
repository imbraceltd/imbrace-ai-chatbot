/**
 * Client-side runtime config.
 *
 * Fetches `/config` (a JSON object) once at app load and merges into the `env`
 * object. The same JS bundle is reused across stages — only the `/config` file
 * on the static host differs per environment.
 *
 * Usage in components:
 *   import { env, envReady } from "@/lib/env";
 *   await envReady;
 *   const url = env.IMBRACE_NEXT_BEST_ACTION_URL;
 */

declare global {
  interface Window {
    readonly env?: ClientEnv;
  }
}

export interface ClientEnv {
  IMBRACE_BASE_URL: string;
  IMBRACE_APP_GATEWAY_URL: string;
  IMBRACE_NEXT_BEST_ACTION_URL: string;
  IMBRACE_WORKFLOW_DOMAIN: string;
}

export const env: ClientEnv = {
  IMBRACE_BASE_URL: "",
  IMBRACE_APP_GATEWAY_URL: "",
  IMBRACE_NEXT_BEST_ACTION_URL: "",
  IMBRACE_WORKFLOW_DOMAIN: "",
};

export const envReady: Promise<void> = (async () => {
  try {
    const response = await fetch("/config");
    if (!response.ok) return;
    Object.assign(env, await response.json());
  } catch {
    // Silently fail — env keeps default empty strings
  }

  if (typeof window !== "undefined") {
    Object.defineProperty(window, "env", {
      value: env,
      writable: false,
      configurable: false,
    });
  }
})();
