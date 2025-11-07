<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAdminUsersStore } from '@/stores/adminUsers'
import { useUiStore } from '@/stores/ui'

const uiStore = useUiStore()
const usersStore = useAdminUsersStore()

const keyword = ref(usersStore.keyword)

const rows = computed(() => usersStore.items)
const pagination = computed(() => usersStore.pagination)

async function refresh(page?: number) {
  uiStore.startLoading()
  try {
    await usersStore.fetch({
      keyword: keyword.value,
      page,
    })
  } finally {
    uiStore.stopLoading()
  }
}

function roleNames(roleLinks: typeof rows.value[number]['roles']) {
  if (!roleLinks || roleLinks.length === 0) return ['未分配']
  return roleLinks.map((entry) => entry.role.name ?? entry.role.key)
}

function minecraftIds(item: typeof rows.value[number]) {
  const profiles = item.minecraftIds ?? []
  if (profiles.length === 0) return '未绑定'
  return profiles
    .map((profile) => {
      const name =
        profile.authmeBinding?.username ?? profile.nickname ?? '未命名'
      return profile.isPrimary ? `${name}（主）` : name
    })
    .join('、')
}

function labelNames(item: typeof rows.value[number]) {
  const links = item.permissionLabels ?? []
  if (links.length === 0) return ['未设置']
  return links.map((link) => link.label.name)
}

onMounted(async () => {
  if (rows.value.length === 0) {
    await refresh(1)
  }
})

async function handleSubmit() {
  await refresh(1)
}

async function goToPage(page: number) {
  if (page === pagination.value.page || page < 1 || page > pagination.value.pageCount) return
  await refresh(page)
}
</script>

<template>
  <div class="space-y-6">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">站内用户</h1>
        <p class="text-sm text-slate-600 dark:text-slate-300">
          查看 Hydroline 平台账号资料、权限标签及其 AuthMe 绑定摘要。
        </p>
      </div>
      <div class="flex w-full flex-col gap-2 sm:max-w-xl">
        <form class="flex w-full gap-2" @submit.prevent="handleSubmit">
          <UInput
            v-model="keyword"
            type="search"
            placeholder="搜索用户邮箱、名称或 PIIC"
            class="flex-1"
          />
          <UButton type="submit" color="primary">搜索</UButton>
        </form>
        <div class="flex justify-end">
          <RouterLink :to="{ name: 'admin.players' }">
            <UButton color="neutral" variant="soft" size="xs">查看 AuthMe 玩家</UButton>
          </RouterLink>
        </div>
      </div>
    </header>

    <div class="overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70">
      <table class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
        <thead class="bg-slate-50/60 dark:bg-slate-900/60">
          <tr class="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <th class="px-4 py-3">用户</th>
            <th class="px-4 py-3">PIIC</th>
            <th class="px-4 py-3">角色</th>
            <th class="px-4 py-3">标签</th>
            <th class="px-4 py-3">Minecraft</th>
            <th class="px-4 py-3">注册时间</th>
            <th class="px-4 py-3">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">
          <tr
            v-for="item in rows"
            :key="item.id"
            class="transition hover:bg-slate-50/80 dark:hover:bg-slate-900/60"
          >
            <td class="px-4 py-3">
              <div class="flex flex-col">
                <span class="font-medium text-slate-900 dark:text-white">{{ item.profile?.displayName ?? item.email }}</span>
                <span class="text-xs text-slate-500 dark:text-slate-400">{{ item.email }}</span>
              </div>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              {{ item.profile?.piic ?? '—' }}
            </td>
            <td class="px-4 py-3">
              <div class="flex flex-wrap gap-2">
                <UBadge
                  v-for="roleName in roleNames(item.roles)"
                  :key="roleName"
                  color="primary"
                  variant="soft"
                >
                  {{ roleName }}
                </UBadge>
              </div>
            </td>
            <td class="px-4 py-3">
              <div class="flex flex-wrap gap-2">
                <UBadge
                  v-for="labelName in labelNames(item)"
                  :key="labelName"
                  color="neutral"
                  variant="soft"
                >
                  {{ labelName }}
                </UBadge>
              </div>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              {{ minecraftIds(item) }}
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              {{ new Date(item.createdAt).toLocaleString() }}
            </td>
            <td class="px-4 py-3">
              <RouterLink :to="{ name: 'admin.users.detail', params: { userId: item.id } }">
                <UButton color="primary" size="xs" variant="soft">查看</UButton>
              </RouterLink>
            </td>
          </tr>
          <tr v-if="rows.length === 0">
            <td colspan="7" class="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              未查询到符合条件的用户。
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 text-sm text-slate-600 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-300">
      <span>
        第 {{ pagination.page }} / {{ pagination.pageCount }} 页，共 {{ pagination.total }} 人
      </span>
      <div class="flex gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="pagination.page <= 1 || usersStore.loading"
          @click="goToPage(pagination.page - 1)"
        >
          上一页
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="pagination.page >= pagination.pageCount || usersStore.loading"
          @click="goToPage(pagination.page + 1)"
        >
          下一页
        </UButton>
      </div>
    </div>
  </div>
</template>
