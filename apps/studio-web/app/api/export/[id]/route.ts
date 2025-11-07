import "@/app/api/_otel";
import { NextResponse } from "next/server";
import { withSpan, ensureTracer } from "@omnisonic/telemetry";
import { fetchExportForUser, requireUserId } from "../utils";

ensureTracer("studio-web-api");

export async function GET(req: Request, { params }: { params: { id: string } }) {
  return withSpan("studio-web-api", "export.id.get", async () => {
    const userId = await requireUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const origin = new URL(req.url).origin;
    const record = await fetchExportForUser(params.id, userId, origin);

    if (!record) {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }

    return NextResponse.json({ export: record });
  });
}
