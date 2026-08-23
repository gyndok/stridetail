# Stridetail Plan 1 — Foundation, GPS/Offline Spike, Auth & Tenancy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Stridetail Expo app and Supabase backend so that a user can sign up, create a business, invite a walker, and — on a physical phone — record a background GPS track into a local outbox that survives airplane mode and a force-kill (spec Checkpoint 1).

**Architecture:** One Expo SDK 57 app (Expo Router, TypeScript strict, Bun) talks to Supabase directly under the user's JWT; every table is behind RLS keyed on active business memberships. Writes made in the field go to a SQLite outbox first; a background location task appends GPS points to SQLite and rolls them into segments. This plan builds the shell, the spike, and tenancy; Plans 2–4 add clients/pets, scheduling, and execution/reports/web.

**Tech Stack:** Expo 57.0.15, expo-router 57, React Native 0.86, TypeScript strict, Bun, expo-location + expo-task-manager, expo-sqlite, expo-secure-store + aes-js + expo-crypto, @supabase/supabase-js 2.112, @tanstack/react-query 5.102, zustand 5, jest-expo 57, @testing-library/react-native 14, Supabase CLI with pgTAP.

Spec: `docs/superpowers/specs/2026-08-23-stridetail-slice1-design.md` (this plan covers spec §11 stages 1–3).

## Global Constraints

- Expo SDK **57** APIs only. Before using any Expo module, read `https://docs.expo.dev/versions/v57.0.0/sdk/<module>/` — the SDK is newer than model training data. Verify, don't guess.
- Package manager is **Bun**: `bun install`, `bun run <script>`, `bunx expo ...`. Never `npm`/`yarn`.
- TypeScript `strict: true`; `bunx tsc --noEmit` must pass at every commit.
- **No service-role key in the app.** Only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are exposed to the client.
- **No hardcoded time zone anywhere.** Zones come from `businesses.time_zone` (IANA) or the device.
- Display name lives only in `src/lib/brand.ts` (`APP_NAME = 'Stridetail'`). Bundle id `app.stridetail` is set in `app.json` but no store build happens in this plan.
- Design direction B: tokens in `src/ui/tokens.ts` (`surface #FFF4E6`, `primary #E8642C`, `ink #2B1D12`); every screen uses tokens, never literal colors.
- Commits: conventional, lowercase, scoped: `feat(gps): ...`, `feat(db): ...`. End each message with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Tests: `bun run test` (jest-expo) and `bun run db:test` (pgTAP via `supabase test db`) must pass before each commit that touches their area.
- Working autonomously: if a decision isn't covered, make the conservative call and record it in `DEVIATIONS.md` at repo root. Checkpoint evidence goes in `checkpoints.md`.

---

## File structure (what this plan creates)

```
stridetail/
  app.json                          expo config incl. expo-location plugin, UIBackgroundModes
  package.json                      scripts: start, test, typecheck, lint, db:start, db:reset, db:test
  jest.config.js / jest.setup.ts    jest-expo preset, module mocks
  .env.example                      EXPO_PUBLIC_SUPABASE_URL / ANON_KEY placeholders
  app/
    _layout.tsx                     providers (theme, query), registers GPS task, auth gate
    index.tsx                       routes to sign-in / onboarding / role home
    (auth)/_layout.tsx, sign-in.tsx, sign-up.tsx
    onboarding/create-business.tsx
    invite/[token].tsx
    (owner)/_layout.tsx, today.tsx, schedule.tsx, clients.tsx, team.tsx, settings.tsx
    (walker)/_layout.tsx, today.tsx, schedule.tsx, clients.tsx
    dev/gps-spike.tsx               dev-only screen for Checkpoint 1
  src/
    lib/brand.ts                    APP_NAME
    lib/env.ts                      validated public env
    lib/supabase.ts                 client with encrypted session storage + auto refresh
    lib/secure-session-storage.ts   LargeSecureStore (SecureStore key + AES in kv-store)
    lib/offline/db.ts               opens SQLite, runs local migrations
    lib/offline/outbox.ts           OutboxStore interface, SQLite + memory impls, ordering
    lib/gps/geo.ts                  haversine, segmentize (pure)
    lib/gps/task.ts                 TaskManager.defineTask → SQLite
    lib/gps/controller.ts           start/stop/recover, segment roll-up
    features/auth/session.ts        zustand session store + hook
    features/business/api.ts        createBusiness (RPC), listMyMemberships, invite
    features/business/active.ts     active business store (persisted)
    ui/tokens.ts                    colors, radius, spacing, type scale
    ui/theme.tsx                    ThemeProvider with business accent override
    ui/Button.tsx, ui/Card.tsx, ui/TextField.tsx, ui/Screen.tsx
  supabase/
    config.toml                     from `supabase init`
    migrations/20260823000001_core.sql   profiles, businesses, memberships, services, helpers, RLS, RPCs
    tests/001_tenancy.sql           pgTAP: isolation + role rules
    functions/invite-accept/index.ts
  .github/workflows/ci.yml
  DEVIATIONS.md, checkpoints.md
```

---

### Task 1: Scaffold the Expo app with Bun, strict TS, and Jest

