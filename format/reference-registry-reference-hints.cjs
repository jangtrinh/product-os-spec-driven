'use strict';
module.exports = function referenceHints(schemas, pointer, formatText) {
  const {resolve} = require('./reference-registry-schema-path.cjs')(schemas);
  // Literal regex strings from the authoring contract, not from the registry.
  const idSection = formatText.split('## 4. Ids')[1].split('## 5. Body rules')[0];
  const declaredPatterns = [...idSection.matchAll(/`(\^[^`]+\$)`/g)]
    .map(m => m[1].replace(/\\\\/g, '\\').replace(/\\\|/g, '|'));
  declaredPatterns.push('^[a-z][a-z0-9]*$', '^[A-Za-z0-9][A-Za-z0-9_-]*$');
  const typed = /(?:REQ-|US-|NF-|AC-|BR-|A-|C-|SC-|SCN-|W-|BRD-|packet-|source-|Q-|XC-|INT-|FB-|CS-|DL-|OI-|TD-|CI-|(?:\^|\b)[DSEA](?:\\d|\[0-9\]))/;
  function hints(node, owner, seen = new Set()) {
    if (!node || typeof node !== 'object' || seen.has(node)) return '';
    seen.add(node);
    let text = [node.pattern, node.description].filter(Boolean).join(' ');
    if (node.$ref) {
      const ref = resolve(node,owner);
      if (ref.node !== undefined) text += ' ' + hints(ref.node,ref.owner,seen);
      text += ' ' + node.$ref;
    }
    for (const k of ['items', 'propertyNames']) text += ' ' + hints(node[k], owner, seen);
    for (const k of ['anyOf', 'oneOf', 'allOf'])
      for (const child of node[k] || []) text += ' ' + hints(child, owner, seen);
    return text;
  }
  function marked(name, node, file) {
    if (!node || !Object.keys(node).length) return false;
    const text = hints(node, schemas.get(file));
    const scalar = node.type !== 'object' && (node.type === 'string' || node.type === 'array' || node.$ref || node.anyOf || node.oneOf || node.allOf);
    return (scalar && (/^(id|ids|ref|refs|path|paths|file|files|page|pages|source|source_key|handle|anchor)$/.test(name)
      || /(?:_id|_ids|_ref|_refs|_receipt)$/.test(name)))
      || typed.test(text) || declaredPatterns.some(pattern => text.includes(pattern))
      || /\$defs\/(?:path|hashes|screen|state|us|ac|scn|handle)\b/.test(text)
      || /\b(?:id|ids|identifier|path|paths|file|directory|reference|pointer|handle)\b/i.test(text)
      || /\(\?!\/\)/.test(text);
  }
  const declaresReference = text => typed.test(text) || declaredPatterns.some(pattern => text.includes(pattern))
    || /\(\?!\/\)/.test(text) || /\$defs\/path\b/.test(text)
    || /\b(?:references?|pointers?|identifiers?)\b|\b(?:local|relative) paths?\b|\bpath to\b/i.test(text)
    || /\\\.md\b/.test(text);
  return {hints, marked, declaresReference, hidesTyped: text => typed.test(text) || /\(\?!\/\)/.test(text)};
};
