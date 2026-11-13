import {ApiError} from './provider.mjs';
function bad(message){throw new ApiError('INVALID_INPUT',message,400);}
export function place(p){if(!p||typeof p.name!=='string'||!p.name.trim()||p.name.length>120||typeof p.lat!=='number'||typeof p.lon!=='number'||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||p.lat<32||p.lat>40||p.lon<124||p.lon>132)bad('대한민국 내 검색 결과의 장소와 좌표를 선택해 주세요.');return {id:String(p.id||'').slice(0,150),name:p.name.trim(),lat:p.lat,lon:p.lon,address:String(p.address||'').slice(0,250),source:String(p.source||'')};}
export function validatePlan(p,now=Date.now()){
 if(!p||!Array.isArray(p.tasks)||p.tasks.length>5)bad('볼일은 최대 5개까지 계산할 수 있어요.');
 const deadline=Date.parse(p.deadline);if(!Number.isFinite(deadline)||deadline<=now||deadline>now+48*3600000)bad('최종 도착 목표를 현재 이후 48시간 이내로 입력해 주세요.');
 const ids=new Set();const tasks=p.tasks.map(t=>{
  if(!t||!/^task-[a-zA-Z0-9_-]{1,60}$/.test(t.id)||ids.has(t.id))bad('볼일 식별자가 올바르지 않아요.');ids.add(t.id);
  if(typeof t.title!=='string'||!t.title.trim()||t.title.length>80||!Number.isInteger(t.duration)||t.duration<1||t.duration>180||typeof t.required!=='boolean'||typeof t.last!=='boolean')bad('볼일 이름과 처리시간(1~180분)을 확인해 주세요.');
  if(t.close && !Number.isFinite(Date.parse(t.close)))bad('볼일 완료 마감시간을 확인해 주세요.');
  return {id:t.id,title:t.title.trim(),duration:t.duration,required:t.required,last:t.last,close:t.close||null,place:place(t.place)};
 });return {origin:place(p.origin),destination:place(p.destination),deadline:new Date(deadline).toISOString(),tasks};
}
