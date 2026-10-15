import {selectFiles, writeLocal, RunnerError} from '../lib/config/path-selection.mjs';
import {randomUUID} from 'node:crypto';
import {runCommand, commandFailed, redact} from './command-process.mjs';
import {classifyObservation, observationLog} from './output-observation.mjs';

export async function evaluate(root, config, stage, options, record) {
  const results = []; let failed = false;
  for (const entry of config.evals[stage]) {
    const selection = entry.per_file ? selectFiles(root, entry.per_file) : [null];
    for (const file of selection) {
      const command = file ? `${entry.run} ${JSON.stringify(file)}` : entry.run;
      const result = await runCommand(entry.run, {cwd: root, append: file ? [file] : [], timeout: options.timeout});
      const report = `review/log/${stage}-eval-${record.rounds.eval_fix}-${results.length}-${randomUUID()}.txt`;
      writeLocal(root, report, observationLog(redact(result.stdout), redact(result.stderr), result));
      if (commandFailed(result) || [2, 126, 127].includes(result.code)) throw new RunnerError(`Eval tool failure: ${command}; see ${report}`, 4);
      const observation = classifyObservation([result.stdout, result.stderr]);
      if (!observation.observed) throw new RunnerError(`Missing evaluator observation (actual exit ${result.code}): ${observation.reason}; ${command}; inspect ${report}`, 4);
      results.push({command, exit_code: result.code, report});
      if (result.code !== 0) failed = true;
    }
  }
  return {results, failed};
}
