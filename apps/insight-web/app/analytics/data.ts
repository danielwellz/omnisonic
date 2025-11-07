"use server";

import { clickhouseClient } from "@/lib/clickhouse";
import {
  clampLimitEntities,
  clampLimitGenres,
  clampLimitLinks,
  clampLimitSources,
  clampWindowDays,
  EntityTypeFilter,
  GenreParams,
  NetworkParams,
  SourceParams,
  TimeseriesParams,
  normalizeEntityType
} from "@/lib/analytics-params";
import {
  GenreTrendPoint,
  NetworkLink,
  NetworkNode,
  SourcePerformanceRow,
  TimeseriesPoint
} from "@/lib/analytics-types";
import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import { CategoryScale, Chart, Legend, LineController, LineElement, LinearScale, PointElement, Tooltip } from "chart.js";

Chart.register(CategoryScale, LinearScale, LineController, LineElement, PointElement, Legend, Tooltip);

const CHART_WIDTH = 1200;
const CHART_HEIGHT = 600;
const chartRenderer = new ChartJSNodeCanvas({
  width: CHART_WIDTH,
  height: CHART_HEIGHT,
  backgroundColour: "#0f172a"
});

const COLOR_PALETTE = [
  "#38bdf8",
  "#a78bfa",
  "#f472b6",
  "#facc15",
  "#34d399",
  "#fb7185",
  "#f97316",
  "#22d3ee"
];

const toDateFloorExpr = "toDate(now() - INTERVAL {windowDays:UInt32} DAY)";

export async function fetchEntityTimeseries(params: TimeseriesParams = {}): Promise<TimeseriesPoint[]> {
  const windowDays = clampWindowDays(params.windowDays);
  const limitEntities = clampLimitEntities(params.limitEntities);
  const entityType = normalizeEntityType(params.entityType);
  const entityClause = entityType === "all" ? "" : "AND entity_type = {entityType:String}";

  const query = `
    WITH top_entities AS (
      SELECT entity_type, entity_id
      FROM insight.entity_mentions_timeseries
      WHERE day >= ${toDateFloorExpr}
        ${entityClause}
      GROUP BY entity_type, entity_id
      ORDER BY sum(mentions) DESC
      LIMIT {limitEntities:UInt32}
    )
    SELECT t.day, t.entity_type, t.entity_id, t.mentions, t.avg_confidence
    FROM insight.entity_mentions_timeseries AS t
    ANY INNER JOIN top_entities USING (entity_type, entity_id)
    WHERE t.day >= ${toDateFloorExpr}
      ${entityClause}
    ORDER BY t.day ASC, t.entity_type, t.entity_id
  `;

  const queryParams: Record<string, unknown> = {
    windowDays,
    limitEntities
  };
  if (entityClause) {
    queryParams.entityType = entityType;
  }

  const resultSet = await clickhouseClient.query({ query, query_params: queryParams });
  const rows = await resultSet.json<
    Array<{ day: string; entity_type: "artist" | "work" | "recording"; entity_id: string; mentions: number; avg_confidence: number }>
  >();

  return rows.map((row) => ({
    day: new Date(row.day).toISOString(),
    entityType: row.entity_type,
    entityId: row.entity_id,
    mentions: Number(row.mentions),
    avgConfidence: Number(row.avg_confidence)
  }));
}

export async function fetchGenreTrends(params: GenreParams = {}): Promise<GenreTrendPoint[]> {
  const windowDays = clampWindowDays(params.windowDays);
  const limitGenres = clampLimitGenres(params.limitGenres);

  const query = `
    WITH top_genres AS (
      SELECT genre
      FROM insight.genre_trends
      WHERE day >= ${toDateFloorExpr}
      GROUP BY genre
      ORDER BY sum(mentions) DESC
      LIMIT {limitGenres:UInt32}
    )
    SELECT t.day, t.genre, t.mentions, t.unique_sources
    FROM insight.genre_trends AS t
    INNER JOIN top_genres USING (genre)
    WHERE t.day >= ${toDateFloorExpr}
    ORDER BY t.day ASC, t.genre
  `;

  const queryParams = { windowDays, limitGenres };
  const resultSet = await clickhouseClient.query({ query, query_params: queryParams });
  const rows = await resultSet.json<
    Array<{ day: string; genre: string; mentions: number; unique_sources: number }>
  >();

  return rows.map((row) => ({
    day: new Date(row.day).toISOString(),
    genre: row.genre,
    mentions: Number(row.mentions),
    uniqueSources: Number(row.unique_sources)
  }));
}

export async function fetchSourcePerformance(params: SourceParams = {}): Promise<SourcePerformanceRow[]> {
  const windowDays = clampWindowDays(params.windowDays);
  const limitSources = clampLimitSources(params.limitSources);

  const query = `
    SELECT source, total_items, unique_tags, first_seen, last_seen
    FROM insight.source_performance
    WHERE last_seen >= now() - INTERVAL {windowDays:UInt32} DAY
    ORDER BY total_items DESC
    LIMIT {limitSources:UInt32}
  `;

  const queryParams = { windowDays, limitSources };
  const resultSet = await clickhouseClient.query({ query, query_params: queryParams });
  const rows = await resultSet.json<
    Array<{ source: string; total_items: number; unique_tags: number; first_seen: string; last_seen: string }>
  >();

  return rows.map((row) => ({
    source: row.source,
    totalItems: Number(row.total_items),
    uniqueTags: Number(row.unique_tags ?? 0),
    firstSeen: new Date(row.first_seen).toISOString(),
    lastSeen: new Date(row.last_seen).toISOString()
  }));
}

