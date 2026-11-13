'use strict';
(() => {
 const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const localInput=ms=>new Date(ms+9*3600000).toISOString().slice(0,16),asISO=s=>s?new Date(s+'+09:00').toISOString():null;
 const time=ms=>{const d=new Date(ms+9*3600000).toISOString(),today=new Date(Date.now()+9*3600000).toISOString();return (d.slice(0,10)===today.slice(0,10)?'':d.slice(5,10).replace('-','/')+' ')+d.slice(11,16);},mins=s=>Math.ceil(s/60);
 const rpc=new Map();let seq=0;
 window.onLiveResponse=r=>{const p=rpc.get(r.id);if(!p)return;rpc.delete(r.id);clearTimeout(p.timer);r.ok?p.resolve(r.data):p.reject(Object.assign(new Error(r.data.message||'요청을 처리하지 못했습니다.'),{code:r.data.error}));};
 function api(action,payload={}){return new Promise((resolve,reject)=>{const id='r'+(++seq);if(!window.LiveNative){reject(new Error('Pleos 앱에서 클라우드 서버에 연결해 주세요.'));return}const timer=setTimeout(()=>{rpc.delete(id);reject(new Error('조회가 오래 걸립니다. 연결 상태를 확인해 주세요.'));},185000);rpc.set(id,{resolve,reject,timer});window.LiveNative.request(id,action,JSON.stringify(payload));});}
 function toast(text){$('live-toast').textContent=text;$('live-toast').classList.add('visible');clearTimeout(window.liveToastTimer);window.liveToastTimer=setTimeout(()=>$('live-toast').classList.remove('visible'),3500);}
 let draft={origin:null,destination:null,deadline:localInput(Date.now()+2*3600000),tasks:[],completed:[],deferred:[]};
 try{const s=JSON.parse(localStorage.getItem('ganegime-live-v1'));if(s&&Array.isArray(s.tasks)&&s.tasks.length<=5&&typeof s.deadline==='string')draft={...draft,...s,completed:Array.isArray(s.completed)?s.completed:[],deferred:Array.isArray(s.deferred)?s.deferred:[]};}catch{}
 let revision=0,result=null,chosen=null,busy=false,connected=false,sdk={ready:false,pending:false},sentKey='',sentPoints=[],receivedAt=0,completion=null,sentDeparture=null;
 const save=()=>localStorage.setItem('ganegime-live-v1',JSON.stringify(draft));
 const parked=()=>window.PleosNative?.canEdit?.()===true;
 function commit(next){
  try{localStorage.setItem('ganegime-live-v1',JSON.stringify(next));draft=next;return true;}
  catch{toast('기기에 저장하지 못했습니다. 변경을 적용하지 않았습니다.');return false;}
 }
 const clock=()=>result?Math.max(Date.now(),result.start+Math.max(0,performance.now()-receivedAt)):Date.now();
 const currentPlan=()=>result&&chosen?TripState.rebase(chosen,result.input,result.start,sentDeparture??clock()):null;
 function progressAction(action){
  if(!parked()||busy||sdk.pending)return;
  try{action();}catch(e){toast(e.message);}
 }
 function invalidate(){revision++;result=null;chosen=null;sentKey='';sentDeparture=null;window.PleosNative?.cancelPendingRoute?.();save();renderResult();}
 function placeLabel(p){return p?`<strong>${esc(p.name)}</strong><small>${esc(p.address)}</small>`:'<span class="muted">장소를 선택하세요</span>';}
 function renderInputs(){
  $('origin-label').innerHTML=placeLabel(draft.origin);$('destination-label').innerHTML=placeLabel(draft.destination);$('live-deadline').value=draft.deadline;
  $('live-tasks').innerHTML=draft.tasks.map((t,i)=>`<article class="task" data-task="${esc(t.id)}"><div class="task-heading"><span class="task-number">${i+1}</span><input data-field="title" value="${esc(t.title)}" maxlength="80" placeholder="예: 약 찾기, 장보기" aria-label="볼일 ${i+1} 이름"><button data-remove="${esc(t.id)}" aria-label="볼일 ${i+1} 삭제">×</button></div><div class="place-row"><div class="place-label">${placeLabel(t.place)}</div><button data-search-slot="${esc(t.id)}">상점 검색</button></div><div class="task-fields"><label>걸리는 시간 (분)<input data-field="duration" type="number" min="1" max="180" value="${t.duration}" aria-label="볼일 ${i+1} 처리시간"></label><label>마쳐야 할 시각 (선택)<input data-field="close" type="datetime-local" value="${esc(t.close||'')}" aria-label="볼일 ${i+1} 완료 마감"></label></div><div class="checks"><label><input data-field="required" type="checkbox" ${t.required?'checked':''}> 오늘 필수</label><label><input data-field="last" type="checkbox" ${t.last?'checked':''}> 마지막에 방문</label></div><button class="complete-task" data-complete="${esc(t.id)}" ${!t.place||!t.title.trim()||busy||sdk.pending?'disabled':''}>이 볼일 완료</button></article>`).join('')||'<p class="muted">들를 곳이 없으면 목적지까지 계산합니다.</p>';
  $('task-count').textContent=`${draft.tasks.length} / 5개`;$('add-task').disabled=draft.tasks.length>=5;
  $('completed-history').innerHTML=draft.completed.length?draft.completed.map(t=>`<p>✓ ${esc(typeof t==='string'?t:t.title)}${typeof t==='object'?`<small> ${time(t.completedAt)} 완료, ${esc(t.place?.name||'')}</small>`:''}</p>`).join(''):'<p class="muted">완료한 볼일이 없습니다.</p>';
  $('deferred-count').textContent=draft.deferred.length;
  $('deferred-tasks').innerHTML=draft.deferred.length?draft.deferred.map(t=>`<div class="deferred-item"><div><strong>${esc(t.title)}</strong><p>${esc(t.place?.name||'장소 미선택')}, 처리 ${t.duration}분</p><small>기존 마감: ${t.close?time(Date.parse(t.close+'+09:00')):'미설정'}</small></div><button data-restore="${esc(t.id)}" ${busy||sdk.pending||draft.tasks.length>=5?'disabled':''}>다시 추가</button></div>`).join(''):'<p class="muted">미룬 볼일이 없습니다.</p>';
 }
 function requestInput(){
  if(!draft.origin||!draft.destination)throw new Error('출발지와 최종 목적지를 검색해 선택해 주세요.');
  if(draft.tasks.some(t=>!t.title.trim()||!t.place||!Number.isInteger(t.duration)||t.duration<1||t.duration>180))throw new Error('각 볼일의 이름, 상점, 처리시간(1~180분)을 확인해 주세요.');
  return {origin:draft.origin,destination:draft.destination,deadline:asISO(draft.deadline),tasks:draft.tasks.map(t=>({...t,close:asISO(t.close)}))};
 }
 function routePoints(){
  if(!chosen||!result)return [];
  const points=chosen.stops.map(t=>({...t.place,taskIds:[t.id],task:t.title,isFinal:false}));points.push({...result.input.destination,taskIds:[],task:'최종 목적지',isFinal:true});
  const compact=[];for(const p of points){const prev=compact.at(-1);if(prev&&prev.lat===p.lat&&prev.lon===p.lon){prev.taskIds.push(...p.taskIds);prev.task+=', '+p.task;prev.isFinal=p.isFinal; }else compact.push({...p});}
  return compact;
 }
 const currentPoints=()=>routePoints().slice(0,3),routeKey=()=>JSON.stringify(currentPoints());
 const fresh=()=>!!result&&clock()<result.traffic.expiresAt;
 function renderNav(){
  const pts=currentPoints(),verified=sdk.phase==='verified'&&sentKey===routeKey(),zeroLeg=pts.length===1&&draft.origin?.lat===pts[0].lat&&draft.origin?.lon===pts[0].lon;
  $('live-send').disabled=!sdk.ready||sdk.pending||busy||!currentPlan()?.feasible||!fresh()||!pts.length||zeroLeg;
  $('live-open').disabled=!sdk.ready;
  document.querySelectorAll('[data-complete],[data-restore]').forEach(b=>{const t=draft.tasks.find(t=>t.id===b.dataset.complete);b.disabled=busy||sdk.pending||(b.dataset.complete?(!t?.place||!t.title.trim()):draft.tasks.length>=5)});
  document.querySelectorAll('[data-alternative]').forEach(b=>b.disabled=busy||sdk.pending);
  $('navigation-preview').innerHTML=pts.map((p,i)=>`<div class="navigation-preview-row"><strong>${i===pts.length-1?'목적지':'경유 '+(i+1)}</strong>, ${esc(p.name)}<small>${esc(p.task)}, ${esc(p.address)}</small></div>`).join('')+(pts.length&&!fresh()?'<p class="warning">교통 조회 후 5분이 지났습니다. 다시 계산해 주세요.</p>':'')+(zeroLeg?'<p class="success">출발지와 도착지가 같아 내비로 안내할 이동 구간이 없어요.</p>':'');
  if(routePoints().length>3)$('navigation-preview').innerHTML+='<p class="muted">각 볼일을 실제로 마친 뒤 ‘이 볼일 완료’를 누르면 다음 구간을 계산합니다.</p>';
 }
 window.onPleosStatus=s=>{sdk=s;if(['requested','verified'].includes(s.phase)&&sentKey&&sentDeparture===null)sentDeparture=clock();if(['error','expired','ignored','unavailable','timeout','preparing'].includes(s.phase))sentDeparture=null;if(sentKey&&!s.pending&&s.message)$('compute-message').textContent=s.message;$('native-status').textContent=s.message||'내비 연결 확인 중';$('native-log').textContent=(s.events||[]).join('\n');updateTiming();renderNav();};
 function renderResult(){
  if(!result||!chosen){$('traffic-badge').textContent='조회 전';$('live-result').innerHTML='<div class="empty"><span>↗</span><h3>아직 계산한 일정이 없습니다</h3><p>장소와 시간을 입력하고<br>‘일정 계산’을 눌러 주세요.</p></div>';renderNav();return;}
  $('traffic-badge').textContent=fresh()?'교통 조회 완료':'다시 조회 필요';
  if(!chosen.routeAvailable){$('live-result').innerHTML='<p class="warning">자동차로 갈 수 있는 경로를 찾지 못했습니다. 장소나 차량 진입점을 확인해 주세요.</p>'+alternativeHTML();renderNav();return;}
  const fastest=result.fastest;
  $('live-result').innerHTML=`<div class="metrics"><div><span>도착 예상</span><b id="finish-time" style="font-size:22px">${time(chosen.finish)}</b></div><div><span>도착 목표까지 여유</span><b id="home-margin"></b></div></div>
   <p id="feasibility-message"></p><p id="tightest-margin" class="muted"></p>
   ${chosen.dropped?.length?`<p class="warning">이번 일정에서 미루기로 선택한 볼일: ${chosen.dropped.map(t=>esc(t.title)).join(', ')}</p>`:''}
   <p class="muted"><span id="departure-time"></span> 출발 기준, ${esc(result.input.origin.name)}</p>
   ${chosen.stops.map((t,i)=>`<div class="route-stop"><span class="index">${i+1}</span><div><strong>${esc(t.title)}</strong><p class="stop-place">${esc(t.place.name)}</p><p class="stop-address">${esc(t.place.address)}</p><div class="time" data-stop-time="${esc(t.id)}">${time(t.arrival)} 도착 → ${time(t.end)} 완료</div><p class="stop-margin" data-stop-margin="${esc(t.id)}"></p><p>자동차 ${mins(t.leg.seconds)}분 + 처리 ${t.duration}분${t.close?', 마감 '+time(Date.parse(t.close)):''}</p></div></div>`).join('')}
   <div class="route-stop"><span class="index">✓</span><div><strong>${esc(result.input.destination.name)}</strong><p>${esc(result.input.destination.address)}</p><div class="time"><span id="destination-time">${time(chosen.finish)}</span> 최종 도착, 마지막 이동 ${mins(chosen.homeLeg.seconds)}분</div></div></div>
   ${!chosen.dropped&&fastest?`<div class="comparison"><b>이동시간만 따졌을 때와 비교</b><p>이동시간만 최소화: ${mins(fastest.driveSeconds)}분 이동, 마감 초과 ${fastest.violations.length}건${fastest.lateSeconds?', 최종 도착 '+mins(fastest.lateSeconds)+'분 초과':''}<br>추천 일정: ${mins(chosen.driveSeconds)}분 이동, 마감 초과 ${chosen.violations.length}건</p></div>`:''}
   ${chosen.preference?'<p class="muted">마감을 지키려면 마지막 방문 요청을 바꿔야 합니다.</p>':''}
   ${!chosen.feasible?alternativeHTML():''}
   <details class="calculation-details"><summary>계산에 쓴 교통 정보</summary><p class="muted">교통 조회 ${time(result.traffic.queriedAt)}, Kakao Mobility<br>총 ${(chosen.distance/1000).toFixed(1)}km, ${result.checked}개 방문 순서 비교. 일방통행을 고려해 방향별로 조회했습니다.</p></details>`;
  updateTiming();renderNav();
 }
 function updateTiming(){
  const p=currentPlan();if(!p?.routeAvailable||!$('home-margin'))return;
  $('finish-time').textContent=time(p.finish);$('destination-time').textContent=time(p.finish);
  $('home-margin').textContent=p.homeMarginMs<0?`${Math.ceil(-p.homeMarginMs/60000)}분 초과`:p.homeMarginMs===0?'여유 없음':p.homeMarginMs<60000?'1분 미만':`${Math.floor(p.homeMarginMs/60000)}분`;
  $('departure-time').textContent=(sentDeparture!==null?'내비 전송 시각 ':'')+time(sentDeparture??clock());
  $('feasibility-message').className=p.feasible?'success':'warning';
  $('feasibility-message').textContent=p.feasible?'현재 계산으로는 모든 마감을 지킬 수 있습니다.':'지금 출발하면 마감을 넘깁니다. 다시 계산해 주세요.';
  $('tightest-margin').textContent=`여유가 가장 적은 볼일: ${p.tightest.title}, ${TripState.margin(p.tightest.marginMs)}. 주차나 대기가 길어지면 여유가 줄어듭니다.`;
  document.querySelectorAll('[data-stop-time]').forEach(el=>{const t=p.stops.find(t=>t.id===el.dataset.stopTime);el.textContent=`${time(t.arrival)} 도착 → ${time(t.end)} 완료`});
  document.querySelectorAll('[data-stop-margin]').forEach(el=>{const t=p.stops.find(t=>t.id===el.dataset.stopMargin);el.textContent=TripState.margin(t.marginMs);el.classList.toggle('at-risk',t.marginMs!==null&&t.marginMs<300000)});
 }
 function alternativeHTML(){return (result?.alternatives||[]).map((p,i)=>`<div class="alternative"><p><b>${p.dropped.map(t=>esc(t.title)).join(', ')}</b> 미루면 ${time(p.finish)} 도착</p><button data-alternative="${i}">이 볼일 미루기</button></div>`).join('');}
 async function calculate(refresh=false,reason=''){
  if(busy)return;let payload;try{payload=requestInput();}catch(e){toast(e.message);return}
  const v=revision;busy=true;result=null;chosen=null;sentKey='';sentDeparture=null;window.PleosNative?.cancelPendingRoute?.();renderResult();$('calculate').disabled=true;$('refresh-traffic').disabled=true;$('compute-message').textContent=reason?reason+' 남은 교통을 조회하는 중…':'교통 정보를 조회하는 중…';renderNav();
  try{const r=await api('plan',{...payload,refresh});if(v!==revision){$('compute-message').textContent='조회 중 입력이 바뀌었습니다. 바뀐 조건으로 다시 계산해 주세요.';return}result=r;receivedAt=performance.now();chosen=r.best;$('compute-message').textContent=reason?reason+' 남은 일정 계산 완료':'계산 완료';renderResult();}
  catch(e){$('compute-message').textContent=(reason?reason+' 완료한 기록과 미룬 볼일은 저장했습니다. 재계산 실패: ':'')+e.message;}
  finally{busy=false;$('calculate').disabled=false;$('refresh-traffic').disabled=false;renderNav();}
 }
 let searchSlot=null,searchResults=[],searchSeq=0,searchPage=1,searchIdentity='';
 function openSearch(slot){searchSlot=slot;searchResults=[];searchSeq++;searchPage=1;searchIdentity='';$('search-results').innerHTML='';$('search-message').textContent='';$('search-more').hidden=true;$('search-title').textContent=slot==='origin'?'출발지 선택':slot==='destination'?'최종 목적지 선택':'방문할 장소 선택';$('search-query').value='';$('search-dialog').showModal();$('search-query').focus();}
 async function search(more=false){
  const query=$('search-query').value.trim(),mode=$('search-mode').value;if(query.length<2){$('search-message').textContent='검색어를 2자 이상 입력해 주세요.';return}
  const id=++searchSeq,identity=JSON.stringify([query,mode,searchSlot]),page=more&&identity===searchIdentity?searchPage+1:1;
  if(page===1){searchResults=[];$('search-results').innerHTML='';}searchIdentity=identity;$('search-more').hidden=true;$('search-message').textContent='장소 검색 중…';
  try{const r=await api('search',{query,mode,page,center:searchSlot!=='origin'?draft.origin:null});if(id!==searchSeq)return;searchPage=page;searchResults.push(...r.places);$('search-results').innerHTML=searchResults.map((p,i)=>`<article class="search-place"><div><strong>${esc(p.name)}</strong><p>${esc(p.address)}</p><small>${esc(p.category)}</small></div><button data-select-place="${i}">선택</button></article>`).join('');$('search-message').textContent=searchResults.length?'':'검색 결과가 없습니다. 지역명이나 매장명을 확인해 주세요.';$('search-more').hidden=!r.hasMore;}
  catch(e){if(id===searchSeq)$('search-message').textContent=e.message;}
 }
 async function connection(){try{const s=await api('status');connected=s.configured;$('connection').textContent=s.configured?'클라우드 연결됨':'API 키 설정 필요';if(!s.configured)$('compute-message').textContent=s.message;}catch(e){connected=false;$('connection').textContent='클라우드 연결 확인 필요';$('compute-message').textContent=e.message;}}
 document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.searchSlot)openSearch(b.dataset.searchSlot);
  if(b.dataset.remove){draft.tasks=draft.tasks.filter(t=>t.id!==b.dataset.remove);invalidate();renderInputs();}
  if(b.dataset.selectPlace!==undefined){const p=searchResults[Number(b.dataset.selectPlace)];if(!p)return;if(searchSlot==='origin'||searchSlot==='destination')draft[searchSlot]=p;else{const task=draft.tasks.find(t=>t.id===searchSlot);if(task)task.place=p;}searchSeq++;$('search-dialog').close();invalidate();renderInputs();}
  if(b.dataset.alternative!==undefined&&result)progressAction(()=>{
   const next=result.alternatives[Number(b.dataset.alternative)];if(!next)return;
   if(!TripState.rebase(next,result.input,result.start,clock()).feasible){toast('이 대안도 마감이 지났습니다. 다시 계산해 주세요.');return;}
   const changed=TripState.defer(draft,next.dropped.map(t=>t.id),Date.now());if(!commit(changed))return;
   revision++;chosen=next;result={...result,input:{...result.input,tasks:draft.tasks},fastest:null,alternatives:[]};sentKey='';renderInputs();renderResult();
   $('deferred-section').open=true;toast('미룬 볼일에 보관했습니다.');
  });
  if(b.dataset.restore)progressAction(()=>{
   if(!commit(TripState.restore(draft,b.dataset.restore)))return;
   invalidate();renderInputs();$('compute-message').textContent='일정에 다시 추가했습니다. 마감시각을 확인하고 계산해 주세요.';
  });
  if(b.dataset.complete)progressAction(()=>{
   const t=draft.tasks.find(t=>t.id===b.dataset.complete);if(!t?.place)return;
   completion={id:t.id,revision};$('complete-description').textContent=`‘${t.title}’을 마쳤나요? ${t.place.name}에서 남은 일정을 다시 계산합니다.`;
   $('complete-dialog').showModal();
  });
 });
 document.addEventListener('input',e=>{const t=e.target;if(t.id==='live-deadline'){draft.deadline=t.value;invalidate();}const card=t.closest('[data-task]');if(card&&t.dataset.field){const task=draft.tasks.find(x=>x.id===card.dataset.task);if(task){task[t.dataset.field]=t.type==='checkbox'?t.checked:t.type==='number'?Number(t.value):t.value;invalidate();}}if(t.id==='search-query'){searchSeq++;searchResults=[];$('search-results').innerHTML='';$('search-more').hidden=true;}});
 $('search-mode').onchange=()=>{searchSeq++;searchResults=[];$('search-results').innerHTML='';$('search-more').hidden=true;};
 $('add-task').onclick=()=>{if(draft.tasks.length>=5)return;draft.tasks.push({id:'task-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),title:'',place:null,duration:10,close:'',required:true,last:false});invalidate();renderInputs();};
 $('calculate').onclick=()=>calculate(false);$('refresh-traffic').onclick=()=>calculate(true);
 $('check-connection').onclick=connection;$('open-demo').onclick=()=>window.PleosNative?.openDemo();
 $('close-search').onclick=()=>{searchSeq++;$('search-dialog').close();};$('search-form').onsubmit=e=>{e.preventDefault();search(false);};$('search-more').onclick=()=>search(true);
 $('live-send').onclick=()=>{
  if(!parked()||busy||sdk.pending||!sdk.ready||!result||!chosen)return;
  sentDeparture=null;const p=currentPlan();updateTiming();renderNav();
  if(!fresh()){ $('compute-message').textContent='교통 정보가 오래됐습니다. 다시 조회한 뒤 전송해 주세요.';return; }
  if(!p?.feasible){$('compute-message').textContent='출발 직전 재검사: 기다린 시간을 반영하면 마감을 넘겨 전송하지 않았습니다.';return;}
  if($('live-send').disabled)return;
  const validForMs=Math.floor(Math.min(p.tightest.marginMs,result.traffic.expiresAt-clock()));
  if(validForMs<=0){$('compute-message').textContent='출발 가능한 시간이 지났습니다. 다시 계산해 주세요.';return;}
  sentPoints=currentPoints();sentKey=routeKey();sdk={...sdk,pending:true};renderNav();
  $('compute-message').textContent='출발 조건 확인 완료. 내비로 보내는 중…';
  const points=sentPoints.map((p,i)=>({name:sentPoints.filter(q=>q.name===p.name).length>1?`${p.name} (${i+1})`:p.name,lat:p.lat,lon:p.lon,address:p.address,poiId:''}));
  window.PleosNative.sendRoute(JSON.stringify({points,departureCheck:{checkedAt:Date.now(),validForMs}}));
 };
 $('live-open').onclick=()=>window.PleosNative.openNavigation();
 $('complete-cancel').onclick=()=>{$('complete-dialog').close();completion=null;};
 $('complete-confirm').onclick=()=>progressAction(()=>{
  const selected=completion;if(!selected||selected.revision!==revision){$('complete-dialog').close();completion=null;toast('입력이 바뀌었습니다. 완료할 볼일을 다시 확인해 주세요.');return;}
  const next=TripState.complete(draft,selected.id,Date.now());if(!commit(next))return;
  completion=null;$('complete-dialog').close();invalidate();renderInputs();calculate(true,'완료 기록 저장됨.');
 });
 setInterval(()=>{if(result){$('traffic-badge').textContent=fresh()?'교통 조회 완료':'다시 조회 필요';updateTiming();renderNav();}},1000);
 $('configure-cloud').onclick=()=>window.LiveNative?.configure?.();
 window.onCloudConfigured=()=>connection();
 renderInputs();renderResult();connection();try{window.onPleosStatus(JSON.parse(window.PleosNative.getStatus()));}catch{}
})();
