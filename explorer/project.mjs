export const EDITOR_LIMIT=1024*1024;
export const PROJECT_LIMIT=8*1024*1024;
const bytes=s=>new TextEncoder().encode(s).length;
export function validateInputs(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Project inputs must be an object.');
  for(const key of ['source','snapshot','context'])if(typeof value[key]!=='string'||bytes(value[key])>EDITOR_LIMIT)throw Error(`${key} must be text no larger than 1 MiB.`);
  return {source:value.source,snapshot:value.snapshot,context:value.context};
}
export function encodeProject(inputs){return JSON.stringify({format:'rugraph.project',version:1,inputs:validateInputs(inputs)},null,2)+'\n';}
export function decodeProject(text){
  if(bytes(text)>PROJECT_LIMIT)throw Error('Project exceeds the 8 MiB import limit.');
  const p=JSON.parse(text);
  if(p?.format!=='rugraph.project'||p.version!==1)throw Error('Unsupported project format or version.');
  return validateInputs(p.inputs);
}
export function compareDecisions(before,after){
  const key=d=>JSON.stringify([d.subject,d.predicate]);
  const a=new Map((before.output?.items||[]).map(d=>[key(d),d]));
  const b=new Map((after.output?.items||[]).map(d=>[key(d),d]));
  return [...new Set([...a.keys(),...b.keys()])].flatMap(k=>{const x=a.get(k),y=b.get(k);if(JSON.stringify(x)===JSON.stringify(y))return [];return [{subject:(y||x).subject,predicate:(y||x).predicate,before:x?.status??'outside query',after:y?.status??'outside query',lineageChanged:JSON.stringify(x?.evidence)!==JSON.stringify(y?.evidence)}];});
}
