/**
 * Select organization page – CSR equivalent of app/(auth)/select-org/page.tsx
 */

import { useNavigate } from "react-router-dom";
import { useActionState, useCallback, useEffect, useRef, useState, startTransition } from "react";

import { LoaderIcon } from "@/components/icons";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/client";

import {
  type Organization,
  type SelectOrgState,
  fetchOrganizations,
  selectOrganization,
} from "@/lib/auth/api";

const PAGE_LIMIT = 10;

export default function SelectOrgPage() {
  const navigate = useNavigate();
  const { t } = useTranslation("");

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [skip, setSkip] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [selectState, selectAction] = useActionState<SelectOrgState, FormData>(
    selectOrganization,
    { status: "idle" },
  );

  const loadOrganizations = useCallback(
    async (currentSkip: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);

      const result = await fetchOrganizations(PAGE_LIMIT, currentSkip);

      if (append) setLoadingMore(false);
      else setLoading(false);

      if (result.error) {
        if (result.error === "noLoginToken") { navigate("/login", { replace: true }); return; }
        setError(result.error);
        return;
      }

      setOrganizations((prev) => {
        const newOrgs = append ? [...prev, ...result.organizations] : result.organizations;
        return [...newOrgs].sort((a, b) => a.name.localeCompare(b.name));
      });
      setHasMore(result.hasMore);
      setSkip(currentSkip + PAGE_LIMIT);
    },
    [navigate],
  );

  useEffect(() => { loadOrganizations(0, false); }, [loadOrganizations]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || loadingMore || !hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollTop + clientHeight >= scrollHeight - 20) loadOrganizations(skip, true);
  }, [loadingMore, hasMore, skip, loadOrganizations]);

  useEffect(() => {
    if (loading || loadingMore || !hasMore) return;
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight) loadOrganizations(skip, true);
  }, [loading, loadingMore, hasMore, skip, loadOrganizations, organizations]);

  useEffect(() => {
    if (!selectState) return;
    if (selectState.status === "success") {
      navigate("/");
    } else if (selectState.status === "failed") {
      toast({
        type: "error",
        description:
          selectState.message === "noLoginToken"
            ? t("Auth.sessionExpired")
            : t("Auth.selectOrgFailed"),
      });
      if (selectState.message === "noLoginToken") navigate("/login", { replace: true });
    }
  }, [selectState?.status, selectState?.message, navigate, t]);

  const handleSelectOrg = (orgId: string) => {
    const formData = new FormData();
    formData.set("organizationId", orgId);
    startTransition(() => selectAction(formData));
  };

  const isSelecting = selectState?.status === "in_progress";

  return (
    <div className="flex h-dvh w-screen items-start justify-center overflow-hidden bg-background pt-12 md:items-center md:pt-0">
      <div className="flex w-full max-w-md flex-col gap-8 rounded-2xl min-h-0">
        <div className="flex flex-col items-center justify-center gap-2 px-4 text-center sm:px-16">
          <h3 className="font-semibold text-xl dark:text-zinc-50">{t("Auth.selectOrganization")}</h3>
          <p className="text-gray-500 text-sm dark:text-zinc-400">{t("Auth.selectOrgSubtext")}</p>
        </div>

        <div className="flex flex-col gap-3 px-4 sm:px-16 min-h-0">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <span className="animate-spin"><LoaderIcon /></span>
              <span className="ml-2 text-sm text-muted-foreground">{t("Auth.loadingOrgs")}</span>
            </div>
          )}

          {error && !loading && (
            <p className="text-center text-sm text-destructive">{t("Auth.fetchOrgsFailed")}</p>
          )}

          {!loading && !error && organizations.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">{t("Auth.noOrganizations")}</p>
          )}

          {!loading && !error && organizations.length > 0 && (
            <div
              ref={scrollRef}
              className="-mx-1 max-h-[300px] overflow-y-auto overscroll-contain px-1"
              onScroll={handleScroll}
            >
              <div className="flex flex-col gap-2">
                {organizations.map((org) => (
                  <Button
                    key={org.id}
                    variant="outline"
                    className="w-full justify-start text-left shrink-0"
                    disabled={isSelecting}
                    onClick={() => handleSelectOrg(org.id)}
                  >
                    {org.name}
                  </Button>
                ))}
                {loadingMore && (
                  <div className="flex items-center justify-center py-2 shrink-0">
                    <span className="animate-spin"><LoaderIcon /></span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mt-4 border-t pt-4">
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => navigate("/login")}
              disabled={isSelecting}
            >
              {t("Auth.loginWithAnotherAccount")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
