// Synthetic sensitivity study, not field evidence or a commercial navigation comparison.
// Run: node evidence/benchmark.mjs [output directory]
import {solve} from '../cloud/planner.mjs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const output=path.resolve(process.argv[2]||'evidence/results');
await mkdir(output,{recursive:true});
const epoch=Date.parse('2026-11-13T18:00:00+09:00');
const iso=m=>new Date(epoch+m*60000).toISOString();
const names=['origin','laundry','parcel','market','destination'];
const minutes=[[0,10,12,8,20],[10,0,10,10,15],[12,10,0,10,15],[8,10,10,0,10],[20,15,15,10,0]];
const matrix=Object.fromEntries(names.map((a,i)=>[a,Object.fromEntries(names.filter(b=>a!==b).map(b=>[b,{seconds:minutes[i][names.indexOf(b)]*60,meters:0}]))]));
const design={startDelayMinutes:[0,5,10,20],parcelCloseMinutesAfter1800:[25,40,60],marketDurationMinutes:[20,30,40],homeDeadlineMinutesAfter1800:[80,95,110],laundryDuration:5,laundryCloseMinutesAfter1800:60,parcelDuration:10,inputOrder:['market','parcel','laundry'],lastPreference:'market',required:['laundry','market'],matrixMinutes:minutes,matrixNodes:names,unplannedDwellMinutesPerStop:5};
// Separate direct arithmetic checks the returned times; no production evaluate/compare reuse.
function arithmetic(order,input,start,extra=0){let clock=start,prev='origin',drive=0,miss=0;const stops=[];
 for(const t of order){const leg=matrix[prev][t.id].seconds*1000;clock+=leg;const arrival=clock;clock+=(t.duration+extra)*60000;drive+=leg/1000;if(t.close&&clock>Date.parse(t.close))miss++;stops.push({id:t.id,arrival,end:clock});prev=t.id;}
 drive+=matrix[prev].destination.seconds;clock+=matrix[prev].destination.seconds*1000;
 return {finish:clock,driveSeconds:drive,miss,feasible:miss===0&&clock<=Date.parse(input.deadline),stops};
}
function demand(condition,message){if(!condition)throw Error(message);}
const rows=[];let alternativesChecked=0;
for(const delay of design.startDelayMinutes)for(const close of design.parcelCloseMinutesAfter1800)for(const duration of design.marketDurationMinutes)for(const deadline of design.homeDeadlineMinutesAfter1800){
 const input={deadline:iso(deadline),tasks:[{id:'market',title:'장보기',duration,close:null,required:true,last:true},{id:'parcel',title:'택배 보내기',duration:10,close:iso(close),required:false,last:false},{id:'laundry',title:'세탁물 찾기',duration:5,close:iso(60),required:true,last:false}]};
 const start=epoch+delay*60000;const result=solve(input,matrix,start);
 demand(result.checked===6,'Expected all 6 full-task permutations');
 for(const plan of [result.best,result.fastest,...result.alternatives]){
  const calc=arithmetic(plan.stops,input,start);demand(calc.finish===plan.finish&&calc.driveSeconds===plan.driveSeconds&&calc.feasible===plan.feasible,'Schedule arithmetic mismatch');
  demand(calc.stops.every((s,i)=>s.arrival===plan.stops[i].arrival&&s.end===plan.stops[i].end),'Stop time mismatch');
 }
 for(const alt of result.alternatives){alternativesChecked++;demand(alt.stops.some(s=>s.id==='laundry')&&alt.stops.some(s=>s.id==='market'),'Required task dropped');}
 demand(!result.fastest.feasible||result.best.feasible,'Lost a feasible full-task order');
 const stressed=arithmetic(result.best.stops,input,start,5);
 rows.push({case:rows.length+1,startDelayMin:delay,parcelDeadlineAfter1800Min:close,marketDurationMin:duration,homeDeadlineAfter1800Min:deadline,fastestFeasible:result.fastest.feasible,recommendedFeasible:result.best.feasible,fastestDriveMin:result.fastest.driveSeconds/60,recommendedDriveMin:result.best.driveSeconds/60,extraDriveMin:(result.best.driveSeconds-result.fastest.driveSeconds)/60,fastestOrder:result.fastest.stops.map(s=>s.id).join(' > '),recommendedOrder:result.best.stops.map(s=>s.id).join(' > '),fastestMisses:result.fastest.violations.length,recommendedMisses:result.best.violations.length,alternatives:result.alternatives.length,stressFeasible:stressed.feasible});
}
const count=fn=>rows.filter(fn).length;
const plannerPath=fileURLToPath(new URL('../cloud/planner.mjs',import.meta.url));
const summary={study:'Fixed synthetic three-errand scenario sensitivity analysis',release:'0.6.3',date:'2026-11-13',cases:rows.length,design,fastestFeasible:count(r=>r.fastestFeasible),recommendedFeasible:count(r=>r.recommendedFeasible),rescuedFullTaskCases:count(r=>!r.fastestFeasible&&r.recommendedFeasible),bothFeasible:count(r=>r.fastestFeasible&&r.recommendedFeasible),bothInfeasible:count(r=>!r.fastestFeasible&&!r.recommendedFeasible),infeasibleWithOptionalAlternative:count(r=>!r.recommendedFeasible&&r.alternatives>0),infeasibleWithoutAlternative:count(r=>!r.recommendedFeasible&&r.alternatives===0),recommendedFeasibleButFailsWithFiveExtraMinutesPerStop:count(r=>r.recommendedFeasible&&!r.stressFeasible),maxExtraDriveMin:Math.max(...rows.map(r=>r.extraDriveMin)),meanExtraDriveMin:rows.reduce((a,r)=>a+r.extraDriveMin,0)/rows.length,alternativesChecked,plannerSha256:createHash('sha256').update(await readFile(plannerPath)).digest('hex'),limitations:['Synthetic inputs from one fixed travel-time matrix; not sampled users, roads, traffic, or commercial navigation products.','Full factorial set is a sensitivity check, not a population success-rate estimate.','Fastest minimizes driving time only; it is an internal baseline. Full-task completion requires all three errands.','Optional-task alternatives are reported separately and never counted as full-task successes.','Stress adds 5 minutes per stop to the already selected route without replanning; no reliability guarantee follows.','No claims about user demand, retention, time saved in the real world, or award probability.']};
const columns=Object.keys(rows[0]);
await writeFile(path.join(output,'scenarios.csv'),columns.join(',')+'\n'+rows.map(r=>columns.map(c=>r[c]).join(',')).join('\n')+'\n');
await writeFile(path.join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');
await writeFile(path.join(output,'scenarios.json'),JSON.stringify(rows,null,2)+'\n');
console.log(JSON.stringify({...summary,design:undefined,limitations:undefined},null,2));
