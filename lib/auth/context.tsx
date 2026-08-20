import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { IMBRACE_TOKEN_KEY, IMBRACE_ORG_ID_KEY, IMBRACE_TOKEN_UPDATED_EVENT } from "@/lib/imbrace/constants";

export type AuthUser = {
  id: string;
  email: string;
  name?: string;
  imbraceToken?: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** Trigger a re-read of localStorage credentials */
  refresh: () => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAuthenticated: false,
  refresh: () => {},
  signOut: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => buildUser());

  const refresh = useCallback(() => {
    setUser(buildUser());
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(IMBRACE_TOKEN_KEY);
    localStorage.removeItem(IMBRACE_ORG_ID_KEY);
    setUser(null);
    window.location.href = "/login";
  }, []);

  // Listen for token updates from ImbraceTokenHandler
  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener(IMBRACE_TOKEN_UPDATED_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(IMBRACE_TOKEN_UPDATED_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: user !== null && !!user.imbraceToken,
      refresh,
      signOut,
    }),
    [user, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

/** Alias to match next-auth's useSession shape for easier migration */
export function useSession() {
  const { user, refresh } = useAuth();
  return {
    data: user ? { user } : null,
    status: user ? ("authenticated" as const) : ("unauthenticated" as const),
    update: refresh,
  };
}

// ── helpers ──

function buildUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem(IMBRACE_TOKEN_KEY);
  if (!token) return null;

  // We don't have full user info in localStorage; ID/email are optional
  // The token is the main credential
  return {
    id: "",
    email: "",
    imbraceToken: token,
  };
}
