import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
const harnessPath = fileURLToPath(new URL("./measure-windows-desktop.ps1", import.meta.url));

if (process.platform !== "win32") {
  console.error("measure:windows can run only on Windows.");
  process.exitCode = 1;
} else {
  const child = spawn("powershell.exe", ["-NoProfile", "-File", harnessPath, ...args], {
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  });

  child.once("error", (error) => {
    console.error(`Unable to start Windows measurement harness: ${error.message}`);
    process.exitCode = 1;
  });
  child.once("close", (code) => {
    process.exitCode = code ?? 1;
  });
}
