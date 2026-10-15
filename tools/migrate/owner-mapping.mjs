import fs from 'node:fs';
import { validate } from '../lib/schema-lite.mjs';
export function loadOwnerMappings(file,hash){
 if(!file)return [];
 const value=JSON.parse(fs.readFileSync(file,'utf8'));
 const schema=JSON.parse(fs.readFileSync(new URL('./owner-mapping.schema.json',import.meta.url),'utf8'));
 const errors=validate(value,schema);if(errors.length)throw Error(`invalid owner mapping: ${errors.map(x=>`${x.path} ${x.message}`).join('; ')}`);
 if(value.source_sha256!==hash)throw Error('owner mapping source hash differs from the frozen input');
 if(new Set(value.mappings.map(x=>x.row)).size!==value.mappings.length)throw Error('duplicate owner mapping row');
 return value.mappings;
}
