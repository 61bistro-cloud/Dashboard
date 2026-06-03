import { Construction } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "./page-header";

export function PagePlaceholder({
  icon,
  title,
  description,
  phase,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <div className="p-8 space-y-6">
      <PageHeader icon={icon} title={title} description={description} />
      <div className="rounded-card border border-dashed border-hairline bg-surface p-12 text-center">
        <Construction
          className="mx-auto h-10 w-10 text-muted-soft"
          strokeWidth={1.5}
        />
        <div className="mt-3 text-lg font-medium">กำลังพัฒนา</div>
        <div className="mt-1 text-sm text-muted">{phase}</div>
      </div>
    </div>
  );
}
