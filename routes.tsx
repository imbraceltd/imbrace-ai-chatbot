import { Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy } from "react";
import { useAuth } from "@/lib/auth/context";

// Lazy-loaded pages
const LoginPage = lazy(() => import("@/pages/login"));
const SelectOrgPage = lazy(() => import("@/pages/select-org"));
const ChatPage = lazy(() => import("@/pages/chat"));
const ChatDetailPage = lazy(() => import("@/pages/chat-detail"));
const DocsPage = lazy(() => import("@/pages/docs"));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        {/* Auth routes */}
        <Route
          path="/login"
          element={
            <PublicOnly>
              <LoginPage />
            </PublicOnly>
          }
        />
        <Route path="/select-org" element={<SelectOrgPage />} />

        {/* Chat routes (protected) */}
        <Route
          path="/"
          element={
            <RequireAuth>
              <ChatPage />
            </RequireAuth>
          }
        />
        <Route
          path="/chat/:id"
          element={
            <RequireAuth>
              <ChatDetailPage />
            </RequireAuth>
          }
        />

        {/* Public docs */}
        <Route path="/docs" element={<DocsPage />} />

        {/* 404 fallback */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

function NotFound() {
  return (
    <div className="flex h-dvh w-full flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-2xl font-semibold">404 — Page not found</h1>
      <a href="/" className="text-sm text-muted-foreground underline">
        Go home
      </a>
    </div>
  );
}

function PageLoading() {
  return (
    <div className="flex h-dvh w-full items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground" />
    </div>
  );
}
