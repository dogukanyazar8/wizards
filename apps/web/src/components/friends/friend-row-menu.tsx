"use client";

import React, { useState } from "react";
import { Ban, BellOff, ChevronRight, Server, UserPlus, UserRound, UserRoundX } from "lucide-react";

import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { useI18n } from "@/components/providers/locale-provider";

/**
 * Arkadaş satırının `...` menüsü — SPEC §4.
 *
 * Altı satır: `Profili gör` · `Sunucuya davet et` · `Sessize al` · ayırıcı ·
 * `Engelle` · `Arkadaşlıktan kaldır`.
 *
 * **`Sunucuya davet et` yetkisi olmayanda hiç çizilmez.** Pasif bir satır
 * bırakmak, kullanıcıya yapamayacağı bir şeyi gösterip nedenini söylememek
 * olurdu; davet üretebildiği sunucu yoksa seçenek de yoktur.
 */

export type InvitableServer = {
  readonly id: string;
  readonly name: string;
};

export type FriendRowMenuProps = {
  friendId: string;
  friendName: string;
  onBlock: (friendId: string) => void;
  onClose: () => void;
  onInviteToServer: (friendId: string, serverId: string) => void;
  onMute: (friendId: string) => void;
  onRemove: (friendId: string) => void;
  onViewProfile: (friendId: string) => void;
  open: boolean;
  position: { x: number; y: number };
  /** Görüntüleyenin davet üretebildiği sunucular; boşsa satır çizilmez. */
  invitableServers: readonly InvitableServer[];
};

export function FriendRowMenu({
  friendId,
  friendName,
  invitableServers,
  onBlock,
  onClose,
  onInviteToServer,
  onMute,
  onRemove,
  onViewProfile,
  open,
  position,
}: FriendRowMenuProps) {
  const { t } = useI18n();
  const [serverPickerOpen, setServerPickerOpen] = useState(false);

  const close = () => {
    setServerPickerOpen(false);
    onClose();
  };

  return (
    <ContextMenu onClose={close} open={open} position={position}>
      {serverPickerOpen ? (
        <div data-testid="friend-row-menu-servers">
          {invitableServers.map((server) => (
            <ContextMenuItem
              key={server.id}
              onClick={() => {
                onInviteToServer(friendId, server.id);
                close();
              }}
            >
              <span className="flex items-center gap-2.5">
                <Server aria-hidden="true" className="h-[0.9375rem] w-[0.9375rem] shrink-0" />
                {server.name}
              </span>
            </ContextMenuItem>
          ))}
        </div>
      ) : (
        <div data-testid="friend-row-menu">
          <ContextMenuItem
            data-testid="friend-menu-profile"
            onClick={() => {
              onViewProfile(friendId);
              close();
            }}
          >
            <span className="flex items-center gap-2.5">
              <UserRound
                aria-hidden="true"
                className="h-[0.9375rem] w-[0.9375rem] shrink-0"
                data-testid="friend-menu-profile-icon"
              />
              {t("messages.friends.menu.profile")}
            </span>
          </ContextMenuItem>

          {invitableServers.length > 0 ? (
            <ContextMenuItem
              data-testid="friend-menu-invite"
              onClick={() => setServerPickerOpen(true)}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="flex items-center gap-2.5">
                  <UserPlus
                    aria-hidden="true"
                    className="h-[0.9375rem] w-[0.9375rem] shrink-0"
                    data-testid="friend-menu-invite-icon"
                  />
                  {t("messages.friends.menu.inviteToServer")}
                </span>
                <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              </span>
            </ContextMenuItem>
          ) : null}

          <ContextMenuItem
            data-testid="friend-menu-mute"
            onClick={() => {
              onMute(friendId);
              close();
            }}
          >
            <span className="flex items-center gap-2.5">
              <BellOff
                aria-hidden="true"
                className="h-[0.9375rem] w-[0.9375rem] shrink-0"
                data-testid="friend-menu-mute-icon"
              />
              {t("messages.friends.menu.mute")}
            </span>
          </ContextMenuItem>

          <ContextMenuSeparator />

          {/*
            İki yıkıcı satır da onay ister; onayı **çağıran** açar, menü kendi
            diyaloğunu taşımaz. Menünün içinde açılan bir onay, menü kapanınca
            onayı da götürürdü.
          */}
          <ContextMenuItem
            data-testid="friend-menu-block"
            destructive
            onClick={() => {
              onBlock(friendId);
              close();
            }}
          >
            <span className="flex items-center gap-2.5">
              <Ban
                aria-hidden="true"
                className="h-[0.9375rem] w-[0.9375rem] shrink-0"
                data-testid="friend-menu-block-icon"
              />
              {t("messages.friends.menu.block")}
            </span>
          </ContextMenuItem>
          <ContextMenuItem
            aria-label={`${t("messages.friends.menu.remove")} — ${friendName}`}
            data-testid="friend-menu-remove"
            destructive
            onClick={() => {
              onRemove(friendId);
              close();
            }}
          >
            <span className="flex items-center gap-2.5">
              <UserRoundX
                aria-hidden="true"
                className="h-[0.9375rem] w-[0.9375rem] shrink-0"
                data-testid="friend-menu-remove-icon"
              />
              {t("messages.friends.menu.remove")}
            </span>
          </ContextMenuItem>
        </div>
      )}
    </ContextMenu>
  );
}
