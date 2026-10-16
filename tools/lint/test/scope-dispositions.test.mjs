import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const scopeLabels = ['Trong phạm vi', 'Hoãn', 'Ngoài phạm vi'];

function lintContractTemplate(text) {
  return /### Hoãn\n- .+lý do.+xem lại khi.+nguồn/im.test(text) ? 0 : 1;
}

test('T1: scope-writing prompts expose exactly the three PO dispositions and deferred reason', () => {
  const clarify = read('prompts/clarify.md');
  const contract = read('prompts/contract.md');
  for (const label of scopeLabels) {
    assert.match(clarify, new RegExp(label));
    assert.match(contract, new RegExp(label));
  }
  assert.match(clarify, /status:\s*deferred/);
  assert.match(clarify, /reason/);
  assert.match(contract, /condition for revisiting|điều kiện.*xem lại/i);
});

test('T2: deferred contract example passes the template lint and a missing heading is red', () => {
  const template = read('templates/contract.md');
  assert.equal(lintContractTemplate(template), 0, 'template lint exits 1 when the deferred heading/example is absent');
  assert.equal(lintContractTemplate(template.replaceAll('### Hoãn', '### Đã hoãn')), 1, 'breaking the deferred heading makes template lint exit 1');
});
