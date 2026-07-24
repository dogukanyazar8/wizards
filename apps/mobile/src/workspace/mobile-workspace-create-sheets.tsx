import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { MobileManagedWorkspaceServerDetailResponse } from "@wizards/types";

import { useMobileAuth } from "../auth/mobile-auth-context";
import { BottomSheet, Toggle, useSheetPresentation } from "../app/components/kit";
import { MobileLineIcon } from "../design/mobile-line-icons";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme, useThemedStyles } from "../app/providers/mobile-theme-provider";
import type { MobileTheme } from "../design/themes";
import { mobileCopy } from "../locale/mobile-copy";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import { useMobileServerManagementMutations } from "../query/use-mobile-server-management-mutations";
import {
  hasMobileChannelNameCollision,
  slugifyMobileChannelName,
  slugifyMobileChannelNameInput,
} from "../app/mobile-sunucular-model";
import { fetchMobileAssignableRoles } from "./mobile-server-management-client";

type WorkspaceDetail = MobileManagedWorkspaceServerDetailResponse["detail"];

/**
 * Create-flow state machine shared by 1d (menu) and 1e (channel/category forms).
 * The active server browser owns it; a `categoryId` set on the menu preselects
 * that category when the channel form opens (category header `+` entry point).
 */
export type MobileWorkspaceCreateState =
  | { readonly categoryId: string | null; readonly kind: "menu" }
  | {
      readonly categoryId: string | null;
      readonly channelType: "TEXT" | "VOICE";
      readonly kind: "channel";
    }
  | { readonly kind: "category" }
  | null;

export interface MobileWorkspaceCreateSheetsProps {
  readonly detail: WorkspaceDetail | null;
  readonly serverId: string | null;
  readonly serverName: string;
  readonly state: MobileWorkspaceCreateState;
  onChangeState(next: MobileWorkspaceCreateState): void;
  onChannelCreated(channelId: string): void;
}

