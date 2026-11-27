import { createContext, useContext, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  LoginInput,
  LoginResultDto,
  MfaRecoverInput,
  MfaVerifyInput,
  SessionUser,
} from '@umu-hr/shared';
import { api, ClientError } from './api';

interface AuthValue {
  session: SessionUser | null;
  isLoading: boolean;
  hasPermission: (permission: string) => boolean;
  login: (input: LoginInput) => Promise<LoginResultDto>;
  verifyMfa: (input: MfaVerifyInput) => Promise<void>;
  recoverMfa: (input: MfaRecoverInput) => Promise<void>;
  logout: () => Promise<void>;
  changingPassword: boolean;
  setChangingPassword: (value: boolean) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: ['session'],
    retry: false,
    staleTime: 60_000,
    queryFn: async (): Promise<SessionUser | null> => {
      try {
        return await api<SessionUser>('/auth/me');
      } catch (error) {
        if (error instanceof ClientError && error.status === 401) return null;
        throw error;
      }
    },
  });

  function applySession(user: SessionUser) {
    queryClient.setQueryData(['session'], user);
    void queryClient.invalidateQueries();
  }

  const loginMutation = useMutation({
    mutationFn: (input: LoginInput) => api<LoginResultDto>('/auth/login', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (result) => {
      if (!result.mfaRequired) applySession(result.user);
    },
  });

  const verifyMfaMutation = useMutation({
    mutationFn: (input: MfaVerifyInput) => api<SessionUser>('/auth/mfa/verify', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: applySession,
  });

  const recoverMfaMutation = useMutation({
    mutationFn: (input: MfaRecoverInput) => api<SessionUser>('/auth/mfa/recover', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: applySession,
  });

  const logoutMutation = useMutation({
    mutationFn: () => api<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.setQueryData(['session'], null);
      queryClient.clear();
    },
  });

  const session = sessionQuery.data ?? null;
  const value: AuthValue = {
    session,
    isLoading: sessionQuery.isLoading,
    hasPermission: (permission) => session?.permissions.includes(permission) ?? false,
    login: async (input) => loginMutation.mutateAsync(input),
    verifyMfa: async (input) => {
      await verifyMfaMutation.mutateAsync(input);
    },
    recoverMfa: async (input) => {
      await recoverMfaMutation.mutateAsync(input);
    },
    logout: async () => {
      await logoutMutation.mutateAsync();
    },
    changingPassword: session?.mustChangePassword ?? false,
    setChangingPassword: (changing) => {
      queryClient.setQueryData<SessionUser | null>(['session'], (current) =>
        current ? { ...current, mustChangePassword: changing } : current,
      );
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
