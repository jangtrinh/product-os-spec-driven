import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {sha256} from '../lib/config/path-selection.mjs';

const file=path.resolve(process.argv[2]);
const bytes=fs.readFileSync(file), result=JSON.parse(bytes);
const directory=path.resolve('evals/results/evidence');
const lines=[
  'P7 EVAL HARNESS — ACTUAL RECORDED CLI/STATE',
  `Result: ${path.basename(file)}`,
  `Revision: ${result.revision}`,
  `Result SHA-256: ${sha256(bytes)}`,
  `Harness: ${result.coverage.harness_cases.passed}/${result.coverage.harness_cases.selected}`,
  `Completed pipeline: ${result.coverage.cases.passed}/${result.coverage.cases.selected}`,
  `Quality AC: 0/${result.coverage.quality_ac.denominator}; model/browser NOT_RUN or BLOCKED`,
  ...result.cases.map(row=>`${row.id}: harness ${row.harness?.status}; pipeline ${row.pipeline?.status}; exit ${row.pipeline?.exit}; quality ${row.quality?.status}`),
  'UIUX PENDING / not-built refusal retained; no product quality acceptance',
];
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
fs.mkdirSync(directory,{recursive:true});
const svg=path.join(directory,'eval-state.svg'),png=path.join(directory,'eval-state.png');
fs.writeFileSync(svg,`<svg xmlns="http://www.w3.org/2000/svg" width="1450" height="${lines.length*30+50}"><rect width="100%" height="100%" fill="#111827"/><g font-family="Menlo,monospace" font-size="17" fill="#e5e7eb">${lines.map((line,index)=>`<text x="24" y="${35+index*30}">${escape(line)}</text>`).join('')}</g></svg>`);
execFileSync('magick',[svg,png]);
const version=execFileSync('magick',['-version'],{encoding:'utf8'}).split('\n')[0];
fs.writeFileSync(path.join(directory,'eval-state-provenance.json'),JSON.stringify({kind:'Structured CLI/state output render; not a browser screenshot',input:file,input_sha256:sha256(bytes),renderer:version,png,png_sha256:sha256(fs.readFileSync(png)),at:new Date().toISOString()},null,2)+'\n');
console.log(png);
