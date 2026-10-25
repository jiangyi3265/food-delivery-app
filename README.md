# 食材配送应用 · food-delivery-app

以一套 uni-app 代码提供门店订货、供应商履约和平台管理三种业务角色，支持 H5 与微信小程序构建。

## 项目简介

门店可选择食材、维护购物车、预约配送、下单、收货及查看账单；供应商仅处理分配给自己的订单，逐项备货、配送、确认送达并查看历史汇总；平台管理商品统一定价、门店供应商资料、配送绑定、订单异常、反馈及线下结算。所有业务通过 food-delivery-backend 同步，food-delivery-admin 嵌入这里的平台页面。

实现 23 个设计页面及登录、资料编辑、账号设置等配套页面。页面每 4 秒同步数据，写操作完成后刷新；供应商改绑只作用于新订单，历史归属由服务端保存。

## 技术栈

uni-app（@dcloudio 3.0.0-5030320261023001）、Vue 3.4、JavaScript、Vite 5.2、Sass；输出 H5 和微信小程序。Node.js 24 LTS 用于本地构建；Playwright 与 Node assert 用于测试，adm-zip 核对 Excel 导出。

## 关联仓库

| 项目 | 说明 | GitHub |
| --- | --- | --- |
| food-delivery-backend | 后端 API 与业务数据 | [food-delivery-backend](https://github.com/jiangyi3265/food-delivery-backend) |
| food-delivery-admin | 平台 Web 管理入口 | [food-delivery-admin](https://github.com/jiangyi3265/food-delivery-admin) |
| food-delivery-app | 门店、供应商及平台业务应用 | [food-delivery-app](https://github.com/jiangyi3265/food-delivery-app) |

## 快速启动

先按后端 README 配置 MySQL / Redis 并启动 8086 服务，再运行：

```bash
npm ci
npm run dev:h5
```

打开 http://127.0.0.1:54141/ ，登录页可切换门店、供应商、平台角色。账号分别预填 store_a、supplier_a、admin，密码须填写后端本地 FOOD_SEED_PASSWORD 所配置的值；仓库不包含密码。其他测试账号为 store_b、store_c 和 supplier_b。

H5 开发由 Vite 把 /food 和 /profile 代理到 8086；可设置 FOOD_BACKEND 为其他后端地址。.env.example 中的 VITE_FOOD_API 用于显式配置 API，H5 本地代理模式应留空。

```bash
npm run build:h5
npm run build:mp-weixin
```

产物分别为 dist/build/h5 与 dist/build/mp-weixin。微信开发者工具导入后者；使用自己的 AppID 或开发者工具测试号。真机需在 manifest.json 设置真实 mp-weixin.appid，并在不提交的 .env.production.local 中配置 VITE_FOOD_API=https://你的后端域名，配置合法请求、上传及下载域名。127.0.0.1 仅用于本机模拟器。食材照片由后端提供。

## 项目结构

- pages/：原生页面路由与生命周期处理。
- components/StoreScreens.vue：门店商品、订单、账单和资料页面。
- components/SupplierScreens.vue：供应商接单、备货、配送和历史汇总。
- components/AdminScreens.vue：平台管理表单及报表。
- lib/food.js：API、登录态、状态同步、导出和金额计算。
- styles/、static/：统一样式和图标资源。
- scripts/uni.cjs、scripts/prepare.cjs：构建入口及统一路由生成；create-icons.cjs：图标生成。
- tests/：接口、权限、CRUD、前端处理函数和浏览器集成测试。
- docs/PRODUCT.md、docs/DESIGN.md：实际需求及设计约定。

## 测试

测试会新增测试数据。先在后端独立终端设置 FOOD_DB_NAME=food_delivery41_test、FOOD_PORT=8087 并启动；初始化密码自行配置。应用测试终端：

```powershell
$env:FOOD_TEST_PASSWORD='填写测试库实际密码'
npm run test:api
# H5 测试服务器（保持运行）
$env:FOOD_BACKEND='http://127.0.0.1:8087'
node scripts/uni.cjs --host 127.0.0.1 --port 54143
```

另一个设置了相同 FOOD_TEST_PASSWORD 的终端可执行：

```bash
npx playwright install chromium
node tests/browser-integration.cjs
node tests/admin-forms.cjs
```

结果生成至被忽略的 tests/artifacts/。api-integration、security-and-crud、full-regression-api 和 session-flow 可使用 TEST_API 指定 API 地址（包含 /food）。app-entry-smoke 使用 54141 / 54142；isolation-demo 和 rebinding-demo 依赖特定演示库状态，不属于新环境通用首次测试。最新已测/待测事项见 [测试交接状态](docs/TEST_STATUS.md)，不要将编译通过等同于微信真机验收。

## 两台电脑协作

三个仓库分别 clone 到同一个父目录；用同一 GitHub 账号即可访问公开仓库。各电脑单独配置后端本地凭据和测试库，Git 不同步数据库或本地环境文件。开始工作前各仓库执行 git pull --ff-only，改动后在所属仓库提交并 push；避免两台电脑同时修改同一文件。

Windows / PowerShell 7 下，完成后端本地配置后，可在本仓库运行 `pwsh -File scripts/start-workspace.ps1`，后台启动三个服务。首次运行会安装前端依赖并构建后端；查看 `.logs/` 确认启动结果。脚本支持仓库标准名称，也兼容原目录名称。

## 简历描述示例

基于 uni-app 和 Vue 3 开发食材配送多角色应用，实现门店订货、供应商备货配送及平台管理页面；对接统一 API 完成订单状态同步、账单展示和跨端权限交互。
