import {
  createContext,
  type ComponentProps,
  type Context,
  type PropsWithChildren,
  useContext,
} from "react";
import { MessagesScreen } from "../screens/dm-screen";
import { OverviewScreen } from "../screens/home-screen";
import { NotificationsScreen } from "../screens/notifications-screen";
import { ProfileSettingsScreen } from "../screens/settings-screen";
import { VoiceScreen } from "../screens/voice-screen";

export type MobileMessagesScreenProps = ComponentProps<typeof MessagesScreen>;
export type MobileOverviewScreenProps = ComponentProps<typeof OverviewScreen>;
export type MobileNotificationsScreenProps = ComponentProps<typeof NotificationsScreen>;
export type MobileSettingsScreenProps = ComponentProps<typeof ProfileSettingsScreen>;
export type MobileVoiceScreenProps = ComponentProps<typeof VoiceScreen>;

export interface MobileProductNavigationActions {
  readonly openWorkspaceRoute: (serverId: string, channelId: string | null) => void;
}

const ActionsContext = createContext<MobileProductNavigationActions | null>(null);
const MessagesContext = createContext<MobileMessagesScreenProps | null>(null);
const NotificationsContext = createContext<MobileNotificationsScreenProps | null>(null);
const OverviewContext = createContext<MobileOverviewScreenProps | null>(null);
const SettingsContext = createContext<MobileSettingsScreenProps | null>(null);
const VoiceContext = createContext<MobileVoiceScreenProps | null>(null);

export function MobileProductNavigationProvider({
  children,
  value,
}: PropsWithChildren<{ readonly value: MobileProductNavigationActions }>) {
  return <ActionsContext.Provider value={value}>{children}</ActionsContext.Provider>;
}

export function MobileMessagesScreenProvider({
  children,
  value,
}: PropsWithChildren<{ readonly value: MobileMessagesScreenProps }>) {
  return <MessagesContext.Provider value={value}>{children}</MessagesContext.Provider>;
}

export function MobileNotificationsScreenProvider({
  children,
  value,
}: PropsWithChildren<{ readonly value: MobileNotificationsScreenProps }>) {
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function MobileOverviewScreenProvider({
  children,
  value,
}: PropsWithChildren<{ readonly value: MobileOverviewScreenProps }>) {
  return <OverviewContext.Provider value={value}>{children}</OverviewContext.Provider>;
}

export function MobileSettingsScreenProvider({
  children,
  value,
}: PropsWithChildren<{ readonly value: MobileSettingsScreenProps }>) {
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function MobileVoiceScreenProvider({
  children,
  value,
}: PropsWithChildren<{ readonly value: MobileVoiceScreenProps }>) {
  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useMobileProductNavigationActions(): MobileProductNavigationActions {
  return useRequiredContext(ActionsContext, "navigation actions");
}

export function useMobileMessagesScreenProps(): MobileMessagesScreenProps {
  return useRequiredContext(MessagesContext, "messages");
}

export function useMobileNotificationsScreenProps(): MobileNotificationsScreenProps {
  return useRequiredContext(NotificationsContext, "notifications");
}

export function useMobileOverviewScreenProps(): MobileOverviewScreenProps {
  return useRequiredContext(OverviewContext, "overview");
}

export function useMobileSettingsScreenProps(): MobileSettingsScreenProps {
  return useRequiredContext(SettingsContext, "settings");
}

export function useMobileVoiceScreenProps(): MobileVoiceScreenProps {
  return useRequiredContext(VoiceContext, "voice");
}

function useRequiredContext<T>(context: Context<T | null>, label: string): T {
  const value = useContext(context);
  if (!value) {
    throw new Error(`Mobile ${label} screen provider is missing.`);
  }
  return value;
}
