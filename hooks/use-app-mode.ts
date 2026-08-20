"use client";

import { useSyncExternalStore } from "react";
import {
  type AppMode,
  APP_MODE_KEY,
  AGENT_DEMO_AGENT_ID_KEY,
  AGENT_DEMO_EXPANDABLE_KEY,
} from "@/lib/imbrace/constants";

type AppModeState = {
  mode: AppMode;
  agentDemoAgentId: string | null;
  expandable: boolean;
};

// Cached snapshot — only replaced when values change
const SERVER_SNAPSHOT: AppModeState = { mode: "manual", agentDemoAgentId: null, expandable: false };
let cachedSnapshot: AppModeState = SERVER_SNAPSHOT;

function getSnapshot(): AppModeState {
  if (typeof window === "undefined") {
    return SERVER_SNAPSHOT;
  }
  const mode = (window.localStorage.getItem(APP_MODE_KEY) as AppMode) || "manual";
  const agentDemoAgentId = window.localStorage.getItem(AGENT_DEMO_AGENT_ID_KEY);
  const expandable = window.localStorage.getItem(AGENT_DEMO_EXPANDABLE_KEY) === "true";

  // Return same reference if values unchanged
  if (
    cachedSnapshot.mode === mode &&
    cachedSnapshot.agentDemoAgentId === agentDemoAgentId &&
    cachedSnapshot.expandable === expandable
  ) {
    return cachedSnapshot;
  }

  cachedSnapshot = { mode, agentDemoAgentId, expandable };
  return cachedSnapshot;
}

function getServerSnapshot(): AppModeState {
  return SERVER_SNAPSHOT;
}

// Re-read on storage events (cross-tab) and custom event (same-tab)
const APP_MODE_CHANGED_EVENT = "appModeChanged";

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(APP_MODE_CHANGED_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(APP_MODE_CHANGED_EVENT, callback);
  };
}

export function useAppMode(): AppModeState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Call after writing mode to localStorage to trigger re-renders */
export function notifyAppModeChanged() {
  window.dispatchEvent(new Event(APP_MODE_CHANGED_EVENT));
}
