export class RuntimeClient {
  constructor({url=new URL('./worker.mjs',import.meta.url),WorkerClass=Worker,timeout=8000}={}){
    this.url=url;this.WorkerClass=WorkerClass;this.timeout=timeout;this.sequence=0;this.pending=null;this.spawn();
  }
  spawn(){
    this.ready=new Promise((resolve,reject)=>{
      this.resolveReady=resolve;this.rejectReady=reject;
      this.bootTimer=setTimeout(()=>this.fail('WASM_LOAD','Runtime initialization timed out'),15000);
    });
    // A restart may be awaiting its next caller; mark rejection handled immediately.
    this.ready.catch(()=>{});
    this.worker=new this.WorkerClass(this.url,{type:'module'});
    this.worker.onmessage=({data})=>{
      if(data.type==='ready'){clearTimeout(this.bootTimer);this.resolveReady();return;}
      if(data.type==='fatal'){this.fail(data.code,data.message);return;}
      const task=this.pending;
      if(!task||task.id!==data.id) return;
      clearTimeout(task.timer);this.pending=null;
      if(data.type==='error') task.reject(Object.assign(Error(data.message),{code:data.code}));
      else task.resolve(data);
    };
    this.worker.onerror=()=>this.fail('WORKER_ERROR','The WASM worker stopped. Reset the runtime to continue.');
  }
  fail(code,message){clearTimeout(this.bootTimer);const error=Object.assign(Error(message),{code});this.rejectReady(error);if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(error);this.pending=null;}this.worker.terminate();}
  async call(action,payload={}){
    await this.ready;
    if(this.pending) throw Object.assign(Error('An operation is already running'),{code:'BUSY'});
    const id=++this.sequence;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.fail('TIMEOUT','Execution exceeded 8 seconds. The worker was terminated.');this.spawn();},this.timeout);
      this.pending={id,resolve,reject,timer};this.worker.postMessage({id,action,...payload});
    });
  }
  reset(){this.fail('CANCELLED','Execution cancelled; runtime reset.');this.spawn();}
  destroy(){this.fail('CANCELLED','Runtime closed.');}
}
