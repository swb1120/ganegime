'use strict';
// Shared, deterministic trip rules. No network, device clock, or storage side effects.
window.TripState=Object.freeze({
 rebase(plan,input,baseStart,now){
  if(!plan?.routeAvailable)return plan;
  const delay=Math.max(0,now-baseStart),violations=[];
  const stops=plan.stops.map(t=>{
   const end=t.end+delay,arrival=t.arrival+delay;
   const marginMs=t.close?Date.parse(t.close)-end:null;
   if(marginMs!==null&&marginMs<0)violations.push({id:t.id,title:t.title,lateSeconds:Math.ceil(-marginMs/1000)});
   return {...t,arrival,end,marginMs};
  });
  const finish=plan.finish+delay,homeMarginMs=Date.parse(input.deadline)-finish;
  const margins=[{title:'최종 도착',marginMs:homeMarginMs},...stops.filter(t=>t.marginMs!==null).map(t=>({title:t.title,marginMs:t.marginMs}))];
  const tightest=margins.reduce((a,b)=>a.marginMs<=b.marginMs?a:b);
  return {...plan,stops,finish,violations,homeMarginMs,tightest,feasible:!violations.length&&homeMarginMs>=0,
   slackSeconds:Math.floor(homeMarginMs/1000),lateSeconds:Math.max(0,Math.ceil(-homeMarginMs/1000))};
 },
 margin(ms){
  if(ms===null)return '완료 마감 미설정';
  if(ms<0)return `마감 ${Math.ceil(-ms/60000)}분 초과`;
  if(ms===0)return '마감까지 여유 없음';
  if(ms<60000)return '마감까지 1분 미만 여유';
  return `마감까지 ${Math.floor(ms/60000)}분 여유`;
 },
 defer(draft,ids,now){
  const selected=new Set(ids),dropped=draft.tasks.filter(t=>selected.has(t.id));
  if(dropped.length!==selected.size||dropped.some(t=>t.required))throw new Error('필수 볼일은 미룰 수 없어요. 다시 계산해 주세요.');
  const deferred=[...(draft.deferred||[])];
  for(const t of dropped)if(!deferred.some(d=>d.id===t.id))deferred.push({...t,deferredAt:now});
  return {...draft,tasks:draft.tasks.filter(t=>!selected.has(t.id)),deferred};
 },
 restore(draft,id){
  const task=draft.deferred.find(t=>t.id===id);
  if(!task)throw new Error('복원할 볼일을 찾지 못했어요.');
  if(draft.tasks.length>=5)throw new Error('한 번에 계산할 볼일은 최대 5개예요.');
  if(draft.tasks.some(t=>t.id===id))throw new Error('이미 일정에 있는 볼일이에요.');
  const {deferredAt,...active}=task;
  return {...draft,tasks:[...draft.tasks,active],deferred:draft.deferred.filter(t=>t.id!==id)};
 },
 complete(draft,id,now){
  const task=draft.tasks.find(t=>t.id===id);
  if(!task?.place||!task.title.trim())throw new Error('볼일 이름과 장소를 먼저 선택해 주세요.');
  return {...draft,origin:{...task.place},tasks:draft.tasks.filter(t=>t.id!==id),
   completed:[...(draft.completed||[]),{...task,completedAt:now}]};
 }
});
