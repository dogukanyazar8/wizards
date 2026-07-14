import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { Avatar, Button, ContextMenu, ListRow } from "../app/components/kit";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme, useThemedStyles } from "../app/providers/mobile-theme-provider";
import { useMobileAuth } from "../auth/mobile-auth-context";
import type { MobileTheme } from "../design/themes";
import { mobileNavigationRef } from "../navigation/mobile-navigation-ref";
import { useMobileFriendsQuery, useMobileSocialMutations } from "./mobile-social-query";

const socialCopy = {
  tr: {
    accept: "Kabul et",
    add: "Arkadaş ekle",
    block: "Engelle",
    blocked: "Engellenenler",
    empty: "Henüz arkadaşın yok.",
    error: "Arkadaşlar yüklenemedi.",
    friend: "Arkadaşlar",
    incoming: "Gelen istekler",
    open: "Mesaj gönder",
    outgoing: "Gönderilen istekler",
    placeholder: "Kullanıcı adı",
    reject: "Reddet",
    remove: "Arkadaşlıktan çıkar",
    retry: "Tekrar dene",
    search: "Kullanıcı ara ve istek gönder",
    sent: "İstek gönderildi",
    statusDnd: "Rahatsız etmeyin",
    statusIdle: "Boşta",
    statusOffline: "Çevrimdışı",
    statusOnline: "Çevrimiçi",
    subtitle: "Çevrimiçi arkadaşlarını ve isteklerini yönet.",
  },
  en: {
    accept: "Accept",
    add: "Add friend",
    block: "Block",
    blocked: "Blocked users",
    empty: "You do not have friends yet.",
    error: "Friends could not be loaded.",
    friend: "Friends",
    incoming: "Incoming requests",
    open: "Message",
    outgoing: "Sent requests",
    placeholder: "Username",
    reject: "Reject",
    remove: "Remove friend",
    retry: "Try again",
    search: "Find a user and send a request",
    sent: "Request sent",
    statusDnd: "Do not disturb",
    statusIdle: "Idle",
    statusOffline: "Offline",
    statusOnline: "Online",
    subtitle: "Manage online friends and requests.",
  },
} as const;

const createStyles = (theme: MobileTheme) => ({
  root: { flex: 1, minHeight: 320 },
  content: { gap: 14, paddingBottom: 24 },
  heading: { ...theme.typography.title, color: theme.text.primary },
  subtitle: { ...theme.typography.body, color: theme.text.muted },
  search: { flexDirection: "row" as const, gap: 8 },
  input: {
    flex: 1,
    minHeight: theme.sizing.minTouchTarget,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    borderRadius: theme.radii.control,
    backgroundColor: theme.surface.card,
    color: theme.text.primary,
    paddingHorizontal: 14,
  },
  section: { gap: 8, borderRadius: theme.radii.card, overflow: "hidden" as const },
  sectionTitle: { ...theme.typography.bodyStrong, color: theme.text.secondary },
  actions: { flexDirection: "row" as const, gap: 6, paddingRight: 8 },
  action: { minHeight: 36, paddingHorizontal: 10, justifyContent: "center" as const },
  actionText: { ...theme.typography.caption, color: theme.accent.strong },
  danger: { color: theme.status.danger },
  notice: { ...theme.typography.body, color: theme.text.muted, paddingVertical: 12 },
  error: { color: theme.status.danger },
});

