'use strict';
const base = 'https://spec-driven.local/format/v2/';
function audit(schemas, demand) {
  const ids = new Set();
  for (const [file,schema] of schemas) {
    demand(typeof file === 'string' && /^[a-z][a-z0-9-]*\.(?:schema\.)?json$/.test(file)
      && schema?.$id === base+file, 'noncanonical schema root identity '+file);
    demand(!ids.has(schema?.$id), 'duplicate schema root identity '+schema?.$id);
    ids.add(schema?.$id);
  }
}
module.exports = {base,audit};
