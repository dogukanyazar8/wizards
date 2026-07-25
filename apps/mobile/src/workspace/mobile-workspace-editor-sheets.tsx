import { useEffect, useMemo, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import type { MobileManagedWorkspaceServerDetailResponse } from "@wizards/types";

import { useMobileAuth } from "../auth/mobile-auth-context";
import {
  BottomSheet,
  Button,
  DestructiveConfirmationSheet,
  SheetHeader,
  useSheetPresentation,
} from "../app/components/kit";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useThemedStyles } from "../app/providers/mobile-theme-provider";
import { useMobileServerManagementMutations } from "../query/use-mobile-server-management-mutations";
import { createMobileServerManagementStyles } from "./mobile-server-management.styles";
import { mobileCopy } from "../locale/mobile-copy";

export type MobileWorkspaceEditorState =
  | { readonly kind: "category-create" }
  | { readonly categoryId: string; readonly initialName: string; readonly kind: "category-edit" }
  | { readonly kind: "channel-create" }
  | { readonly channelId: string; readonly kind: "channel-edit" }
  | null;

export interface MobileWorkspaceEditorSheetsProps {
  readonly detail: MobileManagedWorkspaceServerDetailResponse["detail"];
  readonly editor: MobileWorkspaceEditorState;
  readonly serverId: string;
  onClose(): void;
}

function normalizeName(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= 48 ? trimmed : null;
}

function normalizeTopic(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length <= 120 ? trimmed : null;
}

