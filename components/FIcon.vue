<template><image :src="'/static/icons/'+name+'.svg'" class="f-icon" :class="{'icon-white':white}" :style="{width:size+'px',height:size+'px'}" /></template>
<script setup>defineProps({name:{default:'box'},size:{default:22},white:Boolean})</script>
<style scoped>.f-icon{width:22px;height:22px;display:inline-block;flex-shrink:0;vertical-align:middle}.icon-white{filter:brightness(0) invert(1)}</style>
