export function pnpmInvocation(
  cliPath: string | undefined,
  args: readonly string[],
  nodeExecutable?: string,
): { command: string; args: string[] };
