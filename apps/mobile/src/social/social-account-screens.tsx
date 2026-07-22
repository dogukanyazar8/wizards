import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";

import { Avatar, BottomSheet, Button, ListRow } from "../app/components/kit";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useThemedStyles } from "../app/providers/mobile-theme-provider";
import { useMobileAuth } from "../auth/mobile-auth-context";
import type { MobileTheme } from "../design/themes";
import { mobileNavigationRef } from "../navigation/mobile-navigation-ref";
import { useMobileFriendsQuery, useMobileSocialMutations } from "./mobile-social-query";
import type { MobileFriendPresenceStatus } from "./mobile-social-client";
import { MobileProfileAvatarEditor } from "./mobile-profile-avatar-editor";
import { mobileCopy } from "../locale/mobile-copy";

const createStyles = (theme: MobileTheme) => ({
  root: { flex: 1, backgroundColor: theme.surface.base },
  content: { gap: 16, padding: theme.spacing.page, paddingBottom: 40 },
  title: { ...theme.typography.title, color: theme.text.primary },
  subtitle: { ...theme.typography.body, color: theme.text.muted },
  actions: { gap: 10 },
  form: { gap: 10 },
  input: {
    minHeight: theme.sizing.minTouchTarget,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    borderRadius: theme.radii.control,
    backgroundColor: theme.surface.card,
    color: theme.text.primary,
    paddingHorizontal: 14,
  },
  sheet: { gap: 8 },
  list: { borderRadius: theme.radii.card, overflow: "hidden" as const },
});

export function SocialAccountQuickActions() {
  const { apiClient, status } = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const styles = useThemedStyles(createStyles);
  const t = mobileCopy[locale];
  const [open, setOpen] = useState(false);
  const mutations = useMobileSocialMutations(apiClient);
  const statuses: MobileFriendPresenceStatus[] = ["ONLINE", "IDLE", "DND", "OFFLINE"];
  const presenceLabels = {
    DND: t.socialAccountStatusDnd,
    IDLE: t.socialAccountStatusIdle,
    OFFLINE: t.socialAccountStatusOffline,
    ONLINE: t.socialAccountStatusOnline,
  } as const;
  if (status !== "signed-in") return null;
  return (
    <View style={styles.actions} testID="mobile-social-account-actions">
      <Button
        label={t.socialAccountEdit}
        icon="person-outline"
        onPress={() => mobileNavigationRef.isReady() && mobileNavigationRef.navigate("ProfileEdit")}
        testID="mobile-profile-edit-open"
      />
      <Button
        label={t.socialAccountPresence}
        icon="radio-button-on-outline"
        variant="secondary"
        onPress={() => setOpen(true)}
        testID="mobile-presence-open"
      />
      <Button
        label={t.socialAccountBlocked}
        icon="ban-outline"
        variant="secondary"
        onPress={() =>
          mobileNavigationRef.isReady() && mobileNavigationRef.navigate("BlockedUsers")
        }
        testID="mobile-blocked-users-open"
      />
      <BottomSheet
        accessibilityLabel={t.socialAccountPresence}
        onClose={() => setOpen(false)}
        open={open}
        testID="mobile-presence-sheet"
      >
        <View style={styles.sheet}>
          {statuses.map((presence) => (
            <Button
              key={presence}
              busy={mutations.updatePresence.isPending}
              label={presenceLabels[presence]}
              variant="secondary"
              onPress={() =>
                void mutations.updatePresence.mutateAsync(presence).then(() => setOpen(false))
              }
              testID={`mobile-presence-${presence.toLowerCase()}`}
            />
          ))}
        </View>
      </BottomSheet>
    </View>
  );
}

/**
 * Superseded by MobileProfileEditScreen, which follows the settings design language.
 * Kept for the avatar-editor contract tests until those move to the new screen.
 */
export function ProfileEditScreen({ onBack }: { onBack(): void }) {
  const { apiClient, replaceSessionUser, session } = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const styles = useThemedStyles(createStyles);
  const t = mobileCopy[locale];
  const mutations = useMobileSocialMutations(apiClient);
  const [displayName, setDisplayName] = useState(session?.user.displayName ?? "");
  const [username, setUsername] = useState(session?.user.username ?? "");
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      testID="mobile-profile-edit-screen"
    >
      <Text style={styles.title}>{t.socialAccountTitle}</Text>
      <MobileProfileAvatarEditor
        replaceSessionUser={replaceSessionUser}
        user={session?.user ?? null}
      />
      <View style={styles.form}>
        <TextInput
          accessibilityLabel={t.socialAccountDisplayName}
          onChangeText={setDisplayName}
          placeholder={t.socialAccountDisplayName}
          style={styles.input}
          value={displayName}
          testID="mobile-profile-display-name"
        />
        <TextInput
          accessibilityLabel={t.socialAccountUsername}
          autoCapitalize="none"
          onChangeText={setUsername}
          placeholder={t.socialAccountUsername}
          style={styles.input}
          value={username}
          testID="mobile-profile-username"
        />
      </View>
      <Button
        busy={mutations.updateProfile.isPending}
        disabled={username.trim().length < 2}
        label={t.socialAccountSave}
        onPress={() =>
          void mutations.updateProfile
            .mutateAsync({ displayName, username: username.trim() })
            .then(onBack)
        }
        testID="mobile-profile-save"
      />
      <Button label={t.socialAccountBack} variant="ghost" onPress={onBack} />
    </ScrollView>
  );
}

export function BlockedUsersScreen({ onBack }: { onBack(): void }) {
  const { apiClient, status } = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const styles = useThemedStyles(createStyles);
  const t = mobileCopy[locale];
  const query = useMobileFriendsQuery(apiClient, status === "signed-in");
  const mutations = useMobileSocialMutations(apiClient);
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      testID="mobile-blocked-users-screen"
    >
      <Text style={styles.title}>{t.socialAccountBlocked}</Text>
      <View style={styles.list}>
        {query.data?.blocked.map((user) => (
          <ListRow
            key={user.id}
            leading={
              <Avatar
                imageUrl={user.avatarUrl}
                label={user.displayName ?? user.username}
                size="sm"
              />
            }
            title={user.displayName ?? user.username}
            subtitle={`@${user.username}`}
            trailing={
              <Button
                busy={mutations.unblockFriend.isPending}
                label={t.socialAccountUnblock}
                variant="ghost"
                onPress={() => mutations.unblockFriend.mutate(user.id)}
              />
            }
          />
        ))}
      </View>
      {!query.isLoading && (query.data?.blocked.length ?? 0) === 0 ? (
        <Text style={styles.subtitle}>{t.socialAccountBlockedEmpty}</Text>
      ) : null}
      <Button label={t.socialAccountBack} variant="ghost" onPress={onBack} />
    </ScrollView>
  );
}
