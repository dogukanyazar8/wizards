"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { DEFAULT_APP_ICON_ID, getAppIconById, getAppFaviconById } from "@/lib/app-icons";

const APP_ICON_LINK_SELECTOR =
  'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"], link[data-wizards-app-icon="true"]';

function applyAttributes(link: HTMLLinkElement, attributes: Record<string, string>) {
  Object.entries(attributes).forEach(([key, value]) => {
    link.setAttribute(key, value);
  });
}

function updateIconLink(
  link: HTMLLinkElement,
  href: string,
  faviconHref: string,
  faviconType: string,
) {
  const rel = link.getAttribute("rel")?.toLowerCase() ?? "";

  link.setAttribute("href", rel.includes("apple-touch-icon") ? href : faviconHref);

  if (rel.includes("apple-touch-icon")) {
    applyAttributes(link, {
      sizes: "512x512",
    });
    return;
  }

  applyAttributes(link, {
    type: faviconType,
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

function applyAppIcon(href: string, faviconHref: string, faviconType: string) {
  document
    .querySelectorAll<HTMLLinkElement>(APP_ICON_LINK_SELECTOR)
    .forEach((link) => updateIconLink(link, href, faviconHref, faviconType));

  ensureOwnedIconLink("icon", faviconHref, {
    sizes: "any",
    type: faviconType,
  });
  ensureOwnedIconLink("shortcut icon", faviconHref, {
    type: faviconType,
  });
  ensureOwnedIconLink("apple-touch-icon", href, {
    sizes: "512x512",
  });

  document.querySelector('meta[name="msapplication-TileImage"]')?.setAttribute("content", href);
}

export function AppIconProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const icon = getAppIconById(DEFAULT_APP_ICON_ID);
    const favicon = getAppFaviconById(icon.id);
    const iconHref = `${icon.src}?wizardsIcon=${encodeURIComponent(icon.id)}&updated=${Date.now()}`;

    applyAppIcon(iconHref, favicon.src, favicon.type);

    const observer = new MutationObserver(() => {
      applyAppIcon(iconHref, favicon.src, favicon.type);
    });

    observer.observe(document.head, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  return children;
}
