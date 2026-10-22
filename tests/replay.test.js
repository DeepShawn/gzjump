import test from 'node:test';
import assert from 'node:assert/strict';
import '../assets/game-rules.js';
const rules=globalThis.GZJUMP_RULES;
const hop={mode:'classic',variant:'normal',seed:42};
const bridge={mode:'bridge_endless',variant:'normal',seed:42};
test('replays a centered hop then a fall, deriving all totals from the inputs',()=>{
  const result=rules.replay(hop,[[438,488],[150,2088]]);
  assert.deepEqual([result.score,result.jumps,result.perfect,result.combo],[2,1,1,1]);
  assert.ok(result.finishAt>3400&&result.finishAt<3500);
});
test('replays a centered board then a failed board independently of render effects',()=>{
  assert.deepEqual(rules.replay(bridge,[[261,311],[0,2261]]),{score:2,jumps:1,perfect:1,combo:1,finishAt:3701});
});
test('rejects incomplete runs, inputs after death and impossible action timing',()=>{
  for(const actions of [[],[[438,488]],[[438,100]],[[438,488],[150,500]],[[438,488],[150,2088],[150,4000]],[[NaN,1000]],[[Infinity,1000]]]){
    assert.throws(()=>rules.replay(hop,actions));
  }
});
test('ordinary difficulty stays constant through 300; generated layouts are deterministic',()=>{
  assert.equal(rules.difficulty(0,'normal'),0);assert.equal(rules.difficulty(300,'normal'),0);
  assert.ok(rules.difficulty(301,'normal')>0);
  const a=rules.hopCourse(31,'normal'),b=rules.hopCourse(31,'normal');
  for(let i=0;i<100;i++)assert.deepEqual(a.next(i*10),b.next(i*10));
  assert.equal(rules.difficulty(1600,'myth'),1);assert.ok(rules.hopMax('myth')>rules.hopMax('hell'));
});
test('narrow bridge platforms retain a nonempty landing interval',()=>{
  assert.ok(12-rules.bridgeMargin(12)*2>0);
});
