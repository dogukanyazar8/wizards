"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AtSign,
  Bell,
  Bookmark,
  ChartNoAxesCombined,
  ChevronDown,
  Code2,
  Slash,
  Crown,
  Ellipsis,
  FileImage,
  Gift,
  Hash,
  Headphones,
  Lock,
  Menu,
  Mic,
  MoreHorizontal,
  PenLine,
  Pin,
  Plus,
  Reply,
  Search,
  SendHorizontal,
  Settings,
  Shield,
  SlidersHorizontal,
  Smile,
  Speaker,
  Sparkles,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ServerItem = {
  active?: boolean;
  accent?: string;
  label: string;
};

type TextChannel = {
  active?: boolean;
  name: string;
  unread?: number;
};

type VoiceChannel = {
  locked?: boolean;
  name: string;
};

type ChatMessage = {
  author: string;
  avatar: string;
  avatarClassName: string;
  content: Array<{ kind?: "mention" | "link" | "text"; value: string }>;
  id: string;
  reaction?: string;
  time: string;
};

type Member = {
  avatar: string;
  avatarClassName: string;
  handle: string;
  name: string;
  offline?: boolean;
  owner?: boolean;
};

const serverItems: ServerItem[] = [
  { label: "DM" },
  { label: "PR" },
  { active: true, accent: "bg-[linear-gradient(135deg,#f8a400,#6c5ce7)]", label: "WH" },
  { label: "YE" },
  { label: "SU" },
];

const textChannels: TextChannel[] = [
  { active: true, name: "genel" },
  { name: "duyurular", unread: 2 },
  { name: "tasarım" },
  { name: "geliştirme" },
  { name: "ürün" },
];

const voiceChannels: VoiceChannel[] = [
  { name: "Lobby" },
  { locked: true, name: "VIP" },
  { name: "Çalışma Odası" },
  { name: "Lounge" },
  { name: "LOL" },
];

const messages: Array<{ date?: string; message?: ChatMessage }> = [
  { date: "15 MAYIS" },
  {
    message: {
      author: "Oğuz Güğümcüoğlu",
      avatar: "OĞ",
      avatarClassName: "bg-zinc-200 text-zinc-700",
      content: [{ value: "Merhaba ekip! 👋\n" }, { value: "Test\n" }, { value: "Test" }],
      id: "m1",
      time: "21:59",
    },
  },
  {
    message: {
      author: "CodeX",
      avatar: "CX",
      avatarClassName: "bg-[linear-gradient(135deg,#ffb000,#ff7a1a)] text-white",
      content: [
        { kind: "mention", value: "@shotlectly" },
        { value: " Projenin temel tasarım kararlarını konuştum derim." },
      ],
      id: "m2",
      time: "10:51",
    },
  },
  {
    message: {
      author: "Oğuz Güğümcüoğlu",
      avatar: "OĞ",
      avatarClassName: "bg-zinc-200 text-zinc-700",
      content: [{ value: "Admin bey" }],
      id: "m3",
      time: "10:51",
    },
  },
  {
    message: {
      author: "CodeX",
      avatar: "CX",
      avatarClassName: "bg-[linear-gradient(135deg,#ffb000,#ff7a1a)] text-white",
      content: [{ value: "buyrun" }],
      id: "m4",
      time: "10:54",
    },
  },
  {
    message: {
      author: "Oğuz Güğümcüoğlu",
      avatar: "OĞ",
      avatarClassName: "bg-zinc-200 text-zinc-700",
      content: [{ value: "müşteriden 3 farklı adosma bakıyorum" }],
      id: "m5",
      time: "10:54",
    },
  },
  {
    message: {
      author: "CodeX",
      avatar: "CX",
      avatarClassName: "bg-[linear-gradient(135deg,#ffb000,#ff7a1a)] text-white",
      content: [{ value: "çözüm gelsin mi\nneden bekliyor anlamadım" }],
      id: "m6",
      time: "10:54",
    },
  },
  {
    message: {
      author: "Oğuz Güğümcüoğlu",
      avatar: "OĞ",
      avatarClassName: "bg-zinc-200 text-zinc-700",
      content: [{ value: "biliyoruz gerçekten la değil\nhepimiz yoğun ilerliyoruz v r y" }],
      id: "m7",
      time: "10:55",
    },
  },
  {
    message: {
      author: "CodeX",
      avatar: "CX",
      avatarClassName: "bg-[linear-gradient(135deg,#ffb000,#ff7a1a)] text-white",
      content: [{ value: "gelirim kanka! " }, { kind: "mention", value: "@ogoose" }],
      id: "m8",
      time: "11:13",
    },
  },
  {
    message: {
      author: "CodeX",
      avatar: "CX",
      avatarClassName: "bg-[linear-gradient(135deg,#ffb000,#ff7a1a)] text-white",
      content: [
        {
          kind: "link",
          value: "https://www.corsair.com/us/en/c/memory/find-by-compatibility",
        },
        { value: "\n" },
        {
          kind: "link",
          value: "https://www.corsair.com/us/en/c/memory/find-by-compatibility",
        },
        { value: "\n" },
        {
          kind: "link",
          value: "https://www.corsair.com/us/en/c/memory/find-by-compatibility",
        },
      ],
      id: "m9",
      time: "11:13",
    },
  },
  { date: "16 MAYIS" },
  {
    message: {
      author: "shotlectly",
      avatar: "S",
      avatarClassName: "bg-slate-100 text-slate-700",
      content: [{ value: "test" }],
      id: "m10",
      reaction: "👍 1",
      time: "20:56",
    },
  },
  { date: "BUGÜN" },
  {
    message: {
      author: "Doğukan Yazar",
      avatar: "D",
      avatarClassName: "bg-slate-600 text-white",
      content: [
        {
          kind: "link",
          value: "https://www.corsair.com/us/en/c/memory/find-by-compatibility",
        },
      ],
      id: "m11",
      time: "09:24",
    },
  },
  {
    message: {
      author: "CodeX",
      avatar: "CX",
      avatarClassName: "bg-[linear-gradient(135deg,#ffb000,#ff7a1a)] text-white",
      content: [{ value: "Selamlar!" }],
      id: "m12",
      time: "09:24",
    },
  },
];

