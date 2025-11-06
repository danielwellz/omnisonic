import { NextResponse } from "next/server";
import { prisma } from "@db/client";
import { auth } from "@/lib/auth";
import { getStorageType, readLocalFile } from "@storage/index";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const upload = await prisma.upload.findUnique({ where: { id: params.id } });
  if (!upload || upload.userId !== session.user.id) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  if (getStorageType() !== "local") {
    return NextResponse.json({ error: "Not available" }, { status: 400 });
  }

  const buffer = await readLocalFile(upload.storageKey);
  return new Response(buffer, {
    headers: {
      "Content-Type": upload.mimeType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(upload.fileName)}"`
    }
  });
}
