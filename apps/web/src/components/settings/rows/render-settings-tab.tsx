"use client";

import React from "react";
import { ReleaseNotesRow } from "../sections/desktop/release-notes-dialog";

import { useI18n } from "@/components/providers/locale-provider";
import type { SettingsSection, SettingsTab } from "@/lib/settings/navigation";
import {
  findSettingsTab,
  type SettingsGroupDef,
  type SettingsRowDef,
  type SettingsTabDef,
} from "@/lib/settings/tree";
import {
  SETTINGS_SOUND_PROFILE_SUFFIX,
  SETTINGS_SOUND_VOLUME_SUFFIX,
  useSettingsRowRuntime,
  useSettingValue,
} from "@/lib/settings/use-setting-value";

import { SettingActions } from "./setting-actions";
import { SettingCustomBlock } from "./setting-custom-block";
import { SettingInput } from "./setting-input";
import { SettingJump } from "./setting-jump";
import { SettingNav } from "./setting-nav";
import {
  SettingRiskyBlockBody,
  SettingRiskyBlockTrigger,
  settingRiskyPanelId,
} from "./setting-risky-block";
import { SettingSegment } from "./setting-segment";
import { SettingSelect } from "./setting-select";
import { SettingSlider } from "./setting-slider";
import {
  SETTING_SOUND_PROFILES,
  SettingSoundRow,
  type SettingSoundProfile,
} from "./setting-sound-row";
import { SettingTextarea } from "./setting-textarea";
import { SettingToggle } from "./setting-toggle";
import { SettingsGroup } from "./settings-group";
import { SettingsRow, type SettingsRowLabelIds } from "./settings-row";

/**
 * Ağaçtan sekme çizen **tek** fonksiyon — Ş6 §6.
 *
 * `SETTINGS_TREE` 169 satırın tamamının kaynağı; bölüm şeritleri (Ş7–Ş10) elle satır markup'ı
 * yazmaz, yalnız özel blokları ve riskli blok gövdelerini yazar. Bunun karşılığı burada tek bir
 * `switch`: `row.type` hangi kontrolü çizeceğini söyler, motor kendi kararını **vermez**
 * (PROMPT §4 kontrol seçimini ağaçta zaten kodladı).
 *
 * Bir satır bir bileşen: `useSettingValue` bir kanca ve 169 satırın değerini tek bileşende
 * okumak, kanca sırasını satır listesinin uzunluğuna bağlamak demek olurdu.
 */

/**
 * SPEC_DEVIATIONS #9 — `ownGroupTitleKey` taşıyan satır kendi başlığı altında çizilir.
 *
 * Ağaç `SET` ile birebir kalır (58 grup), çizim ise ayrı bir kap açar. Bölme genel: bayrağı
 * taşıyan her satır kendi kabına iner, öncesi ve sonrası ana grubun başlığını **bir kez**
 * kullanır. Ana başlığı iki kez çizmek, kullanıcıya aynı grubun iki kez başladığını söylerdi.
 */
export type SettingsRenderedGroup = {
  readonly note: string | undefined;
  readonly rows: readonly SettingsRowDef[];
  readonly title: string | undefined;
};

export function splitSettingsGroup(
  group: SettingsGroupDef,
  translate: (key: string) => string,
  /**
   * Ş7 — `titleData` / `noteData` bir **alan adı**dır, metin değil (`tree.ts` §başlık notu):
   * `badgeProgress` ve `sessionCount` çalışma zamanında dolar. Sözlük verilmezse alan adının
   * kendisi kalır; bu, sahibi gelmemiş bir alanı ekranda **görünür** bırakan aynı sözleşmedir
   * (özel blok yer tutucuları gibi).
   */
  data: Readonly<Record<string, string>> = {},
): readonly SettingsRenderedGroup[] {
  const resolveData = (field: string | undefined) =>
    field === undefined ? undefined : (data[field] ?? field);

  const parentTitle = group.titleKey ? translate(group.titleKey) : resolveData(group.titleData);
  const parentNote = group.noteKey ? translate(group.noteKey) : resolveData(group.noteData);

  const rendered: SettingsRenderedGroup[] = [];
  let parentUsed = false;
  let run: SettingsRowDef[] = [];

  const flushRun = () => {
    if (run.length === 0) {
      return;
    }

    rendered.push({
      note: parentUsed ? undefined : parentNote,
      rows: run,
      title: parentUsed ? undefined : parentTitle,
    });
    parentUsed = true;
    run = [];
  };

  for (const row of group.rows) {
    if (row.ownGroupTitleKey) {
      flushRun();
      rendered.push({
        note: undefined,
        rows: [row],
        title: translate(row.ownGroupTitleKey),
      });
      continue;
    }

    run.push(row);
  }

  flushRun();

  return rendered;
}

