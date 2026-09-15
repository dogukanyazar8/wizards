/** Resolve the package manager selected by pnpm without invoking a shell. */
export function pnpmInvocation(cliPath, args, nodeExecutable = process.execPath) {
  if (!cliPath) throw new Error("This command must be launched through pnpm");
  return /\.(?:cjs|mjs|js)$/iu.test(cliPath)
    ? { command: nodeExecutable, args: [cliPath, ...args] }
    : { command: cliPath, args: [...args] };
}