**Files:**
- Create: `package.json`, `app.json`, `tsconfig.json`, `jest.config.js`, `jest.setup.ts`, `.env.example`, `src/lib/brand.ts`, `app/_layout.tsx`, `app/index.tsx`, `src/lib/__tests__/brand.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `APP_NAME: string` from `src/lib/brand.ts`; scripts `bun run test`, `bun run typecheck`, `bun run lint`, `bun run start`.

- [ ] **Step 1: Create the app in the existing repo**

Run from `~/Developer/stridetail`:
```bash
bunx create-expo-app@latest . --template default --no-install
bun install
bun run reset-project
```
`reset-project` moves the example screens into `app-example/`; delete that folder: `rm -rf app-example`.

- [ ] **Step 2: Pin settings in `app.json`**

Replace the generated `expo` block's identity fields (keep generated `plugins`, `splash`, `icon` entries):
```json
{
  "expo": {
    "name": "Stridetail",
    "slug": "stridetail",
    "scheme": "stridetail",
    "version": "0.1.0",
    "orientation": "portrait",
    "newArchEnabled": true,
    "ios": { "bundleIdentifier": "app.stridetail", "supportsTablet": false },
    "android": { "package": "app.stridetail" },
    "web": { "output": "static", "bundler": "metro" },
    "experiments": { "typedRoutes": true }
  }
}
```

- [ ] **Step 3: Make TypeScript strict and add scripts**

`tsconfig.json`:
```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "paths": { "@/*": ["./*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```
Add to `package.json` `scripts`:
```json
"test": "jest",
"typecheck": "tsc --noEmit",
"lint": "expo lint",
"db:start": "supabase start",
"db:reset": "supabase db reset",
"db:test": "supabase test db"
```
Install test tooling:
```bash
bunx expo install jest-expo jest @types/jest @testing-library/react-native react-test-renderer
```

- [ ] **Step 4: Jest config**

`jest.config.js`:
```js
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@supabase/.*)',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/supabase/'],
};
```
`jest.setup.ts`:
```ts
import '@testing-library/react-native';
```

- [ ] **Step 5: Write the failing brand test**

`src/lib/__tests__/brand.test.ts`:
```ts
import { APP_NAME } from '../brand';

test('app display name is defined once', () => {
  expect(APP_NAME).toBe('Stridetail');
});
```
Run: `bun run test` → FAIL: cannot find module `../brand`.

- [ ] **Step 6: Add brand and minimal routes**

`src/lib/brand.ts`:
```ts
export const APP_NAME = 'Stridetail';
export const SUPPORT_EMAIL = 'support@stridetail.app';
```
`app/_layout.tsx`:
```tsx
import { Stack } from 'expo-router';

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```
`app/index.tsx`:
```tsx
import { Text, View } from 'react-native';
import { APP_NAME } from '@/src/lib/brand';

export default function Index() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>{APP_NAME}</Text>
    </View>
  );
}
```
`.env.example`:
```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=replace-me
```
Append to `.gitignore`: `.env`, `*.local`, `ios/`, `android/`, `dist/`.

- [ ] **Step 7: Verify**

Run: `bun run test` → PASS. `bun run typecheck` → no errors. `bunx expo start --web` opens and shows "Stridetail"; stop it.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(app): scaffold expo 57 app with strict ts and jest

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Design tokens, theme provider, and base components

**Files:**
- Create: `src/ui/tokens.ts`, `src/ui/theme.tsx`, `src/ui/Button.tsx`, `src/ui/Card.tsx`, `src/ui/TextField.tsx`, `src/ui/Screen.tsx`, `src/ui/__tests__/Button.test.tsx`, `src/ui/__tests__/theme.test.tsx`
- Modify: `app/_layout.tsx`

**Interfaces:**
- Produces: `tokens` object; `ThemeProvider({ accent?: string })`, `useTheme(): Theme`; `<Button title onPress variant='primary'|'secondary'|'ghost' loading disabled />`; `<Card>`; `<TextField label value onChangeText secureTextEntry autoCapitalize keyboardType error />`; `<Screen title?>` (safe-area padded scroll container).

- [ ] **Step 1: Failing tests**

`src/ui/__tests__/theme.test.tsx`:
```tsx
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { ThemeProvider, useTheme } from '../theme';

function Probe() {
  const t = useTheme();
  return <Text testID="primary">{t.colors.primary}</Text>;
}

test('default primary is brand orange', () => {
  const { getByTestId } = render(<ThemeProvider><Probe /></ThemeProvider>);
  expect(getByTestId('primary').props.children).toBe('#E8642C');
});

test('business accent overrides primary', () => {
  const { getByTestId } = render(<ThemeProvider accent="#3366FF"><Probe /></ThemeProvider>);
  expect(getByTestId('primary').props.children).toBe('#3366FF');
});
```
`src/ui/__tests__/Button.test.tsx`:
```tsx
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '../theme';
import { Button } from '../Button';

test('button calls onPress and is disabled while loading', () => {
  const onPress = jest.fn();
  const { getByText, rerender } = render(
    <ThemeProvider><Button title="Start walk" onPress={onPress} /></ThemeProvider>,
  );
  fireEvent.press(getByText('Start walk'));
  expect(onPress).toHaveBeenCalledTimes(1);
  rerender(<ThemeProvider><Button title="Start walk" onPress={onPress} loading /></ThemeProvider>);
  fireEvent.press(getByText('Start walk'));
  expect(onPress).toHaveBeenCalledTimes(1);
});
```
Run: `bun run test` → FAIL (modules missing).

- [ ] **Step 2: Tokens**

`src/ui/tokens.ts`:
```ts
export const tokens = {
  colors: {
    surface: '#FFF4E6',
    surfaceRaised: '#FFFFFF',
    primary: '#E8642C',
    onPrimary: '#FFFFFF',
    ink: '#2B1D12',
    inkMuted: '#8A5A2B',
    line: '#F0D9C2',
    danger: '#C53030',
    success: '#2F855A',
    // field mode (active visit, dark)
    fieldBg: '#0B0F14',
    fieldSheet: '#151C27',
    fieldInk: '#F3F4F6',
  },
  radius: { card: 24, pill: 999, input: 14 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  type: {
    hero: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -1 },
    title: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.5 },
    body: { fontSize: 15, fontWeight: '500' as const },
    label: { fontSize: 11, fontWeight: '800' as const, letterSpacing: 1, textTransform: 'uppercase' as const },
  },
} as const;
```

- [ ] **Step 3: Theme provider**

`src/ui/theme.tsx`:
```tsx
import { createContext, PropsWithChildren, useContext, useMemo } from 'react';
import { tokens } from './tokens';

export type Theme = {
  colors: typeof tokens.colors;
  radius: typeof tokens.radius;
  space: typeof tokens.space;
  type: typeof tokens.type;
};

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ accent, children }: PropsWithChildren<{ accent?: string }>) {
  const value = useMemo<Theme>(
    () => ({
      ...tokens,
      colors: { ...tokens.colors, primary: accent ?? tokens.colors.primary },
    }),
    [accent],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const t = useContext(ThemeContext);
  if (!t) throw new Error('useTheme must be used inside ThemeProvider');
  return t;
}
```

- [ ] **Step 4: Components**

`src/ui/Button.tsx`:
```tsx
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from './theme';

type Props = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
};

export function Button({ title, onPress, variant = 'primary', loading, disabled }: Props) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.colors.primary : variant === 'secondary' ? t.colors.surfaceRaised : 'transparent';
  const fg = variant === 'primary' ? t.colors.onPrimary : t.colors.primary;
  const inactive = !!loading || !!disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg, borderRadius: t.radius.pill, opacity: inactive ? 0.6 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.label, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 16, fontWeight: '800' },
});
```
`src/ui/Card.tsx`:
```tsx
import { PropsWithChildren } from 'react';
import { View, ViewStyle } from 'react-native';
import { useTheme } from './theme';

export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  const t = useTheme();
  return (
    <View
      style={[
        { backgroundColor: t.colors.surfaceRaised, borderRadius: t.radius.card, padding: t.space.lg,
          shadowColor: t.colors.line, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 0 },
        style,
      ]}
    >
      {children}
    </View>
  );
}
```
`src/ui/TextField.tsx`:
```tsx
import { Text, TextInput, TextInputProps, View } from 'react-native';
import { useTheme } from './theme';

type Props = TextInputProps & { label: string; error?: string };

export function TextField({ label, error, style, ...rest }: Props) {
  const t = useTheme();
  return (
    <View style={{ gap: t.space.xs }}>
      <Text style={[t.type.label, { color: t.colors.inkMuted }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.colors.inkMuted}
        style={[
          { backgroundColor: t.colors.surfaceRaised, borderRadius: t.radius.input, padding: 14,
            fontSize: 16, color: t.colors.ink, borderWidth: 1, borderColor: error ? t.colors.danger : t.colors.line },
          style,
        ]}
        {...rest}
      />
      {error ? <Text style={{ color: t.colors.danger, fontSize: 12 }}>{error}</Text> : null}
    </View>
  );
}
```
`src/ui/Screen.tsx`:
```tsx
import { PropsWithChildren } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './theme';

export function Screen({ title, children }: PropsWithChildren<{ title?: string }>) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + t.space.lg, paddingBottom: insets.bottom + t.space.xl,
          paddingHorizontal: t.space.lg, gap: t.space.md }}
        keyboardShouldPersistTaps="handled"
      >
        {title ? <Text style={[t.type.hero, { color: t.colors.ink }]}>{title}</Text> : null}
        {children}
      </ScrollView>
    </View>
  );
}
```

- [ ] **Step 5: Wire the provider into the root layout**

`app/_layout.tsx`:
```tsx
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/src/ui/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
```

- [ ] **Step 6: Verify and commit**

Run: `bun run test` → PASS (3 tests). `bun run typecheck` → clean.
```bash
git add -A
git commit -m "feat(ui): design tokens, theme provider, base components

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Local SQLite and the outbox

**Files:**
- Create: `src/lib/offline/db.ts`, `src/lib/offline/outbox.ts`, `src/lib/offline/__tests__/outbox.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type OutboxKind = 'visit.start' | 'visit.event' | 'visit.track' | 'visit.finish';
  type OutboxItem = { id: string; kind: OutboxKind; payload: unknown; createdAt: number; attempts: number; state: 'pending' | 'sent' | 'failed' };
  interface OutboxStore {
    enqueue(kind: OutboxKind, payload: unknown, id?: string): Promise<OutboxItem>;
    nextPending(limit?: number): Promise<OutboxItem[]>;   // oldest first, pending only
    markSent(id: string): Promise<void>;
    markFailed(id: string): Promise<void>;                // attempts+1, stays pending until attempts >= 10
    countPending(): Promise<number>;
  }
  class MemoryOutbox implements OutboxStore
  class SqliteOutbox implements OutboxStore   // constructor(db: SQLiteDatabase)
  getDb(): SQLiteDatabase                     // opens 'stridetail.db', applies local migrations once
  ```

- [ ] **Step 1: Failing tests (memory impl drives the contract)**

`src/lib/offline/__tests__/outbox.test.ts`:
```ts
import { MemoryOutbox } from '../outbox';

test('items come back oldest first and only while pending', async () => {
  const box = new MemoryOutbox(() => 1000);
  const a = await box.enqueue('visit.start', { visitId: 'v1' });
  box.now = () => 2000;
  const b = await box.enqueue('visit.event', { type: 'pee' });
  expect((await box.nextPending()).map((i) => i.id)).toEqual([a.id, b.id]);
  await box.markSent(a.id);
  expect((await box.nextPending()).map((i) => i.id)).toEqual([b.id]);
  expect(await box.countPending()).toBe(1);
});

test('failed items retry until ten attempts then stop', async () => {
  const box = new MemoryOutbox(() => 1);
  const a = await box.enqueue('visit.finish', {});
  for (let i = 0; i < 9; i++) await box.markFailed(a.id);
  expect(await box.countPending()).toBe(1);
  await box.markFailed(a.id);
  expect(await box.countPending()).toBe(0);
  expect((await box.nextPending()).length).toBe(0);
});

test('enqueue accepts a caller-supplied id for idempotency', async () => {
  const box = new MemoryOutbox(() => 1);
  const a = await box.enqueue('visit.event', {}, 'fixed-id');
  expect(a.id).toBe('fixed-id');
});
```
Run: `bun run test` → FAIL.

- [ ] **Step 2: Implement db.ts**

`src/lib/offline/db.ts`:
```ts
import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export const LOCAL_SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS outbox_pending ON outbox(state, created_at);
CREATE TABLE IF NOT EXISTS track_points (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_id TEXT NOT NULL,
  t INTEGER NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  acc REAL,
  rolled INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS track_points_visit ON track_points(visit_id, rolled, seq);
CREATE TABLE IF NOT EXISTS active_visit (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  visit_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  requires_gps INTEGER NOT NULL
);
`;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync('stridetail.db');
    db.execSync(LOCAL_SCHEMA);
  }
  return db;
}
```

- [ ] **Step 3: Implement outbox.ts**

`src/lib/offline/outbox.ts`:
```ts
import type { SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

export type OutboxKind = 'visit.start' | 'visit.event' | 'visit.track' | 'visit.finish';
export type OutboxState = 'pending' | 'sent' | 'failed';
export type OutboxItem = {
  id: string; kind: OutboxKind; payload: unknown; createdAt: number; attempts: number; state: OutboxState;
};

export const MAX_ATTEMPTS = 10;

export interface OutboxStore {
  enqueue(kind: OutboxKind, payload: unknown, id?: string): Promise<OutboxItem>;
  nextPending(limit?: number): Promise<OutboxItem[]>;
  markSent(id: string): Promise<void>;
  markFailed(id: string): Promise<void>;
  countPending(): Promise<number>;
}

export class MemoryOutbox implements OutboxStore {
  private items = new Map<string, OutboxItem>();
  constructor(public now: () => number = () => Date.now()) {}

  async enqueue(kind: OutboxKind, payload: unknown, id = Crypto.randomUUID()) {
    const item: OutboxItem = { id, kind, payload, createdAt: this.now(), attempts: 0, state: 'pending' };
    this.items.set(id, item);
    return item;
  }
  async nextPending(limit = 50) {
    return [...this.items.values()]
      .filter((i) => i.state === 'pending')
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
      .slice(0, limit);
  }
  async markSent(id: string) {
    const i = this.items.get(id); if (i) i.state = 'sent';
  }
  async markFailed(id: string) {
    const i = this.items.get(id); if (!i) return;
    i.attempts += 1;
    if (i.attempts >= MAX_ATTEMPTS) i.state = 'failed';
  }
  async countPending() { return (await this.nextPending(Number.MAX_SAFE_INTEGER)).length; }
}

type Row = { id: string; kind: OutboxKind; payload: string; created_at: number; attempts: number; state: OutboxState };

export class SqliteOutbox implements OutboxStore {
  constructor(private db: SQLiteDatabase, private now: () => number = () => Date.now()) {}

  async enqueue(kind: OutboxKind, payload: unknown, id = Crypto.randomUUID()) {
    const createdAt = this.now();
    await this.db.runAsync(
      'INSERT OR IGNORE INTO outbox (id, kind, payload, created_at) VALUES ($id, $kind, $payload, $createdAt)',
      { $id: id, $kind: kind, $payload: JSON.stringify(payload), $createdAt: createdAt },
    );
    return { id, kind, payload, createdAt, attempts: 0, state: 'pending' as const };
  }
  async nextPending(limit = 50) {
    const rows = await this.db.getAllAsync<Row>(
      "SELECT * FROM outbox WHERE state = 'pending' ORDER BY created_at, id LIMIT $limit", { $limit: limit },
    );
    return rows.map((r) => ({ id: r.id, kind: r.kind, payload: JSON.parse(r.payload), createdAt: r.created_at, attempts: r.attempts, state: r.state }));
  }
  async markSent(id: string) {
    await this.db.runAsync("UPDATE outbox SET state = 'sent' WHERE id = $id", { $id: id });
  }
  async markFailed(id: string) {
    await this.db.runAsync(
      `UPDATE outbox SET attempts = attempts + 1,
         state = CASE WHEN attempts + 1 >= $max THEN 'failed' ELSE state END WHERE id = $id`,
      { $id: id, $max: MAX_ATTEMPTS },
    );
  }
  async countPending() {
    const r = await this.db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM outbox WHERE state = 'pending'");
    return r?.n ?? 0;
  }
}
```
Install: `bunx expo install expo-sqlite expo-crypto`. Add to `jest.setup.ts`:
```ts
jest.mock('expo-crypto', () => ({ randomUUID: () => Math.random().toString(36).slice(2) }));
```

- [ ] **Step 4: Verify and commit**

Run: `bun run test` → PASS. `bun run typecheck` → clean.
```bash
git add -A
git commit -m "feat(offline): sqlite schema and outbox store

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: GPS geometry (pure functions)

**Files:**
- Create: `src/lib/gps/geo.ts`, `src/lib/gps/__tests__/geo.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type Pt = { t: number; lat: number; lng: number; acc?: number };
  haversineMeters(a: Pt, b: Pt): number
  trackDistanceMeters(points: Pt[], opts?: { maxAccuracyM?: number }): number  // skips points with acc > maxAccuracyM (default 50)
  shouldKeep(prev: Pt | undefined, next: Pt, opts?: { minMeters?: number; minMs?: number }): boolean // default 5 m or 5 s
  ```

- [ ] **Step 1: Failing tests**

`src/lib/gps/__tests__/geo.test.ts`:
```ts
import { haversineMeters, shouldKeep, trackDistanceMeters } from '../geo';

const p = (lat: number, lng: number, t = 0, acc?: number) => ({ lat, lng, t, acc });

test('haversine of ~111m northward step', () => {
  const d = haversineMeters(p(30.0, -95.0), p(30.001, -95.0));
  expect(d).toBeGreaterThan(110); expect(d).toBeLessThan(112);
});

test('track distance sums legs and ignores inaccurate points', () => {
  const pts = [p(30, -95, 0, 5), p(30.001, -95, 1, 5), p(30.5, -95, 2, 500), p(30.002, -95, 3, 5)];
  const d = trackDistanceMeters(pts);
  expect(d).toBeGreaterThan(220); expect(d).toBeLessThan(224);
});

test('shouldKeep drops jitter closer than 5 m within 5 s', () => {
  const a = p(30, -95, 0);
  expect(shouldKeep(undefined, a)).toBe(true);
  expect(shouldKeep(a, p(30.00001, -95, 1000))).toBe(false);
  expect(shouldKeep(a, p(30.00001, -95, 6000))).toBe(true);
  expect(shouldKeep(a, p(30.0001, -95, 1000))).toBe(true);
});
```
Run: `bun run test` → FAIL.

- [ ] **Step 2: Implement**

`src/lib/gps/geo.ts`:
```ts
export type Pt = { t: number; lat: number; lng: number; acc?: number };

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineMeters(a: Pt, b: Pt): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function trackDistanceMeters(points: Pt[], opts: { maxAccuracyM?: number } = {}): number {
  const max = opts.maxAccuracyM ?? 50;
  let prev: Pt | undefined;
  let total = 0;
  for (const pt of points) {
    if (pt.acc !== undefined && pt.acc > max) continue;
    if (prev) total += haversineMeters(prev, pt);
    prev = pt;
  }
  return total;
}

export function shouldKeep(prev: Pt | undefined, next: Pt, opts: { minMeters?: number; minMs?: number } = {}): boolean {
  if (!prev) return true;
  const minMeters = opts.minMeters ?? 5;
  const minMs = opts.minMs ?? 5000;
  return haversineMeters(prev, next) >= minMeters || next.t - prev.t >= minMs;
}
```

- [ ] **Step 3: Verify and commit**

Run: `bun run test` → PASS.
```bash
git add -A
git commit -m "feat(gps): haversine, track distance, jitter filter

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Background location task and controller (the spike)

**Files:**
- Create: `src/lib/gps/task.ts`, `src/lib/gps/controller.ts`, `src/lib/gps/__tests__/controller.test.ts`, `app/dev/gps-spike.tsx`
- Modify: `app.json` (plugin + background modes), `app/_layout.tsx` (import task), `jest.setup.ts` (mocks)

**Interfaces:**
- Consumes: `getDb()`, `SqliteOutbox`, `shouldKeep`, `trackDistanceMeters`.
- Produces:
  ```ts
  GPS_TASK = 'stridetail-visit-location'
  startVisitTracking(visitId: string): Promise<void>     // permissions, marks active_visit, starts task
  stopVisitTracking(): Promise<void>                      // rolls remaining points, stops task, clears active_visit
  rollSegment(visitId: string): Promise<number>           // moves un-rolled points into one outbox 'visit.track' item; returns count
  recoverActiveVisit(): Promise<{ visitId: string } | null> // on launch: restarts task if needed
  getLocalTrack(visitId: string): Promise<Pt[]>
  ```

- [ ] **Step 1: Configure native capabilities**

```bash
bunx expo install expo-location expo-task-manager expo-dev-client
```
In `app.json` → `expo.plugins` add:
```json
[
  "expo-location",
  {
    "locationAlwaysAndWhenInUsePermission": "Stridetail records your route only while a visit is in progress so the client can see the walk.",
    "locationWhenInUsePermission": "Stridetail uses your location during visits.",
    "isIosBackgroundLocationEnabled": true,
    "isAndroidBackgroundLocationEnabled": true,
    "isAndroidForegroundServiceEnabled": true
  }
]
```
And `expo.ios.infoPlist`:
```json
"infoPlist": { "UIBackgroundModes": ["location"] }
```
Check the plugin option names against `https://docs.expo.dev/versions/v57.0.0/sdk/location/#configuration-in-app-config` and correct if they differ; record any change in `DEVIATIONS.md`.

- [ ] **Step 2: Failing controller test (segment roll-up logic via injected store)**

`src/lib/gps/__tests__/controller.test.ts`:
```ts
import { MemoryOutbox } from '../../offline/outbox';
import { MemoryPointStore, rollSegmentWith } from '../controller';

test('rollSegment moves unrolled points into one track item and marks them rolled', async () => {
  const points = new MemoryPointStore();
  const outbox = new MemoryOutbox(() => 1);
  await points.append('v1', { t: 1, lat: 30, lng: -95, acc: 5 });
  await points.append('v1', { t: 2, lat: 30.001, lng: -95, acc: 5 });
  const n = await rollSegmentWith('v1', points, outbox);
  expect(n).toBe(2);
  const items = await outbox.nextPending();
  expect(items).toHaveLength(1);
  expect(items[0]!.kind).toBe('visit.track');
  expect((items[0]!.payload as { points: unknown[] }).points).toHaveLength(2);
  expect(await rollSegmentWith('v1', points, outbox)).toBe(0);
});
```
Run: `bun run test` → FAIL.

- [ ] **Step 3: Implement the task**

`src/lib/gps/task.ts`:
```ts
import * as TaskManager from 'expo-task-manager';
import type { LocationObject } from 'expo-location';
import { getDb } from '../offline/db';
import { shouldKeep, type Pt } from './geo';

export const GPS_TASK = 'stridetail-visit-location';

type Payload = { locations: LocationObject[] };

export async function ingestLocations(locations: LocationObject[]): Promise<number> {
  const db = getDb();
  const active = await db.getFirstAsync<{ visit_id: string }>('SELECT visit_id FROM active_visit WHERE id = 1');
  if (!active) return 0;
  const last = await db.getFirstAsync<Pt>(
    'SELECT t, lat, lng, acc FROM track_points WHERE visit_id = $v ORDER BY seq DESC LIMIT 1', { $v: active.visit_id },
  );
  let prev = last ?? undefined;
  let kept = 0;
  for (const l of locations) {
    const pt: Pt = { t: l.timestamp, lat: l.coords.latitude, lng: l.coords.longitude, acc: l.coords.accuracy ?? undefined };
    if (!shouldKeep(prev, pt)) continue;
    await db.runAsync(
      'INSERT INTO track_points (visit_id, t, lat, lng, acc) VALUES ($v, $t, $lat, $lng, $acc)',
      { $v: active.visit_id, $t: pt.t, $lat: pt.lat, $lng: pt.lng, $acc: pt.acc ?? null },
    );
    prev = pt; kept++;
  }
  return kept;
}

TaskManager.defineTask(GPS_TASK, async ({ data, error }) => {
  if (error) { console.warn('[gps] task error', error.message); return; }
  const { locations } = (data ?? { locations: [] }) as Payload;
  try { await ingestLocations(locations); } catch (e) { console.warn('[gps] ingest failed', e); }
});
```

- [ ] **Step 4: Implement the controller**

`src/lib/gps/controller.ts`:
```ts
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { getDb } from '../offline/db';
import { SqliteOutbox, type OutboxStore } from '../offline/outbox';
import { GPS_TASK } from './task';
import type { Pt } from './geo';

export interface PointStore {
  append(visitId: string, pt: Pt): Promise<void>;
  unrolled(visitId: string): Promise<{ seq: number; pt: Pt }[]>;
  markRolled(seqs: number[]): Promise<void>;
  all(visitId: string): Promise<Pt[]>;
}

export class MemoryPointStore implements PointStore {
  private rows: { seq: number; visitId: string; pt: Pt; rolled: boolean }[] = [];
  async append(visitId: string, pt: Pt) { this.rows.push({ seq: this.rows.length + 1, visitId, pt, rolled: false }); }
  async unrolled(visitId: string) { return this.rows.filter((r) => r.visitId === visitId && !r.rolled).map((r) => ({ seq: r.seq, pt: r.pt })); }
  async markRolled(seqs: number[]) { for (const r of this.rows) if (seqs.includes(r.seq)) r.rolled = true; }
  async all(visitId: string) { return this.rows.filter((r) => r.visitId === visitId).map((r) => r.pt); }
}

export class SqlitePointStore implements PointStore {
  constructor(private db = getDb()) {}
  async append(visitId: string, pt: Pt) {
    await this.db.runAsync('INSERT INTO track_points (visit_id, t, lat, lng, acc) VALUES ($v,$t,$lat,$lng,$acc)',
      { $v: visitId, $t: pt.t, $lat: pt.lat, $lng: pt.lng, $acc: pt.acc ?? null });
  }
  async unrolled(visitId: string) {
    const rows = await this.db.getAllAsync<{ seq: number; t: number; lat: number; lng: number; acc: number | null }>(
      'SELECT seq, t, lat, lng, acc FROM track_points WHERE visit_id = $v AND rolled = 0 ORDER BY seq', { $v: visitId });
    return rows.map((r) => ({ seq: r.seq, pt: { t: r.t, lat: r.lat, lng: r.lng, acc: r.acc ?? undefined } }));
  }
  async markRolled(seqs: number[]) {
    if (!seqs.length) return;
    await this.db.runAsync(`UPDATE track_points SET rolled = 1 WHERE seq IN (${seqs.join(',')})`);
  }
  async all(visitId: string) {
    const rows = await this.db.getAllAsync<{ t: number; lat: number; lng: number; acc: number | null }>(
      'SELECT t, lat, lng, acc FROM track_points WHERE visit_id = $v ORDER BY seq', { $v: visitId });
    return rows.map((r) => ({ t: r.t, lat: r.lat, lng: r.lng, acc: r.acc ?? undefined }));
  }
}

let segmentCounter = 0;

export async function rollSegmentWith(visitId: string, points: PointStore, outbox: OutboxStore): Promise<number> {
  const rows = await points.unrolled(visitId);
  if (!rows.length) return 0;
  segmentCounter += 1;
  await outbox.enqueue('visit.track', { visitId, segmentNo: segmentCounter, points: rows.map((r) => r.pt) });
  await points.markRolled(rows.map((r) => r.seq));
  return rows.length;
}

export const rollSegment = (visitId: string) => rollSegmentWith(visitId, new SqlitePointStore(), new SqliteOutbox(getDb()));
export const getLocalTrack = (visitId: string) => new SqlitePointStore().all(visitId);

let rollTimer: ReturnType<typeof setInterval> | null = null;

async function ensurePermissions() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') throw new Error('Location permission (while using) is required to record a visit.');
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') throw new Error('Allow location "Always" so the route keeps recording when the screen is off.');
}

export async function startVisitTracking(visitId: string) {
  await ensurePermissions();
  const db = getDb();
  await db.runAsync('INSERT OR REPLACE INTO active_visit (id, visit_id, started_at, requires_gps) VALUES (1, $v, $t, 1)',
    { $v: visitId, $t: Date.now() });
  if (!(await Location.hasStartedLocationUpdatesAsync(GPS_TASK))) {
    await Location.startLocationUpdatesAsync(GPS_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 5000,
      distanceInterval: 10,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: { notificationTitle: 'Visit in progress', notificationBody: 'Recording your route', notificationColor: '#E8642C' },
    });
  }
  if (!rollTimer) rollTimer = setInterval(() => { void rollSegment(visitId); }, 60_000);
}

export async function stopVisitTracking() {
  const db = getDb();
  const active = await db.getFirstAsync<{ visit_id: string }>('SELECT visit_id FROM active_visit WHERE id = 1');
  if (rollTimer) { clearInterval(rollTimer); rollTimer = null; }
  if (await Location.hasStartedLocationUpdatesAsync(GPS_TASK)) await Location.stopLocationUpdatesAsync(GPS_TASK);
  if (active) await rollSegment(active.visit_id);
  await db.runAsync('DELETE FROM active_visit WHERE id = 1');
}

export async function recoverActiveVisit(): Promise<{ visitId: string } | null> {
  const active = await getDb().getFirstAsync<{ visit_id: string }>('SELECT visit_id FROM active_visit WHERE id = 1');
  if (!active) return null;
  const registered = await TaskManager.isTaskRegisteredAsync(GPS_TASK);
  if (!registered) await startVisitTracking(active.visit_id);
  else if (!rollTimer) rollTimer = setInterval(() => { void rollSegment(active.visit_id); }, 60_000);
  return { visitId: active.visit_id };
}
```
Add to `jest.setup.ts`:
```ts
jest.mock('expo-sqlite', () => ({ openDatabaseSync: () => ({ execSync: jest.fn(), runAsync: jest.fn(), getAllAsync: jest.fn(async () => []), getFirstAsync: jest.fn(async () => null) }) }));
jest.mock('expo-location', () => ({ Accuracy: { High: 4 }, requestForegroundPermissionsAsync: jest.fn(), requestBackgroundPermissionsAsync: jest.fn(), hasStartedLocationUpdatesAsync: jest.fn(async () => false), startLocationUpdatesAsync: jest.fn(), stopLocationUpdatesAsync: jest.fn() }));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn(), isTaskRegisteredAsync: jest.fn(async () => false) }));
```

- [ ] **Step 5: Register the task at app start and add the spike screen**

In `app/_layout.tsx`, add as the first import: `import '@/src/lib/gps/task';`

`app/dev/gps-spike.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';
import { getLocalTrack, recoverActiveVisit, startVisitTracking, stopVisitTracking } from '@/src/lib/gps/controller';
import { trackDistanceMeters } from '@/src/lib/gps/geo';
import { getDb } from '@/src/lib/offline/db';
import { SqliteOutbox } from '@/src/lib/offline/outbox';

const VISIT = 'spike-visit';

export default function GpsSpike() {
  const t = useTheme();
  const [active, setActive] = useState(false);
  const [points, setPoints] = useState(0);
  const [meters, setMeters] = useState(0);
  const [pending, setPending] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    const track = await getLocalTrack(VISIT);
    setPoints(track.length);
    setMeters(Math.round(trackDistanceMeters(track)));
    setPending(await new SqliteOutbox(getDb()).countPending());
  }

  useEffect(() => {
    void recoverActiveVisit().then((r) => setActive(!!r)).then(refresh);
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <Screen title="GPS spike">
      <Card>
        <Text style={[t.type.title, { color: t.colors.ink }]}>{active ? 'Recording' : 'Idle'}</Text>
        <Text style={{ color: t.colors.inkMuted }}>{points} points · {meters} m · {pending} outbox items</Text>
        {err ? <Text style={{ color: t.colors.danger }}>{err}</Text> : null}
      </Card>
      <Button title="Start" onPress={() => startVisitTracking(VISIT).then(() => setActive(true)).catch((e) => setErr(String(e.message ?? e)))} disabled={active} />
      <Button title="Finish" variant="secondary" onPress={() => stopVisitTracking().then(() => setActive(false)).then(refresh)} disabled={!active} />
    </Screen>
  );
}
```

- [ ] **Step 6: Verify tests, then build a development client and run Checkpoint 1 on a device**

Run: `bun run test` → PASS. `bun run typecheck` → clean.

Build and install (requires Apple Developer account signed into EAS, or a local Xcode build):
```bash
bunx eas-cli build --profile development --platform ios
```
(If EAS is not configured yet: `bunx eas-cli init` then `bunx eas-cli build:configure`. Alternatively `bunx expo run:ios --device` with Xcode.)

On the phone, open `stridetail://dev/gps-spike` (or navigate via the dev menu). Then execute and record in `checkpoints.md`:
1. Airplane mode ON. Tap Start. Grant "Always" location.
2. Walk ≥ 10 minutes with the screen off for at least 5 of them.
3. Force-kill the app (swipe away). Wait 2 minutes while still walking.
4. Relaunch. Expected: status shows Recording; points count continues from before the kill (not zero).
5. Tap Finish. Expected: outbox items ≥ number of minutes / 1, points > 100, meters plausible.
6. Screenshot the screen; note device model, iOS version, points, meters, outbox count.

Pass criteria: step 4 resumes with prior points intact and new points accumulating; step 5 shows a non-zero outbox. If it fails, fix before any further task (spec §11). Common causes: missing `UIBackgroundModes`, task file not imported at root, permission not "Always".

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(gps): background location task, controller, spike screen (checkpoint 1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Supabase project, core schema, RLS, and pgTAP tests

**Files:**
- Create: `supabase/config.toml` (generated), `supabase/migrations/20260823000001_core.sql`, `supabase/tests/001_tenancy.sql`, `supabase/seed.sql`

**Interfaces:**
- Produces (SQL): tables `profiles`, `businesses`, `memberships`, `services`; functions `current_business_ids()`, `role_in(uuid)`, `create_business(text, text, text)`, `create_invite(uuid, text, text, text)`; trigger creating `profiles` on auth signup.

Prerequisite: Docker running, Supabase CLI installed (`brew install supabase/tap/supabase`).

- [ ] **Step 1: Initialise and start the local stack**

```bash
supabase init
supabase start
```
Copy the printed `API URL` and `anon key` into `.env` as `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

- [ ] **Step 2: Write the failing pgTAP test**

`supabase/tests/001_tenancy.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- two users
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'owner@test.dev'),
  ('00000000-0000-0000-0000-000000000002', 'walker@test.dev'),
  ('00000000-0000-0000-0000-000000000003', 'outsider@test.dev');

-- owner creates a business via RPC
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok($$ select create_business('Paw & Whisker', 'America/Chicago', '#E8642C') $$, 'owner can create business');
select is((select count(*) from businesses)::int, 1, 'owner sees own business');
select is((select count(*) from services)::int, 8, 'services are seeded');
select is((select role from memberships where user_id = '00000000-0000-0000-0000-000000000001'), 'owner', 'creator is owner');

-- owner invites walker by email
select lives_ok($$ select create_invite((select id from businesses limit 1), 'walker', null, 'walker@test.dev') $$, 'owner can invite');

-- outsider sees nothing
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}';
select is((select count(*) from businesses)::int, 0, 'outsider sees no business');
select is((select count(*) from services)::int, 0, 'outsider sees no services');

-- invited walker sees nothing until active
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*) from businesses)::int, 0, 'invited-but-inactive walker sees no business');

