(() => {
  const config = window.GZJUMP_CONFIG;
  const $ = id => document.getElementById(id);
  let completed = null, uploading = false, sequence = 0, boardSequence = 0;
  const button = $('upload-score'), status = $('upload-status'), name = $('player-name');
  try {name.value = localStorage.getItem('gzjump_player_name') || '';} catch (_) {}
  const apiHeaders = {apikey:config.publishableKey};
  window.addEventListener('fruit-hop:start', () => {
    sequence++; completed = null; button.disabled = true; button.textContent = '上传成绩';
    status.textContent = '完成本局后可上传，审核通过后进入云端榜单。';
  });
  window.addEventListener('fruit-hop:complete', event => {
    completed = Object.freeze({...event.detail}); button.disabled = uploading;
    status.textContent = '成绩只会在你点击上传后提交，昵称将在榜单公开。';
  });
  button.addEventListener('click', async () => {
    if (!completed || uploading) return;
    const player_name = name.value.trim();
    if (!player_name || [...player_name].length > 20 || /[\p{Cc}\p{Cf}<>]/u.test(player_name)) {
      status.textContent = '请输入 1–20 个字符的昵称，不能含控制字符或尖括号。'; name.focus(); return;
    }
    const ticket = sequence, snapshot = completed;
    uploading = true; button.disabled = true; status.textContent = '正在上传…';
    try {
      const response = await fetch(config.url + '/functions/v1/gzjump-submit', {
        method:'POST', headers:{apikey:config.anonKey, Authorization:'Bearer ' + config.anonKey, 'Content-Type':'application/json'},
        body:JSON.stringify({...snapshot, player_name}), signal:AbortSignal.timeout(15000)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '上传失败，请稍后重试');
      try {localStorage.setItem('gzjump_player_name', player_name);} catch (_) {}
      if (ticket === sequence) {
        completed = null; button.textContent = '已上传'; status.textContent = '上传成功！成绩待管理员审核，同一局不会重复上传。';
      }
    } catch (error) {
      if (ticket === sequence) status.textContent = error.name === 'TimeoutError' ? '连接超时，可重试；不会重复保存同一局成绩。' : (error.message || '上传失败，请检查网络后重试。');
    } finally {uploading = false; button.disabled = !completed;}
  });
  function dayKey() {const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  async function loadBoard() {
    const ticket = ++boardSequence;
    const mode = $('daily-tab').getAttribute('aria-selected') === 'true' ? 'daily' : 'classic';
    const list = $('cloud-leaderboard'); list.replaceChildren(); $('cloud-status').textContent = '正在读取云端榜单…';
    const query = new URLSearchParams({select:'player_name,score,jumps,fruit,created_at',status:'eq.approved',mode:'eq.'+mode,order:'score.desc,created_at.asc',limit:'10'});
    if (mode === 'daily') query.set('day','eq.'+dayKey());
    try {
      const response = await fetch(config.url + '/rest/v1/gzjump_scores?' + query, {headers:apiHeaders, signal:AbortSignal.timeout(10000)});
      if (!response.ok) throw new Error('云端榜单暂不可用，本地成绩仍可查看。');
      const rows = await response.json(); if (ticket !== boardSequence) return;
      $('cloud-status').textContent = rows.length ? '仅展示审核通过的成绩 · 前 10 名' : '暂无审核通过的成绩，去留下你的第一份纪录吧。';
      rows.forEach((record, index) => {
        const row = document.createElement('div'); row.className = 'leaderboard-row';
        const rank = document.createElement('span'); rank.className = 'rank'; rank.textContent = String(index+1).padStart(2,'0');
        const label = document.createElement('div'); label.className = 'record-date'; label.textContent = record.player_name;
        const subtitle = document.createElement('span'); subtitle.textContent = record.jumps + ' 次跳跃 · ' + new Date(record.created_at).toLocaleDateString('zh-CN'); label.append(subtitle);
        const value = document.createElement('span'); value.className = 'record-value'; value.textContent = record.score;
        row.append(rank,label,value); list.append(row);
      });
    } catch (error) {if (ticket === boardSequence) $('cloud-status').textContent = error.message || '无法连接云端，本地成绩仍可查看。';}
  }
  for (const id of ['records-button','over-records','classic-tab','daily-tab','refresh-cloud']) $(id).addEventListener('click',loadBoard);
})();
