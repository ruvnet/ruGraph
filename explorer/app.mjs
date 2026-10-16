import {lessons,fixture,auditOptions} from './lessons.mjs';
import {RuntimeClient} from './client.mjs';
const $=id=>document.getElementById(id);
const svgNS='http://www.w3.org/2000/svg';
const client=new RuntimeClient();
let active=0,busy=false,lastReceipt=null,lastRequest=null,lastDecisions=[],selected='database',zoom=1,spatial=true,currentSnapshot=null,dirty=false;
const completed=new Set();
function el(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function notice(text,type=''){ $('notice').textContent=text;$('notice').className=`notice ${type}`; }
function setBusy(value){busy=value;for(const id of ['run','check','audit'])$(id).disabled=value; $('replay').disabled=value||!lastReceipt;$('download').disabled=value||!lastReceipt;}
async function ready(){setBusy(true);$('runtime-status').textContent='Loading WASM';$('status-dot').classList.remove('ready');try{await client.ready;$('runtime-status').textContent='WASM ready · browser local';$('status-dot').classList.add('ready');setBusy(false);}catch(e){notice(e.message,'error');$('runtime-status').textContent='Runtime unavailable';setBusy(true);}}
function tabs(attribute,value){for(const button of document.querySelectorAll(`[${attribute}]`)){const on=button.getAttribute(attribute)===value;button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1;$(button.getAttribute('aria-controls')).hidden=!on;}}
for(const group of document.querySelectorAll('[role=tablist]')){
  group.addEventListener('keydown',event=>{
    const buttons=[...group.querySelectorAll('[role=tab]')],index=buttons.indexOf(document.activeElement);
    if(index<0||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
    buttons[next].click();buttons[next].focus();
  });
}
for(const b of document.querySelectorAll('[data-input]'))b.onclick=()=>tabs('data-input',b.dataset.input);
for(const b of document.querySelectorAll('[data-result]'))b.onclick=()=>tabs('data-result',b.dataset.result);
function renderLessons(){ $('lessons').replaceChildren(...lessons.map((l,i)=>{const b=el('button',undefined,`lesson ${completed.has(i)?'completed':''}`);b.setAttribute('aria-pressed',String(active===i));b.append(el('span',String(i+1).padStart(2,'0'),'number'),el('span',l.title));b.onclick=()=>loadLesson(i);return b;}));$('progress').textContent=`${String(active+1).padStart(2,'0')} / 06`;}
function loadLesson(index){
  if(busy){client.reset();ready();}
  active=index;const lesson=lessons[index],data=fixture(lesson);
  $('lesson-tag').textContent=lesson.tag;$('lesson-heading').textContent=lesson.heading;
  $('lesson-description').textContent=lesson.description;$('challenge').textContent=lesson.challenge;
  $('source').value=lesson.source;$('snapshot').value=JSON.stringify(data.snapshot,null,2);$('context').value=JSON.stringify(data.context,null,2);
  $('clock').value=lesson.clock;$('clock-value').textContent=lesson.clock;$('signal').value=lesson.signal;$('grant').checked=lesson.grant;
  for(const id of ['clock','signal','grant'])$(id).disabled=false;
  currentSnapshot=data.snapshot;selected='database';lastReceipt=null;lastRequest=null;lastDecisions=[];dirty=false;
  $('dirty').textContent='EDITABLE SOURCE';$('receipt-output').textContent='No receipt yet.';$('audit-output').textContent='Run Audit to inspect counterfactual changes.';$('audit-results').replaceChildren();
  $('decisions').replaceChildren(el('p','Run the program to inspect its decisions.','empty'));
  for(const id of ['decisions','work','time'])$(`metric-${id}`).textContent='—';$('metric-hash').textContent='Awaiting run';
  renderLessons();renderGraph();renderNodeList();tabs('data-input','source');tabs('data-result','decisions');setBusy(busy);
  notice(index===3?'Ready. This lesson intentionally starts without a graph.read grant.':'Ready. Run the program or change an input.');
  location.hash=lesson.id;
}
function markDirty(){dirty=true;$('dirty').textContent='INPUTS CHANGED';lastDecisions=[];renderGraph();renderNodeList();notice('Inputs changed. Displayed receipt belongs to the previous run. Run again to assess these inputs.','stale');}
for(const name of ['source','snapshot','context'])$(name).addEventListener('input',()=>{
  if(name!=='source'){for(const id of ['clock','signal','grant'])$(id).disabled=true;$('dirty').textContent='CUSTOM JSON';try{currentSnapshot=JSON.parse($('snapshot').value);}catch{/* retain last valid visual preview */}}
  markDirty();
});
$('source').addEventListener('keydown',event=>{if(event.key==='Tab'){event.preventDefault();const t=event.target,start=t.selectionStart,end=t.selectionEnd;t.setRangeText('    ',start,end,'end');markDirty();}});
function applyControls(){
  const s=JSON.parse($('snapshot').value),c=JSON.parse($('context').value),signal=$('signal').value;
  s.observations=s.observations.filter(o=>o.subject!=='database'||o.predicate!=='Failing');
  if(signal==='failure'||signal==='conflict')s.observations.push({id:'db-error-1',subject:'database',predicate:'Failing',value:true,source:'telemetry-a',observed_at:980,expires_at:1100});
  if(signal==='healthy'||signal==='conflict')s.observations.push({id:'db-ok-1',subject:'database',predicate:'Failing',value:false,source:'telemetry-c',observed_at:995,expires_at:1100});
  c.now=Number($('clock').value);c.capabilities=$('grant').checked?['graph.read','decision.emit']:['decision.emit'];
  $('clock-value').textContent=c.now;$('snapshot').value=JSON.stringify(s,null,2);$('context').value=JSON.stringify(c,null,2);currentSnapshot=s;markDirty();
}
for(const id of ['signal','clock','grant'])$(id).addEventListener('input',applyControls);
$('restore').onclick=()=>loadLesson(active);
function safePreview(text){return text.length>200000?text.slice(0,200000)+'\n… display truncated; export preserves the full receipt.':text;}
function renderDecisions(receipt){
  lastDecisions=receipt.output.kind==='decisions'?receipt.output.items:[];
  const cards=lastDecisions.slice(0,100).map(d=>{
    const card=el('article',undefined,'decision-card'),header=el('header');const button=el('button',d.subject);button.onclick=()=>selectNode(d.subject);
    header.append(button,el('span',d.status,`status ${d.status}`));card.append(header,el('p',`${d.predicate} · ${d.evidence.length} witness${d.evidence.length===1?'':'es'}`));
    if(d.evidence.length){const witness=d.evidence[0];card.append(el('p',`Sources: ${witness.sources.join(', ')} · expires ${witness.expires_at}`));}
    else card.append(el('p','No live witness supports either value.'));
    return card;
  });
  $('decisions').replaceChildren(...(cards.length?cards:[el('p','No decisions in this retrieval domain.','empty')]));
  if(lastDecisions.length>100)$('decisions').append(el('p',`Showing 100 of ${lastDecisions.length}. Export the receipt for all results.`,'empty'));
  $('metric-decisions').textContent=lastDecisions.length;$('metric-work').textContent=receipt.work.toLocaleString();$('metric-hash').textContent=receipt.receipt_hash.slice(0,12)+'…';
  $('receipt-output').textContent=safePreview(JSON.stringify(receipt,null,2));renderGraph();renderNodeList();
}
function payload(){for(const id of ['source','snapshot','context'])if(new TextEncoder().encode($(id).value).length>1024*1024)throw Error('The explorer limits each editor to 1 MiB. Use the SDK for larger inputs.');return {source:$('source').value,snapshot:$('snapshot').value,context:$('context').value,receipt:lastReceipt,options:auditOptions};}
async function execute(action){
  if(busy)return;
  let inputs;try{inputs=payload();}catch(e){notice(e.message,'error');return;}
  setBusy(true);notice(`${action==='audit'?'Running independent audit trials':'Executing '+action} in WebAssembly…`);
  const start=performance.now();
  try{
    const data=await client.call(action,inputs),elapsed=performance.now()-start,result=JSON.parse(data.result);
    $('metric-time').textContent=`${elapsed.toFixed(2)} ms`;
    if(action==='run'||action==='replay'){
      lastReceipt=data.result;lastRequest=data.request;dirty=false;$('dirty').textContent='RECEIPT MATCHES INPUTS';
      currentSnapshot=JSON.parse(inputs.snapshot);renderDecisions(result);completed.add(active);renderLessons();tabs('data-result','decisions');
      notice(action==='replay'?'Replay matched the complete prior receipt. Integrity and deterministic re-execution passed.':`Executed ${result.work} work units. ${result.output.items?.length||0} decisions. Inputs stayed in this browser.`);
    }else if(action==='check'){notice(`Program ${result.name} passed syntax, type and effect checks. Host permissions are checked during execution.`);}
    else if(action==='audit'){
      $('audit-output').textContent=safePreview(JSON.stringify(result,null,2));
      $('audit-results').replaceChildren(...result.trials.map(trial=>{const box=el('div',undefined,'audit-trial');box.append(el('strong',`Remove ${trial.intervention.kind}: ${trial.intervention.id}`),el('p',`${trial.removed_records} records removed · ${trial.changed_decisions} decisions with changed status or lineage`));for(const c of trial.changes)box.append(el('p',`${c.subject} / ${c.predicate}: ${c.before??'outside domain'} → ${c.after??'outside domain'}`));return box;}));
      tabs('data-result','audit');notice(`Audit completed ${result.trials.length} independent trials, using ${result.execution_work} work units.`);completed.add(active);renderLessons();
    }
    return data;
  }catch(error){notice(`${error.code||'INPUT_ERROR'}: ${error.message}`,'error');if(active===3&&error.code==='UNAUTHORIZED'){completed.add(active);renderLessons();}}
  finally{setBusy(false);}
}
for(const action of ['run','check','replay','audit'])$(action).onclick=()=>execute(action);
$('stop').onclick=()=>{client.reset();ready();notice('Runtime reset. Any in-flight execution was terminated.');};
window.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();execute('run');}});
$('download').onclick=()=>{
  if(!lastReceipt)return;const blob=new Blob([lastReceipt+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='rugraph-receipt.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
const positions={gateway:[180,170],api:[400,220],auth:[270,355],worker:[575,365],database:[710,175],cache:[520,100],queue:[790,380],payments:[600,250],search:[850,90],storage:[640,465],metrics:[120,390],logs:[330,460]};
function point(id,index){const p=positions[id]||[110+(index%6)*145,120+Math.floor(index/6)*80];return spatial?p:[p[0],p[1]*.8+55];}
function se(tag,attributes){const e=document.createElementNS(svgNS,tag);for(const [k,v] of Object.entries(attributes))e.setAttribute(k,String(v));return e;}
function nodes(){return Array.isArray(currentSnapshot?.nodes)?currentSnapshot.nodes.filter(n=>n&&typeof n.id==='string').slice(0,200):[];}
function renderGraph(){
  const ns=nodes(),ids=new Map(ns.map((n,i)=>[n.id,point(n.id,i)])),term=$('search').value.toLowerCase(),decision=new Map(lastDecisions.map(d=>[d.subject,d]));
  const edges=Array.isArray(currentSnapshot?.edges)?currentSnapshot.edges.filter(e=>e&&typeof e.source==='string'&&typeof e.target==='string').slice(0,500):[];
  $('edges').replaceChildren(...edges.filter(e=>ids.has(e.source)&&ids.has(e.target)).map(e=>{const [x1,y1]=ids.get(e.source),[x2,y2]=ids.get(e.target),g=se('g',{});g.append(se('line',{x1,y1,x2,y2,class:`edge-line ${e.source===selected||e.target===selected?'highlight':''}`}),se('line',{x1,y1,x2,y2,class:'edge-flow'}));return g;}));
  $('nodes').replaceChildren(...ns.map((n,i)=>{const [x,y]=ids.get(n.id),d=decision.get(n.id),g=se('g',{transform:`translate(${x},${y})`,class:`node ${d?.status||''} ${selected===n.id?'selected':''} ${term&&!n.id.toLowerCase().includes(term)?'dim':''}`,tabindex:0,role:'button','aria-label':`${n.id}: ${d?.status||'not assessed'}`});
    g.append(se('circle',{r:30,class:'halo'}));if(d?.status==='supported')g.append(se('circle',{r:23,class:'pulse'}));g.append(se('circle',{r:16,class:'core'}));const glyph=se('text',{y:4,class:'glyph'});glyph.textContent=n.id==='database'?'▤':n.id==='api'?'⌘':'◇';g.append(glyph);const label=se('text',{x:24,y:4});label.textContent=n.id.slice(0,45);g.append(label);g.onclick=()=>selectNode(n.id);g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectNode(n.id);}};return g;}));
  $('metric-nodes').replaceChildren(document.createTextNode(String(ns.length)+' '),el('small','nodes'));$('node-count').textContent=`${ns.length}${currentSnapshot?.nodes?.length>200?' of '+currentSnapshot.nodes.length:''} nodes`;
}
function selectNode(id){selected=id;renderGraph();renderNodeList();}
function renderNodeList(){
  const term=$('search').value.toLowerCase();$('node-list').replaceChildren(...nodes().filter(n=>n.id.toLowerCase().includes(term)).map(n=>{const b=el('button',n.id);b.setAttribute('aria-pressed',String(selected===n.id));b.onclick=()=>selectNode(n.id);return b;}));
  const n=nodes().find(n=>n.id===selected),detail=$('node-detail');detail.replaceChildren();if(!n){detail.append(el('p','Select a node to inspect it.'));return;}
  detail.append(el('h3',n.id),el('p',`Label: ${n.label} · vector: [${(Array.isArray(n.vector)?n.vector:[]).join(', ')}]`));
  const d=lastDecisions.find(d=>d.subject===n.id);detail.append(el('p',`Latest status: ${d?.status||'not assessed'}${dirty?' (inputs changed)':''}`));
  const observations=Array.isArray(currentSnapshot.observations)?currentSnapshot.observations.filter(o=>o&&o.subject===n.id).slice(0,50):[];
  for(const o of observations){const box=el('div',undefined,'witness');box.append(el('p',`${o.predicate} = ${o.value}`),el('p',`Observation: ${o.id}`),el('p',`Source: ${o.source}`),el('p',`Observed ${o.observed_at} · expires ${o.expires_at}`));detail.append(box);}
  if(!observations.length)detail.append(el('p','No observations recorded for this node.'));
  if(d)for(const e of d.evidence.slice(0,20))detail.append(el('p',`Witness ${e.kind}: ${(e.observation_ids||[]).join(', ')}${e.rule_ids.length?' · rules '+e.rule_ids.join(', '):''}`));
}
$('search').oninput=()=>{renderGraph();renderNodeList();};
function transform(){const x=500*(1-zoom),y=250*(1-zoom);$('world').setAttribute('transform',`translate(${x},${y}) scale(${zoom})`);}
$('zoom-in').onclick=()=>{zoom=Math.min(2,zoom+.2);transform();};$('zoom-out').onclick=()=>{zoom=Math.max(.6,zoom-.2);transform();};$('fit').onclick=()=>{zoom=1;transform();};
$('layout').onclick=()=>{spatial=!spatial;$('layout').setAttribute('aria-pressed',String(spatial));$('layout').textContent=spatial?'Spatial':'Planar';renderGraph();};
const reduced=matchMedia('(prefers-reduced-motion: reduce)');function motion(on){$('stage').classList.toggle('paused',!on);$('motion').setAttribute('aria-pressed',String(on));}motion(!reduced.matches);$('motion').onclick=()=>motion($('motion').getAttribute('aria-pressed')!=='true');reduced.addEventListener('change',e=>motion(!e.matches));
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if($('stage').requestFullscreen)await $('stage').requestFullscreen();else notice('Fullscreen is unavailable in this browser.','stale');}catch(e){notice(e.message,'error');}};
const initial=lessons.findIndex(l=>l.id===location.hash.slice(1));loadLesson(initial<0?0:initial);ready();
window.addEventListener('hashchange',()=>{const i=lessons.findIndex(l=>l.id===location.hash.slice(1));if(i>=0&&i!==active)loadLesson(i);});
fetch('./build.json').then(r=>r.ok?r.json():null).then(b=>{if(b)$('build').textContent=`BUILD ${b.revision.slice(0,8)} · RUST / WASM`;}).catch(()=>{});