const onlineMembers: Member[] = [
  {
    avatar: "AK",
    avatarClassName: "bg-zinc-200 text-zinc-700",
    handle: "@akaminiko",
    name: "akaminiko",
  },
  {
    avatar: "D",
    avatarClassName: "bg-emerald-900 text-white",
    handle: "@dogukan_yazar",
    name: "Doğukan Yazar",
  },
  {
    avatar: "OĞ",
    avatarClassName: "bg-zinc-200 text-zinc-700",
    handle: "@ogoose",
    name: "Oğuz Güğümcüoğlu",
    owner: true,
  },
  {
    avatar: "SH",
    avatarClassName: "bg-slate-100 text-slate-700",
    handle: "@shotlectly",
    name: "shotlectly",
  },
  {
    avatar: "AD",
    avatarClassName: "bg-slate-200 text-slate-700",
    handle: "@admin",
    name: "admin",
  },
];

const offlineMembers: Member[] = [
  {
    avatar: "TU",
    avatarClassName: "bg-slate-200 text-slate-500",
    handle: "@testuser",
    name: "TestUser",
    offline: true,
  },
  {
    avatar: "M",
    avatarClassName: "bg-slate-200 text-slate-500",
    handle: "@misafir",
    name: "Misafir",
    offline: true,
  },
];

