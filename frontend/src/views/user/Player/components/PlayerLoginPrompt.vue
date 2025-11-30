<script setup lang="ts">
const props = defineProps<{
  canViewProfile: boolean
}>()
</script>

<template>
  <div
    v-if="!props.canViewProfile"
    class="mt-8 bg-white/80 text-sm text-slate-600 dark:bg-slate-900/70 dark:text-slate-300"
  ></div>
</template>
