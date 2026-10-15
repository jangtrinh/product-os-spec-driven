import {runCommand, commandFailed, redact} from '../run/command-process.mjs';
import {classifyObservation} from '../run/output-observation.mjs';

export const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
export const nodeCommand = (...args) => [process.execPath, ...args].map(quote).join(' ');
export async function observe(command, cwd, {input = '', timeout = 120000} = {}) {
  let result;
  try { result = await runCommand(command, {cwd, input, timeout}); }
  catch (error) { return {command, cwd, exit: null, status: 'BLOCKED', diagnostic: error.message, stdout: '', stderr: ''}; }
  const observation = classifyObservation(result.stdout + result.stderr);
  return {command, cwd, exit: result.code, status: commandFailed(result) || !observation.observed ? 'BLOCKED' : result.code === 0 ? 'PASS' : 'FAIL',
    signal: result.signal, timed_out: result.timedOut, diagnostic: observation.reason ?? null,
    stdout: redact(result.stdout), stderr: redact(result.stderr)};
}
