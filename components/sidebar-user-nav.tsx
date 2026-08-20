"use client";

import { Building2, ChevronUp, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth, useSession } from "@/lib/auth/context";
import { useTheme } from "next-themes";
import { useCallback, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { LoaderIcon } from "./icons";
import { toast } from "./toast";
import { useTranslation } from "@/lib/i18n/client";
import {
  type SwitchOrgOrganization,
  fetchAllOrganizations,
  switchOrganization,
} from "@/lib/auth/api";
import {
  IMBRACE_ORG_ID_KEY,
  IMBRACE_TOKEN_KEY,
  IMBRACE_TOKEN_UPDATED_EVENT,
} from "@/lib/imbrace/constants";
import { useAgentStore } from "@/hooks/use-agent-store";
import { useAppMode } from "@/hooks/use-app-mode";

export function SidebarUserNav({ user }: { user?: { email?: string | null } | null }) {
  const navigate = useNavigate();
  const { signOut: authSignOut } = useAuth();
  const { status, update: updateSession } = useSession();
  const { setTheme, resolvedTheme } = useTheme();
  const { t } = useTranslation("");
  const { fetchAgents, reset: resetAgentStore } = useAgentStore();
  const { mode } = useAppMode();
  const showFullMenu = mode === "manual";

  const [orgs, setOrgs] = useState<SwitchOrgOrganization[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [orgsLoaded, setOrgsLoaded] = useState(false);
  const [switching, setSwitching] = useState(false);

  const currentOrgId =
    typeof window !== "undefined"
      ? window.localStorage.getItem(IMBRACE_ORG_ID_KEY)
      : null;

  const loadOrgs = useCallback(async () => {
    if (orgsLoaded || orgsLoading) return;
    setOrgsLoading(true);
    const token = window.localStorage.getItem(IMBRACE_TOKEN_KEY);
    if (!token) {
      setOrgsLoading(false);
      return;
    }
    const result = await fetchAllOrganizations(token);
    setOrgs(result.organizations);
    setOrgsLoaded(true);
    setOrgsLoading(false);
  }, [orgsLoaded, orgsLoading]);

  const handleSwitchOrg = async (orgId: string) => {
    if (switching || orgId === currentOrgId) return;
    setSwitching(true);

    const token = window.localStorage.getItem(IMBRACE_TOKEN_KEY);
    if (!token) {
      setSwitching(false);
      toast({ type: "error", description: t("Auth.sessionExpired") });
      return;
    }

    console.log("[SwitchOrg] Calling switchOrganization server action...", { orgId });
    const result = await switchOrganization(token, orgId);
    console.log("[SwitchOrg] Server action result:", result);

    if (result.success && result.token) {
      // Update localStorage with new token and org
      window.localStorage.setItem(IMBRACE_TOKEN_KEY, result.token);
      window.localStorage.setItem(IMBRACE_ORG_ID_KEY, orgId);
      console.log("[SwitchOrg] localStorage updated", {
        token: result.token.slice(0, 20) + "...",
        orgId,
      });

      // Reset and re-fetch agents for new org
      console.log("[SwitchOrg] Resetting agent store...");
      resetAgentStore();
      console.log("[SwitchOrg] Fetching agents for new org...");
      const agents = await fetchAgents();
      console.log("[SwitchOrg] Agents fetched:", agents.length);

      // Notify sidebar-history and other listeners to refresh
      console.log("[SwitchOrg] Dispatching IMBRACE_TOKEN_UPDATED_EVENT...");
      window.dispatchEvent(
        new CustomEvent(IMBRACE_TOKEN_UPDATED_EVENT, { detail: result.token })
      );

      console.log("[SwitchOrg] Updating session...");
      updateSession();
      console.log("[SwitchOrg] Session updated, navigating to /");
      setSwitching(false);
      setOrgsLoaded(false);
      navigate("/");
      window.location.reload();
    } else {
      console.error("[SwitchOrg] Failed:", result);
      setSwitching(false);
      toast({ type: "error", description: t("Auth.switchOrgFailed") });
    }
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {status === "loading" ? (
              <SidebarMenuButton className="h-10 justify-between bg-background data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                <div className="flex flex-row gap-2">
                  <div className="size-6 animate-pulse rounded-full bg-zinc-500/30" />
                  <span className="animate-pulse rounded-md bg-zinc-500/30 text-transparent">
                    {t("Auth.loadingAuthStatus", { defaultValue: "Loading auth status" })}
                  </span>
                </div>
                <div className="animate-spin text-zinc-500">
                  <LoaderIcon />
                </div>
              </SidebarMenuButton>
            ) : (
              <SidebarMenuButton
                className="h-10 bg-background data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                data-testid="user-nav-button"
              >
                <img
                  alt={user?.email ?? "User Avatar"}
                  className="rounded-full size-6"
                  src={`https://avatar.vercel.sh/${user?.email}`}
                />
                <span className="truncate" data-testid="user-email">
                  {user?.email}
                </span>
                <ChevronUp className="ml-auto" />
              </SidebarMenuButton>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-popper-anchor-width)"
            data-testid="user-nav-menu"
            side="top"
          >
            <DropdownMenuItem
              className="cursor-pointer"
              data-testid="user-nav-item-theme"
              onSelect={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              {resolvedTheme === "light" ? t("Theme.toggleDark") : t("Theme.toggleLight")}
            </DropdownMenuItem>
            {showFullMenu && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger
                    className="cursor-pointer"
                    onPointerEnter={loadOrgs}
                    onClick={loadOrgs}
                  >
                    <Building2 className="mr-2 size-4" />
                    {t("Auth.switchOrganization")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-[300px] overflow-y-auto">
                    {orgsLoading && (
                      <DropdownMenuItem disabled>
                        <span className="animate-spin mr-2">
                          <LoaderIcon />
                        </span>
                        {t("Auth.loadingOrgs")}
                      </DropdownMenuItem>
                    )}
                    {!orgsLoading && orgs.length === 0 && orgsLoaded && (
                      <DropdownMenuItem disabled>
                        {t("Auth.noOrganizations")}
                      </DropdownMenuItem>
                    )}
                    {orgs.map((org) => (
                      <DropdownMenuItem
                        key={org.id}
                        className="cursor-pointer"
                        disabled={switching}
                        onSelect={() => handleSwitchOrg(org.id)}
                      >
                        <span className="truncate">{org.name}</span>
                        {org.id === currentOrgId && (
                          <Check className="ml-auto size-4 shrink-0" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild data-testid="user-nav-item-auth">
                  <button
                    className="w-full cursor-pointer"
                    onClick={() => {
                      if (status === "loading") {
                        toast({
                          type: "error",
                          description: t("Auth.loadingAuthStatus", {
                            defaultValue:
                              "Checking authentication status, please try again!",
                          }),
                        });
                        return;
                      }

                      authSignOut();
                    }}
                    type="button"
                  >
                    {t("Auth.signOut")}
                  </button>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
