// Tiny synthesised sound effects: 'drop', 'good' and 'bad'.
export function createAudio(settings) {
  const a = {ctx: null, master: null};

  function init() {
    if (!settings.sound) return;
    try {
      if (!a.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        a.ctx = new AC();
        a.master = a.ctx.createGain();
        a.master.gain.value = .24;
        a.master.connect(a.ctx.destination);
      }
      if (a.ctx.state === 'suspended') a.ctx.resume().catch(() => {});
    } catch (_) {}
  }

  function beep(type) {
    if (!settings.sound) return;
    init();
    if (!a.ctx || a.ctx.state !== 'running') return;
    const t = a.ctx.currentTime, o = a.ctx.createOscillator(), g = a.ctx.createGain();
    const f = type === 'drop' ? 180 : type === 'good' ? 520 : 260;
    o.type = type === 'drop' ? 'triangle' : 'sine';
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(type === 'good' ? f * 1.55 : f * .6, t + .18);
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(.18, t + .018);
    g.gain.exponentialRampToValueAtTime(.0001, t + .2);
    o.connect(g); g.connect(a.master);
    o.start(t); o.stop(t + .23);
  }

  return {init, beep};
}
