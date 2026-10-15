const base={version:1,entries:[{id:'wording',page:'us-01',date:'2026-01-09',kind:'paragraph',before:'Old sentence.',after:'Màn hình S01 (Filter bar + Saved filters). Ảnh chụp bản build:',refs:['D1'],source:'D1',previous_commit:'a'.repeat(40)}]};
export const historyControls=['B-FILE','B-SCHEMA','B-ID','B-BEFORE-SHARED','B-PAGE','B-REF','B-AFTER','B-TEXT','B-DATE'].map(code=>[code,t=>{
 const value=structuredClone(base);
 t.json('spec.manifest.json',j=>{(j.changes ||= {}).blocks='assets/history.json';});
 if(code==='B-FILE') return;
 if(code==='B-SCHEMA') value.version=2;
 if(code==='B-ID') value.entries.push({...value.entries[0],before:'Another before'});
 if(code==='B-BEFORE-SHARED') value.entries.push({...value.entries[0],id:'wording-2'});
 if(code==='B-PAGE') value.entries[0].page='absent';
 if(code==='B-REF') value.entries[0].refs=['D999'];
 if(code==='B-AFTER') value.entries[0].after='Absent sentence';
 if(code==='B-TEXT') value.entries[0].before=value.entries[0].after='';
 if(code==='B-DATE') value.entries[0].date='2026-02-30';
 t.write('assets/history.json',JSON.stringify(value));
}]);
