(function(root){
  'use strict';
  const P=typeof module!=='undefined'?require('./planner.js'):root.Planner;
  const clone=s=>JSON.parse(JSON.stringify(s));
  function comparison(s){
    const tasks=P.pending(s),result=P.solve(s);
    const orders=P.permutations(tasks).map(order=>P.evaluate(order,s));
    // A travel-only baseline must not use deadline, required, or preference as tie-breakers.
    const fastest=[...orders].sort((a,b)=>a.drive-b.drive)[0];
    return {input:P.evaluate(tasks,s),fastest,recommended:result.best,result,orders};
  }
  function metrics(p){return {count:p.stops.length,drive:p.drive,finish:p.finish,closeMiss:p.violations.length,closeLate:p.violations.reduce((sum,v)=>sum+v.late,0),homeLate:p.late,preferenceMiss:p.preference,feasible:p.feasible};}
  function scenario(kind){
    const before=P.defaults();let after;
    if(kind==='deadline'){
      before.tasks[0].close=1140;before.tasks[1].close=1200;
      before.tasks=[before.tasks[2],before.tasks[1],before.tasks[0]];
      after=clone(before);after.tasks.find(t=>t.id==='parcel').close=1105;
      return {kind,title:'택배 접수 마감',description:'택배 접수 마감을 20:00에서 18:25로 앞당겨 보세요.',before,after,task:'parcel',field:'close',button:'택배 마감을 18:25로 변경'};
    }
    if(kind==='duration'){
      after=clone(before);after.tasks.find(t=>t.id==='market').duration=40;
      return {kind,title:'장보기 소요시간',description:'장보기 시간이 20분에서 40분으로 늘어나는 상황이에요.',before,after,task:'market',field:'duration',button:'장보기 시간을 40분으로 변경'};
    }
    const delayed=P.delayedDemo();after=clone(delayed);after.tasks.find(t=>t.id==='parcel').required=true;
    return {kind:'required',title:'오늘 꼭 해야 하는 볼일',description:'세탁소에서 20분 늦어진 뒤, 택배를 오늘 필수로 바꿔 보세요.',before:delayed,after,task:'parcel',field:'required',button:'택배를 오늘 필수로 변경'};
  }
  function describe(before,after){
    const a=P.solve(before),b=P.solve(after),messages=[];
    const ar=a.best.stops.map(t=>t.id).join(','),br=b.best.stops.map(t=>t.id).join(',');
    if(ar!==br)messages.push('방문 순서가 바뀌었어요.');
    const diff=b.best.finish-a.best.finish;
    if(diff)messages.push(`모든 볼일을 포함한 귀가가 ${Math.abs(diff)}분 ${diff>0?'늦어져요':'빨라져요'}.`);
    if(a.best.feasible&&!b.best.feasible)messages.push('마감 또는 귀가 목표를 모두 맞추기 어려워졌어요.');
    if(!a.best.feasible&&b.best.feasible)messages.push('이제 마감과 귀가 목표를 모두 지킬 수 있어요.');
    if(a.alternatives.length&&!b.alternatives.length&&!b.best.feasible)messages.push('미룰 수 있는 대안이 없어졌어요. 필수 볼일은 유지돼요.');
    if(!b.best.feasible&&b.alternatives.length)messages.push(`${b.alternatives[0].dropped.map(t=>t.title).join(', ')} 항목을 미루면 ${P.time(b.alternatives[0].finish)}에 귀가할 수 있어요.`);
    if(!messages.length)messages.push('현재 조건에서는 방문 순서가 같습니다.');
    return {before:a,after:b,messages};
  }
  const api={clone,comparison,metrics,scenario,describe};
  if(typeof module!=='undefined')module.exports=api;else root.Showcase=api;
})(typeof window!=='undefined'?window:globalThis);
