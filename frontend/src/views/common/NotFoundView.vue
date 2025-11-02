<template>
  <div
    class="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center"
  >
    <UIcon
      name="i-lucide-frown"
      class="text-5xl text-slate-500 dark:text-slate-400"
    />
    <div class="space-y-2">
      <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
        页面未找到
      </h1>
      <p class="text-sm text-slate-600 dark:text-slate-300">
        您访问的内容暂不可用，返回首页继续探索。
      </p>
    </div>
    <UButton to="/" color="primary">返回首页</UButton>
  </div>
</template>
