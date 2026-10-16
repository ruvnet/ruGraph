import {loadRuGraph} from './runtime/browser.mjs';
let runtime;
try { runtime=await loadRuGraph(); postMessage({type:'ready'}); }
catch(error){postMessage({type:'fatal',code:error.code||'WASM_LOAD',message:error.message||String(error)});}
self.onmessage=({data})=>{
  const {id,action,source,snapshot,context,receipt,options}=data;
  try {
    if(!runtime) throw Error('WASM runtime is unavailable');
    let result,request;
    if(action==='verify') result=runtime.verify(receipt);
    else if(action==='compile') result=runtime.compile(source);
    else if(action==='check') result=runtime.check(source);
    else {
      const program=runtime.compile(source);
      // Preserve raw JSON until the strict Rust parser checks duplicate keys and u64 values.
      request=`{"program":${program},"snapshot":${snapshot},"context":${context}}`;
      if(action==='run') result=runtime.run(request);
      else if(action==='replay') result=runtime.replay(request,receipt);
      else if(action==='audit') result=runtime.audit(request,JSON.stringify(options));
      else throw Error('Unknown action');
    }
    postMessage({type:'result',id,action,result,request});
  }catch(error){postMessage({type:'error',id,code:error.code||'RUNTIME_ERROR',message:error.message||String(error),position:error.position});}
};
