const assert=require('node:assert/strict');
const P=require('../app/src/main/assets/planner.js');
let count=0;
function test(name,f){f();console.log('PASS '+name);count++;}
test('기본 예제: 마감 충족, 마트 마지막, 19:15 귀가',()=>{const r=P.solve(P.defaults());assert.equal(r.best.finish,1155);assert.equal(r.best.feasible,true);assert.deepEqual(r.best.stops.map(t=>t.id),['laundry','parcel','market']);assert.equal(r.checked,6);});
test('마감은 도착이 아니라 완료 기준',()=>{const s=P.defaults();s.tasks[0].close=1094;assert.equal(P.solve(s).best.feasible,false);assert.ok(P.solve(s).best.violations.some(v=>v.id==='laundry'));});
test('20분 지연 후 완료 기록 유지 + 선택 볼일만 제외',()=>{const s=P.delayedDemo(),r=P.solve(s);assert.equal(s.now,1115);assert.equal(r.best.finish,1175);assert.equal(r.best.late,15);assert.ok(r.best.stops.every(t=>t.id!=='laundry'));assert.equal(r.alternatives[0].finish,1155);assert.deepEqual(r.alternatives[0].dropped.map(t=>t.id),['parcel']);});
test('모두 필수이고 시간이 부족하면 대안을 꾸며내지 않음',()=>{const s=P.delayedDemo();s.tasks.forEach(t=>t.required=true);const r=P.solve(s);assert.equal(r.best.feasible,false);assert.equal(r.alternatives.length,0);});
test('대안 적용 후 필수 일 유지',()=>{const s=P.delayedDemo();s.deferred=['parcel'];const r=P.solve(s);assert.equal(r.best.feasible,true);assert.deepEqual(r.best.stops.map(t=>t.id),['market']);});
test('빈 목록도 귀가 경로 계산',()=>{const s=P.defaults();s.tasks=[];const r=P.solve(s);assert.equal(r.best.finish,1100);assert.equal(r.best.stops.length,0);});
test('완료할 때마다 시간·위치·남은 목록 갱신',()=>{let s=P.defaults();for(let i=0;i<3;i++){s=P.advance(s,P.solve(s).best.stops[0]);}assert.equal(s.completed.length,3);const r=P.solve(s);assert.equal(r.best.stops.length,0);assert.equal(r.best.finish,1155);});
test('다섯 볼일의 120가지 순서 계산',()=>{const s=P.defaults();s.deadline=1439;s.tasks.push({id:'p',title:'약',place:'pharmacy',duration:5,close:null,required:false,last:false},{id:'c',title:'커피',place:'cafe',duration:5,close:null,required:false,last:false});assert.equal(P.solve(s).checked,120);});
test('귀가 목표 변경에 따라 가능 여부 변경',()=>{const s=P.defaults();s.deadline=1140;assert.equal(P.solve(s).best.feasible,false);s.deadline=1200;assert.equal(P.solve(s).best.feasible,true);});
test('동일 장소의 서로 다른 볼일: 이동 0분, 처리시간 별도',()=>{const s=P.defaults();s.tasks=[{id:'a',title:'A',place:'market',duration:10,close:null,required:true,last:false},{id:'b',title:'B',place:'market',duration:5,close:null,required:true,last:false}];const r=P.solve(s);assert.equal(r.best.stops[1].leg,0);assert.equal(r.best.finish,1113);});
console.log(`${count} scenario tests passed`);
