const {testPassword,changedPassword}=require('./test-credentials.cjs');
// Execute the actual Vue settings handler against the isolated API without changing any real account.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const vue=require('../node_modules/vue');
const {parse,compileScript}=require('../node_modules/@vue/compiler-sfc');
const base=process.env.TEST_API||'http://127.0.0.1:8087/food',root=path.resolve(__dirname,'..'),checks=[];
async function api(token,route,body){const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-Food-Token':'Bearer '+(token||'')},body:JSON.stringify(body)});const d=await r.json();assert.equal(r.status,200,JSON.stringify(d));return d.data;}
(async()=>{
 const admin=await api('','/auth/login',{username:'admin',password:testPassword}),storage=new Map();let navigation,pending;
 const uni={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),showToast(){},reLaunch:o=>navigation=o.url,navigateTo:o=>navigation=o.url,
 request(o){fetch(base.replace(/\/food$/, '')+o.url,{method:o.method,headers:o.header,body:o.method==='GET'?undefined:JSON.stringify(o.data)}).then(async r=>o.success({statusCode:r.status,data:await r.json()})).catch(o.fail);}};
 const context=vm.createContext({uni,console,setInterval(){},setTimeout,clearTimeout,URL,URLSearchParams,fetch,Blob});
 const vueModule=new vm.SyntheticModule(['reactive','ref','computed','watch','inject'],function(){for(const k of ['reactive','ref','computed','watch'])this.setExport(k,vue[k]);this.setExport('inject',()=>({run:fn=>pending=fn(),busy:vue.ref(false)}));},{context});
 const foodSource=fs.readFileSync(path.join(root,'lib/food.js'),'utf8').replace(/\/\/ #ifdef MP-WEIXIN[\s\S]*?\/\/ #endif/g,'');
 const food=new vm.SourceTextModule(foodSource,{context,identifier:'food',initializeImportMeta:meta=>meta.env={}});
 const dummy=new vm.SyntheticModule(['default'],function(){this.setExport('default',{});},{context});
 const {descriptor}=parse(fs.readFileSync(path.join(root,'components/StoreScreens.vue'),'utf8'));
 const component=new vm.SourceTextModule(compileScript(descriptor,{id:'session-test'}).content,{context,identifier:'settings'});
 await food.link(()=>vueModule);await food.evaluate();await component.link(specifier=>specifier==='vue'?vueModule:specifier==='../lib/food'?food:dummy);await component.evaluate();
 assert.equal(food.namespace.lineAmount('2.55','1.50'),3.83);
 assert.equal(food.namespace.lineAmount('2.55','1.50')*2,7.66);
 assert.equal(food.namespace.lineAmount('99999999.99','99999.99'),9999998999000);
 checks.push({name:'小数金额逐行 HALF_UP 与大数两位精度计算',passed:true});
 assert.equal(food.namespace.quantitySummary([{quantity:1.5,unit:'斤'},{quantity:1.5,unit:'袋'},{quantity:0.1,unit:'斤'}]),'1.6斤、1.5袋');
 checks.push({name:'混合计价单位分组且数量不出现浮点尾数',passed:true});
 for(const role of ['store','supplier','admin']){
   const username='session_'+role+'_'+Date.now();await api(admin.token,'/accounts',{username,name:'会话回归测试',role,storeId:1,supplierId:1,password:testPassword,active:1});
   await food.namespace.login(username,testPassword);
   const scope=vue.effectScope();let settings;scope.run(()=>settings=component.namespace.default.setup({screen:'settings',itemId:'',filter:''},{expose(){}}));
   settings.password.value={oldPassword:testPassword,newPassword:changedPassword,confirm:'mismatch'};
   settings.savePassword();await assert.rejects(pending,/两次输入/);checks.push({name:role+' 密码确认不一致不提交',passed:true});
   settings.password.value.confirm=changedPassword;settings.savePassword();await pending;
   assert.equal(navigation,'/pages/login/index?role='+role);assert.equal(food.namespace.state.token,'');assert.equal(food.namespace.state.user,null);assert(!storage.has('food41_'+role));
   for(const key of ['products','stores','suppliers','orders','cart','settlements','accounts','feedback'])assert.equal(food.namespace.state[key].length,0);
   checks.push({name:role+' 修改密码后返回正确角色登录页并清空会话数据',passed:true});
   await food.namespace.login(username,changedPassword);assert.equal(food.namespace.state.user.role,role);checks.push({name:role+' 使用新密码重新登录成功',passed:true});await food.namespace.logout();scope.stop();
 }
 await api(admin.token,'/auth/logout',{});
 const report={passed:true,time:new Date().toISOString(),checkCount:checks.length,checks};fs.writeFileSync(path.join(__dirname,'artifacts/full-regression/session.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
