import type { Metadata } from "next";
import { TimeseriesChart } from "@/components/analytics/timeseries-chart";
import { GenreTrendsChart } from "@/components/analytics/genre-trends-chart";
import { SourcePerformanceTable } from "@/components/analytics/source-performance-table";
import { NetworkSankey } from "@/components/analytics/network-sankey";
import { ChartCard } from "@/components/analytics/chart-card";
import { AnalyticsFilters } from "@/components/analytics/filters";
import { GenreExportButton, SourceExportButton, TimeseriesExportButtons } from "@/components/analytics/export-buttons";
import {
  fetchEntityNetwork,
  fetchEntityTimeseries,
  fetchGenreTrends,
  fetchSourcePerformance
} from "./data";
import {
  clampWindowDays,
  EntityTypeFilter,
  TimeseriesParams,
  normalizeEntityType
} from "@/lib/analytics-params";

export const metadata: Metadata = {
  title: "Analytics — Omnisonic Insight"
};

interface AnalyticsPageProps {
  searchParams?: Record<string, string | string[] | undefined>;
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const windowDays = clampWindowDays(Number(searchParams?.windowDays) || 14);
  const entityType = normalizeEntityType(
    typeof searchParams?.entityType === "string" ? searchParams?.entityType : undefined
  );

  const timeseriesParams: TimeseriesParams & { entityType: EntityTypeFilter } = { windowDays, entityType };
  const [timeseries, genreTrends, sourcePerformance, network] = await Promise.all([
    fetchEntityTimeseries(timeseriesParams),
    fetchGenreTrends({ windowDays }),
    fetchSourcePerformance({ windowDays }),
    fetchEntityNetwork({ windowDays, entityType })
  ]);

  return (
    <div className="space-y-10">
      <section className="space-y-2">
        <p className="text-sm uppercase tracking-widest text-gray-500">Insight</p>
        <h1 className="text-3xl font-semibold text-white">Analytics Dashboard</h1>
        <p className="text-sm text-gray-400">
          Multi-source monitoring across entity mentions, genres, and co-mentions. Use the filters below to
          adjust the time window or focus by entity type.
        </p>
      </section>

      <AnalyticsFilters windowDays={windowDays} entityType={entityType} />

      <ChartCard
        title="Entity Mentions Over Time"
        description="Top trending entities by daily mention volume."
        actions={<TimeseriesExportButtons params={timeseriesParams} />}
      >
        <TimeseriesChart data={timeseries} />
      </ChartCard>

      <ChartCard
        title="Genre Momentum"
        description="Relative share of coverage by genre across the selected window."
        actions={<GenreExportButton params={{ windowDays }} />}
      >
        <GenreTrendsChart data={genreTrends} />
      </ChartCard>

      <ChartCard
        title="Source Performance"
        description="Top sources ranked by total stories and unique tags."
        actions={<SourceExportButton params={{ windowDays }} />}
      >
        <SourcePerformanceTable data={sourcePerformance} />
      </ChartCard>

      <ChartCard
        title="Entity Co-mention Network"
        description="Shows how entities co-occur within the monitored window."
      >
        <NetworkSankey nodes={network.nodes} links={network.links} />
      </ChartCard>
    </div>
  );
}
