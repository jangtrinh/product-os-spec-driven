import path from 'node:path';

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/* Classifies a markdown link or image target written in the document at fromRel (spec-root-relative, posix).
   Returns { kind: 'external' | 'anchor' | 'file' | 'outside', rel, frag }. rel is spec-root-relative; frag has no leading #. */
export function resolveTarget(fromRel, target) {
  if (EXTERNAL.test(target)) return { kind: 'external', rel: '', frag: '' };
  if (target.startsWith('#')) return { kind: 'anchor', rel: fromRel, frag: decodeURIComponent(target.slice(1)) };
  const [file, ...rest] = target.split('#');
  const frag = rest.join('#');
  const clean = decodeURIComponent(file.split('?')[0]);
  if (clean.startsWith('/')) return { kind: 'outside', rel: clean, frag };
  const rel = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), clean));
  if (rel==='..' || rel.startsWith('../')) return { kind: 'outside', rel, frag };
  return { kind: 'file', rel, frag };
}

export const IS_WIREFRAME_PATH = /(^|\/)wireframes\//;
