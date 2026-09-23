const DAY_MS = 24 * 60 * 60 * 1000;

export type CohortUser = {
  createdAt: Date;
  id: string;
};

export type CohortActivity = {
  date: Date;
  userId: string;
};

export type CohortRow = {
  /** ISO date of the cohort's Monday. */
  weekStart: string;
  retainedDay1: number;
  retainedDay7: number;
  retainedDay30: number;
  signups: number;
};

function utcDayStart(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/** Weeks start on Monday so a cohort never straddles a weekend split. */
export function getIsoWeekStart(value: Date) {
  const dayStart = utcDayStart(value);
  const weekday = (dayStart.getUTCDay() + 6) % 7;

  return new Date(dayStart.getTime() - weekday * DAY_MS);
}

/**
 * Retention counts a person once per window: "came back on day 7" means they
 * were active on the seventh day after signing up, not that they were active
 * every day up to it.
 */
export function buildCohortTable(users: CohortUser[], activity: CohortActivity[]): CohortRow[] {
  const activeDays = new Map<string, Set<number>>();

  for (const entry of activity) {
    const days = activeDays.get(entry.userId) ?? new Set<number>();
    days.add(utcDayStart(entry.date).getTime());
    activeDays.set(entry.userId, days);
  }

  const cohorts = new Map<number, CohortRow>();

  for (const user of users) {
    const weekStart = getIsoWeekStart(user.createdAt);
    const row = cohorts.get(weekStart.getTime()) ?? {
      retainedDay1: 0,
      retainedDay7: 0,
      retainedDay30: 0,
      signups: 0,
      weekStart: weekStart.toISOString().slice(0, 10),
    };

    row.signups += 1;

    const signupDay = utcDayStart(user.createdAt).getTime();
    const days = activeDays.get(user.id);

    if (days) {
      if (days.has(signupDay + DAY_MS)) {
        row.retainedDay1 += 1;
      }

      if (days.has(signupDay + 7 * DAY_MS)) {
        row.retainedDay7 += 1;
      }

      if (days.has(signupDay + 30 * DAY_MS)) {
        row.retainedDay30 += 1;
      }
    }

    cohorts.set(weekStart.getTime(), row);
  }

  return [...cohorts.entries()].sort((left, right) => left[0] - right[0]).map(([, row]) => row);
}

export function getCohortRetentionPercent(retained: number, signups: number) {
  return signups === 0 ? null : Math.round((retained / signups) * 1000) / 10;
}
