import { Link } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { signIn } from '@/src/features/auth/session';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { TextField } from '@/src/ui/TextField';
import { useTheme } from '@/src/ui/theme';

export default function SignIn() {
  const t = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Welcome back">
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        error={error ?? undefined}
      />
      <Button title="Sign in" onPress={submit} loading={busy} />
      <Link href="/sign-up">
        <Text style={{ color: t.colors.primary, fontWeight: '700' }}>New here? Create an account</Text>
      </Link>
    </Screen>
  );
}
