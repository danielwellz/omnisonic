import type { Export } from "@prisma/client";
import { getDownloadUrl } from "@storage/index";

export async function resolveDownloadUrl(record: Export, origin: string): Promise<string | null> {
  if (!record.storageKey) {
    return null;
  }
  try {
    const directUrl = await getDownloadUrl(record.storageKey);
    if (directUrl) {
      return directUrl;
    }
  } catch (error) {
    console.warn("Failed to create signed URL for export", error);
  }
  return `${origin}/api/export/${record.id}/download`;
}