/**
 * `pp` menüsündeki durum noktalarının **token adları** (renk değil).
 *
 * Bu, motorun tek "bölüm bilgisi": presence menüsü referansta renk noktası taşıyor ve satır
 * markup'ını Ş7 yazmadığı için nokta ancak burada verilebilir. Sıra `settings.option.pp.1…4`
 * sırasıdır: Çevrimiçi · Boşta · Rahatsız Etmeyin · Görünmez.
 */
const SELECT_OPTION_TONE_TOKENS: Readonly<Record<string, readonly string[]>> = {
  pp: ["--success", "--warning", "--danger", "--text-muted"],
};

export function renderSettingsTab(section: SettingsSection, tab: SettingsTab): React.ReactNode {
  const definition = findSettingsTab(section, tab);

  if (!definition) {
    return null;
  }

  return <SettingsTabBody tab={definition} />;
}

export function SettingsTabBody({ tab }: { readonly tab: SettingsTabDef }) {
  const { t } = useI18n();
  const runtime = useSettingsRowRuntime();

  return (
    <>
      {tab.groups.flatMap((group, groupIndex) =>
        splitSettingsGroup(group, t, runtime.data).map((rendered, runIndex) => (
          <SettingsGroup
            key={`${tab.key}-${groupIndex}-${runIndex}`}
            note={rendered.note}
            testId={`settings-group-${tab.key}-${groupIndex}-${runIndex}`}
            title={rendered.title}
          >
            {rendered.rows.map((row, rowIndex) => (
              <SettingsTreeRow divider={rowIndex > 0} key={row.key} row={row} />
            ))}
          </SettingsGroup>
        )),
      )}
    </>
  );
}

export function SettingsTreeRow({
  divider,
  row,
}: {
  readonly divider: boolean;
  readonly row: SettingsRowDef;
}) {
  const runtime = useSettingsRowRuntime();

  if (row.key === "o5") {
    return <ReleaseNotesRow divider={divider} disabled={runtime.disabledRows?.o5 ?? false} />;
  }

  // Satır dolgusunu ve kırpmayı blok kendisi yönetir (`isFullWidthSettingsBlock`); inline iki
  // blok (mikrofon ölçeri, kamera önizlemesi) normal satır dolgusuyla çizilir.
  if (row.type === "custom") {
    return <SettingCustomBlock data={runtime.data} divider={divider} row={row} />;
  }

  return <SettingsControlRow divider={divider} row={row} />;
}

function SettingsControlRow({
  divider,
  row,
}: {
  readonly divider: boolean;
  readonly row: SettingsRowDef;
}) {
  const { t } = useI18n();
  const runtime = useSettingsRowRuntime();

  const title = row.titleKey ? t(row.titleKey) : undefined;
  const description = row.descriptionKey
    ? t(row.descriptionKey)
    : row.descriptionData
      ? runtime.data[row.descriptionData]
      : undefined;
  const badge = row.badgeKey
    ? t(row.badgeKey)
    : row.badgeData
      ? runtime.data[row.badgeData]
      : undefined;

  const shared: Omit<React.ComponentProps<typeof SettingsRow>, "control" | "field" | "below"> = {
    badge,
    // Kilitli satırın pili birincil tonda (referans `lok` dalı); kalanlar ağacın `tone` alanını
    // izler ve tonu olmayan pil nötr zemine düşer.
    badgeTone: row.locked ? "primary" : row.tone,
    description,
    divider,
    rowKey: row.key,
    title,
    tone: row.tone,
  };

  switch (row.type) {
    case "toggle":
    case "lockedToggle":
      return <SettingsRow {...shared} control={(ids) => <ToggleControl ids={ids} row={row} />} />;

    case "select":
      return <SettingsRow {...shared} control={(ids) => <SelectControl ids={ids} row={row} />} />;

    case "segment":
      return <SettingsRow {...shared} control={(ids) => <SegmentControl ids={ids} row={row} />} />;

    case "slider":
      return <SettingsRow {...shared} control={(ids) => <SliderControl ids={ids} row={row} />} />;

    case "input":
      return <SettingsRow {...shared} control={(ids) => <InputControl ids={ids} row={row} />} />;

    case "textarea":
      return (
        <SettingsRow
          {...shared}
          align="start"
          field={(ids) => <TextareaControl ids={ids} row={row} />}
        />
      );

    case "action":
      return (
        <SettingsRow
          {...shared}
          control={(ids) => <ActionsControl ids={ids} row={row} />}
          below={
            row.riskyBlock && runtime.openRisky === row.riskyBlock ? (
              <SettingRiskyBlockBody rowKey={row.key} testId={`setting-risky-body-${row.key}`}>
                {runtime.riskyBodies[row.key] ?? null}
              </SettingRiskyBlockBody>
            ) : null
          }
        />
      );

    case "jump":
      return <SettingsRow {...shared} control={(ids) => <JumpControl ids={ids} row={row} />} />;

    case "nav":
      return <SettingsRow {...shared} control={(ids) => <NavControl ids={ids} row={row} />} />;

    case "sound":
      return <SoundRowShell divider={divider} row={row} shared={shared} />;

    case "risky":
      return <RiskyRowShell divider={divider} row={row} shared={shared} />;

    default:
      return null;
  }
}

