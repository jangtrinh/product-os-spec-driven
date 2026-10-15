import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {packetProject} from '../../../fixtures/reader/packet-project.mjs';
import {generate} from '../packet.mjs';
import {chromiumOrNull, NO_BROWSER} from './helpers.mjs';

async function open(t, {mismatch = false, pending = false, failure = false} = {}) {
  const p = packetProject(t), out = path.join(p.root, 'generated');
  generate({spec: p.spec, project: p.root, config: 'config/pipeline.yaml', changeSet: p.changeSet.id, out});
  const file = path.join(out, 'index.html');
  if (mismatch) fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/data-data-sha="[a-f0-9]+"/, `data-data-sha="${'0'.repeat(64)}"`));
  const chromium = chromiumOrNull(); assert.ok(chromium, NO_BROWSER);
  const browser = await chromium.launch(); t.after(() => browser.close());
  const page = await (await browser.newContext({acceptDownloads: true})).newPage();
  if (pending || failure) await page.addInitScript(({failure}) => {
    Object.defineProperty(crypto.subtle, 'digest', {value: () => failure ? Promise.reject(new Error('Digest unavailable in this control')) : new Promise(() => {})});
  }, {failure});
  let downloads = 0; page.on('download', () => {downloads++;});
  await page.goto(`file://${file}`);
  await page.check('input[name="default"][value="approve"]'); await page.fill('#by', 'po@example.test'); await page.fill('#reason', 'Review current source');
  return {page, downloads: () => downloads};
}
async function noExport(page, downloads) {
  assert.equal(await page.isDisabled('#export'), true);
  await page.$eval('#export', el => el.click());
  await page.waitForTimeout(350);
  assert.equal(downloads(), 0); assert.equal(await page.textContent('#decision-preview'), '');
  assert.equal(await page.isVisible('#preview-box'), false);
}
test('export starts disabled while digest and source verification are pending', async t => {
  const {page, downloads} = await open(t, {pending: true}); await noExport(page, downloads);
  assert.match(await page.textContent('#export-status'), /verif|checking/i);
});
test('digest mismatch visibly warns and disables export without download or preview', async t => {
  const {page, downloads} = await open(t, {mismatch: true});
  await page.waitForFunction(() => document.querySelector('#digest-check').dataset.tone);
  assert.equal(await page.getAttribute('#digest-check', 'data-tone'), 'bad');
  assert.equal(await page.isVisible('#digest-check'), true);
  assert.match(await page.textContent('#digest-check'), /export.*disabled|disabled.*export/i);
  await noExport(page, downloads);
});
test('digest computation failure warns and leaves export disabled', async t => {
  const {page, downloads} = await open(t, {failure: true});
  await page.waitForFunction(() => document.querySelector('#digest-check').dataset.tone);
  assert.match(await page.textContent('#digest-check'), /export.*disabled|disabled.*export/i);
  await noExport(page, downloads);
});
test('matched digest and sources enable ordinary decision export', async t => {
  const {page} = await open(t);
  await page.waitForFunction(() => document.querySelector('#digest-check').dataset.tone === 'ok' && document.querySelector('#binding-check').dataset.tone === 'ok');
  assert.equal(await page.isDisabled('#export'), false);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  assert.match(download.suggestedFilename(), /batch-decision/); assert.equal(await page.isVisible('#preview-box'), true);
});
