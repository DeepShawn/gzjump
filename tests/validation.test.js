import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSubmission} from '../supabase/functions/gzjump-submit/validation.js';
const now = new Date('2026-10-14T12:00:00Z');
const valid = {id:'39de07d5-8327-4659-8ac1-000ab75c2b0d',device_id:'39de07d5-8327-4659-8ac1-000ab75c2b0e',assist:false,player_name:'海上的橘子',score:12,jumps:5,perfect:3,combo:2,mode:'daily',day:'2026-10-14',fruit:'orange',duration_ms:6500};
test('accepts valid completed runs, including a zero-score first fall',() => {
  assert.deepEqual(validateSubmission(valid,now),valid);
  assert.equal(validateSubmission({...valid,score:0,jumps:0,perfect:0,combo:0},now).score,0);
});
test('rejects forged or inconsistent numbers, oversized names and injection markup',() => {
  for (const patch of [{score:1000},{score:-1},{score:1.5},{jumps:10001},{perfect:6},{combo:4},{combo:0},{duration_ms:0},{player_name:'<img onerror=alert(1)>'},{player_name:'x\u200by'},{player_name:'a'.repeat(21)},{status:'approved',score:999}]) {
    assert.throws(() => validateSubmission({...valid,...patch},now),JSON.stringify(patch));
  }
});
test('rejects malformed, impossible, stale or future dates and unknown modes',() => {
  for (const patch of [{day:'2026-02-30'},{day:'2026-10-01'},{day:'2027-10-14'},{id:'fake'},{mode:'admin'},{fruit:'apple'}]) assert.throws(() => validateSubmission({...valid,...patch},now));
});
test('removes caller-supplied moderation and timestamp fields',() => {
  const result = validateSubmission({...valid,status:'approved',created_at:'2000-01-01'},now);
  assert.equal(result.status,undefined); assert.equal(result.created_at,undefined);
});
