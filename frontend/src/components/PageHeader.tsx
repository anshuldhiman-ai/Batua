import React from "react";

/**
 * Uniform page header — every page shares the same title/subtitle rhythm,
 * with an optional right-aligned actions slot (buttons, badges, …).
 */
export default function PageHeader({ title, subtitle, actions }: any) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-xl font-bold tracking-wide uppercase md:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
