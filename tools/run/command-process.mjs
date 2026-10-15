import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {RUNNER_TIMEOUT_MS} from './agent-timeouts.mjs';
import {processTree} from './process-tree.mjs';
import {hashes, inventory, localPath, writeLocal, RunnerError} from '../lib/config/path-selection.mjs';
import {canonical} from '../lib/config/strict-json.mjs';

// CLI argv parsing, not shell evaluation: no implicit Bash/runtime dependency.
export function commandArgv(command) {
  const args = []; let value = '', quote = '', started = false;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (ch === '\\' && quote !== "'") {
      if (i + 1 === command.length) throw new RunnerError(`Trailing command escape: ${command}`);
      value += command[++i]; started = true;
    } else if (quote) { if (ch === quote) quote = ''; else value += ch; started = true; }
    else if (ch === '"' || ch === "'") { quote = ch; started = true; }
    else if (/\s/.test(ch)) { if (started) { args.push(value); value = ''; started = false; } }
    else { value += ch; started = true; }
  }
  if (quote) throw new RunnerError(`Unclosed command quote: ${command}`);
  if (started) args.push(value);
  if (!args.length || !args[0]) throw new RunnerError('Empty command');
  return args;
}
export async function runCommand(command, {cwd, input = '', append = [], timeout = RUNNER_TIMEOUT_MS} = {}) {
  const [executable, ...args] = commandArgv(command);
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, [...args, ...append], {cwd, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'], env: {...process.env}});
    // Decode across chunk boundaries; split zero-width UTF-8 is still invisible.
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    let stdout = '', stderr = '', timedOut = false, overflow = false, interrupted = false;
    const tree = child.pid ? processTree(child.pid) : null;
    let termination = null;
    const terminate = () => { termination ??= tree?.terminate() ?? Promise.resolve(); };
    const interrupt = () => { interrupted = true; terminate(); };
    process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
    const cleanup = () => {clearTimeout(timer); tree?.stop(); process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);};
    const timer = setTimeout(() => { timedOut = true; terminate(); }, timeout);
    const collect = (kind, chunk) => {
      if (overflow) return;
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) + Buffer.byteLength(chunk) > 8 * 1024 * 1024) { overflow = true; terminate(); return; }
      if (kind === 'out') stdout += chunk; else stderr += chunk;
    };
    child.stdout.on('data', chunk => collect('out', chunk));
    child.stderr.on('data', chunk => collect('err', chunk));
    child.stdin.on('error', error => { if (error.code !== 'EPIPE') reject(error); });
    child.on('error', error => { cleanup(); reject(new RunnerError(`Command not runnable: ${command}: ${error.code}`, 4)); });
    child.on('close', async (code, signal) => {
      clearTimeout(timer);
      if (termination) await termination;
      cleanup();
      resolve({stdout, stderr, code, signal, timedOut, overflow, interrupted, pid: child.pid, command});
    });
    child.stdin.end(input);
  });
}
// One shared scrubber for every stored or printed agent/eval stream. Order matters: whole-block and
// header shapes first, then bare tokens, then `name = value` assignments (which also catch the rest).
const REDACTED = '[REDACTED]';
// No leading class: the unmatched prefix is kept as-is, and a leading `[...]*` would backtrack quadratically on long words.
const SECRET_NAME = '(?:api[_-]?key|[_-]key|token|secret|password|passwd|passphrase|credential)[A-Za-z0-9_.-]{0,40}';
// Block scalar: `secret: |`, `|2`, `>-` (LF or CRLF) hides every following line indented deeper than the key,
// across blank lines, and stops where the indentation decreases. BLOCK_CAP bounds a block with no end.
const BLOCK_CAP = 256 * 1024;
const BLOCK_START = new RegExp(`${SECRET_NAME}["']?\\s*[:=]\\s*[|>][0-9+-]{0,3}[ \\t]*(?:[ \\t]#[^\\n]*)?\\r?\\n`, 'gi');
function redactBlockScalars(text) {
  let out = '', last = 0, match;
  BLOCK_START.lastIndex = 0;
  while ((match = BLOCK_START.exec(text))) {
    const lineStart = text.lastIndexOf('\n', match.index) + 1;
    const keyIndent = /^[ \t]*/.exec(text.slice(lineStart, match.index))[0].length;
    let position = match.index + match[0].length, end = position;
    const limit = Math.min(text.length, position + BLOCK_CAP);
    while (position < limit) {
      const newline = text.indexOf('\n', position);
      const lineEnd = newline === -1 ? text.length : newline + 1;
      const line = text.slice(position, lineEnd);
      if (/^[ \t\r\n]*$/.test(line)) { position = lineEnd; continue; }
      if (/^[ \t]*/.exec(line)[0].length <= keyIndent) break;
      position = lineEnd; end = position;
    }
    out += text.slice(last, match.index) + match[0].replace(/[|>][0-9+-]{0,3}[ \t]*(?:[ \t]#[^\n]*)?\r?\n$/, '') + REDACTED + '\n';
    last = end; BLOCK_START.lastIndex = end;
  }
  return out + text.slice(last);
}
const REDACTION_RULES = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, REDACTED],
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s\/@]+@/gi, `$1${REDACTED}@`],
  [/(\bauthorization["']?\s*[:=]\s*(?:(?:Bearer|Basic|Token|Digest|Negotiate)\s+)?)(?:"[^"\n]*"|'[^'\n]*'|[^\s"']+)/gi, `$1${REDACTED}`],
  [/\b(Bearer\s+)(?:"[^"\n]*"|'[^'\n]*'|[A-Za-z0-9._~+\/=-]{8,})/gi, `$1${REDACTED}`],
  [/\b(Basic\s+)(?=[A-Za-z0-9+\/]*[0-9+\/=])[A-Za-z0-9+\/]{12,}={0,2}/g, `$1${REDACTED}`],
  [/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{20,})\b/g, REDACTED],
  redactBlockScalars,
  // Quoted value, possibly spanning lines or containing spaces, then an unquoted value.
  [new RegExp(`(${SECRET_NAME}["']?\\s*[:=]\\s*)(?:"(?:[^"\\\\]|\\\\.){0,4096}"|'[^']{0,4096}'|\`[^\`]{0,4096}\`)`, 'gi'), `$1${REDACTED}`],
  [new RegExp(`(${SECRET_NAME}["']?\\s*[:=]\\s*)["'\`]?[^\\s"'\`]+`, 'gi'), `$1${REDACTED}`],
];
export function redact(text) {
  return REDACTION_RULES.reduce((out, rule) => typeof rule === 'function' ? rule(out) : out.replace(rule[0], rule[1]), String(text ?? ''));
}
export function commandFailed(result) { return result.timedOut || result.overflow || result.interrupted || result.signal || result.code === null; }
export async function freshReview(root, command, prompt, files, options = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-driven-review-'));
  try {
    // Only declared sources/outputs are copied. The reviewer has a fresh cwd,
    // no private writer logs/chat, and cannot alter the original via relative paths.
    for (const relative of files) writeLocal(temp, relative, fs.readFileSync(localPath(root, relative)));
    const before = hashes(temp, inventory(temp));
    const result = await runCommand(command, {cwd: temp, input: prompt, timeout: options.timeout});
    const after = hashes(temp, inventory(temp));
    if (canonical(before) !== canonical(after)) throw new RunnerError('Reviewer mutated its read-only input snapshot', 4);
    return result;
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
}
