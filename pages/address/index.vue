<template><FoodApp v-if="ready" :key="pageKey" :screen="screen" :item-id="itemId" :initial-role="initialRole" :filter="filter" :data-screen="screen" :data-order-id="itemId" /></template>
<script setup>
import {ref,computed} from 'vue';import {onLoad,onShow,onPullDownRefresh} from '@dcloudio/uni-app';import FoodApp from '../../components/FoodApp.vue';import {state,restore,refresh,home} from '../../lib/food'
// #ifdef H5
import {onBeforeRouteUpdate} from 'vue-router'
// #endif
const screen=ref('home'),itemId=ref(''),initialRole=ref('store'),filter=ref(''),ready=ref(false)
const pageKey=computed(()=>JSON.stringify([screen.value,itemId.value,initialRole.value,filter.value]))
function applyQuery(q){initialRole.value=q.role||'store';if(!state.user||state.user.role!==initialRole.value){state.token='';state.user=null;restore(initialRole.value)}screen.value=q.screen||'address';itemId.value=q.id||'';filter.value=q.filter||'';ready.value=true}
onLoad(q=>{applyQuery(q);refresh()})
// #ifdef H5
// H5 reuses the page for query-only navigation, so onLoad alone leaves stale order IDs.
onBeforeRouteUpdate((to,from)=>{if(to.path===from.path){applyQuery(to.query);refresh(true)}})
// #endif
onShow(()=>{
  if(!ready.value)return
  refresh(true)
})
onPullDownRefresh(async()=>{await refresh();uni.stopPullDownRefresh()})
</script>