export async function fetchEntityNetwork(params: NetworkParams = {}): Promise<{ nodes: NetworkNode[]; links: NetworkLink[] }> {
  const windowDays = clampWindowDays(params.windowDays);
  const limitLinks = clampLimitLinks(params.limitLinks);
  const entityType = normalizeEntityType(params.entityType);
  const entityClause = entityType === "all" ? "" : "AND l1.entity_type = {entityType:String} AND l2.entity_type = {entityType:String}";

  const query = `
    SELECT
      l1.entity_type AS source_type,
      l1.entity_id AS source_id,
      l2.entity_type AS target_type,
      l2.entity_id AS target_id,
      countDistinct(l1.news_id) AS weight
    FROM insight.entity_links AS l1
    INNER JOIN insight.entity_links AS l2
      ON l1.news_id = l2.news_id AND l1.entity_id < l2.entity_id
    WHERE l1.linked_at >= now() - INTERVAL {windowDays:UInt32} DAY
      ${entityClause}
    GROUP BY source_type, source_id, target_type, target_id
    ORDER BY weight DESC
    LIMIT {limitLinks:UInt32}
  `;

  const queryParams: Record<string, unknown> = { windowDays, limitLinks };
  if (entityClause) {
    queryParams.entityType = entityType;
  }

  const resultSet = await clickhouseClient.query({ query, query_params: queryParams });
  const rows = await resultSet.json<
    Array<{
      source_type: string;
      source_id: string;
      target_type: string;
      target_id: string;
      weight: number;
    }>
  >();

  const nodeMap = new Map<string, NetworkNode>();
  const links: NetworkLink[] = rows.map((row) => {
    const sourceKey = `${row.source_type}:${row.source_id}`;
    const targetKey = `${row.target_type}:${row.target_id}`;

    const ensureNode = (key: string, type: string, label: string, weight: number) => {
      const existing = nodeMap.get(key);
      if (existing) {
        existing.weight += weight;
        return;
      }
      nodeMap.set(key, { id: key, label, type, weight });
    };

    ensureNode(sourceKey, row.source_type, row.source_id, Number(row.weight));
    ensureNode(targetKey, row.target_type, row.target_id, Number(row.weight));

    return {
      source: sourceKey,
      target: targetKey,
      weight: Number(row.weight)
    };
  });

  return {
    nodes: Array.from(nodeMap.values()),
    links
  };
}

function buildCsv(rows: Array<Record<string, string | number>>): string {
  if (!rows.length) {
    return "";
  }
  const headers = Object.keys(rows[0]);
  const escape = (value: string | number) => {
    const str = String(value ?? "");
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escape(row[header])).join(","));
  }
  return lines.join("\n");
}

function toExportPayload(content: string | Buffer, filename: string, mimeType: string) {
  const buffer = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  return {
    base64: buffer.toString("base64"),
    filename,
    mimeType
  };
}

export async function exportTimeseriesCsv(params: TimeseriesParams = {}) {
  const data = await fetchEntityTimeseries(params);
  const rows = data.map((point) => ({
    day: point.day,
    entityType: point.entityType,
    entityId: point.entityId,
    mentions: point.mentions,
    avgConfidence: point.avgConfidence.toFixed(4)
  }));
  return toExportPayload(buildCsv(rows), `entity-timeseries-${Date.now()}.csv`, "text/csv");
}

export async function exportGenreTrendsCsv(params: GenreParams = {}) {
  const data = await fetchGenreTrends(params);
  const rows = data.map((point) => ({
    day: point.day,
    genre: point.genre,
    mentions: point.mentions,
    uniqueSources: point.uniqueSources
  }));
  return toExportPayload(buildCsv(rows), `genre-trends-${Date.now()}.csv`, "text/csv");
}

export async function exportSourcePerformanceCsv(params: SourceParams = {}) {
  const data = await fetchSourcePerformance(params);
  const rows = data.map((row) => ({
    source: row.source,
    totalItems: row.totalItems,
    uniqueTags: row.uniqueTags,
    firstSeen: row.firstSeen,
    lastSeen: row.lastSeen
  }));
  return toExportPayload(buildCsv(rows), `source-performance-${Date.now()}.csv`, "text/csv");
}

export async function exportTimeseriesPng(params: TimeseriesParams = {}) {
  const data = await fetchEntityTimeseries(params);
  const labels = Array.from(new Set(data.map((point) => point.day))).sort();
  const seriesKeys = Array.from(
    new Set(data.map((point) => `${point.entityType.toUpperCase()}: ${point.entityId}`))
  );

  const datasets = seriesKeys.map((label, index) => {
    const color = COLOR_PALETTE[index % COLOR_PALETTE.length];
    return {
      label,
      borderColor: color,
      backgroundColor: color,
      tension: 0.25,
      fill: false,
      data: labels.map((day) => {
        const match = data.find(
          (point) =>
            point.day === day && `${point.entityType.toUpperCase()}: ${point.entityId}` === label
        );
        return match ? match.mentions : 0;
      })
    };
  });

  const chartConfig = {
    type: "line" as const,
    data: {
      labels,
      datasets
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: { color: "#cbd5f5" }
        },
        y: {
          ticks: { color: "#cbd5f5" },
          beginAtZero: true
        }
      },
      plugins: {
        legend: {
          labels: { color: "#e2e8f0" }
        },
        tooltip: {
          callbacks: {
            title(context: any) {
              const label = context[0]?.label ?? "";
              return new Date(label).toLocaleDateString();
            }
          }
        }
      }
    }
  };

  const buffer = await chartRenderer.renderToBuffer(chartConfig as any, "image/png");
  return toExportPayload(buffer, `entity-timeseries-${Date.now()}.png`, "image/png");
}
