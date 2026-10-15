// Explicit directory entrypoint keeps the documented Node 18+ command usable.
import fs from 'node:fs';
const directory = new URL('./', import.meta.url);
for (const file of fs.readdirSync(directory).filter(name => name.endsWith('.test.mjs')).sort()) {
  await import(new URL(file, directory));
}
