import "tsconfig-paths/register";
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeExportFormat } from "../lib/export-formats";
import { serializeExport } from "../lib/exports";

test("normalizeFormat guards supported formats", () => {
  assert.equal(normalizeExportFormat("wav"), "wav");
  assert.equal(normalizeExportFormat("MP3"), "mp3");
  assert.equal(normalizeExportFormat("unknown"), "wav");
  assert.equal(normalizeExportFormat(null), "wav");
});

test("serializeExport converts record into plain object", () => {
  const now = new Date();
  const record = {
    id: "exp_1",
    sessionId: "session_1",
    userId: "user_1",
    status: "processing",
    format: "wav",
    progress: 25,
    fileUrl: null,
    fileSize: null,
    storageKey: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    errorMessage: null
  } as const;

  const serialized = serializeExport(record, null);
  assert.equal(serialized.id, record.id);
  assert.equal(serialized.format, "wav");
  assert.equal(serialized.downloadUrl, null);
  assert.equal(typeof serialized.createdAt, "string");
});
