const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const root=require('node:path').resolve(__dirname,'../android/app/src/main/assets')+'/';
const base=Date.parse('2026-11-13T09:00:00Z'),local=t=>new Date(t+9*3600000).toISOString().slice(0,16);
const place=i=>({id:'p'+i,name:'상점 '+i,address:'테스트 주소',lat:37.4+i*.01,lon:127.1,source:'fixture'});
const task=(i,required=true)=>({id:'task-'+i,title:'볼일 '+i,duration:5,close:local(base+1800000),required,last:false,place:place(i)});
const draft=()=>({origin:place(0),destination:place(9),deadline:local(base+7200000),tasks:[task(1),task(2,false),task(3)],completed:['이전 완료'],deferred:[]});
function setup(saved=draft()){
 const dom=new JSDOM(fs.readFileSync(root+'live.html','utf8'),{url:'https://app.ganegime.local/live.html',runScripts:'outside-only'}),w=dom.window,d=w.document;
 let now=base,mono=0,parked=true;const requests=[],sends=[],ticks=[];
 w.Date.now=()=>now;Object.defineProperty(w.performance,'now',{value:()=>mono});w.setInterval=f=>{ticks.push(f);return 1};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.localStorage.setItem('ganegime-live-v1',JSON.stringify(saved));
 w.LiveNative={request:(id,action,payload)=>{requests.push({id,action,payload:JSON.parse(payload)});if(action==='status')queueMicrotask(()=>w.onLiveResponse({id,ok:true,data:{configured:true}}));}};
 w.PleosNative={canEdit:()=>parked,getStatus:()=>JSON.stringify({ready:true,pending:false,phase:'ready'}),sendRoute:s=>sends.push(JSON.parse(s))};
 w.eval(fs.readFileSync(root+'trip-state.js','utf8'));w.eval(fs.readFileSync(root+'live.js','utf8'));
 const $=id=>d.getElementById(id),click=id=>$(id).click(),savedState=()=>JSON.parse(w.localStorage.getItem('ganegime-live-v1'));
 const reply=(data,ok=true,request=requests.filter(r=>r.action==='plan').at(-1))=>{w.onLiveResponse({id:request.id,ok,data});return new Promise(r=>setImmediate(r))};
 function fixture(request=requests.filter(r=>r.action==='plan').at(-1),opts={}){
  const input=request.payload;let at=now;const stops=input.tasks.map(t=>{const arrival=at+60000,end=arrival+t.duration*60000;at=end;return {...t,close:t.close,arrival,end,leg:{seconds:60,meters:300}}});
  const best={routeAvailable:true,feasible:true,stops,finish:at+60000,homeLeg:{seconds:60,meters:300},slackSeconds:500,violations:[],driveSeconds:(stops.length+1)*60,distance:1000,preference:0};
  return {input,start:now,checked:6,traffic:{queriedAt:now,expiresAt:now+300000},best,fastest:null,alternatives:[],...opts};
 }
 return {dom,w,d,$,click,savedState,requests,sends,reply,fixture,advance:ms=>{now+=ms;mono+=ms},rollback:ms=>now-=ms,tick:()=>ticks.forEach(f=>f()),park:value=>parked=value};
}
test('departure recheck blocks a plan which becomes late before traffic expires',async t=>{
 const x=setup();t.after(()=>x.dom.window.close());x.click('calculate');const f=x.fixture();f.best.stops[0].close=new Date(base+7*60000).toISOString();await x.reply(f);
 assert.equal(x.$('live-send').disabled,false);x.advance(120000);
 // No timer tick: the click itself must recheck, not depend on a disabled button.
 x.click('live-send');assert.equal(x.sends.length,0);assert.match(x.$('compute-message').textContent,/출발 직전 재검사/);
 assert.match(x.d.querySelector('[data-stop-margin]').textContent,/1분 초과/);
});
test('margins count down conservatively and clock rollback cannot restore slack',async t=>{
 const x=setup();t.after(()=>x.dom.window.close());x.click('calculate');const f=x.fixture();f.best.stops[0].close=new Date(base+6*60000+59000).toISOString();await x.reply(f);
 assert.match(x.d.querySelector('[data-stop-margin]').textContent,/1분 미만/);x.advance(60000);x.rollback(120000);x.tick();
 assert.equal(x.$('live-send').disabled,true);assert.match(x.d.querySelector('[data-stop-margin]').textContent,/초과/);
});
test('valid departure carries a bounded native expiry budget',async t=>{
 const x=setup();t.after(()=>x.dom.window.close());x.click('calculate');await x.reply(x.fixture());x.advance(60000);x.click('live-send');
 assert.equal(x.sends.length,1);assert.ok(x.sends[0].departureCheck.validForMs<=240000);assert.equal(x.sends[0].points.length,3);
 x.click('live-send');assert.equal(x.sends.length,1);
});
test('choosing an alternative durably archives the full optional task and preserves it through completion',async t=>{
 const x=setup();t.after(()=>x.dom.window.close());x.click('calculate');const f=x.fixture(),optional=f.input.tasks[1];
 f.best.feasible=false;f.best.stops[0].close=new Date(base+30000).toISOString();
 f.alternatives=[{...f.best,feasible:true,stops:f.best.stops.filter(t=>t.id!==optional.id).map(t=>({...t,close:null})),dropped:[{id:optional.id,title:optional.title}]}];
 await x.reply(f);x.d.querySelector('[data-alternative]').click();let s=x.savedState();
 assert.equal(s.tasks.length,2);assert.equal(s.deferred[0].place.lat,optional.place.lat);assert.equal(s.deferred[0].duration,5);assert.equal(s.deferred[0].close,draft().tasks[1].close);
 x.d.querySelector('[data-complete]').click();assert.equal(x.savedState().completed.length,1);x.click('complete-confirm');
 s=x.savedState();assert.equal(s.tasks.length,1);assert.equal(s.deferred.length,1);assert.equal(s.completed.length,2);assert.equal(s.origin.id,place(1).id);
 const req=x.requests.at(-1);assert.equal(req.payload.refresh,true);assert.equal(req.payload.tasks.length,1);assert.equal(req.payload.origin.id,place(1).id);
 await x.reply(x.fixture());assert.match(x.$('compute-message').textContent,/남은 일정 계산 완료/);
 x.d.querySelector('[data-restore]').click();assert.equal(x.savedState().tasks.length,2);assert.equal(x.savedState().deferred.length,0);assert.equal(x.$('live-send').disabled,true);
});
test('completion is persisted even when recalculation fails; retry does not complete twice',async t=>{
 const x=setup();t.after(()=>x.dom.window.close());x.d.querySelector('[data-complete]').click();x.click('complete-confirm');
 assert.equal(x.savedState().tasks.length,2);x.click('complete-confirm');assert.equal(x.savedState().completed.length,2);
 await x.reply({message:'인터넷 연결 오류'},false);assert.match(x.$('compute-message').textContent,/기록과 미룬 볼일은 저장/);assert.equal(x.savedState().tasks.length,2);
 x.click('calculate');await x.reply(x.fixture());assert.equal(x.savedState().completed.length,2);
});
test('cancel and driving lock cannot record a completion',t=>{
 const x=setup();t.after(()=>x.dom.window.close());x.d.querySelector('[data-complete]').click();x.click('complete-cancel');assert.equal(x.savedState().tasks.length,3);
 x.d.querySelector('[data-complete]').click();x.park(false);x.click('complete-confirm');assert.equal(x.savedState().tasks.length,3);
});
test('storage failure leaves completion and original origin untouched',t=>{
 const x=setup();t.after(()=>x.dom.window.close());x.d.querySelector('[data-complete]').click();x.w.Storage.prototype.setItem=()=>{throw Error('quota')};x.click('complete-confirm');
 assert.equal(x.savedState().tasks.length,3);assert.equal(x.savedState().origin.id,place(0).id);assert.match(x.$('live-toast').textContent,/変更|변경을 적용하지/);
});
test('restored tasks survive reload with their old deadlines; active task cap applies',t=>{
 const data=draft();data.deferred=[task(4,false)];const x=setup(data);t.after(()=>x.dom.window.close());x.d.querySelector('[data-restore]').click();
 const y=setup(x.savedState());t.after(()=>y.dom.window.close());assert.equal(y.savedState().tasks[3].close,data.deferred[0].close);
 const full={...draft(),tasks:[1,2,3,4,5].map(i=>task(i)),deferred:[task(6,false)]},z=setup(full);t.after(()=>z.dom.window.close());assert.equal(z.d.querySelector('[data-restore]').disabled,true);
});
test('last completion calculates only the final destination and records actual completion time',async t=>{
 const data=draft();data.tasks=[task(1)];const x=setup(data);t.after(()=>x.dom.window.close());x.advance(600000);x.d.querySelector('[data-complete]').click();x.click('complete-confirm');
 const req=x.requests.at(-1);assert.equal(req.payload.tasks.length,0);assert.equal(x.savedState().completed.at(-1).completedAt,base+600000);
 await x.reply(x.fixture());assert.equal(x.d.querySelectorAll('[data-complete]').length,0);x.click('live-send');assert.equal(x.sends[0].points.length,1);
});
test('edited inputs reject late calculation responses and required tasks cannot be deferred',async t=>{
 const x=setup();t.after(()=>x.dom.window.close());x.click('calculate');const f=x.fixture(),title=x.d.querySelector('[data-field=title]');title.value='수정';title.dispatchEvent(new x.w.Event('input',{bubbles:true}));await x.reply(f);
 assert.equal(x.$('live-send').disabled,true);assert.match(x.$('compute-message').textContent,/입력이 바뀌/);
 assert.throws(()=>x.w.TripState.defer(draft(),['task-1'],base),/필수/);
});
