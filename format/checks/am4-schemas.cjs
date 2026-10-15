'use strict';
// Positive and RED cases for the AM-4 schemas: component/pattern catalog,
// clarification record and expected-result change record.
const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require(process.env.SPEC_AJV_MODULE || 'ajv/dist/2020');
const Ajv = Ajv2020.default || Ajv2020;

const dir = path.join(__dirname, '..', 'schema');
const ajv = new Ajv({ strict: true, allErrors: true });
ajv.addKeyword({keyword: 'x-spec-ref', schemaType: ['string', 'boolean'], valid: true});
ajv.addKeyword({keyword: 'x-spec-ref-reason', schemaType: 'string', valid: true});
ajv.addKeyword({keyword: 'x-spec-exclusion', schemaType: 'object', valid: true});
ajv.addFormat('date-time', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
ajv.addFormat('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
ajv.addFormat('date', /^\d{4}-\d{2}-\d{2}$/);
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.schema.json'))) {
  ajv.addSchema(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}
const id = (n) => `https://spec-driven.local/format/v2/${n}.schema.json`;
const at = '2026-10-07T04:30:00Z';
const cases = [
  ['ds-catalog', true, { version: '1', adapter: 'project', kind: 'component', items: [{ handle: 'button.primary', name: 'Primary button', status: 'active' }] }],
  ['ds-catalog', false, { version: '1', adapter: 'project', kind: 'component', items: [{ handle: 'card.old', name: 'Old card', status: 'deprecated' }] }],
  ['ds-catalog', false, { version: '1', adapter: 'project', kind: 'widget', items: [{ handle: 'x', name: 'X', status: 'active' }] }],
  ['clarify-record', true, { id: 'Q-001', stage: 'clarify', round: 1, question: 'Có gửi thông báo khi tới gate không?', options: ['Có', 'Không'], recommended: 1, depends_on: ['US-SD0201'], status: 'open', asked_at: at }],
  ['clarify-record', true, { id: 'Q-002', stage: 'clarify', round: 1, question: 'Ai duyệt?', options: ['PO', 'QC'], recommended: 0, depends_on: [], status: 'answered', asked_at: at, answer: 'PO', decided_by: 'po@example.com', decided_at: at, decision_ref: 'D-07' }],
  ['clarify-record', false, { id: 'Q-003', stage: 'clarify', round: 1, question: 'Ai duyệt?', options: ['PO', 'QC'], recommended: 0, depends_on: [], status: 'answered', asked_at: at }],
  ['clarify-record', false, { id: 'Q-004', stage: 'clarify', round: 1, question: 'Một phương án?', options: ['Chỉ một'], recommended: 0, depends_on: [], status: 'open', asked_at: at }],
  ['expected-change', true, { id: 'XC-001', target: { kind: 'ac', id: 'US-16/AC-02' }, before: '5 steps', after: '6 steps', reason: 'A-09 adds a step', requested_by: 'qa@example.com', requested_at: at, status: 'approved', decided_by: 'po@example.com', decided_at: at, amendment_ref: 'FC-004/A-09', red_history: [{ receipt: 'r-001', result: 'FAIL' }] }],
  ['expected-change', false, { id: 'XC-002', target: { kind: 'ac', id: 'US-16/AC-02' }, before: '5', after: '6', reason: 'match code', requested_by: 'dev@example.com', requested_at: at, status: 'approved', decided_by: 'po@example.com', decided_at: at, red_history: [] }],
  ['expected-change', false, { id: 'XC-003', target: { kind: 'ac', id: 'US-16/AC-02' }, before: '5', after: '6', reason: 'r', requested_by: 'dev@example.com', requested_at: at, status: 'pending', red_history: [{ receipt: 'r-1', result: 'PASS' }] }],
  // AM-8: an approved expected-result change needs at least one actual FAIL; BLOCKED alone is harness history.
  ['expected-change', false, { id: 'XC-004', target: { kind: 'ac', id: 'US-16/AC-02' }, before: '5', after: '6', reason: 'r', requested_by: 'qa@example.com', requested_at: at, status: 'approved', decided_by: 'po@example.com', decided_at: at, amendment_ref: 'FC-004/A-09', red_history: [{ receipt: 'r-2', result: 'BLOCKED' }] }],
  ['expected-change', true, { id: 'XC-005', target: { kind: 'ac', id: 'US-16/AC-02' }, before: '5', after: '6', reason: 'r', requested_by: 'qa@example.com', requested_at: at, status: 'pending', red_history: [{ receipt: 'r-3', result: 'BLOCKED' }] }],
  // AM-5: integration and feedback records.
  ['integration-record', true, { id: 'INT-001', at, base: 'abc1234', branches: [{ ref: 'p3-lint-v2', head: 'def5678' }], spec_head: 'abc1234', shared_dependencies: [{ kind: 'rule', id: 'BR-03' }], semantic_conflicts: [{ id: 'C1', description: 'US-16 AC-02 differs', resolution: 'resolved', decided_by: 'po@example.com', decision_ref: 'D-20' }], status: 'resolved', reviewed_by: 'qa@example.com', reviewer_independent: true }],
  ['integration-record', false, { id: 'INT-002', at, base: 'abc1234', branches: [{ ref: 'b', head: 'def5678' }], spec_head: 'abc1234', shared_dependencies: [], semantic_conflicts: [], status: 'clean', reviewed_by: 'dev@example.com', reviewer_independent: false }],
  ['integration-record', false, { id: 'INT-003', at, base: 'abc1234', branches: [{ ref: 'b', head: 'def5678' }], spec_head: 'abc1234', shared_dependencies: [], semantic_conflicts: [{ id: 'C1', description: 'x', resolution: 'resolved' }], status: 'conflicts-open' }],
  ['feedback-record', true, { id: 'FB-001', received_at: at, from: 'owner@example.com', verbatim: 'Không mentioned gì về planannotator', scope: 'shared-rule', disposition: 'enforced', ruling_ref: 'D12', invariant: 'no idea-source tool names in kit docs', negative_control: { check: 'document-contracts.cjs', red_receipt: 'r-77' }, suite_wired: true }],
  ['feedback-record', false, { id: 'FB-002', received_at: at, from: 'owner@example.com', verbatim: 'x', scope: 'one-off', disposition: 'enforced', ruling_ref: 'D1', invariant: 'y', negative_control: { check: 'c', red_receipt: 'r' }, suite_wired: false }],
  ['feedback-record', false, { id: 'FB-003', received_at: at, from: 'owner@example.com', verbatim: 'x', scope: 'one-off', disposition: 'ruled' }],
  // AM-6: round ledger and rulings index.
  ['rounds-ledger', true, { gate: 'g-us', limits: { max_fix_rounds: 3, max_review_rounds: 3 }, cycles: [{ cycle: 1, started_at: at, eval_rounds: 3, review_rounds: 3, ended: 'cap-reached' }, { cycle: 2, started_at: at, eval_rounds: 1, review_rounds: 1, ended: 'passed', continuation_ref: 'EX-004', authorized_by: 'po@example.com' }] }],
  ['rounds-ledger', false, { gate: 'g-us', limits: { max_fix_rounds: 3, max_review_rounds: 3 }, cycles: [{ cycle: 2, started_at: at, eval_rounds: 0, review_rounds: 0, ended: 'running' }] }],
  ['rulings-index', true, { version: '1', adapter: 'project', items: [{ id: 'D85', subject: 'page header CTA', scope: 'all screens', date: '2026-09-01', status: 'superseded', text_ref: 'design/rulings.json#D85' }, { id: 'D190', subject: 'page header CTA', scope: 'all screens', date: '2026-10-01', status: 'active', supersedes: ['D85'], non_waivable: false, text_ref: 'design/rulings.json#D190' }] }],
  ['rulings-index', false, { version: '1', adapter: 'project', items: [{ id: 'D85', subject: 'page header CTA', scope: 'all', date: '2026-09-01', status: 'active' }] }],
];
let failed = 0;
for (const [name, expectValid, data] of cases) {
  const ok = ajv.validate(id(name), data);
  if (ok !== expectValid) {
    failed += 1;
    console.error(`MISMATCH ${name} expected ${expectValid} got ${ok}`, JSON.stringify(ajv.errors));
  }
}
if (failed) { console.error(`AM-4 schemas: ${failed}/${cases.length} cases wrong`); process.exit(1); }
console.log(`AM-4 schemas: ${cases.length}/${cases.length} positive/RED cases as expected`);
