import { validateSubmission } from './validation.js';
import '../../../assets/game-rules.js';
const rules = (globalThis as any).GZJUMP_RULES;
const origins = new Set(['https://deepshawn.github.io','http://localhost:4173','http://127.0.0.1:4173']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODES=['classic','daily','myth','bridge_daily','bridge_endless','bridge_myth'];
const FRUITS=['orange','lime','peach','lemon','blueberry','melon'];
class ApiError extends Error { constructor(public status:number,message:string){super(message);} }
const hex=(data:ArrayBuffer)=>Array.from(new Uint8Array(data),b=>b.toString(16).padStart(2,'0')).join('');
const sha=async(s:string)=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
async function readBody(req:Request){
  const reader=req.body?.getReader();if(!reader)throw new ApiError(400,'缺少请求内容');
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>393216){await reader.cancel();throw new ApiError(413,'对局记录过大');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  try{const body=JSON.parse(new TextDecoder().decode(bytes));if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();return body;}catch(_){throw new ApiError(400,'JSON 格式无效');}
}
async function authenticated(req:Request,url:string){
  const apikey=req.headers.get('apikey')||'',bearer=req.headers.get('authorization')||'';
  if(!bearer||bearer==='Bearer '+apikey)return null;
  const r=await fetch(url+'/auth/v1/user',{headers:{apikey,Authorization:bearer},signal:AbortSignal.timeout(5000)});
  if(!r.ok)throw new ApiError(401,'登录已过期，请使用开局账号重新登录后重试');
  const user=await r.json();if(typeof user.id!=='string')throw new ApiError(401,'登录状态无效');
  return {id:user.id,verified:!!user.email_confirmed_at&&!user.is_anonymous};
}
Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('origin')||'';
  const headers={'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store','Vary':'Origin'};
  const reply=(status:number,body:object)=>new Response(JSON.stringify(body),{status,headers});
  // CORS is a browser policy, not authentication. The run credential and binding
  // checks below are required even if a caller supplies an allowed Origin.
  if(!origins.has(origin))return new Response('Forbidden',{status:403});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return reply(405,{error:'仅支持 POST'});
  if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return reply(415,{error:'仅支持 JSON'});
  try{
    const body=await readBody(req),url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if(!UUID.test(body.device_id||''))throw new ApiError(400,'设备标识无效');
    if(body.action!==undefined&&!['start','submit'].includes(body.action))throw new ApiError(400,'请求类型无效');
    const user=await authenticated(req,url);
    const ip=req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
    if(!ip)throw new ApiError(503,'暂时无法验证请求来源，请稍后重试');
    const hk=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const digest=async(s:string)=>hex(await crypto.subtle.sign('HMAC',hk,new TextEncoder().encode(s)));
    const playerKey=await digest('gzjump-player:'+body.device_id),addressKey=await digest('gzjump-rate:'+ip),accountKey=user?await digest('gzjump-account:'+user.id):null;
    async function rpc(name:string,args:object){
      const response=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});
      const value=await response.json().catch(()=>({}));
      if(!response.ok){
        if(value.message?.includes('BLOCKED'))throw new ApiError(403,'该账号或设备已被暂时封禁，请联系管理员');
        if(value.message?.includes('RUN_EXPIRED'))throw new ApiError(410,'本局云端凭证已过期，请重新开始');
        if(value.message?.includes('RUN_TOO_FAST'))throw new ApiError(425,'对局尚未结束，请稍后重试');
        if(value.message?.includes('INVALID_RUN'))throw new ApiError(403,'对局凭证无效或不属于当前账号');
        console.error('gzjump RPC failure',name,response.status);throw new ApiError(503,'成绩服务暂不可用，请稍后重试');
      }return value;
    }
    const subjects=[{key:playerKey,scope:'device'},{key:addressKey,scope:'address'},...(accountKey?[{key:accountKey,scope:'account'}]:[])];
    const gate=await rpc('gzjump_gate',{p_subjects:subjects,p_kind:body.action==='start'?'start':'submit'});
    if(!gate.allowed)throw new ApiError(gate.blocked?403:429,gate.blocked?'该账号或设备已被暂时封禁，请联系管理员':'操作过于频繁，请稍后重试');
    if(body.action==='start'){
      if(body.version!==rules.VERSION)throw new ApiError(426,'游戏规则已更新，请刷新页面后重新开始');
      const {mode,fruit,variant,day}=body;
      if(!MODES.includes(mode)||!FRUITS.includes(fruit)||!['normal','hell','myth'].includes(variant)||((mode==='myth'||mode==='bridge_myth')!==(variant==='myth'))||(variant==='hell'&&!['classic','bridge_endless'].includes(mode)))throw new ApiError(400,'游戏模式无效');
      const parsed=typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)?new Date(day+'T00:00:00Z'):null;
      if(!parsed||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==day||Math.abs(parsed.getTime()-Date.now())>2*86400000)throw new ApiError(400,'开局日期无效');
      const id=crypto.randomUUID(),token=hex(crypto.getRandomValues(new Uint8Array(32)).buffer),seed=mode.endsWith('daily')?parseInt((await digest('gzjump-daily:'+mode+':'+day)).slice(0,8),16):crypto.getRandomValues(new Uint32Array(1))[0];
      const dates=await rpc('gzjump_open_run',{p_run:{id,token_hash:await sha(token),seed,auth_user_id:user?.id||null,player_key:playerKey,account_key:accountKey,address_key:addressKey,mode,variant,fruit,day,rules_version:rules.VERSION}});
      return reply(200,{id,token,seed,mode,variant,fruit,day,version:rules.VERSION,...dates});
    }
    if(!body.proof||typeof body.proof.token!=='string'||!/^[a-f0-9]{64}$/.test(body.proof.token))throw new ApiError(428,'本局缺少有效的云端对局记录，请刷新页面并重新开始');
    let payload;try{payload=validateSubmission(body);}catch(e){throw new ApiError(400,(e as Error).message);}
    const run=await rpc('gzjump_read_run',{p_id:payload.id}),tokenHash=await sha(body.proof.token);
    if(!run||run.token_hash!==tokenHash||run.player_key!==playerKey||(run.auth_user_id&&run.auth_user_id!==user?.id))throw new ApiError(403,'对局凭证无效或不属于当前账号');
    if(run.invalid)throw new ApiError(403,'该对局校验失败，请重新开始');
    if(run.rules_version!==rules.VERSION||body.proof.version!==run.rules_version)throw new ApiError(426,'游戏规则已更新，请刷新后重新开始');
    if(payload.mode!==run.mode||payload.day!==run.day||payload.fruit!==run.fruit)throw new ApiError(400,'对局模式或日期不匹配');
    let computed;
    try{computed=rules.replay(run,body.proof.actions);}catch(_){throw new ApiError(422,'对局操作记录不完整或时间顺序无效，成绩未上传');}
    if(['score','jumps','perfect','combo'].some(k=>computed[k]!==payload[k])){
      // Only a proved, owned server session with contradictory totals gets a
      // strike. Timeouts, old clients, high scores and long runs never do.
      await rpc('gzjump_replay_violation',{p_id:run.id});throw new ApiError(422,'得分与对局回放不一致，已拒绝上传');
    }
    const result=await rpc('gzjump_commit_run',{p_id:run.id,p_hash:tokenHash,p_player:playerKey,p_user:user?.id||null,p_result:{...computed,minimum_ms:computed.finishAt,player_name:payload.player_name},p_approved:!!user?.verified&&run.auth_user_id===user.id});
    return reply(200,result);
  }catch(e){if(e instanceof ApiError)return reply(e.status,{error:e.message});console.error('gzjump request failure',e instanceof Error?e.name:'unknown');return reply(503,{error:'服务暂不可用，请稍后重试'});}
});
