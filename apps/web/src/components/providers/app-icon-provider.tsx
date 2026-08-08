"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { DEFAULT_APP_ICON_ID, getAppIconById } from "@/lib/app-icons";
import { useAppStore } from "@/lib/store";

const APP_ICON_LINK_SELECTOR =
  'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"], link[data-wizards-app-icon="true"]';

function applyAttributes(link: HTMLLinkElement, attributes: Record<string, string>) {
  Object.entries(attributes).forEach(([key, value]) => {
    link.setAttribute(key, value);
  });
}

function updateIconLink(link: HTMLLinkElement, href: string) {
  const rel = link.getAttribute("rel")?.toLowerCase() ?? "";

  link.setAttribute("href", href);

  if (rel.includes("apple-touch-icon")) {
    applyAttributes(link, {
      sizes: "512x512",
    });
    return;
  }

  applyAttributes(link, {
    type: "image/png",
  });
}

function ensureOwnedIconLink(rel: string, href: string, attributes: Record<string, string> = {}) {
  const selector = `link[rel="${rel}"][data-wizards-app-icon="true"]`;
  let link = document.head.querySelector<HTMLLinkElement>(selector);

  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    link.dataset.wizardsAppIcon = "true";
    document.head.appendChild(link);
  }

  link.setAttribute("href", href);
  applyAttributes(link, attributes);
}

function applyAppIcon(href: string) {
  document
    .querySelectorAll<HTMLLinkElement>(APP_ICON_LINK_SELECTOR)
    .forEach((link) => updateIconLink(link, href));

  ensureOwnedIconLink("icon", href, {
    sizes: "any",
    type: "image/png",
  });
  ensureOwnedIconLink("shortcut icon", href, {
    type: "image/png",
  });
  ensureOwnedIconLink("apple-touch-icon", href, {
    sizes: "512x512",
  });

  document.querySelector('meta[name="msapplication-TileImage"]')?.setAttribute("content", href);
}

export function AppIconProvider({ children }: { children: ReactNode }) {
  const appIconId = useAppStore((state) => state.appIconId);

  useEffect(() => {
    const icon = getAppIconById(appIconId ?? DEFAULT_APP_ICON_ID);
    const iconHref = `${icon.src}?wizardsIcon=${encodeURIComponent(icon.id)}&updated=${Date.now()}`;

    applyAppIcon(iconHref);

    const observer = new MutationObserver(() => {
      applyAppIcon(iconHref);
    });

    observer.observe(document.head, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [appIconId]);

  return children;
}
