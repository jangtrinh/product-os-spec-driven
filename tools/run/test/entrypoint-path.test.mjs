import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';
test('symlinked runner entrypoint executes intake and returns the actual waiting exit',t=>{
 const p=projectFixture(t,['intake']);p.config.agents.writer.command='manual';p.save();
 const entry=path.join(p.root,'runner-link.mjs');fs.symlinkSync(fileURLToPath(new URL('../run.mjs',import.meta.url)),entry);
 const r=spawnSync(process.execPath,[entry,'--project',p.root,'--head','fresh','--build','not-built'],{encoding:'utf8',timeout:20000});
 assert.equal(r.status,2,r.stdout+r.stderr);assert.match(r.stdout,/STAGE: intake/);assert.match(r.stdout,/Manual writer pending/);
});
