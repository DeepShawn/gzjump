import { validateSubmission } from './validation.js';
const allowedOrigins = new Set(['https://deepshawn.github.io', 'http://localhost:4173', 'http://127.0.0.1:4173']);
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
    // Supabase's gateway appends the trusted connecting address to X-Forwarded-For.
    const ip = req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
    if (!ip) return reply(503, {error:'暂时无法验证请求来源，请稍后重试'});
    const hmac = await crypto.subtle.importKey('raw', new TextEncoder().encode(serviceKey), {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
    const digest = await crypto.subtle.sign('HMAC', hmac, new TextEncoder().encode('gzjump-rate:' + ip));
    const fingerprint = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('');
    const identityDigest = await crypto.subtle.sign('HMAC', hmac, new TextEncoder().encode('gzjump-player:' + payload.device_id));
    const playerKey = Array.from(new Uint8Array(identityDigest), b => b.toString(16).padStart(2,'0')).join('');
    const result = await fetch(Deno.env.get('SUPABASE_URL') + '/rest/v1/rpc/gzjump_submit', {
      method:'POST', headers:{apikey:serviceKey, Authorization:'Bearer ' + serviceKey, 'Content-Type':'application/json'},
      body:JSON.stringify({p_fingerprint:fingerprint, p_payload:payload}), signal:AbortSignal.timeout(10000)
    });
    if (!result.ok) {
      const detail = await result.text();
      if (detail.includes('RATE_LIMITED')) return reply(429, {error:'上传过于频繁，请稍后再试'});
      if (detail.includes('AIM_ASSIST_NOT_ALLOWED')) return reply(400, {error:'开启新手瞄准时禁止上传成绩'});
      console.error('gzjump database submission failed', result.status);
      return reply(503, {error:'成绩暂未保存，请稍后重试'});
    }
    return reply(200, {id:payload.id, status:'pending'});
  } catch (_) {return reply(503, {error:'服务暂不可用，请稍后重试'});}
});