-- activate and check walker cannot see prices
reset role;
update memberships set user_id = '00000000-0000-0000-0000-000000000002', status = 'active' where invited_email = 'walker@test.dev';
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
-- RLS denies silently: the walker gets zero rows from the priced table but sees the price-free view
select is((select count(*) from services)::int, 0, 'walker cannot read priced services table');
select is((select count(*) from services_public)::int, 8, 'walker sees price-free services view');

select * from finish();
rollback;
```
Run: `bun run db:test` → FAIL (relations missing).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260823000001_core.sql`:
```sql
-- ===== profiles =====
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ===== businesses =====
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_path text,
  brand_color text not null default '#E8642C',
  time_zone text not null,
  policies_md text,
  plan text not null default 'free',
  access_grace_hours int not null default 12,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ===== memberships =====
create type public.member_role as enum ('owner', 'walker');
create type public.member_status as enum ('invited', 'active', 'inactive');

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role public.member_role not null,
  status public.member_status not null default 'invited',
  invite_token text unique,
  invited_phone text,
  invited_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id)
);
create index memberships_user_active on public.memberships(user_id) where status = 'active';

-- ===== services =====
create type public.service_kind as enum ('meet_greet','walk','dropin','meds','overnight','transport','grooming','other');

create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  kind public.service_kind not null,
  base_price_cents int not null default 0,
  extra_pet_price_cents int not null default 0,
  duration_min int not null default 30,
  requires_gps boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index services_business on public.services(business_id);

-- ===== helpers =====
create or replace function public.current_business_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select business_id from public.memberships where user_id = auth.uid() and status = 'active'
$$;

create or replace function public.role_in(b uuid) returns public.member_role
language sql stable security definer set search_path = public as $$
  select role from public.memberships where user_id = auth.uid() and business_id = b and status = 'active' limit 1
$$;

create or replace function public.is_owner(b uuid) returns boolean
language sql stable as $$ select public.role_in(b) = 'owner' $$;

-- ===== RLS =====
alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.memberships enable row level security;
alter table public.services enable row level security;

create policy "own profile" on public.profiles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "members read business" on public.businesses for select
  using (id in (select public.current_business_ids()));
create policy "owner updates business" on public.businesses for update
  using (public.is_owner(id)) with check (public.is_owner(id));

create policy "members read memberships" on public.memberships for select
  using (business_id in (select public.current_business_ids()));
create policy "owner manages memberships" on public.memberships for update
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));
create policy "owner removes memberships" on public.memberships for delete
  using (public.is_owner(business_id));

-- services: owners full access; walkers only via the price-free view below
create policy "owner reads services" on public.services for select
  using (public.is_owner(business_id));
create policy "owner writes services" on public.services for insert
  with check (public.is_owner(business_id));
create policy "owner updates services" on public.services for update
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));

create view public.services_public with (security_invoker = false) as
  select s.id, s.business_id, s.name, s.kind, s.duration_min, s.requires_gps, s.active
  from public.services s
  where s.business_id in (select public.current_business_ids());
grant select on public.services_public to authenticated;

-- ===== RPCs =====
create or replace function public.create_business(p_name text, p_time_zone text, p_brand_color text)
returns uuid language plpgsql security definer set search_path = public as $$
declare b uuid; base_slug text; s text; n int := 0;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  base_slug := regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g');
  s := base_slug;
  while exists (select 1 from businesses where slug = s) loop n := n + 1; s := base_slug || '-' || n; end loop;
  insert into businesses (name, slug, time_zone, brand_color) values (p_name, s, p_time_zone, coalesce(p_brand_color, '#E8642C')) returning id into b;
  insert into memberships (business_id, user_id, role, status) values (b, auth.uid(), 'owner', 'active');
  insert into services (business_id, name, kind, duration_min, requires_gps, base_price_cents, extra_pet_price_cents) values
    (b, 'Meet & greet', 'meet_greet', 30, false, 0, 0),
    (b, 'Walk', 'walk', 30, true, 2500, 500),
    (b, 'Puppy visit', 'walk', 20, true, 2000, 500),
    (b, 'Drop-in / feeding', 'dropin', 20, false, 2000, 500),
    (b, 'Medication visit', 'meds', 20, false, 2500, 500),
    (b, 'Overnight stay', 'overnight', 720, false, 8500, 1000),
    (b, 'Transport', 'transport', 60, true, 3500, 0),
    (b, 'Grooming / nails', 'grooming', 45, false, 4000, 1000);
  return b;
end $$;

create or replace function public.create_invite(p_business uuid, p_role public.member_role, p_phone text, p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare tok text;
begin
  if not public.is_owner(p_business) then raise exception 'only owners can invite'; end if;
  if p_phone is null and p_email is null then raise exception 'phone or email required'; end if;
  tok := encode(extensions.gen_random_bytes(24), 'hex');
  insert into memberships (business_id, role, status, invite_token, invited_phone, invited_email)
  values (p_business, p_role, 'invited', tok, p_phone, p_email);
  return tok;
end $$;

-- accept is done by the invite-accept edge function (service role) after verifying the JWT
create or replace function public.accept_invite(p_token text, p_user uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare m memberships;
begin
  select * into m from memberships where invite_token = p_token and status = 'invited';
  if m.id is null then raise exception 'invalid or used invite'; end if;
  update memberships set user_id = p_user, status = 'active', invite_token = null, updated_at = now() where id = m.id;
  return m.business_id;
end $$;
revoke execute on function public.accept_invite(text, uuid) from authenticated, anon;

grant execute on function public.create_business(text, text, text) to authenticated;
grant execute on function public.create_invite(uuid, public.member_role, text, text) to authenticated;
```

