const graph = {
  version: 1, revision: 'explorer-1',
  nodes: [
    ['gateway',.9,.1],['api',1,0],['auth',.75,.25],['worker',.65,.35],
    ['database',.98,.02],['cache',.85,.15],['queue',.45,.55],['payments',.7,.3],
    ['search',.3,.7],['storage',.15,.85],['metrics',.1,.9],['logs',0,1]
  ].map(([id,x,y])=>({id,label:'Service',vector:[x,y]})),
  edges: [ ['gateway','api'],['gateway','auth'],['api','database'],['api','cache'],
    ['api','worker'],['api','payments'],['worker','queue'],['worker','storage'],
    ['search','database'],['payments','database'],['metrics','logs'],['auth','cache']
  ].map(([source,target])=>({id:`${source}-${target}`,source,target,relation:'DEPENDS_ON'})),
  observations: [
    {id:'db-error-1',subject:'database',predicate:'Failing',value:true,source:'telemetry-a',observed_at:980,expires_at:1100},
    ...['cache','queue','worker','payments','storage','auth','gateway','search','metrics','logs','api'].map(subject=>({id:`${subject}-healthy`,subject,predicate:'Failing',value:false,source:'telemetry-b',observed_at:990,expires_at:1100}))
  ],
  rules:[{id:'failure_implies_degraded',requires:[{predicate:'Failing',value:true}],conclusion:{predicate:'Degraded',value:true}}]
};
const program = body => `program explore {\n    effect graph.read;\n    effect decision.emit;\n    budget 100000;\n${body}\n}`;
const dependencies = program(`    let root = select ["api"];\n    let deps = traverse root "DEPENDS_ON" depth 2;\n    let signals = observe deps "Failing" within 300;\n    let decisions = assess signals;\n    emit decisions;`);
export const lessons = [
  {id:'dependencies',title:'Follow the evidence',tag:'01 / Graph traversal',heading:'An incident has a shape.',description:'Start at the API. Follow its dependencies and assess the observed Failing signals. Select a node to inspect the witnesses behind its result.',challenge:'Find the supported failure. Then open its evidence and source IDs.',source:dependencies,clock:1000,signal:'failure',grant:true},
  {id:'conflict',title:'Keep the contradiction',tag:'02 / Evidence',heading:'Two sources. Two answers.',description:'Telemetry A says the database is failing. Telemetry C says it is healthy. RuGraph retains both witnesses and reports conflicting evidence.',challenge:'Change database evidence to Healthy. Run again and watch conflicting become refuted.',source:dependencies,clock:1000,signal:'conflict',grant:true},
  {id:'expiry',title:'Let evidence expire',tag:'03 / Explicit time',heading:'Old evidence stops speaking.',description:'The host clock is now 1200. These observations expired at 1100, so the runtime reports unknown instead of preserving a stale conclusion.',challenge:'Move the host clock back to 1000 and run. Compare the receipt hashes.',source:dependencies,clock:1200,signal:'failure',grant:true},
  {id:'permissions',title:'Make authority explicit',tag:'04 / Capabilities',heading:'A program must have permission.',description:'The program requests graph.read, but the host has not granted it. Run to inspect the rejection, then enable the grant and try again.',challenge:'Enable Graph read and run. The source stays the same; the host context changes.',source:dependencies,clock:1000,signal:'failure',grant:false},
  {id:'similarity',title:'Retrieve, then assess',tag:'05 / Vector search',heading:'Similarity finds candidates.',description:'Exact cosine similarity selects the four closest Service vectors to [1, 0]. Observations determine their evidence status. Similarity itself creates no factual witness.',challenge:'Change top 4 to top 2 in the program. Run and inspect the smaller decision set.',source:program(`    let services = nodes "Service";\n    let nearest = similar services [1, 0] top 4;\n    let signals = observe nearest "Failing" within 300;\n    let decisions = assess signals;\n    emit decisions;`),clock:1000,signal:'failure',grant:true},
  {id:'audit',title:'Test what matters',tag:'06 / Counterfactuals',heading:'Remove a witness. Recompute.',description:'Derive Degraded from Failing, then run an audit. Each trial independently removes an observation, a source, or an edge and compares the resulting decisions.',challenge:'Click Audit. Inspect which intervention changes database evidence. These are sensitivity tests, not causal proof.',source:program(`    let root = select ["api"];\n    let deps = traverse root "DEPENDS_ON" depth 2;\n    let signals = observe deps "Failing" within 300;\n    let impacts = infer [signals] using ["failure_implies_degraded"];\n    let decisions = assess impacts;\n    emit decisions;`),clock:1000,signal:'failure',grant:true}
];
export function fixture(lesson=lessons[0]) {
  const snapshot=structuredClone(graph);
  if(lesson.signal==='conflict') snapshot.observations.push({id:'db-ok-1',subject:'database',predicate:'Failing',value:false,source:'telemetry-c',observed_at:995,expires_at:1100});
  return {snapshot,context:{now:lesson.clock,capabilities:lesson.grant?['graph.read','decision.emit']:['decision.emit'],max_steps:100000,max_results:1000}};
}
export const auditOptions={interventions:[{kind:'observation',id:'db-error-1'},{kind:'source',id:'telemetry-a'},{kind:'edge',id:'api-database'}],max_execution_work:400000};
