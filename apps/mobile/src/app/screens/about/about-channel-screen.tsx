import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import type { MobileAppChannelResponse, MobileReleaseChannel } from "@wizards/types";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { saveMobileAppChannel } from "../../../about/mobile-about-client";
import {
  openAboutBetaConsent,
  type OpenAboutBetaConsent,
} from "../../../about/open-about-beta-consent";
import {
  publishMobileAboutChannelPreference,
  readMobileAboutPreferences,
  writeMobileAboutChannelPreference,
} from "../../../about/mobile-about-preferences";
import { useMobileAuth } from "../../../auth/mobile-auth-context";
import { mobileAboutMetrics } from "../../../design/tokens";
import { mobileCopy } from "../../../locale/mobile-copy";
import { mobileQueryKeys } from "../../../query/mobile-query-keys";
import { useToast } from "../../components/kit/toast";
import { useMobileLocaleRuntime } from "../../providers/mobile-locale-provider";
import { useTheme } from "../../providers/mobile-theme-provider";
import { AboutCheckIcon, AboutWarningTriangleIcon } from "./about-icons";
import {
  AboutCard,
  AboutGroupLabel,
  AboutScreenHeader,
  AboutStickyFooterButton,
} from "./about-primitives";
import { useMobileAboutChannelStyles } from "./about-channel-screen.styles";

const CHANNELS: readonly MobileReleaseChannel[] = ["stable", "beta", "uat"];
const INITIAL_FOOTER_BUTTON_HEIGHT = 48;

interface ChannelOptionCopy {
  readonly chip?: string;
  readonly description: string;
  readonly meta: string;
  readonly title: string;
}

function ChannelOption({
  channel,
  copy,
  index,
  onSelect,
  selected,
}: {
  readonly channel: MobileReleaseChannel;
  readonly copy: ChannelOptionCopy;
  readonly index: number;
  readonly onSelect: (channel: MobileReleaseChannel) => void;
  readonly selected: boolean;
}) {
  const theme = useTheme();
  const styles = useMobileAboutChannelStyles();
  const isFirst = index === 0;
  const isLast = index === CHANNELS.length - 1;

  return (
    <Pressable
      accessibilityLabel={`${copy.title}, ${copy.description}, ${copy.meta}`}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={() => onSelect(channel)}
      style={({ pressed }) => [
        styles.channelRow,
        !isFirst && styles.channelRowDivider,
        selected && styles.selectedRow,
        selected && isFirst && styles.selectedFirstRow,
        selected && isLast && styles.selectedLastRow,
        pressed && styles.pressed,
      ]}
      testID={`mobile-about-channel-option-${channel}`}
    >
      <View
        style={[styles.radio, selected ? styles.radioSelected : styles.radioIdle]}
        testID={`mobile-about-channel-radio-${channel}`}
      >
        {selected ? (
          <AboutCheckIcon
            color={theme.about.updateOnGradient}
            size={12}
            strokeWidth={3}
            testID={`mobile-about-channel-radio-${channel}-check`}
          />
        ) : null}
      </View>
      <View style={styles.channelText}>
        <View style={styles.titleLine}>
          <Text maxFontSizeMultiplier={2} style={styles.channelTitle}>
            {copy.title}
          </Text>
          {copy.chip === undefined ? null : (
            <View style={styles.chip}>
              <Text allowFontScaling={false} style={styles.chipLabel}>
                {copy.chip}
              </Text>
            </View>
          )}
        </View>
        <Text maxFontSizeMultiplier={2} style={styles.channelDescription}>
          {copy.description}
        </Text>
        <Text maxFontSizeMultiplier={2} style={styles.channelMeta}>
          {copy.meta}
        </Text>
      </View>
    </Pressable>
  );
}

export interface MobileAboutUpdateChannelScreenProps {
  readonly currentChannel: MobileReleaseChannel;
  readonly onBack: () => void;
  readonly openBetaConsent?: OpenAboutBetaConsent;
}

