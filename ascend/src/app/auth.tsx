import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AText } from '../components/AText';
import { Button } from '../components/Button';
import { Banner, Field, Segmented } from '../components/Controls';
import { Screen } from '../components/Screen';
import {
  completePasswordReset,
  requestPasswordReset,
  signIn,
  signInWithProvider,
  signUp,
  validateEmail,
  validatePassword,
} from '../services/auth';
import { oauthEnabled, backendConfigured } from '../services/supabase';
import { syncNow } from '../services/sync';
import { useAppStore } from '../store/useAppStore';
import { spacing } from '../theme';

type Mode = 'signin' | 'signup' | 'reset';

export default function AuthScreen() {
  const params = useLocalSearchParams<{ mode?: Mode }>();
  const [mode, setMode] = useState<Mode>(params.mode ?? 'signup');
  const [email, setEmail] = useState(useAppStore.getState().auth.email ?? '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<{ email?: string | null; password?: string | null }>({});

  const finish = async () => {
    setInfo('Syncing your data…');
    await syncNow({ pull: true });
    const s = useAppStore.getState();
    if (s.profile && s.plan) {
      if (!s.onboarded) s.completeOnboarding();
      router.replace('/(tabs)');
    } else if (router.canGoBack()) router.back();
    else router.replace('/onboarding/create');
  };

  const submit = async () => {
    setError(null);
    setInfo(null);
    const eErr = validateEmail(email);
    const pErr = mode === 'reset' && !codeSent ? null : mode === 'signin' ? (password ? null : 'Enter your password.') : validatePassword(password);
    setFieldErr({ email: eErr, password: pErr });
    if (eErr || pErr) return;
    setBusy(true);
    try {
      if (mode === 'signin') {
        const r = await signIn(email, password);
        if (!r.ok) return setError(r.error);
        await finish();
      } else if (mode === 'signup') {
        const r = await signUp(email, password);
        if (!r.ok) return setError(r.error);
        await finish();
      } else if (!codeSent) {
        const r = await requestPasswordReset(email);
        if (!r.ok) return setError(r.error);
        setCodeSent(true);
        setInfo('If an account exists for that email, a 6-digit code is on its way.');
      } else {
        if (!/^\d{6}$/.test(code.trim())) return setError('Enter the 6-digit code from the email.');
        const r = await completePasswordReset(email, code, password);
        if (!r.ok) return setError(r.error);
        await finish();
      }
    } finally {
      setBusy(false);
    }
  };

  const provider = async (p: 'google' | 'apple') => {
    setBusy(true);
    setError(null);
    const r = await signInWithProvider(p);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    await finish();
  };

  return (
    <Screen keyboard back title={mode === 'reset' ? 'Reset password' : 'Your account'} subtitle="Sync your progress across devices and keep a cloud backup.">
      {!backendConfigured && (
        <Banner tone="info">
          Cloud accounts are not configured in this build. ASCEND works fully offline — your data is stored securely on this device.
        </Banner>
      )}
      {mode !== 'reset' && (
        <Segmented
          options={[
            { value: 'signup', label: 'Create account' },
            { value: 'signin', label: 'Sign in' },
          ]}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
          }}
        />
      )}
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        error={fieldErr.email}
        editable={!(mode === 'reset' && codeSent)}
      />
      {mode === 'reset' && codeSent && (
        <Field label="6-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" textContentType="oneTimeCode" />
      )}
      {(mode !== 'reset' || codeSent) && (
        <Field
          label={mode === 'reset' ? 'New password' : 'Password'}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          textContentType={mode === 'signin' ? 'password' : 'newPassword'}
          error={fieldErr.password}
          hint={mode === 'signin' ? undefined : 'At least 8 characters with letters and a number.'}
        />
      )}
      {error && <Banner tone="danger">{error}</Banner>}
      {info && <Banner tone="success">{info}</Banner>}
      <Button
        label={mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : codeSent ? 'Set new password' : 'Send reset code'}
        size="lg"
        full
        loading={busy}
        onPress={submit}
        disabled={!backendConfigured}
      />
      {mode === 'signin' && <Button label="Forgot password?" variant="ghost" onPress={() => setMode('reset')} />}
      {mode === 'reset' && <Button label="Back to sign in" variant="ghost" onPress={() => { setMode('signin'); setCodeSent(false); }} />}
      {oauthEnabled && mode !== 'reset' && (
        <View style={{ gap: spacing.sm }}>
          <AText variant="tiny" faint align="center">
            or
          </AText>
          <Button label="Continue with Apple" icon="logo-apple" variant="secondary" full onPress={() => provider('apple')} disabled={busy} />
          <Button label="Continue with Google" icon="logo-google" variant="secondary" full onPress={() => provider('google')} disabled={busy} />
        </View>
      )}
      <AText variant="tiny" faint align="center">
        We only store what is needed to run ASCEND. No ads, no selling of personal data. You can export or delete everything in Settings.
      </AText>
    </Screen>
  );
}
