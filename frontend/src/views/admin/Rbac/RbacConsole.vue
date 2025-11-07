<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAdminRbacStore } from '@/stores/adminRbac'
import { useUiStore } from '@/stores/ui'

const uiStore = useUiStore()
const rbacStore = useAdminRbacStore()

const activeTab = ref<'roles' | 'permissions' | 'labels' | 'catalog' | 'self'>('roles')

const roles = computed(() => rbacStore.roles)
const permissions = computed(() => rbacStore.permissions)
const labels = computed(() => rbacStore.labels)
const catalog = computed(() => rbacStore.catalog)

const tabs = [
  { key: 'roles', label: '角色管理' },
  { key: 'permissions', label: '权限列表' },
  { key: 'labels', label: '权限标签' },
  { key: 'catalog', label: '权限目录' },
  { key: 'self', label: '自助申请' },
] as const

onMounted(async () => {
  uiStore.startLoading()
  try {
    await Promise.all([rbacStore.fetchRoles(), rbacStore.fetchPermissions()])
  } finally {
    uiStore.stopLoading()
  }
})

function switchTab(key: typeof tabs[number]['key']) {
  activeTab.value = key
  if (key === 'labels' && labels.value.length === 0) {
    void rbacStore.fetchLabels()
  }
  if (key === 'catalog' && catalog.value.length === 0) {
    void rbacStore.fetchCatalog()
  }
}

function permissionCount(role: typeof roles.value[number]) {
  return role.rolePermissions?.length ?? 0
}

const selfKeys = ref('')
const selfSubmitting = ref(false)

