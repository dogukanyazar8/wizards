import { sha256 } from "js-sha256";

import type { MobileEnvironmentName } from "../config/environment";
import type { MobileDeepLinkIntent } from "../deep-link/mobile-deep-links";

export type MobilePerformanceAutomationCommand = Extract<
  MobileDeepLinkIntent,
  { readonly type: "performance-automation" }
>;

type MobilePerformanceAutomationScope = "channel" | "dm";

export type MobilePerformanceAutomationDependencies = {
  readonly emit: (line: string) => void;
  readonly environment: MobileEnvironmentName;
  readonly exportReport: () => Promise<string>;
  readonly prefetch: (scope: MobilePerformanceAutomationScope, targetId: string) => Promise<void>;
  readonly purge: (scope: MobilePerformanceAutomationScope, targetId: string) => Promise<void>;
  readonly reset: () => Promise<void>;
};

const DEFAULT_REPORT_CHUNK_CHARS = 2_000;

export function createMobilePerformanceReportFrames(
  runId: string,
  report: string,
  chunkChars = DEFAULT_REPORT_CHUNK_CHARS,
): readonly string[] {
  if (!Number.isSafeInteger(chunkChars) || chunkChars <= 0) {
    throw new Error("Mobile performance report chunk size must be a positive integer.");
  }

  const encoded = encodeURIComponent(report);
  const chunks: string[] = [];
  for (let offset = 0; offset < encoded.length; offset += chunkChars) {
    chunks.push(encoded.slice(offset, offset + chunkChars));
  }
  if (chunks.length === 0) {
    chunks.push("");
  }

  return [
    `WHISPR_PERF|BEGIN|${runId}|${chunks.length}|${sha256(report)}`,
    ...chunks.map(
      (chunk, index) => `WHISPR_PERF|CHUNK|${runId}|${index}|${chunks.length}|${chunk}`,
    ),
    `WHISPR_PERF|END|${runId}`,
  ];
}

export function createMobilePerformanceAutomationExecutor(
  dependencies: MobilePerformanceAutomationDependencies,
): (command: MobilePerformanceAutomationCommand) => Promise<void> {
  return async (command) => {
    if (dependencies.environment !== "uat") {
      dependencies.emit(`WHISPR_PERF|ERROR|${command.runId}|${command.command}|uat-only`);
      return;
    }

    try {
      if (command.command === "reset") {
        await dependencies.reset();
      } else if (command.command === "purge") {
        await dependencies.purge(command.scope, command.targetId);
      } else if (command.command === "prefetch") {
        await dependencies.prefetch(command.scope, command.targetId);
      } else {
        const report = await dependencies.exportReport();
        for (const frame of createMobilePerformanceReportFrames(command.runId, report)) {
          dependencies.emit(frame);
        }
        return;
      }

      dependencies.emit(`WHISPR_PERF|ACK|${command.runId}|${command.command}`);
    } catch {
      dependencies.emit(`WHISPR_PERF|ERROR|${command.runId}|${command.command}|command-failed`);
    }
  };
}
