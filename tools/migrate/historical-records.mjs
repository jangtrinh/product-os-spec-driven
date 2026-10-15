export function staleHistoricalRecords(value,file,report,field='$'){
 if(Array.isArray(value))return value.map((v,i)=>staleHistoricalRecords(v,file,report,`${field}[${i}]`));
 if(!value||typeof value!=='object')return value;
 const copy={};for(const [key,item]of Object.entries(value)){
  if(key==='freshness'&&item==='CURRENT'){
   Object.defineProperty(copy,key,{value:'STALE',enumerable:true,writable:true,configurable:true});report.fields.push({file,field:field+'.freshness',action:'historical-retained-stale',before:'CURRENT',after:'STALE',reason:'Imported v1 evidence cannot establish current v2 approval; original bytes retained in input snapshot'});
  }else Object.defineProperty(copy,key,{value:staleHistoricalRecords(item,file,report,field+'.'+key),enumerable:true,writable:true,configurable:true});
 }return copy;
}
