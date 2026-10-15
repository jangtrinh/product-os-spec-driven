export const observationControls = [
  ['ANSI-only', '\u001b[0m\u001b[32m\u001b[0m'],
  ['OSC-title-only', '\u001b]0;window title\u0007'],
  ['whitespace-zero-width', ' \t\n\u0085\u00a0\u200b\u200c\u200d\u2060\u2028\u3000'],
  ['BOM-only', '\ufeff'],
  ['lone-CR', '\r'],
  ['hidden-PASS', '\u001b]0;PASS\u001b\\'],
  ['C1-CSI-cursor', '\u009b2J\u009b1;1H'],
  ['C1-OSC-title', '\u009d0;PASS\u009c'],
  ['DCS-hidden-PASS', '\u001bPPASS\u001b\\'],
  ['OSC-unterminated', '\u001b]0;PASS'],
  ['C0-C1-only', '\u0000\u0007\u0008\u001f\u007f\u0080\u009f'],
];
