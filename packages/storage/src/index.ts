import { mkdir, writeFile, rm, access, readFile } from "fs/promises";
import path from "path";
import { S3Client, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type StorageType = "s3" | "minio" | "local";

const STORAGE_TYPE = (process.env.STORAGE_TYPE ?? "local") as StorageType;
const BUCKET = process.env.S3_BUCKET_NAME ?? process.env.MINIO_BUCKET_NAME ?? "omnisonic";
const REGION = process.env.S3_REGION ?? "us-east-1";
const ENDPOINT = process.env.MINIO_ENDPOINT;
const ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID ?? process.env.MINIO_ACCESS_KEY;
const SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY ?? process.env.MINIO_SECRET_KEY;
const CDN_URL = process.env.STORAGE_CDN_URL?.replace(/\/$/, "");
const LOCAL_DIR = process.env.STORAGE_LOCAL_DIR ?? path.resolve(process.cwd(), ".uploads");

const s3Client =
  STORAGE_TYPE === "s3" || STORAGE_TYPE === "minio"
    ? new S3Client({
        region: REGION,
        endpoint: ENDPOINT,
        forcePathStyle: STORAGE_TYPE === "minio",
        credentials: ACCESS_KEY && SECRET_KEY ? { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY } : undefined
      })
    : null;

export interface UploadParams {
  key: string;
  contentType: string;
  body: Buffer;
}

export async function putObject({ key, contentType, body }: UploadParams): Promise<string> {
  if (STORAGE_TYPE === "local") {
    await mkdir(LOCAL_DIR, { recursive: true });
    const filePath = path.join(LOCAL_DIR, key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, body);
    return CDN_URL ? `${CDN_URL}/${key}` : `local://${key}`;
  }

  if (!s3Client) {
    throw new Error("S3 client is not configured");
  }

  const uploader = new Upload({
    client: s3Client,
    params: {
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType
    }
  });
  await uploader.done();
  return CDN_URL ? `${CDN_URL}/${key}` : `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

export async function deleteObject(key: string): Promise<void> {
  if (STORAGE_TYPE === "local") {
    const filePath = path.join(LOCAL_DIR, key);
    try {
      await rm(filePath, { force: true });
    } catch (error) {
      console.warn("Failed to delete local file", error);
    }
    return;
  }

  if (!s3Client) return;
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key
    })
  );
}

export async function getDownloadUrl(key: string, expiresIn = 3600): Promise<string | null> {
  if (CDN_URL) {
    return `${CDN_URL}/${key}`;
  }

  if (STORAGE_TYPE === "local") {
    const filePath = path.join(LOCAL_DIR, key);
    try {
      await access(filePath);
      return null;
    } catch {
      throw new Error("Local file not found");
    }
  }

  if (!s3Client) {
    throw new Error("S3 client not configured");
  }

  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3Client, command, { expiresIn });
}

export function generateStorageKey(userId: string, fileName: string): string {
  const safeName = fileName.replace(/\s+/g, "-");
  return `uploads/${userId}/${Date.now()}-${safeName}`;
}

export function generateExportKey(userId: string, exportId: string, format: string): string {
  const safeFormat = format.replace(/[^a-z0-9]/gi, "").toLowerCase() || "wav";
  return `exports/${userId}/${exportId}.${safeFormat}`;
}

export function getStorageType() {
  return STORAGE_TYPE;
}

export async function readLocalFile(key: string): Promise<Buffer> {
  if (STORAGE_TYPE !== "local") {
    throw new Error("readLocalFile is only available for local storage");
  }
  const filePath = path.join(LOCAL_DIR, key);
  return readFile(filePath);
}
