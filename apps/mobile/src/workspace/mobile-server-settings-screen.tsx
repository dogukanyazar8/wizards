import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { useMobileAuth } from "../auth/mobile-auth-context";
import { Button, Card, DestructiveConfirmationSheet } from "../app/components/kit";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useThemedStyles } from "../app/providers/mobile-theme-provider";
import { useMobileImageUpload } from "../media/use-mobile-image-upload";
import { patchMobileServerIconCaches } from "../query/mobile-server-cache";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import { useMobileServerManagementMutations } from "../query/use-mobile-server-management-mutations";
import { useMobileWorkspaceQuery } from "../query/mobile-workspace-query";
import { createMobileServerManagementStyles } from "./mobile-server-management.styles";
import {
  MobileWorkspaceEditorSheets,
  type MobileWorkspaceEditorState,
} from "./mobile-workspace-editor-sheets";

export interface MobileServerSettingsScreenProps {
  readonly serverId: string;
  onBack(): void;
  onOpenChannelSettings(channelId: string): void;
  onOpenMembers(): void;
}

const copy = {
  en: {
    back: "Back",
    channelSuffix: "channels",
    channelSettings: "channel settings",
    channels: "Channels",
    createCategory: "Create category",
    createChannel: "Create channel",
    delete: "Delete server",
    deleteBody:
      "This permanently deletes the server and its visible mobile data. Type the server name to continue.",
    deleted: "The server was deleted.",
    editIcon: "Choose server icon",
    edit: "Edit",
    error: "This server action could not be completed. Please try again.",
    loading: "Loading server settings…",
    memberSuffix: "members",
    members: "Manage members",
    name: "Server name",
    save: "Save changes",
    saved: "Server settings saved.",
    title: "Server settings",
  },
  tr: {
    back: "Geri",
    channelSuffix: "kanal",
    channelSettings: "kanal ayarları",
    channels: "Kanallar",
    createCategory: "Kategori oluştur",
    createChannel: "Kanal oluştur",
    delete: "Sunucuyu sil",
    deleteBody:
      "Bu işlem sunucuyu ve mobilde görünen verilerini kalıcı olarak siler. Devam etmek için sunucu adını yazın.",
    deleted: "Sunucu silindi.",
    editIcon: "Sunucu simgesi seç",
    edit: "Düzenle",
    error: "Sunucu işlemi tamamlanamadı. Lütfen yeniden deneyin.",
    loading: "Sunucu ayarları yükleniyor…",
    memberSuffix: "üye",
    members: "Üyeleri yönet",
    name: "Sunucu adı",
    save: "Değişiklikleri kaydet",
    saved: "Sunucu ayarları kaydedildi.",
    title: "Sunucu ayarları",
  },
} as const;

function getBoundedServerName(value: string): string | null {
  const name = value.trim();
  return name.length >= 2 && name.length <= 64 ? name : null;
}

