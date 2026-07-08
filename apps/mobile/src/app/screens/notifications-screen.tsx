import type { ComponentProps } from "react";

import { NotificationsScreen as LegacyNotificationsScreen } from "../mobile-root-screens-legacy";

export type NotificationsScreenProps = ComponentProps<typeof LegacyNotificationsScreen>;

export function NotificationsScreen(props: NotificationsScreenProps) {
  return <LegacyNotificationsScreen {...props} />;
}
