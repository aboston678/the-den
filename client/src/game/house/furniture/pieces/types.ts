import type { Kit } from "../parts.ts";

/** Builds one code-built piece into a kit at its own origin (footprint centre, y = 0 at its bottom, front facing +z). */
export type Builder = (k: Kit, size: { w: number; d: number; h: number }, look?: string) => void;
