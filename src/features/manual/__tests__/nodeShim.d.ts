// tsconfig deliberately limits ambient type packages to ["jest"], so
// @types/node's module declarations are not loaded project-wide. This shim
// types just the two node builtins the source-order nav test needs (jest runs
// in node, where the real modules exist); it merges harmlessly if node types
// are ever enabled.
declare module 'fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function existsSync(path: string): boolean;
}
declare module 'path' {
  export function join(...parts: string[]): string;
}
