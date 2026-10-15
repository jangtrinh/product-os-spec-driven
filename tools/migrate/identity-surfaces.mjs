export const legacyPattern=/(?<![\p{L}\p{N}])(?:SCN-PUB-\d{2}-\d{2}|SCR-PUB-\d{2}|EMAIL-\d{2}|CTRL-\d{2}|PD-\d+)(?![\p{L}\p{N}])/giu;
// HTML named references that can contribute ASCII identity characters or boundaries.
// Other named references produce non-ASCII characters, not an ASCII legacy ID.
const named={amp:'&',AMP:'&',hyphen:'-',dash:'-',Tab:'\t',NewLine:'\n',quot:'"',QUOT:'"',apos:"'",lt:'<',LT:'<',gt:'>',GT:'>',period:'.',colon:':',sol:'/',bsol:'\\',num:'#',semi:';',equals:'=',lowbar:'_',lpar:'(',rpar:')',lbrack:'[',rbrack:']',lbrace:'{',rbrace:'}',vert:'|',VerticalLine:'|',midast:'*',ast:'*',plus:'+',excl:'!',dollar:'$',percnt:'%',commat:'@',Hat:'^',grave:'`',DiacriticalGrave:'`',fjlig:'fj'};
export function decodeEntities(text){
 return text.replace(/&#(?:x([\da-f]+)|(\d+));?|&([a-z][a-z\d]*);/gi,(all,hex,decimal,name)=>{
  if(name)return named[name]??all;
  const n=parseInt(hex||decimal,hex?16:10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'\ufffd';
 });
}
function encodedAlias(decoded,raw){
 const count=text=>[...text.matchAll(/(?<![\p{L}\p{N}])(?:SCN-PUB-\d+-\d+|SCR-PUB-\d+|EMAIL-\d+|CTRL-\d+|PD-\d+)(?![\p{L}\p{N}])/giu)].reduce((counts,m)=>(counts.set(m[0].toUpperCase(),(counts.get(m[0].toUpperCase())||0)+1),counts),new Map());
 const original=count(raw);return [...count(decoded)].some(([id,n])=>n>(original.get(id)||0));
}
// Conservative refusal, not a JavaScript interpreter or code crosswalk. Decode
// escapes once (including line continuations); doubled backslashes stay literal.
export function executableLegacyIdentities(raw,file){
 if(!/\.(?:[cm]?js|jsx|tsx?)$/i.test(file)&&!(/\.html$/i.test(file)&&/<script\b|\bon\w+\s*=|javascript:/i.test(raw)))return [];
 const decoded=decodeEntities(raw).replace(/\\(?:u\{([\da-f]+)\}|u([\da-f]{4})|x([\da-f]{2})|([0-3][0-7]{0,2}|[4-7][0-7]?)|\r\n|[\s\S])/gi,(all,point,unicode,hex,octal)=>{
  if(point||unicode||hex){const n=parseInt(point||unicode||hex,16);return n<=0x10ffff?String.fromCodePoint(n):all;}
  if(octal)return String.fromCodePoint(parseInt(octal,8));
  if(/^\\(?:\r?\n|\r|\u2028|\u2029)$/.test(all))return '';
  return ({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v',0:'\0'})[all[1]]??all[1];
 });
 const pattern=/(?<![\p{L}\p{N}])(?:SCN-PUB-\d+-\d+|SCR-PUB-\d+|EMAIL-\d+|CTRL-\d+|PD-\d+)(?![\p{L}\p{N}])/giu;
 return [...decoded.matchAll(pattern)].map(m=>({id:m[0],line:decoded.slice(0,m.index).split('\n').length}));
}
export function identitySurfaces(raw,file){
 if(/\.json$/i.test(file)){
  JSON.parse(raw); // Only valid JSON strings, including object keys, are semantic surfaces.
  let previous=0,line=1;
  return [...raw.matchAll(/"(?:[^"\\]|\\[\s\S])*"/g)].map(m=>{
   line+=raw.slice(previous,m.index).split('\n').length-1;previous=m.index;
   const value=JSON.parse(m[0]),text=decodeEntities(value);
   return {line,text,encoded:encodedAlias(text,m[0].slice(1,-1))};
  });
 }
 const surfaces=raw.split('\n').map((value,i)=>{const text=decodeEntities(value);return {line:i+1,text,encoded:encodedAlias(text,value)};});
 // JSON literals can also occur in front matter or embedded structured payloads.
 for(const m of raw.matchAll(/"(?:[^"\\]|\\[\s\S])*"/g)){
  if(!m[0].includes('\\'))continue;
  try{const text=decodeEntities(JSON.parse(m[0]));if(encodedAlias(text,m[0].slice(1,-1)))surfaces.push({line:raw.slice(0,m.index).split('\n').length,text,encoded:true});}catch{/* Ordinary quoted prose is not necessarily JSON. */}
 }
 return surfaces;
}
export function refuseEncodedIdentities(files){
 for(const f of files){const found=executableLegacyIdentities(f.bytes.toString('utf8'),f.file);if(found.length)throw Error(`EXECUTABLE-LEGACY-ID: decoded legacy identity in executable asset ${f.file}:${found[0].line}; encoded legacy identity/code crosswalking unsupported; no files written`);}
 for(const f of files.filter(f=>/\.(md|json|html|css|ts|js|mjs)$/i.test(f.file)))for(const s of identitySurfaces(f.bytes.toString('utf8'),f.file)){
  if(s.encoded)throw Error(`encoded legacy identity in ${f.file}:${s.line}; decode the source identity explicitly before export; no files written`);
 }
}
