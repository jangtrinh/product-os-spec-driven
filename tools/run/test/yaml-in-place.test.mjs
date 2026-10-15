import test from 'node:test';
import assert from 'node:assert/strict';
import {editYaml} from '../../lib/config/yaml-in-place.mjs';
import {parseYaml} from '../../lib/config/yaml-parser.mjs';
import {canonical} from '../../lib/config/strict-json.mjs';
function change(source,edit) {const c=parseYaml(source);edit(c);const after=editYaml(source,c);assert.equal(canonical(parseYaml(after)),canonical(c));return after;}
test('scalar replacement preserves CRLF, comments, spacing, ordering and no final newline',()=>{
 const s='# heading\r\nroot:\r\n    version: \'1\'   # retain\r\n    other: "a:#b"';
 assert.equal(change(s,c=>c.root.version='2'),s.replace("'1'","'2'"));
});
test('new keys append to the correct block mapping in existing indentation',()=>{
 const s='root:\n    old: true\n# next root\ntail: 1\n';
 assert.equal(change(s,c=>{c.root.added={nested:'yes',list:['a','b']};}), 'root:\n    old: true\n    added:\n      nested: "yes"\n      list:\n        - "a"\n        - "b"\n# next root\ntail: 1\n');
 assert.equal(change('a: 1',c=>c.b=false),'a: 1\nb: false\n');
});
test('quoted keys are addressed without confusing punctuation or dotted names',()=>{
 const s='"a:b":\n  "x.y": "old # : text" # keep\n';assert.equal(change(s,c=>c['a:b']['x.y']='new'),s.replace('"old # : text"','"new"'));
});
test('flow parents, block scalars, nested sequences and deletions refuse naming the manual key',()=>{
 for(const [s,edit,key] of [ ['a: {b: 1}\n',c=>c.a.b=2,'a.b'],['a: |\n  text\n',c=>c.a='new','a'],['a:\n  - old\n',c=>c.a=[['new']],'a'],['a: 1\n',c=>delete c.a,'a'] ]) {const c=parseYaml(s);edit(c);assert.throws(()=>editYaml(s,c),e=>e.code===3&&e.message.includes(key)&&e.message.includes('manually edit'));}
});

test('scalar sequence replacements retain inline and block owner comments',()=>{
 const source='root:\n  context:\n    - old # keep source note\n    # keep list note\n    - second\n  tail: true\n';
 const after=change(source,c=>c.root.context=['new','second','third']);
 assert.match(after,/# keep source note/);assert.match(after,/# keep list note/);assert.match(after,/  tail: true/);
 assert.deepEqual(parseYaml(after).root.context,['new','second','third']);
});
