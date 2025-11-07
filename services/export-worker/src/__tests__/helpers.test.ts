import test from "node:test";
import assert from "node:assert/strict";
import { getMimeForFormat } from "../ffmpeg";
import { generateExportKey } from "@storage/index";

test("getMimeForFormat returns expected mime types", () => {
  assert.equal(getMimeForFormat("wav"), "audio/wav");
  assert.equal(getMimeForFormat("mp3"), "audio/mpeg");
  assert.equal(getMimeForFormat("flac"), "audio/flac");
});

test("generateExportKey builds stable paths", () => {
  const key = generateExportKey("user-1", "export-1", "wav");
  assert.equal(key, "exports/user-1/export-1.wav");
});
