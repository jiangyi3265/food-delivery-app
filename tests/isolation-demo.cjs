const {testPassword,changedPassword,localDate}=require('./test-credentials.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Zip = require('adm-zip');

const base = 'http://127.0.0.1:8086/food';
const out = path.join(__dirname, 'artifacts/isolation-demo');
const checks = [];
const tokens = {};
function check(name, run) { run(); checks.push({ name, passed: true }); }
async function json(account, route, body, status = 200) {
  const response = await fetch(base + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Food-Token': 'Bearer ' + (tokens[account] || '') },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const result = await response.json();
  assert.equal(response.status, status, `${account} ${route}: ${JSON.stringify(result)}`);
  return result;
}
const ids = rows => rows.map(row => Number(row.id)).sort((a, b) => a - b);
const unescapeXml = text => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
async function exportRows(account, query) {
  const response = await fetch(base + '/export?' + query, { headers: { 'X-Food-Token': 'Bearer ' + tokens[account] } });
  assert.equal(response.status, 200);
  const zip = new Zip(Buffer.from(await response.arrayBuffer()));
  const strings = [...zip.readAsText('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(match => unescapeXml([...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(value => value[1]).join('')));
  return [...zip.readAsText('xl/worksheets/sheet1.xml').matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(match => [...match[1].matchAll(/<c\b[^>]*>([\s\S]*?)<\/c>/g)].map(cell => {
    const value = cell[1].match(/<v>(.*?)<\/v>/);
    return value ? strings[Number(value[1])] : '';
  }));
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  for (const account of ['admin', 'store_a', 'store_b', 'store_c', 'supplier_a', 'supplier_b']) {
    tokens[account] = (await json('', '/auth/login', { username: account, password: testPassword })).data.token;
  }
  const before = (await json('admin', '/bootstrap')).data;
  const a = before.orders.find(order => order.order_no === 'SC20261024C00214D1');
  const c = before.orders.find(order => order.order_no === 'SC20261024DBD873F7');
  check('A 食堂界面下单自动分配绿源食材', () => { assert(a); assert.equal(a.store_id, 1); assert.equal(a.supplier_id, 1); assert.equal(Number(a.total), 10); });
  check('C 食堂界面下单自动分配丰禾配送', () => { assert(c); assert.equal(c.store_id, 3); assert.equal(c.supplier_id, 2); assert.equal(Number(c.total), 22.5); });

  // Deliberately forged client routing fields on a labelled local demo order.
  // The authenticated B account and its server-side binding must win.
  const created = (await json('store_b', '/orders', {
    requestKey: `isolation-demo-B-${a.id}-${c.id}`,
    storeId: 3, supplierId: 2, accountId: 1, role: 'admin',
    deliveryDate: localDate(1),
    deliverySlot: '06:00—08:00', items: [{ productId: 3, quantity: 5 }],
    remark: '权限隔离演示 B｜伪造门店和供应商参数校验｜不实际配送'
  })).data;
  const all = (await json('admin', '/bootstrap')).data;
  const b = all.orders.find(order => order.id === created.id);
  check('B 食堂伪造 C 食堂和丰禾参数仍归属 B → 绿源', () => { assert(b); assert.equal(b.store_id, 2); assert.equal(b.supplier_id, 1); assert.equal(Number(b.total), 16); });
  check('历史初始化样例和本轮演示订单的收货信息均属于各自门店', () => {
    for (const order of all.orders.filter(order => /^seed-[0-8]$/.test(order.request_key) || [a.id, b.id, c.id].includes(order.id))) {
      const store = all.stores.find(store => store.id === order.store_id);
      for (const field of ['contact', 'phone', 'address']) assert.equal(order[field], store[field], `${order.order_no} ${field}`);
    }
  });
  const scope = {};
  for (const [account, storeId] of [['store_a', 1], ['store_b', 2], ['store_c', 3]]) {
    const data = (await json(account, '/bootstrap')).data;
    check(`${account} 订单严格限定本门店`, () => assert.deepEqual(ids(data.orders), ids(all.orders.filter(order => order.store_id === storeId))));
    check(`${account} 仅返回本门店联系人与地址`, () => assert.deepEqual(ids(data.stores), [storeId]));
    check(`${account} 结算记录严格限定本门店`, () => assert.deepEqual(ids(data.settlements), ids(all.settlements.filter(item => item.store_id === storeId))));
    check(`${account} 无平台账号及其他门店反馈`, () => { assert.deepEqual(data.accounts, []); assert.deepEqual(data.feedback, []); });
    const forged = (await json(account, '/bootstrap?storeId=3&supplierId=2&role=admin&accountId=1')).data;
    check(`${account} 修改查询参数不能扩大数据范围`, () => { assert.deepEqual(ids(forged.orders), ids(data.orders)); assert.deepEqual(ids(forged.stores), [storeId]); });
    const rows = (await exportRows(account, 'type=orders')).slice(1);
    check(`${account} Excel 只包含本门店订单`, () => { assert(rows.length); assert(rows.every(row => row[1] === data.stores[0].name)); });
    const foreignStore = storeId === 1 ? 3 : 1;
    assert.equal((await exportRows(account, 'type=orders&storeId=' + foreignStore)).length, 1);
    assert.equal((await exportRows(account, 'type=settlements&storeId=' + foreignStore)).length, 1);
    checks.push({ name: `${account} 导出不能绕过门店隔离`, passed: true });
    scope[account] = { visibleStores: data.stores.map(store => store.name), orderNumbers: data.orders.map(order => order.order_no), settlements: data.settlements.length };
  }
  for (const [account, supplierId] of [['supplier_a', 1], ['supplier_b', 2]]) {
    const data = (await json(account, '/bootstrap')).data;
    const expectedStores = all.stores.filter(store => store.supplier_id === supplierId);
    check(`${account} 只返回自己负责的订单`, () => assert.deepEqual(ids(data.orders), ids(all.orders.filter(order => order.supplier_id === supplierId))));
    check(`${account} 只返回负责门店的联系人与地址`, () => assert.deepEqual(ids(data.stores), ids(expectedStores)));
    check(`${account} 无其他供应商资料`, () => assert.deepEqual(ids(data.suppliers), [supplierId]));
    check(`${account} 无销售金额、单价、结算、账号及反馈`, () => {
      assert.deepEqual(data.settlements, []); assert.deepEqual(data.accounts, []); assert.deepEqual(data.feedback, []); assert.deepEqual(data.products, []);
      for (const order of data.orders) { assert(!('total' in order)); assert(!('paid' in order)); for (const item of order.items) { assert(!('price' in item)); assert(!('amount' in item)); } }
    });
    const forged = (await json(account, '/bootstrap?role=admin&supplierId=' + (supplierId === 1 ? 2 : 1))).data;
    check(`${account} 伪造身份参数不能扩大权限`, () => assert.deepEqual(ids(forged.orders), ids(data.orders)));
    const rows = (await exportRows(account, 'type=orders')).slice(1);
    check(`${account} Excel 限定负责门店且不含销售金额`, () => { assert(rows.length); assert(rows.every(row => expectedStores.some(store => store.name === row[1]) && !row[7] && !row[8])); });
    assert.equal((await exportRows(account, 'type=orders&storeId=' + (supplierId === 1 ? 3 : 1))).length, 1);
    checks.push({ name: `${account} 指定不负责门店导出为空`, passed: true });
    await json(account, '/export?type=settlements', undefined, 403);
    checks.push({ name: `${account} 请求结算报表被拒绝`, passed: true, httpStatus: 403 });
    scope[account] = { visibleStores: data.stores.map(store => store.name), orderNumbers: data.orders.map(order => order.order_no) };
  }

  const blocked = [];
  const attacks = [
    ['store_a', c, 'cancel'], ['store_c', a, 'cancel'],
    ['store_a', b, 'cancel'], ['store_b', a, 'cancel'],
    ['store_b', c, 'cancel'], ['store_c', b, 'cancel'],
    ['supplier_a', c, 'accept'], ['supplier_b', a, 'accept'], ['supplier_b', b, 'accept']
  ];
  for (const [account, order, action] of attacks) {
    const response = await json(account, `/orders/${order.id}/action`, { action, storeId: order.store_id, supplierId: order.supplier_id, role: 'admin' }, 404);
    blocked.push({ account, targetOrder: order.order_no, action, httpStatus: 404, message: response.message });
    checks.push({ name: `${account} 越权 ${action} ${order.order_no} 被拒绝`, passed: true, httpStatus: 404 });
  }
  for (const [account, order] of [['supplier_a', c], ['supplier_b', a]]) {
    await json(account, `/orders/${order.id}/picking`, { productId: order.items[0].productId, picked: true }, 404);
    checks.push({ name: `${account} 越权修改备货被拒绝`, passed: true, httpStatus: 404 });
  }
  await json('', '/bootstrap', undefined, 401);
  checks.push({ name: '未登录不能获取业务数据', passed: true, httpStatus: 401 });
  const after = (await json('admin', '/bootstrap')).data;
  check('越权尝试未改变三笔演示订单的状态及操作记录', () => {
    for (const order of [a, b, c]) {
      const actual = after.orders.find(item => item.id === order.id);
      assert.equal(actual.status, 'pending'); assert.deepEqual(actual.events, order.events); assert.deepEqual(actual.items, order.items);
    }
  });
  const report = { passed: true, checkCount: checks.length, time: new Date().toISOString(),
    orders: [a, b, c].map(order => ({ id: order.id, orderNo: order.order_no, store: order.storeName, supplier: order.supplierName, amount: Number(order.total), status: order.status })),
    scope, blocked, checks
  };
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: true, checkCount: report.checkCount, orders: report.orders, scope, blocked }, null, 2));
  for (const account of Object.keys(tokens)) await json(account, '/auth/logout', {});
})().catch(error => { console.error(error); process.exitCode = 1; });
