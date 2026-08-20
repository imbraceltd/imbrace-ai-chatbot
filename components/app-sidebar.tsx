"use client";

import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { toast } from "sonner";
import { PlusIcon, TrashIcon } from "@/components/icons";
import { useChatHistoryStore } from "@/hooks/use-chat-history-store";
import { SidebarHistory } from "@/components/sidebar-history";
import { SidebarUserNav } from "@/components/sidebar-user-nav";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { useTranslation } from "@/lib/i18n/client";
import { IMBRACE_ORG_ID_KEY } from "@/lib/imbrace/constants";
import { useAppMode } from "@/hooks/use-app-mode";
import { getClientApi } from "@/lib/api/clientApi";

export function AppSidebar({ user }: { user?: { email?: string | null } | null }) {
  const navigate = useNavigate();
  const { setOpenMobile } = useSidebar();
  const { t } = useTranslation("");
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const { refresh } = useChatHistoryStore();
  const { mode } = useAppMode();
  const isAgentDemo = mode === "agentDemo";

  if (isAgentDemo) return null;

  const handleDeleteAll = () => {
    const orgId = typeof window !== "undefined" ? localStorage.getItem(IMBRACE_ORG_ID_KEY) : null;
    const deletePromise = getClientApi().deleteAllChats(orgId);

    toast.promise(deletePromise, {
      loading: t("Sidebar.deleting"),
      success: () => {
        void refresh();
        navigate("/");
        setShowDeleteAllDialog(false);
        return t("Sidebar.deleteSuccess");
      },
      error: t("Sidebar.deleteError"),
    });
  };

  return (
    <>
      <Sidebar className="group-data-[side=left]:border-r-0">
        <SidebarHeader>
          <SidebarMenu>
            <div className="flex flex-row items-center justify-between">
              <Link
                className="flex flex-row items-center gap-3"
                to="/"
                onClick={() => {
                  setOpenMobile(false);
                }}
              >
                <span className="cursor-pointer rounded-md px-2 font-semibold text-lg hover:bg-muted">
                  {t("Common.appName")}
                </span>
              </Link>
              <div className="flex flex-row gap-1">
                {user && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        className="h-8 p-1 md:h-fit md:p-2"
                        onClick={() => setShowDeleteAllDialog(true)}
                        type="button"
                        variant="ghost"
                      >
                        <TrashIcon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent align="end" className="hidden md:block">
                      {t("Sidebar.deleteAll")}
                    </TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      className="h-8 p-1 md:h-fit md:p-2"
                      onClick={() => {
                        setOpenMobile(false);
                        navigate("/");
                      }}
                      type="button"
                      variant="ghost"
                    >
                      <PlusIcon />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent align="end" className="hidden md:block">
                    {t("Sidebar.newChat")}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarHistory user={user} />
        </SidebarContent>
        <SidebarFooter>{user && <SidebarUserNav user={user} />}</SidebarFooter>
      </Sidebar>

      <AlertDialog onOpenChange={setShowDeleteAllDialog} open={showDeleteAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Sidebar.deleteAllTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Sidebar.deleteAllDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Sidebar.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAll}>
              {t("Sidebar.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