type ControlProps = { readonly ids: SettingsRowLabelIds; readonly row: SettingsRowDef };

function ToggleControl({ ids, row }: ControlProps) {
  const { locked, setValue, value } = useSettingValue<boolean>(row.key);
  const runtime = useSettingsRowRuntime();

  return (
    <SettingToggle
      checked={value}
      describedById={ids.describedById}
      disabled={runtime.disabledRows?.[row.key] ?? false}
      labelledById={ids.labelledById}
      locked={locked || row.type === "lockedToggle"}
      onChange={setValue}
      testId={`setting-toggle-${row.key}`}
    />
  );
}

function SelectControl({ ids, row }: ControlProps) {
  const { setValue, value } = useSettingValue<number>(row.key);
  const { t } = useI18n();
  const runtime = useSettingsRowRuntime();
  const tones = SELECT_OPTION_TONE_TOKENS[row.key];

  const options = (row.options ?? []).map((optionKey, index) => ({
    label: t(optionKey),
    toneToken: tones?.[index],
  }));

  return (
    <SettingSelect
      describedById={ids.describedById}
      disabled={runtime.disabledRows?.[row.key] ?? false}
      labelledById={ids.labelledById}
      onChange={setValue}
      onOpenChange={(open) => runtime.setOpenSelect(open ? row.key : null)}
      open={runtime.openSelect === row.key}
      options={options}
      testId={`setting-select-${row.key}`}
      value={value}
    />
  );
}

function SegmentControl({ ids, row }: ControlProps) {
  const { setValue, value } = useSettingValue<number>(row.key);
  const { t } = useI18n();
  const runtime = useSettingsRowRuntime();

  return (
    <SettingSegment
      describedById={ids.describedById}
      disabled={runtime.disabledRows?.[row.key] ?? false}
      labelledById={ids.labelledById}
      onChange={setValue}
      options={(row.options ?? []).map((optionKey) => t(optionKey))}
      testId={`setting-segment-${row.key}`}
      value={value}
    />
  );
}

function SliderControl({ ids, row }: ControlProps) {
  const { setValue, value } = useSettingValue<number>(row.key);
  const runtime = useSettingsRowRuntime();
  const [min, max, unit] = row.range ?? [0, 100, ""];

  return (
    <SettingSlider
      describedById={ids.describedById}
      disabled={runtime.disabledRows?.[row.key] ?? false}
      labelledById={ids.labelledById}
      max={max}
      min={min}
      onChange={setValue}
      testId={`setting-slider-${row.key}`}
      unit={unit}
      value={value}
    />
  );
}

function InputControl({ ids, row }: ControlProps) {
  const { setValue, value } = useSettingValue<string>(row.key);
  const { t } = useI18n();
  const runtime = useSettingsRowRuntime();

  return (
    <SettingInput
      maxLength={row.maxLength}
      describedById={ids.describedById}
      disabled={runtime.disabledRows?.[row.key] ?? false}
      labelledById={ids.labelledById}
      onChange={setValue}
      prefix={row.prefixKey ? t(row.prefixKey) : undefined}
      testId={`setting-input-${row.key}`}
      value={value}
    />
  );
}

function TextareaControl({ ids, row }: ControlProps) {
  const { setValue, value } = useSettingValue<string>(row.key);
  const runtime = useSettingsRowRuntime();

  return (
    <SettingTextarea
      describedById={ids.describedById}
      disabled={runtime.disabledRows?.[row.key] ?? false}
      labelledById={ids.labelledById}
      maxLength={row.maxLength ?? 0}
      onChange={setValue}
      testId={`setting-textarea-${row.key}`}
      value={value}
    />
  );
}

