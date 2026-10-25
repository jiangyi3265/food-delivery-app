> 历史记录：其中 tests/artifacts 路径为原机器证据，不随本次源码公开上传。最新状态以 [TEST_STATUS.md](TEST_STATUS.md) 为准。

# 食材配送三端完整回归验收

验收日期：2026-10-24。本轮已完成已实现功能的完整回归、问题修复与复测。本地 H5 三端业务闭环通过，微信小程序通过编译，尚未进行微信真机验收。

本轮写入测试使用独立数据库 `food_delivery41_regression_20261024`（8087 / 54143），原演示库 `food_delivery41` 的订单和配送绑定保留。修复已重新打包并同步到主后端 8086、三端页面 54141 和若依入口 54142。

## 最新完整回归结果

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 基础业务接口与订单闭环 | 72 项通过 | `tests/artifacts/api-result.json` |
| 权限、组织/账号管理、并发与上传 | 45 项通过 | `tests/artifacts/security-crud-result.json` |
| 补充完整回归：非法输入、价格快照、改绑、隔离、状态、导出 | 48 项通过 | `tests/artifacts/full-regression/api.json` |
| 真实前端设置函数与后端联调、金额和单位计算 | 11 项通过 | `tests/artifacts/full-regression/session.json` |
| 主演示库重启后的改绑复核 | 22 项通过 | `tests/artifacts/rebinding-demo/final.json` |
| 重启后界面复验：切单、前进后退、日期筛选、报表、三端与若依入口 | 14 项通过 | `tests/artifacts/full-regression/ui-final.json` |
| 34 个页面场景，桌面及 390px 手机布局 | 68 项通过，无横向溢出 | `tests/artifacts/full-regression/page-sweep-final.json` |
| 最终测试库三端巡检日志 | 错误 0、警告 0 | `tests/artifacts/full-regression/browser-logs-final.json` |
| 后端、H5、微信小程序、若依管理入口构建 | 全部通过 | `tests/artifacts/full-regression/build-*.log` |

接口及前端处理函数检查共 198 项（72 + 45 + 48 + 11 + 22）。界面复验和布局检查另计；这些检查不代表穷尽所有输入或生产环境。

密码测试调用实际 Vue 组件的保存函数，并连接测试后端，模拟 uni 传输、存储和跳转；没有在浏览器中输入新密码。服务停机期间，原供应商标签记录过连接和动态模块加载失败，重启并刷新后正常；原始日志见 `main-browser-logs.json`，最终巡检日志另存。

## 本轮实际操作与修复

三个浏览器页面实际完成：门店选品、购物车 → 修改收货资料、配送日期时段、备注 → 下单 → 自动分单 → 供应商接单 → 异常上报及平台处理 → 逐项备货 → 备货完成 → 配送 → 送达 → 门店收货 → 平台部分结算及剩余结算 → 门店账单同步。

界面闭环订单 `SC20261024DE53959E`（测试库 ID 23，A 食堂 → 绿源）包含 20 斤土豆、10 斤西红柿、10 斤上海青，金额 127.00 元，最终已完成。加上测试库原有 254.00 元待结算，分两次登记 50.00 元和 331.00 元，合计 381.00 元，余额清零。仅登记测试业务记录，没有实际配送或资金划转。

同时实际操作了再次下单与取消、商品新增/上下架、真实图片上传与图库、门店/供应商编辑与启停、配送绑定、反馈提交/处理、账号资料编辑/停用、组织停用后的会话清除及多条件筛选。实际下载的 Excel 已解析核对，只包含命中筛选的订单，见 `tests/artifacts/full-regression/filtered-orders.xlsx`。

修复项：

1. 商品详情数量被每 4 秒自动刷新重置：仅切换商品时初始化数量，保留用户正在填写的值。
2. 小数数量减一后低于起订量：修正起订量边界和浮点尾数，并在保存期间禁用输入。
3. 前后端小数金额可能差一分钱：按每行金额四舍五入到分后汇总，两行 `2.55 × 1.5` 合计为 7.66 元。
4. 混合单位统一显示为“斤”，商品改单位后历史汇总可能混算：按单位展示数量，汇总和 Excel 按商品与单位分组。
5. 改绑后原供应商历史筛选缺少门店：仅从该账号有权查看的历史订单补充门店选项，不扩大权限。
6. 导出未完整跟随页面的状态/搜索筛选，账单导出可能包含取消订单：补齐前后端筛选并核对实际 Excel 内容。
7. 改密、管理员修改自身账号及组织停用后的会话处理：清空旧数据和失效会话，返回正确角色的登录页。
8. 连续切页时参数可能被旧页面显示回调覆盖：统一由页面加载及同路径路由更新处理，切单时重置表单，复测前进后退和无权订单。

