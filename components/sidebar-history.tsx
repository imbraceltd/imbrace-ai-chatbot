"use client";

import { isToday, isYesterday, subMonths, subWeeks } from "date-fns";
import { motion } from "framer-motion";
import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  useSidebar,
} from "@/components/ui/sidebar";
import type { Chat } from "@/lib/db/schema";
import { useChatHistoryStore } from "@/hooks/use-chat-history-store";
import { IMBRACE_ORG_ID_KEY, IMBRACE_TOKEN_UPDATED_EVENT } from "@/lib/imbrace/constants";
import { LoaderIcon } from "./icons";
import { ChatItem } from "./sidebar-history-item";
import { useTranslation } from "@/lib/i18n/client";
import { useAppMode } from "@/hooks/use-app-mode";

type GroupedChats = {
  today: Chat[];
  yesterday: Chat[];
  lastWeek: Chat[];
  lastMonth: Chat[];
  older: Chat[];
};

export type ChatHistory = {
  chats: Chat[];
  hasMore: boolean;
};

const groupChatsByDate = (chats: Chat[]): GroupedChats => {
  const now = new Date();
  const oneWeekAgo = subWeeks(now, 1);
  const oneMonthAgo = subMonths(now, 1);

  return chats.reduce(
    (groups, chat) => {
      const chatDate = new Date(chat.createdAt);

      if (isToday(chatDate)) {
        groups.today.push(chat);
      } else if (isYesterday(chatDate)) {
        groups.yesterday.push(chat);
      } else if (chatDate > oneWeekAgo) {
        groups.lastWeek.push(chat);
      } else if (chatDate > oneMonthAgo) {
        groups.lastMonth.push(chat);
      } else {
        groups.older.push(chat);
      }

      return groups;
    },
    {
      today: [],
      yesterday: [],
      lastWeek: [],
      lastMonth: [],
      older: [],
    } as GroupedChats
  );
};

