import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, View } from "react-native";

import { useMobileAuth } from "../auth/mobile-auth-context";
import { Button, Card, DestructiveConfirmationSheet } from "../app/components/kit";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useThemedStyles } from "../app/providers/mobile-theme-provider";
import { useMobileServerManagementMutations } from "../query/use-mobile-server-management-mutations";
import { useMobileWorkspaceQuery } from "../query/mobile-workspace-query";
import { createMobileServerManagementStyles } from "./mobile-server-management.styles";
import { mobileCopy } from "../locale/mobile-copy";

export interface MobileChannelSettingsScreenProps {
  readonly channelId: string;
  readonly serverId: string;
  onBack(): void;
}

function normalizeName(value: string) {
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= 48 ? trimmed : null;
}

function normalizeTopic(value: string) {
  const trimmed = value.trim();
  return trimmed.length <= 120 ? trimmed : null;
}

export function MobileChannelSettingsScreen({
  channelId,
  onBack,
  serverId,
}: MobileChannelSettingsScreenProps) {
  const { apiClient } = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const labels = mobileCopy[locale];
  const styles = useThemedStyles(createMobileServerManagementStyles);
  const workspace = useMobileWorkspaceQuery(apiClient, serverId);
  const mutations = useMobileServerManagementMutations(apiClient);
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyNotice, setHistoryNotice] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const submitRef = useRef(false);
  const appliedChannelIdRef = useRef<string | null>(null);
  const detail = workspace.data?.detail;
  const channel = useMemo(
    () =>
      detail
        ? ([
            ...detail.categories.flatMap((category) => category.channels),
            ...detail.ungroupedChannels,
          ].find((item) => item.id === channelId) ?? null)
        : null,
    [channelId, detail],
  );

  useEffect(() => {
    if (channel && appliedChannelIdRef.current !== channel.id) {
      // Refetches replace the channel object; reseeding on identity erased an in-progress draft.
      setName(channel.name);
      setTopic(channel.topic ?? "");
      setCategoryId(channel.categoryId ?? null);
      appliedChannelIdRef.current = channel.id;
    }
  }, [channel]);

  const cycleCategory = () => {
    if (!detail) {
      return;
    }
    const ids = [null, ...detail.categories.map((category) => category.id)];
    const index = ids.indexOf(categoryId);
    setCategoryId(ids[(index + 1) % ids.length] ?? null);
  };

  const update = async () => {
    const nextName = normalizeName(name);
    const nextTopic = normalizeTopic(topic);
    if (!channel || !nextName || nextTopic === null || submitRef.current) {
      return;
    }
    const unchanged =
      nextName === channel.name &&
      (nextTopic || null) === channel.topic &&
      categoryId === (channel.categoryId ?? null);
    if (unchanged) {
      return;
    }

    submitRef.current = true;
    setError(null);
    try {
      await mutations.updateChannel.mutateAsync({
        categoryId,
        channelId,
        name: nextName,
        serverId,
        topic: nextTopic || null,
      });
    } catch {
      setError(labels.channelSettingsError);
    } finally {
      submitRef.current = false;
    }
  };

  const deleteChannel = async () => {
    setError(null);
    try {
      await mutations.deleteChannel.mutateAsync({ channelId, serverId });
      setDeleteOpen(false);
      onBack();
    } catch {
      setError(labels.channelSettingsError);
      throw new Error("mobile-channel-delete-failed");
    }
  };

  const clearHistory = async () => {
    setError(null);
    try {
      const response = await mutations.clearChannelHistory.mutateAsync({ channelId });
      setHistoryOpen(false);
      setHistoryNotice(
        labels.channelSettingsHistoryDeleted.replace("{count}", String(response.deletedCount)),
      );
    } catch {
      setError(labels.channelSettingsError);
      throw new Error("mobile-channel-history-clear-failed");
    }
  };

  if (workspace.isLoading) {
    return (
      <View style={styles.root} testID="mobile-channel-settings-screen">
        <View style={styles.content}>
          <ActivityIndicator />
          <Text style={styles.body}>{labels.channelSettingsLoading}</Text>
        </View>
      </View>
    );
  }

  if (!detail || !channel || workspace.isError) {
    return (
      <ScrollView
        contentContainerStyle={styles.content}
        style={styles.root}
        testID="mobile-channel-settings-screen"
      >
        <Text style={styles.title}>{labels.channelSettingsTitle}</Text>
        <Text accessibilityRole="alert" style={styles.error}>
          {labels.channelSettingsError}
        </Text>
        <Button label={labels.channelSettingsBack} onPress={onBack} variant="ghost" />
      </ScrollView>
    );
  }

  const canManageChannels = detail.capabilities.canManageChannels;
  const canClearHistory = detail.capabilities.canClearHistory && channel.type === "TEXT";
  const categoryName =
    categoryId === null
      ? labels.workspaceChannelNoCategoryLabel
      : (detail.categories.find((item) => item.id === categoryId)?.name ??
        labels.workspaceChannelNoCategoryLabel);
  const invalidInput = normalizeName(name) === null || normalizeTopic(topic) === null;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      style={styles.root}
      testID="mobile-channel-settings-screen"
    >
      <Button label={labels.channelSettingsBack} onPress={onBack} variant="ghost" />
      <Text style={styles.title}>{labels.channelSettingsTitle}</Text>
      <Card style={styles.card}>
        <Text style={styles.caption}>{channel.type}</Text>
        {canManageChannels ? (
          <>
            <TextInput
              accessibilityLabel={labels.channelSettingsName}
              autoCapitalize="words"
              autoCorrect
              maxLength={48}
              onChangeText={setName}
              style={styles.input}
              testID="mobile-channel-settings-name"
              value={name}
            />
            <TextInput
              accessibilityLabel={labels.channelSettingsTopic}
              maxLength={120}
              onChangeText={setTopic}
              style={styles.input}
              testID="mobile-channel-settings-topic"
              value={topic}
            />
            <Button
              label={`${labels.channelSettingsCategory}: ${categoryName}`}
              onPress={cycleCategory}
              testID="mobile-channel-settings-category"
              variant="secondary"
            />
            <Button
              busy={mutations.updateChannel.isPending}
              disabled={invalidInput}
              label={labels.channelSettingsSave}
              onPress={() => void update()}
              testID="mobile-channel-settings-save"
            />
          </>
        ) : null}
        {canClearHistory ? (
          <Button
            label={labels.channelSettingsClear}
            onPress={() => setHistoryOpen(true)}
            testID={`mobile-channel-history-clear-open-${channelId}`}
            variant="danger"
          />
        ) : null}
        {canManageChannels ? (
          <Button
            label={labels.channelSettingsDelete}
            onPress={() => setDeleteOpen(true)}
            testID={`mobile-channel-delete-open-${channelId}`}
            variant="danger"
          />
        ) : null}
      </Card>
      {historyNotice ? (
        <Text accessibilityLiveRegion="polite" style={styles.success}>
          {historyNotice}
        </Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <DestructiveConfirmationSheet
        body={labels.channelSettingsDeleteBody}
        busy={mutations.deleteChannel.isPending}
        confirmLabel={labels.channelSettingsDelete}
        icon="trash-outline"
        onCancel={() => setDeleteOpen(false)}
        onConfirm={deleteChannel}
        open={deleteOpen}
        testID="mobile-channel-delete-confirm"
        title={labels.channelSettingsDelete}
      />
      <DestructiveConfirmationSheet
        body={labels.channelSettingsClearBody}
        busy={mutations.clearChannelHistory.isPending}
        confirmLabel={labels.channelSettingsClear}
        icon="sparkles-outline"
        onCancel={() => setHistoryOpen(false)}
        onConfirm={clearHistory}
        open={historyOpen}
        testID="mobile-channel-history-clear-confirm"
        title={labels.channelSettingsClear}
      />
    </ScrollView>
  );
}