初次失败记录为 `tests/artifacts/full-regression/api-before-fixes.json`，修复后结果为 `api.json`。手机截图位于 `tests/artifacts/full-regression/screens/mobile-final-*.png`。

主库重启后再次验证 A 食堂绑定丰禾，旧订单 11 归绿源、新订单 14 归丰禾，原有 6 笔 A 食堂历史订单归属未变。供应商订单/导出隔离、门店隔离、伪造身份参数及越权写入均通过。

测试后端在 8087 运行时，可执行以下脚本；会创建新测试数据，须使用独立测试库：

```powershell
node tests/api-integration.cjs
node tests/security-and-crud.cjs
node tests/full-regression-api.cjs
node --experimental-vm-modules tests/session-flow.cjs
```

`node tests/rebinding-demo.cjs final` 用于复核目前主库的特定改绑演示状态。

## 前期验收记录（本轮之前）

以下为此前在 `food_delivery41_test` 库进行的验收记录，保留作历史参考，不与本轮统计累加。

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| 业务接口及订单流程 | 72 项检查通过 | `tests/artifacts/api-result.json` |
| 权限、组织与账号管理、并发、上传 | 45 项检查通过 | `tests/artifacts/security-crud-result.json` |
| 三端浏览器闭环与 23 个页面 | 55 项检查通过，运行错误 0 | `tests/artifacts/browser-result.json` |
| 管理表单、绑定及报表下载 | 7 项检查通过 | `tests/artifacts/admin-forms-result.json` |
| 若依入口、登录及页面权限 | 5 项检查通过 | `tests/artifacts/entry-result.json` |
| Spring Boot 后端打包 | 通过 | `RuoYi-Vue/ruoyi-admin/target/ruoyi-admin.jar` |
| H5 构建 | 通过 | `食材配送41/dist/build/h5` |
| 微信小程序编译 | 通过 | `食材配送41/dist/build/mp-weixin` |
| 若依管理入口构建 | 通过 | `RuoYi-Vue3/dist` |

接口检查合计 117 项，浏览器检查合计 67 项。自动化脚本位于 `tests/`，页面截图保存在 `tests/artifacts/`。

## 演示后的补充复核

2026-10-24 在本地演示库复核：A 食堂已由绿源改绑丰禾，新订单 14 归丰禾，改绑前 6 笔 A 食堂订单仍归绿源。`node tests/rebinding-demo.cjs final` 的 22 项检查再次通过，包含三家门店范围、供应商订单与导出隔离，以及越权接单和修改备货被拒绝。结果：`tests/artifacts/rebinding-demo/final.json`。

复核发现并修复了 H5 只更改地址查询参数时，页面仍显示上一订单的问题。页面现在同步路由参数，并在订单切换时重置表单；所有页面由同一模板生成。真实浏览器完成 10 项检查，覆盖有权/无权订单往返切换、门店隔离、浏览器前进后退、异常备注不串单和正常详情返回。未提交业务变更，浏览器错误及警告记录为空。结果：`tests/artifacts/route-regression/result.json`。修复后 H5 和微信小程序构建均通过。

## 实际完成的业务闭环

门店登录 → 选择食材、修改数量 → 提交订单 → 服务端按门店绑定自动分配供应商 → 供应商接单 → 逐项备货 → 发起配送 → 确认送达 → 门店收货 → 平台登记线下收款 → 门店账单同步。

同时验证了供应商数据隔离、价格快照、重复提交、并发收款、超额收款拒绝、异常处理、绑定变更只影响新订单、账号停用与旧会话失效等规则。

## 本地体验

- 三端入口：<http://127.0.0.1:54141/>
- 若依平台入口：<http://127.0.0.1:54142/food>
- 账号：`store_a`（门店）、`supplier_a`（供应商）、`admin`（平台）。初始密码均为 本地 FOOD_SEED_PASSWORD 配置值。
- 重启：在项目根目录运行 `./scripts/start-all.ps1`。

完整页面清单、业务边界、环境变量和部署方式见 [README.md](README.md)。

## 验证边界

微信开发者工具已完成部分实际流程，最新进度以 TEST_STATUS.md 为准；真机和正式服务器仍待验收。当前业务采用固定门店供应商关系、平台统一销售价、线下结算登记。配送支持地址复制与拨号，本轮未实际拨出电话。未接入实时定位，也未包含线上支付、采购价毛利和供应商采购款结算；这些不计入已通过流程。
