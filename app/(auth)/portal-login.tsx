import { Link } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { requestPortalOtp, verifyPortalOtp } from '@/src/features/auth/session';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { TextField } from '@/src/ui/TextField';
import { useTheme } from '@/src/ui/theme';

/**
 * Pet-parent sign-in (Plan 8 Task 2): passwordless email OTP. Tenant-neutral
 * copy — the person may only know their pet care provider, not this product.
 * Verification flips the auth store; the (auth) layout then redirects to `/`
 * and the router sends them to the portal (or staff tabs for dual-role users).
 */
export default function PortalLogin() {
  const t = useTheme();
  const [phase, setPhase] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      await requestPortalOtp(email);
      setPhase('code');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode() {
    setBusy(true);
    setError(null);
    try {
      await verifyPortalOtp(email, code);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      {/* Centered column so the form reads well at desktop web widths too. */}
      <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center', gap: t.space.md }}>
        <Text style={[t.type.hero, { color: t.colors.ink }]}>Welcome</Text>
        {phase === 'email' ? (
          <>
            <Text style={[t.type.body, { color: t.colors.inkMuted }]}>
              Enter your email to view your pet care account. We&apos;ll send you a
              one-time code — no password needed.
            </Text>
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              error={error ?? undefined}
            />
            <Button title="Email me a code" onPress={sendCode} loading={busy} disabled={!email.trim()} />
          </>
        ) : (
          <>
            <Text style={[t.type.body, { color: t.colors.inkMuted }]}>
              We emailed a sign-in code to {email.trim()}. Enter it below.
            </Text>
            {/* Supabase OTP length is configurable (this project sends 8 digits);
                cap generously and gate on the 6-digit minimum instead. */}
            <TextField
              label="Sign-in code"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={10}
              textContentType="oneTimeCode"
              error={error ?? undefined}
            />
            <Button title="Sign in" onPress={confirmCode} loading={busy} disabled={code.trim().length < 6} />
            <Button
              title="Use a different email"
              variant="ghost"
              onPress={() => {
                setPhase('email');
                setCode('');
                setError(null);
              }}
            />
          </>
        )}
        <Link href="/sign-in">
          <Text style={{ color: t.colors.primary, fontWeight: '700' }}>Staff member? Sign in here</Text>
        </Link>
      </View>
    </Screen>
  );
}
