const {testPassword,changedPassword,localDate}=require('./test-credentials.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Zip = require('adm-zip');
const base = process.env.TEST_API || 'http://127.0.0.1:8087/food', stamp = Date.now().toString();
const date = localDate(), checks = [], failures = [], tokens = {};
const out = path.join(__dirname, 'artifacts/full-regression'); fs.mkdirSync(out,{recursive:true});
async function api(who, route, body, expected=200) {
  const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Food-Token':'Bearer '+(tokens[who]||'')},body:body===undefined?undefined:JSON.stringify(body)});
  const d=await r.json(); assert.equal(r.status,expected,`${who} ${route}: ${JSON.stringify(d)}`); return d.data;
}
async function check(name, fn) { try {await fn();checks.push({name,passed:true});}catch(e){checks.push({name,passed:false,error:e.message});failures.push(name);console.error(name+': '+e.message);} }
async function login(who, username=who, password=testPassword) { tokens[who]=(await api('', '/auth/login',{username,password})).token; }
async function rows(who, filters) {
  const r=await fetch(base+'/export?'+new URLSearchParams(filters),{headers:{'X-Food-Token':'Bearer '+tokens[who]}});assert.equal(r.status,200);
  const zip=new Zip(Buffer.from(await r.arrayBuffer()));
  const strings=[...zip.readAsText('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m=>[...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(v=>v[1]).join(''));
  return [...zip.readAsText('xl/worksheets/sheet1.xml').matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(row=>[...row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].map(cell=>{const v=cell[2].match(/<v>(.*?)<\/v>/)?.[1]||'';return cell[1].includes('t="s"')?strings[Number(v)]:v;}));
}
const ids=orders=>orders.map(o=>o.id).sort((a,b)=>a-b);
(async()=>{
  for(const who of ['admin','store_a','store_b','store_c','supplier_a','supplier_b'])await login(who);
  const all=await api('admin','/bootstrap');
  for(const [who,field,id] of [['store_a','store_id',1],['store_b','store_id',2],['store_c','store_id',3],['supplier_a','supplier_id',1],['supplier_b','supplier_id',2]]) {
    await check(who+' 严格按登录身份返回数据，伪造参数无效',async()=>{const d=await api(who,'/bootstrap?role=admin&storeId=999&supplierId=999');assert.deepEqual(ids(d.orders),ids(all.orders.filter(o=>o[field]===id)));assert.equal(d.accounts.length,0);assert.equal(d.feedback.length,0);if(who.startsWith('supplier')){assert.equal(d.products.length,0);assert.equal(d.settlements.length,0);assert(d.orders.every(o=>!('total'in o)&&!('paid'in o)&&o.items.every(i=>!('price'in i)&&!('amount'in i))));}});
  }
  for(const who of ['store_a','supplier_a'])for(const route of ['/products','/stores','/suppliers','/bindings','/accounts','/settlements'])await check(who+' 无权写入 '+route,()=>api(who,route,{},403));
  for(const who of ['supplier_a','admin'])await check(who+' 无权使用门店购物车',()=>api(who,'/cart',{productId:1,quantity:1},403));
  await api('admin','/stores',{name:'完整回归门店'+stamp,contact:'测试采购员',phone:'13800002222',address:'仅测试收货地址',active:1});
  let d=await api('admin','/bootstrap');const store=d.stores.find(s=>s.name==='完整回归门店'+stamp);
  await api('admin','/bindings',{storeId:store.id,supplierId:1});
  const username='full_'+stamp;await api('admin','/accounts',{username,name:'完整回归采购员',role:'store',storeId:store.id,password:testPassword,active:1});await login('buyer',username);
  const make=(key,extra={})=>({requestKey:stamp+'-'+key,deliveryDate:date,deliverySlot:'06:00—08:00',remark:'完整回归，不实际配送',items:[{productId:1,quantity:2}],...extra});
  const invalids=[['空商品',{items:[]}],['重复商品',{items:[{productId:1,quantity:2},{productId:1,quantity:2}]}],['零数量',{items:[{productId:1,quantity:0}]}],['三位小数',{items:[{productId:1,quantity:1.001}]}],['超量',{items:[{productId:1,quantity:100001}]}],['过去日期',{deliveryDate:'2020-01-01'}],['超远日期',{deliveryDate:'2099-01-01'}],['错误时段',{deliverySlot:'invalid'}],['超长备注',{remark:'x'.repeat(501)}]];
  for(const [name,extra]of invalids)await check('下单拒绝'+name,()=>api('buyer','/orders',make(name,extra),400));
  await check('购物车增改删与部分下单保留未选商品',async()=>{await api('buyer','/cart',{productId:1,quantity:2});await api('buyer','/cart',{productId:2,quantity:5});await api('buyer','/cart',{productId:2,quantity:0});assert.equal((await api('buyer','/bootstrap')).cart.length,1);await api('buyer','/cart',{productId:2,quantity:5});});
  const first=await api('buyer','/orders',make('first',{price:0.01,supplierId:2,storeId:3}));
  const second=await api('buyer','/orders',make('second'));
  const cancel=await api('buyer','/orders',make('cancel'));await api('buyer',`/orders/${cancel.id}/action`,{action:'cancel'});
  await check('服务端分单及计算金额，不信任客户端身份价格',async()=>{const d=await api('buyer','/bootstrap'),o=d.orders.find(o=>o.id===first.id);assert.equal(o.store_id,store.id);assert.equal(o.supplier_id,1);assert.equal(Number(o.total),5);assert.deepEqual(d.cart.map(i=>i.productId),[2]);});
  await check('取消单不能继续接单或上报异常',async()=>{await api('supplier_a',`/orders/${cancel.id}/action`,{action:'accept'},409);await api('buyer',`/orders/${cancel.id}/action`,{action:'report',note:'test'},409);});
  await check('履约中禁止线下结算、禁止跳过收货',async()=>{await api('admin','/settlements',{storeId:store.id,amount:1,date,note:'test',requestKey:stamp+'-early'},409);await api('buyer',`/orders/${first.id}/action`,{action:'receive'},409);});
  for(const order of [first,second]) {
    await check('订单'+order.id+' 各阶段异常均可处理恢复后继续履约',async()=>{
      for(const [status,next,actor]of [['pending','accept','supplier_a'],['preparing','packed','supplier_a'],['ready','start','supplier_a'],['delivering','deliver','supplier_a'],['delivered','receive','buyer']]) {
        await api(status==='pending'?'buyer':'supplier_a',`/orders/${order.id}/action`,{action:'report',note:'回归 '+status});
        await api('admin',`/orders/${order.id}/action`,{action:'resolve',note:'已处理，恢复 '+status});
        assert.equal((await api('buyer','/bootstrap')).orders.find(o=>o.id===order.id).status,status);
        if(status==='preparing'){await api('supplier_a',`/orders/${order.id}/action`,{action:'packed'},409);await api('supplier_a',`/orders/${order.id}/picking`,{productId:1,picked:true});}
        await api(actor,`/orders/${order.id}/action`,{action:next});
      }
    });
  }
  await check('已完成订单拒绝重复收货、改备货和重新报异常',async()=>{await api('buyer',`/orders/${first.id}/action`,{action:'receive'},409);await api('supplier_a',`/orders/${first.id}/picking`,{productId:1,picked:false},409);await api('admin',`/orders/${first.id}/action`,{action:'report',note:'test'},409);});
  await check('线下结算按先后分配、部分支付、重复登记幂等',async()=>{const payment={storeId:store.id,amount:7,date,note:'测试款，无实际收付',requestKey:stamp+'-pay'};await api('admin','/settlements',payment);await api('admin','/settlements',payment);let d=await api('buyer','/bootstrap');assert.equal(Number(d.orders.find(o=>o.id===first.id).paid),5);assert.equal(Number(d.orders.find(o=>o.id===second.id).paid),2);assert.equal(d.settlements.length,1);await api('admin','/settlements',{...payment,amount:4,requestKey:stamp+'-over'},409);await api('admin','/settlements',{...payment,amount:3,requestKey:stamp+'-rest'});});
  const pending=await api('buyer','/orders',make('pending'));
  await check('订单导出遵循状态和关键词筛选',async()=>{const r=await rows('admin',{type:'orders',storeId:store.id,status:'completed',search:first.order_no});assert.equal(r.length,2);assert.equal(r[1][0],first.order_no);});
  await check('供应商历史订单导出只包含已完成订单',async()=>{const r=await rows('supplier_a',{type:'orders',storeId:store.id,status:'completed'});assert.deepEqual(r.slice(1).map(x=>x[0]).sort(),[first.order_no,second.order_no].sort());assert(r.slice(1).every(x=>x[7]===''&&x[8]===''));});
  await check('门店账单导出排除取消单',async()=>{const r=await rows('buyer',{type:'orders',excludeCancelled:'true'});assert(!r.some(x=>x[0]===cancel.order_no));assert.equal(r.length,4);});
  await check('食材汇总正确且遵循供应商筛选',async()=>{const r=await rows('admin',{type:'stock',storeId:store.id,supplierId:2});assert.equal(r.length,1);const own=await rows('supplier_a',{type:'stock',storeId:store.id});assert.equal(own.length,2);assert.equal(Number(own[1][1]),4);});
  await check('门店与供应商导出权限不可越界',async()=>{assert.equal((await rows('store_b',{type:'orders',storeId:store.id})).length,1);assert.equal((await rows('supplier_b',{type:'orders',storeId:store.id})).length,1);const r=await fetch(base+'/export?type=settlements',{headers:{'X-Food-Token':'Bearer '+tokens.supplier_a}});assert.equal(r.status,403);});
  await check('结算导出金额与登记记录一致',async()=>{const r=await rows('buyer',{type:'settlements'});assert.equal(r.length,3);assert.equal(r.slice(1).reduce((s,x)=>s+Number(x[1]),0),10);});
  await api('admin','/bindings',{storeId:store.id,supplierId:2});const fresh=await api('buyer','/orders',make('after-binding'));
  await check('改绑保留历史归属，双方不能处理对方订单',async()=>{const a=await api('supplier_a','/bootstrap'),b=await api('supplier_b','/bootstrap');assert(a.orders.some(o=>o.id===pending.id));assert(!a.orders.some(o=>o.id===fresh.id));assert(b.orders.some(o=>o.id===fresh.id));assert(!b.orders.some(o=>o.id===pending.id));await api('supplier_a',`/orders/${fresh.id}/action`,{action:'accept'},404);await api('supplier_b',`/orders/${pending.id}/action`,{action:'accept'},404);});
  await check('改绑后旧供应商仍有历史门店筛选数据',async()=>{const d=await api('supplier_a','/bootstrap');const eligible=new Set([...d.stores.map(s=>s.id),...d.orders.map(o=>o.store_id)]);assert(eligible.has(store.id));});
  await check('有履约订单禁止停用门店',()=>api('admin','/stores',{...store,active:0},409));
  await check('反馈空白与超长校验及平台可见',async()=>{await api('buyer','/feedback',{content:''},400);await api('buyer','/feedback',{content:'x'.repeat(1001)},400);await api('buyer','/feedback',{content:'完整回归反馈'+stamp});assert((await api('admin','/bootstrap')).feedback.some(f=>f.content==='完整回归反馈'+stamp));});
  await check('食材计价单位变更后历史汇总按单位分开',async()=>{
    await api('admin','/products',{name:'单位快照'+stamp,category:'粮油',unit:'斤',spec:'测试',price:2.55,minimum:1,image:'0',description:'单位汇总回归',active:1});
    const p=(await api('admin','/bootstrap')).products.find(p=>p.name==='单位快照'+stamp);
    for(const [index,unit,quantity]of [[0,'斤',1],[1,'袋',1.5]]){
      await api('admin','/products',{...p,unit});
      const o=await api('buyer','/orders',make('unit-'+index,{items:[{productId:p.id,quantity}]}));
      await api('supplier_b',`/orders/${o.id}/action`,{action:'accept'});await api('supplier_b',`/orders/${o.id}/picking`,{productId:p.id,picked:true});
      for(const action of ['packed','start','deliver'])await api('supplier_b',`/orders/${o.id}/action`,{action});await api('buyer',`/orders/${o.id}/action`,{action:'receive'});
    }
    const exported=(await rows('supplier_b',{type:'stock',storeId:store.id})).slice(1).filter(r=>r[0]===p.name);
    assert.equal(exported.length,2);assert.deepEqual(exported.map(r=>[r[2],Number(r[1])]).sort(),[['斤',1],['袋',1.5]].sort());
  });
  await check('退出后原会话立即失效',async()=>{await api('buyer','/auth/logout',{});await api('buyer','/bootstrap',undefined,401);});
  const report={passed:!failures.length,time:new Date().toISOString(),checkCount:checks.length,failed:failures,checks,fixture:{storeId:store.id,username,first,second,pending,fresh,cancel}};
  fs.writeFileSync(path.join(out,'api.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:checks.length,failed:failures,fixture:report.fixture},null,2));
  for(const who of Object.keys(tokens))if(who!=='buyer')await api(who,'/auth/logout',{});
  if(failures.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
