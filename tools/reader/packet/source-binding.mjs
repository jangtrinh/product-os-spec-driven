import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, RunnerError } from '../../lib/config/path-selection.mjs';

/* Binds every wording the packet shows to the bytes its member hashes pin (packet-interchange §2). The wording is read ONCE from a
   snapshot of the exported spec, hashed, compared with the member's artifact pin, and only then parsed. A story file that a displayed
   member does not pin, or whose bytes differ from the pin, is exit 3: an unbound packet is never rendered. */
const readHere = (name) => fs.readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8');
/* One source text, run by the generator, the page and the verifier: the wording extractors plus the whole-view renderer. */
export const CORE_SOURCE = `${readHere('ac-row-core.js')}\n${readHere('packet-view-core.js')}`;
const core = new Function(`${CORE_SOURCE}\nreturn { acRowCells, storyTitleOf, decisionRuling, screensFor, contractRowsFor, renderView, viewProblems, canon };`)();
export const viewCore = { ...core, source: CORE_SOURCE };

export function bindDisplayedSources({ snapshotDir, specRoot, stories, membership, scopeIds }) {
  const sources = {};
  const prefix = specRoot ? `${specRoot}/` : '';
  for (const story of stories.filter((s) => scopeIds.some((id) => id.startsWith(`${s.id}.`)))) {
    const key = `${prefix}${story.rel}`;
    let bytes;
    try { bytes = fs.readFileSync(path.join(snapshotDir, story.rel)); } catch { throw new RunnerError(`Story ${story.id}: the exported spec has no ${story.rel}, so its wording cannot be shown`, 3); }
    const sum = sha256(bytes);
    const text = bytes.toString('utf8');
    for (const id of scopeIds.filter((x) => x.startsWith(`${story.id}.`))) {
      const member = membership.members.find((m) => m.kind === 'ac' && m.id === id);
      if (!member || !(key in member.artifacts)) throw new RunnerError(`${id}: its wording comes from ${key}, which the member does not pin (not pinned); an unbound packet is never rendered`, 3);
      if (member.artifacts[key] !== sum) throw new RunnerError(`${id}: ${key} in the exported spec is not the bytes the member pins; refuse to show wording that approval would not cover`, 3);
      const row = core.acRowCells(text, id.slice(story.id.length + 1));
      if (!row) throw new RunnerError(`${id}: no acceptance row in the pinned ${key}; there is no wording to approve`, 3);
    }
    sources[key] = bytes.toString('base64');
  }
  return { sources };
}

/* Everything else the packet shows from the exported spec (decision rulings, the rule wording of a contract amendment or block history)
   is bound the same way: the file's bytes must be the bytes EVERY requested member pins. Rulings are then read from those very bytes,
   never from an independently exported ledger. */
export function makeSupportBinder({ snapshotDir, specRoot }) {
  const prefix = specRoot ? `${specRoot}/` : '';
  const sources = {};
  const state = { ledgerKey: null };
  const pin = (membership, scopeIds, rel, what) => {
    const key = `${prefix}${rel}`;
    let bytes;
    try { bytes = fs.readFileSync(path.join(snapshotDir, rel)); } catch { throw new RunnerError(`${what}: the exported spec has no ${rel}, so it cannot be shown`, 3); }
    const sum = sha256(bytes);
    for (const id of scopeIds) {
      const member = membership.members.find((m) => m.kind === 'ac' && m.id === id);
      if (!member || !(key in member.artifacts)) throw new RunnerError(`${what} comes from ${key}, which ${id} does not pin (not pinned); an unbound packet is never rendered`, 3);
      if (member.artifacts[key] !== sum) throw new RunnerError(`${what}: ${key} in the exported spec is not the bytes ${id} pins; refuse to show text that approval would not cover`, 3);
    }
    return { key, bytes };
  };
  return {
    sources, state,
    /* Rule wording source: pinned and hash-checked; the text itself is rendered from the same snapshot bytes just hashed. */
    pinFile(membership, scopeIds, rel, what) { pin(membership, scopeIds, rel, what); },
    /* Screen rows joined to the scope, read from the pinned inventory bytes. Every ui-contract file is pinned the same way when a screen is shown. */
    screens(membership, scopeIds, inventoryRel, contractRels) {
      if (!inventoryRel) return [];
      const { key, bytes } = pin(membership, scopeIds, inventoryRel, 'Screen inventory');
      const rows = core.screensFor(bytes.toString('utf8'), scopeIds);
      if (rows === null) throw new RunnerError(`${key} is not a screen inventory; there is nothing to show or approve`, 3);
      sources[key] = bytes.toString('base64');
      if (rows.length) for (const rel of contractRels) { const c = pin(membership, scopeIds, rel, 'UI contract'); sources[c.key] = c.bytes.toString('base64'); }
      return rows;
    },
    /* Rulings for `ids`, taken from the pinned ledger bytes. A referenced id with no row there is refused, not dropped. */
    decisions(membership, scopeIds, ledgerRel, ids) {
      if (!ids.length) return [];
      if (!ledgerRel) throw new RunnerError('A story names decision ids but the exported spec has no decision ledger to show them from', 3);
      const { key, bytes } = pin(membership, scopeIds, ledgerRel, 'Decision rulings');
      const text = bytes.toString('utf8');
      sources[key] = bytes.toString('base64'); state.ledgerKey = key;
      return ids.map((id) => {
        const ruling = core.decisionRuling(text, id);
        if (ruling === null) throw new RunnerError(`${id}: no ruling row in the pinned ${key}; there is no wording to approve`, 3);
        return { id, text: ruling, source: id, key };
      });
    },
  };
}
