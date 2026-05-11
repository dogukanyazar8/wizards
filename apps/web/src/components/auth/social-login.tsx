"use client";

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.76-.07-1.49-.19-2.19H12v4.14h5.38a4.6 4.6 0 0 1-1.99 3.02v2.51h3.23c1.89-1.74 2.98-4.3 2.98-7.48Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.9 6.62-2.43l-3.23-2.51c-.9.6-2.05.95-3.39.95-2.6 0-4.81-1.76-5.6-4.13H3.06v2.6A10 10 0 0 0 12 22Z"
      />
      <path fill="#FBBC05" d="M6.4 13.88a6 6 0 0 1 0-3.76v-2.6H3.06a10 10 0 0 0 0 8.96l3.34-2.6Z" />
      <path
        fill="#EA4335"
        d="M12 5.99c1.47 0 2.79.5 3.83 1.5l2.86-2.87C16.96 3.01 14.7 2 12 2a10 10 0 0 0-8.94 5.52l3.34 2.6C7.19 7.75 9.4 5.99 12 5.99Z"
      />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path fill="#F25022" d="M3 3h8.5v8.5H3z" />
      <path fill="#7FBA00" d="M12.5 3H21v8.5h-8.5z" />
      <path fill="#00A4EF" d="M3 12.5h8.5V21H3z" />
      <path fill="#FFB900" d="M12.5 12.5H21V21h-8.5z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M16.7 12.8c0-2.2 1.8-3.2 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-3-.8-1.5 0-2.9.9-3.7 2.2-1.6 2.8-.4 7 1.1 9.3.8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.8 3-.8s1.8.8 3 .8 2-.1 2.8-2.1c.9-1.3 1.3-2.6 1.3-2.7-.1-.1-2.7-1.1-2.7-4Zm-2.2-6.4c.7-.8 1.1-1.9 1-3-1 .1-2.1.7-2.8 1.5-.6.7-1.1 1.8-1 2.9 1.1.1 2.2-.5 2.8-1.4Z"
      />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        fill="#5865F2"
        d="M19.7 5.6A18 18 0 0 0 15.2 4l-.2.4c1.6.4 2.3 1 2.3 1s-2.8-1.5-6.6-1.5c-3.8 0-6.6 1.5-6.6 1.5s.7-.6 2.3-1L6.2 4a18 18 0 0 0-4.5 1.6S-.7 9.2.2 16.2c0 0 2.7 3.3 6.6 3.4l.8-1.1c-1.4-.4-2-1.1-2-1.1s.3.2.8.4h.1l.2.1h.1c.7.3 1.5.5 2.5.7 1.6.3 3.5.2 5.1 0 1-.2 1.9-.4 2.6-.7h.1l.2-.1h.1c.5-.2.8-.4.8-.4s-.7.7-2.1 1.1l.8 1.1c3.9-.1 6.6-3.4 6.6-3.4.9-7-1.5-10.6-1.5-10.6ZM8.4 14.8c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm7.2 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z"
      />
    </svg>
  );
}

const PROVIDERS = [
  { Icon: GoogleIcon, key: "google", label: "Google" },
  { Icon: MicrosoftIcon, key: "microsoft", label: "Microsoft" },
  { Icon: AppleIcon, key: "apple", label: "Apple" },
  { Icon: DiscordIcon, key: "discord", label: "Discord" },
] as const;

export function SocialLogin({
  disabled,
  onGoogle,
  onUnavailable,
}: {
  disabled?: boolean;
  onGoogle?: () => void;
  onUnavailable?: (provider: string) => void;
}) {
  return (
    <div className="modern-social-grid">
      {PROVIDERS.map(({ Icon, key, label }) => (
        <button
          aria-label={label}
          className="modern-social-button"
          disabled={disabled}
          key={key}
          onClick={key === "google" ? onGoogle : () => onUnavailable?.(label)}
          type="button"
        >
          <Icon />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
