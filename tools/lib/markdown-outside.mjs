/* Keep source line numbers while excluding fenced blocks and HTML comments. */
export function outsideLines(md) {
  let fence=null,comment=false;
  return md.split('\n').map(raw=>{
    const f=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(raw);
    if(f) {if(!fence)fence=f[1];else if(f[1][0]===fence[0] && f[1].length>=fence.length && !f[2].trim())fence=null;return '';}
    if(fence)return '';
    let out='',at=0;
    while(at<raw.length) {
      if(comment){const end=raw.indexOf('-->',at);if(end<0)break;at=end+3;comment=false;}
      else {const begin=raw.indexOf('<!--',at);if(begin<0){out+=raw.slice(at);break;}out+=raw.slice(at,begin);at=begin+4;comment=true;}
    }
    return out;
  });
}
