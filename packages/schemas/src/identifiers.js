import { z } from "zod";
const ISRC_REGEX = /^[A-Z]{2}[A-Z0-9]{3}\d{2}\d{5}$/;
const ISRC_FRIENDLY_REGEX = /^[A-Z]{2}-?[A-Z0-9]{3}-?\d{2}-?\d{5}$/;
const ISWC_REGEX = /^T-\d{3}\.\d{3}\.\d{3}-\d$/;
export const isrcSchema = z
    .string()
    .trim()
    .transform((value) => value.replace(/-/g, "").toUpperCase())
    .refine((value) => ISRC_REGEX.test(value), {
    message: "Invalid ISRC format"
});
export const iswcSchema = z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .refine((value) => ISWC_REGEX.test(value), {
    message: "Invalid ISWC format"
});
export const isrcFriendlySchema = z
    .string()
    .trim()
    .refine((value) => ISRC_FRIENDLY_REGEX.test(value.toUpperCase()), {
    message: "Invalid ISRC format"
});
