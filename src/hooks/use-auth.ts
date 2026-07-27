import { useEffect, useState } from "react";
import {
  getLocalSession,
  signOutLocally,
  subscribeToLocalAuth,
  type AppRole,
  type LocalSession,
  type LocalUser,
} from "@/lib/local-auth";

export type { AppRole } from "@/lib/local-auth";

export interface AuthState {
  user: LocalUser | null;
  session: LocalSession | null;
  roles: AppRole[];
  loading: boolean;
}

export function useAuth(): AuthState & { signOut: () => Promise<void> } {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    roles: [],
    loading: true,
  });

  useEffect(() => {
    const update = () => {
      const session = getLocalSession();
      setState({
        user: session?.user ?? null,
        session,
        roles: session?.roles ?? [],
        loading: false,
      });
    };
    update();
    return subscribeToLocalAuth(update);
  }, []);

  return {
    ...state,
    signOut: async () => {
      signOutLocally();
    },
  };
}

export function hasAnyRole(roles: AppRole[], allowed: AppRole[]): boolean {
  return roles.some((r) => allowed.includes(r));
}