function IconButton({
  children,
  className,
  label,
  onClick,
  testId,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
  onClick?: () => void;
  testId?: string;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#E7EAF3] bg-white text-[#697089] shadow-[0_10px_30px_rgba(37,42,70,0.06)] transition hover:-translate-y-0.5 hover:border-[#dcdff0] hover:text-[#151827] focus:outline-hidden focus:ring-2 focus:ring-[#7C6DFF]/30",
        className,
      )}
      data-testid={testId}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function AvatarToken({
  className,
  label,
  online,
  size = "md",
}: {
  className?: string;
  label: string;
  online?: boolean;
  size?: "lg" | "md" | "sm";
}) {
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white font-bold shadow-[0_10px_24px_rgba(43,48,78,0.10)]",
        size === "lg" && "h-12 w-12 text-sm",
        size === "md" && "h-10 w-10 text-xs",
        size === "sm" && "h-8 w-8 text-[11px]",
        className,
      )}
    >
      {label}
      {online ? (
        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-[#22C55E]" />
      ) : null}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="mt-7 flex items-center justify-between px-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#697089]">{title}</p>
      <button
        aria-label={`${title} ekle`}
        className="flex h-7 w-7 items-center justify-center rounded-xl text-[#697089] transition hover:bg-[#F0EDFF] hover:text-[#6C5CE7]"
        type="button"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

function ServerRail() {
  return (
    <aside
      className="hidden h-full w-[76px] shrink-0 flex-col items-center gap-3 border-r border-[#E7EAF3]/70 bg-[#F7F8FC] px-3 py-4 sm:flex"
      data-testid="whispr-server-rail"
    >
      <button
        aria-label="Whispr"
        className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-xl font-black text-[#6C5CE7] shadow-[0_16px_36px_rgba(75,71,120,0.12)] focus:outline-hidden focus:ring-2 focus:ring-[#7C6DFF]/30"
        type="button"
      >
        W
      </button>

      <div className="flex flex-1 flex-col items-center gap-3">
        {serverItems.map((item) => (
          <button
            aria-label={item.label}
            className={cn(
              "group relative flex h-12 w-12 items-center justify-center rounded-2xl border border-[#E7EAF3] bg-white text-sm font-bold text-[#151827] shadow-[0_12px_28px_rgba(37,42,70,0.07)] transition hover:-translate-y-0.5 hover:border-[#dcdff0] focus:outline-hidden focus:ring-2 focus:ring-[#7C6DFF]/30",
              item.active &&
                "border-[#7C6DFF]/50 shadow-[0_18px_42px_rgba(108,92,231,0.22)] ring-2 ring-[#7C6DFF]/15",
              item.accent,
            )}
            key={item.label}
            type="button"
          >
            {item.active ? (
              <span className="absolute -left-3 h-8 w-1.5 rounded-full bg-[#6C5CE7]" />
            ) : null}
            <span className={cn(item.accent && "text-white")}>{item.label}</span>
          </button>
        ))}
        <button
          aria-label="Sunucu ekle"
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#E7EAF3] bg-white text-[#697089] shadow-[0_12px_28px_rgba(37,42,70,0.07)] transition hover:-translate-y-0.5 hover:text-[#6C5CE7] focus:outline-hidden focus:ring-2 focus:ring-[#7C6DFF]/30"
          type="button"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      <IconButton label="Ayarlar">
        <Settings className="h-5 w-5" />
      </IconButton>
    </aside>
  );
}

function SearchBox({ compact = false }: { compact?: boolean }) {
  return (
    <label
      className={cn(
        "flex h-11 items-center gap-3 rounded-2xl border border-[#E7EAF3] bg-white px-4 text-[#697089] shadow-[0_12px_30px_rgba(37,42,70,0.05)] focus-within:ring-2 focus-within:ring-[#7C6DFF]/20",
        compact && "h-10 rounded-xl px-3",
      )}
    >
      <Search className="h-4 w-4 shrink-0" />
      <input
        className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[#151827] outline-hidden placeholder:text-[#9AA1B5]"
        placeholder="Ara"
      />
    </label>
  );
}

function ChannelSidebar({ className, onClose }: { className?: string; onClose?: () => void }) {
  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[28px] border border-[#E7EAF3] bg-white shadow-[0_24px_70px_rgba(37,42,70,0.08)]",
        className,
      )}
      data-testid="whispr-channel-sidebar"
    >
      <div className="relative overflow-hidden border-b border-[#E7EAF3]/80 px-5 pb-5 pt-5">
        <div className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_75%_12%,rgba(124,109,255,0.24),transparent_30%),linear-gradient(180deg,rgba(240,237,255,0.92),rgba(255,255,255,0))]" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-bold text-[#151827]">Team WHISPR</h1>
              <ChevronDown className="h-4 w-4 text-[#697089]" />
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs font-semibold text-[#697089]">
              <span className="h-2 w-2 rounded-full bg-[#22C55E]" />
              <span>5 Çevrimiçi</span>
            </div>
          </div>
          <div className="flex gap-2">
            <IconButton className="h-10 w-10 rounded-xl" label="Sunucu ayarları">
              <SlidersHorizontal className="h-4 w-4" />
            </IconButton>
            {onClose ? (
              <IconButton
                className="h-10 w-10 rounded-xl lg:hidden"
                label="Menüyü kapat"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </IconButton>
            ) : null}
          </div>
        </div>
        <div className="relative mt-7">
          <SearchBox compact />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-1">
          {[
            { icon: Sparkles, label: "Etkinlikler" },
            { icon: SlidersHorizontal, label: "Kanalları & Gözat" },
            { icon: Users, label: "Üyeler" },
          ].map((item) => (
            <button
              className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[#697089] transition hover:bg-[#F7F8FC] hover:text-[#151827] focus:outline-hidden focus:ring-2 focus:ring-[#7C6DFF]/20"
              key={item.label}
              type="button"
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <SectionHeader title="METİN KANALLARI" />
        <div className="mt-2 space-y-1">
          {textChannels.map((channel) => (
            <button
              className={cn(
                "flex h-11 w-full items-center gap-3 rounded-2xl px-3 text-sm font-semibold text-[#697089] transition hover:bg-[#F7F8FC] hover:text-[#151827] focus:outline-hidden focus:ring-2 focus:ring-[#7C6DFF]/20",
                channel.active &&
                  "bg-[linear-gradient(135deg,#F0EDFF,#F8F6FF)] text-[#6C5CE7] shadow-[0_12px_28px_rgba(108,92,231,0.12)]",
              )}
              key={channel.name}
              type="button"
            >
              <Hash className="h-4 w-4" />
              <span className="min-w-0 flex-1 truncate text-left">{channel.name}</span>
              {channel.unread ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#E6E1FF] px-1.5 text-xs font-bold text-[#6C5CE7]">
                  {channel.unread}
                </span>
              ) : null}
              {channel.active ? <Users className="h-4 w-4" /> : null}
            </button>
          ))}
        </div>

        <SectionHeader title="SES KANALLARI" />
        <div className="mt-2 space-y-1">
          {voiceChannels.map((channel) => (
            <button
              className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[#697089] transition hover:bg-[#F7F8FC] hover:text-[#151827] focus:outline-hidden focus:ring-2 focus:ring-[#7C6DFF]/20"
              key={channel.name}
              type="button"
            >
              <Speaker className="h-4 w-4" />
              <span className="min-w-0 flex-1 truncate text-left">{channel.name}</span>
              {channel.locked ? <Lock className="h-4 w-4" /> : null}
            </button>
          ))}
        </div>
      </div>

      <UserCard />
    </aside>
  );
}

function UserCard() {
  return (
    <div className="border-t border-[#E7EAF3]/80 p-4">
      <div className="flex items-center gap-3 rounded-3xl border border-[#E7EAF3] bg-[#FBFCFF] p-3 shadow-[0_16px_36px_rgba(37,42,70,0.06)]">
        <AvatarToken
          className="bg-[linear-gradient(135deg,#ffb000,#ff7a1a)] text-white"
          label="CX"
          online
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-[#151827]">CodeX</p>
          <p className="truncate text-xs font-medium text-[#697089]">@dogukanyazar</p>
          <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-[#22C55E]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
            Çevrimiçi
          </p>
        </div>
        <div className="flex items-center gap-1 text-[#697089]">
          {[Mic, Headphones, Settings].map((Icon, index) => (
            <button
              aria-label={`Kullanıcı aksiyonu ${index + 1}`}
              className="flex h-8 w-8 items-center justify-center rounded-xl transition hover:bg-[#F0EDFF] hover:text-[#6C5CE7] focus:outline-hidden focus:ring-2 focus:ring-[#7C6DFF]/20"
              key={index}
              type="button"
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatHeader({
  onOpenChannels,
  onOpenMembers,
  onOpenSearch,
}: {
  onOpenChannels: () => void;
  onOpenMembers: () => void;
  onOpenSearch: () => void;
}) {
  return (
    <header className="flex min-h-[72px] shrink-0 items-center gap-3 border-b border-[#E7EAF3] bg-white/90 px-4 backdrop-blur md:min-h-[82px] md:px-5">
      <IconButton
        className="h-11 w-11 lg:hidden"
        label="Kanalları aç"
        onClick={onOpenChannels}
        testId="whispr-channel-menu-button"
      >
        <Menu className="h-5 w-5" />
      </IconButton>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#E7EAF3] bg-[#FBFCFF] text-[#151827] shadow-[0_10px_24px_rgba(37,42,70,0.05)]">
        <Hash className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="shrink-0 text-lg font-bold text-[#151827]">genel</h2>
          <span className="hidden rounded-full bg-[#F0EDFF] px-2 py-0.5 text-[11px] font-bold text-[#6C5CE7] sm:inline-flex">
            aktif
          </span>
        </div>
        <p className="hidden truncate text-xs font-semibold text-[#697089] sm:block">
          Genel sohbet kanalı
        </p>
      </div>
      <div className="hidden items-center gap-2 md:flex">
        <IconButton label="Bildirimler">
          <Bell className="h-4 w-4" />
        </IconButton>
        <IconButton label="Sabitler">
          <Pin className="h-4 w-4" />
        </IconButton>
        <IconButton label="Üyeler" onClick={onOpenMembers} testId="whispr-members-panel-button">
          <Users className="h-4 w-4" />
        </IconButton>
      </div>
      <div className="hidden w-[min(22vw,280px)] xl:block">
        <SearchBox compact />
      </div>
      <IconButton
        className="xl:hidden"
        label="Ara"
        onClick={onOpenSearch}
        testId="whispr-search-button"
      >
        <Search className="h-5 w-5" />
      </IconButton>
      <IconButton
        className="lg:hidden"
        label="Üyeler"
        onClick={onOpenMembers}
        testId="whispr-members-compact-button"
      >
        <Users className="h-5 w-5" />
      </IconButton>
      <button
        aria-label="Yeni mesaj"
        className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#6C5CE7,#8F7DFF)] text-white shadow-[0_16px_36px_rgba(108,92,231,0.28)] transition hover:-translate-y-0.5 focus:outline-hidden focus:ring-2 focus:ring-[#7C6DFF]/30 md:flex"
        type="button"
      >
        <PenLine className="h-5 w-5" />
      </button>
    </header>
  );
}

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="my-5 flex items-center gap-3">
      <div className="h-px flex-1 bg-[#E7EAF3]" />
      <span className="rounded-full border border-[#E7EAF3] bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#697089] shadow-[0_8px_18px_rgba(37,42,70,0.04)]">
        {label}
      </span>
      <div className="h-px flex-1 bg-[#E7EAF3]" />
    </div>
  );
}

function MessageItem({
  message,
  showActions = false,
}: {
  message: ChatMessage;
  showActions?: boolean;
}) {
  return (
    <article className="group relative flex gap-3 rounded-2xl px-2 py-1.5 transition hover:bg-[#F7F8FC]/90 sm:px-3">
      <AvatarToken
        className={message.avatarClassName}
        label={message.avatar}
        online={message.author !== "shotlectly"}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 className="truncate text-sm font-bold text-[#151827]">{message.author}</h3>
          <time className="shrink-0 text-xs font-medium text-[#9AA1B5]">{message.time}</time>
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-[#151827] [overflow-wrap:anywhere]">
          {message.content.map((part, index) => {
            if (part.kind === "mention") {
              return (
                <span
                  className="rounded-full bg-[#EAE6FF] px-2 py-0.5 text-xs font-bold text-[#5B6CFF]"
                  key={index}
                >
                  {part.value}
                </span>
              );
            }
            if (part.kind === "link") {
              return (
                <a className="font-semibold text-[#5B6CFF] hover:underline" href="#" key={index}>
                  {part.value}
                </a>
              );
            }
            return <span key={index}>{part.value}</span>;
          })}
        </p>
        {message.reaction ? (
          <button
            className="mt-2 rounded-full border border-[#D8DFFF] bg-[#F0EDFF] px-3 py-1 text-xs font-bold text-[#5B6CFF]"
            type="button"
          >
            {message.reaction}
          </button>
        ) : null}
      </div>
      <div
        className={cn(
          "absolute right-4 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-2xl border border-[#E7EAF3] bg-white p-1 text-[#697089] shadow-[0_16px_40px_rgba(37,42,70,0.12)] md:group-hover:flex",
          showActions && "md:flex",
        )}
      >
        {[Reply, Smile, Bookmark, MoreHorizontal].map((Icon, index) => (
          <button
            aria-label={`Mesaj aksiyonu ${index + 1}`}
            className="flex h-8 w-8 items-center justify-center rounded-xl transition hover:bg-[#F0EDFF] hover:text-[#6C5CE7] focus:outline-hidden focus:ring-2 focus:ring-[#7C6DFF]/20"
            key={index}
            type="button"
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
      <button
        aria-label="Mesaj seçenekleri"
        className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#697089] md:hidden"
        type="button"
      >
        <Ellipsis className="h-4 w-4" />
      </button>
    </article>
  );
}

function MessageList() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5 md:px-6">
      <div className="mx-auto max-w-[1160px]">
        {messages.map((item, index) =>
          item.date ? (
            <DateSeparator key={`${item.date}-${index}`} label={item.date} />
          ) : item.message ? (
            <MessageItem
              key={item.message.id}
              message={item.message}
              showActions={item.message.id === "m6"}
            />
          ) : null,
        )}
      </div>
    </div>
  );
}

function ChatComposer() {
  const toolbar = [
    { icon: AtSign, label: "Aa" },
    { icon: Smile, label: "Emoji" },
    { icon: Gift, label: "GIF" },
    { icon: FileImage, label: "Görsel" },
    { icon: Shield, label: "Sticker" },
    { icon: Code2, label: "Kod" },
    { icon: Slash, label: "/" },
  ];

  return (
    <div className="shrink-0 border-t border-[#E7EAF3]/70 bg-white/70 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
      <div
        className="mx-auto max-w-[1160px] rounded-[26px] border border-[#E7EAF3] bg-white p-3 shadow-[0_18px_50px_rgba(37,42,70,0.09)]"
        data-testid="whispr-chat-composer"
      >
        <div className="flex items-center gap-3">
          <button
            aria-label="Dosya ekle"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F0EDFF] text-[#6C5CE7] transition hover:bg-[#E7E0FF] focus:outline-hidden focus:ring-2 focus:ring-[#7C6DFF]/30"
            type="button"
          >
            <Plus className="h-5 w-5" />
          </button>
          <textarea
            className="max-h-28 min-h-11 flex-1 resize-none bg-transparent py-3 text-sm font-semibold text-[#151827] outline-hidden placeholder:text-[#9AA1B5]"
            placeholder="# genel kanalına mesaj gönder..."
            rows={1}
          />
          <IconButton className="hidden h-11 w-11 sm:flex" label="Sesli mesaj">
            <Mic className="h-5 w-5" />
          </IconButton>
          <button
            aria-label="Gönder"
            className="flex h-11 w-12 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#6C5CE7,#8F7DFF)] text-white shadow-[0_16px_36px_rgba(108,92,231,0.28)] transition hover:-translate-y-0.5 focus:outline-hidden focus:ring-2 focus:ring-[#7C6DFF]/30"
            type="button"
          >
            <SendHorizontal className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1">
          {toolbar.map((item) => (
            <button
              aria-label={item.label}
              className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-xl border border-[#E7EAF3] bg-[#FBFCFF] px-3 text-xs font-bold text-[#697089] transition hover:bg-[#F0EDFF] hover:text-[#6C5CE7] focus:outline-hidden focus:ring-2 focus:ring-[#7C6DFF]/20"
              key={item.label}
              type="button"
            >
              {item.label.length <= 2 ? item.label : <item.icon className="h-4 w-4" />}
            </button>
          ))}
          <span className="ml-auto hidden shrink-0 text-xs font-semibold text-[#697089] md:inline">
            Enter ile gönder • Shift + Enter ile yeni satır
          </span>
        </div>
      </div>
    </div>
  );
}

function ChatPanel({
  onOpenChannels,
  onOpenMembers,
  onOpenSearch,
}: {
  onOpenChannels: () => void;
  onOpenMembers: () => void;
  onOpenSearch: () => void;
}) {
  return (
    <main
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border-[#E7EAF3] bg-white shadow-none sm:rounded-[30px] sm:border sm:shadow-[0_24px_70px_rgba(37,42,70,0.08)]"
      data-testid="whispr-chat-panel"
    >
      <ChatHeader
        onOpenChannels={onOpenChannels}
        onOpenMembers={onOpenMembers}
        onOpenSearch={onOpenSearch}
      />
      <MessageList />
      <ChatComposer />
    </main>
  );
}

function MemberItem({ member }: { member: Member }) {
  return (
    <button
      className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-[#F7F8FC] focus:outline-hidden focus:ring-2 focus:ring-[#7C6DFF]/20"
      type="button"
    >
      <AvatarToken
        className={cn(member.avatarClassName, member.offline && "opacity-70 grayscale")}
        label={member.avatar}
        online={!member.offline}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1 truncate text-sm font-bold text-[#151827]">
          <span className="truncate">{member.name}</span>
          {member.owner ? (
            <Crown className="h-3.5 w-3.5 shrink-0 fill-[#F59E0B] text-[#F59E0B]" />
          ) : null}
        </p>
        <p className="truncate text-xs font-semibold text-[#697089]">{member.handle}</p>
      </div>
    </button>
  );
}

function MemberGroup({ members, title }: { members: Member[]; title: string }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 flex items-center gap-2 px-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#697089]">
        <Users className="h-3.5 w-3.5" />
        {title} — {members.length}
      </h3>
      <div className="space-y-1">
        {members.map((member) => (
          <MemberItem key={member.handle} member={member} />
        ))}
      </div>
    </section>
  );
}

function MembersSidebar({ className, onClose }: { className?: string; onClose?: () => void }) {
  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[28px] border border-[#E7EAF3] bg-white shadow-[0_24px_70px_rgba(37,42,70,0.08)]",
        className,
      )}
      data-testid="whispr-members-sidebar"
    >
      <div className="flex items-center justify-between border-b border-[#E7EAF3] px-5 py-4">
        <h2 className="text-[12px] font-black uppercase tracking-[0.16em] text-[#697089]">
          ÜYELER — 8
        </h2>
        <div className="flex items-center gap-2">
          <button
            className="flex h-8 items-center gap-1 rounded-full border border-[#E7EAF3] bg-[#FBFCFF] px-3 text-xs font-bold text-[#151827]"
            type="button"
          >
            Online <ChevronDown className="h-3 w-3" />
          </button>
          {onClose ? (
            <button
              aria-label="Üyeleri kapat"
              className="flex h-8 w-8 items-center justify-center rounded-xl text-[#697089]"
              onClick={onClose}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <MemberGroup
          members={[
            {
              avatar: "CX",
              avatarClassName: "bg-[linear-gradient(135deg,#ffb000,#ff7a1a)] text-white",
              handle: "@dogukanyazar",
              name: "CodeX",
              owner: true,
            },
          ]}
          title="YÖNETİCİ"
        />
        <MemberGroup members={onlineMembers} title="ÇEVRİMİÇİ" />
        <MemberGroup members={offlineMembers} title="ÇEVRİMDIŞI" />
      </div>

      <div className="space-y-3 border-t border-[#E7EAF3]/80 p-4">
        <div className="rounded-3xl border border-[#E7EAF3] bg-[#FBFCFF] p-4 shadow-[0_16px_36px_rgba(37,42,70,0.05)]">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-[#697089]">
              SUNUCU ÖZETİ
            </h3>
            <ChartNoAxesCombined className="h-4 w-4 text-[#6C5CE7]" />
          </div>
          <div className="mt-4 grid grid-cols-3 divide-x divide-[#E7EAF3] text-center">
            {[
              ["8", "Üye"],
              ["3", "Çevrimiçi"],
              ["12", "Toplam Kanal"],
            ].map(([value, label]) => (
              <div key={label}>
                <p className="text-lg font-black text-[#151827]">{value}</p>
                <p className="mt-1 text-[11px] font-semibold text-[#697089]">{label}</p>
              </div>
            ))}
          </div>
        </div>
        <button
          className="flex h-14 w-full items-center justify-center gap-3 rounded-3xl border border-[#E7EAF3] bg-white text-sm font-bold text-[#6C5CE7] shadow-[0_16px_36px_rgba(37,42,70,0.05)] transition hover:border-[#CFC8FF] hover:bg-[#F8F6FF] focus:outline-hidden focus:ring-2 focus:ring-[#7C6DFF]/20"
          type="button"
        >
          <UserPlus className="h-5 w-5" />
          İnsanları Davet Et
        </button>
      </div>
    </aside>
  );
}

function Drawer({
  children,
  hiddenAboveClass = "lg:hidden",
  onClose,
  open,
  side,
  testId,
}: {
  children: React.ReactNode;
  hiddenAboveClass?: string;
  onClose: () => void;
  open: boolean;
  side: "left" | "right";
  testId: string;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className={cn("fixed inset-0 z-50", hiddenAboveClass)} data-testid={testId}>
      <button
        aria-label="Paneli kapat"
        className="absolute inset-0 bg-[#151827]/35 backdrop-blur-xs"
        data-testid={`${testId}-overlay`}
        onClick={onClose}
        type="button"
      />
      <div
        className={cn(
          "absolute top-0 h-full w-[min(86vw,360px)] p-3 transition",
          side === "left" ? "left-0" : "right-0",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function SearchOverlay({ onClose, open }: { onClose: () => void; open: boolean }) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-x-3 top-3 z-[60] rounded-3xl border border-[#E7EAF3] bg-white p-3 shadow-[0_24px_70px_rgba(37,42,70,0.18)] xl:hidden"
      data-testid="whispr-search-overlay"
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <SearchBox compact />
        </div>
        <IconButton className="h-10 w-10 rounded-xl" label="Aramayı kapat" onClick={onClose}>
          <X className="h-4 w-4" />
        </IconButton>
      </div>
    </div>
  );
}

export function WhisprChatPreview() {
  const [isChannelSidebarOpen, setIsChannelSidebarOpen] = useState(false);
  const [isMembersSidebarOpen, setIsMembersSidebarOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const closeDrawers = useMemo(
    () => ({
      channels: () => setIsChannelSidebarOpen(false),
      members: () => setIsMembersSidebarOpen(false),
      search: () => setIsSearchOpen(false),
    }),
    [],
  );

  return (
    <div
      className="h-dvh min-h-screen overflow-hidden bg-[#F7F8FC] text-[#151827]"
      data-testid="whispr-chat-preview"
    >
      <div className="flex h-full min-h-0 w-full overflow-hidden">
        <ServerRail />
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 p-0 sm:p-3 lg:grid-cols-[300px_minmax(0,1fr)] min-[1440px]:grid-cols-[320px_minmax(0,1fr)_300px] 2xl:grid-cols-[330px_minmax(0,1fr)_320px]">
          <ChannelSidebar className="hidden lg:flex" />
          <ChatPanel
            onOpenChannels={() => setIsChannelSidebarOpen(true)}
            onOpenMembers={() => setIsMembersSidebarOpen(true)}
            onOpenSearch={() => setIsSearchOpen(true)}
          />
          <MembersSidebar className="hidden min-[1440px]:flex" />
        </div>
      </div>

      <Drawer
        onClose={closeDrawers.channels}
        open={isChannelSidebarOpen}
        side="left"
        testId="whispr-channel-drawer"
      >
        <ChannelSidebar onClose={closeDrawers.channels} />
      </Drawer>
      <Drawer
        hiddenAboveClass="min-[1440px]:hidden"
        onClose={closeDrawers.members}
        open={isMembersSidebarOpen}
        side="right"
        testId="whispr-members-drawer"
      >
        <MembersSidebar onClose={closeDrawers.members} />
      </Drawer>
      <SearchOverlay onClose={closeDrawers.search} open={isSearchOpen} />
    </div>
  );
}
