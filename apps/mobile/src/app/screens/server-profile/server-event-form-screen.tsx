import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateServerScheduledEventInput,
  ServerScheduledEventEntityType,
} from "@wizards/types";

import {
  createMobileServerEvent,
  fetchMobileServerEvents,
  fetchMobileServerProfile,
  updateMobileServerEvent,
} from "../../../about/mobile-community-invite-client";
import { useMobileAuth } from "../../../auth/mobile-auth-context";
import { MobileLineIcon } from "../../../design/mobile-line-icons";
import { mobileCopy } from "../../../locale/mobile-copy";
import { mobileQueryKeys } from "../../../query/mobile-query-keys";
import { useToast } from "../../components/kit";
import { useMobileLocaleRuntime } from "../../providers/mobile-locale-provider";
import { useTheme, useThemedStyles } from "../../providers/mobile-theme-provider";
import {
  formatMobileEventDateTimeInput,
  parseMobileEventDateTimeInput,
} from "../../mobile-sunucular-model";
import { createMobileServerEventStyles } from "./server-events-screen.styles";

export interface MobileServerEventFormScreenProps {
  readonly eventId?: string;
  readonly onBack: () => void;
  readonly serverId: string;
}

const ENTITY_TYPES: readonly ServerScheduledEventEntityType[] = ["VOICE", "STAGE", "EXTERNAL"];

/**
 * Faz 5 §D2. Create and edit share the route — an absent `eventId` means "new".
 * Validation is Faz 1's schema (the client parses before it sends); the only
 * rule written here is the text-field date format, because the handoff has no
 * date picker and something has to turn `GG.AA.YYYY SS:DD` into an instant.
 */
