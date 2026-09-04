import { Link } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { signUp } from '@/src/features/auth/session';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { TextField } from '@/src/ui/TextField';
import { useTheme } from '@/src/ui/theme';
import { errorText } from '@/src/lib/errorText';

export default function SignUp() {
  const t = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signUp(email, password, name);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Create your account">
      <TextField label="Your name" value={name} onChangeText={setName} />
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
      <Button title="Create account" onPress={submit} loading={busy} />
      <Link href="/sign-in">
        <Text style={{ color: t.colors.primary, fontWeight: '700' }}>Already have an account? Sign in</Text>
      </Link>
    </Screen>
  );
}
