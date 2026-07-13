import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, View } from "react-native";

import { useMobileAuth } from "../auth/mobile-auth-context";
import { Button, Card, DestructiveConfirmationSheet } from "../app/components/kit";
import { useThemedStyles } from "../app/providers/mobile-theme-provider";
import { useMobileServerManagementMutations } from "../query/use-mobile-server-management-mutations";
import { useMobileWorkspaceQuery } from "../query/mobile-workspace-query";
import { createMobileServerManagementStyles } from "./mobile-server-management.styles";

export interface MobileChannelSettingsScreenProps {
  readonly channelId: string;
  readonly serverId: string;
  onBack(): void;
}

const COPY = {
  back: "Back",
  category: "Category",
  clear: "Clear message history",
  clearBody: "This permanently deletes channel messages. This cannot be undone.",
  delete: "Delete channel",
  deleteBody: "This permanently deletes the channel. This cannot be undone.",
  error: "This channel action could not be completed. Please try again.",
  loading: "Loading channel settings…",
  name: "Channel name",
  save: "Save changes",
  title: "Channel settings",
  topic: "Topic",
} as const;

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
  const detail = workspace.data?.detail;
  const channel = useMemo(
    () =>
      detail
        ? [...detail.categories.flatMap((category) => category.channels), ...detail.ungroupedChannels].find(
            (item) => item.id === channelId,
          ) ?? null
        : null,
    [channelId, detail],
  );

  useEffect(() => {
    if (channel) {
      setName(channel.name);
      setTopic(channel.topic ?? "");
      setCategoryId(channel.categoryId ?? null);
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
      setError(COPY.error);
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
      setError(COPY.error);
      throw new Error("mobile-channel-delete-failed");
    }
  };

  const clearHistory = async () => {
    setError(null);
    try {
      const response = await mutations.clearChannelHistory.mutateAsync({ channelId });
      setHistoryOpen(false);
      setHistoryNotice(`${response.deletedCount} messages deleted.`);
    } catch {
      setError(COPY.error);
      throw new Error("mobile-channel-history-clear-failed");
    }
  };

  if (workspace.isLoading) {
    return (
      <View style={styles.root} testID="mobile-channel-settings-screen">
        <View style={styles.content}>
          <ActivityIndicator />
          <Text style={styles.body}>{COPY.loading}</Text>
        </View>
      </View>
    );
  }

  if (!detail || !channel || workspace.isError) {
    return (
      <ScrollView contentContainerStyle={styles.content} style={styles.root} testID="mobile-channel-settings-screen">
        <Text style={styles.title}>{COPY.title}</Text>
        <Text accessibilityRole="alert" style={styles.error}>{COPY.error}</Text>
        <Button label={COPY.back} onPress={onBack} variant="ghost" />
      </ScrollView>
    );
  }

  const canManageChannels = detail.capabilities.canManageChannels;
  const canClearHistory = detail.capabilities.canClearHistory && channel.type === "TEXT";
  const categoryName =
    categoryId === null ? "No category" : detail.categories.find((item) => item.id === categoryId)?.name ?? "No category";
  const invalidInput = normalizeName(name) === null || normalizeTopic(topic) === null;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      style={styles.root}
      testID="mobile-channel-settings-screen"
    >
      <Button label={COPY.back} onPress={onBack} variant="ghost" />
      <Text style={styles.title}>{COPY.title}</Text>
      <Card style={styles.card}>
        <Text style={styles.caption}>{channel.type}</Text>
        {canManageChannels ? (
          <>
            <TextInput
              accessibilityLabel={COPY.name}
              autoCapitalize="words"
              autoCorrect
              maxLength={48}
              onChangeText={setName}
              style={styles.input}
              testID="mobile-channel-settings-name"
              value={name}
            />
            <TextInput
              accessibilityLabel={COPY.topic}
              maxLength={120}
              onChangeText={setTopic}
              style={styles.input}
              testID="mobile-channel-settings-topic"
              value={topic}
            />
            <Button
              label={`${COPY.category}: ${categoryName}`}
              onPress={cycleCategory}
              testID="mobile-channel-settings-category"
              variant="secondary"
            />
            <Button
              busy={mutations.updateChannel.isPending}
              disabled={invalidInput}
              label={COPY.save}
              onPress={() => void update()}
              testID="mobile-channel-settings-save"
            />
          </>
        ) : null}
        {canClearHistory ? (
          <Button
            label={COPY.clear}
            onPress={() => setHistoryOpen(true)}
            testID={`mobile-channel-history-clear-open-${channelId}`}
            variant="danger"
          />
        ) : null}
        {canManageChannels ? (
          <Button
            label={COPY.delete}
            onPress={() => setDeleteOpen(true)}
            testID={`mobile-channel-delete-open-${channelId}`}
            variant="danger"
          />
        ) : null}
      </Card>
      {historyNotice ? <Text accessibilityLiveRegion="polite" style={styles.success}>{historyNotice}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <DestructiveConfirmationSheet
        body={COPY.deleteBody}
        busy={mutations.deleteChannel.isPending}
        confirmLabel={COPY.delete}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={deleteChannel}
        open={deleteOpen}
        testID="mobile-channel-delete-confirm"
        title={COPY.delete}
      />
      <DestructiveConfirmationSheet
        body={COPY.clearBody}
        busy={mutations.clearChannelHistory.isPending}
        confirmLabel={COPY.clear}
        onCancel={() => setHistoryOpen(false)}
        onConfirm={clearHistory}
        open={historyOpen}
        testID="mobile-channel-history-clear-confirm"
        title={COPY.clear}
      />
    </ScrollView>
  );
}
