export type EntityTypeFilter = "all" | "artist" | "work" | "recording";

export const ENTITY_TYPE_OPTIONS: Array<{ label: string; value: EntityTypeFilter }> = [
  { label: "All Entities", value: "all" },
  { label: "Artists", value: "artist" },
  { label: "Works", value: "work" },
  { label: "Recordings", value: "recording" }
];

export function clampWindowDays(value?: number, fallback = 14): number {
  const safe = Number.isFinite(value) ? Number(value) : fallback;
  return Math.min(60, Math.max(7, safe));
}

export function normalizeEntityType(value?: string): EntityTypeFilter {
  if (value === "artist" || value === "work" || value === "recording") {
    return value;
  }
  return "all";
}

export function clampLimitEntities(value?: number, fallback = 5): number {
  const safe = Number.isFinite(value) ? Number(value) : fallback;
  return Math.min(10, Math.max(3, safe));
}

export function clampLimitGenres(value?: number, fallback = 6): number {
  const safe = Number.isFinite(value) ? Number(value) : fallback;
  return Math.min(12, Math.max(3, safe));
}

export function clampLimitSources(value?: number, fallback = 10): number {
  const safe = Number.isFinite(value) ? Number(value) : fallback;
  return Math.min(25, Math.max(5, safe));
}

export function clampLimitLinks(value?: number, fallback = 12): number {
  const safe = Number.isFinite(value) ? Number(value) : fallback;
  return Math.min(20, Math.max(4, safe));
}

export interface AnalyticsParams {
  windowDays?: number;
  entityType?: EntityTypeFilter;
}

export interface TimeseriesParams extends AnalyticsParams {
  limitEntities?: number;
}

export interface GenreParams extends AnalyticsParams {
  limitGenres?: number;
}

export interface SourceParams extends AnalyticsParams {
  limitSources?: number;
}

export interface NetworkParams extends AnalyticsParams {
  limitLinks?: number;
}
