import { digest } from '../../lib/digests.mjs';

/* Canonical SHA-256 of the reader content. The skin contract compares this digest of the parsed content before and after the skin runs. */
export const contentDigest = (data) => digest(data);
