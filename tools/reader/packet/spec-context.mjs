import { indexSpec } from '../indexer/index-spec.mjs';
import { buildStories, buildUiRows } from '../indexer/views/story-data.mjs';
import { buildEvidence } from '../indexer/views/evidence-model.mjs';
import { buildScreens } from '../indexer/views/design-model.mjs';
import { loadDesignData } from '../indexer/design-data.mjs';
import { loadBlockHistory } from '../../lib/block-history.mjs';

const unImages = (p) => String(p).replace(/^images\//, '');

/* Everything the packet needs from the exported spec, in one read. */
export function loadPacketSpec(specDir) {
  const r = indexSpec(specDir, {});
  const stories = buildStories(r.model, r.data.readable);
  const design = loadDesignData(r.spec);
  const evidence = buildEvidence(design);
  const imageRoles = Object.fromEntries(r.data.pages.map((p) => [p.id, p.imgRoles || {}]));
  const deny = ((r.model.manifest.images && r.model.manifest.images.deny) || []).map((x) => x.replace(/^\.?\//, ''));
  const screens = buildScreens({ design, stories, uiRows: buildUiRows(r.model), evidence, chain: r.data.chain, deny, imageRoles });
  const codedByScreen = {};
  for (const row of screens.rows) codedByScreen[row.screen] = [...new Set([...(codedByScreen[row.screen] || []), ...row.coded.map(unImages)])];
  const boardPng = Object.fromEntries(((r.data.chain && r.data.chain.boards) || []).map((b) => [b.id, unImages(b.png)]));
  return { data: r.data, model: r.model, stories, design, evidence, screens, codedByScreen, boardPng, blockEntries: loadBlockHistory(r.spec).entries, indexed: r };
}
