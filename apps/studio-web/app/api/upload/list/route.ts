import { NextResponse } from "next/server";
import { prisma } from "@db/client";
import { auth } from "@/lib/auth";
import { getDownloadUrl } from "@storage/index";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId") ?? undefined;

  const uploads = await prisma.upload.findMany({
    where: {
      userId: session.user.id,
      ...(sessionId ? { sessionId } : {})
    },
    orderBy: { createdAt: "desc" }
  });

  const origin = new URL(req.url).origin;
  const results = await Promise.all(
    uploads.map(async (upload) => ({
      upload,
      downloadUrl:
        (await getDownloadUrl(upload.storageKey).catch(() => null)) ??
        `${origin}/api/upload/${upload.id}/file`
    }))
  );

  return NextResponse.json({ uploads: results });
}
