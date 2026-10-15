import fs from 'node:fs';
import {canonical, parseJson} from '../lib/config/strict-json.mjs';
import {localPath, sha256, writeLocal, RunnerError} from '../lib/config/path-selection.mjs';
import {classifyObservation} from './output-observation.mjs';
import {STAGES} from '../lib/config/config-loader.mjs';
import {stageInFlight} from './runtime-state.mjs';

// A --result belongs to exactly one open manual checkpoint. When one is open for another stage than the one about to
// run, refuse before that stage can spend a round on a result it can never match (exit 3).
export function assertResultOwner(root, config, stage, options) {
  if (!options.result || options.resultConsumed) return;
  const open = STAGES.filter(name => config.stages[name].enabled).map(name => {
    const relative = `review/manual/${name}.json`; const file = localPath(root, relative);
    if (!fs.existsSync(file) || !stageInFlight(root, name)) return null;
    const checkpoint = parseJson(fs.readFileSync(file, 'utf8'), relative);
    return checkpoint.result === null ? {stage: name, relative, phase: checkpoint.phase} : null;
  }).filter(Boolean);
  if (!open.length || open.some(row => row.stage === stage)) return;
  const [owner] = open;
  throw new RunnerError(`${stage}: --result ${options.result} belongs to the pending manual ${owner.phase} checkpoint ${owner.relative} of stage ${owner.stage}, but ${stage} must run first; no round was spent. Rerun without --result so ${stage} can proceed; ${owner.stage} keeps its checkpoint and is re-issued if its prompt changed.`, 3);
}

export async function manualAgent(root, stage, phase, round, prompt, inputHashes, options, print) {
  const relative = `review/manual/${stage}.json`; const file = localPath(root, relative);
  const prompt_sha256 = sha256(prompt); const input_sha256 = sha256(canonical(inputHashes));
  const previous = fs.existsSync(file) ? parseJson(fs.readFileSync(file, 'utf8'), relative) : null;
  const matching = previous && previous.phase === phase && previous.round === round && previous.prompt_sha256 === prompt_sha256 && previous.input_sha256 === input_sha256;
  if (options.result && !options.resultConsumed) {
    if (!matching) throw new RunnerError(`${relative}: --result does not match the pending prompt/input/phase`);
    const resultFile = localPath(root, options.result);
    if (!fs.existsSync(resultFile)) throw new RunnerError(`Missing/empty manual result: ${options.result}`);
    const text = fs.readFileSync(resultFile, 'utf8');
    const observation = classifyObservation(text);
    if (!observation.observed) throw new RunnerError(`Missing/empty manual result: ${options.result}; ${observation.reason}`);
    options.resultConsumed = true;
    writeLocal(root, relative, canonical({...previous, result: options.result}) + '\n');
    return {stdout: text, independent: phase === 'reviewer' && options.independentReview === true};
  }
  // --paste is the original convenience interface; unlike --result it can
  // accompany the first invocation. It is consumed once, never reused for review.
  if (options.paste && !options.resultConsumed && phase === 'writer') {
    const text = fs.readFileSync(localPath(root, options.paste), 'utf8');
    const observation = classifyObservation(text);
    if (!observation.observed) throw new RunnerError(`Empty manual result: ${options.paste}; ${observation.reason}`);
    options.resultConsumed = true;
    print(prompt);
    writeLocal(root, relative, canonical({stage, phase, round, prompt_sha256, input_sha256, result: options.paste}) + '\n');
    return {stdout: text, independent: false};
  }
  writeLocal(root, relative, canonical({stage, phase, round, prompt_sha256, input_sha256, result: null}) + '\n');
  print(prompt);
  print(`Manual ${phase}: save the response, rerun --result <project-relative-file>${phase === 'reviewer' ? ' --independent-review only after using a fresh chat' : ''}. Waiting at ${relative}`);
  throw new RunnerError(`Manual ${phase} pending: ${relative}`, 2);
}
