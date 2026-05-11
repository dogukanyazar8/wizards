"use client";

import { motion } from "framer-motion";
import {
  BellRing,
  BriefcaseBusiness,
  FileArchive,
  FileCheck2,
  Gamepad2,
  Headphones,
  Image as ImageIcon,
  LockKeyhole,
  MessagesSquare,
  MonitorUp,
  Radio,
  ShieldCheck,
  Target,
  Trophy,
  UserRound,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "@/components/providers/locale-provider";
import type { AppLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

type FloatTone = "amber" | "blue" | "cyan" | "green" | "pink" | "red" | "violet";
type TrustCopy = {
  badges: readonly string[];
  description: string;
  title: string;
};
type FloatCopy = {
  aria: string;
  business: {
    label: string;
    progressTitle: string;
    reportDetail: string;
    reportTitle: string;
    screenDetail: string;
    screenTitle: string;
    sprintNames: readonly string[];
    sprintTitle: string;
    steps: readonly string[];
  };
  gamer: {
    csDetail: string;
    csTitle: string;
    label: string;
    lolDetail: string;
    lolTitle: string;
    squadNames: readonly string[];
    squadTitle: string;
    teamDetail: string;
    teamTitle: string;
    valorantDetail: string;
    valorantTitle: string;
  };
  personal: {
    audioDetail: string;
    audioTitle: string;
    fileDetail: string;
    fileTitle: string;
    imageDetail: string;
    imageTitle: string;
    label: string;
    message: string;
    name: string;
    noteDetail: string;
    noteTitle: string;
    time: string;
    videoDetail: string;
    videoTitle: string;
  };
  trust: readonly [TrustCopy, TrustCopy, TrustCopy];
};

const FLOAT_COPY = {
  en: {
    aria: "Whispr usage examples",
    business: {
      label: "Business",
      progressTitle: "Project progress",
      reportDetail: "Emre Y. · Q2 report approved",
      reportTitle: "Approved report",
      screenDetail: "Mehmet Uğur Ç. · #development",
      screenTitle: "Screen sharing",
      sprintNames: ["Doğukan Y.", "Alperen M.", "Muhammet Y."],
      sprintTitle: "Sprint meeting · 15 min",
      steps: ["Design", "Backend", "Frontend"],
    },
    gamer: {
      csDetail: "Atakan T. · Nuke",
      csTitle: "CS2 invite",
      label: "Gamer",
      lolDetail: "KDA 8/1/12 · Gold I ↑",
      lolTitle: "LoL MVP",
      squadNames: ["Atakan T.", "Oğuz G.", "Alperen M."],
      squadTitle: "PUBG squad · lobby ready",
      teamDetail: "Alperen M. · squad slot reserved",
      teamTitle: "Team invite",
      valorantDetail: "Muhammet Y. · Radiant lobby",
      valorantTitle: "Valorant live",
    },
    personal: {
      audioDetail: "Oğuz G. · 02:47 active",
      audioTitle: "Voice call",
      fileDetail: "vacation_photos.zip · 48 MB complete",
      fileTitle: "File shared",
      imageDetail: "Atakan T. · 12 images delivered",
      imageTitle: "Gallery synced",
      label: "Personal",
      message: "Are we meeting tonight?",
      name: "Doğukan Y.",
      noteDetail: "Mehmet Uğur Ç. · encrypted note saved",
      noteTitle: "Secure note",
      time: "1 min",
      videoDetail: "Muhammet Y. is calling · Join now",
      videoTitle: "Video call",
    },
    trust: [
      {
        badges: ["AES-256", "TLS 1.3", "E2E"],
        description: "Only you can read your messages.",
        title: "End-to-End Encrypted",
      },
      {
        badges: ["HD Voice", "Video", "Screen"],
        description: "Ready for meetings, streams, and fast support.",
        title: "Live Communication",
      },
      {
        badges: ["Channels", "Threads", "Files"],
        description: "Team and community workflows stay organized.",
        title: "Smart Workspace",
      },
    ],
  },
  tr: {
    aria: "Whispr kullanım örnekleri",
    business: {
      label: "Kurumsal",
      progressTitle: "Proje ilerlemesi",
      reportDetail: "Emre Y. · Q2 raporu onaylandı",
      reportTitle: "Onaylı rapor",
      screenDetail: "Mehmet Uğur Ç. · #geliştirme",
      screenTitle: "Ekran paylaşımı",
      sprintNames: ["Doğukan Y.", "Alperen M.", "Muhammet Y."],
      sprintTitle: "Sprint toplantısı · 15 dk",
      steps: ["Tasarım", "Backend", "Frontend"],
    },
    gamer: {
      csDetail: "Atakan T. · Nuke",
      csTitle: "CS2 daveti",
      label: "Oyuncu",
      lolDetail: "KDA 8/1/12 · Gold I ↑",
      lolTitle: "LoL MVP",
      squadNames: ["Atakan T.", "Oğuz G.", "Alperen M."],
      squadTitle: "PUBG squad · lobby hazır",
      teamDetail: "Alperen M. · takım slotu ayrıldı",
      teamTitle: "Takım daveti",
      valorantDetail: "Muhammet Y. · Radiant lobide",
      valorantTitle: "Valorant canlı",
    },
    personal: {
      audioDetail: "Oğuz G. · 02:47 aktif",
      audioTitle: "Sesli arama",
      fileDetail: "tatil_dosyalari.zip · 48 MB tamamlandı",
      fileTitle: "Dosya paylaşıldı",
      imageDetail: "Atakan T. · 12 görsel teslim edildi",
      imageTitle: "Galeri eşitlendi",
      label: "Bireysel",
      message: "Bu akşam buluşuyor muyuz?",
      name: "Doğukan Y.",
      noteDetail: "Mehmet Uğur Ç. · şifreli not kaydedildi",
      noteTitle: "Güvenli not",
      time: "1 dk",
      videoDetail: "Muhammet Y. arıyor · Şimdi katıl",
      videoTitle: "Görüntülü arama",
    },
    trust: [
      {
        badges: ["AES-256", "TLS 1.3", "E2E"],
        description: "Mesajlarınızı yalnızca siz okuyabilirsiniz.",
        title: "Uçtan Uca Şifreli",
      },
      {
        badges: ["HD Ses", "Video", "Ekran"],
        description: "Toplantı, yayın ve hızlı destek için hazır.",
        title: "Canlı İletişim",
      },
      {
        badges: ["Kanallar", "Thread", "Dosya"],
        description: "Ekip ve topluluk akışları düzenli kalır.",
        title: "Akıllı Çalışma Alanı",
      },
    ],
  },
} satisfies Record<AppLocale, FloatCopy>;

interface FloatCardProps {
  children: ReactNode;
  className?: string;
  delay: string;
  duration: string;
  tone?: FloatTone;
}

function FloatCard({ children, className, delay, duration, tone = "blue" }: FloatCardProps) {
  return (
    <motion.article
      className={cn("modern-float-card", `is-${tone}`, className)}
      initial={{ opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
      style={{ animationDelay: delay, animationDuration: duration }}
    >
      {children}
    </motion.article>
  );
}

function Avatar({ label, tone = "blue" }: { label: string; tone?: FloatTone }) {
  return <span className={cn("modern-float-avatar", `is-${tone}`)}>{label}</span>;
}

function CardIcon({ Icon, tone = "blue" }: { Icon: LucideIcon; tone?: FloatTone }) {
  return (
    <span className={cn("modern-card-icon", `is-${tone}`)} aria-hidden="true">
      <Icon className="h-4 w-4" />
    </span>
  );
}

function ColumnLabel({ color, Icon, label }: { color: string; Icon: LucideIcon; label: string }) {
  return (
    <div className="modern-column-label">
      <span className="modern-column-dot" style={{ backgroundColor: color }} />
      <Icon className="h-4 w-4" aria-hidden="true" />
      <strong>{label}</strong>
    </div>
  );
}

function MessageCard({
  avatar,
  message,
  name,
  time,
  tone,
}: {
  avatar: string;
  message: string;
  name: string;
  time: string;
  tone: FloatTone;
}) {
  return (
    <div className="modern-message-card">
      <div className="modern-card-row">
        <Avatar label={avatar} tone={tone} />
        <div>
          <strong>{name}</strong>
          <span>{time}</span>
        </div>
      </div>
      <p>{message}</p>
    </div>
  );
}

function StatusListCard({
  names,
  title,
  tone,
}: {
  names: readonly string[];
  title: string;
  tone: FloatTone;
}) {
  return (
    <div className="modern-status-card">
      <h3>{title}</h3>
      <div className="modern-status-list">
        {names.map((name, index) => (
          <div className="modern-status-row" key={name}>
            <Avatar label={name.slice(0, 2).toUpperCase()} tone={index === 0 ? tone : "violet"} />
            <span>{name}</span>
            <i />
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressCard({ labels, title }: { labels: readonly string[]; title: string }) {
  const values = [92, 78, 61] as const;

  return (
    <div className="modern-progress-card">
      <h3>{title}</h3>
      {labels.map((label, index) => {
        const value = values[index] ?? 61;

        return (
          <div className="modern-progress-row" key={label}>
            <div>
              <span>{label}</span>
              <strong>{value}%</strong>
            </div>
            <i>
              <b style={{ width: `${value}%` }} />
            </i>
          </div>
        );
      })}
    </div>
  );
}

function NotificationCard({
  detail,
  Icon,
  title,
  tone,
}: {
  detail: string;
  Icon: LucideIcon;
  title: string;
  tone: FloatTone;
}) {
  return (
    <div className="modern-notification-card">
      <CardIcon Icon={Icon} tone={tone} />
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}

function AchievementCard({ detail, title }: { detail: string; title: string }) {
  return (
    <div className="modern-achievement-card">
      <CardIcon Icon={Trophy} tone="amber" />
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}

function TrustCard({
  badges,
  description,
  Icon,
  title,
  tone,
}: TrustCopy & {
  Icon: LucideIcon;
  tone: FloatTone;
}) {
  return (
    <article className="modern-trust-card">
      <CardIcon Icon={Icon} tone={tone} />
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
        <div>
          {badges.map((badge) => (
            <b key={badge}>{badge}</b>
          ))}
        </div>
      </div>
    </article>
  );
}

export function FloatZone() {
  const { locale } = useI18n();
  const copy = FLOAT_COPY[locale];

  return (
    <section className="modern-float-zone" aria-label={copy.aria}>
      <div className="modern-float-columns">
        <div className="modern-float-column">
          <ColumnLabel color="#34D399" Icon={UserRound} label={copy.personal.label} />
          <FloatCard delay="-1.2s" duration="8.2s" tone="green">
            <MessageCard
              avatar="DY"
              message={copy.personal.message}
              name={copy.personal.name}
              time={copy.personal.time}
              tone="green"
            />
          </FloatCard>
          <FloatCard delay="-3.4s" duration="7.6s" tone="cyan">
            <NotificationCard
              detail={copy.personal.videoDetail}
              Icon={Video}
              title={copy.personal.videoTitle}
              tone="cyan"
            />
          </FloatCard>
          <FloatCard delay="-6.8s" duration="9.4s" tone="green">
            <NotificationCard
              detail={copy.personal.audioDetail}
              Icon={Headphones}
              title={copy.personal.audioTitle}
              tone="green"
            />
          </FloatCard>
          <FloatCard className="is-roomy" delay="-9.3s" duration="10.5s" tone="green">
            <NotificationCard
              detail={copy.personal.fileDetail}
              Icon={FileArchive}
              title={copy.personal.fileTitle}
              tone="green"
            />
          </FloatCard>
          <FloatCard className="is-roomy" delay="-4.8s" duration="8.7s" tone="blue">
            <NotificationCard
              detail={copy.personal.imageDetail}
              Icon={ImageIcon}
              title={copy.personal.imageTitle}
              tone="blue"
            />
          </FloatCard>
          <FloatCard className="is-roomy" delay="-7.4s" duration="11.1s" tone="green">
            <NotificationCard
              detail={copy.personal.noteDetail}
              Icon={ShieldCheck}
              title={copy.personal.noteTitle}
              tone="green"
            />
          </FloatCard>
        </div>

        <div className="modern-float-column">
          <ColumnLabel color="#F472B6" Icon={Gamepad2} label={copy.gamer.label} />
          <FloatCard delay="-4.6s" duration="9.8s" tone="pink">
            <StatusListCard
              names={copy.gamer.squadNames}
              title={copy.gamer.squadTitle}
              tone="pink"
            />
          </FloatCard>
          <FloatCard delay="-8.1s" duration="11.2s" tone="amber">
            <AchievementCard detail={copy.gamer.lolDetail} title={copy.gamer.lolTitle} />
          </FloatCard>
          <FloatCard delay="-2.9s" duration="6.9s" tone="pink">
            <NotificationCard
              detail={copy.gamer.csDetail}
              Icon={Target}
              title={copy.gamer.csTitle}
              tone="pink"
            />
          </FloatCard>
          <FloatCard className="is-roomy" delay="-9.9s" duration="10.9s" tone="red">
            <NotificationCard
              detail={copy.gamer.valorantDetail}
              Icon={Radio}
              title={copy.gamer.valorantTitle}
              tone="red"
            />
          </FloatCard>
          <FloatCard className="is-roomy" delay="-6.1s" duration="9.2s" tone="violet">
            <NotificationCard
              detail={copy.gamer.teamDetail}
              Icon={BellRing}
              title={copy.gamer.teamTitle}
              tone="violet"
            />
          </FloatCard>
        </div>

        <div className="modern-float-column">
          <ColumnLabel color="#60A5FA" Icon={BriefcaseBusiness} label={copy.business.label} />
          <FloatCard delay="-7.2s" duration="10.6s" tone="blue">
            <ProgressCard labels={copy.business.steps} title={copy.business.progressTitle} />
          </FloatCard>
          <FloatCard delay="-5.5s" duration="8.8s" tone="cyan">
            <NotificationCard
              detail={copy.business.screenDetail}
              Icon={MonitorUp}
              title={copy.business.screenTitle}
              tone="cyan"
            />
          </FloatCard>
          <FloatCard delay="-10.4s" duration="12s" tone="blue">
            <StatusListCard
              names={copy.business.sprintNames}
              title={copy.business.sprintTitle}
              tone="blue"
            />
          </FloatCard>
          <FloatCard className="is-roomy" delay="-1.8s" duration="9.6s" tone="green">
            <NotificationCard
              detail={copy.business.reportDetail}
              Icon={FileCheck2}
              title={copy.business.reportTitle}
              tone="green"
            />
          </FloatCard>
        </div>
      </div>

      <div className="modern-trust-row">
        <TrustCard {...copy.trust[0]} Icon={LockKeyhole} tone="green" />
        <TrustCard {...copy.trust[1]} Icon={Radio} tone="cyan" />
        <TrustCard {...copy.trust[2]} Icon={MessagesSquare} tone="blue" />
      </div>
    </section>
  );
}
