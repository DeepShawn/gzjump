import { test, expect } from '@playwright/test';

const user = {id:'00000000-0000-4000-8000-000000000099',aud:'authenticated',role:'authenticated',email:'reviewer@example.test',email_confirmed_at:'2026-10-22T00:00:00Z',app_metadata:{provider:'email',providers:['email']},user_metadata:{},identities:[],created_at:'2026-10-22T00:00:00Z'};
const rows = (count=3) => Array.from({length:count},(_,i)=>({
  id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,
  player_name:`测试玩家${i+1}`,created_at:new Date(Date.UTC(2026,9,22)-i*1000).toISOString(),
  mode:'classic',day:'2026-10-22',score:10+i,jumps:5,perfect:1,combo:1,duration_ms:9000,
  status:'pending',risk_flags:[],risk_score:0,player_key:'fixture-device-key'
}));

async function mockBackend(page,{records=rows(),admin=true}={}) {
  const state={records:structuredClone(records),mutations:[],failWrites:false,partial:null,delay:0};
  // All Supabase traffic is intercepted. These tests never approve or delete live data.
  await page.route('https://beasxxexggnjcocdbtdl.supabase.co/**',async route=>{
    const request=route.request(),url=new URL(request.url()),method=request.method();
    const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*','access-control-expose-headers':'content-range'};
    const json=(body,status=200,extra={})=>route.fulfill({status,contentType:'application/json',headers:{...headers,...extra},body:JSON.stringify(body)});
    if(method==='OPTIONS')return route.fulfill({status:204,headers});
    if(url.pathname==='/auth/v1/token') {
      const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
      const access_token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:user.id,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})+'.c2lnbmF0dXJl';
      return json({access_token,token_type:'bearer',expires_in:3600,refresh_token:'fixture-refresh-token',user});
    }
    if(url.pathname==='/auth/v1/user')return json(user);
    if(url.pathname==='/auth/v1/logout')return route.fulfill({status:204,headers});
    if(url.pathname==='/rest/v1/gzjump_admins')return json(admin?[{user_id:user.id}]:[]);
    if(url.pathname==='/rest/v1/gzjump_scores') {
      if(method==='GET') {
        const filter=url.searchParams.get('status')?.replace(/^eq\./,'');
        const matching=state.records.filter(row=>!filter||row.status===filter);
        const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||25);
        const result=matching.slice(offset,offset+limit);
        return json(result,200,{'content-range':`${offset}-${offset+result.length-1}/${matching.length}`});
      }
      if(method==='PATCH'||method==='DELETE') {
        const filter=url.searchParams.get('id')||'';
        const ids=filter.startsWith('in.(')&&filter.endsWith(')')?filter.slice(4,-1).split(','):[];
        const body=request.postDataJSON();state.mutations.push({method,ids,body});
        if(!ids.length)return json({message:'Unbounded mutation rejected by fixture'},400);
        if(state.delay)await new Promise(resolve=>setTimeout(resolve,state.delay));
        if(state.failWrites)return json({code:'42501',message:'fixture RLS denied'},403);
        let affected=state.records.filter(row=>ids.includes(row.id));
        if(state.partial!==null)affected=affected.slice(0,state.partial);
        const affectedIds=new Set(affected.map(row=>row.id));
        if(method==='DELETE')state.records=state.records.filter(row=>!affectedIds.has(row.id));
        else for(const row of affected)row.status=body.status;
        return json(affected.map(row=>({id:row.id})));
      }
    }
    return json({message:'Unexpected mocked endpoint'},500);
  });
  await page.goto('/admin.html');
  await page.locator('#email').fill(user.email);await page.locator('#password').fill('fixture-password-only');await page.locator('#login').click();
  if(admin)await expect(page.locator('#message')).toHaveText('已加载成绩。');
  else await expect(page.locator('#message')).toContainText('没有管理员权限');
  return state;
}

test('checks individual rows, shows a partial select-all, and approves only the chosen IDs',async({page})=>{
  const state=await mockBackend(page);
  await expect(page.locator('#bulk-approve')).toBeDisabled();
  const boxes=page.locator('#scores input[data-score-id]');await boxes.nth(0).check();await boxes.nth(2).check();
  await expect(page.locator('#selection-count')).toHaveText('已选择 2 条');
  expect(await page.locator('#select-all').evaluate(el=>el.indeterminate)).toBe(true);
  await page.locator('#bulk-approve').click();await expect(page.locator('#message')).toHaveText('已通过 2 条成绩。');
  expect(state.mutations).toEqual([{method:'PATCH',ids:[rows()[0].id,rows()[2].id],body:{status:'approved'}}]);
  await expect(page.locator('#scores tr')).toHaveCount(1);await expect(page.locator('#selection-count')).toHaveText('已选择 0 条');
});

