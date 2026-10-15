import fs from 'node:fs';
import path from 'node:path';
import { parseWireframes } from '../../lib/wireframe-model.mjs';
import { localPath } from '../../lib/local-path.mjs';
import { PROTOTYPE_FILE, PROTOTYPE_PAGE } from '../../lib/defaults.mjs';

/* The two design stages of the kit get their own group in the reader: the ASCII wireframes page (a source page the kit
   writes at wireframe/wireframes.md) and the click-through prototype (prototype/index.html, shown in a frame). */
export const STAGES_ARTIFACT = 91;
export const STAGES_TIER = { id: 'design', name: 'Wireframes & prototype', audience: 'PO · Designer · Dev', status: 'Generated', purpose: 'Every screen and state drawn as ASCII, then as a click-through prototype. Each one names the user stories and acceptance criteria it serves.' };
export const WIREFRAME_FILE = 'wireframe/wireframes.md';
export { PROTOTYPE_FILE, PROTOTYPE_PAGE };

const ID_IN_TEXT = /(?:US-(?:P\d+|\d+)|NF-\d+)(?:\.AC-\d+)?/g;
const decode = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const plain = (s) => decode(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

/* HTML comments end at "-->" or "--!>" (the tokenizer rule parsePrototype follows); an unclosed comment eats the rest. */
function commentEnd(raw, from) {
  const re = /--!?>/g;
  re.lastIndex = from;
  const m = re.exec(raw);
  return m ? m.index + m[0].length : raw.length;
}

/* Walks the prototype source with the tokenizer rules of the prototype lint (same tag pattern, comments and raw-text elements are skipped)
   and writes the source line of every start tag into data-src-line. The attribute goes inside the tag, so no line moves.
   Returns the annotated html, the start tags found and the screens (section ids SCR-nnn--state). */
export function annotatePrototype(raw) {
  const tags = /<!--|<(\/)?([a-z][^\t\n\f\r />]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/gi;
  const rawText = new Set(['style', 'script', 'title', 'textarea', 'xmp']);
  let out = '', cursor = 0, line = 1, skipUntil = null, count = 0, m;
  const sections = [];
  while ((m = tags.exec(raw))) {
    const before = raw.slice(cursor, m.index);
    out += before;
    line += (before.match(/\n/g) || []).length;
    const tokenLine = line;
    if (m[0] === '<!--' && !skipUntil) {
      const end = commentEnd(raw, tags.lastIndex);
      out += raw.slice(m.index, end);
      line += (raw.slice(m.index, end).match(/\n/g) || []).length;
      cursor = end; tags.lastIndex = end; continue;
    }
    line += (m[0].match(/\n/g) || []).length;
    cursor = m.index + m[0].length;
    if (m[0] === '<!--') { out += m[0]; continue; }
    const closing = Boolean(m[1]), name = m[2].toLowerCase();
    if (skipUntil) { out += m[0]; if (closing && name === skipUntil) skipUntil = null; continue; }
    if (closing) { out += m[0]; continue; }
    if (rawText.has(name)) skipUntil = name;
    const attrs = m[3];
    if (/\sdata-src-line\s*=/i.test(attrs)) { out += m[0]; continue; }
    out += `<${m[2]} data-src-line="${tokenLine}"${attrs}>`;
    count += 1;
    if (name === 'section') {
      const id = /\sid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
      sections.push({ id: id ? decode(id[1] ?? id[2] ?? id[3]) : '', line: tokenLine, rawAt: m.index });
    }
  }
  out += raw.slice(cursor);
  return { html: out, tags: count, sections };
}

/* Screens of the prototype: one per section id SCR-nnn--state, with its title (the frame heading) and the ids of its trace line. */
export function prototypeScreens(raw, annotated, wireframeScreens) {
  const byScreen = new Map((wireframeScreens || []).map((s) => [s.id, s]));
  const marks = annotated.sections.filter((s) => /^SCR-\d{3,}--(?:normal|empty|error|loading)$/.test(s.id));
  const sectionText = (mark) => raw.slice(mark.rawAt, (raw.indexOf('</section>', mark.rawAt) + 1 || raw.length + 1) - 1);
  return marks.map((s) => {
    const [screen, state] = s.id.split('--');
    const body = sectionText(s);
    const title = plain((/<h3\b[^>]*>([\s\S]*?)<\/h3>/i.exec(body) || [, ''])[1]) || (byScreen.get(screen) || {}).title || '';
    const trace = (/<p\b[^>]*class\s*=\s*["'][^"']*\btrace\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i.exec(body) || [, ''])[1];
    let related = [...new Set(plain(trace).match(ID_IN_TEXT) || [])];
    if (!related.length && byScreen.get(screen)) related = [...new Set([...byScreen.get(screen).us, ...byScreen.get(screen).ac])];
    return { id: s.id, screen, state, title, line: s.line, related };
  });
}

/* Applies the group to the wireframes page and returns what the reader needs about the stages.
   pages: the source pages (mutated: the wireframes page moves to the stages group); spec: loaded spec; date: fallback page date. */
export function buildStages(pages, spec, date) {
  const wf = pages.find((p) => p.rel === WIREFRAME_FILE);
  let wireframes = null;
  if (wf) {
    const parsed = parseWireframes(wf.md);
    wireframes = { screens: parsed.screens, flows: parsed.flows.map(({ us, path: p, steps, valid }) => ({ us, path: p, steps, valid })), states: parsed.states.map(({ screen, state }) => ({ screen, state })) };
    Object.assign(wf, { artifact: STAGES_ARTIFACT, tier: STAGES_TIER.id, group: '', kind: 'wireframes', sort: '0-1', stage: wireframes, audience: '', label: wf.label });
  }
  let prototype = null, page = null;
  if (spec.files.includes(PROTOTYPE_FILE)) {
    const raw = fs.readFileSync(localPath(spec.root, PROTOTYPE_FILE), 'utf8');
    const annotated = annotatePrototype(raw);
    const screens = prototypeScreens(raw, annotated, wireframes && wireframes.screens);
    prototype = { file: PROTOTYPE_FILE, html: annotated.html, lines: raw.split('\n').length, screens };
    page = {
      id: PROTOTYPE_PAGE, title: 'Prototype', label: 'Prototype', md: '', fm: '', rel: `generated/${PROTOTYPE_PAGE}`, artifact: STAGES_ARTIFACT, tier: STAGES_TIER.id, group: '', generated: true, kind: 'prototype', sort: '0-2',
      owner: '', status: 'Generated', trace: { a: [], d: [], req: [], us: [], ac: [] }, imgRoles: {}, updated: (wf && wf.updated) || date,
    };
  }
  return { wireframe: wf ? wf.id : null, prototype, prototypePage: page, wireframes };
}
