<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/vue'
import {
  AccordionContent,
  AccordionItem,
  AccordionRoot,
  AccordionTrigger,
} from 'reka-ui'
import { useHead } from '@unhead/vue'

import { useCounterStore } from '@/stores/counter'

const counterStore = useCounterStore()
const { count, double } = storeToRefs(counterStore)

const accordionItems = [
  {
    value: 'pinia',
    title: 'Pinia 状态',
    description:
      '集中式 store，支持组合式 API。你可以轻松在组件间复用并追踪 state。',
  },
  {
    value: 'headless',
    title: 'Headless UI 可组合',
    description:
      '纯逻辑组件提供无样式交互，你可以结合 Tailwind 或任意样式系统自定义外观。',
  },
  {
    value: 'reka',
    title: 'Reka UI 原子组件',
    description:
      'Radix 风格的 primitives，兼具无障碍与组合灵活性，适合搭建复杂交互。',
  },
]

useHead({
  title: 'Hydroline',
})

function increment() {
  counterStore.increment()
}
</script>

<template>
  <main class="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-12">
    <section
      class="grid gap-6 rounded-2xl border border-slate-200/60 bg-white/80 p-8 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/70"
    >
      <header class="flex flex-col gap-3 text-center">
        <p
          class="mx-auto w-fit rounded-full border border-primary-200/60 bg-primary-50 px-3 py-1 text-sm font-medium text-primary-600 dark:border-primary-500/40 dark:bg-primary-500/10 dark:text-primary-300"
        >
          UI Stack Ready
        </p>
        <h1
          class="text-3xl font-bold tracking-tight text-slate-900 dark:text-white"
        >
          Vue 3 UI 组件库联调基座
        </h1>
        <p class="text-base text-slate-600 dark:text-slate-300">
          Pinia、Vue Router、Nuxt UI、Headless UI 与 Reka UI
          已经接好，你可以直接基于此页面扩展业务界面。
        </p>
      </header>

      <div class="grid gap-6 md:grid-cols-2">
        <UCard class="bg-white/70 dark:bg-slate-900/60">
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold text-slate-900 dark:text-white">
                Pinia Store 示例
              </h2>
              <UBadge color="primary" variant="soft">Pinia</UBadge>
            </div>
          </template>
          <p class="mb-4 text-sm text-slate-600 dark:text-slate-300">
            通过 Pinia 提供跨组件状态管理，结合 Nuxt UI 控件实现一致的视觉反馈。
          </p>
          <div class="flex flex-col items-start gap-3">
            <span class="text-4xl font-bold text-slate-900 dark:text-white">
              {{ count }}
              <small
                class="ml-2 text-base font-medium text-slate-500 dark:text-slate-300"
              >
                ×2 = {{ double }}
              </small>
            </span>
            <div class="flex flex-wrap gap-3">
              <UButton color="primary" @click="increment">增加计数</UButton>
              <UButton
                color="neutral"
                variant="outline"
                @click="counterStore.reset()"
              >
                重置
              </UButton>
            </div>
          </div>
        </UCard>

        <UCard class="bg-white/70 dark:bg-slate-900/60">
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold text-slate-900 dark:text-white">
                Headless UI Disclosure
              </h2>
              <UBadge color="primary" variant="soft">Headless UI</UBadge>
            </div>
          </template>

          <Disclosure v-slot="{ open }">
            <DisclosureButton
              class="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left font-medium shadow-sm transition hover:border-primary-200 hover:bg-primary-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-primary-500 dark:hover:bg-primary-500/10"
            >
              <span>点击展开查看 Nuxt UI 能力</span>
              <UIcon
                :name="
                  open
                    ? 'i-heroicons-chevron-up-20-solid'
                    : 'i-heroicons-chevron-down-20-solid'
                "
                class="text-slate-500"
              />
            </DisclosureButton>
            <DisclosurePanel
              class="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
            >
              <p>
                Headless UI 提供纯逻辑层，Nuxt UI
                负责视觉呈现。你可以在此基础上自由组合 Tailwind
                原子类与组件库进行设计落地。
              </p>
              <div class="mt-4 flex flex-wrap gap-2">
                <UBadge color="primary" variant="solid">Nuxt UI</UBadge>
                <UBadge color="neutral" variant="soft">Tailwind CSS</UBadge>
                <UBadge color="secondary" variant="outline"
                  >Headless Patterns</UBadge
                >
              </div>
            </DisclosurePanel>
          </Disclosure>
        </UCard>
      </div>
    </section>

    <section
      class="grid gap-6 rounded-2xl border border-slate-200/60 bg-white/80 p-8 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/70"
    >
      <header class="flex items-center justify-between">
        <h2 class="text-xl font-semibold text-slate-900 dark:text-white">
          Reka UI Accordion
        </h2>
        <UBadge color="primary" variant="soft">Reka UI</UBadge>
      </header>

      <AccordionRoot
        type="single"
        collapsible
        default-value="pinia"
        class="space-y-3"
      >
        <AccordionItem
          v-for="item in accordionItems"
          :key="item.value"
          :value="item.value"
          class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-primary-200 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-primary-500"
        >
          <AccordionTrigger
            class="flex w-full items-center justify-between px-4 py-3 text-left text-base font-medium"
          >
            {{ item.title }}
            <UIcon
              name="i-heroicons-chevron-right-20-solid"
              class="transition-transform data-[state=open]:rotate-90"
            />
          </AccordionTrigger>
          <AccordionContent
            class="border-t border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
          >
            {{ item.description }}
          </AccordionContent>
        </AccordionItem>
      </AccordionRoot>
    </section>
  </main>
</template>
