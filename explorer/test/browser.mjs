const frame=document.getElementById('app'),output=document.getElementById('result'),passed=[];
const pause=()=>new Promise(r=>setTimeout(r,30));
const $=id=>frame.contentDocument.getElementById(id);
async function wait(condition,label){const start=performance.now();while(!condition()){if(performance.now()-start>15000)throw Error('Timeout: '+label);await pause();}}
function assert(condition,label){if(!condition)throw Error(label+' NOTICE '+$('notice').textContent);passed.push(label);}
function change(id,value,event='input'){const e=$(id);if(e.type==='checkbox')e.checked=value;else e.value=value;e.dispatchEvent(new Event(event,{bubbles:true}));}
async function run(action='run'){await wait(()=>!$(action).disabled,action+' enabled');$(action).click();await wait(()=>!$('run').disabled,'operation complete');}
function lesson(index){frame.contentDocument.querySelectorAll('.lesson')[index].click();}
try{
 await wait(()=>$('runtime-status')?.textContent.includes('WASM ready'),'WASM boot');
 await run();assert($('decisions').textContent.includes('supported'),'real Worker WASM execution');
 assert($('focus-summary').textContent.includes('supported'),'selected node explains real decision');
 assert($('journey-meter').value===1,'successful lesson advances progress');
 const outside=[...frame.contentDocument.querySelectorAll('#nodes [role=button]')].find(n=>n.getAttribute('aria-label').includes('not assessed'));outside.dispatchEvent(new MouseEvent('click'));assert($('focus-status').textContent==='Outside query','unassessed node distinguished from pending execution');
 $('inspect-focus').click();assert(frame.contentDocument.querySelector('.node-inspector').open,'focus opens evidence inspector');
 const hash=$('metric-hash').textContent;await run('replay');assert($('notice').textContent.includes('Replay matched')&&$('metric-hash').textContent===hash,'identical replay');
 lesson(1);await run();assert($('decisions').textContent.includes('conflicting'),'contradiction preserved');
 change('signal','healthy');await run();assert(!$('decisions').textContent.includes('conflicting')&&$('decisions').textContent.includes('refuted'),'evidence control recomputes');
 lesson(2);await run();assert([...frame.contentDocument.querySelectorAll('.status')].every(e=>e.textContent==='unknown'),'expired evidence is unknown');
 change('clock','1000');await run();assert($('decisions').textContent.includes('supported'),'explicit clock changes outcome');
 lesson(3);await run();assert($('notice').textContent.includes('UNAUTHORIZED'),'permission rejection');
 change('grant',true);await run();assert($('decisions').textContent.includes('supported'),'explicit grant recovery');
 lesson(4);await run();assert($('metric-decisions').textContent==='4','cosine retrieval returns four');
 change('source',$('source').value.replace('top 4','top 2'));await run();assert($('metric-decisions').textContent==='2','edited program executes');
 lesson(5);await run('audit');assert(frame.contentDocument.querySelectorAll('.audit-trial').length===3,'counterfactual audit executes');
 change('source','program ???');await run();assert($('notice').classList.contains('error'),'invalid source rejected');
 lesson(0);change('context',$('context').value.replace('"now": 1000','"now": 1000, "now": 1200'));await run();assert($('notice').classList.contains('error'),'duplicate keys rejected across Worker boundary');
 assert($('clock').disabled&&$('signal').disabled,'custom JSON disables lossy control rewriting');
 lesson(0);await run();change('search','database');assert(frame.contentDocument.querySelectorAll('#node-list button').length===1,'node search');
 frame.contentDocument.querySelector('#node-list button').click();assert($('node-detail').textContent.includes('db-error-1'),'witness inspection');
 frame.contentDocument.querySelector('[data-result=receipt]').click();assert(!$('receipt-panel').hidden&&$('receipt-output').textContent.includes('receipt_hash'),'receipt inspection');
 const width=frame.contentDocument.documentElement.scrollWidth;assert(width<=1440,'desktop has no horizontal overflow');
 for(const size of [320,390,768]){
  frame.width=String(size);await pause();await pause();assert(frame.contentDocument.documentElement.scrollWidth<=size,`no horizontal overflow at ${size}px`);
 }
 frame.width='390';await wait(()=>$('graph').getAttribute('viewBox')==='0 0 600 750','portrait resize');
 assert($('graph').getAttribute('viewBox')==='0 0 600 750','portrait graph layout on phones');
 const touch=$('nodes').querySelector('.hit-area').getBoundingClientRect();assert(touch.width>=44&&touch.height>=44,'graph nodes have 44px touch targets');
 assert($('next-lesson').getBoundingClientRect().height>=44&&$('quick-run').getBoundingClientRect().height>=44,'mobile controls have 44px targets');
 $('next-lesson').click();assert($('lesson-select').value==='1','mobile next lesson');
 $('previous-lesson').click();assert($('lesson-select').value==='0','mobile previous lesson');
 change('lesson-select','1','change');await run();assert($('decisions').textContent.includes('conflicting'),'mobile lesson picker executes');
 $('motion').click();assert($('stage').classList.contains('paused')&&frame.contentDocument.body.classList.contains('motion-paused'),'motion switch pauses scene and atmosphere');
 assert(frame.contentDocument.getAnimations().filter(a=>a.playState==='running').length===0,'motion pause includes scanning beam');
 $('motion').click();assert(!$('stage').classList.contains('paused'),'motion resumes');
 const before=$('world').getAttribute('transform');$('zoom-in').click();assert($('world').getAttribute('transform')!==before,'touch zoom');$('fit').click();
 frame.contentDocument.querySelector('[data-input=snapshot]').click();$('quick-code').click();assert(!$('source-panel').hidden&&$('snapshot-panel').hidden,'mobile code action reveals source tab');
 $('quick-run').click();await wait(()=>!$('run').disabled,'mobile quick run');assert($('notice').textContent.includes('Executed'),'persistent mobile run action');
 $('stop').click();await wait(()=>$('runtime-status').textContent.includes('WASM ready')&&!$('run').disabled,'reset');await run('replay');assert($('notice').textContent.includes('Replay matched'),'worker reset preserves replay capability');
 output.textContent='PASS '+JSON.stringify({checks:passed.length,passed});
}catch(error){output.textContent='FAIL '+error.stack+'\nPASSED '+JSON.stringify(passed);}
