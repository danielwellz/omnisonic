export type TimeseriesPoint = {
  day: string;
  entityType: "artist" | "work" | "recording";
  entityId: string;
  mentions: number;
  avgConfidence: number;
};

export type GenreTrendPoint = {
  day: string;
  genre: string;
  mentions: number;
  uniqueSources: number;
};

export type SourcePerformanceRow = {
  source: string;
  totalItems: number;
  uniqueTags: number;
  firstSeen: string;
  lastSeen: string;
};

export type NetworkNode = {
  id: string;
  label: string;
  type: string;
  weight: number;
};

export type NetworkLink = {
  source: string;
  target: string;
  weight: number;
};
