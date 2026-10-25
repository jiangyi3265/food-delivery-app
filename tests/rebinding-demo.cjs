const {testPassword,changedPassword}=require('./test-credentials.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Zip = require('adm-zip');
const out = path.join(__dirname, 'artifacts/rebinding-demo');
const before = JSON.parse(fs.readFileSync(path.join(out, 'before.json'), 'utf8'));
const phase = process.argv[2] === 'final' ? 'final' : 'before-processing';
const tokens = {}, checks = [];
const base = 'http://127.0.0.1:8086/food';
const ids = rows => rows.map(row => row.id).sort((a, b) => a - b);
function check(name, run) { run(); checks.push({ name, passed: true }); }
async function api(account, route, body, expected = 200) {
  const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: {
    'Content-Type': 'application/json', 'X-Food-Token': 'Bearer ' + (tokens[account] || '')
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  assert.equal(response.status, expected, `${account} ${route}: ${JSON.stringify(data)}`);
  return data;
}
async function exportedOrderNumbers(account) {
  const response = await fetch(base + '/export?type=orders&storeId=1', { headers: { 'X-Food-Token': 'Bearer ' + tokens[account] } });
  assert.equal(response.status, 200);
  const zip = new Zip(Buffer.from(await response.arrayBuffer()));
  const strings = [...zip.readAsText('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(match => [...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(value => value[1]).join(''));
  return [...new Set([...zip.readAsText('xl/worksheets/sheet1.xml').matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].slice(1).map(row => strings[Number(row[1].match(/<v>(.*?)<\/v>/)[1])]))].sort();
}
(async () => {
  for (const account of ['admin', 'store_a', 'store_b', 'store_c', 'supplier_a', 'supplier_b']) {
    tokens[account] = (await api('', '/auth/login', { username: account, password: testPassword })).data.token;
  }
  const all = (await api('admin', '/bootstrap')).data;
  const a = all.stores.find(store => store.id === 1);
  const old = all.orders.find(order => order.id === 11);
  const fresh = all.orders.find(order => order.id === 14);
  check('A 食堂当前绑定丰禾，B/C 绑定保持不变', () => {
    assert.equal(a.supplier_id, 2);
    assert.equal(all.stores.find(store => store.id === 2).supplier_id, 1);
    assert.equal(all.stores.find(store => store.id === 3).supplier_id, 2);
  });
  check('新订单由服务端分配给丰禾，金额为28元', () => {
    assert.equal(fresh.store_id, 1); assert.equal(fresh.supplier_id, 2); assert.equal(Number(fresh.total), 28);
    assert(fresh.remark.includes('改绑演示'));
  });
  check('改绑前6笔 A 食堂订单全部保持绿源归属及原价格数量', () => {
    assert.equal(before.orders.length, 6);
    for (const snapshot of before.orders) {
      const order = all.orders.find(order => order.id === snapshot.id);
      assert.equal(order.supplier_id, snapshot.supplierId); assert.equal(order.supplier_id, 1);
      assert.equal(order.total, snapshot.total);
      assert.deepEqual(order.items.map(({ picked, ...item }) => item), snapshot.items.map(({ picked, ...item }) => item));
    }
  });
  const lvyuan = (await api('supplier_a', '/bootstrap')).data;
  const fenghe = (await api('supplier_b', '/bootstrap')).data;
  check('绿源能看到全部历史 A 订单，但看不到新订单', () => {
    assert.deepEqual(ids(lvyuan.orders.filter(order => order.store_id === 1)), before.orders.map(order => order.id).sort((a, b) => a - b));
    assert(!lvyuan.orders.some(order => order.id === fresh.id));
  });
  check('丰禾能看到 A 新订单，但看不到6笔旧订单', () => {
    assert.deepEqual(ids(fenghe.orders.filter(order => order.store_id === 1)), [fresh.id]);
    assert(!fenghe.orders.some(order => before.orders.some(snapshot => snapshot.id === order.id)));
  });
  for (const [account, data, supplierId] of [['supplier_a', lvyuan, 1], ['supplier_b', fenghe, 2]]) {
    check(`${account} 全部订单按订单原始归属隔离`, () => assert.deepEqual(ids(data.orders), ids(all.orders.filter(order => order.supplier_id === supplierId))));
    const forged = (await api(account, '/bootstrap?storeId=1&supplierId=' + (supplierId === 1 ? 2 : 1) + '&role=admin')).data;
    check(`${account} 同一门店改绑后仍不能用参数扩大权限`, () => assert.deepEqual(ids(forged.orders), ids(data.orders)));
    const exported = await exportedOrderNumbers(account);
    check(`${account} 指定 A 食堂导出仍只含自己负责的新或旧订单`, () => assert.deepEqual(exported, data.orders.filter(order => order.store_id === 1).map(order => order.order_no).sort()));
  }
  for (const [account, storeId] of [['store_a', 1], ['store_b', 2], ['store_c', 3]]) {
    const data = (await api(account, '/bootstrap')).data;
    check(`${account} 改绑不影响门店自身数据隔离`, () => assert.deepEqual(ids(data.orders), ids(all.orders.filter(order => order.store_id === storeId))));
  }
  for (const [account, target] of [['supplier_a', fresh], ['supplier_b', old]]) {
    await api(account, `/orders/${target.id}/action`, { action: 'accept', supplierId: account === 'supplier_a' ? 1 : 2, storeId: 1 }, 404);
    checks.push({ name: `${account} 越权接单 ${target.order_no} 被拒绝`, passed: true, status: 404 });
    await api(account, `/orders/${target.id}/picking`, { productId: target.items[0].productId, picked: false }, 404);
    checks.push({ name: `${account} 越权修改备货 ${target.order_no} 被拒绝`, passed: true, status: 404 });
  }
  const after = (await api('admin', '/bootstrap')).data;
  check('越权请求未改变任何订单状态、备货或事件记录', () => assert.deepEqual(after.orders, all.orders));
  if (phase === 'final') {
    check('绿源已在界面成功接单并备货旧订单', () => { assert.equal(old.status, 'preparing'); assert(old.items.every(item => item.picked)); assert(old.events.some(event => event.action === 'accept')); });
    check('丰禾已在界面成功接单并备货新订单', () => { assert.equal(fresh.status, 'preparing'); assert(fresh.items.every(item => item.picked)); assert(fresh.events.some(event => event.action === 'accept')); });
    check('其他5笔历史订单仍保持改绑前状态和操作记录', () => {
      for (const snapshot of before.orders.filter(order => order.id !== old.id)) {
        const order = all.orders.find(order => order.id === snapshot.id);
        assert.equal(order.status, snapshot.status); assert.deepEqual(order.events, snapshot.events);
      }
    });
  } else {
    check('改绑本身不改变任何历史订单的履约状态', () => {
      for (const snapshot of before.orders) { const order = all.orders.find(order => order.id === snapshot.id); assert.equal(order.status, snapshot.status); assert.deepEqual(order.events, snapshot.events); }
    });
  }
  const report = { passed: true, phase, checkCount: checks.length, time: new Date().toISOString(), binding: 'A食堂 → 丰禾配送', historicalOrderCount: before.orders.length,
    oldOrder: { id: old.id, orderNo: old.order_no, supplier: old.supplierName, total: old.total, status: old.status },
    newOrder: { id: fresh.id, orderNo: fresh.order_no, supplier: fresh.supplierName, total: fresh.total, status: fresh.status }, checks };
  fs.writeFileSync(path.join(out, phase + '.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, checks: undefined }, null, 2));
  for (const account of Object.keys(tokens)) await api(account, '/auth/logout', {});
})().catch(error => { console.error(error); process.exitCode = 1; });
