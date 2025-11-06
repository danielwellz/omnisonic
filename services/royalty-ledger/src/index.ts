import { createHash } from "node:crypto";

const BASIS_POINTS = 10_000n;

export type ShareType = "basisPoints" | "percent" | "ratio";

export interface ComputeAmountInput {
  gross: number | string;
  share: number;
  shareType?: ShareType;
  precision?: number;
}

function toScaled(value: number | string, precision: number): bigint {
  const str = (typeof value === "number" ? value.toString() : value).trim();
  if (!str) return 0n;
  if (!/^[-+]?\d+(?:\.\d+)?$/.test(str)) {
    throw new Error("Invalid numeric amount");
  }

  const negative = str.startsWith("-");
  const sanitized = negative || str.startsWith("+") ? str.slice(1) : str;
  const [integerRaw, fractionalRaw = ""] = sanitized.split(".");

  const integerPart = integerRaw.replace(/^0+(?=\d)/, "") || "0";
  let fractionalPart = fractionalRaw;
  let carry = 0n;

  if (fractionalPart.length > precision) {
    const roundingDigit = fractionalPart[precision];
    fractionalPart = fractionalPart.slice(0, precision);
    if (roundingDigit && Number(roundingDigit) >= 5) {
      const fractionalBig = BigInt(fractionalPart || "0") + 1n;
      const limit = 10n ** BigInt(precision);
      if (fractionalBig >= limit) {
        carry = 1n;
        fractionalPart = (fractionalBig - limit).toString().padStart(precision, "0");
      } else {
        fractionalPart = fractionalBig.toString().padStart(precision, "0");
      }
    }
  }

  const fractionalPadded = fractionalPart.padEnd(precision, "0");
  const combined = BigInt(integerPart || "0") + carry;
  const scaledInteger = combined * 10n ** BigInt(precision);
  const scaledFraction = BigInt(fractionalPadded || "0");
  const result = scaledInteger + scaledFraction;
  return negative ? -result : result;
}

function fromScaled(value: bigint, precision: number): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const scaleFactor = 10n ** BigInt(precision);
  const integerPart = absolute / scaleFactor;
  const fractionalPart = absolute % scaleFactor;
  const fractionalStr = fractionalPart.toString().padStart(precision, "0");
  const trimmedFraction = fractionalStr.replace(/0+$/, "");
  const result = trimmedFraction ? `${integerPart.toString()}.${trimmedFraction}` : integerPart.toString();
  return negative ? `-${result}` : result;
}

export function computeAmount({
  gross,
  share,
  shareType = "basisPoints",
  precision = 6
}: ComputeAmountInput): string {
  if (!Number.isFinite(share)) {
    throw new Error("share must be finite");
  }

  let shareScaled: bigint;
  switch (shareType) {
    case "basisPoints":
      shareScaled = BigInt(Math.round(share));
      break;
    case "percent":
      shareScaled = BigInt(Math.round(share * 100));
      break;
    case "ratio":
      shareScaled = BigInt(Math.round(share * 10_000));
      break;
    default:
      throw new Error(`Unsupported shareType: ${shareType}`);
  }

  if (shareScaled < 0n) {
    throw new Error("share must be positive");
  }

  const scaledGross = toScaled(gross, precision);
  const numerator = scaledGross * shareScaled;
  const half = BASIS_POINTS / 2n;
  const scaledNet =
    numerator >= 0n ? (numerator + half) / BASIS_POINTS : (numerator - half) / BASIS_POINTS;
  return fromScaled(scaledNet, precision);
}

function hashPair(a: Buffer, b: Buffer): Buffer {
  return createHash("sha256").update(Buffer.concat([a, b])).digest();
}

function hashLeaf(data: string | Buffer): Buffer {
  return createHash("sha256").update(typeof data === "string" ? Buffer.from(data) : data).digest();
}

export function merkleRoot(leaves: Array<string | Buffer>): string {
  if (leaves.length === 0) {
    return "";
  }

  let level = leaves.map(hashLeaf);

  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? level[i];
      next.push(hashPair(left, right));
    }
    level = next;
  }

  return level[0].toString("hex");
}
