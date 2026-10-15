'use strict';
// Closed candidate literal shapes; independent verification remains a controller gate.
const fs = require('node:fs');
const {createHash} = require('node:crypto');
const parse = require('./reference-registry-json.cjs');
const bytes = fs.readFileSync(require.resolve('./reference-registry-new-schema-shapes.json'));
const expected = '939490e2269e61a28416d28f9df0219aba01805e7686239a75d034a8eb201e99';
if (createHash('sha256').update(bytes).digest('hex') !== expected)
  throw Error('unreviewed new-schema baseline bytes');
const shapes = parse(bytes.toString());
if (Object.keys(shapes).sort().join(',') !== 'id-crosswalk.schema.json,source-ledger.schema.json')
  throw Error('unreviewed new-schema baseline scope');
module.exports = file => shapes[file];