async function submitSelfAssign() {
  if (!selfKeys.value.trim()) return
  selfSubmitting.value = true
  try {
    const keys = selfKeys.value
      .split(',')
      .map((key) => key.trim())
      .filter(Boolean)
    if (keys.length === 0) return
    await rbacStore.selfAssignPermissions(keys)
    selfKeys.value = ''
  } finally {
    selfSubmitting.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <header class="flex flex-col gap-2">
      <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">RBAC 权限控制</h1>
      <p class="text-sm text-slate-600 dark:text-slate-300">
        维护 Hydroline 管理后台的角色、权限以及组织结构，确保资源访问满足最小权限原则。
      </p>
    </header>

    <div class="flex flex-wrap gap-2">
      <UButton
        v-for="tab in tabs"
        :key="tab.key"
        size="sm"
        :color="activeTab === tab.key ? 'primary' : 'neutral'"
        :variant="activeTab === tab.key ? 'solid' : 'ghost'"
        @click="switchTab(tab.key)"
      >
        {{ tab.label }}
      </UButton>
    </div>

    <div v-if="activeTab === 'roles'" class="space-y-4">
      <div class="rounded-3xl border border-slate-200/70 bg-white/80 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70">
        <table class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
          <thead class="bg-slate-50/60 dark:bg-slate-900/60">
            <tr class="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <th class="px-4 py-3">角色</th>
              <th class="px-4 py-3">权限数量</th>
              <th class="px-4 py-3">系统角色</th>
              <th class="px-4 py-3">描述</th>
              <th class="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">
            <tr
              v-for="role in roles"
              :key="role.id"
              class="transition hover:bg-slate-50/80 dark:hover:bg-slate-900/60"
            >
              <td class="px-4 py-3">
                <div class="flex flex-col">
                  <span class="font-medium text-slate-900 dark:text-white">{{ role.name }}</span>
                  <span class="text-xs text-slate-500 dark:text-slate-400">{{ role.key }}</span>
                </div>
              </td>
              <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{{ permissionCount(role) }}</td>
              <td class="px-4 py-3">
                <UBadge :color="role.isSystem ? 'neutral' : 'primary'" variant="soft">
                  {{ role.isSystem ? '系统内置' : '自定义' }}
                </UBadge>
              </td>
              <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                {{ role.description ?? '—' }}
              </td>
              <td class="px-4 py-3 text-right">
                <UTooltip text="后续迭代开放编辑">
                  <UButton size="xs" color="neutral" variant="ghost" disabled>
                    编辑
                  </UButton>
                </UTooltip>
              </td>
            </tr>
            <tr v-if="roles.length === 0">
              <td colspan="5" class="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                尚未创建任何角色。
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-xs text-slate-500 dark:text-slate-400">
        注：角色与权限数据来自后端接口 `/auth/roles`，编辑能力将在权限审批流程完善后开放。
      </p>
    </div>

    <div v-else-if="activeTab === 'permissions'" class="space-y-4">
      <div class="rounded-3xl border border-slate-200/70 bg-white/80 p-6 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white">权限列表</h2>
        <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">
          当前系统共记录 {{ permissions.length }} 项权限点。
        </p>
        <ul class="mt-4 grid gap-3 md:grid-cols-2">
          <li
            v-for="permission in permissions"
            :key="permission.id"
            class="rounded-2xl border border-slate-200/70 bg-white/60 p-4 text-sm dark:border-slate-800/60 dark:bg-slate-900/60"
          >
            <p class="font-medium text-slate-900 dark:text-white">{{ permission.key }}</p>
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{{ permission.description ?? '暂无描述' }}</p>
          </li>
        </ul>
      </div>
    </div>

    <div v-else-if="activeTab === 'labels'" class="space-y-4">
      <div class="rounded-3xl border border-slate-200/70 bg-white/80 p-6 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white">权限标签</h2>
        <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">
          标签可用于为玩家/用户打标，并附带一组权限点，支持叠加及空标签。
        </p>
        <div class="mt-4 grid gap-4 md:grid-cols-2">
          <div
            v-for="label in labels"
            :key="label.id"
            class="rounded-2xl border border-slate-200/70 bg-white/70 p-4 text-sm dark:border-slate-800/60 dark:bg-slate-900/60"
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="font-semibold text-slate-900 dark:text-white">{{ label.name }}</p>
                <p class="text-xs text-slate-500 dark:text-slate-400">{{ label.key }}</p>
              </div>
              <UBadge color="primary" variant="soft">{{ label.permissions.length }} 项权限</UBadge>
            </div>
            <ul class="mt-2 text-xs text-slate-500 dark:text-slate-400">
              <li v-for="perm in label.permissions" :key="perm.id">
                {{ perm.permission.key }}
              </li>
              <li v-if="label.permissions.length === 0">该标签未附加任何权限，可用于纯标签标识。</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="activeTab === 'catalog'" class="space-y-4">
      <div class="rounded-3xl border border-slate-200/70 bg-white/80 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70">
        <table class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
          <thead class="bg-slate-50/60 dark:bg-slate-900/60">
            <tr class="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <th class="px-4 py-3">权限点</th>
              <th class="px-4 py-3">角色来源</th>
              <th class="px-4 py-3">标签来源</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">
            <tr v-for="entry in catalog" :key="entry.id" class="transition hover:bg-slate-50/80 dark:hover:bg-slate-900/60">
              <td class="px-4 py-3">
                <div class="flex flex-col">
                  <span class="font-medium text-slate-900 dark:text-white">{{ entry.key }}</span>
                  <span class="text-xs text-slate-500 dark:text-slate-400">{{ entry.description ?? '—' }}</span>
                </div>
              </td>
              <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                <div class="flex flex-wrap gap-1">
                  <UBadge
                    v-for="role in entry.roles"
                    :key="role.id"
                    color="primary"
                    variant="soft"
                  >
                    {{ role.name }}
                  </UBadge>
                  <span v-if="entry.roles.length === 0">未纳入任何角色</span>
                </div>
              </td>
              <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                <div class="flex flex-wrap gap-1">
                  <UBadge
                    v-for="label in entry.labels"
                    :key="label.id"
                    color="neutral"
                    variant="soft"
                  >
                    {{ label.name }}
                  </UBadge>
                  <span v-if="entry.labels.length === 0">未被任何标签引用</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-else class="space-y-4">
      <div class="rounded-3xl border border-slate-200/70 bg-white/80 p-6 text-sm text-slate-600 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-300">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white">管理员自助申请</h2>
        <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
          当新增模块尚未授权时，可在此输入权限键（用逗号分隔）并立即获取。
        </p>
        <div class="mt-4 flex gap-2">
          <UInput
            v-model="selfKeys"
            placeholder="例如 auth.manage.users, assets.manage.attachments"
            class="flex-1"
          />
          <UButton :loading="selfSubmitting" color="primary" @click="submitSelfAssign">
            申请
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>
