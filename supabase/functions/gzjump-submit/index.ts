import { validateSubmission } from './validation.js';
const allowedOrigins = new Set(['https://deepshawn.github.io', 'http://localhost:4173', 'http://127.0.0.1:4173']);
const rateBuckets = new Map<string, {minute:number; minuteCount:number; day:string; dayCount:number; last:number}>();
async function databaseJson(url: string, key: string, path: string, init: RequestInit = {}) {
  return fetch(url + path, { ...init, headers: {apikey:key, Authorization:'Bearer '+key, 'Content-Type':'application/json', ...(init.headers || {})}, signal: AbortSignal.timeout(5000)});
}
async function getAuthenticatedUser(req: Request, url: string): Promise<{id:string}|null> {
  const bearer = req.headers.get('authorization') || ''; const apikey = req.headers.get('apikey') || '';
  if (!bearer.startsWith('Bearer ') || bearer.slice(7) === apikey) return null;
  const response = await fetch(url + '/auth/v1/user', {headers:{apikey, Authorization:bearer}, signal:AbortSignal.timeout(5000)});
  if (!response.ok) return null; const user = await response.json();
  return typeof user?.id === 'string' ? {id:user.id} : null;
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || '';
  const headers = {'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
  const reply = (status: number, body: object) => new Response(JSON.stringify(body), {status, headers});
  if (!allowedOrigins.has(origin)) return new Response('Forbidden', {status:403});
  if (req.method === 'OPTIONS') return new Response(null, {status:204, headers});
  if (req.method !== 'POST') return reply(405, {error:'仅支持 POST'});
  // Supabase Edge gateway verifies the JWT before this handler runs.
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply(415, {error:'仅支持 JSON'});
  try {
    // Bound the actual streamed body, including requests without Content-Length.
    const reader = req.body?.getReader();
    if (!reader) return reply(400, {error:'缺少成绩'});
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); return reply(413, {error:'请求过大'}); }
      chunks.push(value);
    }
    const body = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) {body.set(chunk, offset); offset += chunk.length;}
    let payload;
    try {payload = validateSubmission(JSON.parse(new TextDecoder().decode(body)));}
    catch (e) {return reply(400, {error: e instanceof SyntaxError ? 'JSON 格式无效' : (e as Error).message});}
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authenticatedUser = await getAuthenticatedUser(req, Deno.env.get('SUPABASE_URL')!);
    // Supabase's gateway appends the trusted connecting address to X-Forwarded-For.
    const ip = req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
    if (!ip) return reply(503, {error:'暂时无法验证请求来源，请稍后重试'});
    const hmac = await crypto.subtle.importKey('raw', new TextEncoder().encode(serviceKey), {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
    const digest = await crypto.subtle.sign('HMAC', hmac, new TextEncoder().encode('gzjump-rate:' + ip));
    const fingerprint = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('');
    const nowMs = Date.now(); const minute = Math.floor(nowMs / 60000); const day = new Date(nowMs).toISOString().slice(0, 10);
    const bucket = rateBuckets.get(fingerprint);
    if (bucket && ((bucket.minute === minute && bucket.minuteCount >= 10) || (bucket.day === day && bucket.dayCount >= 100) || nowMs - bucket.last < 3000)) return reply(429, {error:'上传过于频繁，请稍后再试'});
    rateBuckets.set(fingerprint, {minute, minuteCount: bucket?.minute === minute ? (bucket.minuteCount + 1) : 1, day, dayCount: bucket?.day === day ? (bucket.dayCount + 1) : 1, last: nowMs});
    if (rateBuckets.size > 5000) for (const [key, value] of rateBuckets) if (nowMs - value.last > 86400000) rateBuckets.delete(key);
    const identityDigest = await crypto.subtle.sign('HMAC', hmac, new TextEncoder().encode('gzjump-player:' + payload.device_id));
    const playerKey = Array.from(new Uint8Array(identityDigest), b => b.toString(16).padStart(2,'0')).join('');
    const riskFlags: string[] = [];
    // The client now awards double points for cross-island landings. The old
    // 13-points-per-jump flag would mark legitimate scores as suspicious, so
    // only flag a run that sits at the new absolute ceiling repeatedly.
    if (payload.jumps >= 20 && payload.score === payload.jumps * 23) riskFlags.push('perfect_bound_score');
    if (payload.jumps >= 8 && payload.duration_ms < payload.jumps * 300) riskFlags.push('impossible_duration');
    if (payload.jumps >= 500) riskFlags.push('bulk_run_pattern');
    const riskScore = Math.min(100, riskFlags.length * 40);
    const blocksResponse = await databaseJson(Deno.env.get('SUPABASE_URL')!, serviceKey, '/rest/v1/gzjump_blocks?select=blocked_until,violation_count&subject_key=eq.' + encodeURIComponent(playerKey));
    const blocks = blocksResponse.ok ? await blocksResponse.json() : [];
    if (blocks[0]?.blocked_until && new Date(blocks[0].blocked_until).getTime() > Date.now()) return reply(403, {error:'该设备已被暂时封禁，无法提交成绩'});
    if (riskFlags.length) {
      await databaseJson(Deno.env.get('SUPABASE_URL')!, serviceKey, '/rest/v1/gzjump_security_events', {method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({subject_key:playerKey,auth_user_id:authenticatedUser?.id || null,flags:riskFlags})});
      const count = Number(blocks[0]?.violation_count || 0) + 1;
      await databaseJson(Deno.env.get('SUPABASE_URL')!, serviceKey, '/rest/v1/gzjump_blocks', {method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({subject_key:playerKey,violation_count:count,blocked_until:count >= 3 ? new Date(Date.now()+365*86400000).toISOString() : null,reason:riskFlags.join(',')})});
      if (count >= 3) return reply(403, {error:'检测到重复高风险提交，该设备已被封禁'});
    }

    const result = await fetch(Deno.env.get('SUPABASE_URL') + '/rest/v1/gzjump_scores', {
      method:'POST',
      headers:{apikey:serviceKey, Authorization:'Bearer '+serviceKey, 'Content-Type':'application/json', Prefer:'return=minimal'},
      body:JSON.stringify({id:payload.id, player_key:playerKey, auth_user_id:authenticatedUser?.id || null, player_name:payload.player_name, score:payload.score, jumps:payload.jumps, perfect:payload.perfect, combo:payload.combo, mode:payload.mode, day:payload.day, fruit:payload.fruit, duration_ms:payload.duration_ms, assist:false, status:authenticatedUser && !riskFlags.length ? 'approved' : 'pending', risk_flags:riskFlags, risk_score:riskScore}),
      signal:AbortSignal.timeout(10000)
    });
    if (!result.ok) {
      const detail = await result.text();
      if (result.status === 409 || detail.includes('duplicate')) return reply(409, {error:'这局成绩已经提交过了'});
      console.error('gzjump database submission failed', result.status, detail.slice(0, 200));
      return reply(503, {error:'成绩暂未保存，请稍后重试'});
    }
    const submissionStatus = authenticatedUser && !riskFlags.length ? 'approved' : 'pending';
    return reply(200, {id:payload.id, status:submissionStatus});
  } catch (_) {return reply(503, {error:'服务暂不可用，请稍后重试'});}
});
