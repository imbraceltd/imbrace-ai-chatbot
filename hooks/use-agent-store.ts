"use client";

import { useCallback, useMemo } from "react";
import useSWR from "swr";
import { IMBRACE_TOKEN_KEY, IMBRACE_ORG_ID_KEY } from "@/lib/imbrace/constants";

export type ImbraceAgent = {
  _id: string;
  title: string;
  short_description: string;
  assistant_id: string;
  channel_id: string;
  organization_id: string;
  agent_type: string;
  core_task: string;
  metadata?: {
    enable_echart?: boolean;
    is_scb?: boolean;
    [key: string]: unknown;
  };
};

export type AgentStoreState = {
  agents: ImbraceAgent[];
  selectedAgent: ImbraceAgent | null;
  isLoading: boolean;
  error: string | null;
  hasFetched: boolean;
};

export const initialAgentStoreState: AgentStoreState = {
  agents: [],
  selectedAgent: null,
  isLoading: false,
  error: null,
  hasFetched: false,
};

type Selector<T> = (state: AgentStoreState) => T;

export function useAgentStoreSelector<Selected>(selector: Selector<Selected>) {
  const { data: localState } = useSWR<AgentStoreState>("agent-store", null, {
    fallbackData: initialAgentStoreState,
  });

  const selectedValue = useMemo(() => {
    if (!localState) {
      return selector(initialAgentStoreState);
    }
    return selector(localState);
  }, [localState, selector]);

  return selectedValue;
}

export function useAgentStore() {
  const { data: localState, mutate: setLocalState } = useSWR<AgentStoreState>(
    "agent-store",
    null,
    {
      fallbackData: initialAgentStoreState,
    }
  );

  const state = useMemo(() => {
    if (!localState) {
      return initialAgentStoreState;
    }
    return localState;
  }, [localState]);

  const setState = useCallback(
    (
      updaterFn: AgentStoreState | ((current: AgentStoreState) => AgentStoreState)
    ) => {
      setLocalState((currentState) => {
        const stateToUpdate = currentState ?? initialAgentStoreState;

        if (typeof updaterFn === "function") {
          return updaterFn(stateToUpdate);
        }

        return updaterFn;
      });
    },
    [setLocalState]
  );

  const setAgents = useCallback(
    (agents: ImbraceAgent[]) => {
      setState((current) => ({
        ...current,
        agents,
        hasFetched: true,
      }));
    },
    [setState]
  );

  const setSelectedAgent = useCallback(
    (agent: ImbraceAgent | null) => {
      setState((current) => ({
        ...current,
        selectedAgent: agent,
      }));
    },
    [setState]
  );

  const setLoading = useCallback(
    (isLoading: boolean) => {
      setState((current) => ({
        ...current,
        isLoading,
      }));
    },
    [setState]
  );

  const setError = useCallback(
    (error: string | null) => {
      setState((current) => ({
        ...current,
        error,
        isLoading: false,
      }));
    },
    [setState]
  );

  const reset = useCallback(() => {
    setState(initialAgentStoreState);
  }, [setState]);

  // Fetch agents from API
  const fetchAgents = useCallback(async (): Promise<ImbraceAgent[]> => {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem(IMBRACE_TOKEN_KEY) ?? ""
        : "";

    if (!token) {
      console.log("[AgentStore] No token available, skipping fetch");
      return [];
    }

    setState((current) => ({
      ...current,
      isLoading: true,
      error: null,
    }));

    const organizationId =
      typeof window !== "undefined"
        ? localStorage.getItem(IMBRACE_ORG_ID_KEY) ?? ""
        : "";

    const isJwt = token.startsWith("eyJ");
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-Access-Token": token,
      "Cache-Control": "no-cache, no-store, must-revalidate",
    };
    if (isJwt) headers["Authorization"] = `Bearer ${token}`;
    if (organizationId) headers["x-organization-id"] = organizationId;

    try {
      // Reason: must route via app-gateway (handles JWT auth) rather than
      // webapp directly. Path on develop is /v3/marketplaces/use-cases
      // (the legacy /api/v2/backend/templates was removed from app-gateway).
      const response = await fetch("/appgateway/v3/marketplaces/use-cases", {
        headers,
      });

      if (!response.ok) {
        throw new Error("Failed to fetch agents");
      }

      const data = await response.json();
      const agents: ImbraceAgent[] = data.data ?? [];

      setState((current) => ({
        ...current,
        agents,
        isLoading: false,
        hasFetched: true,
      }));

      console.log("[AgentStore] Fetched agents:", agents.length);
      return agents;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to fetch agents";
      setState((current) => ({
        ...current,
        isLoading: false,
        error: errorMessage,
        hasFetched: true,
      }));
      console.error("[AgentStore] Error fetching agents:", errorMessage);
      return [];
    }
  }, [setState]);

  // Select agent by assistant_id
  // Optionally accepts an agents array to avoid stale closure issues
  const selectAgentByAssistantId = useCallback(
    (assistantId: string | null, agentsList?: ImbraceAgent[]) => {
      if (!assistantId) {
        setSelectedAgent(null);
        return;
      }

      const agents = agentsList ?? state.agents;
      const agent = agents.find((a) => a.assistant_id === assistantId);
      if (agent) {
        setSelectedAgent(agent);
      }
    },
    [state.agents, setSelectedAgent]
  );

  return useMemo(
    () => ({
      state,
      setState,
      setAgents,
      setSelectedAgent,
      setLoading,
      setError,
      reset,
      fetchAgents,
      selectAgentByAssistantId,
      // Convenience getters
      agents: state.agents,
      selectedAgent: state.selectedAgent,
      isLoading: state.isLoading,
      error: state.error,
      hasFetched: state.hasFetched,
    }),
    [
      state,
      setState,
      setAgents,
      setSelectedAgent,
      setLoading,
      setError,
      reset,
      fetchAgents,
      selectAgentByAssistantId,
    ]
  );
}

