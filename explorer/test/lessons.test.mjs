import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadRuGraph} from '../../npm/packages/graph-language-wasm/index.mjs';
import {lessons,fixture,auditOptions} from '../lessons.mjs';
import {RuntimeClient} from '../client.mjs';
const runtime=await loadRuGraph();
function request(lesson){const f=fixture(lesson);return JSON.stringify({program:JSON.parse(runtime.compile(lesson.source)),...f});}
for(const lesson of lessons)test(`WASM lesson: ${lesson.id}`,()=>{
  const req=request(lesson);
  if(lesson.id==='permissions'){
    assert.throws(()=>runtime.run(req),e=>e.code==='UNAUTHORIZED');return;
  }
  const text=runtime.run(req),receipt=JSON.parse(text),decisions=receipt.output.items;
  assert.equal(runtime.replay(req,text),text);assert.equal(JSON.parse(runtime.verify(text)).valid,true);
  const database=decisions.find(d=>d.subject==='database');
  if(lesson.id==='dependencies')assert.equal(database.status,'supported');
  if(lesson.id==='conflict')assert.equal(database.status,'conflicting');
  if(lesson.id==='expiry')assert.ok(decisions.every(d=>d.status==='unknown'));
  if(lesson.id==='similarity'){assert.equal(decisions.length,4);assert.equal(database.status,'supported');}
  if(lesson.id==='audit'){
    const audit=JSON.parse(runtime.audit(req,JSON.stringify(auditOptions)));
    assert.equal(audit.baseline_receipt_hash,receipt.receipt_hash);assert.equal(audit.trials.length,3);
    assert.ok(audit.trials.some(t=>t.changed_decisions>0));
  }
});
test('replay rejects changed host time',()=>{const req=request(lessons[0]),receipt=runtime.run(req),changed=JSON.parse(req);changed.context.now=1200;assert.throws(()=>runtime.replay(JSON.stringify(changed),receipt),e=>e.code==='REPLAY_MISMATCH');});
test('strict editor JSON preserves duplicate-key rejection',()=>{const req=request(lessons[0]).replace('"now":1000','"now":1000,"now":1200');assert.throws(()=>runtime.run(req));});
class FakeWorker{
  static instances=[];
  constructor(){FakeWorker.instances.push(this);queueMicrotask(()=>this.onmessage({data:{type:'ready'}}));}
  postMessage(data){this.message=data;}
  terminate(){this.terminated=true;}
  reply(data){this.onmessage({data:{...data,id:this.message.id}});}
}
test('worker cancellation rejects operation and creates a fresh instance',async()=>{
 const c=new RuntimeClient({WorkerClass:FakeWorker});await c.ready;const pending=c.call('run');await Promise.resolve();const old=c.worker;c.reset();await assert.rejects(pending,e=>e.code==='CANCELLED');assert.ok(old.terminated);assert.notEqual(c.worker,old);await c.ready;c.destroy();
});
test('worker deadline terminates execution and recovers',async()=>{
 const c=new RuntimeClient({WorkerClass:FakeWorker,timeout:10});await c.ready;const old=c.worker;await assert.rejects(c.call('run'),e=>e.code==='TIMEOUT');assert.ok(old.terminated);await c.ready;const task=c.call('check');await Promise.resolve();c.worker.reply({type:'result',result:'{"valid":true}'});assert.equal((await task).result,'{"valid":true}');c.destroy();
});
test('worker reports errors without evaluating input on the host',async()=>{
 const c=new RuntimeClient({WorkerClass:FakeWorker});await c.ready;const task=c.call('run',{source:'bad'});await Promise.resolve();c.worker.reply({type:'error',code:'PARSE',message:'bad source'});await assert.rejects(task,e=>e.code==='PARSE');c.destroy();
});
