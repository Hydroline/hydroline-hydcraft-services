<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/shared/ui'

const uiStore = useUiStore()
const { isLoading } = storeToRefs(uiStore)
</script>

<template>
  <transition name="loading-bar">
    <div v-if="isLoading" class="loading-bar" />
  </transition>
</template>

<style scoped>
.loading-bar {
  position: fixed;
  top: 0;
  left: 0;
  height: 3px;
  width: 100%;
  z-index: 1000;
  overflow: hidden;
  background: linear-gradient(
    90deg,
    rgba(var(--ui-color-primary-500-rgb), 0) 0%,
    rgba(var(--ui-color-primary-500-rgb), 0.4) 35%,
    rgba(var(--ui-color-primary-500-rgb), 0.9) 70%,
    rgba(var(--ui-color-primary-500-rgb), 0) 100%
  );
  animation: shimmer 1.2s ease-in-out infinite;
  backdrop-filter: blur(4px);
}

@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  50% {
    transform: translateX(0%);
  }
  100% {
    transform: translateX(100%);
  }
}

.loading-bar-enter-active,
.loading-bar-leave-active {
  transition: opacity 250ms ease;
}

.loading-bar-enter-from,
.loading-bar-leave-to {
  opacity: 0;
}
</style>
