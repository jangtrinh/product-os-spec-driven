/* Preserve line numbers while removing code and comments from actionable prose. */
export function proseLines(body) {
  let fence=null,comment=false;
  return body.split('\n').map(raw=>{
    const f=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(raw);
    if(f) {if(!fence) fence=f[1];else if(f[1][0]===fence[0] && f[1].length>=fence.length && !f[2].trim()) fence=null;return '';}
    if(fence) return '';
    let line='';
    for(let i=0;i<raw.length;) {
      if(comment) {const end=raw.indexOf('-->',i);if(end<0) break;comment=false;i=end+3;}
      else if(raw.startsWith('<!--',i)) {comment=true;i+=4;}
      else if(raw[i]==='`') {const run=/^`+/.exec(raw.slice(i))[0];const end=raw.indexOf(run,i+run.length);if(end>=0){line+=' '.repeat(end+run.length-i);i=end+run.length;}else line+=raw[i++];}
      else line+=raw[i++];
    }
    return line;
  });
}
export function openItems(doc) {
  const items=[];let current=null;
  proseLines(doc.body).forEach((line,i)=>{
    const marker=/(?:^\s*(?:(?:>\s*)|(?:[-+*]|\d+[.)])\s+)*|\|\s*)(?:\*\*|__)?OPEN(\[blocking\])?:(?:\*\*|__)?\s*([^|]*)/g;
    let matched=false;
    for(const m of line.matchAll(marker)) {current={line:doc.bodyLine+i,blocking:!!m[1],text:m[2].trim()};items.push(current);matched=true;}
    if(!matched && current) {if(!line.trim() || /^\s*(?:#{1,6}\s|[-+*]\s|\d+[.)]\s)/.test(line)) current=null;else current.text+=' '+line.trim();}
  });
  return items;
}