export function MobileWorkspaceEditorSheets({
  detail,
  editor,
  onClose,
  serverId,
}: MobileWorkspaceEditorSheetsProps) {
  const { apiClient } = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const labels = mobileCopy[locale];
  const styles = useThemedStyles(createMobileServerManagementStyles);
  const sheetPresentation = useSheetPresentation();
  const mutations = useMobileServerManagementMutations(apiClient);
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [type, setType] = useState<"TEXT" | "VOICE">("TEXT");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteCategory, setDeleteCategory] = useState<{
    readonly id: string;
    readonly name: string;
  } | null>(null);
  const submittingRef = useRef(false);
  const channels = useMemo(
    () => [
      ...detail.categories.flatMap((category) => category.channels),
      ...detail.ungroupedChannels,
    ],
    [detail.categories, detail.ungroupedChannels],
  );
  const editingCategory =
    editor?.kind === "category-edit"
      ? (detail.categories.find((category) => category.id === editor.categoryId) ?? null)
      : null;
  const editingChannel =
    editor?.kind === "channel-edit"
      ? (channels.find((channel) => channel.id === editor.channelId) ?? null)
      : null;
  const isCategoryEditor = editor?.kind === "category-create" || editor?.kind === "category-edit";
  const isOpen = editor !== null;

  useEffect(() => {
    if (!editor) {
      submittingRef.current = false;
      setCategoryId(null);
      setError(null);
      setName("");
      setTopic("");
      setType("TEXT");
      return;
    }

    submittingRef.current = false;
    setError(null);
    if (editor.kind === "category-edit") {
      setName(editor.initialName);
      return;
    }
    if (editor.kind === "channel-edit") {
      const channel = channels.find((item) => item.id === editor.channelId);
      setName(channel?.name ?? "");
      setTopic(channel?.topic ?? "");
      setCategoryId(channel?.categoryId ?? null);
      setType(channel?.type ?? "TEXT");
      return;
    }
    setName("");
    setTopic("");
    setCategoryId(null);
    setType("TEXT");
  }, [channels, editor]);

  const cycleCategory = () => {
    const ids = [null, ...detail.categories.map((category) => category.id)];
    const currentIndex = ids.indexOf(categoryId);
    setCategoryId(ids[(currentIndex + 1) % ids.length] ?? null);
  };

  const save = async () => {
    if (!editor || submittingRef.current) {
      return;
    }
    const normalizedName = normalizeName(name);
    const normalizedTopic = normalizeTopic(topic);
    if (!normalizedName || normalizedTopic === null) {
      setError(labels.workspaceEditorError);
      return;
    }

    submittingRef.current = true;
    setError(null);
    try {
      if (editor.kind === "category-create") {
        await mutations.createCategory.mutateAsync({ name: normalizedName, serverId });
      } else if (editor.kind === "category-edit") {
        await mutations.updateCategory.mutateAsync({
          categoryId: editor.categoryId,
          name: normalizedName,
          serverId,
        });
      } else if (editor.kind === "channel-create") {
        await mutations.createChannel.mutateAsync({
          categoryId,
          name: normalizedName,
          serverId,
          topic: normalizedTopic || null,
          type,
        });
      } else {
        await mutations.updateChannel.mutateAsync({
          categoryId,
          channelId: editor.channelId,
          name: normalizedName,
          serverId,
          topic: normalizedTopic || null,
        });
      }
      onClose();
    } catch {
      setError(labels.workspaceEditorError);
    } finally {
      submittingRef.current = false;
    }
  };

  const confirmDeleteCategory = async () => {
    if (!deleteCategory) {
      return;
    }
    try {
      await mutations.deleteCategory.mutateAsync({ categoryId: deleteCategory.id, serverId });
      setDeleteCategory(null);
      onClose();
    } catch {
      setError(labels.workspaceEditorError);
      throw new Error("mobile-category-delete-failed");
    }
  };

  const currentCategoryName =
    categoryId === null
      ? labels.workspaceChannelNoCategoryLabel
      : (detail.categories.find((item) => item.id === categoryId)?.name ??
        labels.workspaceChannelNoCategoryLabel);
  const isPending =
    mutations.createCategory.isPending ||
    mutations.updateCategory.isPending ||
    mutations.createChannel.isPending ||
    mutations.updateChannel.isPending;

  return (
    <>
      <BottomSheet
        accessibilityLabel={
          isCategoryEditor ? labels.workspaceEditorCategory : labels.workspaceEditorChannel
        }
        onClose={onClose}
        open={isOpen}
        presentation={sheetPresentation}
        sizing="content"
        testID={isCategoryEditor ? "mobile-category-editor-sheet" : "mobile-channel-editor-sheet"}
      >
        <View style={styles.sheet}>
          <SheetHeader
            closeAccessibilityLabel={labels.sheetCloseAction}
            icon={isCategoryEditor ? "folder-outline" : "chatbubbles-outline"}
            onClose={onClose}
            testID="mobile-workspace-editor-header"
            title={
              isCategoryEditor ? labels.workspaceEditorCategory : labels.workspaceEditorChannel
            }
          />
          <TextInput
            accessibilityLabel={labels.workspaceEditorName}
            autoCapitalize="words"
            autoCorrect
            maxLength={48}
            onChangeText={setName}
            placeholder={labels.workspaceEditorName}
            style={styles.input}
            testID={isCategoryEditor ? "mobile-category-name" : "mobile-channel-name"}
            value={name}
          />
          {!isCategoryEditor ? (
            <>
              <TextInput
                accessibilityLabel={labels.workspaceEditorTopic}
                maxLength={120}
                onChangeText={setTopic}
                placeholder={labels.workspaceEditorTopic}
                style={styles.input}
                testID="mobile-channel-topic"
                value={topic}
              />
              {editor?.kind === "channel-create" ? (
                <View style={styles.row}>
                  <Button
                    accessibilityState={{ selected: type === "TEXT" }}
                    label={labels.workspaceEditorText}
                    onPress={() => setType("TEXT")}
                    testID="mobile-channel-type-text"
                    variant={type === "TEXT" ? "primary" : "secondary"}
                  />
                  <Button
                    accessibilityState={{ selected: type === "VOICE" }}
                    label={labels.workspaceEditorVoice}
                    onPress={() => setType("VOICE")}
                    testID="mobile-channel-type-voice"
                    variant={type === "VOICE" ? "primary" : "secondary"}
                  />
                </View>
              ) : null}
              <Button
                label={`${labels.workspaceEditorCategory}: ${currentCategoryName}`}
                onPress={cycleCategory}
                testID="mobile-channel-category"
                variant="secondary"
              />
            </>
          ) : null}
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
          <Button
            busy={isPending}
            disabled={
              normalizeName(name) === null || (!isCategoryEditor && normalizeTopic(topic) === null)
            }
            label={
              editor?.kind === "category-create" || editor?.kind === "channel-create"
                ? labels.workspaceEditorCreate
                : labels.workspaceEditorSave
            }
            onPress={() => void save()}
            testID={isCategoryEditor ? "mobile-category-save" : "mobile-channel-save"}
          />
          {editingCategory ? (
            <Button
              label={labels.workspaceEditorDelete}
              onPress={() =>
                setDeleteCategory({ id: editingCategory.id, name: editingCategory.name })
              }
              testID={`mobile-category-${editingCategory.id}-delete`}
              variant="danger"
            />
          ) : null}
          <Button label={labels.workspaceEditorCancel} onPress={onClose} variant="ghost" />
        </View>
      </BottomSheet>
      <DestructiveConfirmationSheet
        body={labels.workspaceEditorCategoryDeleteBody}
        busy={mutations.deleteCategory.isPending}
        confirmLabel={labels.workspaceEditorDelete}
        icon="trash-outline"
        onCancel={() => setDeleteCategory(null)}
        onConfirm={confirmDeleteCategory}
        open={deleteCategory !== null}
        {...(deleteCategory ? { requiredText: deleteCategory.name } : {})}
        testID="mobile-category-delete-confirm"
        title={labels.workspaceEditorDelete}
      />
    </>
  );
}
