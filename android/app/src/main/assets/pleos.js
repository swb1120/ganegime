/* Local-only bridge: planning stays in planner.js; routing is performed by NaviHelper. */
(() => {
  const style=document.createElement('style');style.textContent=`
  #pleos-launch{position:fixed;bottom:24px;right:28px;z-index:30;box-shadow:0 8px 30px #153d3240}
  #pleos-dialog{width:min(1000px,94vw);max-height:92vh;padding:30px;border:0;border-radius:22px;color:#153d32;background:#fafbf5;overflow:auto}
  #pleos-dialog::backdrop{background:#102c26aa} .geo-row{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:12px;margin:12px 0}.geo-row input{width:100%}
  .pleos-status{padding:16px;background:#e6eddc;border-radius:12px;margin:16px 0}.pleos-error{background:#ffe7d8}
  #pleos-route{padding:16px;background:white;border-radius:12px;margin:16px 0;font-size:18px;line-height:1.8}
  #pleos-log{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;max-height:200px;overflow:auto}
  #pleos-next[hidden]{display:none!important}
  .pleos-label{font-weight:700;margin-top:20px} #pleos-dialog button{min-height:48px} .geo-row label{font-size:12px}
  `;document.head.append(style);
  document.body.insertAdjacentHTML('beforeend',`<button id="pleos-launch" class="button primary">↗ Pleos 내비로 보내기</button>
  <dialog id="pleos-dialog"><div class="dialog-head"><div><h2>차량 내비 연결</h2></div><button class="icon-button" id="pleos-close" aria-label="닫기">×</button></div>
  <p class="small muted">일정 계산은 고정 이동시간을 사용해요. 아래 좌표를 내비에 전달하면 실제 경로는 Pleos 내비가 계산합니다.</p>
  <div id="pleos-status" class="pleos-status" role="status" aria-live="polite"></div>
  <p id="pleos-plan-note"></p><div id="pleos-route"></div>
  <details id="pleos-coordinates"><summary>내비에 보낼 시연 장소, 좌표 확인 및 수정</summary><p class="small muted">기존 세탁소, 마트는 가상 장소입니다. 현재는 서울, 판교의 시연 좌표에 연결했으며 실제 상점 위치, 주차 진입점이 아닙니다. 최종 목적지도 집 대신 양재 시연 좌표를 사용합니다. 실제 방문하려면 장소명, 좌표를 수정해 주세요.</p><div id="pleos-geo"></div><button id="pleos-save-geo" class="button">좌표 저장 및 경로 갱신</button></details>
  <div class="button-row" style="margin-top:20px"><button id="pleos-send" class="button primary">이 순서로 내비에 전송</button><button id="pleos-open" class="button">내비 화면 열기</button><button id="pleos-next" class="button" hidden>현재 구간 도착 확인 → 다음 구간</button></div>
  <p class="small muted" id="pleos-segments"></p><details><summary>SDK 응답, 진단 기록</summary><pre id="pleos-log"></pre></details></dialog>`);
  const $=id=>document.getElementById(id);
  const defaults={
    laundry:{name:'판교 시연 지점 A',lat:37.41275833,lon:127.09481944},
    parcel:{name:'판교 시연 지점 B',lat:37.4018,lon:127.1085},
    market:{name:'양재 시연 지점 C',lat:37.4802,lon:127.0348},
    pharmacy:{name:'양재 시연 지점 D',lat:37.4842,lon:127.0301},
    cafe:{name:'양재 시연 지점 E',lat:37.4881,lon:127.0351},
    home:{name:'양재 최종 목적지, 시연',lat:37.48544722,lon:127.03636666}
  };
  let geo=JSON.parse(JSON.stringify(defaults));try{const saved=JSON.parse(localStorage.getItem('ganegime-geo-v2'));if(saved && Object.keys(defaults).every(k=>saved[k]&&Number.isFinite(saved[k].lat)&&Number.isFinite(saved[k].lon)))geo=saved;}catch{}
  let queue=[],segment=0,sdk={ready:false,pending:false},feasible=false,planKey='',sentKey='';
  function current(){return queue.slice(segment*3,segment*3+3)}
  function currentKey(){return JSON.stringify(current())}
  function draw(){
    const points=current(),remaining=Math.max(0,queue.length-(segment+1)*3);
    $('pleos-route').innerHTML=points.map((p,i)=>`<div><strong>${i===points.length-1?'목적지':`경유 ${i+1}`}</strong>, ${esc(p.task)} → ${esc(p.name)}<span class="small muted"> (${p.lat.toFixed(6)}, ${p.lon.toFixed(6)})</span></div>`).join('');
    $('pleos-segments').textContent=`${segment+1} / ${Math.ceil(queue.length/3)||1} 구간, SDK는 목적지 1개와 경유지 최대 2곳을 지원합니다. ${remaining?`남은 ${remaining}곳은 현재 구간에 도착한 뒤 다음 구간으로 전송합니다.`:'이 구간에 최종 목적지가 포함됩니다.'} 구간 전환은 자동으로 진행되지 않습니다.`;
    $('pleos-send').disabled=!sdk.ready||sdk.pending||!feasible||!points.length;
    $('pleos-open').disabled=!sdk.ready;
    $('pleos-next').hidden=!(remaining && sdk.phase==='verified' && sentKey===currentKey());
    $('pleos-next').disabled=sdk.pending;
  }
  window.onPleosStatus=s=>{sdk=s;$('pleos-status').textContent=s.message||'연결 확인 중';$('pleos-status').classList.toggle('pleos-error',['error','timeout','unavailable'].includes(s.phase));$('pleos-log').textContent=(s.events||[]).join('\n');draw();};
  function loadPlan(){
    const result=P.solve(state);feasible=result.best.feasible;
    const nextQueue=[...result.best.stops.map(t=>({...geo[t.place],place:t.place,task:t.title})),{...geo.home,place:'home',task:'최종 목적지'}];
    const nextKey=JSON.stringify([state,nextQueue]);
    if(planKey!==nextKey){queue=nextQueue;segment=0;sentKey='';planKey=nextKey;}
    $('pleos-plan-note').textContent=feasible?'현재 추천 일정의 미완료 볼일을 순서대로 담았어요.':'현재 일정에 마감, 귀가시간 충돌이 있어요. 일정 변경 화면에서 충돌을 해결하면 전송할 수 있어요.';
    const keys=[...new Set(queue.map(p=>p.place))];
    $('pleos-geo').innerHTML=keys.map(k=>`<div class="pleos-label">${esc(P.places[k].name)}</div><div class="geo-row" data-place="${k}"><label>내비 표시 이름<input data-field="name" value="${esc(geo[k].name)}" maxlength="100"></label><label>위도<input data-field="lat" type="number" step="any" value="${geo[k].lat}"></label><label>경도<input data-field="lon" type="number" step="any" value="${geo[k].lon}"></label></div>`).join('');draw();
  }
  $('pleos-launch').onclick=()=>{if(!sdk.pending)loadPlan();$('pleos-dialog').showModal();};
  $('pleos-close').onclick=()=>$('pleos-dialog').close();
  $('pleos-save-geo').onclick=()=>{
    if(sdk.pending){notify('내비 응답을 기다린 후 수정해 주세요.');return}
    const next=JSON.parse(JSON.stringify(geo));
    for(const row of $('pleos-geo').querySelectorAll('.geo-row')){
      const k=row.dataset.place,name=row.querySelector('[data-field=name]').value.trim();
      const latText=row.querySelector('[data-field=lat]').value,lonText=row.querySelector('[data-field=lon]').value,lat=Number(latText),lon=Number(lonText);
      if(!name||!latText||!lonText||!Number.isFinite(lat)||!Number.isFinite(lon)||lat < -90||lat>90||lon < -180||lon>180){notify('장소 이름과 유효한 위도, 경도를 입력해 주세요.');return}
      next[k]={name,lat,lon,poiId:'',address:''};
    }
    geo=next;localStorage.setItem('ganegime-geo-v2',JSON.stringify(geo));loadPlan();notify('내비에 전달할 좌표를 저장했어요.');
  };
  $('pleos-send').onclick=()=>{if(!sdk.ready||sdk.pending||!feasible)return;sdk.pending=true;sentKey=currentKey();draw();window.PleosNative.sendRoute(JSON.stringify({points:current()}));};
  $('pleos-open').onclick=()=>window.PleosNative.openNavigation();
  $('pleos-next').onclick=()=>{if(sdk.phase!=='verified'||sdk.pending||sentKey!==currentKey()||(segment+1)*3>=queue.length)return;segment++;sentKey='';sdk.phase='ready';draw();$('pleos-status').textContent='다음 구간을 준비했어요. 장소를 확인하고 전송해 주세요.';};
  loadPlan();
  if(window.PleosNative?.openLive){const back=document.createElement('button');back.textContent='실제 장소로 돌아가기';back.className='button';back.style.cssText='position:fixed;bottom:24px;left:20px;z-index:30;font-size:12px';back.onclick=()=>window.PleosNative.openLive();document.body.append(back);}
  try{window.onPleosStatus(JSON.parse(window.PleosNative.getStatus()));}catch{window.onPleosStatus({ready:false,phase:'unavailable',message:'Pleos 안드로이드 앱에서 사용할 수 있어요.'});}
})();
