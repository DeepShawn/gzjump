export function validateSubmission(value, now = new Date()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('成绩格式无效');
  const {id, player_name, score, jumps, perfect, combo, mode, day, fruit, duration_ms, device_id, assist} = value;
  if (typeof device_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(device_id)) throw new Error('设备标识无效');
  if (assist !== false) throw new Error('开启新手瞄准时禁止上传成绩');
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('成绩编号无效');
  if (typeof player_name !== 'string' || player_name.trim() !== player_name || [...player_name].length < 1 || [...player_name].length > 20 || /[\p{Cc}\p{Cf}<>]/u.test(player_name)) throw new Error('昵称需要 1–20 个字符，不能含控制字符或尖括号');
  for (const n of [score, jumps, perfect, combo, duration_ms]) if (!Number.isSafeInteger(n) || n < 0) throw new Error('成绩必须为非负整数');
  // A normal jump is worth at most 10 points from a perfect combo. A
  // cross-island landing doubles that jump value, and a bonus island adds a
  // separate +3 reward, so the safe per-jump ceiling is 23.
  if (jumps > 10000 || score > 100000 || score < jumps || score > jumps * 23 || perfect > jumps || combo > perfect || (perfect === 0) !== (combo === 0) || duration_ms > 86400000 || duration_ms < jumps * 200) throw new Error('成绩数值超出合理范围');
  if (!['classic', 'daily'].includes(mode) || !['orange','lime','peach','lemon','blueberry','melon'].includes(fruit)) throw new Error('航线或水果无效');
  const date = typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(day + 'T00:00:00Z') : null;
  if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== day || Math.abs(date.getTime() - now.getTime()) > 3 * 86400000) throw new Error('仅能上传最近完成的成绩');
  return {id, player_name, score, jumps, perfect, combo, mode, day, fruit, duration_ms, device_id, assist:false};
}
