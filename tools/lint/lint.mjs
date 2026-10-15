#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseJson } from '../lib/json-strict.mjs';
import { localPath } from '../lib/local-path.mjs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { lintSpec } from './index.mjs';
import { parseYaml } from '../lib/config/yaml-parser.mjs';
import { selfTest } from './self-test.mjs';
import {STAGES} from '../lib/config/config-loader.mjs';
export function main(args=process.argv.slice(2)) {
  const options={};let root,json=false,self=false,invalid='';
  for(let i=0;i<args.length;i++) {
    const a=args[i];
    if(a==='--json') json=true;
    else if(a==='--self-test') self=true;
    else if(['--pipeline','--stage'].includes(a)) {if(!args[i+1] || args[i+1].startsWith('--')) invalid=`missing value ${a}`;else options[a.slice(2)]=args[++i];}
    else if(a.startsWith('-') || root) invalid=`unsupported argument ${a}`;
    else root=a;
  }
  if(options.stage && !STAGES.includes(options.stage)) invalid=`unknown stage ${options.stage}`;
  if(self && (root || Object.keys(options).length || json)) invalid='--self-test must be used alone';
  if(!root && !self) invalid ||= 'spec folder required';
  if(invalid) {
    const problem={file:'(cli)',line:1,severity:'error',code:'E-OPTION',message:invalid,fix:'node tools/lint/lint.mjs <spec> [--json] [--pipeline <config>] [--stage <stage>] | --self-test'};
    if(json) console.log(JSON.stringify({ok:false,problems:[problem],stats:{documents:0}}));else console.error(`${problem.file}:1: ERROR [E-OPTION] ${invalid}\nfix: ${problem.fix}\nchecked 0 documents; 1 error(s), 0 warning(s)`);
    return 2;
  }
  if(self) {
    // The self-test plants defects into kit fixtures; an initialized project ships tools/ but not fixtures/.
    if(!fs.existsSync(fileURLToPath(new URL('../../fixtures/v2/full/',import.meta.url)))) {console.error('--self-test is a kit-only developer check: it needs the kit fixtures/ folder, which a project does not contain. Run it from the kit checkout: node tools/lint/lint.mjs --self-test');return 2;}
    return selfTest()?0:1;
  }
  if(options.pipeline) {
    try {
      const pipeline=parseYaml(fs.readFileSync(options.pipeline,'utf8'),options.pipeline);
      options.pipelineConfig=pipeline;options.projectRoot=path.resolve(path.dirname(options.pipeline),'..');
      options.designRequired=(pipeline.stages?.design?.enabled===true || pipeline.stages?.uiux?.enabled===true) && (!options.stage || STAGES.indexOf(options.stage)>=STAGES.indexOf('design'));
    }catch(e){const p={file:options.pipeline,line:1,severity:'error',code:'E-INPUT',message:e.message,fix:'restore readable pipeline YAML'};if(json)console.log(JSON.stringify({ok:false,problems:[p],stats:{documents:0}}));else console.error(`${p.file}:1: ERROR [E-INPUT] ${p.message}\nfix: ${p.fix}\nchecked 0 documents; 1 error(s), 0 warning(s)`);return 2;}
  }
  const r=lintSpec(root,options),s=r.stats;
  if(json) console.log(JSON.stringify({ok:r.exitCode===0,problems:r.problems.list,stats:s},null,2));
  else {
    for(const p of r.problems.list) console.error(r.problems.format(p));
    for(const [code,c] of Object.entries(s.qRecords?.checks || {})) {
      if(c.status==='NOT_RUN')console.log(`${code}: NOT RUN (${c.reason})`);
      for(const key of ['rounds','thresholds','witness'])if(c[key]?.status==='NOT_RUN')console.log(`${code} ${key}: NOT RUN (${c[key].reason})`);
    }
    console.log(`Q-decision approvers/baseline: ${s.runtimeChecks.approversBaseline.status.replace('_',' ')} (${s.runtimeChecks.approversBaseline.records} records${options.pipeline?'':'; no --pipeline'}); current head/build: NOT RUN (runner only)`);
    for(const [id,c] of Object.entries(s.open.byUs)) console.log(`${id}: OPEN ${c.total}, blocking ${c.blocking}`);
    console.log(`checked ${s.documents} documents (${Object.entries(s.byType).map(([k,v])=>`${v} ${k}`).join(', ')}), ${s.requirements} REQ, ${s.stories} US, ${s.acceptanceCriteria} AC, ${s.decisions} decisions, ${s.amendments} amendments, ${s.images} images, ${s.boards} boards, ${s.scenarios} scenarios (${s.unassigned} unassigned), ${s.open.total} OPEN (${s.open.blocking} blocking); ${r.problems.errors.length} error(s), ${r.problems.warnings.length} warning(s)`);
  }
  return r.exitCode;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) process.exitCode=main();
