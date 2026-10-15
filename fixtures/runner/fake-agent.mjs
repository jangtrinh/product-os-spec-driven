import fs from 'node:fs';

const input = fs.readFileSync(0, 'utf8');
const options = JSON.parse(process.argv[2] ?? '{}');
if (options.delay) await new Promise(resolve => setTimeout(resolve, options.delay));
if (options.exit) { process.stderr.write('fixture tool refusal\n'); process.exit(options.exit); }
if (options.mutate) fs.writeFileSync(options.mutate, 'unauthorized reviewer edit');
if (options.rawResult !== undefined) { process.stdout.write(options.rawResult); process.exit(0); }
if (options.evalCapture) fs.appendFileSync(options.evalCapture, JSON.stringify({file: process.argv.at(-1), pid: process.pid}) + '\n');
if (options.eval) {
  const file = process.argv.at(-1);
  const content = fs.readFileSync(file, 'utf8');
  process.stdout.write(`checked 1 ${file}\n`);
  process.exit(content.includes(options.reject ?? 'defect') ? 1 : 0);
}
if (input.includes('READ-ONLY INDEPENDENT REVIEW')) {
  const verdict = options.verdict ?? 'PASS';
  const score = verdict === 'FAIL' ? 0 : verdict === 'NEEDS_CHANGES' ? 1 : 2;
  const criteria = options.criteria ?? [{id: 'source', mandatory: true, score, evidence: 'Original source/AC and final output in supplied snapshot'}];
  const findings = options.findings ?? [];
  process.stdout.write(`VERDICT: ${verdict}\n\`\`\`review-data\n${JSON.stringify({criteria, findings})}\n\`\`\`\nPID: ${process.pid}\n`);
} else {
  const stage = /^STAGE: ([a-z]+)$/m.exec(input)?.[1];
  const outputs = JSON.parse(/^DECLARED OUTPUTS: (.+)$/m.exec(input)[1]);
  let text = options.text ?? `Generated ${stage}\n`;
  if (options.badUntilFix) text = input.includes('CHANGE REQUEST / REPAIR:\nEval failures:') ? `Generated ${stage}\n` : 'defect\n';
  if (options.capture) fs.appendFileSync(options.capture, JSON.stringify({stage, input, pid: process.pid}) + '\n');
  if (outputs.length === 1) process.stdout.write(text);
  else process.stdout.write(`\`\`\`files\n${JSON.stringify(Object.fromEntries(outputs.map(file => [file, text])))}\n\`\`\`\n`);
}
