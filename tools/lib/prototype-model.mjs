const decode=text=>text.replace(/&#(x[0-9a-f]+|\d+);?/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n))).replaceAll('&colon;',':').replaceAll('&sol;','/').replaceAll('&num;','#').replaceAll('&amp;','&');
const rawTextTags=new Set(['style','script','title','textarea','xmp']);
const resourceAttributes=new Set(['src','srcset','imagesrcset','href','xlink:href','action','formaction','poster','data','background','ping']);
const svgElements=new Set('svg g path rect circle ellipse line polyline polygon'.split(' '));
const allowedElements=new Set('html head meta title style body main header footer nav section div span p h1 h2 h3 h4 h5 h6 a button label input textarea select option ul ol li table thead tbody tr th td strong em small br hr figure figcaption pre code'.split(' ').concat([...svgElements]));
const readonlyInputTypes=new Set('text search tel url email password number date month week time datetime-local'.split(' '));
function elementProblem(name,attrs,{svgDepth,selectDepth}) {
 if(!allowedElements.has(name))return 'element is outside the allowed prototype grammar';
 if(svgDepth&&!svgElements.has(name))return 'SVG may contain only the allowed basic SVG elements';
 if(!svgDepth&&svgElements.has(name)&&name!=='svg')return 'SVG shapes must be inside svg';
 if(selectDepth&&name!=='option')return 'disabled select may contain only option elements';
 if(name==='option'&&!selectDepth)return 'option must be inside a disabled select';
 if(name==='meta') {
  const keys=Object.keys(attrs),charset=keys.length===1&&attrs.charset?.toLowerCase()==='utf-8';
  const viewport=attrs.name?.toLowerCase()==='viewport'&&keys.every(k=>['name','content'].includes(k));
  if(!charset&&!viewport)return 'meta must be charset=utf-8 or name=viewport only';
 }
 if(name==='button'&&(attrs.type?.toLowerCase()!=='button'||['form','formaction','formmethod','formtarget','formenctype'].some(k=>Object.hasOwn(attrs,k))))return 'button must have type=button and no form submission attributes';
 if(name==='input'&&!Object.hasOwn(attrs,'disabled')&&!(Object.hasOwn(attrs,'readonly')&&readonlyInputTypes.has(attrs.type?.toLowerCase()??'text')))return 'input must be disabled or effectively readonly';
 if(name==='textarea'&&!Object.hasOwn(attrs,'readonly'))return 'textarea must be readonly';
 if(name==='select'&&!Object.hasOwn(attrs,'disabled'))return 'select must be disabled';
 return null;
}
function commentEnd(raw,start) {
 let state='start';
 for(let pos=start;pos<raw.length;pos++) {
  const char=raw[pos];
  if(state==='start'||state==='start-dash') {
   if(char==='>')return pos+1;
   state=char==='-'?(state==='start'?'start-dash':'end'):'comment';
  }else if(state==='comment') {
   if(char==='-')state='end-dash';
  }else if(state==='end-dash') {
   state=char==='-'?'end':'comment';
  }else if(state==='end') {
   if(char==='>')return pos+1;
   if(char==='!')state='end-bang';else if(char!=='-')state='comment';
  }else if(state==='end-bang') {
   if(char==='>')return pos+1;
   state=char==='-'?'end-dash':'comment';
  }
 }
 return raw.length;
}
// Recognize the static prototype grammar while respecting HTML raw-text and
// inert-template contexts. Inert content cannot establish rendered navigation.
export function parsePrototype(raw) {
 const ids=[],links=[],sections=new Map(),resources=[],stack=[],elementErrors=[];
 let html='',styleCount=0,scripts=false,rawText=null,templateDepth=0,cursor=0,line=1,svgDepth=0,selectDepth=0;
 const current=()=>stack.at(-1);
 const text=value=>{if(!rawText&&!templateDepth&&current())sections.get(current()).text+=decode(value);};
 // HTML names and attribute/class tokens use ASCII whitespace, not \s or
 // JavaScript word boundaries: NBSP belongs to a name/value, not a separator.
 const tokens=/<!--|<(\/)?([a-z][^\t\n\f\r />]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/gi;
 let token;
 while((token=tokens.exec(raw))) {
  const before=raw.slice(cursor,token.index);text(before);html+=before;line+=(before.match(/\n/g)??[]).length;
  const tokenLine=line;line+=(token[0].match(/\n/g)??[]).length;cursor=token.index+token[0].length;
  if(token[0]==='<!--'&&!rawText) {
   // In markup (including inert template markup), comment bodies cannot close
   // elements or establish ids/links. An unclosed comment consumes the tail.
   const end=commentEnd(raw,cursor);line+=(raw.slice(cursor,end).match(/\n/g)??[]).length;cursor=end;tokens.lastIndex=cursor;continue;
  }
  html+=token[0];
  // The opener is literal text in raw-text elements; keep scanning so their
  // actual closing tag, and any resources after it, remain visible to lint.
  if(token[0]==='<!--')continue;
  const closing=Boolean(token[1]),name=token[2].toLowerCase();
  if(rawText){if(closing&&name===rawText)rawText=null;continue;}
  const attrs=Object.create(null);for(const a of token[3].matchAll(/([^\t\n\f\r =/>]+)(?:[\t\n\f\r ]*=[\t\n\f\r ]*(?:"([^"]*)"|'([^']*)'|([^\t\n\f\r >]+)))?/g)){const key=a[1].toLowerCase();if(!Object.hasOwn(attrs,key))attrs[key]=decode(a[2]??a[3]??a[4]??'');}
  if(!closing){const problem=elementProblem(name,attrs,{svgDepth,selectDepth});if(problem)elementErrors.push({name,line:tokenLine,message:`<${name}>: ${problem}`});}
  if(name==='template'){templateDepth+=closing?-1:1;templateDepth=Math.max(0,templateDepth);continue;}
  if(!closing&&rawTextTags.has(name))rawText=name;
  if(templateDepth)continue;
  if(name==='svg'){if(closing)svgDepth=Math.max(0,svgDepth-1);else if(!/\/$/.test(token[3]))svgDepth++;}
  if(name==='select')selectDepth=Math.max(0,selectDepth+(closing?-1:1));
  if(current())sections.get(current()).text+=' ';
  if(closing){if(name==='section')stack.pop();continue;}
  if(attrs.id!==undefined)ids.push(attrs.id);
  if(name==='section'){stack.push(attrs.id??null);if(current())sections.set(current(),{text:'',links:[],frames:0});}
  if(name!=='section'&&current()&&(attrs.class??'').split(/[\t\n\f\r ]+/).includes('screen'))sections.get(current()).frames++;
  if(name==='style')styleCount++;
  if(name==='script'||Object.keys(attrs).some(k=>k.startsWith('on')))scripts=true;
  if(attrs.srcdoc!==undefined||name==='meta'&&attrs['http-equiv']?.trim().toLowerCase()==='refresh')resources.push('embedded or automatic navigation');
  for(const [key,value] of Object.entries(attrs)) {
   if(!resourceAttributes.has(key))continue;
   if(value.startsWith('#'))links.push(value);else resources.push(value);
   if(name==='a'&&['href','xlink:href'].includes(key)&&current())sections.get(current()).links.push(value);
  }
 }
 const tail=raw.slice(cursor);text(tail);html+=tail;
 const decoded=decode(html);
 for(const url of decoded.matchAll(/\burl\s*\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
  const value=url[2].trim();if(value.startsWith('#'))links.push(value);else resources.push(value);
 }
 return {html:decoded,ids,links,sections,resources,styleCount,scripts,elementErrors};
}
