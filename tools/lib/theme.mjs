/* Theme tokens file: light values first, then a line holding only the dark marker, then the dark declarations without a selector. */
export const DARK_MARKER = '/* @dark */';

export function expandTheme(src) {
  const i = src.indexOf(DARK_MARKER);
  const light = i < 0 ? src : src.slice(0, i);
  const dark = i < 0 ? '' : src.slice(i + DARK_MARKER.length);
  if (!dark.trim()) return light;
  return `${light.trimEnd()}\n@media (prefers-color-scheme: dark) {\n:root:not([data-theme="light"]) {${dark}}\n}\n:root[data-theme="dark"] {${dark}}\n`;
}

/* All custom property names declared in a tokens file (light and dark parts). */
export const themeVarNames = (src) => [...new Set([...src.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]))];