export function SidebarHistory({ user }: { user?: { email?: string | null } | null }) {
  const { t } = useTranslation("");
  const { setOpenMobile } = useSidebar();
  const { id } = useParams();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const { chats: allChats, hasMore, isLoading, isLoadingMore, error, refresh, loadMore, setOrganizationId: setOrgInStore } =
    useChatHistoryStore();
  const { mode, agentDemoAgentId } = useAppMode();

  // Filter chats by agent in agentDemo mode
  const chats = useMemo(() => {
    if (mode === "agentDemo" && agentDemoAgentId) {
      return allChats.filter((chat) => chat.assistantId === agentDemoAgentId);
    }
    return allChats;
  }, [allChats, mode, agentDemoAgentId]);

  // Initialize organizationId and refresh history from start.
  useEffect(() => {
    const orgId =
      typeof window !== "undefined" ? localStorage.getItem(IMBRACE_ORG_ID_KEY) : null;
    setOrganizationId(orgId);
    setOrgInStore(orgId);
    void refresh({ organizationId: orgId });

    // Listen for token updates to refresh organizationId + history
    const handleTokenUpdate = () => {
      const newOrgId = localStorage.getItem(IMBRACE_ORG_ID_KEY);
      setOrganizationId(newOrgId);
      setOrgInStore(newOrgId);
      void refresh({ organizationId: newOrgId });
    };

    window.addEventListener(IMBRACE_TOKEN_UPDATED_EVENT, handleTokenUpdate);
    return () => {
      window.removeEventListener(IMBRACE_TOKEN_UPDATED_EVENT, handleTokenUpdate);
    };
  }, [refresh, setOrgInStore]);

  const navigate = useNavigate();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const hasReachedEnd = !hasMore;
  const hasEmptyChatHistory = chats.length === 0;

  const handleDelete = async () => {
    const { getClientApi } = await import("@/lib/api/clientApi");
    const deletePromise = getClientApi().deleteChat(deleteId!);

    toast.promise(deletePromise, {
      loading: t("Sidebar.deletingChat"),
      success: () => {
        void refresh({ organizationId });
        return t("Sidebar.deleteChatSuccess");
      },
      error: t("Sidebar.deleteChatError"),
    });

    setShowDeleteDialog(false);

    if (deleteId === id) {
      navigate("/");
    }
  };

  if (!user) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="flex w-full flex-row items-center justify-center gap-2 px-2 text-sm text-zinc-500">
            {t("Sidebar.loginToUseHistory")}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (isLoading) {
    return (
      <SidebarGroup>
        <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
          {t("Sidebar.today")}
        </div>
        <SidebarGroupContent>
          <div className="flex flex-col">
            {[44, 32, 28, 64, 52].map((item) => (
              <div
                className="flex h-8 items-center gap-2 rounded-md px-2"
                key={item}
              >
                <div
                  className="h-4 max-w-(--skeleton-width) flex-1 rounded-md bg-sidebar-accent-foreground/10"
                  style={
                    {
                      "--skeleton-width": `${item}%`,
                    } as React.CSSProperties
                  }
                />
              </div>
            ))}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (hasEmptyChatHistory) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="flex w-full flex-row items-center justify-center gap-2 px-2 text-sm text-zinc-500">
            {t("Sidebar.emptyHistory")}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (error) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="flex w-full flex-row items-center justify-center gap-2 px-2 text-sm text-zinc-500">
            {t("Sidebar.loadError")}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {(() => {
              const groupedChats = groupChatsByDate(chats);

              return (
                <div className="flex flex-col gap-6">
                  {groupedChats.today.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
                        {t("Sidebar.today")}
                      </div>
                      {groupedChats.today.map((chat) => (
                        <ChatItem
                          chat={chat}
                          isActive={chat.id === id}
                          key={chat.id}
                          onDelete={(chatId) => {
                            setDeleteId(chatId);
                            setShowDeleteDialog(true);
                          }}
                          setOpenMobile={setOpenMobile}
                        />
                      ))}
                    </div>
                  )}

                  {groupedChats.yesterday.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
                        {t("Sidebar.yesterday")}
                      </div>
                      {groupedChats.yesterday.map((chat) => (
                        <ChatItem
                          chat={chat}
                          isActive={chat.id === id}
                          key={chat.id}
                          onDelete={(chatId) => {
                            setDeleteId(chatId);
                            setShowDeleteDialog(true);
                          }}
                          setOpenMobile={setOpenMobile}
                        />
                      ))}
                    </div>
                  )}

                  {groupedChats.lastWeek.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
                        {t("Sidebar.last7Days")}
                      </div>
                      {groupedChats.lastWeek.map((chat) => (
                        <ChatItem
                          chat={chat}
                          isActive={chat.id === id}
                          key={chat.id}
                          onDelete={(chatId) => {
                            setDeleteId(chatId);
                            setShowDeleteDialog(true);
                          }}
                          setOpenMobile={setOpenMobile}
                        />
                      ))}
                    </div>
                  )}

                  {groupedChats.lastMonth.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
                        {t("Sidebar.last30Days")}
                      </div>
                      {groupedChats.lastMonth.map((chat) => (
                        <ChatItem
                          chat={chat}
                          isActive={chat.id === id}
                          key={chat.id}
                          onDelete={(chatId) => {
                            setDeleteId(chatId);
                            setShowDeleteDialog(true);
                          }}
                          setOpenMobile={setOpenMobile}
                        />
                      ))}
                    </div>
                  )}

                  {groupedChats.older.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
                        {t("Sidebar.older")}
                      </div>
                      {groupedChats.older.map((chat) => (
                        <ChatItem
                          chat={chat}
                          isActive={chat.id === id}
                          key={chat.id}
                          onDelete={(chatId) => {
                            setDeleteId(chatId);
                            setShowDeleteDialog(true);
                          }}
                          setOpenMobile={setOpenMobile}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </SidebarMenu>

          <motion.div
            onViewportEnter={() => {
              if (!hasReachedEnd && !isLoadingMore) {
                void loadMore();
              }
            }}
          />

          {hasReachedEnd ? (
            <div className="mt-8 flex w-full flex-row items-center justify-center gap-2 px-2 text-sm text-zinc-500">
              {t("Sidebar.reachedEnd")}
            </div>
          ) : (
            <div className="mt-8 flex flex-row items-center gap-2 p-2 text-zinc-500 dark:text-zinc-400">
              <div className="animate-spin">
                <LoaderIcon />
              </div>
              <div>{isLoadingMore ? t("Sidebar.loadingMore") : t("Sidebar.scrollToLoadMore")}</div>
            </div>
          )}
        </SidebarGroupContent>
      </SidebarGroup>

      <AlertDialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Sidebar.deleteDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Sidebar.deleteDialogDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Sidebar.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {t("Sidebar.continue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