export function MobileServerEventFormScreen({
  eventId,
  onBack,
  serverId,
}: MobileServerEventFormScreenProps) {
  const auth = useMobileAuth();
  const queryClient = useQueryClient();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const theme = useTheme();
  const styles = useThemedStyles(createMobileServerEventStyles);
  const safeArea = useSafeAreaInsets();
  const { showToast } = useToast();

  const signedIn = auth.status === "signed-in";
  const eventsQuery = useQuery({
    enabled: signedIn && eventId !== undefined,
    queryFn: () => fetchMobileServerEvents(auth.apiClient, serverId, { includePast: true }),
    queryKey: mobileQueryKeys.serverEvents(serverId),
    retry: false,
  });
  const profileQuery = useQuery({
    enabled: signedIn,
    queryFn: () => fetchMobileServerProfile(auth.apiClient, serverId),
    queryKey: mobileQueryKeys.serverProfile(serverId),
    retry: false,
  });
  const voiceChannels = useMemo(
    () => (profileQuery.data?.channels ?? []).filter((channel) => channel.type === "voice"),
    [profileQuery.data?.channels],
  );
  const existing = eventId
    ? eventsQuery.data?.events.find((event) => event.id === eventId)
    : undefined;

  // The edit path seeds itself once, from whichever read arrives first; after
  // that the fields belong to the typist, not to a refetch.
  const [seededId, setSeededId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [channelId, setChannelId] = useState<string | null>(null);
  const [entityType, setEntityType] = useState<ServerScheduledEventEntityType>("VOICE");
  const [externalLocation, setExternalLocation] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (existing && seededId !== existing.id) {
    setSeededId(existing.id);
    setName(existing.name);
    setDescription(existing.description ?? "");
    setChannelId(existing.channelId);
    setEntityType(existing.entityType);
    setExternalLocation(existing.externalLocation ?? "");
    setStart(formatMobileEventDateTimeInput(existing.scheduledStartAt));
    setEnd(formatMobileEventDateTimeInput(existing.scheduledEndAt));
  }

  const entityTypeLabel = (value: ServerScheduledEventEntityType): string => {
    if (value === "EXTERNAL") {
      return copy.serverEventFormEntityExternal;
    }
    return value === "STAGE" ? copy.serverEventFormEntityStage : copy.serverEventFormEntityVoice;
  };

  const submit = useCallback(async () => {
    if (saving) {
      return;
    }

    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setError(copy.serverEventFormNameRequired);
      return;
    }

    const startAt = parseMobileEventDateTimeInput(start);
    if (!startAt) {
      setError(copy.serverEventFormInvalidDate);
      return;
    }

    let endAt: string | null = null;
    if (end.trim().length > 0) {
      endAt = parseMobileEventDateTimeInput(end);
      if (!endAt) {
        setError(copy.serverEventFormInvalidDate);
        return;
      }
      if (Date.parse(endAt) <= Date.parse(startAt)) {
        setError(copy.serverEventFormEndBeforeStart);
        return;
      }
    }

    const payload: CreateServerScheduledEventInput = {
      channelId: entityType === "EXTERNAL" ? null : channelId,
      description: description.trim().length > 0 ? description.trim() : null,
      entityType,
      externalLocation:
        entityType === "EXTERNAL" && externalLocation.trim().length > 0
          ? externalLocation.trim()
          : null,
      name: trimmedName,
      scheduledEndAt: endAt,
      scheduledStartAt: startAt,
    };

    setError(null);
    setSaving(true);
    try {
      if (eventId) {
        await updateMobileServerEvent(auth.apiClient, { eventId, serverId }, payload);
      } else {
        await createMobileServerEvent(auth.apiClient, serverId, payload);
      }
      await queryClient.invalidateQueries({ queryKey: mobileQueryKeys.serverEvents(serverId) });
      await queryClient.invalidateQueries({ queryKey: mobileQueryKeys.serverProfile(serverId) });
      showToast({ title: copy.serverEventSaved, variant: "success" });
      onBack();
    } catch {
      showToast({ title: copy.serverEventSaveFailed, variant: "error" });
    } finally {
      setSaving(false);
    }
  }, [
    auth.apiClient,
    channelId,
    copy,
    description,
    end,
    entityType,
    eventId,
    externalLocation,
    name,
    onBack,
    queryClient,
    saving,
    serverId,
    showToast,
    start,
  ]);

  return (
    <View style={styles.root} testID="mobile-server-event-form-screen">
      <View style={[styles.header, { paddingTop: safeArea.top + 10 }]}>
        <Pressable
          accessibilityLabel={copy.authBackAction}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onBack}
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
          testID="mobile-server-event-form-back"
        >
          <MobileLineIcon color={theme.text.primary} name="back-arrow" size={16} />
        </Pressable>
        <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.headerTitle}>
          {eventId ? copy.serverEventEdit : copy.serverEventCreate}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        <View style={styles.field}>
          <Text maxFontSizeMultiplier={2} style={styles.fieldLabel}>
            {copy.serverEventFormName}
          </Text>
          <TextInput
            maxFontSizeMultiplier={2}
            onChangeText={setName}
            placeholder={copy.serverEventFormName}
            placeholderTextColor={theme.text.placeholder}
            style={styles.input}
            testID="mobile-server-event-form-name"
            value={name}
          />
        </View>

        <View style={styles.field}>
          <Text maxFontSizeMultiplier={2} style={styles.fieldLabel}>
            {copy.serverEventFormDescription}
          </Text>
          <TextInput
            maxFontSizeMultiplier={2}
            multiline
            onChangeText={setDescription}
            placeholder={copy.serverEventFormDescription}
            placeholderTextColor={theme.text.placeholder}
            style={[styles.input, styles.inputMultiline]}
            testID="mobile-server-event-form-description"
            value={description}
          />
        </View>

        <View style={styles.field}>
          <Text maxFontSizeMultiplier={2} style={styles.fieldLabel}>
            {copy.serverEventFormEntityType}
          </Text>
          <View style={styles.optionRow}>
            {ENTITY_TYPES.map((value) => (
              <Pressable
                accessibilityLabel={entityTypeLabel(value)}
                accessibilityRole="button"
                accessibilityState={{ selected: entityType === value }}
                key={value}
                onPress={() => setEntityType(value)}
                style={({ pressed }) => [
                  styles.option,
                  entityType === value && styles.optionActive,
                  pressed && styles.pressed,
                ]}
                testID={`mobile-server-event-form-type-${value}`}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.optionText, entityType === value && styles.optionTextActive]}
                >
                  {entityTypeLabel(value)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {entityType === "EXTERNAL" ? (
          <View style={styles.field}>
            <Text maxFontSizeMultiplier={2} style={styles.fieldLabel}>
              {copy.serverEventFormExternal}
            </Text>
            <TextInput
              maxFontSizeMultiplier={2}
              onChangeText={setExternalLocation}
              placeholder={copy.serverEventFormExternal}
              placeholderTextColor={theme.text.placeholder}
              style={styles.input}
              testID="mobile-server-event-form-external"
              value={externalLocation}
            />
          </View>
        ) : (
          <View style={styles.field}>
            <Text maxFontSizeMultiplier={2} style={styles.fieldLabel}>
              {copy.serverEventFormChannel}
            </Text>
            <View style={styles.optionRow}>
              <Pressable
                accessibilityLabel={copy.serverEventFormChannelNone}
                accessibilityRole="button"
                accessibilityState={{ selected: channelId === null }}
                onPress={() => setChannelId(null)}
                style={({ pressed }) => [
                  styles.option,
                  channelId === null && styles.optionActive,
                  pressed && styles.pressed,
                ]}
                testID="mobile-server-event-form-channel-none"
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.optionText, channelId === null && styles.optionTextActive]}
                >
                  {copy.serverEventFormChannelNone}
                </Text>
              </Pressable>
              {voiceChannels.map((channel) => (
                <Pressable
                  accessibilityLabel={channel.name}
                  accessibilityRole="button"
                  accessibilityState={{ selected: channelId === channel.id }}
                  key={channel.id}
                  onPress={() => setChannelId(channel.id)}
                  style={({ pressed }) => [
                    styles.option,
                    channelId === channel.id && styles.optionActive,
                    pressed && styles.pressed,
                  ]}
                  testID={`mobile-server-event-form-channel-${channel.id}`}
                >
                  <Text
                    allowFontScaling={false}
                    style={[styles.optionText, channelId === channel.id && styles.optionTextActive]}
                  >
                    {channel.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <View style={styles.field}>
          <Text maxFontSizeMultiplier={2} style={styles.fieldLabel}>
            {copy.serverEventFormStart}
          </Text>
          <TextInput
            maxFontSizeMultiplier={2}
            onChangeText={setStart}
            placeholder={copy.serverEventFormDateHint}
            placeholderTextColor={theme.text.placeholder}
            style={styles.input}
            testID="mobile-server-event-form-start"
            value={start}
          />
        </View>

        <View style={styles.field}>
          <Text maxFontSizeMultiplier={2} style={styles.fieldLabel}>
            {copy.serverEventFormEnd}
          </Text>
          <TextInput
            maxFontSizeMultiplier={2}
            onChangeText={setEnd}
            placeholder={copy.serverEventFormDateHint}
            placeholderTextColor={theme.text.placeholder}
            style={styles.input}
            testID="mobile-server-event-form-end"
            value={end}
          />
        </View>

        {error ? (
          <Text
            maxFontSizeMultiplier={2}
            style={styles.error}
            testID="mobile-server-event-form-error"
          >
            {error}
          </Text>
        ) : null}

        <Pressable
          accessibilityLabel={copy.serverEventFormSave}
          accessibilityRole="button"
          disabled={saving}
          onPress={() => {
            void submit();
          }}
          style={({ pressed }) => [
            styles.primaryAction,
            saving && styles.primaryActionDisabled,
            pressed && !saving && styles.pressed,
          ]}
          testID="mobile-server-event-form-save"
        >
          <Text maxFontSizeMultiplier={2} style={styles.primaryActionLabel}>
            {copy.serverEventFormSave}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
