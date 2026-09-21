import type { FoodAnalysis } from '../lib/learning-types';
const data = document.querySelector('#food-analysis-data');
if (data) {
  const analysis: FoodAnalysis = JSON.parse(data.textContent!);
  const variant = document.querySelector<HTMLSelectElement>('#analysis-select')!;
  const outcome = document.querySelector<HTMLSelectElement>('#outcome-select')!;
  const show = document.querySelector<HTMLInputElement>('#show-pooled')!;
  const baseline = document.querySelector<HTMLInputElement>('#baseline-risk')!;
  function render() {
    const selected = analysis.syntheses.find(s=>s.id===variant.value)!;
    const measured = outcome.value==='purchase';
    document.querySelectorAll<HTMLElement>('[data-analysis]').forEach(section=>section.hidden=section.dataset.analysis!==selected.id);
    document.querySelector<HTMLElement>('#quantitative-results')!.hidden=!measured;
    document.querySelector<HTMLElement>('#unmeasured-outcome')!.hidden=measured;
    variant.disabled=!measured; show.disabled=!measured;
    document.querySelectorAll('.forest-plot desc').forEach(description=>{
      description.textContent=`Each square marks a study risk ratio. Horizontal lines mark confidence intervals. ${show.checked?'A diamond marks the pooled result.':'Only individual study estimates are shown; the pooled diamond is hidden.'} The vertical line at 1 means no difference. Exact values and sources are in the table below. Equal-size study markers do not show analysis weights.`;
    });
    document.querySelectorAll<SVGElement>('[data-pooled-row]').forEach(el=>el.setAttribute('display',show.checked?'inline':'none'));
    document.querySelectorAll<HTMLElement>('[data-pooled-summary]').forEach(el=>el.hidden=!show.checked);
    document.querySelector<HTMLElement>('#absolute-panel')!.hidden=!show.checked;
    document.querySelector('#analysis-status')!.textContent=measured
      ? `${selected.k} fictional trials. ${selected.id==='all'?'Main analysis':'Sensitivity analysis excluding Trial 06'}. ${show.checked?'Pooled estimate shown.':'Individual study estimates only; pooled estimate hidden.'}`
      : 'No synthetic data for diet quality or health outcomes. No effect estimate is available.';
    const b=Number(baseline.value);
    document.querySelector('#baseline-risk-value')!.textContent=String(b);
    document.querySelector('#absolute-rate')!.textContent=(b*selected.rr).toFixed(1);
    document.querySelector('#absolute-ci')!.textContent=`${(b*selected.ciLow).toFixed(1)}–${(b*selected.ciHigh).toFixed(1)} per 100 using the pooled confidence limits`;
    const difference=b*(selected.rr-1);
    document.querySelector('#absolute-difference')!.textContent=`${Math.abs(difference).toFixed(1)} ${difference>=0?'more':'fewer'} per 100 under these assumptions`;
  }
  [variant,outcome,show].forEach(control=>control.addEventListener('change',render));
  baseline.addEventListener('input',render);
  outcome.disabled=false;
  baseline.disabled=false;
  render();
}
