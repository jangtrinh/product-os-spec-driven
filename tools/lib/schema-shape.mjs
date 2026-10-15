const types=new Set(['array','boolean','integer','null','number','object','string']);
export const isSchemaAnnotation = keyword => keyword.startsWith('x-spec-');
export function schemaShape(s) {
  const fail=k=>{throw new Error(`invalid schema keyword ${k}`);};
  if(s['x-spec-ref']!==undefined && !['string','boolean'].includes(typeof s['x-spec-ref']))fail('x-spec-ref');
  if(s['x-spec-ref-reason']!==undefined && typeof s['x-spec-ref-reason']!=='string')fail('x-spec-ref-reason');
  if(s['x-spec-exclusion']!==undefined && (!s['x-spec-exclusion'] || typeof s['x-spec-exclusion']!=='object' || Array.isArray(s['x-spec-exclusion'])))fail('x-spec-exclusion');
  for(const k of ['title','description','$id','$schema','$ref','pattern','format'])if(s[k]!==undefined && typeof s[k]!=='string')fail(k);
  if(s.type!==undefined && (![...new Set([].concat(s.type))].every(t=>types.has(t)) || ![].concat(s.type).length || new Set([].concat(s.type)).size!==[].concat(s.type).length))fail('type');
  for(const k of ['minLength','maxLength','minItems','maxItems','minProperties','maxProperties','minContains','maxContains'])if(s[k]!==undefined && (!Number.isInteger(s[k]) || s[k]<0))fail(k);
  for(const k of ['minimum','maximum'])if(s[k]!==undefined && (typeof s[k]!=='number' || !Number.isFinite(s[k])))fail(k);
  if(s.uniqueItems!==undefined && typeof s.uniqueItems!=='boolean')fail('uniqueItems');
  if(s.required!==undefined && (!Array.isArray(s.required) || s.required.some(k=>typeof k!=='string') || new Set(s.required).size!==s.required.length))fail('required');
  for(const k of ['oneOf','anyOf','allOf','enum'])if(s[k]!==undefined && (!Array.isArray(s[k]) || !s[k].length))fail(k);
  for(const k of ['properties','$defs'])if(s[k]!==undefined && (!s[k] || typeof s[k]!=='object' || Array.isArray(s[k])))fail(k);
  if(s.format && !['date','date-time','email'].includes(s.format))throw new Error(`unsupported schema format ${s.format}`);
}
