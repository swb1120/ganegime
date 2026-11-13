import {KakaoProvider,ApiError} from './provider.mjs';
import {solve} from './planner.mjs';
import {place,validatePlan} from './validation.mjs';

const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function invalid(message){throw new ApiError('INVALID_INPUT',message,400);}
export function createHandler({providerFactory=c=>new KakaoProvider(c),now=Date.now}={}) {
 let provider,configSignature,planBusy=false;const windows=new Map();
 return async(request,env)=>{
  try {
   const url=new URL(request.url),action=url.pathname;
   // Sites dispatch enforces owner-private access before invoking this Worker.
   // Native service access is provisioned only in app-private storage, never in the APK.
   if(request.method==='GET'&&['/','/health'].includes(action))return reply(200,{service:'ganegime-cloud',version:5,transport:'https',time:now()});
   if(request.method!=='POST'||!['/status','/search','/plan'].includes(action))return reply(404,{error:'NOT_FOUND',message:'지원하지 않는 요청이에요.'});
   if(request.headers.has('Origin'))return reply(403,{error:'FORBIDDEN',message:'연결된 차량 앱에서 요청해 주세요.'});
   if(!request.headers.get('content-type')?.startsWith('application/json'))invalid('JSON 요청이 필요합니다.');
   // Per-isolate burst protection; private platform authentication is the access boundary.
   const window=windows.get(action)||{start:now(),count:0};
   if(now()-window.start>=60000){window.start=now();window.count=0;}window.count++;windows.set(action,window);
   if(window.count>(action==='/plan'?12:80))throw new ApiError('RATE_LIMIT','요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.',429);
   if(Number(request.headers.get('content-length'))>48000)invalid('요청이 너무 큽니다.');
   const reader=request.body?.getReader();let size=0,chunks=[];
   if(reader)try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>48000){await reader.cancel();invalid('요청이 너무 큽니다.');}chunks.push(value);}}finally{reader.releaseLock();}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{invalid('요청 형식을 확인해 주세요.');}
   if(!body||typeof body!=='object'||Array.isArray(body))invalid('요청 형식을 확인해 주세요.');
   const local=env.KAKAO_REST_API_KEY||env.KAKAO_MOBILITY_REST_API_KEY||'',mobility=env.KAKAO_MOBILITY_REST_API_KEY||local;
   const signature=local+'|'+mobility;
   if(!provider||signature!==configSignature){provider=providerFactory(()=>({localKey:local,mobilityKey:mobility}));configSignature=signature;}
   if(action==='/status')return reply(200,{configured:!!local,mobilityConfigured:!!mobility,provider:'Kakao Local + Kakao Mobility',deployment:'cloud',version:5,message:local?'클라우드 연결됨 · PC를 켜두지 않아도 사용할 수 있어요.':'클라우드 서버의 API 설정이 필요해요.'});
   if(action==='/search'){
    if(typeof body.query!=='string'||body.query.trim().length<2||body.query.length>100||!['keyword','address'].includes(body.mode||'keyword'))invalid('검색어를 2~100자로 입력해 주세요.');
    if(body.page!==undefined&&(!Number.isInteger(body.page)||body.page<1||body.page>45))invalid('검색 페이지가 올바르지 않아요.');
    return reply(200,await provider.search({query:body.query.trim(),mode:body.mode,center:body.center?place(body.center):undefined,page:body.page||1}));
   }
   if(planBusy)throw new ApiError('BUSY','이동시간 조회를 완료한 뒤 다시 시도해 주세요.',409);
   const input=validatePlan(body,now());planBusy=true;
   try{
    const travel=await provider.matrix(input,{refresh:body.refresh===true}),start=now();
    if(Date.parse(input.deadline)<=start)invalid('조회 중 도착 목표 시간이 지났어요. 목표 시간을 다시 입력해 주세요.');
    return reply(200,{...solve(input,travel.matrix,start),input,traffic:{source:travel.source,queriedAt:travel.queriedAt,completedAt:travel.completedAt,expiresAt:travel.queriedAt+300000,legs:travel.legs,cachedLegs:travel.cachedLegs,assumption:'조회 시점의 교통을 각 구간에 적용. 이후 교통 변화 및 주차·도보 시간은 예측하지 않음.'}});
   }finally{planBusy=false;}
  }catch(e){return reply(e instanceof ApiError?e.status:500,{error:e instanceof ApiError?e.code:'SERVER_ERROR',message:e instanceof ApiError?e.message:'클라우드 서버에서 요청을 처리하지 못했어요.'});}
 };
}
const handle=createHandler();
export default {fetch:handle};
