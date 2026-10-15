import { createHash } from 'node:crypto';
export const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
export const hash=v=>createHash('sha256').update(v).digest('hex');
export const digest=v=>hash(canonical(v));
