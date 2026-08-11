type E2ETestModeInput = {
  allowProductionBuild: string | undefined;
  nodeEnv: string | undefined;
  testMode: string | undefined;
};

export function isExplicitE2ETestMode(input: E2ETestModeInput): boolean {
  return (
    input.testMode === "true" &&
    (input.nodeEnv !== "production" || input.allowProductionBuild === "true")
  );
}
