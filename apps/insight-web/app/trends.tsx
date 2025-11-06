"use server";

import { clickhouseClient } from "@/lib/clickhouse";

interface TrendRow {
  entity_type: "artist" | "work" | "recording";
  entity_id: string;
  mentions: number;
  avg_confidence: number;
}

export async function fetchTopEntities(limit = 20): Promise<TrendRow[]> {
  const query = `
    SELECT
      entity_type,
      entity_id,
      count(*) AS mentions,
      avg(confidence) AS avg_confidence
    FROM insight.entity_links
    WHERE linked_at >= now() - INTERVAL 7 DAY
    GROUP BY entity_type, entity_id
    ORDER BY mentions DESC, avg_confidence DESC
    LIMIT {limit:UInt32}
  `;

  const resultSet = await clickhouseClient.query({
    query,
    query_params: { limit }
  });

  const rows = await resultSet.json<TrendRow[]>();
  return rows;
}
