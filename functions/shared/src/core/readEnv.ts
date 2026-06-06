export function readEnv(name: string): string {
  const pe =
    typeof globalThis !== 'undefined' && globalThis.process?.env
      ? globalThis.process.env[name]
      : undefined;
  return pe != null ? String(pe).trim() : '';
}
