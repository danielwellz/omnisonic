import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { mkdtemp, readFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import type { ExportFormat } from "@prisma/client";
import { EXPORT_DEFAULT_DURATION_SECONDS } from "./config";
import { logger } from "./logger";

const codecByFormat: Record<ExportFormat, string> = {
  wav: "pcm_s16le",
  mp3: "libmp3lame",
  flac: "flac"
};

const mimeByFormat: Record<ExportFormat, string> = {
  wav: "audio/wav",
  mp3: "audio/mpeg",
  flac: "audio/flac"
};

const ffmpegPath = process.env.FFMPEG_PATH ?? ffmpegInstaller.path;

function resolveOutputExt(format: ExportFormat) {
  switch (format) {
    case "wav":
      return "wav";
    case "mp3":
      return "mp3";
    case "flac":
      return "flac";
    default:
      return "wav";
  }
}

export function getMimeForFormat(format: ExportFormat) {
  return mimeByFormat[format];
}

export async function renderMockMixdown(
  format: ExportFormat,
  durationSeconds = EXPORT_DEFAULT_DURATION_SECONDS,
  onProgress?: (percent: number) => void
) {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "omnisonic-export-"));
  const fileName = `mixdown.${resolveOutputExt(format)}`;
  const outputPath = path.join(tmpDir, fileName);

  await new Promise<void>((resolve, reject) => {
    const command = ffmpeg()
      .setFfmpegPath(ffmpegPath)
      .input("anullsrc=cl=stereo:r=44100")
      .inputFormat("lavfi")
      .duration(durationSeconds)
      .audioChannels(2)
      .audioCodec(codecByFormat[format])
      .format(format);

    if (format === "mp3") {
      command.audioBitrate("192k");
    }

    command
      .on("start", (cmd) => {
        logger.debug({ cmd }, "FFmpeg render started");
      })
      .on("progress", (progress) => {
        if (!onProgress) return;
        const capped = Math.min(95, Math.max(1, Math.round(progress.percent ?? 0)));
        if (Number.isFinite(capped)) {
          onProgress(capped);
        }
      })
      .on("error", (error) => {
        reject(error);
      })
      .on("end", () => resolve())
      .save(outputPath);
  });

  const buffer = await readFile(outputPath);
  await rm(tmpDir, { recursive: true, force: true });

  return {
    buffer,
    fileSize: buffer.length
  };
}
