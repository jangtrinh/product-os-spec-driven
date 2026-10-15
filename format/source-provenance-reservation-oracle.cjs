'use strict';
// Independent reservation validation uses the owning v2 schema, not allocation parsing.
const scenarioPattern = new RegExp(require('./schema/model-common.schema.json').$defs.scn.pattern);
const ownerPattern = /^(?:US-(?:[0-9]+|P[0-9]+)|NF-[0-9]+)$/;
module.exports = function reservationErrors(reserved) {
  const errors = [], declaredOwners = new Set();
  for (const token of reserved) {
    if (typeof token !== 'string') { errors.push('X-CROSSWALK invalid occupied identity'); continue; }
    const value = token.startsWith('us:') ? token.slice(3) : token;
    if (ownerPattern.test(value)) declaredOwners.add(value);
  }
  for (const token of reserved) {
    if (typeof token !== 'string') continue;
    const colon = token.indexOf(':');
    const namespace = colon < 0 ? null : token.slice(0, colon);
    if (namespace !== null && namespace.toLowerCase() !== 'scenario') continue;
    if (namespace === null && !/scn[-\u2010-\u2015\u2212]/i.test(token)) continue;
    const value = namespace === null ? token : token.slice(colon + 1);
    const match = value.match(scenarioPattern);
    if ((namespace !== null && namespace !== 'scenario') || !match || match[0] !== value) {
      errors.push('X-CROSSWALK ambiguous occupied scenario'); continue;
    }
    if (!declaredOwners.has(value.slice(0, value.indexOf('.'))))
      errors.push('X-CROSSWALK unresolved scenario owner');
  }
  return errors;
};
