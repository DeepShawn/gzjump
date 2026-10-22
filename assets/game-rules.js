/* Shared, deterministic gameplay rules. The server replays inputs with these
   same rules; a client-reported total is never a source of truth. */
((root) => {
  'use strict';
  const VERSION = '2026-10-22.1';
  const clamp = (n,a,b) => Math.min(b,Math.max(a,n));
  const hash = s => {let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;};
  const seeded = seed => () => {seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};
  function difficulty(score,variant) {
    if(variant==='myth')return clamp(Math.floor(Math.max(0,score)/2)/800,0,1);
    if(variant==='hell')return clamp(Math.floor(Math.max(0,score)/3)/80,0,1);
    return score<=300?0:Math.pow(clamp((score-300)/520,0,1),.62);
  }
  const hopMax = variant => variant==='myth'?1450:560;
  const hopDistance = (ms,variant) => 12+(hopMax(variant)-12)*Math.pow(clamp(ms/1220,0,1),1.14);
  const perfectRadius = p => Math.min(15,p.half*.27);
  function contains(p,x,z) {
    const dx=Math.abs(x-p.x),dz=Math.abs(z-p.z);
    if(p.shape==='round')return dx*dx+dz*dz<=(p.half-1)**2;
    const inner=p.half-12;
    if(dx>p.half-1||dz>p.half-1)return false;
    if(dx<=inner||dz<=inner)return true;
    return (dx-inner)**2+(dz-inner)**2<=121;
  }
  function hopCourse(seed,variant='normal') {
    const rng=seeded(seed);let last={index:0,x:0,z:0,half:61,shape:'square',kind:'normal',colorIndex:0},lastDirection=0,sameDirection=0;
    return {first:()=>({...last}),next(score) {
      const i=last.index+1;let dir=rng()>.5?1:0;
      if(i===1)dir=0;if(sameDirection>=2)dir=1-lastDirection;
      sameDirection=dir===lastDirection?sameDirection+1:1;lastDirection=dir;
      const d=difficulty(score,variant);
      const distance=variant==='myth'?510+rng()*360+d*(300+rng()*500):variant==='hell'?230+rng()*130+d*(100+rng()*210):154+rng()*63+d*(52+rng()*118);
      const half=variant==='myth'?Math.max(10,25+(rng()-.5)*7-d*17):variant==='hell'?Math.max(14,40+(rng()-.5)*8-d*26):Math.max(22,56+(rng()-.5)*9-d*32);
      const kind=i%7===0?'bonus':'normal',colorIndex=kind==='bonus'?0:Math.floor(rng()*5),shape=rng()>.66?'round':'square';
      last={index:i,x:last.x-(dir===0?distance:0),z:last.z-(dir===1?distance:0),half,shape,kind,colorIndex};return {...last};
    }};
  }
  function bridgeCourse(seed,variant='normal') {
    let value=seed>>>0;const rng=()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};
    let last={index:0,left:0,width:190,phase:rng()*Math.PI*2};
    return {first:()=>({...last}),next(score) {
      const d=difficulty(score,variant),roll=rng();
      let gap=roll<.24?5+rng()*24:roll<.72?38+rng()*125:115+rng()*290;
      if(variant==='hell')gap=90+rng()*260+d*(130+rng()*300);
      if(variant==='myth')gap=220+rng()*520+d*(260+rng()*520);
      gap+=d*(65+rng()*220);
      const width=variant==='myth'?Math.max(12,38+rng()*128-d*(22+rng()*30)):Math.max(variant==='hell'?28:38,variant==='hell'?70+rng()*145-d*(35+rng()*46):42+rng()*190-d*(42+rng()*65));
      last={index:last.index+1,left:last.left+last.width+gap,width,phase:rng()*Math.PI*2};return {...last};
    }};
  }
  function boardLimit(gap,width,variant) {return Math.max(170,Math.min(variant==='myth'?2200:variant==='hell'?980:760,gap+width*.98));}
  const boardLength=(gap,width,ms,variant)=>Math.min(boardLimit(gap,width,variant),22+ms*.205);
  const bridgeMargin=width=>Math.min(8,width*.2);
  function replay(session,actions) {
    if(!Array.isArray(actions)||!actions.length||actions.length>12000)throw new Error('MISSING_REPLAY');
    const bridge=session.mode.startsWith('bridge_'),variant=session.variant;
    const course=bridge?bridgeCourse(session.seed,variant):hopCourse(session.seed,variant);
    let platforms=[course.first()],score=0,jumps=0,perfect=0,combo=0,maxCombo=0,current=0,x=0,z=0,readyAt=0,ended=false,finishAt=0;
    for(let i=0;i<(bridge?6:5);i++)platforms.push(course.next(score));
    for(const a of actions) {
      if(ended||!Array.isArray(a)||a.length!==2)throw new Error('INVALID_REPLAY');
      const [hold,at]=a;
      if(!Number.isSafeInteger(hold)||hold<0||hold>(bridge?30000:1220)||!Number.isSafeInteger(at)||at<0||at>86400000||at-hold<readyAt-100)throw new Error('INVALID_TIMELINE');
      if(bridge) {
        const p=platforms[current],target=platforms[current+1],gap=target.left-p.left-p.width,end=p.left+p.width+boardLength(gap,target.width,hold,variant),margin=bridgeMargin(target.width);
        if(end<target.left+margin||end>target.left+target.width-margin){ended=true;finishAt=at+580+860;continue;}
        const precise=Math.abs(end-(target.left+target.width/2))<=Math.max(13,target.width*.14);
        jumps++;current++;if(precise)perfect++;score+=1+(precise?1:0);maxCombo=perfect?1:0;
        while(platforms.length<current+7)platforms.push(course.next(score));
        readyAt=at+580+820;
      } else {
        const target=platforms.find(p=>p.index===current+1),dx=target.x-x,dz=target.z-z,dist=Math.hypot(dx,dz)||1,d=hopDistance(hold,variant),duration=440+d/hopMax(variant)*240;
        x+=dx/dist*d;z+=dz/dist*d;
        const p=platforms.find(p=>contains(p,x,z));
        if(!p){ended=true;finishAt=at+duration+920;continue;}
        if(p.index>current){const skipped=p.index-current-1,precise=Math.hypot(x-p.x,z-p.z)<=perfectRadius(p);jumps++;current=p.index;
          let points=1;if(precise){combo++;perfect++;maxCombo=Math.max(maxCombo,combo);points=Math.min(combo*2,10);}else combo=0;
          score+=points*(skipped>0?2:1)+(p.kind==='bonus'?3:0);
          while(platforms.at(-1).index<current+5)platforms.push(course.next(score));platforms=platforms.filter(p=>p.index>=current-2);
        }else combo=0;
        readyAt=at+duration;
      }
    }
    if(!ended)throw new Error('RUN_NOT_FINISHED');
    return {score,jumps,perfect,combo:maxCombo,finishAt};
  }
  root.GZJUMP_RULES=Object.freeze({VERSION,hash,seeded,difficulty,hopMax,hopDistance,perfectRadius,contains,hopCourse,bridgeCourse,boardLimit,boardLength,bridgeMargin,replay});
})(globalThis);
