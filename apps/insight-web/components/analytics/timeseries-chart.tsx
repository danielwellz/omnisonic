"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { TimeseriesPoint } from "@/lib/analytics-types";

interface TimeseriesChartProps {
  data: TimeseriesPoint[];
}

function formatDateLabel(value: string) {
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const palette = [
  "#38bdf8",
  "#a78bfa",
  "#f472b6",
  "#facc15",
  "#34d399",
  "#fb7185",
  "#f97316",
  "#22d3ee"
];

export function TimeseriesChart({ data }: TimeseriesChartProps) {
  const { chartData, seriesKeys } = useMemo(() => {
    const days = Array.from(new Set(data.map((point) => point.day))).sort();
    const keys = Array.from(
      new Set(data.map((point) => `${point.entityType.toUpperCase()}: ${point.entityId}`))
    );

    const rows = days.map((day) => {
      const base: Record<string, string | number> = { day };
      for (const key of keys) {
        const match = data.find(
          (point) => point.day === day && `${point.entityType.toUpperCase()}: ${point.entityId}` === key
        );
        base[key] = match ? match.mentions : 0;
      }
      return base;
    });

    return { chartData: rows, seriesKeys: keys };
  }, [data]);

  if (chartData.length === 0) {
    return <p className="text-sm text-gray-400">No data available for the selected window.</p>;
  }

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ left: 0, right: 16, top: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            dataKey="day"
            tickFormatter={formatDateLabel}
            stroke="#9ca3af"
            tick={{ fontSize: 12 }}
          />
          <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1f2937", borderRadius: 8 }}
            labelFormatter={(value) => new Date(value).toLocaleDateString()}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {seriesKeys.map((key, index) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={palette[index % palette.length]}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
