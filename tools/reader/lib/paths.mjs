import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const READER_DIR = path.resolve(here, '..');
export const SHELL_DIR = path.join(READER_DIR, 'shell');
export const SHELL_SRC_DIR = path.join(READER_DIR, 'shell-src');
export const FORMAT_DIR = path.resolve(READER_DIR, '../../format');
