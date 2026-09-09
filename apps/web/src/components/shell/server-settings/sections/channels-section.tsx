"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Hash,
  Pencil,
  Plus,
  Trash2,
  Volume2,
} from "lucide-react";
import type {
  WorkspaceChannel,
  WorkspaceChannelPermissionPreset,
  WorkspaceServerDetail,
} from "@wizards/types";
import { Button } from "@wizards/ui";

import { useI18n } from "@/components/providers/locale-provider";
import type { ServerSettingsSectionProps } from "../section-props";
import { Modal } from "@/components/ui/modal";
import { DISPLAY_FONT } from "@/components/servers/shared/typography";
import {
  CHANNEL_ACCESS_CHIP_BACKGROUND_ALPHA,
  getChannelAccessColor,
} from "@/lib/servers/channel-access";
import {
  type CategoryOrderItem,
  type ChannelOrderItem,
  type OrderDirection,
  moveCategory,
  moveChannelBetweenCategories,
} from "@/lib/servers/channel-ordering";
import { SERVER_METRICS, hairline, pxToEm, pxToRem } from "@/lib/servers/metrics";
import { viewerCan } from "@/lib/servers/viewer-permissions";
import { useAppStore } from "@/lib/store";
import { useLayerStack } from "@/lib/servers/use-layer-stack";
import {
  applyCategoryReorder,
  applyChannelReorder,
  deleteCategoryRequest,
  fetchChannelPermissionSettings,
  reorderCategoriesRequest,
  reorderChannelsRequest,
  workspaceQueryKeys,
} from "@/lib/workspace/client";
import { cn } from "@/lib/utils";

/**
 * Sunucu ayarları › **Kanallar ve Kategoriler** — SPEC-SUNUCU §8.4.
 *
 * Bölüm iki iş yapıyor: pencereleri açmak ve sırayı yazmak. Pencerelerin gövdesi Ş8'de;
 * burada yalnız mağazadaki `openCategoryModal` / `openChannelModal` çağrılıyor. K11 gereği
 * pencere ayarların **üstünde** çizilir ve kapanınca ayarlara dönülür — bunu `layer-stack`
 * hallediyor, bölümün ayrıca bir şey yapmasına gerek yok.
 *
 * **Sıra iki yoldan değişiyor** ve ikisi de aynı saf çekirdeği (`channel-ordering.ts`)
 * kullanıyor: kategori satırındaki yukarı/aşağı düğmeleri ve dnd-kit sürüklemesi. Kanal
 * satırında tasarımda yukarı/aşağı düğmesi **yok**; klavye alternatifi (a11y §12) tutamağın
 * kendisidir — `KeyboardSensor` ile tutamağa odaklanıp `Space` + ok tuşlarıyla taşınır.
 * Tasarımda olmayan iki düğme eklemek yerine var olan tutamağı klavyeye açmak, hem SPEC'e
 * hem kurala uyuyor.
 *
 * **Erişim çipi.** `WorkspaceChannel.permissionPreset` sözleşmede duruyor ama üründe onu
 * **yazan yok**; ön ayar yalnız `/channels/[id]/permissions` ucundan geliyor (üstü kapalı
 * `deny` maskelerinden türetiliyor, `detail` içinde o maskeler yok). Bu yüzden çip kanal
 * başına bir okumayla besleniyor ve yanıt gelene kadar **boş** çizilir — `locked` bayrağından
 * tahmin yürütmek çipi kısa süreliğine yalancı yapardı. Uç `permissionPreset`i doldurduğu gün
 * bu okuma silinir (raporda TODO(api)).
 */

type SectionCategory = {
  channels: readonly WorkspaceChannel[];
  /** `null` = kategorisiz kanallar; sahte kategorinin yeniden adlandırma/silme düğmesi yoktur. */
  id: string | null;
  name: string;
};