- [ ] **Step 4: Run the migration and tests**

```bash
bun run db:reset
bun run db:test
```
Expected: `001_tenancy.sql .. ok`, 10/10.

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "feat(db): core tenancy schema, rls, rpcs, pgtap tests

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Supabase client with encrypted session storage and auto-refresh

**Files:**
- Create: `src/lib/env.ts`, `src/lib/secure-session-storage.ts`, `src/lib/supabase.ts`, `src/lib/__tests__/secure-session-storage.test.ts`

**Interfaces:**
- Produces: `supabase: SupabaseClient`; `env.SUPABASE_URL`, `env.SUPABASE_ANON_KEY`; `LargeSecureStore` implementing `{ getItem, setItem, removeItem }`.

- [ ] **Step 1: Install**

```bash
bunx expo install @supabase/supabase-js expo-secure-store react-native-url-polyfill @tanstack/react-query zustand
bun add aes-js
bun add -d @types/aes-js
```

- [ ] **Step 2: Failing test (round-trip through an in-memory backing store)**

`src/lib/__tests__/secure-session-storage.test.ts`:
```ts
import { LargeSecureStore } from '../secure-session-storage';

test('values round-trip and are not stored in plaintext', async () => {
  const secure = new Map<string, string>();
  const kv = new Map<string, string>();
  const store = new LargeSecureStore({
    secureGet: async (k) => secure.get(k) ?? null,
    secureSet: async (k, v) => { secure.set(k, v); },
    kvGet: async (k) => kv.get(k) ?? null,
    kvSet: async (k, v) => { kv.set(k, v); },
    kvRemove: async (k) => { kv.delete(k); },
    randomBytes: (n) => new Uint8Array(Array.from({ length: n }, (_, i) => (i * 7) % 256)),
  });
  await store.setItem('session', '{"access_token":"abc"}');
  expect(kv.get('session')).not.toContain('abc');
  expect(await store.getItem('session')).toBe('{"access_token":"abc"}');
  await store.removeItem('session');
  expect(await store.getItem('session')).toBeNull();
});
```
Run: `bun run test` → FAIL.

