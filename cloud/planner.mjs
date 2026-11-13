export function permutations(xs){return xs.length?xs.flatMap((x,i)=>permutations(xs.filter((_,j)=>i!==j)).map(p=>[x,...p])):[[]];}
export function evaluate(tasks,input,matrix,start){
 let at=start,prev='origin',driveSeconds=0,distance=0;const stops=[],violations=[];
 for(const [i,t] of tasks.entries()){
  const leg=matrix[prev]?.[t.id];if(!leg)return {routeAvailable:false,feasible:false,stops:[],finish:null,violations:[],preference:0,driveSeconds:Infinity};
  const arrival=at+leg.seconds*1000,end=arrival+t.duration*60000;
  if(t.close && end>Date.parse(t.close))violations.push({id:t.id,title:t.title,lateSeconds:Math.ceil((end-Date.parse(t.close))/1000)});
  stops.push({...t,arrival,end,leg});at=end;driveSeconds+=leg.seconds;distance+=leg.meters;prev=t.id;
 }
 const home=matrix[prev]?.destination;if(!home)return {routeAvailable:false,feasible:false,stops:[],finish:null,violations:[],preference:0,driveSeconds:Infinity};
 const finish=at+home.seconds*1000,lateSeconds=Math.max(0,Math.ceil((finish-Date.parse(input.deadline))/1000));
 return {routeAvailable:true,feasible:!violations.length&&!lateSeconds,stops,finish,homeLeg:home,driveSeconds:driveSeconds+home.seconds,distance:distance+home.meters,violations,lateSeconds,slackSeconds:Math.floor((Date.parse(input.deadline)-finish)/1000),preference:tasks.filter((t,i)=>t.last&&i<tasks.length-1).length};
}
export function compare(a,b){return Number(!a.routeAvailable)-Number(!b.routeAvailable)||Number(!a.feasible)-Number(!b.feasible)||a.violations.length-b.violations.length||a.violations.reduce((s,v)=>s+v.lateSeconds,0)-b.violations.reduce((s,v)=>s+v.lateSeconds,0)||(a.lateSeconds||0)-(b.lateSeconds||0)||a.preference-b.preference||(a.finish||Infinity)-(b.finish||Infinity);}
export function solve(input,matrix,start){
 const all=permutations(input.tasks).map(ts=>evaluate(ts,input,matrix,start));const best=[...all].sort(compare)[0];
 const fastest=[...all].filter(p=>p.routeAvailable).sort((a,b)=>a.driveSeconds-b.driveSeconds)[0]||null;
 const optional=input.tasks.filter(t=>!t.required),alternatives=[];
 for(let mask=1;mask<(1<<optional.length);mask++){
  const dropped=optional.filter((_,i)=>mask&(1<<i)),kept=input.tasks.filter(t=>!dropped.some(d=>d.id===t.id));
  const plan=permutations(kept).map(ts=>evaluate(ts,input,matrix,start)).sort(compare)[0];
  if(plan.feasible)alternatives.push({...plan,dropped:dropped.map(t=>({id:t.id,title:t.title}))});
 }
 alternatives.sort((a,b)=>a.dropped.length-b.dropped.length||compare(a,b));
 return {best,fastest,alternatives:alternatives.slice(0,3),checked:all.length,start};
}
