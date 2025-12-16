<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useAdminCompanyIndustriesStore } from '@/stores/admin/companyIndustries'
import type { CompanyIndustry } from '@/types/company'

const store = useAdminCompanyIndustriesStore()
const toast = useToast()
const dialogOpen = ref(false)

const formState = reactive({
  id: '',
  name: '',
  code: '',
  description: '',
  icon: '',
  color: '',
  parentId: '',
})

const parentOptions = computed(() =>
  store.items.map((item) => ({
    label: item.name,
    value: item.id,
  })),
)

const parentMap = computed(() =>
  store.items.reduce<Record<string, string>>((acc, industry) => {
    acc[industry.id] = industry.name
    return acc
  }, {}),
)

const isEditing = computed(() => Boolean(formState.id))
const dialogTitle = computed(() =>
  isEditing.value ? '编辑行业配置' : '新增行业配置',
)

const resetForm = () => {
  formState.id = ''
  formState.name = ''
  formState.code = ''
  formState.description = ''
  formState.icon = ''
  formState.color = ''
  formState.parentId = ''
}

const openDialog = (industry?: CompanyIndustry) => {
  if (industry) {
    formState.id = industry.id
    formState.name = industry.name
    formState.code = industry.code
    formState.description = industry.description ?? ''
    formState.icon = industry.icon ?? ''
    formState.color = industry.color ?? ''
    formState.parentId = industry.parentId ?? ''
  } else {
    resetForm()
  }
  dialogOpen.value = true
}

const handleSubmit = async () => {
  const name = formState.name.trim()
  if (!name) {
    toast.add({ title: '请输入行业名称', color: 'warning' })
    return
  }

  try {
    await store.upsert({
      id: formState.id || undefined,
      name,
      code: formState.code.trim() || undefined,
      description: formState.description.trim() || undefined,
      icon: formState.icon.trim() || undefined,
      color: formState.color.trim() || undefined,
      parentId: formState.parentId || undefined,
    })
    toast.add({
      title: `行业 ${isEditing.value ? '更新' : '创建'}成功`,
      color: 'primary',
    })
    dialogOpen.value = false
    resetForm()
  } catch (error) {
    toast.add({ title: (error as Error).message || '提交失败', color: 'error' })
  }
}

onMounted(() => {
  void store.fetchAll()
})
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="w-full flex flex-wrap justify-between items-center">
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
          行业配置
        </h1>

        <div class="flex flex-wrap items-center gap-3">
          <UButton color="primary" @click="openDialog()">新建行业</UButton>
        </div>
      </div>
    </div>

    <div
      class="overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 dark:border-slate-800/60 dark:bg-slate-900/70"
    >
      <div class="overflow-x-auto">
        <table
          class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800"
        >
          <thead class="bg-slate-50/60 dark:bg-slate-900/60">
            <tr
              class="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              <th class="px-4 py-3">名称 / 说明</th>
              <th class="px-4 py-3">编码</th>
              <th class="px-4 py-3">父级</th>
              <th class="px-4 py-3">主题色</th>
              <th class="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">
            <tr
              v-for="industry in store.items"
              :key="industry.id"
              class="transition hover:bg-slate-50/80 dark:hover:bg-slate-900/60"
            >
              <td class="px-4 py-3">
                <p class="font-medium text-slate-900 dark:text-white">
                  {{ industry.name }}
                </p>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  {{ industry.description || '暂无说明' }}
                </p>
              </td>
              <td class="px-4 py-3 text-slate-500">
                {{ industry.code || '—' }}
              </td>
              <td class="px-4 py-3 text-slate-500">
                {{
                  industry.parentId
                    ? (parentMap[industry.parentId] ?? '未知父级')
                    : '—'
                }}
              </td>
              <td class="px-4 py-3 text-slate-500">
                <div class="flex items-center gap-2">
                  <span
                    v-if="industry.color"
                    class="h-3 w-3 rounded-full border border-slate-200"
                    :style="{ background: industry.color }"
                  />
                  <span>{{ industry.color || '—' }}</span>
                </div>
              </td>
              <td class="px-4 py-3 text-right">
                <UButton
                  size="xs"
                  color="primary"
                  variant="ghost"
                  @click="openDialog(industry)"
                >
                  编辑
                </UButton>
              </td>
            </tr>
            <tr v-if="store.items.length === 0">
              <td
                colspan="5"
                class="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
              >
                暂无行业配置
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UModal
      v-model:open="dialogOpen"
      :ui="{ content: 'w-full max-w-xl max-h-[calc(100vh-2rem)]' }"
    >
      <template #content>
        <div class="space-y-4 p-6">
          <div class="flex items-center justify-between gap-6 pb-3">
            <div class="space-y-1">
              <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
                {{ dialogTitle }}
              </h3>
            </div>
            <UButton
              type="button"
              variant="ghost"
              color="neutral"
              icon="i-lucide-x"
              size="xs"
              @click="dialogOpen = false"
            />
          </div>
          <form class="space-y-4" @submit.prevent="handleSubmit">
            <div class="grid grid-cols-[130px_minmax(0,1fr)] items-start gap-4">
              <label class="text-xs font-semibold text-slate-500">名称</label>
              <UInput v-model="formState.name" placeholder="例如：科技产业" />
            </div>
            <div class="grid grid-cols-[130px_minmax(0,1fr)] items-start gap-4">
              <label class="text-xs font-semibold text-slate-500">编码</label>
              <UInput v-model="formState.code" placeholder="可为空自动生成" />
            </div>
            <div class="grid grid-cols-[130px_minmax(0,1fr)] items-start gap-4">
              <label class="text-xs font-semibold text-slate-500"
                >父级行业</label
              >
              <USelectMenu
                v-model="formState.parentId"
                :options="parentOptions"
                clearable
                placeholder="选择父级，可选"
              />
            </div>
            <div class="grid grid-cols-[130px_minmax(0,1fr)] items-start gap-4">
              <label class="text-xs font-semibold text-slate-500">说明</label>
              <UTextarea
                v-model="formState.description"
                rows="3"
                placeholder="可写制度、推荐规则等备注"
              />
            </div>
            <div class="grid grid-cols-[130px_minmax(0,1fr)] items-start gap-4">
              <label class="text-xs font-semibold text-slate-500"
                >图标 URL</label
              >
              <UInput v-model="formState.icon" placeholder="https://..." />
            </div>
            <div class="grid grid-cols-[130px_minmax(0,1fr)] items-start gap-4">
              <label class="text-xs font-semibold text-slate-500">主题色</label>
              <UInput v-model="formState.color" placeholder="#1D4ED8" />
            </div>
            <div class="flex justify-end gap-3 pt-2">
              <UButton
                variant="ghost"
                color="neutral"
                @click="dialogOpen = false"
              >
                取消
              </UButton>
              <UButton color="primary" :loading="store.saving">
                {{ isEditing ? '更新行业' : '保存行业' }}
              </UButton>
            </div>
          </form>
        </div>
      </template>
    </UModal>
  </section>
</template>