export type ChannelsSectionViewProps = {
  accessByChannelId: Readonly<Record<string, WorkspaceChannelPermissionPreset | undefined>>;
  categories: readonly SectionCategory[];
  onAddCategory: () => void;
  onAddChannel: (categoryId: string | null) => void;
  onDeleteCategory: (category: { id: string; name: string }) => void;
  onDeleteChannel: (channel: WorkspaceChannel) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onEditCategory: (categoryId: string) => void;
  onEditChannel: (channel: WorkspaceChannel) => void;
  onMoveCategory: (categoryId: string, direction: OrderDirection) => void;
};

const CATEGORY_DRAG_PREFIX = "settings-category:";

function categoryDragId(categoryId: string): string {
  return `${CATEGORY_DRAG_PREFIX}${categoryId}`;
}

export function ChannelsSectionView({
  accessByChannelId,
  categories,
  onAddCategory,
  onAddChannel,
  onDeleteCategory,
  onDeleteChannel,
  onDragEnd,
  onEditCategory,
  onEditChannel,
  onMoveCategory,
}: ChannelsSectionViewProps) {
  const { t } = useI18n();
  const { settingsSections } = SERVER_METRICS;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const realCategories = categories.filter((category) => category.id !== null);

  return (
    <div data-testid="server-settings-channels">
      <div
        className="flex flex-wrap items-center"
        style={{ gap: pxToRem(settingsSections.channelsToolbarGap) }}
      >
        <ToolbarButton
          label={t("server.settings.channels.addCategory")}
          onClick={onAddCategory}
          testId="settings-add-category"
          tone="outline"
        />
        <ToolbarButton
          label={t("server.settings.channels.addChannel")}
          onClick={() => onAddChannel(null)}
          testId="settings-add-channel"
          tone="solid"
        />
        <span
          className="flex-1 text-right text-[hsl(var(--text-muted))]"
          style={{
            fontSize: pxToRem(settingsSections.channelsNoteFontSize),
            lineHeight: 1.4,
            minWidth: pxToRem(settingsSections.channelsNoteMinWidth),
          }}
        >
          {t("server.settings.channels.note")}
        </span>
      </div>

      {categories.length === 0 ? (
        <p
          className="text-[hsl(var(--text-muted))]"
          style={{
            fontSize: pxToRem(settingsSections.channelsNoteFontSize),
            marginTop: pxToRem(settingsSections.channelsListMarginTop),
          }}
        >
          {t("server.settings.channels.empty")}
        </p>
      ) : (
        <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd} sensors={sensors}>
          <div
            className="flex flex-col"
            style={{
              gap: pxToRem(settingsSections.channelsListGap),
              marginTop: pxToRem(settingsSections.channelsListMarginTop),
            }}
          >
            <SortableContext
              items={realCategories.map((category) => categoryDragId(category.id as string))}
              strategy={verticalListSortingStrategy}
            >
              {categories.map((category, index) => (
                <CategoryCard
                  accessByChannelId={accessByChannelId}
                  canMoveDown={category.id !== null && index < realCategories.length - 1}
                  canMoveUp={category.id !== null && index > 0}
                  category={category}
                  key={category.id ?? "uncategorized"}
                  onAddChannel={onAddChannel}
                  onDeleteCategory={onDeleteCategory}
                  onDeleteChannel={onDeleteChannel}
                  onEditCategory={onEditCategory}
                  onEditChannel={onEditChannel}
                  onMoveCategory={onMoveCategory}
                />
              ))}
            </SortableContext>
          </div>
        </DndContext>
      )}
    </div>
  );
}

type ToolbarButtonProps = {
  label: string;
  onClick: () => void;
  testId: string;
  tone: "outline" | "solid";
};

