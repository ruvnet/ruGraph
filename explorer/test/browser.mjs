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
 frame.width='390';await pause();assert(frame.contentDocument.documentElement.scrollWidth<=390,'mobile has no horizontal overflow');
 $('stop').click();await wait(()=>$('runtime-status').textContent.includes('WASM ready')&&!$('run').disabled,'reset');await run('replay');assert($('notice').textContent.includes('Replay matched'),'worker reset preserves replay capability');
 output.textContent='PASS '+JSON.stringify({checks:passed.length,passed});
}catch(error){output.textContent='FAIL '+error.stack+'\nPASSED '+JSON.stringify(passed);}
