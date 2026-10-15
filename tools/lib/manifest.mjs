import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_TIERS, DEFAULT_TIER_BY_TYPE, INDEX_TIER } from './defaults.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SHELL_DIR = path.join(here, '../shell');
export const loadSchema = (name) => JSON.parse(fs.readFileSync(path.join(here, '../../format/schema', name), 'utf8'));

/* Effective manifest: defaults filled in. Safe to call even when the manifest has problems. */
export function effectiveManifest(manifest) {
  const m = manifest || {};
  const tiers = (Array.isArray(m.tiers) && m.tiers.length ? m.tiers : DEFAULT_TIERS).map((t) => ({ status: '', audience: '', purpose: '', ...t }));
  const artifacts = (Array.isArray(m.artifacts) ? m.artifacts : []).map((a, i) => ({ n: a?.n ?? i + 1, status: '', owner_role: '', ...a }));
  return { ...m, tiers, artifacts, tierByType: { ...DEFAULT_TIER_BY_TYPE, ...(m.tier_by_type || {}) }, indexTier: INDEX_TIER };
}
