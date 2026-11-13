(function (root) {
  'use strict';
  const places = {
    office:{name:'회사',x:16,y:72}, laundry:{name:'온유 세탁소',x:30,y:30},
    parcel:{name:'동네 편의점',x:51,y:47}, market:{name:'초록 마트',x:70,y:28},
    pharmacy:{name:'봄 약국',x:44,y:76}, cafe:{name:'모퉁이 카페',x:73,y:65}, home:{name:'우리 집',x:87,y:48}
  };
  const nodes = Object.keys(places);
  const rows = [[0,10,12,8,9,12,20],[10,0,10,10,12,17,15],[12,10,0,10,6,9,15],[8,10,10,0,15,8,10],[9,12,6,15,0,7,17],[12,17,9,8,7,0,8],[20,15,15,10,17,8,0]];
  function travel(a,b){return rows[nodes.indexOf(a)][nodes.indexOf(b)];}
  function minutes(s){const [h,m]=s.split(':').map(Number);return h*60+m;}
  function time(n){return (n>=1440?'다음날 ':'')+String(Math.floor(n/60)%24).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
  function defaults(){return {version:1,start:1080,deadline:1160,now:1080,anchor:'office',completed:[],deferred:[],started:false,tasks:[
    {id:'laundry',title:'세탁물 찾기',place:'laundry',duration:5,close:1110,required:true,last:false},
    {id:'parcel',title:'택배 보내기',place:'parcel',duration:10,close:null,required:false,last:false},
    {id:'market',title:'냉동식품 장보기',place:'market',duration:20,close:null,required:true,last:true}
  ]};}
  function pending(s){return s.tasks.filter(t=>!s.completed.some(c=>c.id===t.id)&&!s.deferred.includes(t.id));}
  function permutations(xs){if(!xs.length)return [[]];return xs.flatMap((x,i)=>permutations(xs.filter((_,j)=>i!==j)).map(p=>[x,...p]));}
  function evaluate(order,s){let at=s.now,prev=s.anchor,drive=0;const stops=[];const violations=[];
    order.forEach((t,i)=>{const leg=travel(prev,t.place);drive+=leg;const arrival=at+leg;const end=arrival+t.duration;
      if(t.close!==null&&end>t.close)violations.push({id:t.id,title:t.title,late:end-t.close});
      stops.push({...t,arrival,end,leg,preference:!!t.last&&i<order.length-1});at=end;prev=t.place;});
    const homeLeg=travel(prev,'home');drive+=homeLeg;const finish=at+homeLeg;
    return {stops,finish,homeLeg,drive,violations,late:Math.max(0,finish-s.deadline),slack:s.deadline-finish,preference:stops.filter(t=>t.preference).length,feasible:violations.length===0&&finish<=s.deadline};
  }
  function compare(a,b){return Number(!a.feasible)-Number(!b.feasible)||a.violations.length-b.violations.length||a.violations.reduce((n,v)=>n+v.late,0)-b.violations.reduce((n,v)=>n+v.late,0)||a.late-b.late||a.preference-b.preference||a.finish-b.finish;}
  function solve(s){const tasks=pending(s);const all=permutations(tasks).map(o=>evaluate(o,s)).sort(compare);const best=all[0];const optional=tasks.filter(t=>!t.required);const alternatives=[];
    for(let mask=1;mask<(1<<optional.length);mask++){const dropped=optional.filter((_,i)=>mask&(1<<i));const keep=tasks.filter(t=>!dropped.some(d=>d.id===t.id));const plan=permutations(keep).map(o=>evaluate(o,s)).sort(compare)[0];if(plan.feasible)alternatives.push({...plan,dropped});}
    alternatives.sort((a,b)=>a.dropped.length-b.dropped.length||compare(a,b));
    return {best,alternatives,checked:all.length,pending:tasks};
  }
  function advance(s,stop,delay=0){return {...s,started:true,anchor:stop.place,now:stop.end+delay,completed:[...s.completed,{id:stop.id,title:stop.title,place:stop.place,arrival:stop.arrival,end:stop.end+delay,delay}]};}
  function delayedDemo(){const s=defaults();return advance(s,solve(s).best.stops[0],20);}
  const api={places,travel,minutes,time,defaults,pending,permutations,evaluate,solve,advance,delayedDemo};
  if(typeof module!=='undefined')module.exports=api;else root.Planner=api;
})(typeof window!=='undefined'?window:globalThis);