function ActionsControl({ ids, row }: ControlProps) {
  const { t } = useI18n();
  const runtime = useSettingsRowRuntime();

  return (
    <SettingActions
      actions={(row.actions ?? []).map((action, index) => ({
        ...(action.kind ? { kind: action.kind } : {}),
        ...(index === 0 && row.riskyBlock
          ? {
              expanded: runtime.openRisky === row.riskyBlock,
              controlsId:
                runtime.openRisky === row.riskyBlock ? settingRiskyPanelId(row.key) : undefined,
            }
          : {}),
        // K5 — karşılığı olmayan satırın düğmesi çizilir ama basılmaz.
        disabled: action.disabled || (runtime.disabledRows?.[row.key] ?? false),
        label: t(
          index === 0 && row.riskyBlock && runtime.openRisky === row.riskyBlock
            ? "settings.control.risky.close"
            : action.labelKey,
        ),
        // Eylemin ne yaptığını bölüm şeridi bilir; motor yalnız düğmeyi çizer ve **hangi**
        // düğmeye basıldığını satır anahtarıyla birlikte yukarı verir.
        onClick: () => {
          if (index === 0 && row.riskyBlock) {
            runtime.setOpenRisky(runtime.openRisky === row.riskyBlock ? null : row.riskyBlock);
          } else {
            runtime.onAction(row.key, index);
          }
        },
      }))}
      describedById={ids.describedById}
      labelledById={ids.labelledById}
      testId={`setting-actions-${row.key}`}
    />
  );
}

function JumpControl({ ids, row }: ControlProps) {
  const { t } = useI18n();
  const runtime = useSettingsRowRuntime();
  const label = row.actions?.[0]?.labelKey ?? row.navLabelKey;

  if (!label || !row.target) {
    return null;
  }

  return (
    <SettingJump
      describedById={ids.describedById}
      label={t(label)}
      onJump={runtime.onJump}
      target={row.target}
      testId={`setting-jump-${row.key}`}
    />
  );
}

function NavControl({ ids, row }: ControlProps) {
  const { t } = useI18n();
  const runtime = useSettingsRowRuntime();

  return (
    <SettingNav
      describedById={ids.describedById}
      disabled={runtime.disabledRows?.[row.key] ?? false}
      label={row.navLabelKey ? t(row.navLabelKey) : ""}
      onNavigate={() => runtime.onNavigate(row.key)}
      testId={`setting-nav-${row.key}`}
    />
  );
}

type RowShellProps = {
  readonly divider: boolean;
  readonly row: SettingsRowDef;
  readonly shared: Omit<React.ComponentProps<typeof SettingsRow>, "control" | "field" | "below">;
};

function SoundRowShell({ row, shared }: RowShellProps) {
  const enabled = useSettingValue<boolean>(row.key);
  const profileKey = `${row.key}${SETTINGS_SOUND_PROFILE_SUFFIX}`;
  const volumeKey = `${row.key}${SETTINGS_SOUND_VOLUME_SUFFIX}`;
  const profile = useSettingValue<string>(profileKey, row.sound?.profile ?? "whispr");
  const volume = useSettingValue<number>(volumeKey, row.sound?.volume ?? 0);
  const runtime = useSettingsRowRuntime();
  const disabled = runtime.disabledRows?.[row.key] ?? false;

  const resolvedProfile: SettingSoundProfile = SETTING_SOUND_PROFILES.includes(
    profile.value as SettingSoundProfile,
  )
    ? (profile.value as SettingSoundProfile)
    : "whispr";

  return (
    <SettingsRow
      {...shared}
      below={
        <SettingSoundRow
          disabled={disabled}
          onPreview={() => runtime.onSoundPreview(row.key)}
          onProfileChange={profile.setValue}
          onVolumeChange={volume.setValue}
          profile={resolvedProfile}
          testId={`setting-sound-${row.key}`}
          volume={volume.value}
        />
      }
      control={(ids) => (
        <SettingToggle
          checked={enabled.value}
          describedById={ids.describedById}
          disabled={disabled}
          labelledById={ids.labelledById}
          onChange={enabled.setValue}
          testId={`setting-toggle-${row.key}`}
        />
      )}
    />
  );
}

function RiskyRowShell({ row, shared }: RowShellProps) {
  const runtime = useSettingsRowRuntime();
  const blockKey = row.riskyBlock;

  if (!blockKey) {
    return null;
  }

  const open = runtime.openRisky === blockKey;

  return (
    <SettingsRow
      {...shared}
      below={
        open ? (
          <SettingRiskyBlockBody rowKey={row.key} testId={`setting-risky-body-${row.key}`}>
            {runtime.riskyBodies[row.key] ?? null}
          </SettingRiskyBlockBody>
        ) : null
      }
      control={(ids) => (
        <SettingRiskyBlockTrigger
          blockKey={blockKey}
          describedById={ids.describedById}
          onOpenChange={(next) => runtime.setOpenRisky(next ? blockKey : null)}
          open={open}
          rowKey={row.key}
          testId={`setting-risky-${row.key}`}
        />
      )}
    />
  );
}
