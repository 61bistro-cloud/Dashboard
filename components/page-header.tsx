import type { LucideIcon } from "lucide-react";

export function PageHeader({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap pb-2">
      <div className="flex items-start gap-3.5">
        <div className="flex h-11 w-11 items-center justify-center rounded-card bg-ink text-canvas">
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="text-[28px] lg:text-[32px] font-semibold leading-[1.15] tracking-tight">
            {title}
          </h1>
          {description && (
            <p className="text-[15px] text-muted mt-1.5 max-w-2xl">
              {description}
            </p>
          )}
        </div>
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

export function SectionTitle({
  icon: Icon,
  title,
  description,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className="mt-6">
      <h2 className="flex items-center gap-2 text-[15px] font-medium tracking-tight text-ink uppercase">
        {Icon && <Icon className="h-4 w-4 text-muted" strokeWidth={1.75} />}
        <span className="text-[11px] tracking-[0.08em]">{title}</span>
      </h2>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
    </div>
  );
}