export function MobileServerSettingsScreen({
  onBack,
  onOpenChannelSettings,
  onOpenMembers,
  serverId,
}: MobileServerSettingsScreenProps) {
  const { apiClient } = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const labels = copy[locale];
  const styles = useThemedStyles(createMobileServerManagementStyles);
  const queryClient = useQueryClient();
  const workspace = useMobileWorkspaceQuery(apiClient, serverId);
  const mutations = useMobileServerManagementMutations(apiClient);
  const { isBusy: isUploadingIcon, selectAndUpload } = useMobileImageUpload();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editor, setEditor] = useState<MobileWorkspaceEditorState>(null);
  const [iconPreviewUri, setIconPreviewUri] = useState<string | null>(null);

  const detail = workspace.data?.detail;
  const server = detail?.server;
  const capabilities = detail?.capabilities;
  const canManageServer = capabilities?.canManageServer === true;
  const canManageChannels = capabilities?.canManageChannels === true;

  useEffect(() => {
    if (server) {
      setName(server.name);
    }
  }, [server]);

  const groupedChannels = useMemo(
    () => [
      ...(detail?.categories.flatMap((category) => category.channels) ?? []),
      ...(detail?.ungroupedChannels ?? []),
    ],
    [detail?.categories, detail?.ungroupedChannels],
  );

  const saveName = async () => {
    const nextName = getBoundedServerName(name);
    if (!server || !nextName || nextName === server.name || mutations.updateServer.isPending) {
      return;
    }

    setError(null);
    setNotice(null);
    try {
      await mutations.updateServer.mutateAsync({ name: nextName, serverId });
      setNotice(labels.saved);
    } catch {
      setError(labels.error);
    }
  };

  const uploadIcon = async () => {
    if (!capabilities?.canUploadServerIcon || isUploadingIcon) {
      return;
    }

    setError(null);
    let outcome;
    try {
      outcome = await selectAndUpload(
        { purpose: "server-icon", targetServerId: serverId },
        setIconPreviewUri,
      );
    } catch {
      setIconPreviewUri(null);
      setError(labels.error);
      return;
    }
    if (
      outcome.status !== "claimed" ||
      outcome.response.purpose !== "server-icon" ||
      outcome.response.server.id !== serverId
    ) {
      setIconPreviewUri(null);
      setError(labels.error);
      return;
    }

    patchMobileServerIconCaches({
      iconUrl: outcome.response.server.iconUrl,
      queryClient,
      serverId,
    });
    void queryClient.invalidateQueries({ exact: true, queryKey: mobileQueryKeys.bootstrap() });
    void queryClient.invalidateQueries({
      exact: true,
      queryKey: mobileQueryKeys.workspace(serverId),
    });
    setIconPreviewUri(outcome.response.server.iconUrl);
    setNotice(labels.saved);
  };

  const deleteServer = async () => {
    if (!server) {
      return;
    }

    setError(null);
    try {
      await mutations.deleteServer.mutateAsync({ name: server.name, serverId });
      setDeleteOpen(false);
      setNotice(labels.deleted);
      onBack();
    } catch {
      setError(labels.error);
      throw new Error("mobile-server-delete-failed");
    }
  };

  if (workspace.isLoading) {
    return (
      <View style={styles.root} testID="mobile-server-settings-screen">
        <View style={styles.content}>
          <ActivityIndicator />
          <Text style={styles.body}>{labels.loading}</Text>
        </View>
      </View>
    );
  }

  if (!server || workspace.isError) {
    return (
      <ScrollView
        contentContainerStyle={styles.content}
        style={styles.root}
        testID="mobile-server-settings-screen"
      >
        <Text style={styles.title}>{labels.title}</Text>
        <Text accessibilityRole="alert" style={styles.error} testID="mobile-server-settings-error">
          {labels.error}
        </Text>
        <Button
          label={labels.back}
          onPress={onBack}
          testID="mobile-server-settings-back"
          variant="ghost"
        />
      </ScrollView>
    );
  }

  const normalizedName = getBoundedServerName(name);
  const isNameChanged = normalizedName !== null && normalizedName !== server.name;
  const shownIcon = iconPreviewUri ?? server.iconUrl;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      style={styles.root}
      testID="mobile-server-settings-screen"
    >
      <Button
        label={labels.back}
        onPress={onBack}
        testID="mobile-server-settings-back"
        variant="ghost"
      />
      <Text style={styles.title}>{labels.title}</Text>
      <Card style={styles.card}>
        <View style={styles.row}>
          {shownIcon ? (
            <Image source={{ uri: shownIcon }} style={styles.icon} />
          ) : (
            <View style={styles.icon} />
          )}
          <View style={styles.rowBody}>
            <Text style={styles.sectionTitle}>{server.name}</Text>
            <Text style={styles.caption}>
              {server.memberCount} {labels.memberSuffix}
            </Text>
          </View>
        </View>
        {capabilities?.canUploadServerIcon ? (
          <Button
            busy={isUploadingIcon}
            label={labels.editIcon}
            onPress={() => void uploadIcon()}
            testID="mobile-server-icon-picker"
            variant="secondary"
          />
        ) : null}
      </Card>
      {canManageServer ? (
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{labels.name}</Text>
          <TextInput
            accessibilityLabel={labels.name}
            autoCapitalize="words"
            autoCorrect
            maxLength={64}
            onChangeText={setName}
            style={styles.input}
            testID="mobile-server-settings-name"
            value={name}
          />
          <Button
            busy={mutations.updateServer.isPending}
            disabled={!isNameChanged}
            label={labels.save}
            onPress={() => void saveName()}
            testID="mobile-server-settings-save"
          />
        </Card>
      ) : null}
      {capabilities?.canManageRoles || capabilities?.canKickMembers ? (
        <Button
          label={labels.members}
          onPress={onOpenMembers}
          testID={`mobile-server-members-open-${serverId}`}
          variant="secondary"
        />
      ) : null}
      {canManageChannels ? (
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{labels.channels}</Text>
          <Button
            label={labels.createCategory}
            onPress={() => setEditor({ kind: "category-create" })}
            testID="mobile-category-create-open"
            variant="secondary"
          />
          <Button
            label={labels.createChannel}
            onPress={() => setEditor({ kind: "channel-create" })}
            testID="mobile-channel-create-open"
            variant="secondary"
          />
          {detail.categories.map((category) => (
            <View key={category.id} style={styles.channelRow}>
              <View style={styles.rowBody}>
                <Text style={styles.body}>{category.name}</Text>
                <Text style={styles.caption}>
                  {category.channels.length} {labels.channelSuffix}
                </Text>
              </View>
              <Button
                label={labels.edit}
                onPress={() =>
                  setEditor({
                    categoryId: category.id,
                    initialName: category.name,
                    kind: "category-edit",
                  })
                }
                testID={`mobile-category-${category.id}-edit`}
                variant="ghost"
              />
            </View>
          ))}
          {groupedChannels.map((channel) => (
            <Pressable
              accessibilityLabel={`${channel.name} ${labels.channelSettings}`}
              accessibilityRole="button"
              key={channel.id}
              onPress={() => onOpenChannelSettings(channel.id)}
              style={styles.channelRow}
              testID={`mobile-channel-settings-open-${channel.id}`}
            >
              <View style={styles.rowBody}>
                <Text style={styles.body}>{channel.name}</Text>
                <Text style={styles.caption}>{channel.type}</Text>
              </View>
            </Pressable>
          ))}
        </Card>
      ) : null}
      {canManageServer && capabilities?.canDeleteServer ? (
        <Button
          label={labels.delete}
          onPress={() => setDeleteOpen(true)}
          testID="mobile-server-delete-open"
          variant="danger"
        />
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error} testID="mobile-server-settings-error">
          {error}
        </Text>
      ) : null}
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={styles.success}>
          {notice}
        </Text>
      ) : null}
      <MobileWorkspaceEditorSheets
        detail={detail}
        editor={editor}
        onClose={() => setEditor(null)}
        serverId={serverId}
      />
      <DestructiveConfirmationSheet
        body={labels.deleteBody}
        busy={mutations.deleteServer.isPending}
        confirmLabel={labels.delete}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={deleteServer}
        open={deleteOpen}
        requiredText={server.name}
        testID="mobile-server-delete-confirm"
        title={labels.delete}
      />
    </ScrollView>
  );
}