export function MobileAboutUpdateChannelScreen({
  currentChannel,
  onBack,
  openBetaConsent: requestBetaConsent = openAboutBetaConsent,
}: MobileAboutUpdateChannelScreenProps) {
  const auth = useMobileAuth();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const styles = useMobileAboutChannelStyles();
  const { bottom: safeAreaBottom } = useSafeAreaInsets();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const { showToast } = useToast();
  const [savedChannel, setSavedChannel] = useState(currentChannel);
  const [selectedChannel, setSelectedChannel] = useState(currentChannel);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [requiresRestart, setRequiresRestart] = useState(false);
  const [footerButtonHeight, setFooterButtonHeight] = useState(INITIAL_FOOTER_BUTTON_HEIGHT);

  useEffect(() => {
    let active = true;
    void readMobileAboutPreferences(AsyncStorage).then((preferences) => {
      if (!active) {
        return;
      }

      const channel = preferences.channel ?? currentChannel;
      setSavedChannel(channel);
      setSelectedChannel(channel);
      setPreferencesLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [currentChannel]);

  const channelOptions = useMemo<Readonly<Record<MobileReleaseChannel, ChannelOptionCopy>>>(
    () => ({
      beta: {
        description: copy.channelBetaDesc,
        meta:
          savedChannel === "beta"
            ? `${copy.channelBetaMeta} · ${copy.channelCurrentSuffix}`
            : copy.channelBetaMeta,
        title: copy.channelBeta,
      },
      stable: {
        description: copy.channelStableDesc,
        meta:
          savedChannel === "stable"
            ? `${copy.channelStableMeta} · ${copy.channelCurrentSuffix}`
            : copy.channelStableMeta,
        title: copy.channelStable,
      },
      uat: {
        chip: copy.channelUatInternal,
        description: copy.channelUatDesc,
        meta:
          savedChannel === "uat"
            ? `${copy.channelUatMeta} · ${copy.channelCurrentSuffix}`
            : copy.channelUatMeta,
        title: copy.channelUat,
      },
    }),
    [copy, savedChannel],
  );

  const saveDisabled = !preferencesLoaded || isSaving || selectedChannel === savedChannel;
  const warning =
    selectedChannel === "beta"
      ? copy.channelBetaWarning
      : selectedChannel === "uat"
        ? copy.channelWarning
        : null;
  const secondEffect = requiresRestart ? copy.channelEffectsRestart : copy.channelEffectsNextBuild;

  const showEffectiveFromToast = (response: MobileAppChannelResponse) => {
    showToast({
      title:
        response.effectiveFrom === "next-build"
          ? copy.channelEffectsNextBuild
          : copy.channelEffectiveImmediate,
      variant: "success",
    });
  };

  const saveChannel = async () => {
    if (saveDisabled) {
      return;
    }

    setIsSaving(true);
    try {
      if (
        (selectedChannel === "beta" || selectedChannel === "uat") &&
        !(await requestBetaConsent())
      ) {
        setSelectedChannel(savedChannel);
        return;
      }

      const response = await saveMobileAppChannel(auth.apiClient, {
        channel: selectedChannel,
      });
      setSavedChannel(response.channel);
      setSelectedChannel(response.channel);
      setRequiresRestart(response.requiresRestart);
      try {
        await writeMobileAboutChannelPreference(AsyncStorage, response.channel);
      } catch {
        publishMobileAboutChannelPreference(response.channel);
        await queryClient.invalidateQueries({
          queryKey: mobileQueryKeys.aboutRoot(),
          refetchType: "none",
        });
        showToast({ title: copy.channelPersistenceFailed, variant: "error" });
        onBack();
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: mobileQueryKeys.aboutRoot(),
        refetchType: "none",
      });
      showEffectiveFromToast(response);
      onBack();
    } catch {
      showToast({ title: copy.channelSaveFailed, variant: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.root} testID="mobile-about-update-channel-screen">
      <AboutScreenHeader
        backAccessibilityLabel={copy.authBackAction}
        onBack={onBack}
        testID="mobile-about-update-channel-header"
        title={copy.channelTitle}
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom:
              mobileAboutMetrics.footerButtonBottom + footerButtonHeight + safeAreaBottom,
          },
        ]}
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        testID="mobile-about-channel-scroll"
      >
        <Text maxFontSizeMultiplier={2} style={styles.intro}>
          {copy.channelIntro}
        </Text>
        <AboutCard style={styles.channelCard} testID="mobile-about-channel-options">
          {CHANNELS.map((channel, index) => (
            <ChannelOption
              channel={channel}
              copy={channelOptions[channel]}
              index={index}
              key={channel}
              onSelect={setSelectedChannel}
              selected={selectedChannel === channel}
            />
          ))}
        </AboutCard>

        {warning === null ? null : (
          <View style={styles.warningCard} testID="mobile-about-channel-warning">
            <View style={styles.warningIcon}>
              <AboutWarningTriangleIcon color={theme.about.warningText} size={17} />
            </View>
            <Text maxFontSizeMultiplier={2} style={styles.warningText}>
              {warning}
            </Text>
          </View>
        )}

        <AboutGroupLabel
          label={copy.channelEffectsTitle}
          padding={{ bottom: 8, horizontal: 20, top: 18 }}
          testID="mobile-about-channel-effects-label"
        />
        <AboutCard style={styles.effectsCard} testID="mobile-about-channel-effects">
          <View style={styles.effectRow}>
            <View style={styles.effectIcon}>
              <AboutCheckIcon color={theme.about.successText} size={15} strokeWidth={2.2} />
            </View>
            <Text maxFontSizeMultiplier={2} style={styles.effectText}>
              {copy.channelEffectsData}
            </Text>
          </View>
          <View style={styles.effectRow}>
            <View style={styles.effectIcon}>
              <AboutCheckIcon color={theme.about.successText} size={15} strokeWidth={2.2} />
            </View>
            <Text maxFontSizeMultiplier={2} style={styles.effectText}>
              {secondEffect}
            </Text>
          </View>
        </AboutCard>
      </ScrollView>

      <AboutStickyFooterButton
        disabled={saveDisabled}
        label={copy.channelSave}
        onLayout={(event) => setFooterButtonHeight(event.nativeEvent.layout.height)}
        onPress={() => void saveChannel()}
        testID="mobile-about-channel-save"
      />
    </View>
  );
}
