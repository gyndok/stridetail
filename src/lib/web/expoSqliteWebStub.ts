// Web stand-in for `expo-sqlite` (Plan 4 Task 8), wired by metro.config.js
// for platform 'web' only. The SQLite outbox/track buffer is field-side by
// design (spec §8; Task 3 note in DEVIATIONS.md) and every runtime caller is
// behind a Platform.OS !== 'web' guard, so this module only needs to satisfy
// the import — calling into it is a bug, and it says so.

export function openDatabaseSync(name: string): never {
  throw new Error(`expo-sqlite is not available on web (openDatabaseSync('${name}'))`);
}
