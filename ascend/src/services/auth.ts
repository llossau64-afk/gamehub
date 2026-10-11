import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useAppStore } from '../store/useAppStore';
import { backendConfigured, supabase } from './supabase';

export type AuthResult = { ok: true } | { ok: false; error: string };

const fail = (error: unknown): AuthResult => ({
  ok: false,
  error: error instanceof Error ? error.message : typeof error === 'string' ? error : 'Something went wrong. Please try again.',
});

const notConfigured: AuthResult = {
  ok: false,
  error: 'Cloud accounts are not configured for this build. You can keep training as a guest — your data stays on this device.',
};

export function validateEmail(email: string): string | null {
  if (!email.trim()) return 'Enter your email address.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return 'That email address does not look right.';
  return null;
}

export function validatePassword(pw: string): string | null {
  if (pw.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Use letters and at least one number.';
  return null;
}

function applySession(userId: string, email: string | null, anonymous: boolean) {
  useAppStore.getState().setAuth({ mode: anonymous ? 'guest' : 'account', userId, email });
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return notConfigured;
  try {
    const { data: current } = await supabase.auth.getUser();
    // Upgrade an anonymous guest in place so their history keeps the same user id.
    if (current.user?.is_anonymous) {
      const { data, error } = await supabase.auth.updateUser({ email: email.trim(), password });
      if (error) return fail(error);
      applySession(data.user.id, email.trim(), false);
      return { ok: true };
    }
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) return fail(error);
    if (data.user) applySession(data.user.id, email.trim(), false);
    if (!data.session) return { ok: false, error: 'Check your inbox to confirm your email, then sign in.' };
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return notConfigured;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return fail(error.message === 'Invalid login credentials' ? 'Email or password is incorrect.' : error);
    applySession(data.user.id, data.user.email ?? null, false);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Guest play. With a backend, an anonymous session lets the AI coach and sync work securely. */
export async function continueAsGuest(): Promise<AuthResult> {
  if (!backendConfigured || !supabase) {
    useAppStore.getState().setAuth({ mode: 'guest', userId: null, email: null });
    return { ok: true };
  }
  try {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) {
      // Anonymous sign-ins may be disabled in the project — fall back to local-only guest mode.
      useAppStore.getState().setAuth({ mode: 'guest', userId: null, email: null });
      return { ok: true };
    }
    applySession(data.user.id, null, true);
    return { ok: true };
  } catch {
    useAppStore.getState().setAuth({ mode: 'guest', userId: null, email: null });
    return { ok: true };
  }
}

export async function requestPasswordReset(email: string): Promise<AuthResult> {
  if (!supabase) return notConfigured;
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) return fail(error);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Mobile-friendly reset: the email contains a 6-digit code (see README → Auth email templates). */
export async function completePasswordReset(email: string, code: string, newPassword: string): Promise<AuthResult> {
  if (!supabase) return notConfigured;
  try {
    const { data, error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' });
    if (error) return fail(error);
    const upd = await supabase.auth.updateUser({ password: newPassword });
    if (upd.error) return fail(upd.error);
    if (data.user) applySession(data.user.id, data.user.email ?? null, false);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function signInWithProvider(provider: 'google' | 'apple'): Promise<AuthResult> {
  if (!supabase) return notConfigured;
  try {
    const redirectTo = Linking.createURL('auth-callback');
    const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } });
    if (error || !data.url) return fail(error ?? 'Could not start sign-in.');
    const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (res.type !== 'success') return { ok: false, error: 'Sign-in was cancelled.' };
    const code = new URL(res.url).searchParams.get('code');
    if (!code) return { ok: false, error: 'Sign-in did not complete.' };
    const ex = await supabase.auth.exchangeCodeForSession(code);
    if (ex.error) return fail(ex.error);
    applySession(ex.data.user.id, ex.data.user.email ?? null, false);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function signOut(): Promise<void> {
  try {
    await supabase?.auth.signOut();
  } catch {
    // Local sign-out still proceeds.
  }
  useAppStore.getState().setAuth({ mode: 'guest', userId: null, email: null });
}

/** Restore the auth mode from a persisted Supabase session at startup. */
export async function restoreSession(): Promise<void> {
  if (!supabase) return;
  try {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (user) applySession(user.id, user.email ?? null, !!user.is_anonymous);
  } catch {
    // offline: keep the persisted auth state
  }
}

/**
 * Permanently delete the cloud account (server-side, via the delete-account
 * Edge Function which holds the service-role key), then wipe local data.
 */
export async function deleteAccount(): Promise<AuthResult> {
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
      if (error) return fail('Could not delete your cloud account right now. Check your connection and try again.');
      await supabase.auth.signOut().catch(() => undefined);
    }
  }
  useAppStore.getState().resetAll();
  return { ok: true };
}
