import type { ReactNode } from "react";

interface ChartCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
}

export function ChartCard({ title, description, children, actions }: ChartCardProps) {
  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 shadow-inner shadow-black/30">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {description ? <p className="text-sm text-gray-400">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2 text-sm text-gray-300">{actions}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
