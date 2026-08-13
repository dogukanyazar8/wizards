export interface MobileAccountExportShareDependencies {
  readonly getContentUri: (fileUri: string) => Promise<string>;
  readonly platform: "android" | "ios";
  readonly shareIos: (fileUri: string) => Promise<void>;
  readonly startAndroidActivity: (
    action: string,
    params: {
      extra: Record<string, string>;
      flags: number;
      type: string;
    },
  ) => Promise<void>;
}

export async function shareMobileAccountExport(
  fileUri: string,
  dependencies: MobileAccountExportShareDependencies,
): Promise<void> {
  if (!fileUri.startsWith("file://")) throw new Error("Account export file is unavailable.");
  if (dependencies.platform === "ios") {
    await dependencies.shareIos(fileUri);
    return;
  }

  const contentUri = await dependencies.getContentUri(fileUri);
  await dependencies.startAndroidActivity("android.intent.action.SEND", {
    extra: { "android.intent.extra.STREAM": contentUri },
    flags: 1,
    type: "application/json",
  });
}
