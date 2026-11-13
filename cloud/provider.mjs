export class ApiError extends Error{constructor(code,message,status=502){super(message);this.code=code;this.status=status;}}
export class KakaoProvider {
 constructor(config,{fetcher=(...args)=>fetch(...args),now=Date.now}={}){this.config=config;this.fetcher=fetcher;this.now=now;this.cache=new Map();}
 async call(url,key){
  if(!key)throw new ApiError('KEY_MISSING','카카오 REST API 키가 설정되지 않았어요. 클라우드 서버의 연결 설정을 확인해 주세요.',503);
  let r;try{r=await this.fetcher(url,{headers:{Authorization:`KakaoAK ${key}`},signal:AbortSignal.timeout(12000)});}catch{throw new ApiError('NETWORK','카카오 서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 조회해 주세요.');}
  if(!r.ok){
   if(r.status===401||r.status===403)throw new ApiError('API_AUTH','카카오 API 키 또는 이 앱의 서비스 사용 권한을 확인해 주세요.',502);
   if(r.status===429)throw new ApiError('QUOTA','카카오 API 호출 한도에 도달했어요. 잠시 후 다시 시도해 주세요.',429);
   throw new ApiError('UPSTREAM','카카오 API가 요청을 처리하지 못했어요. 잠시 후 다시 조회해 주세요.');
  }
  try{return await r.json();}catch{throw new ApiError('BAD_RESPONSE','장소·교통 응답 형식이 올바르지 않아요.');}
 }
 async search({query,mode='keyword',center,page=1}){
  const c=this.config(),u=new URL(`https://dapi.kakao.com/v2/local/search/${mode==='address'?'address':'keyword'}.json`);
  u.search=new URLSearchParams({query,size:'8',page:String(page)});
  if(mode!=='address'&&center){u.searchParams.set('x',String(center.lon));u.searchParams.set('y',String(center.lat));}
  const data=await this.call(u,c.localKey);
  if(!Array.isArray(data.documents))throw new ApiError('BAD_RESPONSE','장소 검색 응답을 읽지 못했어요.');
  const places=data.documents.map((d,i)=>mode==='address'?{id:`address:${d.x}:${d.y}`,name:d.road_address?.building_name||d.address_name,address:d.road_address?.address_name||d.address_name,lat:Number(d.y),lon:Number(d.x),category:'주소',source:'Kakao Local'}:{id:String(d.id),name:d.place_name,address:d.road_address_name||d.address_name,lat:Number(d.y),lon:Number(d.x),category:d.category_name,source:'Kakao Local'}).filter(p=>p.name&&Number.isFinite(p.lat)&&Number.isFinite(p.lon));
  return {places,hasMore:data.meta?.is_end===false,page,source:'Kakao Local',queriedAt:this.now()};
 }
 async leg(a,b,{refresh=false}={}){
  if(a.lat===b.lat&&a.lon===b.lon)return {seconds:0,meters:0,fetchedAt:this.now(),sameLocation:true};
  const key=`${a.lon},${a.lat}>${b.lon},${b.lat}`,old=this.cache.get(key);
  if(!refresh&&old&&this.now()-old.fetchedAt<60000)return {...old,cached:true};
  const c=this.config(),u=new URL('https://apis-navi.kakaomobility.com/v1/directions');
  u.search=new URLSearchParams({origin:`${a.lon},${a.lat}`,destination:`${b.lon},${b.lat}`,priority:'TIME',summary:'true',alternatives:'false',roadevent:'0'});
  const data=await this.call(u,c.mobilityKey||c.localKey),r=data.routes?.[0];
  if(!r||!Number.isInteger(r.result_code))throw new ApiError('BAD_RESPONSE','자동차 경로 응답을 읽지 못했어요.');
  if(r.result_code!==0)return null;
  const s=r.summary;
  if(!s||!Number.isFinite(s.duration)||s.duration<0||!Number.isFinite(s.distance)||s.distance<0)throw new ApiError('BAD_RESPONSE','경로의 소요 시간 또는 거리가 올바르지 않아요.');
  const value={seconds:s.duration,meters:s.distance,fetchedAt:this.now(),cached:false};
  this.cache.set(key,value);if(this.cache.size>250)this.cache.delete(this.cache.keys().next().value);
  return value;
 }
 async matrix(input,{refresh=false}={}){
  const points={origin:input.origin,destination:input.destination,...Object.fromEntries(input.tasks.map(t=>[t.id,t.place]))},from=['origin',...input.tasks.map(t=>t.id)],to=[...input.tasks.map(t=>t.id),'destination'];
  const jobs=from.flatMap(a=>to.filter(b=>a!==b).map(b=>[a,b])),matrix={};let next=0,failed;
  await Promise.all(Array.from({length:Math.min(3,jobs.length)},async()=>{
   while(next<jobs.length&&!failed){const [a,b]=jobs[next++];try{const leg=await this.leg(points[a],points[b],{refresh});(matrix[a]??={})[b]=leg;}catch(e){failed=e;}}
  }));if(failed)throw failed;
  const values=Object.values(matrix).flatMap(row=>Object.values(row)).filter(Boolean),fresh=values.map(v=>v.fetchedAt);
  return {matrix,queriedAt:fresh.length?Math.min(...fresh):this.now(),completedAt:this.now(),source:'Kakao Mobility · TIME',legs:jobs.length,cachedLegs:values.filter(v=>v.cached).length};
 }
}
