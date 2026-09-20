import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { ApiError, registerUnauthorizedHandler, request } from "../lib/api";
import { getAccessToken } from "./getAccessToken";

// Contrato real de GET /api/me (src/routes/me.ts del backend): el
// AuthContext que `authenticate` ya resolvió contra Postgres para este
// request. No agregar campos que ese endpoint no devuelve.
export interface MeResponse {
  userId: string;
  organizationId: string;
  role: "ADMIN" | "MEMBER";
  isPlatformAdmin: boolean;
  // Fase 5, paso 4: permiso puntual para el inbox de conversaciones
  // derivadas (ver User.canHandleInbox del backend). Siempre false para un
  // platform admin.
  canHandleInbox: boolean;
}

export type AuthStatus =
  "initializing" | "unauthenticated" | "loading-profile" | "authenticated" | "profile-error";

export interface AuthContextValue {
  status: AuthStatus;
  me: MeResponse | null;
  profileError: Error | null;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  retryProfile(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components -- se deja el hook acá junto al provider, mismo criterio documentado en plataforma-crm-frontend/src/auth/AuthContext.tsx
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  }
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  // undefined: onAuthStateChange todavía no disparó ningún evento.
  // null: disparó, sin sesión. string: disparó, session.user.id conocido.
  const [identityKey, setIdentityKey] = useState<string | null | undefined>(undefined);
  const identityRef = useRef<string | null | undefined>(undefined);

  const handleIdentityChange = useCallback(
    (newIdentityKey: string | null) => {
      if (identityRef.current === newIdentityKey) return;
      queryClient.clear();
      identityRef.current = newIdentityKey;
      setIdentityKey(newIdentityKey);
    },
    [queryClient],
  );

  useEffect(() => {
    registerUnauthorizedHandler(() => {
      supabase.auth.signOut({ scope: "local" }).catch((error: unknown) => {
        console.error("No se pudo cerrar la sesión tras un 401", error);
      });
    });
  }, []);

  useEffect(() => {
    let active = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "TOKEN_REFRESHED") return;
      handleIdentityChange(session?.user.id ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [handleIdentityChange]);

  const meQuery = useQuery({
    queryKey: ["me", identityKey ?? "none"] as const,
    queryFn: ({ signal }) => request<MeResponse>("/me", { getAccessToken, signal }),
    enabled: identityKey != null,
    staleTime: 5 * 60 * 1000,
  });

  const status: AuthStatus =
    identityKey === undefined
      ? "initializing"
      : identityKey === null
        ? "unauthenticated"
        : meQuery.isLoading
          ? "loading-profile"
          : meQuery.isSuccess
            ? "authenticated"
            : meQuery.isError
              ? "profile-error"
              : "loading-profile";

  const profileError = status === "profile-error" ? (meQuery.error as ApiError) : null;

  async function login(email: string, password: string): Promise<void> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // No se aplica la sesión a mano: onAuthStateChange (SIGNED_IN) dispara
    // handleIdentityChange con la identidad real.
  }

  async function logout(): Promise<void> {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
  }

  function retryProfile(): void {
    meQuery.refetch();
  }

  const value: AuthContextValue = {
    status,
    me: meQuery.data ?? null,
    profileError,
    login,
    logout,
    retryProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
