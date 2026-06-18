import type { AccountSettingsState } from "@/lib/account/actions";
import type { WhisprReleaseNote } from "@/lib/app-version";

export type SettingsBootstrapPayload = {
  buildInfo: {
    buildId: string;
    buildTime: string;
    contributors: string[];
    developerName: string;
    lastUpdated: string;
    notes: WhisprReleaseNote[];
    releaseChannel: string;
    version: string;
  };
  initialAccount: AccountSettingsState;
  uploadthingEnabled: boolean;
};
