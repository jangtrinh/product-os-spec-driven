/* Collects lint problems. Every problem names the file and line, a stable code, what is wrong and the fix to make. */
export class Problems {
  constructor() { this.list = []; }

  add(code, file, line, message, fix, severity = 'error') {
    this.list.push({ severity, code, file: file || '(spec)', line: line || 1, message, fix: fix || '' });
  }

  warn(code, file, line, message, fix) { this.add(code, file, line, message, fix, 'warning'); }

  get errors() { return this.list.filter((p) => p.severity === 'error'); }

  get warnings() { return this.list.filter((p) => p.severity === 'warning'); }

  format(p) { return `${p.file}:${p.line}: ${p.severity === 'error' ? 'ERROR' : 'WARNING'} [${p.code}] ${p.message}${p.fix ? `\n    fix: ${p.fix}` : ''}`; }
}
