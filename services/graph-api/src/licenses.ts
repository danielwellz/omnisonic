import { LicenseRightsType, LicenseStatus, Prisma } from "@prisma/client";
import { prisma } from "@db/client";

export interface LicensePayload {
  workId: string;
  licensee: string;
  territory: string | null;
  rightsType: LicenseRightsType;
  effectiveFrom: Date;
  expiresOn: Date | null;
  terms: Prisma.JsonValue | null;
  status: LicenseStatus;
}

const PERMITTED_CREATE_STATUSES: LicenseStatus[] = ["draft", "active"];

function parseRightsType(value: unknown): LicenseRightsType {
  if (typeof value !== "string") {
    return LicenseRightsType.mechanical;
  }
  const normalized = value.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(LicenseRightsType, normalized)) {
    return LicenseRightsType[normalized as keyof typeof LicenseRightsType];
  }
  return LicenseRightsType.mechanical;
}

function parseStatus(value: unknown, allowAll = false): LicenseStatus {
  if (typeof value !== "string") {
    return LicenseStatus.draft;
  }
  const normalized = value.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(LicenseStatus, normalized)) {
    const status = LicenseStatus[normalized as keyof typeof LicenseStatus];
    if (allowAll || PERMITTED_CREATE_STATUSES.includes(status)) {
      return status;
    }
  }
  return LicenseStatus.draft;
}

function coerceDate(value: unknown, field: string): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.valueOf())) {
      return date;
    }
  }
  throw new Error(`Invalid date for ${field}`);
}

export function buildLicensePayload(raw: any, opts?: { allowAllStatuses?: boolean }): LicensePayload {
  const workId = String(raw?.workId ?? "").trim();
  const licensee = String(raw?.licensee ?? "").trim();
  if (!workId) throw new Error("workId is required");
  if (!licensee) throw new Error("licensee is required");

  const territoryRaw = raw?.territory;
  const territory =
    territoryRaw === null || territoryRaw === undefined || territoryRaw === ""
      ? null
      : String(territoryRaw).trim();

  const rightsType = parseRightsType(raw?.rightsType);
  const effectiveFrom = coerceDate(raw?.effectiveFrom, "effectiveFrom");
  const expiresOn = raw?.expiresOn ? coerceDate(raw.expiresOn, "expiresOn") : null;

  if (expiresOn && expiresOn.getTime() <= effectiveFrom.getTime()) {
    throw new Error("expiresOn must be later than effectiveFrom");
  }

  const status = parseStatus(raw?.status, opts?.allowAllStatuses ?? false);

  let terms: Prisma.JsonValue | null = null;
  if (raw?.terms !== undefined) {
    if (typeof raw.terms === "object" || Array.isArray(raw.terms) || raw.terms === null) {
      terms = raw.terms as Prisma.JsonValue;
    } else {
      throw new Error("terms must be a JSON value");
    }
  }

  return {
    workId,
    licensee,
    territory,
    rightsType,
    effectiveFrom,
    expiresOn,
    terms,
    status
  };
}

export function rangesOverlap(
  startA: Date,
  endA: Date | null,
  startB: Date,
  endB: Date | null
): boolean {
  const endATime = endA ? endA.getTime() : Number.POSITIVE_INFINITY;
  const endBTime = endB ? endB.getTime() : Number.POSITIVE_INFINITY;
  return startA.getTime() <= endBTime && startB.getTime() <= endATime;
}

export async function assertNoLicenseConflicts(
  payload: LicensePayload,
  excludeId?: string
) {
  const candidates = await prisma.license.findMany({
    where: {
      workId: payload.workId,
      rightsType: payload.rightsType,
      territory: payload.territory,
      status: { in: [LicenseStatus.draft, LicenseStatus.active] },
      ...(excludeId ? { NOT: { id: excludeId } } : {})
    }
  });

  const conflict = candidates.find((license) =>
    rangesOverlap(
      payload.effectiveFrom,
      payload.expiresOn,
      license.effectiveFrom,
      license.expiresOn
    )
  );

  if (conflict) {
    throw new Error(
      `Conflicting license ${conflict.id} exists for territory ${conflict.territory ?? "worldwide"}`
    );
  }
}
