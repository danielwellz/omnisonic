import type { SourcePerformanceRow } from "@/lib/analytics-types";

interface SourcePerformanceTableProps {
  data: SourcePerformanceRow[];
}

export function SourcePerformanceTable({ data }: SourcePerformanceTableProps) {
  if (!data.length) {
    return <p className="text-sm text-gray-400">No sources found for the selected window.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-800 text-sm">
        <thead>
          <tr className="bg-gray-900/70 text-left text-xs uppercase tracking-wide text-gray-400">
            <th className="px-3 py-2">Source</th>
            <th className="px-3 py-2 text-right">Items</th>
            <th className="px-3 py-2 text-right">Unique Tags</th>
            <th className="px-3 py-2 text-right">Last Seen</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-900/80">
          {data.map((row) => (
            <tr key={row.source} className="text-gray-200">
              <td className="px-3 py-2 font-medium">{row.source}</td>
              <td className="px-3 py-2 text-right text-gray-100">{row.totalItems.toLocaleString()}</td>
              <td className="px-3 py-2 text-right">{row.uniqueTags.toLocaleString()}</td>
              <td className="px-3 py-2 text-right text-gray-300">
                {new Date(row.lastSeen).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
