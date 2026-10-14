import { createClient } from '@supabase/supabase-js';
const config = window.GZJUMP_CONFIG;
const client = createClient(config.url, config.publishableKey, {auth:{persistSession:false, detectSessionInUrl:true, flowType:'implicit'}});
const $ = id => document.getElementById(id);
let page = 0, generation = 0, activeUser = null, busy = false;
const size = 25, labels = {pending:'待审核', approved:'已通过', rejected:'已拒绝'};
function message(text) {$('message').textContent = text;}
async function authenticate() {
  const ticket = ++generation;
  const {data:{user},error} = await client.auth.getUser();
  if (ticket !== generation) return;
  let isAdmin = false;
  if (user && !error) {
    const {data,error:permissionError} = await client.from('gzjump_admins').select('user_id').eq('user_id',user.id).maybeSingle();
    if (permissionError) message('暂时无法核验管理员权限，请刷新重试。');
    isAdmin = !!data && !permissionError;
  }
  if (ticket !== generation) return;
  activeUser = isAdmin ? user : null;
  $('dashboard').hidden = !activeUser; $('auth-panel').hidden = !!activeUser;
  $('scores').replaceChildren();
  if (activeUser) { $('identity').textContent = user.email; page = 0; await loadScores(); }
  else if (user) {message('此账号没有管理员权限。请使用已验证邮箱的授权账号登录。'); await client.auth.signOut();}
}
async function loadScores() {
  if (!activeUser) return;
  const ticket = ++generation;
  $('refresh').disabled = true; $('previous').disabled = true; $('next').disabled = true;
  const filter = $('filter').value;
  let query = client.from('gzjump_scores').select('*',{count:'exact'}).order('created_at',{ascending:false}).order('id').range(page*size,(page+1)*size-1);
  if (filter !== 'all') query = query.eq('status',filter);
  const {data,error,count} = await query;
  if (ticket !== generation) return;
  $('refresh').disabled = false;
  if (error) {message('读取失败，请检查登录状态或稍后重试。'); return;}
  if (page > 0 && !data.length) {page--; return loadScores();}
  $('scores').replaceChildren(); $('empty').hidden = data.length > 0;
  for (const record of data) {
    const row = document.createElement('tr');
    const cell = text => {const td = document.createElement('td'); td.textContent = text; row.append(td); return td;};
    const nameCell = cell(record.player_name); const time = document.createElement('small'); time.textContent = new Date(record.created_at).toLocaleString('zh-CN'); nameCell.append(time);
    cell(record.mode === 'daily' ? '每日 · '+record.day : '经典'); cell(String(record.score)); cell(`${record.jumps} / ${record.perfect} / ${record.combo}`); cell((record.duration_ms/1000).toFixed(1)+' 秒'); cell(labels[record.status]);
    const actions = cell('');
    for (const [label,status] of [['通过','approved'],['拒绝','rejected'],['删除','delete']]) {
      if (record.status === status) continue;
      const button = document.createElement('button'); button.textContent = label; button.className = status === 'delete' ? 'danger' : 'secondary';
      button.addEventListener('click',() => moderate(record,status)); actions.append(button);
    }
    $('scores').append(row);
  }
  $('page-label').textContent = `第 ${page+1} 页 · 共 ${count} 条`;
  $('previous').disabled = page === 0; $('next').disabled = (page+1)*size >= count;
  message('已加载成绩。');
}
async function moderate(record,status) {
  if (busy || !activeUser) return;
  if (status === 'delete' && !confirm(`确定永久删除“${record.player_name}”的 ${record.score} 分成绩？`)) return;
  busy = true; for (const button of $('scores').querySelectorAll('button')) button.disabled = true;
  try {
    const query = status === 'delete' ? client.from('gzjump_scores').delete() : client.from('gzjump_scores').update({status});
    const {data,error} = await query.eq('id',record.id).select('id');
    if (error || data.length !== 1) {message('操作未完成，请检查管理员权限并刷新重试。'); return;}
    await loadScores(); message(status === 'delete' ? '成绩已删除。' : '审核状态已更新。');
  } finally {busy = false; for (const button of $('scores').querySelectorAll('button')) button.disabled = false;}
}
async function signInOrRegister(register = false) {
  $('login').disabled = true; $('register').disabled = true; message('正在验证…');
  try {
    const email = $('email').value.trim(), password = $('password').value;
    const response = register ? await client.auth.signUp({email,password,options:{emailRedirectTo:new URL('admin.html',location.href).href}}) : await client.auth.signInWithPassword({email,password});
    $('password').value = '';
    if (response.error) {message(register ? '设置账号失败：'+response.error.message : '登录失败，请检查邮箱、密码和邮箱验证状态。'); return;}
    if (register && !response.data.session) {message('请查收验证邮件。完成邮箱验证后，回到本页登录。'); return;}
    await authenticate();
  } catch (_) {message('连接失败，请稍后重试。');}
  finally {$('login').disabled = false; $('register').disabled = false;}
}
$('login-form').addEventListener('submit',event => {event.preventDefault(); signInOrRegister();});
$('register').addEventListener('click',() => {if ($('login-form').reportValidity()) signInOrRegister(true);});
$('logout').addEventListener('click',async () => {
  generation++; activeUser = null; $('scores').replaceChildren(); $('dashboard').hidden = true; $('auth-panel').hidden = false;
  const {error} = await client.auth.signOut(); message(error ? '退出失败，请关闭此页面清除本页会话。' : '已安全退出。');
});
$('filter').addEventListener('change',() => {page = 0; loadScores();}); $('refresh').addEventListener('click',loadScores);
$('previous').addEventListener('click',() => {if (page > 0) {page--; loadScores();}}); $('next').addEventListener('click',() => {page++; loadScores();});
// Avoid awaiting Supabase operations inside the Auth callback.
client.auth.onAuthStateChange(event => {if (event === 'SIGNED_OUT') {generation++; activeUser = null; $('dashboard').hidden = true; $('auth-panel').hidden = false; $('scores').replaceChildren();}});
authenticate();