- [ ] **Step 3: Implement storage**

`src/lib/secure-session-storage.ts`:
```ts
import * as aesjs from 'aes-js';

type Deps = {
  secureGet: (k: string) => Promise<string | null>;
  secureSet: (k: string, v: string) => Promise<void>;
  kvGet: (k: string) => Promise<string | null>;
  kvSet: (k: string, v: string) => Promise<void>;
  kvRemove: (k: string) => Promise<void>;
  randomBytes: (n: number) => Uint8Array;
};

// SecureStore caps values at 2048 bytes; Supabase sessions exceed that.
// Per Supabase guidance: keep an AES-256 key in SecureStore, store the encrypted blob in ordinary storage.
export class LargeSecureStore {
  constructor(private d: Deps) {}

  private async keyFor(name: string): Promise<Uint8Array> {
    const id = `sk_${name}`;
    const hex = await this.d.secureGet(id);
    if (hex) return aesjs.utils.hex.toBytes(hex);
    const key = this.d.randomBytes(32);
    await this.d.secureSet(id, aesjs.utils.hex.fromBytes(key));
    return key;
  }

  async getItem(name: string): Promise<string | null> {
    const blob = await this.d.kvGet(name);
    const hex = await this.d.secureGet(`sk_${name}`);
    if (!blob || !hex) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(hex), new aesjs.Counter(1));
    return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(blob)));
  }

  async setItem(name: string, value: string): Promise<void> {
    const key = await this.keyFor(name);
    const cipher = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(1));
    await this.d.kvSet(name, aesjs.utils.hex.fromBytes(cipher.encrypt(aesjs.utils.utf8.toBytes(value))));
  }

  async removeItem(name: string): Promise<void> {
    await this.d.kvRemove(name);
    await this.d.secureSet(`sk_${name}`, '');
  }
}
```
Note: a fresh key per `setItem` would be stronger than a fixed counter; we regenerate the key only when absent (matches Supabase's reference). Record in `DEVIATIONS.md` if you change this.

- [ ] **Step 4: Env and client**

`src/lib/env.ts`:
```ts
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
  return value;
}
export const env = {
  SUPABASE_URL: required('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL),
  SUPABASE_ANON_KEY: required('EXPO_PUBLIC_SUPABASE_ANON_KEY', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
};
```
`src/lib/supabase.ts`:
```ts
import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import Storage from 'expo-sqlite/kv-store';
import { env } from './env';
import { LargeSecureStore } from './secure-session-storage';

const nativeStorage = new LargeSecureStore({
  secureGet: (k) => SecureStore.getItemAsync(k),
  secureSet: (k, v) => (v ? SecureStore.setItemAsync(k, v) : SecureStore.deleteItemAsync(k)),
  kvGet: (k) => Storage.getItem(k),
  kvSet: (k, v) => Storage.setItem(k, v),
  kvRemove: (k) => Storage.removeItem(k),
  randomBytes: (n) => Crypto.getRandomBytes(n),
});

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : nativeStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
```
Add to `jest.setup.ts`:
```ts
process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon';
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('expo-sqlite/kv-store', () => ({ __esModule: true, default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } }));
```

- [ ] **Step 5: Verify and commit**

Run: `bun run test` → PASS. `bun run typecheck` → clean.
```bash
git add -A
git commit -m "feat(auth): supabase client with encrypted session storage and auto refresh

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Session store and auth screens

**Files:**
- Create: `src/features/auth/session.ts`, `app/(auth)/_layout.tsx`, `app/(auth)/sign-in.tsx`, `app/(auth)/sign-up.tsx`, `src/features/auth/__tests__/session.test.ts`
- Modify: `app/_layout.tsx`, `app/index.tsx`

**Interfaces:**
- Produces: `useSession(): { status: 'loading'|'signed-out'|'signed-in'; userId: string | null }`; `initSession(): () => void` (subscribes to Supabase auth changes; returns unsubscribe); `signIn(email, password)`, `signUp(email, password, displayName)`, `signOut()`.

- [ ] **Step 1: Failing test**

`src/features/auth/__tests__/session.test.ts`:
```ts
import { useSessionStore, applyAuthEvent } from '../session';

test('auth events move the store between states', () => {
  expect(useSessionStore.getState().status).toBe('loading');
  applyAuthEvent(null);
  expect(useSessionStore.getState()).toMatchObject({ status: 'signed-out', userId: null });
  applyAuthEvent({ user: { id: 'u1' } } as never);
  expect(useSessionStore.getState()).toMatchObject({ status: 'signed-in', userId: 'u1' });
});
```
Run: `bun run test` → FAIL.

- [ ] **Step 2: Implement the store**

`src/features/auth/session.ts`:
```ts
import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { supabase } from '@/src/lib/supabase';

type State = { status: 'loading' | 'signed-out' | 'signed-in'; userId: string | null };

export const useSessionStore = create<State>(() => ({ status: 'loading', userId: null }));

export function applyAuthEvent(session: Session | null) {
  useSessionStore.setState(session ? { status: 'signed-in', userId: session.user.id } : { status: 'signed-out', userId: null });
}

export function initSession(): () => void {
  void supabase.auth.getSession().then(({ data }) => applyAuthEvent(data.session));
  const { data } = supabase.auth.onAuthStateChange((_e, session) => applyAuthEvent(session));
  return () => data.subscription.unsubscribe();
}

export const useSession = () => useSessionStore();

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}
export async function signUp(email: string, password: string, displayName: string) {
  const { error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { display_name: displayName } } });
  if (error) throw error;
}
export async function signOut() { await supabase.auth.signOut(); }
```

- [ ] **Step 3: Screens**

`app/(auth)/_layout.tsx`:
```tsx
import { Redirect, Stack } from 'expo-router';
import { useSession } from '@/src/features/auth/session';