export function FriendsHub() {
  const { apiClient, status } = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const t = socialCopy[locale];
  const query = useMobileFriendsQuery(apiClient, status === "signed-in");
  const mutations = useMobileSocialMutations(apiClient);
  const [username, setUsername] = useState("");
  const busy = Object.values(mutations).some((mutation) => mutation.isPending);
  const friends = useMemo(() => query.data?.friends ?? [], [query.data]);
  const presenceLabels = {
    DND: t.statusDnd,
    IDLE: t.statusIdle,
    OFFLINE: t.statusOffline,
    ONLINE: t.statusOnline,
  } as const;

  const openDM = async (userId: string) => {
    const result = await mutations.openDM.mutateAsync(userId);
    if (mobileNavigationRef.isReady()) {
      mobileNavigationRef.navigate("DirectMessage", { conversationId: result.conversation.id });
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      style={styles.root}
      testID="mobile-friends-screen"
    >
      <View>
        <Text style={styles.heading}>{t.friend}</Text>
        <Text style={styles.subtitle}>{t.subtitle}</Text>
      </View>
      <View style={styles.search}>
        <TextInput
          accessibilityLabel={t.search}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setUsername}
          placeholder={t.placeholder}
          placeholderTextColor={theme.text.soft}
          style={styles.input}
          testID="mobile-friend-search-input"
          value={username}
        />
        <Button
          busy={mutations.createRequest.isPending}
          disabled={username.trim().length < 2}
          label={t.add}
          onPress={() =>
            void mutations.createRequest.mutateAsync(username).then(() => setUsername(""))
          }
          testID="mobile-friend-request-submit"
        />
      </View>
      {query.isLoading ? <ActivityIndicator color={theme.accent.default} /> : null}
      {query.isError ? (
        <Pressable onPress={() => void query.refetch()}>
          <Text style={[styles.notice, styles.error]}>
            {t.error} {t.retry}
          </Text>
        </Pressable>
      ) : null}
      {(query.data?.pending.incoming.length ?? 0) > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.incoming}</Text>
          {query.data?.pending.incoming.map((request) => (
            <ListRow
              key={request.id}
              leading={
                <Avatar
                  imageUrl={request.sender.avatarUrl}
                  label={request.sender.displayName ?? request.sender.username}
                  size="sm"
                />
              }
              title={request.sender.displayName ?? request.sender.username}
              subtitle={`@${request.sender.username}`}
              trailing={
                <View style={styles.actions}>
                  <Pressable
                    disabled={busy}
                    onPress={() => mutations.acceptRequest.mutate(request.id)}
                    style={styles.action}
                  >
                    <Text style={styles.actionText}>{t.accept}</Text>
                  </Pressable>
                  <Pressable
                    disabled={busy}
                    onPress={() => mutations.rejectRequest.mutate(request.id)}
                    style={styles.action}
                  >
                    <Text style={[styles.actionText, styles.danger]}>{t.reject}</Text>
                  </Pressable>
                </View>
              }
            />
          ))}
        </View>
      ) : null}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t.friend}</Text>
        {friends.map((friend) => (
          <ContextMenu
            key={friend.id}
            accessibilityLabel={friend.displayName ?? friend.username}
            actions={[
              {
                id: "message",
                label: t.open,
                icon: "chatbubble-outline",
                onPress: () => void openDM(friend.id),
              },
              {
                id: "remove",
                label: t.remove,
                icon: "person-remove-outline",
                destructive: true,
                onPress: () => mutations.removeFriend.mutate(friend.id),
              },
              {
                id: "block",
                label: t.block,
                icon: "ban-outline",
                destructive: true,
                onPress: () => mutations.blockFriend.mutate(friend.id),
              },
            ]}
            onPress={() => void openDM(friend.id)}
            testID={`mobile-friend-${friend.id}`}
          >
            <ListRow
              leading={
                <Avatar
                  imageUrl={friend.avatarUrl}
                  label={friend.displayName ?? friend.username}
                  size="md"
                  status={friend.status === "ONLINE" ? "active" : "idle"}
                />
              }
              title={friend.displayName ?? friend.username}
              subtitle={`${presenceLabels[friend.status]} · ${friend.customStatus ?? `@${friend.username}`}`}
            />
          </ContextMenu>
        ))}
        {!query.isLoading && friends.length === 0 ? (
          <Text style={styles.notice}>{t.empty}</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}
