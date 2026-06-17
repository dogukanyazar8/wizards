export type ProfileCompletionSignal =
  | "avatar"
  | "customStatus"
  | "displayName"
  | "email"
  | "emailVerified"
  | "twoFactor"
  | "username";

export type ProfileCompletionInput = {
  avatarUrl?: string | null;
  customStatus?: string | null;
  displayName?: string | null;
  email?: string | null;
  emailVerified?: boolean | null;
  twoFactorEnabled?: boolean | null;
  username?: string | null;
};

export type ProfileCompletionItem = {
  complete: boolean;
  id: ProfileCompletionSignal;
  weight: number;
};

export type ProfileCompletionSummary = {
  completedWeight: number;
  items: ProfileCompletionItem[];
  percent: number;
  totalWeight: number;
};

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

export function getProfileCompletionSummary(
  input: ProfileCompletionInput,
): ProfileCompletionSummary {
  const hasEmail = hasText(input.email);
  const items: ProfileCompletionItem[] = [
    {
      complete: hasText(input.displayName),
      id: "displayName",
      weight: 20,
    },
    {
      complete: hasText(input.username),
      id: "username",
      weight: 20,
    },
    {
      complete: hasEmail,
      id: "email",
      weight: 20,
    },
    {
      complete: hasText(input.avatarUrl),
      id: "avatar",
      weight: 20,
    },
    {
      complete:
        typeof input.emailVerified === "boolean" ? input.emailVerified : hasEmail,
      id: "emailVerified",
      weight: 20,
    },
  ];

  if (typeof input.twoFactorEnabled === "boolean") {
    items.push({
      complete: input.twoFactorEnabled,
      id: "twoFactor",
      weight: 15,
    });
  }

  if (input.customStatus !== undefined) {
    items.push({
      complete: hasText(input.customStatus),
      id: "customStatus",
      weight: 10,
    });
  }

  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const completedWeight = items.reduce(
    (sum, item) => sum + (item.complete ? item.weight : 0),
    0,
  );

  return {
    completedWeight,
    items,
    percent: totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0,
    totalWeight,
  };
}
