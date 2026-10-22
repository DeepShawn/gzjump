import { createClient } from '@supabase/supabase-js';
const config = window.GZJUMP_CONFIG;
const client = createClient(config.url, config.publishableKey, {auth:{persistSession:false, detectSessionInUrl:true, flowType:'implicit'}});
const $ = id => document.getElementById(id);
let page = 0, generation = 0, operation = 0, activeUser = null, busy = false, loading = false, total = 0;
let visibleRecords = [];
const selected = new Set();
const size = 25, labels = {pending:'待审核', approved:'已通过', rejected:'已拒绝'};
function message(text) {$('message').textContent = text;}
function selectedRecords(status) {
  return visibleRecords.filter(record => selected.has(record.id) && (status === 'delete' || record.status !== status));
}
function updateControls() {
  const locked = busy || loading || !activeUser;
  $('refresh').disabled = locked; $('filter').disabled = locked;
  $('previous').disabled = locked || page === 0;
  $('next').disabled = locked || (page+1)*size >= total;
  $('selection-count').textContent = `已选择 ${selected.size} 条`;
  $('clear-selection').disabled = locked || selected.size === 0;
  for (const [id,status,label] of [['bulk-approve','approved','批量通过'],['bulk-reject','rejected','批量拒绝'],['bulk-delete','delete','批量删除']]) {
    const count = selectedRecords(status).length;
    $(id).disabled = locked || count === 0;
    $(id).textContent = label + (count ? `（${count}）` : '');
  }
  const all = $('select-all');
  all.disabled = locked || visibleRecords.length === 0;
  all.checked = visibleRecords.length > 0 && selected.size === visibleRecords.length;
  all.indeterminate = selected.size > 0 && selected.size < visibleRecords.length;
  for (const box of $('scores').querySelectorAll('input[data-score-id]')) {
    box.checked = selected.has(box.dataset.scoreId); box.disabled = locked;
    box.closest('tr').classList.toggle('is-selected',box.checked);
  }
  for (const button of $('scores').querySelectorAll('button')) button.disabled = locked;
  $('scores').closest('table').setAttribute('aria-busy',String(busy || loading));
}
function resetDashboard() {
  generation++; operation++; activeUser = null; busy = false; loading = false; total = 0;
  visibleRecords = []; selected.clear(); $('scores').replaceChildren();
  $('dashboard').hidden = true; $('auth-panel').hidden = false; updateControls();
}
async function authenticate() {
  resetDashboard(); const ticket = generation;
  try {
    const {data:{user},error} = await client.auth.getUser();
    if (ticket !== generation) return;
    let isAdmin = false;
    if (user && !error) {
      const {data,error:permissionError} = await client.from('gzjump_admins').select('user_id').eq('user_id',user.id).maybeSingle();
      if (ticket !== generation) return;
      if (permissionError) message('暂时无法核验管理员权限，请刷新重试。');
      isAdmin = !!data && !permissionError;
    }
    if (ticket !== generation) return;
    activeUser = isAdmin ? user : null;
    $('dashboard').hidden = !activeUser; $('auth-panel').hidden = !!activeUser;
    if (activeUser) { $('identity').textContent = user.email; page = 0; await loadScores(); }
    else if (user) {message('此账号没有管理员权限。请使用已验证邮箱的授权账号登录。'); await client.auth.signOut();}
  } catch (_) {if (ticket === generation) message('暂时无法核验登录状态，请稍后重试。');}
}
function renderScores(data) {
  $('scores').replaceChildren();
  for (const record of data) {
    const row = document.createElement('tr');
    const cell = text => {const td = document.createElement('td'); td.textContent = text; row.append(td); return td;};
    const selection = cell(''); selection.className = 'selection-cell';
    const selectLabel = document.createElement('label'); selectLabel.className = 'row-select-label';
    const box = document.createElement('input'); box.type = 'checkbox'; box.dataset.scoreId = record.id;
    box.setAttribute('aria-label',`选择 ${record.player_name} 的 ${record.score} 分成绩`);
    box.addEventListener('change',() => {
      if (busy || loading || !activeUser) {updateControls(); return;}
      box.checked ? selected.add(record.id) : selected.delete(record.id); updateControls();
    });
    selectLabel.append(box); selection.append(selectLabel);
    const nameCell = cell(record.player_name); const time = document.createElement('small'); time.textContent = new Date(record.created_at).toLocaleString('zh-CN'); nameCell.append(time);
    const modeLabel = {daily:'每日',myth:'跳跳 · 神话',bridge_daily:'搭路 · 每日',bridge_endless:'搭路 · 无尽',bridge_myth:'搭路 · 神话'}[record.mode] || '经典'; cell(modeLabel + (record.mode.endsWith('daily') ? ' · '+record.day : '')); cell(String(record.score)); cell(`${record.jumps} / ${record.perfect} / ${record.combo}`); cell((record.duration_ms/1000).toFixed(1)+' 秒'); const risk = cell(record.risk_flags?.length ? record.risk_flags.join('、') + ' (' + record.risk_score + ')' : '正常'); if (record.risk_flags?.length) risk.style.color = '#934c39'; cell(labels[record.status]);
    const actions = cell('');
    if (record.player_key) {
      const ban = document.createElement('button'); ban.textContent = '封禁设备'; ban.className = 'danger';
      ban.addEventListener('click',() => banDevice(record)); actions.append(ban);
    }
    for (const [label,status] of [['通过','approved'],['拒绝','rejected'],['删除','delete']]) {
      if (record.status === status) continue;
      const button = document.createElement('button'); button.textContent = label; button.className = status === 'delete' ? 'danger' : 'secondary';
      button.addEventListener('click',() => moderateRecords([record],status)); actions.append(button);
    }
    $('scores').append(row);
  }
}
async function loadScores() {
  if (!activeUser) return false;
  const ticket = ++generation; loading = true; selected.clear(); visibleRecords = [];
  $('scores').replaceChildren(); $('empty').hidden = true; updateControls(); message('正在读取成绩…');
  try {
    const filter = $('filter').value;
    let query = client.from('gzjump_scores').select('*',{count:'exact'}).order('created_at',{ascending:false}).order('id').range(page*size,(page+1)*size-1);
    if (filter !== 'all') query = query.eq('status',filter);
    const {data,error,count} = await query;
    if (ticket !== generation || !activeUser) return false;
    if (error || !Array.isArray(data)) throw new Error('READ_FAILED');
    total = count ?? data.length;
    if (page > 0 && !data.length) {page--; return loadScores();}
    visibleRecords = data; renderScores(data);
    $('empty').textContent = '暂无该状态的成绩。'; $('empty').hidden = data.length > 0;
    $('page-label').textContent = `第 ${page+1} 页 · 共 ${total} 条`;
    message('已加载成绩。'); return true;
  } catch (_) {
    if (ticket === generation && activeUser) {
      $('empty').textContent = '成绩读取失败，请刷新重试。'; $('empty').hidden = false;
      message('读取失败，请检查登录状态或稍后重试。');
    }
    return false;
  } finally {if (ticket === generation) {loading = false; updateControls();}}
}
async function moderateRecords(records,status,bulk = false) {
  if (busy || loading || !activeUser || !['approved','rejected','delete'].includes(status)) return;
  // A mutation can only include explicitly selected, currently visible records.
  const wanted = new Set(records.map(record => record.id));
  const targets = visibleRecords.filter(record => wanted.has(record.id) && (status === 'delete' || record.status !== status));
  if (!targets.length || targets.length > size) return;
  if (status === 'delete' && !confirm(bulk ? `确定永久删除当前页勾选的 ${targets.length} 条成绩？\n删除后无法恢复，也会同步更新云端榜单。` : `确定永久删除“${targets[0].player_name}”的 ${targets[0].score} 分成绩？`)) return;
  const ticket = ++operation, actor = activeUser.id; busy = true; updateControls();
  const verb = status === 'delete' ? '删除' : status === 'approved' ? '通过' : '拒绝';
  message(`正在${bulk?'批量':''}${verb} ${targets.length} 条成绩…`);
  let result;
  try {
    const query = status === 'delete' ? client.from('gzjump_scores').delete() : client.from('gzjump_scores').update({status});
    const {data,error} = await query.in('id',targets.map(record => record.id)).select('id');
    if (ticket !== operation || activeUser?.id !== actor) return;
    if (error) throw new Error('WRITE_FAILED');
    const returned = new Set((data || []).map(record => record.id));
    const done = targets.filter(record => returned.has(record.id)).length;
    result = done === targets.length ? `已${verb} ${done} 条成绩。` : `已${verb} ${done} 条，另有 ${targets.length-done} 条未完成，请核对管理员权限或其他管理员的操作。`;
  } catch (_) {
    if (ticket !== operation || activeUser?.id !== actor) return;
    result = '无法确认操作结果，请核对刷新后的列表，再决定是否重试。';
  }
  try {
    if (ticket !== operation || activeUser?.id !== actor) return;
    const refreshed = await loadScores();
    if (ticket === operation && activeUser?.id === actor) message(result + (refreshed ? '' : ' 列表刷新失败，请手动刷新核对。'));
  } finally {if (ticket === operation) {busy = false; updateControls();}}
}
async function banDevice(record) {
  if (busy || loading || !activeUser || !confirm('确定封禁该设备？后续成绩将被拒绝。')) return;
  const ticket = ++operation, actor = activeUser.id; busy = true; updateControls();
  try {
    const until = new Date(Date.now()+365*86400000).toISOString();
    const {data,error} = await client.from('gzjump_blocks').upsert({subject_key:record.player_key,violation_count:3,blocked_until:until,reason:'管理员手动封禁'},{onConflict:'subject_key'}).select('subject_key');
    if (ticket === operation && activeUser?.id === actor) message(error || data?.length !== 1 ? '无法确认封禁结果，请核对后重试。' : '设备已封禁。');
  } catch (_) {if (ticket === operation) message('无法确认封禁结果，请检查连接后重试。');}
  finally {if (ticket === operation) {busy = false; updateControls();}}
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
  resetDashboard();
  const {error} = await client.auth.signOut(); message(error ? '退出失败，请关闭此页面清除本页会话。' : '已安全退出。');
});
$('select-all').addEventListener('change',event => {
  if (busy || loading || !activeUser) return;
  selected.clear(); if (event.target.checked) for (const record of visibleRecords) selected.add(record.id); updateControls();
});
$('clear-selection').addEventListener('click',() => {if (!busy && !loading) {selected.clear(); updateControls();}});
for (const [id,status] of [['bulk-approve','approved'],['bulk-reject','rejected'],['bulk-delete','delete']]) $(id).addEventListener('click',() => moderateRecords(selectedRecords(status),status,true));
$('filter').addEventListener('change',() => {if (!busy && !loading) {page = 0; void loadScores();}});
$('refresh').addEventListener('click',() => {if (!busy && !loading) void loadScores();});
$('previous').addEventListener('click',() => {if (!busy && !loading && page > 0) {page--; void loadScores();}});
$('next').addEventListener('click',() => {if (!busy && !loading && (page+1)*size < total) {page++; void loadScores();}});
// Never await database operations inside the Auth callback.
client.auth.onAuthStateChange(event => {if (event === 'SIGNED_OUT') resetDashboard();});
updateControls(); void authenticate();
