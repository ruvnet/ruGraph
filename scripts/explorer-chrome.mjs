// Real-time Chrome acceptance driver. Run with Node 24 (Node 20 supports --experimental-websocket).
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const chrome=process.env.CHROME_BIN||['google-chrome','chromium','chromium-browser'].find(n=>spawnSync('which',[n]).status===0);
if(!chrome)throw Error('Chrome required; set CHROME_BIN');
const profile=await mkdtemp(join(tmpdir(),'rugraph-chrome-'));
const child=spawn(chrome,['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
let ws,sequence=0;const pending=new Map();
async function send(method,params={},sessionId){const id=++sequence;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
try{
 let port;for(let i=0;i<200;i++){try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await sleep(50);}}
 if(!port)throw Error('Chrome did not expose its test endpoint');
 const info=await(await fetch(`http://127.0.0.1:${port}/json/version`)).json();ws=new WebSocket(info.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 ws.onmessage=event=>{const data=JSON.parse(event.data),p=pending.get(data.id);if(p){pending.delete(data.id);if(data.error)p.reject(Error(JSON.stringify(data.error)));else p.resolve(data.result);}};
 const {targetId}=await send('Target.createTarget',{url:process.argv[2]});
 const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 let result;
 for(let i=0;i<1800;i++){
  const r=await send('Runtime.evaluate',{expression:'document.getElementById("result")?.textContent',returnByValue:true},sessionId);
  result=r.result?.value;if(result&&result!=='RUNNING')break;await sleep(50);
 }
 if(!result?.startsWith('PASS '))throw Error(result||'Browser test timed out');
 console.log(result);
 if(process.env.RUGRAPH_SCREENSHOT){
  // Capture the actual app at desktop and mobile sizes after its acceptance run.
  await send('Page.navigate',{url:new URL('../dist/index.html',process.argv[2]).href},sessionId);await sleep(1500);
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false},sessionId);
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);await writeFile(process.env.RUGRAPH_SCREENSHOT,Buffer.from(shot.data,'base64'));
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},sessionId);
  const small=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);await writeFile(process.env.RUGRAPH_SCREENSHOT.replace('.png','-mobile.png'),Buffer.from(small.data,'base64'));
 }
}catch(error){console.error(error.stack);process.exitCode=1;}
finally{if(ws)ws.close();child.kill('SIGTERM');await new Promise(r=>{if(child.exitCode!==null)r();else{child.once('exit',r);setTimeout(r,3000);}});await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
