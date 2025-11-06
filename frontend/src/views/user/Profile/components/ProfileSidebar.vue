<script setup lang="ts">
type Item = { id: string; label: string; caption?: string }
const props = defineProps<{
  items: Item[]
  activeId: string
  // 当为 true 时，点击菜单将不会直接切换，而是触发 blocked 事件
  editing?: boolean
}>()
const emit = defineEmits<{
  (e: 'update:activeId', id: string): void
  (e: 'blocked', targetId: string): void
}>()

function handleClick(id: string) {
  if (id === props.activeId) {
    return
  }
  if (props.editing) {
    emit('blocked', id)
    return
  }
  emit('update:activeId', id)
}
</script>

<template>
  <aside class="shrink-0 rounded-2xl p-4 xl:w-55">
    <nav class="flex flex-row gap-2 overflow-x-auto xl:flex-col xl:sticky xl:top-24">
      <button
        v-for="item in props.items"
        :key="item.id"
        type="button"
        class="group whitespace-nowrap flex justify-center items-center rounded-2xl px-4 py-3 text-left text-sm transition w-30 xl:w-auto xl:justify-start"
        :class="[
          props.activeId === item.id
            ? 'bg-primary-100/80 text-primary-700 dark:bg-primary-500/15 dark:text-primary-200'
            : 'text-slate-600 hover:bg-slate-100/70 dark:text-slate-300 dark:hover:bg-slate-800/60',
        ]"
        @click="handleClick(item.id)"
      >
        <div class="font-semibold">
          {{ item.label }}
        </div>
        <p
          v-if="item.caption"
          class="mt-1 text-xs text-slate-500 dark:text-slate-400"
        >
          {{ item.caption }}
        </p>
      </button>
    </nav>
  </aside>
</template>
