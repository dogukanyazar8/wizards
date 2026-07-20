import type { ReactNode } from "react";
import Svg, { Path, Rect } from "react-native-svg";
import type { MobileAuthSocialProviderId } from "../../../../auth/mobile-auth-social-config";
import { mobileBrandPalette } from "../../../../design/palette";

export interface AuthSocialProviderIconProps {
  readonly provider: MobileAuthSocialProviderId;
  readonly testID?: string;
}

const PROVIDER_ICON_SIZE: Record<MobileAuthSocialProviderId, number> = {
  apple: 19,
  discord: 21,
  google: 20,
  microsoft: 18,
};

/** Uses the provider's supplied mark rather than recoloring it with Whispr tokens. */
export function AuthSocialProviderIcon({ provider, testID }: AuthSocialProviderIconProps) {
  const size = PROVIDER_ICON_SIZE[provider];

  if (size === undefined) {
    return null;
  }

  return (
    <Svg
      accessible={false}
      accessibilityElementsHidden
      height={size}
      viewBox="0 0 24 24"
      width={size}
      {...(testID === undefined ? {} : { testID })}
    >
      {renderProviderMark(provider)}
    </Svg>
  );
}

function renderProviderMark(provider: MobileAuthSocialProviderId): ReactNode {
  if (provider === "microsoft") {
    return (
      <>
        <Rect fill={mobileBrandPalette.microsoft.red} height={8.5} width={8.5} x={3} y={3} />
        <Rect fill={mobileBrandPalette.microsoft.green} height={8.5} width={8.5} x={12.5} y={3} />
        <Rect fill={mobileBrandPalette.microsoft.blue} height={8.5} width={8.5} x={3} y={12.5} />
        <Rect
          fill={mobileBrandPalette.microsoft.yellow}
          height={8.5}
          width={8.5}
          x={12.5}
          y={12.5}
        />
      </>
    );
  }

  if (provider === "apple") {
    return (
      <Path
        d="M16.7 12.9c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3.1 2.4 1.2-.1 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.6-1-2.7-3.9zM14.4 5.6c.7-.8 1.1-1.9 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4z"
        fill={mobileBrandPalette.apple.ink}
      />
    );
  }

  if (provider === "discord") {
    return (
      <Path
        d="M19.3 5.5A17 17 0 0 0 15.1 4.2l-.2.4a15.6 15.6 0 0 1 4 2 13 13 0 0 0-11.8 0 15.6 15.6 0 0 1 4-2l-.2-.4a17 17 0 0 0-4.2 1.3C4.3 9.4 3.7 13.2 4 17c1.8 1.3 3.5 2.1 5.2 2.6l.9-1.5c-.9-.3-1.7-.7-2.5-1.3l.6-.5a12.2 12.2 0 0 0 10.6 0l.6.5c-.8.6-1.6 1-2.5 1.3l.9 1.5c1.7-.5 3.4-1.3 5.2-2.6.4-4.4-.8-8-2.7-11.5zM9.7 14.7c-.9 0-1.6-.8-1.6-1.8s.7-1.8 1.6-1.8 1.6.8 1.6 1.8-.7 1.8-1.6 1.8zm4.6 0c-.9 0-1.6-.8-1.6-1.8s.7-1.8 1.6-1.8 1.6.8 1.6 1.8-.7 1.8-1.6 1.8z"
        fill={mobileBrandPalette.discord.blurple}
      />
    );
  }

  return (
    <>
      <Path
        d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4z"
        fill={mobileBrandPalette.google.blue}
      />
      <Path
        d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"
        fill={mobileBrandPalette.google.green}
      />
      <Path
        d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9z"
        fill={mobileBrandPalette.google.yellow}
      />
      <Path
        d="M12 6c1.5 0 2.8.5 3.8 1.5L18.7 5A10 10 0 0 0 3.1 7.5L6.4 10c.8-2.3 3-4 5.6-4z"
        fill={mobileBrandPalette.google.red}
      />
    </>
  );
}
