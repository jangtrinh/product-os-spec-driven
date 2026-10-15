#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {pinsFor, resultDiff, requestedCoverage} from './result-accounting.mjs';
import {selectedInputs,inputChanges} from './input-pins.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
export async function runEvalSuite(options={}) {
  const {runCase}=await import('./run-case.mjs');   // reaches fixtures/, which only the kit checkout has
  if (options.fake && options.agent) throw new Error('--fake and --agent are mutually exclusive');
  const casesRoot=fs.realpathSync(path.resolve(options.casesRoot??path.join(repo,'evals/cases')));
  const results=path.resolve(options.results??path.join(repo,'evals/results'));
  const names=fs.readdirSync(casesRoot,{withFileTypes:true}).filter(row=>row.isDirectory()).map(row=>row.name).sort();
  const selected=options.cases??names;
  if (!selected.length || new Set(selected).size!==selected.length || selected.some(id=>!names.includes(id))) throw new Error('Case selection must be nonempty, unique and present');
  fs.mkdirSync(results,{recursive:true});
  const priorFiles=fs.readdirSync(results).filter(file=>/^\d{4}-.*\.json$/.test(file)).sort();
  const previous=priorFiles.length?JSON.parse(fs.readFileSync(path.join(results,priorFiles.at(-1)),'utf8')):null;
  const git=spawnSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'});
  if (git.status!==0) throw new Error('Cannot pin repository HEAD');
  const head=git.stdout.trim(), pins=pinsFor(repo);
  const execution_inputs=selectedInputs(casesRoot,selected);
  const requested={};
  for(const name of selected) {
    try {requested[name]=requestedCoverage(path.join(casesRoot,name));}
    catch(error) {requested[name]={status:'UNKNOWN',reason:error.message};}
  }
  const timestamp=new Date().toISOString().replaceAll(':','-');
  const result={version:1,at:new Date().toISOString(),revision:head,model:options.agent??null,mode:options.fake?'fake':options.agent?'agent':'manual',pins,execution_inputs,cases:[],
    capability_limits:{jev:'NOT_RUN: director morning ruling',laya:'NOT_RUN: director morning ruling',independent_grader:'NOT_RUN: separate later Dispatch required'}};
  for (const name of selected) {
    let row;
    const observedInputs=selectedInputs(casesRoot,[name]).cases[name];
    try { row=await runCase(repo,path.join(casesRoot,name),{...options,head}); }
    catch(error) {row={id:name,status:'BLOCKED',error:error.message,commands:[],review:{status:'NOT_RUN'},browser:{status:'NOT_RUN'}};}
    row.execution_inputs=observedInputs;
    row.requested_coverage=requested[name];
    row.observed_coverage=row.coverage??null;
    if(row.coverage&&requested[name].ac) {
      const members=value=>({ac:value.ac.ids,scenarios:value.scenarios.items.map(item=>item.id),scopes:value.scope.ids});
      if(JSON.stringify(members(row.coverage))!==JSON.stringify(members(requested[name]))) {
        row.membership_error='Observed output removed or changed requested AC/SCN/scope membership';
        row.harness.status='FAIL';
      }
    }
    // Failed traversal and unavailable quality cannot evict requested members.
    row.coverage=requested[name];
    result.cases.push(row);
  }
  const after=pinsFor(repo);
  result.input_changes=inputChanges(execution_inputs,selectedInputs(casesRoot,selected));
  const toolsChanged=JSON.stringify(after)!==JSON.stringify(pins);
  result.pin_freshness=!toolsChanged&&!result.input_changes.length?'CURRENT':'STALE';
  for(const row of result.cases) row.pin_freshness=toolsChanged||result.input_changes.some(change=>change.case_id===row.id)?'STALE':'CURRENT';
  result.findings=result.cases.flatMap(row=>[
    ...(row.harness?.status==='PASS'?[]:[`${row.id}: ${row.status}${row.error?`: ${row.error}`:''}`]),
    ...(row.expected?.rows.filter(item=>!item.passed).map(item=>`${row.id}: ${item.id} ${item.file}`)??[]),
    ...(row.red_controls?.filter(item=>item.status!=='PASS').map(item=>`${row.id}: ${item.id}`)??[]),
    ...(row.behavior?.status==='FAIL'?[`${row.id}: ${row.behavior.diagnostic}`]:[]),
    ...(row.membership_error?[`${row.id}: ${row.membership_error}`]:[]),
  ]);
  if(result.pin_freshness==='STALE') result.findings.push('Input/tool pins changed during evaluation');
  result.coverage={cases:{passed:result.cases.filter(row=>row.pipeline?.completed===true).length,selected:selected.length,total:names.length},
    harness_cases:{passed:result.cases.filter(row=>row.harness?.status==='PASS').length,selected:selected.length,total:names.length},
    expected_items:{passed:result.cases.flatMap(row=>row.expected?.rows??[]).filter(row=>row.passed).length,total:result.cases.reduce((n,row)=>n+(row.expected?.total??0),0)},
    quality_ac:{passed:0,denominator:selected.every(id=>requested[id].ac)?selected.reduce((n,id)=>n+requested[id].ac.total,0):null,reason:'Requested members retained independently of traversal and quality; null means unreadable membership, never zero'},
    na:[],excluded_cases:names.filter(id=>!selected.includes(id)).map(id=>({id,reason:'Explicit --case selection'}))};
  result.diff=resultDiff(previous,result);
  result.result_path=path.join(results,`${timestamp}-${process.pid}.json`);
  fs.writeFileSync(result.result_path,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  const exit=result.findings.length?(!options.fake&&!options.agent&&result.cases.every(row=>row.status==='BLOCKED')?2:1):0;
  return {result,exit};
}
export function parseOptions(argv) {
  const options={};
  for(let i=0;i<argv.length;i++) {
    const flag=argv[i];
    if(flag==='--fake') {if(options.fake)throw new Error('Duplicate --fake');options.fake=true;}
    else if(['--agent','--cases-root','--results','--case'].includes(flag)) {
      const value=argv[++i];if(!value || value.startsWith('--'))throw new Error(`Missing ${flag}`);
      const key={'--agent':'agent','--cases-root':'casesRoot','--results':'results','--case':'cases'}[flag];
      if(key==='cases')(options.cases??=[]).push(value);else {if(options[key])throw new Error(`Duplicate ${flag}`);options[key]=value;}
    } else throw new Error(`Unknown option ${flag}`);
  }
  return options;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(!fs.existsSync(path.join(repo,'fixtures'))) {console.error('run-evals is a kit-only developer harness: it needs the kit fixtures/ folder, which a project does not contain. Run it from the kit checkout.');process.exit(2);}
  try {const {result,exit}=await runEvalSuite(parseOptions(process.argv.slice(2)));console.log(`Harness ${result.coverage.harness_cases.passed}/${result.coverage.harness_cases.selected}; pipeline ${result.coverage.cases.passed}/${result.coverage.cases.selected}; quality AC 0/${result.coverage.quality_ac.denominator}; model/browser NOT_RUN or BLOCKED; ${result.result_path}`);process.exitCode=exit;}
  catch(error){console.error(error.message);process.exitCode=3;}
}