export default function AuthLayout() {
  const { status } = useSession();
  if (status === 'signed-in') return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
```
`app/(auth)/sign-in.tsx`:
```tsx
import { useState } from 'react';
import { Text } from 'react-native';
import { Link } from 'expo-router';
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
    setBusy(true); setError(null);
    try { await signIn(email, password); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Screen title="Welcome back">
      <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry error={error ?? undefined} />
      <Button title="Sign in" onPress={submit} loading={busy} />
      <Link href="/sign-up"><Text style={{ color: t.colors.primary, fontWeight: '700' }}>New here? Create an account</Text></Link>
    </Screen>
  );
}
```
`app/(auth)/sign-up.tsx`:
```tsx
import { useState } from 'react';
import { Text } from 'react-native';
import { Link } from 'expo-router';
import { signUp } from '@/src/features/auth/session';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { TextField } from '@/src/ui/TextField';
import { useTheme } from '@/src/ui/theme';

export default function SignUp() {
  const t = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    setBusy(true); setError(null);
    try { await signUp(email, password, name); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Screen title="Create your account">
      <TextField label="Your name" value={name} onChangeText={setName} />
      <TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry error={error ?? undefined} />
      <Button title="Create account" onPress={submit} loading={busy} />
      <Link href="/sign-in"><Text style={{ color: t.colors.primary, fontWeight: '700' }}>Already have an account? Sign in</Text></Link>
    </Screen>
  );
}
```
For local development set `supabase/config.toml` → `[auth] enable_confirmations = false` so sign-up signs in immediately.

- [ ] **Step 4: Root gate**

`app/_layout.tsx`:
```tsx
import '@/src/lib/gps/task';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/src/ui/theme';
import { initSession } from '@/src/features/auth/session';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } });

export default function RootLayout() {
  useEffect(() => initSession(), []);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
```
`app/index.tsx` (temporary until Task 10 adds role routing):
```tsx
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useSession } from '@/src/features/auth/session';

export default function Index() {
  const { status } = useSession();
  if (status === 'loading') return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  if (status === 'signed-out') return <Redirect href="/sign-in" />;
  return <Redirect href="/onboarding/create-business" />;
}
```

- [ ] **Step 5: Verify**

`bun run test` → PASS; `bun run typecheck` → clean. Manual: `bunx expo start`, on simulator sign up with a new email → lands on (a 404 for) `/onboarding/create-business` — expected until Task 9; sign-out not yet reachable, fine.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(auth): session store, sign-in and sign-up screens, root gate

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Business creation and membership API

**Files:**
- Create: `src/features/business/api.ts`, `src/features/business/active.ts`, `src/features/business/__tests__/active.test.ts`, `app/onboarding/create-business.tsx`

**Interfaces:**
- Consumes: `supabase`, RPC `create_business`, RPC `create_invite`.
- Produces:
  ```ts
  type Membership = { id: string; business_id: string; role: 'owner'|'walker'; status: 'invited'|'active'|'inactive'; business: { id: string; name: string; brand_color: string; time_zone: string; logo_path: string | null } };
  listMyMemberships(): Promise<Membership[]>
  createBusiness(input: { name: string; timeZone: string; brandColor?: string }): Promise<string>  // business id
  createInvite(businessId: string, role: 'walker'|'owner', contact: { phone?: string; email?: string }): Promise<string> // token
  useActiveBusiness(): { businessId: string | null; setBusinessId(id: string | null): void; hydrated: boolean }
  ```

- [ ] **Step 1: Failing test for the active-business store**

`src/features/business/__tests__/active.test.ts`:
```ts
import { useActiveBusinessStore, hydrateActiveBusiness } from '../active';

test('active business persists through the injected storage', async () => {
  const mem = new Map<string, string>();
  const storage = { getItem: async (k: string) => mem.get(k) ?? null, setItem: async (k: string, v: string) => { mem.set(k, v); }, removeItem: async (k: string) => { mem.delete(k); } };
  await hydrateActiveBusiness(storage);
  expect(useActiveBusinessStore.getState().businessId).toBeNull();
  await useActiveBusinessStore.getState().setBusinessId('b1', storage);
  expect(mem.get('activeBusinessId')).toBe('b1');
  useActiveBusinessStore.setState({ businessId: null, hydrated: false });
  await hydrateActiveBusiness(storage);
  expect(useActiveBusinessStore.getState().businessId).toBe('b1');
});
```
Run: `bun run test` → FAIL.

- [ ] **Step 2: Implement active.ts**

`src/features/business/active.ts`:
```ts
import { create } from 'zustand';
import Storage from 'expo-sqlite/kv-store';

export type KV = { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void>; removeItem(k: string): Promise<void> };
const KEY = 'activeBusinessId';
const defaultKV: KV = { getItem: (k) => Storage.getItem(k), setItem: (k, v) => Storage.setItem(k, v), removeItem: (k) => Storage.removeItem(k) };

type State = {
  businessId: string | null;
  hydrated: boolean;
  setBusinessId: (id: string | null, kv?: KV) => Promise<void>;
};

export const useActiveBusinessStore = create<State>((set) => ({
  businessId: null,
  hydrated: false,
  setBusinessId: async (id, kv = defaultKV) => {
    if (id) await kv.setItem(KEY, id); else await kv.removeItem(KEY);
    set({ businessId: id });
  },
}));

export async function hydrateActiveBusiness(kv: KV = defaultKV) {
  const id = await kv.getItem(KEY);
  useActiveBusinessStore.setState({ businessId: id, hydrated: true });
}

export const useActiveBusiness = () => useActiveBusinessStore();
```

- [ ] **Step 3: Implement api.ts**

`src/features/business/api.ts`:
```ts
import { supabase } from '@/src/lib/supabase';

export type Membership = {
  id: string; business_id: string; role: 'owner' | 'walker'; status: 'invited' | 'active' | 'inactive';
  business: { id: string; name: string; brand_color: string; time_zone: string; logo_path: string | null };
};

export async function listMyMemberships(): Promise<Membership[]> {
  const { data, error } = await supabase
    .from('memberships')
    .select('id, business_id, role, status, business:businesses(id, name, brand_color, time_zone, logo_path)')
    .eq('status', 'active');
  if (error) throw error;
  return (data ?? []) as unknown as Membership[];
}

