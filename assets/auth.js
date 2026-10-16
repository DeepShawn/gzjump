(() => {
  const config = window.GZJUMP_CONFIG;
  // Use the current Supabase publishable key. The legacy anon JWT may be
  // revoked after a project restore or key rotation.
  const apiKey = config.publishableKey || config.anonKey;
  const key = 'gzjump_auth_session_v1';
  const $ = id => document.getElementById(id);
  let session = null;
  try { session = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) {}
  function save(next) { session = next; try { next ? localStorage.setItem(key, JSON.stringify(next)) : localStorage.removeItem(key); } catch (_) {} window.dispatchEvent(new CustomEvent('gzjump-auth-changed', {detail: session})); update(); }
  async function request(path, body) { const response = await fetch(config.url + '/auth/v1/' + path, {method:'POST', headers:{apikey:apiKey,'Content-Type':'application/json'}, body:JSON.stringify(body)}); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error_description || data.msg || data.message || '认证请求失败'); return data; }
  async function refresh() { if (!session?.refresh_token) return; try { const data = await request('token?grant_type=refresh_token', {refresh_token:session.refresh_token}); save(data); } catch (_) { save(null); } }
  async function verify() { if (!session?.access_token) return; const response = await fetch(config.url + '/auth/v1/user', {headers:{apikey:apiKey,Authorization:'Bearer '+session.access_token}}); if (!response.ok) return refresh(); }
  function open() { $('auth-panel').hidden = false; $('auth-email').focus(); }
  function close() { $('auth-panel').hidden = true; }
  function update() { const logged = !!session?.access_token; $('auth-button').textContent = logged ? '已登录' : '登录'; $('auth-user').textContent = logged ? (session.user?.email || '已登录') : '游客模式'; $('auth-logout').hidden = !logged; $('auth-form').hidden = logged; $('auth-status').textContent = logged ? '已认证：成绩将自动进入榜单，无需管理员审核。' : '游客可以直接游玩，但成绩需要管理员审核。'; window.GZJUMP_AUTH = {getAccessToken:()=>session?.access_token || null, isAuthenticated:()=>logged, user:()=>session?.user || null}; }
  $('auth-button').addEventListener('click', open); $('auth-close').addEventListener('click', close); $('auth-logout').addEventListener('click', () => save(null));
  $('auth-form').addEventListener('submit', async event => { event.preventDefault(); const email=$('auth-email').value.trim(), password=$('auth-password').value; const submit=$('auth-submit'); submit.disabled=true; try { const data=await request('token?grant_type=password',{email,password}); save(data); close(); } catch (error) { $('auth-status').textContent=error.message; } finally { submit.disabled=false; } });
  $('auth-signup').addEventListener('click', async () => { const email=$('auth-email').value.trim(), password=$('auth-password').value; try { const data=await request('signup',{email,password}); $('auth-status').textContent=data.session?'注册成功，已登录。':'注册成功，请查收验证邮件后登录。'; if(data.session) save(data); } catch(error) { $('auth-status').textContent=error.message; } });
  $('auth-magic').addEventListener('click', async () => { const email=$('auth-email').value.trim(); if(!email) { $('auth-status').textContent='请先填写邮箱。'; return; } try { await request('otp',{email,create_user:true}); $('auth-status').textContent='魔法登录链接已发送，请检查邮箱。'; } catch(error) { $('auth-status').textContent=error.message; } });
  window.addEventListener('gzjump-auth-refresh', refresh); update(); verify();
})();
