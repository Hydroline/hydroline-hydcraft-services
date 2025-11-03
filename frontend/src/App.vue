<script setup lang="ts">
const appTooltipConfig = {
  delayDuration: 150,
}
</script>

<template>
  <UApp :tooltip="appTooltipConfig">
    <RouterView />
  </UApp>
</template>
