import React from "react";
import Link from "next/link";

type AdminManagementPaginationProps = {
  page: number;
  pathname: "/admin/moderation" | "/admin/servers" | "/admin/users";
  search: Record<string, string | undefined>;
  total: number;
  totalPages: number;
};

function pageHref(
  pathname: AdminManagementPaginationProps["pathname"],
  search: AdminManagementPaginationProps["search"],
  page: number,
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(search)) {
    if (value) {
      params.set(key, value);
    }
  }

  params.set("page", String(page));
  return `${pathname}?${params.toString()}`;
}

export function AdminManagementPagination({
  page,
  pathname,
  search,
  total,
  totalPages,
}: AdminManagementPaginationProps) {
  if (totalPages <= 1) {
    return <p className="text-app-muted text-[12.5px]">{total} kayıt</p>;
  }

  return (
    <nav aria-label="Sayfalama" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-app-muted text-[12.5px]">{total} kayıt</p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link
            className="rounded-[10px] border border-[hsl(var(--border)/0.7)] px-3 py-2 text-[12px] font-semibold text-app-muted hover:bg-[hsl(var(--surface-soft))]"
            href={pageHref(pathname, search, page - 1)}
          >
            Önceki
          </Link>
        ) : (
          <span className="rounded-[10px] border border-[hsl(var(--border)/0.45)] px-3 py-2 text-[12px] font-semibold text-app-soft">
            Önceki
          </span>
        )}
        <span className="text-app-muted px-1 text-[12px] font-semibold">
          {page} / {totalPages}
        </span>
        {page < totalPages ? (
          <Link
            className="rounded-[10px] border border-[hsl(var(--border)/0.7)] px-3 py-2 text-[12px] font-semibold text-app-muted hover:bg-[hsl(var(--surface-soft))]"
            href={pageHref(pathname, search, page + 1)}
          >
            Sonraki
          </Link>
        ) : (
          <span className="rounded-[10px] border border-[hsl(var(--border)/0.45)] px-3 py-2 text-[12px] font-semibold text-app-soft">
            Sonraki
          </span>
        )}
      </div>
    </nav>
  );
}
