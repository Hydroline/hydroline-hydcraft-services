<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CompanyModel } from '@/types/company'
import {
  resolveCompaniesByIds,
  searchActiveCompanies,
} from '@/utils/company/company-lib'

const props = defineProps<{
  label: string
  companyIds: string[]
  allowEdit?: boolean
}>()

const emit = defineEmits<{
  (event: 'update', payload: string[]): void
}>()

const modalOpen = ref(false)
const searchTerm = ref('')
const searchLoading = ref(false)
const searchOptions = ref<CompanyModel[]>([])
const selectedCompanyId = ref<string | null>(null)
const companyMap = ref<Record<string, CompanyModel>>({})
let searchTimer: ReturnType<typeof setTimeout> | null = null

const allowEdit = computed(() => props.allowEdit !== false)
const orderedCompanyIds = computed(() =>
  [...props.companyIds].filter((id, index, list) => list.indexOf(id) === index),
)

watch(
  () => props.companyIds,
  async (ids) => {
    companyMap.value = await resolveCompaniesByIds(ids)
  },
  { immediate: true },
)

watch(
  () => modalOpen.value,
  (open) => {
    if (!open) return
    searchTerm.value = ''
    selectedCompanyId.value = null
    void fetchOptions('')
  },
)

watch(
  () => searchTerm.value,
  (value) => {
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      void fetchOptions(value)
    }, 300)
  },
)

async function fetchOptions(keyword: string) {
  searchLoading.value = true
  try {
    searchOptions.value = await searchActiveCompanies(keyword, 12)
  } finally {
    searchLoading.value = false
  }
}

function removeCompany(companyId: string) {
  if (!allowEdit.value) return
  const next = orderedCompanyIds.value.filter((id) => id !== companyId)
  emit('update', next)
}

function addSelectedCompany() {
  if (!selectedCompanyId.value) return
  const next = [...orderedCompanyIds.value]
  if (!next.includes(selectedCompanyId.value)) {
    next.push(selectedCompanyId.value)
  }
  emit('update', next)
  modalOpen.value = false
}

function resolveCompanyName(companyId: string) {
  return companyMap.value[companyId]?.name ?? '未知公司'
}

function resolveCompanyLogo(companyId: string) {
  return companyMap.value[companyId]?.logoUrl ?? null
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-2">
      <span class="inline-flex items-center gap-1">
        {{ label }}

        <UButton
          class="rounded-full p-0.5"
          v-if="allowEdit"
          variant="soft"
          size="xs"
          @click="modalOpen = true"
        >
          <UIcon name="i-lucide-plus" class="h-3 w-3" />
        </UButton>
      </span>
      <span class="text-slate-900 dark:text-white">
        <span v-if="orderedCompanyIds.length === 0"> 暂无绑定</span>

        <div v-else class="flex flex-wrap gap-2 text-xs">
          <div
            v-for="companyId in orderedCompanyIds"
            :key="companyId"
            class="flex items-center gap-2 text-sm"
          >
            <img
              v-if="resolveCompanyLogo(companyId)"
              :src="resolveCompanyLogo(companyId) ?? undefined"
              :alt="resolveCompanyName(companyId)"
              class="h-4 w-4 rounded-full object-cover"
            />
            <span>{{ resolveCompanyName(companyId) }}</span>
            <UButton
              v-if="allowEdit"
              variant="link"
              color="neutral"
              class="p-0.5"
              @click="removeCompany(companyId)"
            >
              <UIcon name="i-lucide-x" class="h-3 w-3" />
            </UButton>
          </div>
        </div>
      </span>
    </div>

    <UModal v-model:open="modalOpen">
      <template #content>
        <div class="p-4 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold text-slate-800">
              选择{{ label }}
            </h3>
            <UButton size="xs" variant="ghost" @click="modalOpen = false">
              关闭
            </UButton>
          </div>

          <USelectMenu
            v-model="selectedCompanyId"
            v-model:search-term="searchTerm"
            :items="searchOptions"
            :loading="searchLoading"
            searchable
            value-key="id"
            label-key="name"
            placeholder="搜索公司"
            class="w-full"
          >
            <template #option="{ item }">
              <div class="flex flex-col">
                <span class="text-sm text-slate-900">{{ item.name }}</span>
                <span class="text-xs text-slate-500">
                  {{ item.summary || '暂无简介' }}
                </span>
              </div>
            </template>
          </USelectMenu>

          <div class="flex justify-end">
            <UButton
              color="primary"
              :disabled="!selectedCompanyId"
              @click="addSelectedCompany"
            >
              添加
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
