/**
 * Chat layout – CSR equivalent of app/(chat)/layout.tsx
 */

import { AppSidebar } from "@/components/app-sidebar";
import { DataStreamProvider } from "@/components/data-stream-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { IMBRACE_TOKEN_KEY } from "@/lib/imbrace/constants";
import { useMemo, type ReactNode } from "react";

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

export function ChatLayout({ children }: { children: ReactNode }) {
  const isCollapsed = localStorage.getItem("sidebar_state") !== "true";

  const user = useMemo(() => {
    const token = localStorage.getItem(IMBRACE_TOKEN_KEY);
    if (!token) return null;
    const email = getCookie("user_email") || "user";
    return { email };
  }, []);

  return (
    <DataStreamProvider>
      <SidebarProvider defaultOpen={!isCollapsed}>
        <AppSidebar user={user} />
        <SidebarInset>{children}</SidebarInset>
      </SidebarProvider>
    </DataStreamProvider>
  );
}
