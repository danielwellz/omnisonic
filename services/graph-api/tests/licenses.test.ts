import test from "node:test";
import assert from "node:assert/strict";
import { buildLicensePayload, rangesOverlap } from "../src/licenses";

test("buildLicensePayload coerces blanks", () => {
  const now = new Date().toISOString();
  const payload = buildLicensePayload({
    workId: "work-1",
    licensee: "Label",
    rightsType: "performance",
    effectiveFrom: now
  });

  assert.equal(payload.workId, "work-1");
  assert.equal(payload.territory, null);
  assert.equal(payload.rightsType, "performance");
  assert.equal(payload.effectiveFrom.toISOString(), new Date(now).toISOString());
});

test("rangesOverlap detects overlaps", () => {
  const startA = new Date("2024-01-01");
  const endA = new Date("2024-12-31");
  const startB = new Date("2024-06-01");
  const endB = new Date("2025-01-01");
  assert.equal(rangesOverlap(startA, endA, startB, endB), true);
  assert.equal(rangesOverlap(startA, endA, new Date("2025-02-01"), new Date("2025-03-01")), false);
});
