import { reactive } from 'vue'

// 微信小程序在.env.production配置真实HTTPS后端地址，H5开发通过Vite代理。
let apiBase = import.meta.env.VITE_FOOD_API || ''
// #ifdef MP-WEIXIN
apiBase = import.meta.env.VITE_FOOD_API || 'http://127.0.0.1:8086'
// #endif
export const API = apiBase
export const state = reactive({ token: '', user: null, products: [], stores: [], suppliers: [], orders: [], cart: [], settlements: [], accounts: [], feedback: [], loading: false, offline: false })
function clearData(){for(const k of ['products','stores','suppliers','orders','cart','settlements','accounts','feedback'])state[k]=[]}
export const statuses = { pending: '待接单', preparing: '待备货', ready: '待配送', delivering: '配送中', delivered: '待收货', completed: '已完成', cancelled: '已取消', issue: '异常' }
export const roles = { store: '门店端', supplier: '供应商端', admin: '平台管理端' }
export const money = value => Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
// Round each line to cents before summing, matching the backend's decimal HALF_UP calculation.
export function lineAmount(price,quantity){const cents=Math.round(Number(price)*100),hundredths=Math.round(Number(quantity)*100);return (cents*Math.floor(hundredths/100)+Math.floor((cents*(hundredths%100)+50)/100))/100}
export function quantitySummary(items){const units=new Map();for(const i of items){const unit=i.unit||'斤';units.set(unit,(units.get(unit)||0)+Math.round(Number(i.quantity)*100))}return [...units].map(([unit,q])=>q/100+unit).join('、')}
export function today(offset = 0) { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
export function key() { return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}` }
export function toast(title) { uni.showToast({ title: String(title), icon: 'none', duration: 2400 }) }
export function request(path, data, method = data ? 'POST' : 'GET') {
  const requestToken=state.token
  return new Promise((resolve, reject) => uni.request({ url: API + '/food' + path, method, data, timeout: 15000, header: { 'Content-Type': 'application/json', 'X-Food-Token': 'Bearer ' + state.token }, success: r => {
    if(r.statusCode === 200 && r.data.code === 200) { state.offline = false; resolve(r.data.data) }
    else { if((r.statusCode === 401 || (r.statusCode === 403 && path === '/bootstrap')) && path !== '/auth/login' && state.token===requestToken) { if(state.user)uni.removeStorageSync('food41_'+state.user.role);state.token='';state.user=null;clearData() } reject(new Error(r.data.message || r.data.msg || '操作未成功，请稍后重试')) }
  }, fail: () => { state.offline = true; reject(new Error('网络连接失败，请检查服务后重试')) } }))
}
export async function refresh(silent = false) { if(!state.token)return;const requestedToken=state.token;if(!silent)state.loading=true;try { const d=await request('/bootstrap');if(state.token===requestedToken)Object.assign(state,d) } catch(e){ if(!silent)toast(e.message) } finally { state.loading=false } }
export function restore(role='store') { clearData();const saved=uni.getStorageSync('food41_'+role);if(saved){state.token=saved.token;state.user=saved.user} }
export async function login(username,password) { const d=await request('/auth/login',{username,password});Object.assign(state,d);uni.setStorageSync('food41_'+d.user.role,d);await refresh();return d.user }
export async function logout(role=state.user?.role||'store'){try{await request('/auth/logout',{})}catch{}uni.removeStorageSync('food41_'+role);clearData();Object.assign(state,{token:'',user:null});go('login',{role},true)}
// Historical filters use only store names already visible in this account's assigned orders.
export function responsibleStores(){const stores=new Map(state.stores.map(s=>[s.id,{id:s.id,name:s.name}]));for(const o of state.orders)if(!stores.has(o.store_id))stores.set(o.store_id,{id:o.store_id,name:o.storeName});return [...stores.values()]}
export const home = role => role==='admin'?'dashboard':role==='supplier'?'workbench':'home'
export function go(screen, params={}, replace=false) { const query=Object.entries({role:state.user?.role||'store',...params}).map(([k,v])=>`${k}=${encodeURIComponent(v)}`).join('&');uni[replace?'reLaunch':'navigateTo']({url:'/pages/'+screen+'/index?'+query,fail:()=>toast('页面打开失败，请重试')}) }
export function back() { if(getCurrentPages().length>1)uni.navigateBack();else go(home(state.user?.role),{},true) }
export async function mutate(path,data,message='已保存') { const result=await request(path,data);await refresh(true);if(message)toast(message);return result }
export async function confirm(title,content='') { return new Promise(resolve=>uni.showModal({title,content,confirmColor:'#154D3D',success:r=>resolve(r.confirm),fail:()=>resolve(false)})) }
export function call(phone){uni.makePhoneCall({phoneNumber:String(phone),fail:()=>toast('联系电话：'+phone)})}
export function navigation(address){uni.setClipboardData({data:address,success:()=>toast('收货地址已复制，可粘贴到地图导航')})}
export async function exportFile(type='orders',filters={}) {
  const query=Object.entries({type,...filters}).filter(([,v])=>v).map(([k,v])=>`${k}=${encodeURIComponent(v)}`).join('&')
  // #ifdef H5
  const response=await fetch(API+'/food/export?'+query,{headers:{'X-Food-Token':'Bearer '+state.token}})
  if(!response.ok)throw new Error('导出失败，请重新登录或稍后重试')
  const url=URL.createObjectURL(await response.blob()), a=document.createElement('a');a.href=url;a.download='食材配送-'+today()+'.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('报表已导出')
  // #endif
  // #ifndef H5
  await new Promise((resolve,reject)=>uni.downloadFile({url:API+'/food/export?'+query,header:{'X-Food-Token':'Bearer '+state.token},success:r=>{if(r.statusCode!==200)return reject(new Error('导出失败'));uni.openDocument({filePath:r.tempFilePath,fileType:'xlsx',showMenu:true,success:resolve,fail:reject})},fail:reject}))
  // #endif
}
export async function upload(){const selected=await new Promise((resolve,reject)=>uni.chooseImage({count:1,sizeType:['compressed'],success:resolve,fail:reject}));return new Promise((resolve,reject)=>uni.uploadFile({url:API+'/food/upload',filePath:selected.tempFilePaths[0],name:'file',header:{'X-Food-Token':'Bearer '+state.token},success:r=>{const d=JSON.parse(r.data);if(d.code===200)resolve(d.data.image);else reject(new Error(d.message||'上传失败'))},fail:reject}))}
setInterval(()=>{if(state.token)refresh(true)},4000)
