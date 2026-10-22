/* Server-issued, one-use run credentials. No signing secret lives in a client. */
(() => {
  'use strict';
  const AUTH='gzjump_auth_session_v1',DEVICE='gzjump_device_id';
  let active=null,inputs=[],origin=0,generation=0,lastError='';
  const stored=key=>{try{return localStorage.getItem(key);}catch(_){return null;}};
  let device=stored(DEVICE);
  if(!device||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(device)){device=crypto.randomUUID();try{localStorage.setItem(DEVICE,device);}catch(_){}}
  async function token() {
    let session;try{session=JSON.parse(stored(AUTH)||'null');}catch(_){return null;}
    if(session?.refresh_token&&session.expires_at&&session.expires_at*1000<Date.now()+60000){
      const c=window.GZJUMP_CONFIG;
      const r=await fetch(c.url+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:c.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token}),signal:AbortSignal.timeout(6000)});
      if(!r.ok)throw new Error('登录已过期，请重新登录后开始。');session=await r.json();try{localStorage.setItem(AUTH,JSON.stringify(session));}catch(_){}window.dispatchEvent(new CustomEvent('gzjump-session-refreshed',{detail:session}));
    }
    return session?.access_token||null;
  }
  async function begin(mode,variant,fruit) {
    const ticket=++generation;active=null;inputs=[];lastError='';
    try{
      const c=window.GZJUMP_CONFIG,t=await token();
      const d=new Date(),day=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const r=await fetch(c.url+'/functions/v1/gzjump-submit',{method:'POST',headers:{apikey:c.publishableKey,Authorization:'Bearer '+(t||c.publishableKey),'Content-Type':'application/json'},body:JSON.stringify({action:'start',mode,variant,fruit,device_id:device,version:window.GZJUMP_RULES.VERSION,day}),signal:AbortSignal.timeout(7000)});
      const data=await r.json();if(!r.ok)throw new Error(data.error||'无法建立云端对局');
      if(ticket!==generation)return null;active=Object.freeze(data);origin=performance.now();return active;
    }catch(e){if(ticket===generation)lastError=e.message||'网络连接失败';return null;}
  }
  function input(hold) {if(active)inputs.push([Math.round(hold),Math.round(performance.now()-origin)]);}
  function complete(snapshot) {
    if(!active)return {...snapshot,device_id:device,run_error:lastError||'本局未连接云端，请联网后重新开始。'};
    return {...snapshot,id:active.id,mode:active.mode,day:active.day,fruit:active.fruit,device_id:device,proof:{token:active.token,version:active.version,actions:inputs.map(a=>a.slice())}};
  }
  window.GZJUMP_RUN=Object.freeze({begin,input,complete,deviceId:device,token,error:()=>lastError});
})();
