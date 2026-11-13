const assert=require('node:assert/strict');
const P=require('../app/src/main/assets/planner');
const S=require('../app/src/main/assets/showcase');
let n=0;function test(name,fn){fn();console.log('PASS '+name);n++;}
test('동일한 볼일로 비교: 빠른 경로는 40분, 추천은 42분·마감 준수',()=>{
 const s=S.scenario('deadline').after,c=S.comparison(s);
 assert.equal(c.fastest.drive,40);assert.equal(c.fastest.finish,1155);assert.equal(c.fastest.violations.length,1);assert.equal(c.fastest.violations[0].late,10);
 assert.equal(c.recommended.drive,42);assert.equal(c.recommended.finish,1157);assert.equal(c.recommended.violations.length,0);
 assert.equal(c.input.violations.length,2);assert.equal(c.input.finish,1158);
 for(const plan of [c.input,c.fastest,c.recommended])assert.deepEqual(plan.stops.map(t=>t.id).sort(),s.tasks.map(t=>t.id).sort());
});
test('마감 변경으로 실제 순서 변경, 기준 상태 불변',()=>{
 const {before,after}=S.scenario('deadline');const copy=JSON.stringify(before);const a=P.solve(before).best,b=P.solve(after).best;
 assert.deepEqual(a.stops.map(t=>t.id),['laundry','parcel','market']);assert.deepEqual(b.stops.map(t=>t.id),['parcel','laundry','market']);assert.equal(JSON.stringify(before),copy);
});
test('처리시간 +20분: 귀가 지연과 미루기 대안',()=>{const e=S.scenario('duration'),a=P.solve(e.before),b=P.solve(e.after);assert.equal(a.best.finish,1155);assert.equal(b.best.finish,1175);assert.equal(b.best.feasible,false);assert.equal(b.alternatives[0].finish,1155);assert.deepEqual(b.alternatives[0].dropped.map(t=>t.id),['parcel']);});
test('필수 여부는 전체 일정 시간을 바꾸지 않지만 대안을 제한',()=>{const e=S.scenario('required'),a=P.solve(e.before),b=P.solve(e.after);assert.equal(a.best.finish,b.best.finish);assert.equal(a.alternatives.length,1);assert.equal(b.alternatives.length,0);assert.deepEqual(e.after.completed,e.before.completed);});
test('이동시간 기준 계산은 생활 조건 변경과 무관',()=>{const e=S.scenario('deadline'),a=S.comparison(e.before),b=S.comparison(e.after);assert.deepEqual(a.fastest.stops.map(t=>t.id),b.fastest.stops.map(t=>t.id));assert.equal(a.fastest.drive,b.fastest.drive);});
test('추천과 최소 이동이 같은 경우도 그대로 반환',()=>{const c=S.comparison(P.defaults());assert.equal(c.recommended.drive,c.fastest.drive);assert.deepEqual(c.recommended.stops.map(t=>t.id),c.fastest.stops.map(t=>t.id));});
test('빈 일정·한 개·완료 제외도 동일 범위로 비교',()=>{for(const s of [P.defaults(),P.delayedDemo()]){s.tasks=s.tasks.slice(0,1);const c=S.comparison(s);for(const p of [c.input,c.fastest,c.recommended])assert.equal(p.stops.length,P.pending(s).length);}});
test('추천 불가능·선호 미충족을 숨기지 않음',()=>{const s=P.defaults();s.tasks.forEach(t=>{t.required=true;t.last=true;});s.deadline=1090;const c=S.comparison(s);assert.equal(c.recommended.feasible,false);assert.equal(c.recommended.preference,2);assert.equal(c.result.alternatives.length,0);});
console.log(n+' comparison scenario tests passed');
