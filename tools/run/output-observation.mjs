// Remove VT sequences including their payloads, not just the ESC/C1 introducer.
// Unterminated control strings consume the remaining channel conservatively.
function terminalText(source) {
  let result = '';
  for (let at = 0; at < source.length;) {
    const code = source.charCodeAt(at++);
    let kind = code;
    if (code === 0x1b) {
      if (at === source.length) break;
      kind = source.charCodeAt(at++);
    }
    if (kind === 0x9b || code === 0x1b && kind === 0x5b) {
      while (at < source.length) {
        const byte = source.charCodeAt(at++);
        if (byte >= 0x40 && byte <= 0x7e || byte === 0x18 || byte === 0x1a) break;
      }
    } else if ([0x90, 0x98, 0x9d, 0x9e, 0x9f].includes(kind) || code === 0x1b && [0x50, 0x58, 0x5d, 0x5e, 0x5f].includes(kind)) {
      const osc = kind === 0x9d || kind === 0x5d;
      while (at < source.length) {
        const byte = source.charCodeAt(at++);
        if (byte === 0x9c || byte === 0x18 || byte === 0x1a || osc && byte === 0x07) break;
        if (byte === 0x1b && source.charCodeAt(at) === 0x5c) { at++; break; }
      }
    } else if (code === 0x1b) {
      // ESC intermediate bytes plus a final byte (charset/cursor controls).
      while (kind >= 0x20 && kind <= 0x2f && at < source.length) kind = source.charCodeAt(at++);
    } else result += source[at - 1];
  }
  return result.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/gu, '');
}

export function classifyObservation(source, {parse = null} = {}) {
  const channels = Array.isArray(source) ? source : [source];
  if (channels.some(text => typeof text !== 'string')) return {observed: false, text: '', reason: 'output is not text'};
  // Classify channels separately so an open stdout OSC cannot swallow stderr.
  const text = channels.map(terminalText).join('\n');
  const visible = text.replace(/[\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Cf}\u0000-\u001f\u007f-\u009f]/gu, '');
  if (!visible.length) return {observed: false, text, reason: 'no visible characters after removing terminal controls, Unicode whitespace and zero-width characters'};
  try { return {observed: true, text, value: parse ? parse(text) : undefined, reason: null}; }
  catch (error) { return {observed: false, text, reason: `declared result does not parse: ${error.message}`, error}; }
}

export function observationLog(stdout, stderr, result) {
  const observation = classifyObservation([stdout, stderr]);
  return `OBSERVATION-CHANNELS v1\n${stdout}\n${stderr}\nchannels=${JSON.stringify([stdout, stderr])}\nobservation=${JSON.stringify(observation.reason)}\nexit=${result.code}; signal=${result.signal}; timeout=${result.timedOut}\n`;
}

export function loggedObservation(log) {
  const match = typeof log === 'string' && /^(.*)\nexit=(-?\d+); signal=null; timeout=false\n$/s.exec(log);
  if (!match) return {observed: false, reason: 'missing valid command log/exit'};
  const tagged = match[1].startsWith('OBSERVATION-CHANNELS v1\n');
  if (!tagged) return {...classifyObservation(match[1]), exit: Number(match[2])};
  const frame = /^(.*)\nchannels=([^\n]*)\nobservation=([^\n]*)$/s.exec(match[1].slice('OBSERVATION-CHANNELS v1\n'.length));
  if (!frame) return {observed: false, reason: 'missing command observation frame'};
  try {
    const channels = JSON.parse(frame[2]);
    if (!Array.isArray(channels) || channels.length !== 2 || channels.some(text => typeof text !== 'string') || frame[1] !== channels.join('\n')) throw new Error('channel bytes mismatch');
    const classified = classifyObservation(channels);
    if (JSON.parse(frame[3]) !== classified.reason) throw new Error('observation reason mismatch');
    return {...classified, exit: Number(match[2])};
  } catch (error) { return {observed: false, reason: `invalid command observation frame: ${error.message}`}; }
}