export async function createBusiness(input: { name: string; timeZone: string; brandColor?: string }): Promise<string> {
  const { data, error } = await supabase.rpc('create_business', {
    p_name: input.name.trim(), p_time_zone: input.timeZone, p_brand_color: input.brandColor ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function createInvite(businessId: string, role: 'walker' | 'owner', contact: { phone?: string; email?: string }): Promise<string> {
  const { data, error } = await supabase.rpc('create_invite', {
    p_business: businessId, p_role: role, p_phone: contact.phone ?? null, p_email: contact.email ?? null,
  });
  if (error) throw error;
  return data as string;
}
```

- [ ] **Step 4: Onboarding screen**

`app/onboarding/create-business.tsx`:
```tsx
import { useState } from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import { getCalendars } from 'expo-localization';
import { useQueryClient } from '@tanstack/react-query';
import { createBusiness } from '@/src/features/business/api';
import { useActiveBusiness } from '@/src/features/business/active';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { TextField } from '@/src/ui/TextField';
import { useTheme } from '@/src/ui/theme';

export default function CreateBusiness() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const { setBusinessId } = useActiveBusiness();
  const deviceTz = getCalendars()[0]?.timeZone ?? 'UTC';
  const [name, setName] = useState('');
  const [tz, setTz] = useState(deviceTz);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) { setError('Give your business a name.'); return; }
    setBusy(true); setError(null);
    try {
      const id = await createBusiness({ name, timeZone: tz });
      await setBusinessId(id);
      await qc.invalidateQueries({ queryKey: ['memberships'] });
      router.replace('/');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Screen title="Set up your business">
      <Text style={{ color: t.colors.inkMuted }}>Clients will see this name on texts and reports.</Text>
      <TextField label="Business name" value={name} onChangeText={setName} error={error ?? undefined} />
      <TextField label="Time zone" value={tz} onChangeText={setTz} autoCapitalize="none" />
      <Button title="Create business" onPress={submit} loading={busy} />
    </Screen>
  );
}
```
Install: `bunx expo install expo-localization`.

- [ ] **Step 5: Verify and commit**

`bun run test` → PASS; `bun run typecheck` → clean. Manual on simulator with local Supabase: sign up → create business "Paw & Whisker" → redirected to `/` (which still bounces to onboarding until Task 10; confirm in Supabase Studio `http://127.0.0.1:54323` that `businesses`, `memberships`, and 8 `services` rows exist).
```bash
git add -A
git commit -m "feat(business): create business rpc client, active business store, onboarding

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Role-based routing and placeholder home screens

**Files:**
- Create: `app/(owner)/_layout.tsx`, `app/(owner)/today.tsx`, `app/(owner)/schedule.tsx`, `app/(owner)/clients.tsx`, `app/(owner)/team.tsx`, `app/(owner)/settings.tsx`, `app/(walker)/_layout.tsx`, `app/(walker)/today.tsx`, `app/(walker)/schedule.tsx`, `app/(walker)/clients.tsx`, `src/features/business/useMemberships.ts`, `src/features/business/__tests__/resolveHome.test.ts`, `src/features/business/resolveHome.ts`
- Modify: `app/index.tsx`, `app/_layout.tsx` (hydrate active business, apply accent)

**Interfaces:**
- Produces: `resolveHome(memberships: Membership[], activeId: string | null): { href: '/onboarding/create-business' | '/(owner)/today' | '/(walker)/today'; businessId: string | null }`; `useMemberships()` (react-query, key `['memberships']`).

- [ ] **Step 1: Failing test**

`src/features/business/__tests__/resolveHome.test.ts`:
```ts
import { resolveHome } from '../resolveHome';
import type { Membership } from '../api';

const m = (id: string, role: 'owner' | 'walker'): Membership => ({
  id: `m-${id}`, business_id: id, role, status: 'active',
  business: { id, name: id, brand_color: '#E8642C', time_zone: 'UTC', logo_path: null },
});

test('no memberships → onboarding', () => {
  expect(resolveHome([], null).href).toBe('/onboarding/create-business');
});
test('active id wins when still a member', () => {
  expect(resolveHome([m('a', 'walker'), m('b', 'owner')], 'a')).toEqual({ href: '/(walker)/today', businessId: 'a' });
});
test('stale active id falls back to first membership', () => {
  expect(resolveHome([m('b', 'owner')], 'zzz')).toEqual({ href: '/(owner)/today', businessId: 'b' });
});
```
Run → FAIL.

- [ ] **Step 2: Implement**

`src/features/business/resolveHome.ts`:
```ts
import type { Membership } from './api';

export type HomeHref = '/onboarding/create-business' | '/(owner)/today' | '/(walker)/today';

export function resolveHome(memberships: Membership[], activeId: string | null): { href: HomeHref; businessId: string | null } {
  if (!memberships.length) return { href: '/onboarding/create-business', businessId: null };
  const chosen = memberships.find((m) => m.business_id === activeId) ?? memberships[0]!;
  return { href: chosen.role === 'owner' ? '/(owner)/today' : '/(walker)/today', businessId: chosen.business_id };
}
```
`src/features/business/useMemberships.ts`:
```ts
import { useQuery } from '@tanstack/react-query';
import { listMyMemberships } from './api';
import { useSession } from '@/src/features/auth/session';

export function useMemberships() {
  const { status } = useSession();
  return useQuery({ queryKey: ['memberships'], queryFn: listMyMemberships, enabled: status === 'signed-in' });
}
```
`app/index.tsx`:
```tsx
import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useSession } from '@/src/features/auth/session';
import { useMemberships } from '@/src/features/business/useMemberships';
import { useActiveBusiness } from '@/src/features/business/active';
import { resolveHome } from '@/src/features/business/resolveHome';

export default function Index() {
  const { status } = useSession();
  const { businessId, hydrated, setBusinessId } = useActiveBusiness();
  const memberships = useMemberships();
  const ready = status !== 'loading' && hydrated && (status === 'signed-out' || memberships.isSuccess);
  const home = memberships.data ? resolveHome(memberships.data, businessId) : null;

  useEffect(() => {
    if (home && home.businessId && home.businessId !== businessId) void setBusinessId(home.businessId);
  }, [home?.businessId]);

  if (!ready) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  if (status === 'signed-out') return <Redirect href="/sign-in" />;
  return <Redirect href={home!.href} />;
}
```
In `app/_layout.tsx` add hydration and accent:
```tsx
// add imports
import { hydrateActiveBusiness, useActiveBusiness } from '@/src/features/business/active';
import { useMemberships } from '@/src/features/business/useMemberships';

function Providers({ children }: { children: React.ReactNode }) {
  const { businessId } = useActiveBusiness();
  const memberships = useMemberships();
  const accent = memberships.data?.find((m) => m.business_id === businessId)?.business.brand_color;
  return <ThemeProvider accent={accent}>{children}</ThemeProvider>;
}

// in RootLayout: useEffect(() => { void hydrateActiveBusiness(); return initSession(); }, []);
// and wrap <Stack/> in <Providers> instead of <ThemeProvider> (Providers must sit inside QueryClientProvider)
```
Apply those edits so the tree is `SafeAreaProvider > QueryClientProvider > Providers > Stack`.

- [ ] **Step 3: Tab layouts and placeholders**

`app/(owner)/_layout.tsx`:
```tsx
import { Redirect, Tabs } from 'expo-router';
import { useSession } from '@/src/features/auth/session';
import { useTheme } from '@/src/ui/theme';

export default function OwnerTabs() {
  const t = useTheme();
  const { status } = useSession();
  if (status === 'signed-out') return <Redirect href="/sign-in" />;
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: t.colors.primary, tabBarInactiveTintColor: t.colors.inkMuted,
      tabBarStyle: { backgroundColor: t.colors.surfaceRaised, borderTopColor: t.colors.line } }}>
      <Tabs.Screen name="today" options={{ title: 'Today' }} />
      <Tabs.Screen name="schedule" options={{ title: 'Schedule' }} />
      <Tabs.Screen name="clients" options={{ title: 'Clients' }} />
      <Tabs.Screen name="team" options={{ title: 'Team' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
```
`app/(walker)/_layout.tsx`:
```tsx
import { Redirect, Tabs } from 'expo-router';
import { useSession } from '@/src/features/auth/session';
import { useTheme } from '@/src/ui/theme';

export default function WalkerTabs() {
  const t = useTheme();
  const { status } = useSession();
  if (status === 'signed-out') return <Redirect href="/sign-in" />;
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: t.colors.primary, tabBarInactiveTintColor: t.colors.inkMuted,
      tabBarStyle: { backgroundColor: t.colors.surfaceRaised, borderTopColor: t.colors.line } }}>
      <Tabs.Screen name="today" options={{ title: 'Today' }} />
      <Tabs.Screen name="schedule" options={{ title: 'Schedule' }} />
      <Tabs.Screen name="clients" options={{ title: 'Clients' }} />
    </Tabs>
  );
}
```

Each placeholder screen (`today.tsx`, `schedule.tsx`, `clients.tsx`, `team.tsx`) for now:
```tsx
import { Text } from 'react-native';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';

export default function Today() {
  const t = useTheme();
  return <Screen title="Today"><Text style={{ color: t.colors.inkMuted }}>Nothing scheduled yet.</Text></Screen>;
}
```
(Change the title per file: Schedule, Clients, Team.)

`app/(owner)/settings.tsx`:
```tsx
import { Text } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { signOut } from '@/src/features/auth/session';
import { useActiveBusiness } from '@/src/features/business/active';
import { useMemberships } from '@/src/features/business/useMemberships';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';

export default function Settings() {
  const t = useTheme();
  const qc = useQueryClient();
  const { businessId, setBusinessId } = useActiveBusiness();
  const { data } = useMemberships();
  const current = data?.find((m) => m.business_id === businessId)?.business;
  return (
    <Screen title="Settings">
      <Card>
        <Text style={[t.type.title, { color: t.colors.ink }]}>{current?.name ?? '—'}</Text>
        <Text style={{ color: t.colors.inkMuted }}>{current?.time_zone}</Text>
      </Card>
      {data && data.length > 1 ? data.map((m) => (
        <Button key={m.id} title={`Switch to ${m.business.name}`} variant="secondary" onPress={() => void setBusinessId(m.business_id)} />
      )) : null}
      <Button title="Sign out" variant="ghost" onPress={() => signOut().then(() => { void setBusinessId(null); qc.clear(); })} />
    </Screen>
  );
}
```

- [ ] **Step 4: Verify and commit**

`bun run test` → PASS; `bun run typecheck` → clean (typed routes may require `bunx expo customize tsconfig.json` or a `bunx expo start` once to generate `.expo/types`). Manual: sign in as the owner from Task 9 → lands on owner Today with the orange tab bar; Settings shows "Paw & Whisker"; Sign out returns to sign-in.
```bash
git add -A
git commit -m "feat(app): role-based routing, owner and walker tab shells, settings

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Invitations — owner creates, invitee accepts via edge function