export function MobileWorkspaceCreateSheets({
  detail,
  onChangeState,
  onChannelCreated,
  serverId,
  serverName,
  state,
}: MobileWorkspaceCreateSheetsProps) {
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();
  const presentation = useSheetPresentation();
  const { locale } = useMobileLocaleRuntime();
  const labels = mobileCopy[locale];
  const { apiClient } = useMobileAuth();
  const mutations = useMobileServerManagementMutations(apiClient);

  const categories = useMemo(() => detail?.categories ?? [], [detail]);
  const existingChannelNames = useMemo(
    () =>
      detail
        ? [
            ...detail.ungroupedChannels.map((channel) => channel.name),
            ...detail.categories.flatMap((category) =>
              category.channels.map((channel) => channel.name),
            ),
          ]
        : [],
    [detail],
  );

  // 1e channel form fields.
  const [name, setName] = useState("");
  const [channelType, setChannelType] = useState<"TEXT" | "VOICE">("TEXT");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [isPrivate, setPrivate] = useState(false);
  const [selectedRoleIds, setSelectedRoleIds] = useState<readonly string[]>([]);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [channelError, setChannelError] = useState<string | null>(null);
  // Standalone category form field.
  const [categoryName, setCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (state?.kind === "channel") {
      setName("");
      setChannelType(state.channelType);
      setCategoryId(state.categoryId);
      setPrivate(false);
      setSelectedRoleIds([]);
      setNewCategoryOpen(false);
      setNewCategoryName("");
      setChannelError(null);
      setSubmitting(false);
    } else if (state?.kind === "category") {
      setCategoryName("");
      setCategoryError(null);
      setSubmitting(false);
    }
  }, [state]);

  // Private-channel role picker is UI-only for now: the mobile channel-create
  // contract omits `permissions` (see mobile-workspace-management.ts), so role
  // gating needs a backend change and is intentionally not sent on create yet.
  const rolesQuery = useQuery({
    enabled: state?.kind === "channel" && isPrivate && Boolean(serverId),
    queryFn: () => fetchMobileAssignableRoles(apiClient, { serverId: serverId ?? "" }),
    queryKey: mobileQueryKeys.workspaceRoles(serverId ?? ""),
  });
  const roles = rolesQuery.data?.roles ?? [];

  const menuCategoryId = state?.kind === "menu" ? state.categoryId : null;
  const finalChannelName = channelType === "TEXT" ? slugifyMobileChannelName(name) : name.trim();
  const hasCollision =
    finalChannelName.length > 0 &&
    hasMobileChannelNameCollision(existingChannelNames, finalChannelName);
  const canSubmitChannel = finalChannelName.length > 0 && !hasCollision && !submitting;
  const channelErrorText = hasCollision
    ? labels.workspaceChannelFormNameCollisionError
    : channelError;

  const close = () => onChangeState(null);

  const openChannelForm = (type: "TEXT" | "VOICE") => {
    onChangeState({ categoryId: menuCategoryId, channelType: type, kind: "channel" });
  };

  const submitChannel = async () => {
    if (!canSubmitChannel || !serverId) {
      return;
    }

    setSubmitting(true);
    setChannelError(null);
    try {
      let targetCategoryId = categoryId;
      const trimmedNewCategory = newCategoryName.trim();
      if (newCategoryOpen && trimmedNewCategory.length > 0) {
        const created = await mutations.createCategory.mutateAsync({
          name: trimmedNewCategory,
          serverId,
        });
        targetCategoryId = created.category.id;
      }

      const created = await mutations.createChannel.mutateAsync({
        categoryId: targetCategoryId,
        name: finalChannelName,
        serverId,
        topic: null,
        type: channelType,
      });
      onChannelCreated(created.channel.id);
      onChangeState(null);
    } catch {
      setChannelError(labels.workspaceEditorError);
    } finally {
      setSubmitting(false);
    }
  };

  const submitCategory = async () => {
    const trimmed = categoryName.trim();
    if (trimmed.length === 0 || submitting || !serverId) {
      return;
    }

    setSubmitting(true);
    setCategoryError(null);
    try {
      await mutations.createCategory.mutateAsync({ name: trimmed, serverId });
      onChangeState(null);
    } catch {
      setCategoryError(labels.workspaceEditorError);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((current) =>
      current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId],
    );
  };

  return (
    <>
      {/* 1d — Oluştur menüsü */}
      <BottomSheet
        accessibilityLabel={labels.workspaceCreateMenuTitle}
        onClose={close}
        open={state?.kind === "menu"}
        presentation={presentation}
        sizing="content"
        testID="mobile-workspace-create-menu"
      >
        <View style={styles.sheet}>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{labels.workspaceCreateMenuTitle}</Text>
            <View style={styles.subtitleRow}>
              <Text style={styles.subtitleText} numberOfLines={1}>
                {serverName}
              </Text>
              <Text style={styles.separatorDot}>·</Text>
              <View style={styles.adminChip}>
                <Ionicons color={theme.accent.default} name="star" size={10} />
                <Text style={styles.adminChipText}>{labels.workspaceCreateMenuAdminChip}</Text>
              </View>
            </View>
          </View>
          <View style={styles.optionColumn}>
            <CreateOptionCard
              description={labels.workspaceCreateTextChannelDescription}
              icon={<Text style={styles.optionHashText}>#</Text>}
              iconSurface={theme.accent.soft}
              onPress={() => openChannelForm("TEXT")}
              testID="mobile-workspace-create-option-text"
              title={labels.workspaceCreateTextChannelTitle}
            />
            <CreateOptionCard
              description={labels.workspaceCreateVoiceChannelDescription}
              icon={<MobileLineIcon color={theme.status.visualText} name="speaker" size={18} />}
              iconSurface={theme.status.successSoft}
              onPress={() => openChannelForm("VOICE")}
              testID="mobile-workspace-create-option-voice"
              title={labels.workspaceCreateVoiceChannelTitle}
            />
            <CreateOptionCard
              description={labels.workspaceCreateCategoryDescription}
              icon={<Ionicons color={theme.status.visualWarning} name="folder-outline" size={18} />}
              iconSurface={theme.status.visualWarningSoft}
              onPress={() => onChangeState({ kind: "category" })}
              testID="mobile-workspace-create-option-category"
              title={labels.workspaceCreateCategoryTitle}
            />
          </View>
          <Pressable
            accessibilityLabel={labels.workspaceCreateMenuCancel}
            accessibilityRole="button"
            onPress={close}
            style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
            testID="mobile-workspace-create-menu-cancel"
          >
            <Text style={styles.cancelText}>{labels.workspaceCreateMenuCancel}</Text>
          </Pressable>
        </View>
      </BottomSheet>

      {/* 1e — Kanal oluştur formu */}
      <BottomSheet
        accessibilityLabel={labels.workspaceChannelFormTitle}
        onClose={close}
        open={state?.kind === "channel"}
        presentation={presentation}
        sizing="content"
        testID="mobile-workspace-channel-form"
      >
        <View style={styles.sheet}>
          <View style={styles.formHeader}>
            <View style={styles.formHeaderText}>
              <Text style={styles.title}>{labels.workspaceChannelFormTitle}</Text>
              <Text style={styles.subtitleText} numberOfLines={1}>
                {serverName}
                {categoryId
                  ? ` · ${categories.find((category) => category.id === categoryId)?.name ?? ""}`
                  : ""}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={labels.sheetCloseAction}
              accessibilityRole="button"
              onPress={close}
              style={({ pressed }) => [styles.formClose, pressed && styles.pressed]}
              testID="mobile-workspace-channel-form-close"
            >
              <Ionicons color={theme.text.visualPlaceholder} name="close" size={18} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.formScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.segmented}>
              <SegmentButton
                active={channelType === "TEXT"}
                icon={
                  <Text
                    style={[
                      styles.segmentHashText,
                      channelType === "TEXT" && styles.segmentHashTextActive,
                    ]}
                  >
                    #
                  </Text>
                }
                label={labels.workspaceChannelFormTypeText}
                onPress={() => setChannelType("TEXT")}
                testID="mobile-workspace-channel-form-type-text"
              />
              <SegmentButton
                active={channelType === "VOICE"}
                icon={
                  <MobileLineIcon
                    color={
                      channelType === "VOICE" ? theme.accent.default : theme.text.visualSecondary
                    }
                    name="speaker"
                    size={14}
                  />
                }
                label={labels.workspaceChannelFormTypeVoice}
                onPress={() => setChannelType("VOICE")}
                testID="mobile-workspace-channel-form-type-voice"
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>{labels.workspaceChannelFormNameLabel}</Text>
              <View
                style={[
                  styles.nameField,
                  channelErrorText ? styles.nameFieldError : styles.nameFieldFocus,
                ]}
              >
                {channelType === "TEXT" ? (
                  <Text style={styles.nameHashText}>#</Text>
                ) : (
                  <MobileLineIcon color={theme.text.visualPlaceholder} name="speaker" size={15} />
                )}
                <TextInput
                  accessibilityLabel={labels.workspaceChannelFormNameLabel}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={(raw) =>
                    setName(channelType === "TEXT" ? slugifyMobileChannelNameInput(raw) : raw)
                  }
                  placeholder={labels.workspaceChannelFormNamePlaceholder}
                  placeholderTextColor={theme.text.visualPlaceholder}
                  style={styles.nameInput}
                  testID="mobile-workspace-channel-form-name"
                  value={name}
                />
              </View>
              {channelErrorText ? (
                <Text accessibilityRole="alert" style={styles.errorText}>
                  {channelErrorText}
                </Text>
              ) : channelType === "TEXT" ? (
                <Text style={styles.fieldHint}>{labels.workspaceChannelFormNameHint}</Text>
              ) : null}
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>{labels.workspaceChannelFormCategoryLabel}</Text>
              <View style={styles.chipRow}>
                {categories.map((category) => {
                  const selected = !newCategoryOpen && category.id === categoryId;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      key={category.id}
                      onPress={() => {
                        setNewCategoryOpen(false);
                        setCategoryId(category.id);
                      }}
                      style={[styles.chip, selected ? styles.chipSelected : styles.chipIdle]}
                      testID={`mobile-workspace-channel-form-category-${category.id}`}
                    >
                      <Text
                        style={[styles.chipText, selected && styles.chipTextSelected]}
                        numberOfLines={1}
                      >
                        {category.name}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: newCategoryOpen }}
                  onPress={() => {
                    setNewCategoryOpen((current) => !current);
                    setCategoryId(null);
                  }}
                  style={[styles.chip, styles.chipNew]}
                  testID="mobile-workspace-channel-form-category-new"
                >
                  <Ionicons color={theme.text.visualSecondary} name="add" size={11} />
                  <Text style={styles.chipText}>{labels.workspaceChannelFormNewCategoryChip}</Text>
                </Pressable>
              </View>
              {newCategoryOpen ? (
                <TextInput
                  accessibilityLabel={labels.workspaceChannelFormNewCategoryPlaceholder}
                  onChangeText={setNewCategoryName}
                  placeholder={labels.workspaceChannelFormNewCategoryPlaceholder}
                  placeholderTextColor={theme.text.visualPlaceholder}
                  style={styles.newCategoryInput}
                  testID="mobile-workspace-channel-form-new-category-name"
                  value={newCategoryName}
                />
              ) : null}
            </View>

            <View style={styles.privateRow}>
              <View style={styles.privateIcon}>
                <Ionicons color={theme.text.visualSecondary} name="lock-closed-outline" size={15} />
              </View>
              <View style={styles.privateText}>
                <Text style={styles.privateTitle}>{labels.workspaceChannelFormPrivateTitle}</Text>
                <Text style={styles.privateDescription}>
                  {labels.workspaceChannelFormPrivateDescription}
                </Text>
              </View>
              <Toggle
                accessibilityLabel={labels.workspaceChannelFormPrivateTitle}
                onValueChange={setPrivate}
                testID="mobile-workspace-channel-form-private-toggle"
                value={isPrivate}
              />
            </View>
            {isPrivate ? (
              <View style={styles.rolesBlock}>
                <Text style={styles.fieldLabel}>{labels.workspaceChannelFormRolesLabel}</Text>
                <View style={styles.chipRow}>
                  {roles.map((role) => {
                    const selected = selectedRoleIds.includes(role.id);
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        key={role.id}
                        onPress={() => toggleRole(role.id)}
                        style={[styles.chip, selected ? styles.chipSelected : styles.chipIdle]}
                        testID={`mobile-workspace-channel-form-role-${role.id}`}
                      >
                        <Text
                          style={[styles.chipText, selected && styles.chipTextSelected]}
                          numberOfLines={1}
                        >
                          {role.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </ScrollView>

          <Pressable
            accessibilityLabel={labels.workspaceChannelFormSubmitAction}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmitChannel }}
            disabled={!canSubmitChannel}
            onPress={() => void submitChannel()}
            style={({ pressed }) => [
              styles.primaryCta,
              !canSubmitChannel && styles.primaryCtaDisabled,
              pressed && canSubmitChannel && styles.pressed,
            ]}
            testID="mobile-workspace-channel-form-submit"
          >
            <Ionicons color={theme.text.onPrimary} name="add" size={15} />
            <Text style={styles.primaryCtaText}>{labels.workspaceChannelFormSubmitAction}</Text>
          </Pressable>
          <View style={styles.footerRow}>
            <Ionicons
              color={theme.text.visualPlaceholder}
              name="information-circle-outline"
              size={12}
            />
            <Text style={styles.footerText}>{labels.workspaceChannelFormFooter}</Text>
          </View>
        </View>
      </BottomSheet>

      {/* 1d "Kategori" → single-input category form */}
      <BottomSheet
        accessibilityLabel={labels.workspaceCategoryFormTitle}
        onClose={close}
        open={state?.kind === "category"}
        presentation={presentation}
        sizing="content"
        testID="mobile-workspace-category-form"
      >
        <View style={styles.sheet}>
          <View style={styles.formHeader}>
            <View style={styles.formHeaderText}>
              <Text style={styles.title}>{labels.workspaceCategoryFormTitle}</Text>
              <Text style={styles.subtitleText} numberOfLines={1}>
                {serverName}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={labels.sheetCloseAction}
              accessibilityRole="button"
              onPress={close}
              style={({ pressed }) => [styles.formClose, pressed && styles.pressed]}
              testID="mobile-workspace-category-form-close"
            >
              <Ionicons color={theme.text.visualPlaceholder} name="close" size={18} />
            </Pressable>
          </View>
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>{labels.workspaceChannelFormCategoryLabel}</Text>
            <View style={[styles.nameField, styles.nameFieldFocus]}>
              <Ionicons color={theme.text.visualPlaceholder} name="folder-outline" size={15} />
              <TextInput
                accessibilityLabel={labels.workspaceCategoryFormTitle}
                onChangeText={setCategoryName}
                placeholder={labels.workspaceChannelFormNewCategoryPlaceholder}
                placeholderTextColor={theme.text.visualPlaceholder}
                style={styles.nameInput}
                testID="mobile-workspace-category-form-name"
                value={categoryName}
              />
            </View>
            {categoryError ? (
              <Text accessibilityRole="alert" style={styles.errorText}>
                {categoryError}
              </Text>
            ) : null}
          </View>
          <Pressable
            accessibilityLabel={labels.workspaceCategoryFormSubmitAction}
            accessibilityRole="button"
            accessibilityState={{ disabled: categoryName.trim().length === 0 || submitting }}
            disabled={categoryName.trim().length === 0 || submitting}
            onPress={() => void submitCategory()}
            style={({ pressed }) => [
              styles.primaryCta,
              (categoryName.trim().length === 0 || submitting) && styles.primaryCtaDisabled,
              pressed && categoryName.trim().length > 0 && styles.pressed,
            ]}
            testID="mobile-workspace-category-form-submit"
          >
            <Ionicons color={theme.text.onPrimary} name="add" size={15} />
            <Text style={styles.primaryCtaText}>{labels.workspaceCategoryFormSubmitAction}</Text>
          </Pressable>
        </View>
      </BottomSheet>
    </>
  );
}

function CreateOptionCard({
  description,
  icon,
  iconSurface,
  onPress,
  testID,
  title,
}: {
  readonly description: string;
  readonly icon: React.ReactNode;
  readonly iconSurface: string;
  onPress(): void;
  readonly testID: string;
  readonly title: string;
}) {
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();
  return (
    <Pressable
      accessibilityLabel={`${title}. ${description}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.optionCard, pressed && styles.pressed]}
      testID={testID}
    >
      <View style={[styles.optionIcon, { backgroundColor: iconSurface }]}>{icon}</View>
      <View style={styles.optionCardText}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionDescription}>{description}</Text>
      </View>
      <Ionicons color={theme.text.visualPlaceholder} name="chevron-forward" size={15} />
    </Pressable>
  );
}

function SegmentButton({
  active,
  icon,
  label,
  onPress,
  testID,
}: {
  readonly active: boolean;
  readonly icon: React.ReactNode;
  readonly label: string;
  onPress(): void;
  readonly testID: string;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.segment, active && styles.segmentActive]}
      testID={testID}
    >
      {icon}
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (theme: MobileTheme) => ({
  sheet: { gap: 0 },
  titleBlock: { gap: 2, paddingBottom: 14, paddingTop: 4 },
  title: {
    color: theme.text.primary,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 19,
  },
  subtitleRow: { alignItems: "center" as const, flexDirection: "row" as const, gap: 6 },
  subtitleText: {
    color: theme.text.visualSecondary,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontSize: 12,
    minWidth: 0,
  },
  separatorDot: { color: theme.control.separatorDot },
  adminChip: {
    alignItems: "center" as const,
    backgroundColor: theme.accent.soft,
    borderRadius: 8,
    flexDirection: "row" as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  adminChipText: {
    color: theme.accent.strong,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 10.5,
  },
  optionColumn: { gap: 10 },
  optionCard: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.base,
    borderColor: theme.border.subtle,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row" as const,
    gap: 14,
    padding: 14,
  },
  optionIcon: {
    alignItems: "center" as const,
    borderRadius: 16,
    height: 46,
    justifyContent: "center" as const,
    width: 46,
  },
  optionHashText: {
    color: theme.accent.default,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 19,
    includeFontPadding: false,
    lineHeight: 22,
  },
  optionCardText: { flex: 1, gap: 1, minWidth: 0 },
  optionTitle: {
    color: theme.text.primary,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 15,
  },
  optionDescription: {
    color: theme.text.visualSecondary,
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
  },
  cancelButton: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.base,
    borderRadius: 15,
    justifyContent: "center" as const,
    marginTop: 14,
    padding: 13,
  },
  cancelText: {
    color: theme.text.visualSecondary,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 14,
  },
  formHeader: {
    alignItems: "flex-start" as const,
    flexDirection: "row" as const,
    gap: 12,
    justifyContent: "space-between" as const,
    paddingBottom: 14,
    paddingTop: 4,
  },
  formHeaderText: { flex: 1, gap: 1, minWidth: 0 },
  formClose: {
    alignItems: "center" as const,
    height: 30,
    justifyContent: "center" as const,
    width: 30,
  },
  formScrollContent: { gap: 0, paddingBottom: 4 },
  segmented: {
    backgroundColor: theme.surface.base,
    borderColor: theme.border.subtle,
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: "row" as const,
    gap: 4,
    padding: 4,
  },
  segment: {
    alignItems: "center" as const,
    borderRadius: 12,
    flex: 1,
    flexDirection: "row" as const,
    gap: 7,
    justifyContent: "center" as const,
    paddingVertical: 9,
  },
  segmentActive: {
    backgroundColor: theme.surface.card,
    ...theme.elevation.headerCard,
  },
  segmentHashText: {
    color: theme.text.visualSecondary,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 14,
    includeFontPadding: false,
    lineHeight: 16,
  },
  segmentHashTextActive: { color: theme.accent.default },
  segmentText: {
    color: theme.text.visualSecondary,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 13,
  },
  segmentTextActive: {
    color: theme.accent.default,
    fontFamily: theme.typography.fontFamilyExtraBold,
  },
  fieldBlock: { gap: 7, marginTop: 14 },
  fieldLabel: {
    color: theme.text.visualFaint,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 10.5,
    letterSpacing: 1,
    textTransform: "uppercase" as const,
  },
  nameField: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.base,
    borderRadius: 14,
    borderWidth: 1.5,
    flexDirection: "row" as const,
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  nameFieldFocus: { borderColor: theme.accent.default },
  nameFieldError: { borderColor: theme.status.danger },
  nameHashText: {
    color: theme.text.visualPlaceholder,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 15,
    includeFontPadding: false,
    lineHeight: 18,
  },
  nameInput: {
    color: theme.text.primary,
    flex: 1,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 14.5,
    includeFontPadding: false,
    minWidth: 0,
    padding: 0,
  },
  fieldHint: { color: theme.text.visualPlaceholder, fontSize: 11 },
  errorText: {
    color: theme.status.dangerOnBase,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontSize: 11.5,
  },
  chipRow: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 },
  chip: {
    alignItems: "center" as const,
    borderRadius: 12,
    flexDirection: "row" as const,
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipIdle: {
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderWidth: 1,
  },
  chipSelected: {
    backgroundColor: theme.accent.soft,
    borderColor: theme.accent.default,
    borderWidth: 1.5,
  },
  chipNew: {
    borderColor: theme.control.separatorDot,
    borderStyle: "dashed" as const,
    borderWidth: 1.5,
  },
  chipText: {
    color: theme.text.visualSecondary,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 12.5,
  },
  chipTextSelected: {
    color: theme.accent.strong,
    fontFamily: theme.typography.fontFamilyExtraBold,
  },
  newCategoryInput: {
    backgroundColor: theme.surface.base,
    borderColor: theme.border.subtle,
    borderRadius: 12,
    borderWidth: 1,
    color: theme.text.primary,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  privateRow: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.base,
    borderColor: theme.border.subtle,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row" as const,
    gap: 12,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  privateIcon: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderRadius: 13,
    borderWidth: 1,
    height: 36,
    justifyContent: "center" as const,
    width: 36,
  },
  privateText: { flex: 1, gap: 1, minWidth: 0 },
  privateTitle: {
    color: theme.text.primary,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 13.5,
  },
  privateDescription: { color: theme.text.visualSecondary, fontSize: 11.5 },
  rolesBlock: { gap: 7, marginTop: 14 },
  primaryCta: {
    alignItems: "center" as const,
    backgroundColor: theme.accent.action,
    borderRadius: 16,
    flexDirection: "row" as const,
    gap: 8,
    justifyContent: "center" as const,
    marginTop: 16,
    padding: 14,
    ...theme.elevation.primaryAction,
  },
  primaryCtaDisabled: { opacity: 0.5 },
  primaryCtaText: {
    color: theme.text.onPrimary,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 14.5,
  },
  footerRow: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: 6,
    justifyContent: "center" as const,
    marginTop: 12,
  },
  footerText: {
    color: theme.text.visualPlaceholder,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontSize: 11,
  },
  pressed: { opacity: 0.78 },
});
