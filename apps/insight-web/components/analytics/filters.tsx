"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ENTITY_TYPE_OPTIONS, EntityTypeFilter } from "@/lib/analytics-params";

interface AnalyticsFiltersProps {
  windowDays: number;
  entityType: EntityTypeFilter;
}

export function AnalyticsFilters({ windowDays, entityType }: AnalyticsFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams?.toString());
      params.set(key, value);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-800 bg-gray-900/40 p-4 text-sm">
      <label className="flex flex-col gap-1 text-gray-300">
        Window (days)
        <select
          className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100"
          value={windowDays}
          onChange={(event) => updateParam("windowDays", event.target.value)}
        >
          {[7, 14, 21, 30, 45, 60].map((option) => (
            <option key={option} value={option}>
              Last {option} days
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-gray-300">
        Entity Type
        <select
          className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100"
          value={entityType}
          onChange={(event) => updateParam("entityType", event.target.value)}
        >
          {ENTITY_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
