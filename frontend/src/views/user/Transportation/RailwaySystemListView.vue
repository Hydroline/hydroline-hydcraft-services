<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { AnimatePresence, Motion } from 'motion-v'
import { useTransportationRailwaySystemsStore } from '@/stores/transportation/railwaySystems'

const systemsStore = useTransportationRailwaySystemsStore()
const router = useRouter()

const page = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const systemsResponse = ref(
  null as null | ReturnType<typeof systemsStore.fetchSystems>,
)
const renderToken = ref(0)

const servers = ref<{ id: string; name: string; code: string }[]>([])
const selectedServer = ref<string>('')

const pageInput = ref('1')

const pagination = computed(() => {
  const data = systemsResponse.value
  return {
    total: data?.total ?? 0,
    page: data?.page ?? page.value,
    pageSize: data?.pageSize ?? pageSize.value,
    pageCount: Math.max(data?.pageCount ?? 1, 1),
  }
})

async function loadServers() {
  servers.value = await systemsStore.fetchServers()
}

async function loadSystems() {
  loading.value = true
  try {
    systemsResponse.value = await systemsStore.fetchSystems({
      page: page.value,
      pageSize: pageSize.value,
      serverId: selectedServer.value,
    })
    renderToken.value += 1
  } finally {
    loading.value = false
  }
}

function getServerName(id: string) {
  const server = servers.value.find((s) => s.id === id)
  return server ? `${server.name} (${server.code})` : id
}

function goToPage(nextPage: number) {
  const safe = Math.max(1, Math.min(nextPage, pagination.value.pageCount))
  if (safe === page.value) return
  page.value = safe
  pageInput.value = String(safe)
  void loadSystems()
}

function openSystem(systemId: string, edit = false) {
  router.push({
    name: edit
      ? 'transportation.railway.system.edit'
      : 'transportation.railway.system.detail',
    params: { systemId },
  })
}

onMounted(() => {
  void loadServers()
  void loadSystems()
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <UButton
        v-if="systemsResponse"
        size="sm"
        class="absolute left-4 top-6 md:top-10"
        variant="ghost"
        icon="i-lucide-arrow-left"
        @click="router.push({ name: 'transportation.railway' })"
      >
        返回概览
      </UButton>
      <UTooltip text="新建铁路线路系统">
        <UButton
          color="primary"
          variant="soft"
          size="xs"
          class="absolute right-4 top-6 md:top-10 p-1"
          icon="i-lucide-plus"
          @click="router.push({ name: 'transportation.railway.system.create' })"
        />
      </UTooltip>
    </div>
    <div class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
          全服铁路线路系统
        </h1>
      </div>
      <div class="w-48">
        <USelect
          class="w-full"
          v-model="selectedServer"
          :items="[
            { label: '全部服务端', value: '' },
            ...servers.map((s) => ({ label: s.name, value: s.id })),
          ]"
          placeholder="选择服务端"
          @update:model-value="
            () => {
              page = 1
              loadSystems()
            }
          "
        />
      </div>
    </div>

    <div
      class="relative rounded-xl border border-slate-200/70 bg-white dark:border-slate-800/70 dark:bg-slate-900"
    >
      <div class="overflow-x-auto">
        <table
          class="min-w-[720px] w-full text-left text-sm text-slate-600 dark:text-slate-300"
        >
          <thead
            class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          >
            <tr>
              <th class="px-4 py-3">名称</th>
              <th class="px-4 py-3">服务端</th>
              <th class="px-4 py-3">线路数</th>
              <th class="px-4 py-3">更新时间</th>
              <th class="px-4 py-3">操作</th>
            </tr>
          </thead>

          <tbody v-if="(systemsResponse?.items?.length ?? 0) === 0">
            <Motion
              as="tr"
              :initial="{ opacity: 0, filter: 'blur(10px)' }"
              :animate="{ opacity: 1, filter: 'blur(0px)' }"
              :transition="{ duration: 0.3 }"
            >
              <td
                class="px-4 py-6 text-center text-sm text-slate-500"
                colspan="5"
              >
                {{ loading ? '正在加载…' : '暂无线路系统' }}
              </td>
            </Motion>
          </tbody>

          <Motion
            v-else
            as="tbody"
            :animate="{ opacity: 1, filter: 'blur(0px)' }"
            :transition="{ duration: 0.3 }"
          >
            <AnimatePresence>
              <Motion
                v-for="item in systemsResponse?.items ?? []"
                :key="`${renderToken}::${item.id}`"
                as="tr"
                :initial="{ opacity: 0, filter: 'blur(10px)', y: 4 }"
                :animate="{ opacity: 1, filter: 'blur(0px)', y: 0 }"
                :exit="{ opacity: 0, filter: 'blur(10px)', y: -4 }"
                :transition="{ duration: 0.3 }"
                class="border-t border-slate-100 dark:border-slate-800"
              >
                <td class="px-4 py-3">
                  <div class="flex items-center gap-3">
                    <UAvatar
                      :src="item.logoUrl || undefined"
                      :alt="item.name"
                      size="sm"
                      :ui="{ rounded: 'rounded-md' }"
                      class="bg-slate-100 dark:bg-slate-800"
                    />
                    <div>
                      <div class="text-slate-900 dark:text-white">
                        {{ item.name }}
                      </div>
                      <span class="text-xs text-slate-400">{{
                        item.englishName || '—'
                      }}</span>
                    </div>
                  </div>
                </td>
                <td class="px-4 py-3">{{ getServerName(item.serverId) }}</td>
                <td class="px-4 py-3">{{ item.routeCount }}</td>
                <td class="px-4 py-3">{{ item.updatedAt }}</td>
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <UButton
                      size="2xs"
                      variant="ghost"
                      @click="openSystem(item.id, true)"
                    >
                      编辑
                    </UButton>
                    <UButton
                      size="2xs"
                      variant="ghost"
                      @click="openSystem(item.id)"
                    >
                      查看
                    </UButton>
                  </div>
                </td>
              </Motion>
            </AnimatePresence>
          </Motion>
        </table>
      </div>

      <Transition
        enter-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity duration-200"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="loading"
          class="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/60 backdrop-blur-[1px] dark:bg-slate-900/30"
        >
          <UIcon
            name="i-lucide-loader-2"
            class="h-5 w-5 animate-spin text-slate-400"
          />
        </div>
      </Transition>
    </div>

    <div class="flex items-center justify-between text-sm text-slate-500">
      <span>
        共 {{ pagination.total }} 条，{{ pagination.page }}/{{
          pagination.pageCount
        }}
        页
      </span>
      <div class="flex items-center gap-2">
        <UButton
          size="xs"
          :disabled="page <= 1 || loading"
          @click="goToPage(page - 1)"
        >
          上一页
        </UButton>

        <div class="flex items-center gap-2">
          <span class="text-xs">跳转</span>
          <UInput
            v-model="pageInput"
            class="w-20"
            type="number"
            :min="1"
            :max="pagination.pageCount"
            @keydown.enter.prevent="goToPage(Number(pageInput))"
          />
          <UButton
            size="xs"
            variant="soft"
            :disabled="loading"
            @click="goToPage(Number(pageInput))"
          >
            前往
          </UButton>
        </div>

        <UButton
          size="xs"
          :disabled="page >= pagination.pageCount || loading"
          @click="goToPage(page + 1)"
        >
          下一页
        </UButton>
      </div>
    </div>
  </div>
</template>
