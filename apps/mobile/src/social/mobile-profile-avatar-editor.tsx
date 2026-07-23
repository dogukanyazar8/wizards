import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { Avatar, Button } from "../app/components/kit";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useThemedStyles } from "../app/providers/mobile-theme-provider";
import type { MobileTheme } from "../design/themes";
import { mobileProfileAvatarEditorCopy } from "../locale/mobile-profile-avatar-editor-copy";
import { useMobileImageUpload } from "../media/use-mobile-image-upload";
import { patchMobileProfileAvatarCaches } from "../query/mobile-profile-cache";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import type { MobileSessionUser } from "../auth/session-types";

const createStyles = (theme: MobileTheme) => ({
  root: { alignItems: "center" as const, gap: 10 },
  error: {
    ...theme.typography.caption,
    color: theme.status.dangerOnBase,
    textAlign: "center" as const,
  },
  status: { ...theme.typography.caption, color: theme.text.muted, textAlign: "center" as const },
  warning: {
    ...theme.typography.caption,
    color: theme.status.warning,
    textAlign: "center" as const,
  },
});

export interface MobileProfileAvatarEditorProps {
  readonly replaceSessionUser: (user: MobileSessionUser) => Promise<boolean>;
  readonly user: MobileSessionUser | null;
}

export function MobileProfileAvatarEditor({
  replaceSessionUser,
  user,
}: MobileProfileAvatarEditorProps) {
  const { locale } = useMobileLocaleRuntime();
  const queryClient = useQueryClient();
  const styles = useThemedStyles(createStyles);
  const { isBusy, selectAndUpload } = useMobileImageUpload();
  const [canonicalAvatarUrl, setCanonicalAvatarUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localPreviewUri, setLocalPreviewUri] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const copy = mobileProfileAvatarEditorCopy[locale];
  const avatarUrl = canonicalAvatarUrl ?? localPreviewUri ?? user?.avatarUrl ?? null;

  const uploadAvatar = useCallback(async () => {
    if (!user || isBusy) {
      return;
    }

    setError(null);
    setSyncWarning(null);
    const result = await selectAndUpload({ purpose: "profile-avatar" }, setLocalPreviewUri);

    if (result.status === "cancelled") {
      setLocalPreviewUri(null);
      return;
    }

    if (result.status === "error") {
      setLocalPreviewUri(null);
      setError(copy.failed);
      return;
    }

    if (result.response.purpose !== "profile-avatar" || result.response.profile.id !== user.id) {
      setLocalPreviewUri(null);
      setError(copy.syncFailed);
      return;
    }

    const profile = result.response.profile;
    patchMobileProfileAvatarCaches({
      avatarUrl: profile.avatarUrl,
      queryClient,
      userId: profile.id,
    });
    setCanonicalAvatarUrl(profile.avatarUrl);
    setLocalPreviewUri(null);

    let sessionReplaced = false;
    try {
      sessionReplaced = await replaceSessionUser({
        avatarUrl: profile.avatarUrl,
        displayName: profile.displayName,
        id: profile.id,
        username: profile.username,
      });
    } catch {
      sessionReplaced = false;
    }

    if (!sessionReplaced) {
      setSyncWarning(copy.syncing);
    }

    void queryClient.invalidateQueries({ exact: true, queryKey: mobileQueryKeys.bootstrap() });
    void queryClient.invalidateQueries({ exact: true, queryKey: mobileQueryKeys.profile() });
    void queryClient.invalidateQueries({ exact: true, queryKey: mobileQueryKeys.friends() });
  }, [
    isBusy,
    queryClient,
    replaceSessionUser,
    selectAndUpload,
    copy.failed,
    copy.syncFailed,
    copy.syncing,
    user,
  ]);

  return (
    <View style={styles.root}>
      <Avatar
        imageUrl={avatarUrl}
        label={user?.displayName ?? user?.username ?? "Whispr"}
        size="lg"
        testID="mobile-profile-avatar-preview"
      />
      <Button
        busy={isBusy}
        disabled={!user}
        label={copy.picker}
        onPress={() => void uploadAvatar()}
        testID="mobile-profile-avatar-picker"
        variant="secondary"
      />
      <Text style={styles.status} testID="mobile-profile-avatar-upload-status">
        {isBusy ? copy.uploading : (syncWarning ?? copy.ready)}
      </Text>
      {error ? (
        <Text style={styles.error} testID="mobile-profile-avatar-error">
          {error}
        </Text>
      ) : null}
      {syncWarning ? <Text style={styles.warning}>{syncWarning}</Text> : null}
      {error ? (
        <Button
          disabled={isBusy}
          label={copy.retry}
          onPress={() => void uploadAvatar()}
          testID="mobile-profile-avatar-retry"
          variant="ghost"
        />
      ) : null}
    </View>
  );
}