**Files:**
- Create: `supabase/functions/invite-accept/index.ts`, `supabase/functions/_shared/cors.ts`, `app/invite/[token].tsx`, `src/features/business/__tests__/inviteLink.test.ts`, `src/features/business/inviteLink.ts`
- Modify: `app/(owner)/team.tsx`, `supabase/tests/001_tenancy.sql` (add accept test → plan(11))

**Interfaces:**
- Consumes: `createInvite`, RPC `accept_invite` (service role only).
- Produces: `buildInviteLink(token: string): string` → `stridetail://invite/<token>`; edge function `POST /functions/v1/invite-accept { token }` with user JWT → `{ businessId }`.

- [ ] **Step 1: Failing tests**

`src/features/business/__tests__/inviteLink.test.ts`:
```ts
import { buildInviteLink, parseInviteToken } from '../inviteLink';

test('invite link round-trips the token', () => {
  const link = buildInviteLink('abc123');
  expect(link).toBe('stridetail://invite/abc123');
  expect(parseInviteToken(link)).toBe('abc123');
});
```
Append to `supabase/tests/001_tenancy.sql` before `finish()` and change `plan(10)` to `plan(12)`:
```sql
reset role;
select lives_ok($$ select accept_invite((select invite_token from memberships where invited_email = 'walker2@test.dev'), '00000000-0000-0000-0000-000000000003') $$, 'service role accepts invite');
select is((select status::text from memberships where user_id = '00000000-0000-0000-0000-000000000003'), 'active', 'accepted membership is active');
```
and, earlier in the owner section after the first invite, add a second invite: `select create_invite((select id from businesses limit 1), 'walker', null, 'walker2@test.dev');` (wrap in `lives_ok` is not needed; keep plan count at 12).
Run: `bun run test` → FAIL; `bun run db:test` → should PASS already for the SQL part (RPC exists) — confirm 12/12.

- [ ] **Step 2: Link helpers**

`src/features/business/inviteLink.ts`:
```ts
export const INVITE_SCHEME_PREFIX = 'stridetail://invite/';
export const buildInviteLink = (token: string) => `${INVITE_SCHEME_PREFIX}${token}`;
export function parseInviteToken(url: string): string | null {
  return url.startsWith(INVITE_SCHEME_PREFIX) ? url.slice(INVITE_SCHEME_PREFIX.length) : null;
}
```

- [ ] **Step 3: Edge function**

`supabase/functions/_shared/cors.ts`:
```ts
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
```
`supabase/functions/invite-accept/index.ts`:
```ts
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const auth = req.headers.get('Authorization') ?? '';
  const url = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return Response.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders });

  const { token } = await req.json().catch(() => ({}));
  if (typeof token !== 'string' || token.length < 16) return Response.json({ error: 'bad token' }, { status: 400, headers: corsHeaders });

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await admin.rpc('accept_invite', { p_token: token, p_user: user.id });
  if (error) return Response.json({ error: error.message }, { status: 400, headers: corsHeaders });
  return Response.json({ businessId: data }, { headers: corsHeaders });
});
```
Serve locally: `supabase functions serve invite-accept` (JWT verification is on by default).

- [ ] **Step 4: Accept screen and Team screen**

`app/invite/[token].tsx`:
```tsx
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { useSession } from '@/src/features/auth/session';
import { useActiveBusiness } from '@/src/features/business/active';
import { Screen } from '@/src/ui/Screen';
import { Button } from '@/src/ui/Button';
import { useTheme } from '@/src/ui/theme';
import Storage from 'expo-sqlite/kv-store';

export default function AcceptInvite() {
  const t = useTheme();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { status } = useSession();
  const { setBusinessId } = useActiveBusiness();
  const qc = useQueryClient();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (token) void Storage.setItem('pendingInvite', token); }, [token]);
  if (status === 'loading') return null;
  if (status === 'signed-out') return <Redirect href="/sign-up" />;

  async function accept() {
    setBusy(true); setError(null);
    const { data, error } = await supabase.functions.invoke<{ businessId: string }>('invite-accept', { body: { token } });
    setBusy(false);
    if (error || !data) { setError(error?.message ?? 'Could not accept invite'); return; }
    await Storage.removeItem('pendingInvite');
    await setBusinessId(data.businessId);
    await qc.invalidateQueries({ queryKey: ['memberships'] });
    router.replace('/');
  }

  return (
    <Screen title="You're invited">
      <Text style={{ color: t.colors.inkMuted }}>Join this team to see your visits and schedule.</Text>
      {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
      <Button title="Accept invite" onPress={accept} loading={busy} />
    </Screen>
  );
}
```
In `app/index.tsx`, before redirecting to home, check `Storage.getItem('pendingInvite')` and if present `Redirect` to `/invite/<token>` (so a user who had to sign up first returns to the invite).

`app/(owner)/team.tsx`:
```tsx
import { useState } from 'react';
import { Share, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { createInvite } from '@/src/features/business/api';
import { buildInviteLink } from '@/src/features/business/inviteLink';
import { useActiveBusiness } from '@/src/features/business/active';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { Screen } from '@/src/ui/Screen';
import { TextField } from '@/src/ui/TextField';
import { useTheme } from '@/src/ui/theme';

type Row = { id: string; role: string; status: string; invited_email: string | null; invited_phone: string | null; profile: { display_name: string | null } | null };

export default function Team() {
  const t = useTheme();
  const { businessId } = useActiveBusiness();
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const members = useQuery({
    queryKey: ['members', businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase.from('memberships')
        .select('id, role, status, invited_email, invited_phone, profile:profiles(display_name)').eq('business_id', businessId!);
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  async function invite() {
    if (!businessId || !contact.trim()) return;
    setBusy(true);
    try {
      const isEmail = contact.includes('@');
      const token = await createInvite(businessId, 'walker', isEmail ? { email: contact.trim() } : { phone: contact.trim() });
      await Share.share({ message: `Join my team on Stridetail: ${buildInviteLink(token)}` });
      setContact('');
      await members.refetch();
    } finally { setBusy(false); }
  }

  return (
    <Screen title="Team">
      {(members.data ?? []).map((m) => (
        <Card key={m.id}>
          <Text style={[t.type.body, { color: t.colors.ink }]}>{m.profile?.display_name ?? m.invited_email ?? m.invited_phone}</Text>
          <Text style={{ color: t.colors.inkMuted }}>{m.role} · {m.status}</Text>
        </Card>
      ))}
      <TextField label="Invite a walker (phone or email)" value={contact} onChangeText={setContact} autoCapitalize="none" />
      <Button title="Create invite link" onPress={invite} loading={busy} />
    </Screen>
  );
}
```
The `profiles` join requires a policy letting members read teammates' profiles; add to the migration (new file `supabase/migrations/20260823000002_profiles_visibility.sql`):
```sql
create policy "members read teammate profiles" on public.profiles for select
  using (user_id in (select user_id from public.memberships where business_id in (select public.current_business_ids())));
```
Then `bun run db:reset && bun run db:test`.

SMS delivery of the invite is wired in Plan 4 with `send-sms`; for now the owner shares the link via the system share sheet (recorded in `DEVIATIONS.md`).

- [ ] **Step 5: Verify and commit**

`bun run test` → PASS; `bun run db:test` → 12/12; `bun run typecheck` → clean. Manual: owner creates an invite → share sheet shows the link; on a second simulator/account open `stridetail://invite/<token>` → sign up → Accept → lands on walker Today; owner's Team screen shows the walker as active.
```bash
git add -A
git commit -m "feat(team): invite creation, invite-accept edge function, accept screen

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: CI and checkpoint records

**Files:**
- Create: `.github/workflows/ci.yml`, `DEVIATIONS.md`, `checkpoints.md`, `README.md`

- [ ] **Step 1: Workflow**

`.github/workflows/ci.yml`:
```yaml
name: ci
on: [push, pull_request]
jobs:
  app:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run typecheck
      - run: bun run lint
      - run: bun run test -- --ci
  db:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - run: supabase start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector
      - run: supabase test db
```

- [ ] **Step 2: Records and README**

`checkpoints.md` — copy the Checkpoint 1 evidence from Task 5 (device, iOS version, points before/after kill, meters, outbox count, screenshot path under `docs/evidence/`).

`DEVIATIONS.md` — list every place this plan was adjusted (plugin option names, invite delivery via share sheet, etc.).

`README.md`:
```markdown
# Stridetail

Mobile-first operations app for pet-care businesses. Expo SDK 57 + Supabase.

## Run locally
1. `bun install`
2. `supabase start` → copy API URL and anon key into `.env` (see `.env.example`)
3. `bun run db:reset`
4. `bunx expo start` (web/simulator). Background GPS needs a development build: `bunx eas-cli build --profile development --platform ios`.

## Checks
`bun run typecheck` · `bun run lint` · `bun run test` · `bun run db:test`

Design spec: `docs/superpowers/specs/2026-08-23-stridetail-slice1-design.md`
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: ci workflow, readme, checkpoint and deviation logs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Definition of done for Plan 1

- [ ] `bun run test`, `bun run typecheck`, `bun run lint`, `bun run db:test` all pass locally and in CI.
- [ ] Checkpoint 1 evidence recorded in `checkpoints.md`: airplane mode + 10-minute walk + force-kill + relaunch resumes with prior points; Finish leaves a non-empty outbox.
- [ ] A new user can sign up, create a business, see the owner tabs with the brand accent, invite a walker; the walker can accept on another device and sees the walker tabs.
- [ ] pgTAP proves: outsider sees no business/services; inactive invitee sees nothing; walker cannot read prices; service role can accept an invite.
- [ ] No service-role key, Twilio key, or hardcoded time zone anywhere in `app/` or `src/`.

## What Plan 2 picks up

Clients, pets, documents, `client_access` with `reveal_access` (use Supabase Vault / `pgcrypto` rather than pgsodium — pgsodium is deprecated on new projects; record the choice in the Plan 2 spec notes), and the owner Clients screens.
