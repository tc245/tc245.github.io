import { SHOPS, PROFILES, NETWORK_NODES, UPGRADE_COST, HOURS_COST, defaultScenarioSettings, validateScenarioSettings } from '../lib/scenario';
import type { ScenarioResult, ScenarioSettings } from '../lib/learning-types';

const root=document.querySelector('[data-scenario]');
if(root){
  const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
  const budget=el<HTMLInputElement>('scenario-budget'), price=el<HTMLInputElement>('offer-price'), hours=el<HTMLInputElement>('extend-hours'), seed=el<HTMLInputElement>('population-seed'), time=el<HTMLSelectElement>('travel-assumption');
  const shopInputs=Array.from(root.querySelectorAll<HTMLInputElement>('input[name="shops"]'));
  const inspector=el<HTMLSelectElement>('household-select'), mapView=el<HTMLSelectElement>('map-view');
  const results=el('scenario-results'), status=el('scenario-status'), error=el('scenario-error');
  const worker=new Worker(new URL('./scenario.worker.ts',import.meta.url),{type:'module'});
  const pounds=(n:number)=>`£${n.toLocaleString('en-GB')}`;
  let runId=0, timer:ReturnType<typeof setTimeout>, current:ScenarioResult|null=null, saved:ScenarioResult|null=null;
  let animation:number|undefined, animating=false;
  const svgNS='http://www.w3.org/2000/svg';
  const point=(id:number)=>({x:60+NETWORK_NODES[id].x*110,y:55+NETWORK_NODES[id].y*100});
  const shopName=(id:string|null)=>SHOPS.find(s=>s.id===id)?.name??'no feasible shop';
  const sign=(n:number)=>`${n>0?'+':''}${n}`;
  const settings=():ScenarioSettings=>({seed:seed.valueAsNumber,budget:budget.valueAsNumber,selectedShopIds:shopInputs.filter(i=>i.checked).map(i=>i.value),offerPrice:price.valueAsNumber,extendHours:hours.checked,travelAssumption:Number(time.value)});
  function stopAnimation(){if(animation!==undefined)cancelAnimationFrame(animation); animation=undefined;animating=false;el('animate-route').setAttribute('aria-pressed','false');el('animate-route').textContent='Animate route';document.querySelector('#route-traveller')!.setAttribute('visibility','hidden');}
  function clearResult(){current=null;results.hidden=true;inspector.disabled=true;el<HTMLButtonElement>('animate-route').disabled=true;el('household-dots').replaceChildren();document.querySelector('#inspected-route')!.setAttribute('points','');el('household-detail').textContent='Run a valid scenario to inspect its households.';stopAnimation();}
  function updateLabels(){const s=settings();el('budget-output').textContent=pounds(s.budget);el('offer-output').textContent=pounds(s.offerPrice);el('allocation-cost').textContent=`${pounds(s.selectedShopIds.length*(UPGRADE_COST+(s.extendHours?HOURS_COST:0)))} / ${pounds(s.budget)}`;}
  function queueRun(){
    clearTimeout(timer);const id=++runId;clearResult();updateLabels();error.hidden=true;
    document.querySelectorAll<SVGElement>('[data-map-shop]').forEach(g=>g.classList.remove('upgraded-shop'));
    let input:ScenarioSettings;
    try{input=validateScenarioSettings(settings());const cost=input.selectedShopIds.length*(UPGRADE_COST+(input.extendHours?HOURS_COST:0));if(cost>input.budget)throw new Error(`The selected changes cost ${pounds(cost)}, above the ${pounds(input.budget)} setup budget. Deselect a shop or increase the budget.`);}
    catch(e){error.textContent=e instanceof Error?e.message:'Check the scenario settings.';error.hidden=false;status.textContent='Scenario not run. Correct the settings to show results.';return;}
    status.textContent='Calculating paired scenarios and sensitivity checks…';
    timer=setTimeout(()=>worker.postMessage({id,settings:input}),100);
  }
  function comparison(){
    el('saved-comparison').hidden=!saved;
    if(!saved||!current)return;
    const a=saved,b=current;
    el('saved-comparison-text').textContent=`A: ${a.scenario.accessible}/${a.scenario.total} with access; ${a.settings.selectedShopIds.length} shops, ${pounds(a.cost)}, basket ${pounds(a.settings.offerPrice)}, ${a.settings.extendHours?'later hours':'original hours'}, seed ${a.settings.seed}, time factor ${a.settings.travelAssumption}. Current: ${b.scenario.accessible}/${b.scenario.total}; ${b.settings.selectedShopIds.length} shops, ${pounds(b.cost)}, basket ${pounds(b.settings.offerPrice)}, ${b.settings.extendHours?'later hours':'original hours'}, seed ${b.settings.seed}, time factor ${b.settings.travelAssumption}. ${a.settings.seed===b.settings.seed?'The same synthetic population seed is used.':'Different seeds produce different synthetic populations; differences cannot be attributed solely to the intervention.'}`;
  }
  function renderHousehold(){
    stopAnimation();if(!current)return;
    const household=current.households[Number(inspector.value)||0];
    const baseline=mapView.value==='baseline';const route=baseline?household.baselineRoute:household.scenarioRoute;
    document.querySelector('#inspected-route')!.setAttribute('points',route.map(id=>{const p=point(id);return `${p.x},${p.y}`;}).join(' '));
    const minutes=baseline?household.baselineMinutes:household.scenarioMinutes;
    el('household-detail').textContent=`Household ${household.id}: ${PROFILES.find(p=>p.id===household.profileId)!.name}. Basket budget ${pounds(Number(household.foodBudget.toFixed(2)))}; ${household.timeBudget.toFixed(1)} minutes available; walking speed ${(household.speed/60).toFixed(2)} m/s; ${household.needsLateOpening?'needs late opening':'can shop in daytime'}. ${baseline?'Baseline':'Alternative'}: ${shopName(baseline?household.baselineShopId:household.scenarioShopId)}${minutes!==null?`, ${minutes.toFixed(1)} minutes including the return walk and shopping`:'. No shop meets all three access criteria'}.`;
    el<HTMLButtonElement>('animate-route').disabled=route.length<2;
  }
  function renderMap(){
    if(!current)return;
    const baseline=mapView.value==='baseline';const dots=el('household-dots');dots.replaceChildren();
    current.households.forEach(h=>{const p=point(h.nodeId), c=document.createElementNS(svgNS,'circle');const angle=h.id*2.399963;const r=8+Math.floor(h.id/25)%4*4;c.setAttribute('cx',String(p.x+Math.cos(angle)*r));c.setAttribute('cy',String(p.y+Math.sin(angle)*r));c.setAttribute('r','3.5');c.setAttribute('class',(baseline?h.baselineShopId:h.scenarioShopId)?'household-dot has-access':'household-dot lacks-access');dots.append(c);});
    document.querySelectorAll<SVGElement>('[data-map-shop]').forEach(g=>g.classList.toggle('upgraded-shop',!baseline&&current!.settings.selectedShopIds.includes(g.dataset.mapShop!)));
    renderHousehold();
  }
  function row(values:string[],header=true){const tr=document.createElement('tr');values.forEach((value,i)=>{const cell=document.createElement(i===0&&header?'th':'td');if(i===0&&header)cell.setAttribute('scope','row');cell.textContent=value;tr.append(cell);});return tr;}
  function render(result:ScenarioResult){
    current=result;results.hidden=false;error.hidden=true;
    el('baseline-access').textContent=String(result.baseline.accessible);el('alternative-access').textContent=String(result.scenario.accessible);el('access-change').textContent=sign(result.scenario.accessible-result.baseline.accessible);
    status.textContent=`Scenario complete. ${result.baseline.accessible} households with baseline access; ${result.scenario.accessible} under the alternative. Setup allocation ${pounds(result.cost)}.`;
    const groups=el('group-results');groups.replaceChildren();for(const p of PROFILES){const a=result.baseline.groups.find(g=>g.id===p.id)!,b=result.scenario.groups.find(g=>g.id===p.id)!;groups.append(row([p.name,`${a.accessible} / ${a.total}`,`${b.accessible} / ${b.total}`,sign(b.accessible-a.accessible)]));}
    const mins=(n:number|null)=>n===null?'not available':`${n.toFixed(1)} minutes`;
    el('travel-summary').textContent=`Median time among households with modelled access: baseline ${mins(result.baseline.medianMinutes)}; alternative ${mins(result.scenario.medianMinutes)}. Includes the return walk and 10 minutes shopping. The accessible groups can differ between scenarios, so this is not a paired change in journey time.`;
    el('population-variation').textContent=`Across ${result.repetitions} paired synthetic population draws, the central 80% range is ${result.variation.baselineLow.toFixed(0)}–${result.variation.baselineHigh.toFixed(0)} households with baseline access and ${result.variation.scenarioLow.toFixed(0)}–${result.variation.scenarioHigh.toFixed(0)} under the alternative.`;
    const sensitivity=el('sensitivity-results');sensitivity.replaceChildren();result.sensitivity.forEach(s=>sensitivity.append(row([s.assumption===1?'Central time allowance':`${Math.round(Math.abs(s.assumption-1)*100)}% ${s.assumption<1?'less':'more'} time`,`${s.baselineAccessible} / 200`,`${s.scenarioAccessible} / 200`])));
    const previous=Number(inspector.value)||0;inspector.replaceChildren();result.households.forEach((h,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=`Household ${h.id} · ${PROFILES.find(p=>p.id===h.profileId)!.name}${!h.scenarioShopId?' · no access':''}`;inspector.append(option);});inspector.value=String(Math.min(previous,result.households.length-1));inspector.disabled=false;
    renderMap();comparison();
  }
  worker.addEventListener('message',(event:MessageEvent<{id:number;result?:ScenarioResult;error?:string}>)=>{if(event.data.id!==runId)return;if(event.data.result)render(event.data.result);else{clearResult();error.textContent=event.data.error??'The scenario could not be calculated.';error.hidden=false;status.textContent='Scenario not run. Check the settings.';}});
  worker.addEventListener('error',()=>{clearResult();error.textContent='The scenario worker could not run. Refresh the page and try again.';error.hidden=false;status.textContent='Scenario unavailable.';});
  el<HTMLFieldSetElement>('scenario-controls').disabled=false;
  el('scenario-form').addEventListener('submit',event=>event.preventDefault());
  el('scenario-form').addEventListener('change',queueRun);
  [budget,price].forEach(input=>input.addEventListener('input',()=>{updateLabels();queueRun();}));
  el('scenario-preset').addEventListener('click',()=>{budget.value='6000';price.value='10';hours.checked=true;shopInputs.forEach(i=>i.checked=['shop-a','shop-c'].includes(i.value));queueRun();});
  el('scenario-reset').addEventListener('click',()=>{const defaults=defaultScenarioSettings();budget.value=String(defaults.budget);price.value=String(defaults.offerPrice);seed.value=String(defaults.seed);time.value=String(defaults.travelAssumption);hours.checked=false;shopInputs.forEach(i=>i.checked=false);queueRun();});
  mapView.addEventListener('change',renderMap);inspector.addEventListener('change',renderHousehold);
  el('animate-route').addEventListener('click',()=>{
    if(animating){stopAnimation();return;}if(!current)return;
    const h=current.households[Number(inspector.value)||0];const route=(mapView.value==='baseline'?h.baselineRoute:h.scenarioRoute).map(point);if(route.length<2)return;
    const marker=document.querySelector('#route-traveller')!;animating=true;el('animate-route').setAttribute('aria-pressed','true');el('animate-route').textContent='Pause route';marker.setAttribute('visibility','visible');
    const start=performance.now(),duration=5000;
    function frame(now:number){if(!animating)return;const progress=((now-start)%duration)/duration*(route.length-1);const i=Math.min(Math.floor(progress),route.length-2),f=progress-i;marker.setAttribute('cx',String(route[i].x+(route[i+1].x-route[i].x)*f));marker.setAttribute('cy',String(route[i].y+(route[i+1].y-route[i].y)*f));animation=requestAnimationFrame(frame);}
    animation=requestAnimationFrame(frame);
  });
  el('save-scenario').addEventListener('click',()=>{if(!current)return;saved=structuredClone(current);comparison();status.textContent='Saved current result as A for comparison in this tab.';});
  el('download-scenario').addEventListener('click',()=>{if(!current)return;const content={synthetic:true,warning:'Exploratory spatial-access calculation, not observed purchasing or health outcomes. Variation bands are not empirical confidence intervals.',evidenceRelationship:'The trial purchasing RR is not a parameter in this access model.',result:current,savedComparison:saved};const url=URL.createObjectURL(new Blob([JSON.stringify(content,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`fictional-food-scenario-${current.settings.seed}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  addEventListener('pagehide',()=>{stopAnimation();clearTimeout(timer);worker.terminate();});
  queueRun();
}
