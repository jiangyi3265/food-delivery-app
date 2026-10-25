<template><view class="food-photo" :class="variant"><image v-if="external" :src="external" mode="aspectFill" class="photo-real"/><image v-else :src="atlas" class="photo-atlas" :style="style" mode="scaleToFill"/></view></template>
<script setup>
import { computed } from 'vue'; import { API } from '../lib/food'
const props=defineProps({image:{default:'0'},variant:{default:''}})
const atlas=API+'/food/assets/food-atlas.png'
const external=computed(()=>String(props.image).startsWith('/profile/')?API+props.image:'')
const style=computed(()=>{const n=Number(props.image)||0;return {left:-(n%3)*100+'%',top:-Math.floor(n/3)*100+'%'}})
</script>
<style>.food-photo{position:relative;width:72px;height:72px;border-radius:12px;background-color:#fafbf8;flex-shrink:0;overflow:hidden}.photo-real{width:100%;height:100%;display:block}.photo-atlas{position:absolute;width:300%;height:200%;max-width:none}</style>
