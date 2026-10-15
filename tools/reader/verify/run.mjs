import { crawlChecks } from './checks-crawl.mjs';
import { pageToggleCheck, imageRuleCheck, searchCheck, overflowChecks, interactionChecks } from './checks-ui.mjs';
import { artifactModeCheck } from './artifact-mode.mjs';
import { recentChangesCheck } from './checks-changes.mjs';
import { copyForAiCheck } from './checks-copy.mjs';
import { viewsCheck, disclosureCheck, a11yCheck, controlsCheck, skinContractCheck } from './checks-views.mjs';

/* Every check, by name, so a self-test can run just the one a planted defect should turn red. */
export const CHECKS = {
  crawl: crawlChecks, 'page-toggles': pageToggleCheck, 'image-rule': imageRuleCheck, search: searchCheck,
  overflow: overflowChecks, interactions: interactionChecks, 'artifact-mode': artifactModeCheck,
  'recent-changes': recentChangesCheck, views: viewsCheck, disclosures: disclosureCheck, 'a11y-basics': a11yCheck, controls: controlsCheck, 'skin-contract': skinContractCheck, 'copy-for-ai': copyForAiCheck,
};

export async function runChecks(ctx, only) {
  const results = [];
  for (const [key, fn] of Object.entries(CHECKS)) {
    if (only && !only.includes(key)) continue;
    if (key === 'artifact-mode' && !ctx.opts.artifact) continue;
    let r;
    try { r = await fn(ctx); } catch (e) { r = { name: key, ok: false, detail: { error: String(e.message).split('\n')[0] } }; }
    results.push(...[].concat(r));
  }
  return results;
}

export function summarize(results) {
  const failed = results.filter((r) => !r.ok);
  return { total: results.length, failed: failed.map((r) => r.name), ok: failed.length === 0 && results.length > 0 };
}
