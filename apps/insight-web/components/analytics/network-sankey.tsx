"use client";

import { useMemo } from "react";
import { ResponsiveContainer, Sankey, Tooltip } from "recharts";
import type { NetworkLink, NetworkNode } from "@/lib/analytics-types";

interface NetworkSankeyProps {
  nodes: NetworkNode[];
  links: NetworkLink[];
}

export function NetworkSankey({ nodes, links }: NetworkSankeyProps) {
  const data = useMemo(() => {
    const indexMap = new Map<string, number>();
    const sankeyNodes = nodes.map((node, index) => {
      indexMap.set(node.id, index);
      return { name: `${node.label}` };
    });

    const sankeyLinks = links
      .map((link) => {
        const sourceIndex = indexMap.get(link.source);
        const targetIndex = indexMap.get(link.target);
        if (sourceIndex === undefined || targetIndex === undefined) {
          return null;
        }
        return {
          source: sourceIndex,
          target: targetIndex,
          value: link.weight
        };
      })
      .filter(Boolean) as Array<{ source: number; target: number; value: number }>;

    return { nodes: sankeyNodes, links: sankeyLinks };
  }, [nodes, links]);

  if (!data.links.length) {
    return <p className="text-sm text-gray-400">No co-mentions detected for this period.</p>;
  }

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <Sankey data={data} node={{ stroke: "#1f2937", strokeWidth: 1 }} link={{ strokeOpacity: 0.3, color: "#22d3ee" }}>
          <Tooltip
            contentStyle={{ backgroundColor: "#111827", borderColor: "#1f2937" }}
            formatter={(value: number) => [`${value} shared items`, "Mentions"]}
          />
        </Sankey>
      </ResponsiveContainer>
    </div>
  );
}