function ToolbarButton({ label, onClick, testId, tone }: ToolbarButtonProps) {
  const { settingsSections } = SERVER_METRICS;
  const solid = tone === "solid";

  return (
    <button
      className={cn(
        "flex items-center whitespace-nowrap font-semibold transition-[background-color,filter]",
        solid
          ? "border-0 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:brightness-110"
          : "border bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.2)]",
      )}
      data-testid={testId}
      onClick={onClick}
      style={{
        borderColor: solid ? undefined : "hsl(var(--primary)/0.4)",
        borderRadius: pxToRem(settingsSections.channelsButtonRadius),
        borderWidth: solid ? undefined : hairline(),
        boxShadow: solid ? "0 12px 26px -18px hsl(var(--primary))" : undefined,
        fontSize: pxToRem(settingsSections.channelsButtonFontSize),
        gap: pxToRem(settingsSections.channelsButtonGap),
        height: pxToRem(settingsSections.channelsButtonHeight),
        lineHeight: 1,
        paddingInline: pxToRem(settingsSections.channelsButtonPaddingX),
      }}
      type="button"
    >
      <Plus
        aria-hidden="true"
        style={{
          height: pxToEm(
            settingsSections.channelsActionGlyphSize,
            settingsSections.channelsButtonFontSize,
          ),
          width: pxToEm(
            settingsSections.channelsActionGlyphSize,
            settingsSections.channelsButtonFontSize,
          ),
        }}
      />
      {label}
    </button>
  );
}

type CategoryCardProps = {
  accessByChannelId: Readonly<Record<string, WorkspaceChannelPermissionPreset | undefined>>;
  canMoveDown: boolean;
  canMoveUp: boolean;
  category: SectionCategory;
  onAddChannel: (categoryId: string | null) => void;
  onDeleteCategory: (category: { id: string; name: string }) => void;
  onDeleteChannel: (channel: WorkspaceChannel) => void;
  onEditCategory: (categoryId: string) => void;
  onEditChannel: (channel: WorkspaceChannel) => void;
  onMoveCategory: (categoryId: string, direction: OrderDirection) => void;
};

