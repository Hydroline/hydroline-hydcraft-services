<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAdminRbacStore } from '@/stores/adminRbac'
import { useUiStore } from '@/stores/ui'

const uiStore = useUiStore()
const rbacStore = useAdminRbacStore()

const activeTab = ref<'roles' | 'permissions' | 'groups' | 'departments'>('roles')

const roles = computed(() => rbacStore.roles)
const permissions = computed(() => rbacStore.permissions)

const tabs = [
  { key: 'roles', label: '角色管理' },
  { key: 'permissions', label: '权限列表' },
  { key: 'groups', label: '用户组管理' },
  { key: 'departments', label: '部门管理' },
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
}

function permissionCount(role: typeof roles.value[number]) {
  return role.rolePermissions?.length ?? 0
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

    <div v-else-if="activeTab === 'groups'" class="space-y-4">
      <div class="rounded-3xl border border-dashed border-slate-300/60 bg-white/60 p-6 text-sm text-slate-600 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-300">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white">用户组管理</h2>
        <p class="mt-2">
          用户组功能尚未在后端实现，相关接口、数据结构待产品确认后开发。当前页面仅保留入口，避免后续导航结构调整。
        </p>
        <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
          建议在完成后端 Schema（user_groups、user_group_roles 等）设计后，接入分组授权、批量角色分配能力。
        </p>
      </div>
    </div>

    <div v-else class="space-y-4">
      <div class="rounded-3xl border border-dashed border-slate-300/60 bg-white/60 p-6 text-sm text-slate-600 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-300">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white">部门管理</h2>
        <p class="mt-2">
          部门/组织架构数据尚未提供，需等待后端补充相关表结构与 API（如 departments、department_members）。当前暂显示规划说明。
        </p>
        <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
          规划建议：支持部门层级、负责人和默认角色；同步后可在用户详情中绑定所属部门并继承角色策略。
        </p>
      </div>
    </div>
  </div>
</template>
