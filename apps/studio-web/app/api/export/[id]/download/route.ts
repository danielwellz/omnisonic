import { NextResponse } from "next/server";
import { prisma } from "@db/client";
import { getDownloadUrl, getStorageType, readLocalFile } from "@storage/index";
import { requireUserId } from "../../utils";

const mimeByFormat = {
  wav: "audio/wav",
  mp3: "audio/mpeg",
  flac: "audio/flac"
} as const;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const exportRecord = await prisma.export.findUnique({ where: { id: params.id } });
  if (!exportRecord || exportRecord.userId !== userId) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  if (exportRecord.status !== "completed" || !exportRecord.storageKey) {
    return NextResponse.json({ error: "Export is not ready for download" }, { status: 400 });
  }

  const signedUrl = await getDownloadUrl(exportRecord.storageKey).catch(() => null);
  if (signedUrl) {
    return NextResponse.redirect(signedUrl, { status: 302 });
  }

  if (getStorageType() !== "local") {
    return NextResponse.json({ error: "Download unavailable" }, { status: 400 });
  }

  const buffer = await readLocalFile(exportRecord.storageKey);
  return new Response(buffer, {
    headers: {
      "Content-Type": mimeByFormat[exportRecord.format] ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="mixdown-${exportRecord.id}.${exportRecord.format}"`,
      "Cache-Control": "private, max-age=0, must-revalidate"
    }
  });
}
