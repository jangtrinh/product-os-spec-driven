export const shellQuote = value => /^[A-Za-z0-9_./:@-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
// The next run must use the pins the project already runs with; the defaults apply only before any run recorded pins.
export function runCommand(project, pins, configPath = 'config/pipeline.yaml') {
  const config = configPath === 'config/pipeline.yaml' ? '' : ` --config ${shellQuote(configPath)}`;
  const usable = key => typeof pins?.[key] === 'string' && pins[key].trim() ? pins[key] : null;
  return `node tools/run/run.mjs --project ${shellQuote(project)}${config} --head ${shellQuote(usable('head') ?? 'fresh-source')} --build ${shellQuote(usable('build') ?? 'not-built')}`;
}
export function continuationCommand(project, stage, configPath = 'config/pipeline.yaml') {
  const config = configPath === 'config/pipeline.yaml' ? '' : ` --config ${shellQuote(configPath)}`;
  return `node tools/run/decide.mjs --project ${shellQuote(project)}${config} --stage ${stage} --as <your-po-email> --continue --reason "<text>"`;
}
export function printDecisionCommands(project, stage, gate, print, configPath = 'config/pipeline.yaml') {
  const config = configPath === 'config/pipeline.yaml' ? '' : ` --config ${shellQuote(configPath)}`;
  const start = `node tools/run/decide.mjs --project ${shellQuote(project)}${config} --stage ${stage} --as <your-po-email>`;
  const minors = gate.data.review.findings.filter(row => row.severity === 'Minor' && row.disposition === 'open');
  print(`${start} --approve${minors.map(row => ` --accept-minor ${shellQuote(row.id)} --reason "<reason>" --follow-up "<follow-up>"`).join('')}`);
  print(`${start} --request-changes "<text>"`);
}