function CategoryCard({
  accessByChannelId,
  canMoveDown,
  canMoveUp,
  category,
  onAddChannel,
  onDeleteCategory,
  onDeleteChannel,
  onEditCategory,
  onEditChannel,
  onMoveCategory,
}: CategoryCardProps) {
  const { t } = useI18n();
  const { settingsSections } = SERVER_METRICS;
  // Alanlar kanca çağrısında **çözülür**: `sortable.attributes` gibi bir erişim, dnd-kit'in
  // ref taşıyan nesnesine render sırasında dokunmak sayılır (`react-hooks/refs`).
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    data: { categoryId: category.id, itemType: "category" },
    disabled: category.id === null,
    id: categoryDragId(category.id ?? "uncategorized"),
  });

  return (
    <section
      className="overflow-hidden border bg-[hsl(var(--surface-card))]"
      data-testid={`settings-category-${category.id ?? "uncategorized"}`}
      ref={setNodeRef}
      style={{
        borderColor: `hsl(var(--border)/${settingsSections.channelsHeaderBorderBottomAlpha + 0.1})`,
        borderRadius: pxToRem(settingsSections.channelsCardRadius),
        borderWidth: hairline(),
        opacity: isDragging ? 0.6 : 1,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <div
        className="flex items-center bg-[hsl(var(--surface-secondary)/0.55)]"
        style={{
          borderBottom: `${hairline()} solid hsl(var(--border)/${settingsSections.channelsHeaderBorderBottomAlpha})`,
          gap: pxToRem(settingsSections.channelsHeaderGap),
          padding: `${pxToRem(settingsSections.channelsHeaderPaddingY)} ${pxToRem(settingsSections.channelsHeaderPaddingX)}`,
        }}
      >
        {category.id === null ? null : (
          <DragHandle
            attributes={attributes}
            label={t("server.settings.channels.categoryHandle", { name: category.name })}
            listeners={listeners}
          />
        )}
        <span
          className="font-semibold uppercase text-[hsl(var(--text-secondary))]"
          style={{
            fontFamily: DISPLAY_FONT,
            fontSize: pxToRem(settingsSections.channelsCategoryFontSize),
            letterSpacing: `${settingsSections.channelsCategoryLetterSpacing}em`,
            lineHeight: 1,
          }}
        >
          {category.name}
        </span>
        <span
          aria-label={t("server.settings.channels.channelCountLabel", {
            count: category.channels.length,
          })}
          className="font-semibold text-[hsl(var(--text-muted))]"
          style={{
            background: "hsl(var(--surface-tertiary))",
            borderRadius: pxToRem(settingsSections.channelsCountChipRadius),
            fontFamily: DISPLAY_FONT,
            fontSize: pxToRem(settingsSections.channelsCountChipFontSize),
            lineHeight: 1,
            padding: `${pxToRem(settingsSections.channelsCountChipPaddingY)} ${pxToRem(settingsSections.channelsCountChipPaddingX)}`,
          }}
        >
          {category.channels.length}
        </span>

        <div
          className="ml-auto flex shrink-0 items-center"
          style={{ gap: pxToRem(settingsSections.channelsActionGap) }}
        >
          {category.id === null ? null : (
            <>
              <IconAction
                disabled={!canMoveUp}
                icon={ChevronUp}
                label={t("server.settings.channels.moveCategoryUp", { name: category.name })}
                onClick={() => onMoveCategory(category.id as string, "up")}
                testId={`settings-category-up-${category.id}`}
              />
              <IconAction
                disabled={!canMoveDown}
                icon={ChevronDown}
                label={t("server.settings.channels.moveCategoryDown", { name: category.name })}
                onClick={() => onMoveCategory(category.id as string, "down")}
                testId={`settings-category-down-${category.id}`}
              />
            </>
          )}
          <IconAction
            icon={Plus}
            label={t("server.settings.channels.addChannelToCategory", { name: category.name })}
            onClick={() => onAddChannel(category.id)}
            testId={`settings-category-add-${category.id ?? "uncategorized"}`}
          />
          {category.id === null ? null : (
            <>
              <IconAction
                icon={Pencil}
                label={t("server.settings.channels.editCategory", { name: category.name })}
                onClick={() => onEditCategory(category.id as string)}
                testId={`settings-category-edit-${category.id}`}
              />
              <IconAction
                danger
                icon={Trash2}
                label={t("server.settings.channels.deleteCategory", { name: category.name })}
                onClick={() => onDeleteCategory({ id: category.id as string, name: category.name })}
                testId={`settings-category-delete-${category.id}`}
              />
            </>
          )}
        </div>
      </div>

      <div
        className="flex flex-col"
        style={{ padding: pxToRem(settingsSections.channelsRowsPadding) }}
      >
        <SortableContext
          items={category.channels.map((channel) => channel.id)}
          strategy={verticalListSortingStrategy}
        >
          {category.channels.map((channel) => (
            <ChannelRow
              categoryId={category.id}
              channel={channel}
              key={channel.id}
              onDelete={onDeleteChannel}
              onEdit={onEditChannel}
              preset={accessByChannelId[channel.id]}
            />
          ))}
        </SortableContext>
      </div>
    </section>
  );
}

type ChannelRowProps = {
  categoryId: string | null;
  channel: WorkspaceChannel;
  onDelete: (channel: WorkspaceChannel) => void;
  onEdit: (channel: WorkspaceChannel) => void;
  preset: WorkspaceChannelPermissionPreset | undefined;
};

function ChannelRow({ categoryId, channel, onDelete, onEdit, preset }: ChannelRowProps) {
  const { t } = useI18n();
  const { settingsSections } = SERVER_METRICS;
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    data: { categoryId, itemType: "channel" },
    id: channel.id,
  });
  const Icon = channel.type === "VOICE" ? Volume2 : Hash;

  return (
    <div
      className="flex items-center transition-colors hover:bg-[hsl(var(--surface-soft)/0.8)]"
      data-testid={`settings-channel-${channel.id}`}
      ref={setNodeRef}
      style={{
        borderRadius: pxToRem(settingsSections.channelsRowRadius),
        gap: pxToRem(settingsSections.channelsRowGap),
        opacity: isDragging ? 0.6 : 1,
        padding: pxToRem(settingsSections.channelsRowPadding),
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <DragHandle
        attributes={attributes}
        label={t("server.settings.channels.channelHandle", { name: channel.name })}
        listeners={listeners}
      />
      <span
        aria-hidden="true"
        className={cn(
          "grid shrink-0 place-items-center",
          channel.type === "VOICE" ? "text-[hsl(var(--success))]" : "text-[hsl(var(--text-muted))]",
        )}
        style={{
          height: pxToRem(settingsSections.channelsRowIconSize),
          width: pxToRem(settingsSections.channelsRowIconSize),
        }}
      >
        <Icon
          style={{
            height: pxToRem(settingsSections.channelsRowIconGlyphSize),
            width: pxToRem(settingsSections.channelsRowIconGlyphSize),
          }}
        />
      </span>
      <span
        className="min-w-0 truncate font-medium text-[hsl(var(--foreground))]"
        style={{
          fontSize: pxToRem(settingsSections.channelsRowNameFontSize),
          lineHeight: 1.2,
        }}
      >
        {channel.name}
      </span>

      <AccessChip channelName={channel.name} preset={preset} />

      <div
        className="ml-auto flex shrink-0 items-center"
        style={{ gap: pxToRem(settingsSections.channelsActionGap) }}
      >
        <IconAction
          icon={Pencil}
          label={t("server.settings.channels.editChannel", { name: channel.name })}
          onClick={() => onEdit(channel)}
          testId={`settings-channel-edit-${channel.id}`}
        />
        <IconAction
          danger
          icon={Trash2}
          label={t("server.settings.channels.deleteChannel", { name: channel.name })}
          onClick={() => onDelete(channel)}
          testId={`settings-channel-delete-${channel.id}`}
        />
      </div>
    </div>
  );
}

function AccessChip({
  channelName,
  preset,
}: {
  channelName: string;
  preset: WorkspaceChannelPermissionPreset | undefined;
}) {
  const { t } = useI18n();
  const { settingsSections } = SERVER_METRICS;
  const style: React.CSSProperties = {
    borderRadius: pxToRem(settingsSections.channelsAccessChipRadius),
    fontFamily: DISPLAY_FONT,
    fontSize: pxToRem(settingsSections.channelsAccessChipFontSize),
    lineHeight: 1,
    padding: `${pxToRem(settingsSections.channelsAccessChipPaddingY)} ${pxToRem(settingsSections.channelsAccessChipPaddingX)}`,
  };

  if (!preset) {
    return (
      <span
        aria-label={t("server.settings.channels.accessLoading", { name: channelName })}
        className="shrink-0 animate-pulse bg-[hsl(var(--surface-tertiary))]"
        data-testid="settings-channel-access-pending"
        role="status"
        style={{ ...style, minWidth: pxToRem(64) }}
      >
        &nbsp;
      </span>
    );
  }

  return (
    <span
      className="shrink-0 font-semibold"
      data-testid={`settings-channel-access-${preset}`}
      style={{
        ...style,
        background: getChannelAccessColor(preset, CHANNEL_ACCESS_CHIP_BACKGROUND_ALPHA),
        color: getChannelAccessColor(preset),
      }}
    >
      {t(`server.settings.channels.access.${preset}`)}
    </span>
  );
}

function DragHandle({
  attributes,
  label,
  listeners,
}: {
  attributes: ReturnType<typeof useSortable>["attributes"];
  label: string;
  listeners: ReturnType<typeof useSortable>["listeners"];
}) {
  const { settingsSections } = SERVER_METRICS;

  return (
    <button
      aria-label={label}
      className="grid shrink-0 cursor-grab place-items-center border-0 bg-transparent text-[hsl(var(--text-muted)/0.7)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
      style={{
        height: pxToRem(settingsSections.channelsHandleHeight),
        width: pxToRem(settingsSections.channelsHandleWidth),
      }}
      type="button"
      {...attributes}
      {...listeners}
    >
      <GripVertical
        aria-hidden="true"
        style={{
          height: pxToRem(settingsSections.channelsHandleGlyphSize),
          width: pxToRem(settingsSections.channelsHandleGlyphSize),
        }}
      />
    </button>
  );
}

type IconActionProps = {
  danger?: boolean;
  disabled?: boolean;
  icon: typeof Plus;
  label: string;
  onClick: () => void;
  testId: string;
};

function IconAction({
  danger = false,
  disabled = false,
  icon: Icon,
  label,
  onClick,
  testId,
}: IconActionProps) {
  const { settingsSections } = SERVER_METRICS;

  return (
    <button
      aria-label={label}
      className={cn(
        "grid shrink-0 place-items-center border-0 bg-transparent text-[hsl(var(--text-muted))] transition-colors",
        disabled
          ? "cursor-not-allowed opacity-45"
          : danger
            ? "cursor-pointer hover:bg-[hsl(var(--surface-soft))] hover:text-[hsl(var(--danger))]"
            : "cursor-pointer hover:bg-[hsl(var(--surface-soft))] hover:text-[hsl(var(--foreground))]",
      )}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      style={{
        borderRadius: pxToRem(settingsSections.channelsActionRadius),
        height: pxToRem(settingsSections.channelsActionSize),
        width: pxToRem(settingsSections.channelsActionSize),
      }}
      title={label}
      type="button"
    >
      <Icon
        aria-hidden="true"
        style={{
          height: pxToRem(settingsSections.channelsActionGlyphSize),
          width: pxToRem(settingsSections.channelsActionGlyphSize),
        }}
      />
    </button>
  );
}

/**
 * Bölüm kabuğun **ortak** prop sözleşmesini alır (`section-props.ts`, Ş11): dokuz bölüm aynı
 * çağrıyla `React.lazy` sınırının ardında çiziliyor. Kanallar bölümü taslak alanlarını
 * kullanmaz — sıra ve silme kendi uçlarına yazar, `PATCH /servers/[id]` gövdesine değil.
 */
export function ChannelsSection({ detail, permissions }: ServerSettingsSectionProps) {
  /**
   * `MANAGE_CHANNELS` yoksa bölüm **hiç** çizilmez (00 §5). Küme Ş13'ün
   * `viewer-permissions.ts`'inden geliyor; bölüm kendi "yönetici" tanımını üretmez.
   */
  const canManageChannels = viewerCan(permissions, "MANAGE_CHANNELS");
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const openCategoryModal = useAppStore((state) => state.openCategoryModal);
  const openChannelModal = useAppStore((state) => state.openChannelModal);
  const openDeleteChannelDialog = useAppStore((state) => state.openDeleteChannelDialog);
  const [categoryToDelete, setCategoryToDelete] = useState<{ id: string; name: string } | null>(
    null,
  );
  const serverId = detail.server.id;

  const categories = useMemo<SectionCategory[]>(() => {
    const grouped: SectionCategory[] = [...detail.categories]
      .sort((left, right) => left.position - right.position)
      .map((category) => ({
        channels: [...category.channels].sort((left, right) => left.position - right.position),
        id: category.id,
        name: category.name,
      }));

    if (detail.ungroupedChannels.length > 0) {
      grouped.push({
        channels: [...detail.ungroupedChannels].sort(
          (left, right) => left.position - right.position,
        ),
        id: null,
        name: t("server.modal.channel.noCategory"),
      });
    }

    return grouped;
  }, [detail.categories, detail.ungroupedChannels, t]);

  const allChannels = useMemo(
    () => categories.flatMap((category) => category.channels),
    [categories],
  );

  const accessQueries = useQueries({
    queries: allChannels.map((channel) => ({
      enabled: canManageChannels,
      queryFn: () => fetchChannelPermissionSettings(channel.id),
      queryKey: workspaceQueryKeys.channelPermissions(channel.id),
      staleTime: 60_000,
    })),
  });

  const accessByChannelId = useMemo(() => {
    const map: Record<string, WorkspaceChannelPermissionPreset | undefined> = {};

    allChannels.forEach((channel, index) => {
      map[channel.id] = channel.permissionPreset ?? accessQueries[index]?.data?.preset;
    });

    return map;
  }, [accessQueries, allChannels]);

  const channelReorderMutation = useMutation<
    { success: true },
    Error,
    ChannelOrderItem[],
    { previousDetail: WorkspaceServerDetail | null }
  >({
    mutationFn: (items) => reorderChannelsRequest(serverId, items),
    mutationKey: ["workspace", "settings-reorder-channels", serverId],
    onError: (_error, _items, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(workspaceQueryKeys.server(serverId), context.previousDetail);
      }
    },
    onMutate: async (items) => {
      await queryClient.cancelQueries({ queryKey: workspaceQueryKeys.server(serverId) });
      const previousDetail =
        queryClient.getQueryData<WorkspaceServerDetail>(workspaceQueryKeys.server(serverId)) ??
        null;

      if (previousDetail) {
        queryClient.setQueryData(
          workspaceQueryKeys.server(serverId),
          applyChannelReorder(previousDetail, items),
        );
      }

      return { previousDetail };
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.server(serverId) });
    },
  });

  const categoryReorderMutation = useMutation<
    { success: true },
    Error,
    CategoryOrderItem[],
    { previousDetail: WorkspaceServerDetail | null }
  >({
    mutationFn: (items) => reorderCategoriesRequest(serverId, items),
    mutationKey: ["workspace", "settings-reorder-categories", serverId],
    onError: (_error, _items, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(workspaceQueryKeys.server(serverId), context.previousDetail);
      }
    },
    onMutate: async (items) => {
      await queryClient.cancelQueries({ queryKey: workspaceQueryKeys.server(serverId) });
      const previousDetail =
        queryClient.getQueryData<WorkspaceServerDetail>(workspaceQueryKeys.server(serverId)) ??
        null;

      if (previousDetail) {
        queryClient.setQueryData(
          workspaceQueryKeys.server(serverId),
          applyCategoryReorder(previousDetail, items),
        );
      }

      return { previousDetail };
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.server(serverId) });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: () => {
      if (!categoryToDelete) {
        return Promise.resolve({ success: true as const });
      }

      return deleteCategoryRequest(serverId, categoryToDelete.id);
    },
    onSuccess: () => {
      setCategoryToDelete(null);
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.server(serverId) });
    },
  });

  const handleMoveCategory = useCallback(
    (categoryId: string, direction: OrderDirection) => {
      const ordered = categories.filter((category) => category.id !== null);
      const items = moveCategory(
        ordered.map((category) => ({ id: category.id as string })),
        categoryId,
        direction,
      );

      if (items) {
        categoryReorderMutation.mutate(items);
      }
    },
    [categories, categoryReorderMutation],
  );

  /**
   * Onay penceresi de bir **katmandır** (K11). `ui/modal.tsx` `z-[80]` ile zaten ayarların
   * üstünde çiziliyor ama yığına girmezse tek `Esc` dinleyicisi en üstteki katman diye
   * **ayarları** görür ve iki yüzey birden kapanır.
   */
  useLayerStack({
    id: "server-settings-category-delete",
    kind: "modal",
    onClose: () => setCategoryToDelete(null),
    open: categoryToDelete !== null,
  });

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over || active.id === over.id) {
        return;
      }

      if (active.data.current?.itemType === "category") {
        const sourceId = active.data.current.categoryId as string | undefined;
        const targetId = over.data.current?.categoryId as string | undefined;

        if (!sourceId || !targetId) {
          return;
        }

        const ordered = categories
          .filter((category) => category.id !== null)
          .map((category) => ({ id: category.id as string }));
        const sourceIndex = ordered.findIndex((entry) => entry.id === sourceId);
        const targetIndex = ordered.findIndex((entry) => entry.id === targetId);

        if (sourceIndex < 0 || targetIndex < 0) {
          return;
        }

        const next = [...ordered];
        const [moved] = next.splice(sourceIndex, 1);
        next.splice(targetIndex, 0, moved as { id: string });
        categoryReorderMutation.mutate(
          next.map((entry, index) => ({ id: entry.id, position: index })),
        );
        return;
      }

      const sourceCategoryId = (active.data.current?.categoryId ?? null) as string | null;
      const droppedOnCategory =
        typeof over.id === "string" && over.id.startsWith(CATEGORY_DRAG_PREFIX);
      const targetCategoryId = (over.data.current?.categoryId ?? null) as string | null;
      const sourceChannels =
        categories.find((category) => category.id === sourceCategoryId)?.channels ?? [];
      const targetChannels =
        categories.find((category) => category.id === targetCategoryId)?.channels ?? [];
      const targetIndex = droppedOnCategory
        ? null
        : targetChannels.findIndex((channel) => channel.id === over.id);

      const items = moveChannelBetweenCategories({
        channelId: String(active.id),
        sourceCategoryId,
        sourceChannels,
        targetCategoryId,
        targetChannels,
        targetIndex: targetIndex === null || targetIndex < 0 ? null : targetIndex,
      });

      if (items) {
        channelReorderMutation.mutate(items);
      }
    },
    [categories, categoryReorderMutation, channelReorderMutation],
  );

  if (!canManageChannels) {
    return null;
  }

  return (
    <>
      <ChannelsSectionView
        accessByChannelId={accessByChannelId}
        categories={categories}
        onAddCategory={() => openCategoryModal(serverId, { mode: "create" })}
        onAddChannel={(categoryId) => openChannelModal({ categoryId, mode: "create", serverId })}
        onDeleteCategory={setCategoryToDelete}
        onDeleteChannel={(channel) => openDeleteChannelDialog(channel.id, channel.name)}
        onDragEnd={handleDragEnd}
        onEditCategory={(categoryId) => openCategoryModal(serverId, { categoryId, mode: "edit" })}
        onEditChannel={(channel) =>
          openChannelModal({
            categoryId: channel.categoryId,
            channelId: channel.id,
            mode: "edit",
            serverId,
            type: channel.type,
          })
        }
        onMoveCategory={handleMoveCategory}
      />

      <Modal
        onClose={() => setCategoryToDelete(null)}
        open={Boolean(categoryToDelete)}
        title={
          categoryToDelete
            ? t("workspace.modal.categoryDeleteTitle", { name: categoryToDelete.name })
            : t("server.settings.channels.deleteCategoryFallback")
        }
        {...(categoryToDelete
          ? { description: t("shell.channelSidebar.deleteCategoryDescription") }
          : {})}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button
            className="h-11 rounded-2xl"
            disabled={deleteCategoryMutation.isPending}
            onClick={() => setCategoryToDelete(null)}
            type="button"
            variant="outline"
          >
            {t("common.cancel")}
          </Button>
          <Button
            className="h-11 rounded-2xl border border-[hsl(var(--danger)/0.32)] bg-[hsl(var(--danger)/0.12)] text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger)/0.18)]"
            disabled={deleteCategoryMutation.isPending}
            onClick={() => deleteCategoryMutation.mutate()}
            type="button"
            variant="outline"
          >
            {deleteCategoryMutation.isPending
              ? t("workspace.modal.categoryDeleting")
              : t("workspace.modal.categoryDeleteAction")}
          </Button>
        </div>
      </Modal>
    </>
  );
}

export default ChannelsSection;
