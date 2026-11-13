const UPSTREAM='https://ganegime-cloud-api.dylanjang03.chatgpt.site';
const allowed=new Set(['/status','/search','/plan']);
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function createGateway({fetchImpl=fetch,now=Date.now}={}){
 const counters=new Map();
 return async(request,env)=>{
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/health')return json(200,{service:'ganegime-review-access',version:'0.6.1'});
  if(request.method!=='POST'||!allowed.has(url.pathname)||url.search)return json(404,{error:'NOT_FOUND',message:'지원하지 않는 요청입니다.'});
  if(!env.UPSTREAM_SERVICE_TOKEN||!env.REVIEW_CODE_SHA256||!env.REVIEW_EXPIRES_AT)return json(503,{error:'UNAVAILABLE',message:'심사용 접속 준비 중입니다.'});
  const token=request.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
  if(!/^review-[A-Za-z0-9_-]{32,80}$/.test(token))return json(401,{error:'REVIEW_ACCESS',message:'심사용 접속 코드를 확인해 주세요.'});
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(v=>v.toString(16).padStart(2,'0')).join('');
  let mismatch=digest.length^env.REVIEW_CODE_SHA256.length;
  for(let i=0;i<digest.length;i++)mismatch|=digest.charCodeAt(i)^(env.REVIEW_CODE_SHA256.charCodeAt(i)||0);
  if(mismatch)return json(401,{error:'REVIEW_ACCESS',message:'심사용 접속 코드가 일치하지 않습니다.'});
  const expiry=Date.parse(env.REVIEW_EXPIRES_AT);
  if(!Number.isFinite(expiry)||now()>=expiry)return json(403,{error:'REVIEW_EXPIRED',message:'심사용 접속 기간이 끝났습니다. 제출자에게 연장을 요청해 주세요.'});
  if(request.headers.has('Origin'))return json(403,{error:'APP_ONLY',message:'심사용 Android 앱에서 연결해 주세요.'});
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json(400,{error:'INVALID_INPUT',message:'JSON 요청이 필요합니다.'});
  if(Number(request.headers.get('Content-Length'))>48000)return json(413,{error:'TOO_LARGE',message:'요청이 너무 큽니다.'});
  const bucket=counters.get(url.pathname)||{at:now(),count:0};
  if(now()-bucket.at>=60000){bucket.at=now();bucket.count=0;}bucket.count++;counters.set(url.pathname,bucket);
  if(bucket.count>(url.pathname==='/plan'?12:80))return json(429,{error:'RATE_LIMIT',message:'요청이 많습니다. 1분 후 다시 시도해 주세요.'});
  const raw=await request.text();
  if(new TextEncoder().encode(raw).length>48000)return json(413,{error:'TOO_LARGE',message:'요청이 너무 큽니다.'});
  try{JSON.parse(raw);}catch{return json(400,{error:'INVALID_INPUT',message:'요청 형식을 확인해 주세요.'});}
  try{
   // Never pass a caller-supplied URL, headers, or redirect to the private service.
   const response=await fetchImpl(UPSTREAM+url.pathname,{method:'POST',headers:{'Content-Type':'application/json','OAI-Sites-Authorization':'Bearer '+env.UPSTREAM_SERVICE_TOKEN},body:raw,redirect:'manual'});
   if(response.status>=300&&response.status<400||[401,403].includes(response.status))return json(503,{error:'UPSTREAM_ACCESS',message:'심사용 서버 연결을 확인하고 있습니다. 제출자에게 문의해 주세요.'});
   const body=await response.text();let data;
   try{data=JSON.parse(body);}catch{return json(502,{error:'UPSTREAM_RESPONSE',message:'서버 응답을 확인할 수 없습니다.'});}
   return json(response.status,url.pathname==='/status'&&response.ok?{...data,access:'review',reviewExpiresAt:env.REVIEW_EXPIRES_AT}:data);
  }catch{return json(502,{error:'UPSTREAM_UNAVAILABLE',message:'서버 연결이 지연됩니다. 잠시 후 다시 시도해 주세요.'});}
 };
}
export default {fetch:createGateway()};
