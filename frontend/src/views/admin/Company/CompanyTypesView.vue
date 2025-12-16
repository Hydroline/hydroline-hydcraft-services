<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useAdminCompanyTypesStore } from '@/stores/admin/companyTypes'
import type { CompanyType } from '@/types/company'

const store = useAdminCompanyTypesStore()
const toast = useToast()
const dialogOpen = ref(false)

const categoryOptions = [
  { label: '企业', value: 'ENTERPRISE' },
  { label: '个体工商户', value: 'INDIVIDUAL' },
  { label: '组织机构', value: 'ORGANIZATION' },
] as const

const formState = reactive({
  id: '',
  name: '',
  code: '',
  description: '',
  category: '',
  requiredDocumentsText: '',
  configJson: '',
})

const isEditing = computed(() => Boolean(formState.id))
const dialogTitle = computed(() =>
  isEditing.value ? '编辑公司类型' : '新增公司类型',
)

const resetForm = () => {
  formState.id = ''
  formState.name = ''
  formState.code = ''
  formState.description = ''
  formState.category = ''
  formState.requiredDocumentsText = ''
  formState.configJson = ''
}

const openDialog = (type?: CompanyType) => {
  if (type) {
    formState.id = type.id
    formState.name = type.name
    formState.code = type.code
    formState.description = type.description ?? ''
    formState.category = type.category ?? ''
    formState.requiredDocumentsText = (type.requiredDocuments ?? []).join('\n')
    formState.configJson = type.config
      ? JSON.stringify(type.config, null, 2)
      : ''
  } else {
    resetForm()
  }
  dialogOpen.value = true
}

const handleSubmit = async () => {
  const name = formState.name.trim()
  if (!name) {
    toast.add({ title: '请输入类型名称', color: 'warning' })
    return
  }

  const documents = formState.requiredDocumentsText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  let parsedConfig: Record<string, unknown> | undefined
  const trimmedConfig = formState.configJson.trim()
  if (trimmedConfig) {
    try {
      parsedConfig = JSON.parse(trimmedConfig)
    } catch (error) {
      toast.add({ title: 'JSON 格式错误', color: 'warning' })
      return
    }
  }

  try {
    await store.upsert({
      id: formState.id || undefined,
      name,
      code: formState.code.trim() || undefined,
      description: formState.description.trim() || undefined,
      category: formState.category || undefined,
      requiredDocuments: documents.length > 0 ? documents : undefined,
      config: parsedConfig,
    })
    toast.add({
      title: `类型 ${isEditing.value ? '更新' : '创建'}成功`,
      color: 'primary',
    })
    dialogOpen.value = false
    resetForm()
  } catch (error) {
    toast.add({ title: (error as Error).message || '保存失败', color: 'error' })
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
          公司类型
        </h1>

        <div class="flex flex-wrap items-center gap-3">
          <UButton color="primary" @click="openDialog()">新建类型</UButton>
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
              <th class="px-4 py-3">名称 / 材料</th>
              <th class="px-4 py-3">编码</th>
              <th class="px-4 py-3">分类</th>
              <th class="px-4 py-3">说明</th>
              <th class="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">
            <tr
              v-for="type in store.items"
              :key="type.id"
              class="transition hover:bg-slate-50/80 dark:hover:bg-slate-900/60"
            >
              <td class="px-4 py-3">
                <p class="font-medium text-slate-900 dark:text-white">
                  {{ type.name }}
                </p>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  {{ (type.requiredDocuments ?? []).join(' / ') || '暂无材料' }}
                </p>
              </td>
              <td class="px-4 py-3 text-slate-500">{{ type.code || '—' }}</td>
              <td class="px-4 py-3 text-slate-500">
                {{
                  categoryOptions.find(
                    (option) => option.value === type.category,
                  )?.label || '—'
                }}
              </td>
              <td class="px-4 py-3 text-slate-500">
                {{ type.description || '暂无说明' }}
              </td>
              <td class="px-4 py-3 text-right">
                <UButton
                  size="xs"
                  color="primary"
                  variant="ghost"
                  @click="openDialog(type)"
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
                暂无类型定义
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
            <div class="grid grid-cols-[140px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500"
                >类型名称</label
              >
              <UInput
                v-model="formState.name"
                placeholder="例如：有限责任公司"
              />
            </div>
            <div class="grid grid-cols-[140px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500">编码</label>
              <UInput v-model="formState.code" placeholder="可选" />
            </div>
            <div class="grid grid-cols-[140px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500">分类</label>
              <USelectMenu
                v-model="formState.category"
                :options="categoryOptions"
                clearable
                placeholder="选择分类"
              />
            </div>
            <div class="grid grid-cols-[140px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500">说明</label>
              <UTextarea
                v-model="formState.description"
                rows="3"
                placeholder="填写适用场景、默认制度等"
              />
            </div>
            <div class="grid grid-cols-[140px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500"
                >所需材料</label
              >
              <UTextarea
                v-model="formState.requiredDocumentsText"
                rows="3"
                placeholder="每行一条材料"
              />
            </div>
            <div class="grid grid-cols-[140px_minmax(0,1fr)] items-start gap-3">
              <label class="text-xs font-semibold text-slate-500"
                >额外配置</label
              >
              <UTextarea
                v-model="formState.configJson"
                rows="4"
                placeholder='JSON 格式，例如：{"minCapital": 100000}'
              />
            </div>
            <div class="flex justify-end gap-3">
              <UButton
                type="button"
                variant="ghost"
                color="neutral"
                @click="dialogOpen = false"
              >
                取消
              </UButton>
              <UButton type="submit" color="primary" :loading="store.saving">
                {{ isEditing ? '更新类型' : '保存类型' }}
              </UButton>
            </div>
          </form>
        </div>
      </template>
    </UModal>
  </section>
</template>
