/* Decode the table layer exactly once before strict JSON normalization. */
export function glossaryRow(raw) {
  let s=raw.trim();if(s.startsWith('|'))s=s.slice(1);if(s.endsWith('|'))s=s.slice(0,-1);
  const cells=[];let cell='';
  for(let i=0;i<s.length;i++) {
    if(s[i]==='\\') {if(!['\\','|'].includes(s[i+1])) throw new Error('unrecognized glossary table escape');cell+=s[++i];}
    else if(s[i]==='|'){cells.push(cell.trim());cell='';}
    else cell+=s[i];
  }
  cells.push(cell.trim());return cells;
}