test('cancelled deletion preserves the selection; confirmed deletion is a single bounded request',async({page})=>{
  const state=await mockBackend(page);await page.locator('#select-all').check();
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('#bulk-delete').click();
  expect(state.mutations).toHaveLength(0);await expect(page.locator('#selection-count')).toHaveText('已选择 3 条');
  page.once('dialog',async dialog=>{expect(dialog.message()).toContain('3 条成绩');await dialog.accept();});
  await page.locator('#bulk-delete').click();await expect(page.locator('#message')).toHaveText('已删除 3 条成绩。');
  expect(state.mutations).toHaveLength(1);expect(state.mutations[0]).toMatchObject({method:'DELETE',ids:rows().map(row=>row.id)});
  await expect(page.locator('#scores tr')).toHaveCount(0);await expect(page.locator('#select-all')).toBeDisabled();
});

test('select-all is limited to the current page and deletion of the last page returns to the previous page',async({page})=>{
  const state=await mockBackend(page,{records:rows(28)});await page.locator('#select-all').check();
  await expect(page.locator('#selection-count')).toHaveText('已选择 25 条');
  await page.locator('#next').click();await expect(page.locator('#scores tr')).toHaveCount(3);
  await expect(page.locator('#selection-count')).toHaveText('已选择 0 条');
  await page.locator('#select-all').check();page.once('dialog',dialog=>dialog.accept());await page.locator('#bulk-delete').click();
  await expect(page.locator('#message')).toHaveText('已删除 3 条成绩。');
  expect(state.mutations[0].ids).toEqual(rows(28).slice(25).map(row=>row.id));
  await expect(page.locator('#page-label')).toHaveText('第 1 页 · 共 25 条');await expect(page.locator('#scores tr')).toHaveCount(25);
});

test('refresh and filter changes clear selection and already-approved records are skipped',async({page})=>{
  const records=rows();records[0].status='approved';const state=await mockBackend(page,{records});
  await page.locator('#select-all').check();await page.locator('#refresh').click();
  await expect(page.locator('#message')).toHaveText('已加载成绩。');await expect(page.locator('#selection-count')).toHaveText('已选择 0 条');
  await page.locator('#select-all').check();await page.locator('#filter').selectOption('all');
  await expect(page.locator('#scores tr')).toHaveCount(3);await expect(page.locator('#selection-count')).toHaveText('已选择 0 条');
  await page.locator('#select-all').check();await expect(page.locator('#bulk-approve')).toHaveText('批量通过（2）');
  await page.locator('#bulk-approve').click();await expect(page.locator('#message')).toHaveText('已通过 2 条成绩。');
  expect(state.mutations[0].ids).toEqual(records.slice(1).map(row=>row.id));
});

test('partial results are counted from returned IDs and permission failures are not reported as success',async({page})=>{
  const state=await mockBackend(page);state.partial=1;await page.locator('#select-all').check();await page.locator('#bulk-approve').click();
  await expect(page.locator('#message')).toContainText('已通过 1 条，另有 2 条未完成');
  await expect(page.locator('#scores tr')).toHaveCount(2);state.failWrites=true;
  await page.locator('#select-all').check();await page.locator('#bulk-approve').click();
  await expect(page.locator('#message')).toContainText('无法确认操作结果');
  await expect(page.locator('#scores tr')).toHaveCount(2);await expect(page.locator('#selection-count')).toHaveText('已选择 0 条');
});

test('a pending request locks batch, row, filter and paging controls',async({page})=>{
  const state=await mockBackend(page);state.delay=700;await page.locator('#select-all').check();
  await page.locator('#bulk-reject').click();await expect(page.locator('#message')).toContainText('正在批量拒绝');
  for(const id of ['bulk-approve','bulk-reject','bulk-delete','select-all','clear-selection','refresh','filter','previous','next'])await expect(page.locator('#'+id)).toBeDisabled();
  await expect(page.locator('#scores input[data-score-id]').first()).toBeDisabled();
  await expect(page.locator('#scores button').first()).toBeDisabled();
  await expect(page.locator('#message')).toHaveText('已拒绝 3 条成绩。');expect(state.mutations).toHaveLength(1);
});

test('empty pages have no actionable selection and a regular account cannot open the dashboard',async({page})=>{
  await mockBackend(page,{records:[]});await expect(page.locator('#empty')).toBeVisible();
  await expect(page.locator('#select-all')).toBeDisabled();await expect(page.locator('#bulk-delete')).toBeDisabled();
  await page.close();
});

test('regular accounts cannot access batch management',async({page})=>{
  const state=await mockBackend(page,{admin:false});await expect(page.locator('#dashboard')).toBeHidden();
  expect(state.mutations).toHaveLength(0);await expect(page.locator('#bulk-approve')).toBeDisabled();
});

test('selection and bulk controls remain usable on mobile',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});await mockBackend(page);await page.locator('#select-all').check();
  await expect(page.locator('#bulk-delete')).toBeEnabled();await expect(page.locator('#selection-count')).toHaveText('已选择 3 条');
  expect(await page.locator('body').evaluate(el=>el.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('admin-mobile.png'),fullPage:true});
});
