<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useAdminRbacStore } from '@/stores/admin/rbac'
import { useUiStore } from '@/stores/shared/ui'

const uiStore = useUiStore()
const rbacStore = useAdminRbacStore()

const activeTab = ref<'roles' | 'permissions' | 'labels' | 'catalog' | 'self'>(
  'roles',
)

const pageSize = 10

// 角色分页
const rolesPageInput = ref(1)
const rolesCurrentPage = ref(1)
const rolesPaginatedItems = computed(() => {
  const start = (rolesCurrentPage.value - 1) * pageSize
  const end = start + pageSize
  return rbacStore.roles.slice(start, end)
})
const rolesPageCount = computed(
  () => Math.ceil(rbacStore.roles.length / pageSize) || 1,
)
//

// 权限分页
const permissionsPageInput = ref(1)
const permissionsCurrentPage = ref(1)
const permissionsPaginatedItems = computed(() => {
  const start = (permissionsCurrentPage.value - 1) * pageSize
  const end = start + pageSize
  return rbacStore.permissions.slice(start, end)
})
const permissionsPageCount = computed(
  () => Math.ceil(rbacStore.permissions.length / pageSize) || 1,
)
//

// 标签分页
const labelsPageInput = ref(1)
const labelsCurrentPage = ref(1)
const labelsPaginatedItems = computed(() => {
  const start = (labelsCurrentPage.value - 1) * pageSize
  const end = start + pageSize
  return rbacStore.labels.slice(start, end)
})
const labelsPageCount = computed(
  () => Math.ceil(rbacStore.labels.length / pageSize) || 1,
)
//

const roles = computed(() => rbacStore.roles)
const permissions = computed(() => rbacStore.permissions)
const labels = computed(() => rbacStore.labels)
const catalog = computed(() => rbacStore.catalog)
const catalogKeyword = ref('')
const filteredCatalog = computed(() => {
  const k = catalogKeyword.value.trim().toLowerCase()
  if (!k) return catalog.value
  return catalog.value.filter(
    (e) =>
      e.key.toLowerCase().includes(k) ||
      (e.description ?? '').toLowerCase().includes(k),
  )
})

// 依据权限 key 模块前缀分组（按第一个 '.' 分隔，无则归于 global）
const catalogGroups = computed(() => {
  const groups: Record<string, typeof catalog.value> = {}
  for (const entry of filteredCatalog.value) {
    const module = entry.key.includes('.') ? entry.key.split('.')[0] : 'global'
    if (!groups[module]) groups[module] = []
    groups[module].push(entry)
  }
  return Object.entries(groups)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([module, entries]) => ({ module, entries }))
})

// 折叠状态管理
const collapsed = reactive<Record<string, boolean>>({})
function toggleGroup(module: string) {
  collapsed[module] = !collapsed[module]
}
function expandAll() {
  for (const g of catalogGroups.value) collapsed[g.module] = false
}
function collapseAll() {
  for (const g of catalogGroups.value) collapsed[g.module] = true
}

const tabs = [
  { key: 'roles', label: '角色管理' },
  { key: 'permissions', label: '权限列表' },
  { key: 'labels', label: '权限标签' },
  { key: 'catalog', label: '权限目录' },
] as const

onMounted(async () => {
  uiStore.startLoading()
  try {
    await Promise.all([rbacStore.fetchRoles(), rbacStore.fetchPermissions()])
  } finally {
    uiStore.stopLoading()
  }
})

function switchTab(key: (typeof tabs)[number]['key']) {
  activeTab.value = key
  if (key === 'labels' && labels.value.length === 0) {
    void rbacStore.fetchLabels()
  }
  if (key === 'catalog' && catalog.value.length === 0) {
    void rbacStore.fetchCatalog()
  }
}

function permissionCount(role: (typeof roles.value)[number]) {
  return role.rolePermissions?.length ?? 0
}

// ==== 自助申请 ====
const selfModalOpen = ref(false)
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
    selfModalOpen.value = false
  } finally {
    selfSubmitting.value = false
  }
}

function openSelfModal() {
  selfKeys.value = ''
  selfModalOpen.value = true
}

// ==== 角色编辑 ====
const roleModalOpen = ref(false)
const roleEditingId = ref<string | null>(null)
const roleForm = reactive({
  key: '',
  name: '',
  description: '' as string | null,
  permissionKeys: [] as string[],
})

function openCreateRole() {
  roleEditingId.value = null
  roleForm.key = ''
  roleForm.name = ''
  roleForm.description = ''
  roleForm.permissionKeys = []
  roleModalOpen.value = true
}

function openEditRole(role: (typeof roles.value)[number]) {
  roleEditingId.value = role.id
  roleForm.key = role.key
  roleForm.name = role.name
  roleForm.description = role.description ?? ''
  roleForm.permissionKeys = (role.rolePermissions ?? []).map(
    (r) => r.permission.key,
  )
  roleModalOpen.value = true
}

async function submitRole() {
  if (roleEditingId.value) {
    await rbacStore.updateRole(roleEditingId.value, {
      name: roleForm.name,
      description: roleForm.description ?? null,
    })
    await rbacStore.updateRolePermissions(
      roleEditingId.value,
      roleForm.permissionKeys,
    )
  } else {
    await rbacStore.createRole({
      key: roleForm.key,
      name: roleForm.name,
      description: roleForm.description ?? null,
      permissionKeys: roleForm.permissionKeys,
    })
  }
  roleModalOpen.value = false
}

async function deleteRole(role: (typeof roles.value)[number]) {
  if (role.isSystem) return
  if (!confirm(`确定删除角色「${role.name}」吗？该操作不可恢复。`)) return
  await rbacStore.deleteRole(role.id)
}

function switchPermission(key: string, value: boolean | 'indeterminate') {
  const checked = value === true
  const set = new Set(roleForm.permissionKeys)
  if (checked) set.add(key)
  else set.delete(key)
  roleForm.permissionKeys = Array.from(set)
}

// ==== 标签编辑 ====
const labelModalOpen = ref(false)
const labelEditingId = ref<string | null>(null)
const labelForm = reactive({
  key: '',
  name: '',
  description: '' as string | null,
  color: '' as string | null,
  permissionKeys: [] as string[],
})

function openCreateLabel() {
  labelEditingId.value = null
  labelForm.key = ''
  labelForm.name = ''
  labelForm.description = ''
  labelForm.color = ''
  labelForm.permissionKeys = []
  labelModalOpen.value = true
}

interface EditableLabel {
  id: string
  key: string
  name: string
  description: string | null
  color?: string | null
  permissions: Array<{ id: string; permission: { key: string } }>
}
function openEditLabel(label: EditableLabel) {
  labelEditingId.value = label.id
  labelForm.key = label.key
  labelForm.name = label.name
  labelForm.description = label.description ?? ''
  labelForm.color = label.color ?? ''
  labelForm.permissionKeys = (label.permissions ?? []).map(
    (p) => p.permission.key,
  )
  labelModalOpen.value = true
}

async function submitLabel() {
  if (labelEditingId.value) {
    await rbacStore.updateLabel(labelEditingId.value, {
      name: labelForm.name,
      description: labelForm.description ?? null,
      color: labelForm.color || null,
      permissionKeys: labelForm.permissionKeys,
    })
  } else {
    await rbacStore.createLabel({
      key: labelForm.key,
      name: labelForm.name,
      description: labelForm.description ?? null,
      color: labelForm.color || null,
      permissionKeys: labelForm.permissionKeys,
    })
  }
  labelModalOpen.value = false
}

async function deleteLabel(label: (typeof labels.value)[number]) {
  if (!confirm(`确定删除标签「${label.name}」吗？`)) return
  await rbacStore.deleteLabel(label.id)
}

// ==== 分页函数 ====
function goToPage(page: number, type: 'roles' | 'permissions' | 'labels') {
  const pageCount =
    type === 'roles'
      ? rolesPageCount.value
      : type === 'permissions'
        ? permissionsPageCount.value
        : labelsPageCount.value
  const target = Math.max(1, Math.min(page, pageCount))

  if (type === 'roles') {
    rolesCurrentPage.value = target
    rolesPageInput.value = target
  } else if (type === 'permissions') {
    permissionsCurrentPage.value = target
    permissionsPageInput.value = target
  } else {
    labelsCurrentPage.value = target
    labelsPageInput.value = target
  }
}

function handlePageInput(type: 'roles' | 'permissions' | 'labels') {
  const pageInputRef =
    type === 'roles'
      ? rolesPageInput
      : type === 'permissions'
        ? permissionsPageInput
        : labelsPageInput
  const pageCount =
    type === 'roles'
      ? rolesPageCount.value
      : type === 'permissions'
        ? permissionsPageCount.value
        : labelsPageCount.value
  const currentPage =
    type === 'roles'
      ? rolesCurrentPage.value
      : type === 'permissions'
        ? permissionsCurrentPage.value
        : labelsCurrentPage.value
  if (pageInputRef.value === null || Number.isNaN(pageInputRef.value)) {
    pageInputRef.value = currentPage
    return
  }
  const normalized = Math.max(
    1,
    Math.min(Math.trunc(pageInputRef.value), pageCount),
  )
  pageInputRef.value = normalized
  goToPage(normalized, type)
}

watch(
  () => rbacStore.roles.length,
  () => {
    if (rolesCurrentPage.value > rolesPageCount.value) {
      rolesCurrentPage.value = rolesPageCount.value || 1
    }
  },
)

watch(
  () => rbacStore.permissions.length,
  () => {
    if (permissionsCurrentPage.value > permissionsPageCount.value) {
      permissionsCurrentPage.value = permissionsPageCount.value || 1
    }
  },
)

watch(
  () => rbacStore.labels.length,
  () => {
    if (labelsCurrentPage.value > labelsPageCount.value) {
      labelsCurrentPage.value = labelsPageCount.value || 1
    }
  },
)
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap justify-between items-start gap-2">
      <div class="flex items-center gap-2">
        <UButton
          v-for="tab in tabs"
          variant="soft"
          :key="tab.key"
          :color="activeTab === tab.key ? 'primary' : 'neutral'"
          @click="switchTab(tab.key)"
        >
          {{ tab.label }}
        </UButton>

        <UButton color="neutral" variant="soft" @click="openSelfModal"
          >自助申请</UButton
        >
      </div>
      <div class="flex gap-2" v-if="activeTab === 'roles'">
        <UButton color="primary" variant="link" @click="openCreateRole"
          >新建角色</UButton
        >
      </div>
      <div class="flex gap-2" v-else-if="activeTab === 'labels'">
        <UButton color="primary" variant="link" @click="openCreateLabel"
          >新建标签</UButton
        >
      </div>
      <div class="flex items-center gap-2" v-else-if="activeTab === 'catalog'">
        <div class="flex flex-col gap-0.5">
          <div class="flex items-center gap-0.5">
            <UButton color="neutral" variant="link" @click="catalogKeyword = ''"
              >清空</UButton
            >
            <UButton color="neutral" variant="link" @click="expandAll"
              >全部展开</UButton
            >
            <UButton color="neutral" variant="link" @click="collapseAll"
              >全部折叠</UButton
            >
            <UInput
              v-model="catalogKeyword"
              placeholder="搜索权限点或描述"
              class="max-w-lg"
            />
          </div>
          <span class="ml-auto px-2 text-xs text-slate-500 dark:text-slate-400"
            >共 {{ filteredCatalog.length }} 个权限点，
            {{ catalogGroups.length }} 个模块</span
          >
        </div>
      </div>
    </div>

    <div v-if="activeTab === 'roles'" class="space-y-4">
      <div
        class="rounded-3xl overflow-hidden border border-slate-200/70 bg-white/80 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70"
      >
        <table
          class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800"
        >
          <thead class="bg-slate-50/60 dark:bg-slate-900/60">
            <tr
              class="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              <th class="px-4 py-3">角色</th>
              <th class="px-4 py-3">权限数量</th>
              <th class="px-4 py-3">系统角色</th>
              <th class="px-4 py-3">描述</th>
              <th class="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">
            <tr
              v-for="role in rolesPaginatedItems"
              :key="role.id"
              class="transition hover:bg-slate-50/80 dark:hover:bg-slate-900/60"
            >
              <td class="px-4 py-3">
                <div class="flex flex-col">
                  <span class="font-medium text-slate-900 dark:text-white">{{
                    role.name
                  }}</span>
                  <span class="text-xs text-slate-500 dark:text-slate-400">{{
                    role.key
                  }}</span>
                </div>
              </td>
              <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                {{ permissionCount(role) }}
              </td>
              <td class="px-4 py-3">
                <UBadge
                  :color="role.isSystem ? 'neutral' : 'primary'"
                  variant="soft"
                >
                  {{ role.isSystem ? '系统内置' : '自定义' }}
                </UBadge>
              </td>
              <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                {{ role.description ?? '—' }}
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex justify-end gap-2">
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="outline"
                    @click="openEditRole(role)"
                    >编辑</UButton
                  >
                  <UButton
                    v-if="!role.isSystem"
                    size="xs"
                    color="error"
                    variant="soft"
                    @click="deleteRole(role)"
                  >
                    删除
                  </UButton>
                </div>
              </td>
            </tr>
            <tr v-if="rolesPaginatedItems.length === 0">
              <td
                colspan="5"
                class="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
              >
                尚未创建任何角色。
              </td>
            </tr>
          </tbody>
        </table>
        <div
          class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 px-4 py-3 text-sm text-slate-600 dark:border-slate-800/60 dark:text-slate-300"
        >
          <span
            >第 {{ rolesCurrentPage }} / {{ rolesPageCount }} 页，共
            {{ roles.length }} 个角色</span
          >
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              @click="goToPage(1, 'roles')"
            >
              首页
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              @click="goToPage(rolesCurrentPage - 1, 'roles')"
            >
              上一页
            </UButton>
            <div class="flex items-center gap-1">
              <UInput
                v-model.number="rolesPageInput"
                type="number"
                size="xs"
                class="w-16 text-center"
                min="1"
                :max="rolesPageCount"
                @keydown.enter.prevent="handlePageInput('roles')"
              />
              <span class="text-xs text-slate-500 dark:text-slate-400">
                / {{ rolesPageCount }}
              </span>
            </div>
            <UButton
              color="neutral"
              variant="soft"
              size="xs"
              @click="handlePageInput('roles')"
            >
              跳转
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              @click="goToPage(rolesCurrentPage + 1, 'roles')"
            >
              下一页
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              @click="goToPage(rolesPageCount, 'roles')"
            >
              末页
            </UButton>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="activeTab === 'permissions'" class="space-y-4">
      <div
        class="rounded-3xl border border-slate-200/70 bg-white/80 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70"
      >
        <table
          class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800"
        >
          <thead class="bg-slate-50/60 dark:bg-slate-900/60">
            <tr
              class="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              <th class="px-4 py-3">权限点</th>
              <th class="px-4 py-3">描述</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">
            <tr
              v-for="permission in permissionsPaginatedItems"
              :key="permission.id"
              class="transition hover:bg-slate-50/80 dark:hover:bg-slate-900/60"
            >
              <td class="px-4 py-3 font-mono text-slate-900 dark:text-white">
                {{ permission.key }}
              </td>
              <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                {{ permission.description ?? '—' }}
              </td>
            </tr>
            <tr v-if="permissionsPaginatedItems.length === 0">
              <td
                colspan="2"
                class="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
              >
                尚未记录任何权限点。
              </td>
            </tr>
          </tbody>
        </table>
        <div
          class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 px-4 py-3 text-sm text-slate-600 dark:border-slate-800/60 dark:text-slate-300"
        >
          <span
            >第 {{ permissionsCurrentPage }} / {{ permissionsPageCount }} 页，共
            {{ permissions.length }} 个权限</span
          >
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              @click="goToPage(1, 'permissions')"
            >
              首页
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              @click="goToPage(permissionsCurrentPage - 1, 'permissions')"
            >
              上一页
            </UButton>
            <div class="flex items-center gap-1">
              <UInput
                v-model.number="permissionsPageInput"
                type="number"
                size="xs"
                class="w-16 text-center"
                min="1"
                :max="permissionsPageCount"
                @keydown.enter.prevent="handlePageInput('permissions')"
              />
              <span class="text-xs text-slate-500 dark:text-slate-400">
                / {{ permissionsPageCount }}
              </span>
            </div>
            <UButton
              color="neutral"
              variant="soft"
              size="xs"
              @click="handlePageInput('permissions')"
            >
              跳转
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              @click="goToPage(permissionsCurrentPage + 1, 'permissions')"
            >
              下一页
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              @click="goToPage(permissionsPageCount, 'permissions')"
            >
              末页
            </UButton>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="activeTab === 'labels'" class="space-y-4">
      <div
        class="rounded-3xl border border-slate-200/70 bg-white/80 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/70"
      >
        <table
          class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800"
        >
          <thead class="bg-slate-50/60 dark:bg-slate-900/60">
            <tr
              class="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              <th class="px-4 py-3">标签</th>
              <th class="px-4 py-3">权限数量</th>
              <th class="px-4 py-3">描述</th>
              <th class="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">
            <tr
              v-for="label in labelsPaginatedItems"
              :key="label.id"
              class="transition hover:bg-slate-50/80 dark:hover:bg-slate-900/60"
            >
              <td class="px-4 py-3">
                <div class="flex flex-col">
                  <span class="font-medium text-slate-900 dark:text-white">{{
                    label.name
                  }}</span>
                  <span class="text-xs text-slate-500 dark:text-slate-400">{{
                    label.key
                  }}</span>
                </div>
              </td>
              <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                {{ label.permissions.length }}
              </td>
              <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                {{ label.description ?? '—' }}
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex justify-end gap-2">
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="outline"
                    @click="openEditLabel(label)"
                    >编辑</UButton
                  >
                  <UButton
                    size="xs"
                    color="error"
                    variant="soft"
                    @click="deleteLabel(label)"
                  >
                    删除
                  </UButton>
                </div>
              </td>
            </tr>
            <tr v-if="labelsPaginatedItems.length === 0">
              <td
                colspan="4"
                class="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
              >
                尚未创建任何标签。
              </td>
            </tr>
          </tbody>
        </table>
        <div
          class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 px-4 py-3 text-sm text-slate-600 dark:border-slate-800/60 dark:text-slate-300"
        >
          <span
            >第 {{ labelsCurrentPage }} / {{ labelsPageCount }} 页，共
            {{ labels.length }} 个标签</span
          >
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              @click="goToPage(1, 'labels')"
            >
              首页
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              @click="goToPage(labelsCurrentPage - 1, 'labels')"
            >
              上一页
            </UButton>
            <div class="flex items-center gap-1">
              <UInput
                v-model.number="labelsPageInput"
                type="number"
                size="xs"
                class="w-16 text-center"
                min="1"
                :max="labelsPageCount"
                @keydown.enter.prevent="handlePageInput('labels')"
              />
              <span class="text-xs text-slate-500 dark:text-slate-400">
                / {{ labelsPageCount }}
              </span>
            </div>
            <UButton
              color="neutral"
              variant="soft"
              size="xs"
              @click="handlePageInput('labels')"
            >
              跳转
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              @click="goToPage(labelsCurrentPage + 1, 'labels')"
            >
              下一页
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              @click="goToPage(labelsPageCount, 'labels')"
            >
              末页
            </UButton>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="activeTab === 'catalog'" class="space-y-4">
      <div class="space-y-3">
        <div
          v-for="group in catalogGroups"
          :key="group.module"
          class="rounded-2xl border border-slate-200/70 bg-white/80 dark:border-slate-800/60 dark:bg-slate-900/70"
        >
          <div
            class="flex cursor-pointer items-center justify-between px-4 py-2 text-sm"
            @click="toggleGroup(group.module)"
          >
            <div class="flex items-center gap-3">
              <UIcon
                :name="
                  collapsed[group.module]
                    ? 'i-heroicons-chevron-right'
                    : 'i-heroicons-chevron-down'
                "
                class="text-slate-500 transition"
              />
              <span class="font-medium text-slate-900 dark:text-white">{{
                group.module
              }}</span>
              <UBadge variant="soft" color="neutral">{{
                group.entries.length
              }}</UBadge>
            </div>
            <span
              class="text-xs text-slate-500 dark:text-slate-400"
              v-if="collapsed[group.module]"
              >已折叠</span
            >
          </div>
          <transition name="fade" mode="out-in">
            <div
              v-if="!collapsed[group.module]"
              class="border-t border-slate-100 dark:border-slate-800/50"
            >
              <table
                class="min-w-full divide-y divide-slate-100 text-xs dark:divide-slate-800/60"
              >
                <thead>
                  <tr
                    class="text-left uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    <th class="w-1/3 px-4 py-2">权限点</th>
                    <th class="w-1/3 px-4 py-2">角色来源</th>
                    <th class="w-1/3 px-4 py-2">标签来源</th>
                  </tr>
                </thead>
                <tbody
                  class="divide-y divide-slate-50 dark:divide-slate-800/50"
                >
                  <tr
                    v-for="entry in group.entries"
                    :key="entry.id"
                    class="transition hover:bg-slate-50/80 dark:hover:bg-slate-900/60"
                  >
                    <td class="px-4 py-2">
                      <div class="flex flex-col">
                        <span
                          class="font-medium text-slate-900 dark:text-white"
                          >{{ entry.key }}</span
                        >
                        <span
                          class="text-[11px] text-slate-500 dark:text-slate-400"
                          >{{ entry.description ?? '—' }}</span
                        >
                      </div>
                    </td>
                    <td
                      class="px-4 py-2 text-[11px] text-slate-500 dark:text-slate-400"
                    >
                      <div class="flex gap-1">
                        <UBadge
                          v-for="role in entry.roles"
                          :key="role.id"
                          color="primary"
                          variant="soft"
                        >
                          {{ role.name }}
                        </UBadge>
                        <span v-if="entry.roles.length === 0">—</span>
                      </div>
                    </td>
                    <td
                      class="px-4 py-2 text-[11px] text-slate-500 dark:text-slate-400"
                    >
                      <div class="flex flex-col gap-1">
                        <UBadge
                          v-for="label in entry.labels"
                          :key="label.id"
                          color="neutral"
                          variant="soft"
                        >
                          {{ label.name }}
                        </UBadge>
                        <span v-if="entry.labels.length === 0">—</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </transition>
        </div>
        <div
          v-if="catalogGroups.length === 0"
          class="rounded-xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400"
        >
          未找到匹配的权限节点。
        </div>
      </div>
    </div>

    <div v-else class="text-center py-10">
      <p class="text-slate-500 dark:text-slate-400">选择一个标签页查看内容</p>
    </div>
  </div>

  <!-- 角色编辑弹窗 -->
  <UModal
    v-model:open="roleModalOpen"
    :ui="{
      content:
        'w-full max-w-2xl w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
    }"
  >
    <template #content>
      <form class="space-y-4 p-6 text-sm" @submit.prevent="submitRole">
        <header class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
            {{ roleEditingId ? '编辑角色' : '新建角色' }}
          </h3>
        </header>
        <div class="grid gap-4 md:grid-cols-2">
          <label class="flex flex-col gap-1">
            <span
              class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >Key</span
            >
            <UInput
              v-model="roleForm.key"
              :disabled="!!roleEditingId"
              placeholder="如 moderator"
              required
            />
          </label>
          <label class="flex flex-col gap-1">
            <span
              class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >名称</span
            >
            <UInput v-model="roleForm.name" placeholder="展示名称" required />
          </label>
        </div>
        <label class="flex flex-col gap-1">
          <span
            class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >描述</span
          >
          <UTextarea
            v-model="roleForm.description"
            :rows="2"
            placeholder="补充说明（可选）"
          />
        </label>
        <div>
          <p
            class="mb-2 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            权限点
          </p>
          <div
            class="grid max-h-64 grid-cols-1 gap-1 overflow-auto rounded-lg border border-slate-200/70 p-3 dark:border-slate-800/60 md:grid-cols-2"
          >
            <label
              v-for="perm in permissions"
              :key="perm.id"
              class="flex items-center gap-2 text-xs"
            >
              <UCheckbox
                :model-value="roleForm.permissionKeys.includes(perm.key)"
                @update:model-value="
                  (v: boolean | 'indeterminate') =>
                    switchPermission(perm.key, v)
                "
              />
              <span class="font-mono">{{ perm.key }}</span>
            </label>
          </div>
        </div>
        <div class="flex justify-end gap-2">
          <UButton
            type="button"
            color="neutral"
            variant="ghost"
            @click="roleModalOpen = false"
            >取消</UButton
          >
          <UButton type="submit" color="primary" :loading="rbacStore.submitting"
            >保存</UButton
          >
        </div>
      </form>
    </template>
  </UModal>

  <!-- 标签编辑弹窗 -->
  <UModal
    v-model:open="labelModalOpen"
    :ui="{
      content:
        'w-full max-w-2xl w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
    }"
  >
    <template #content>
      <form class="space-y-4 p-6 text-sm" @submit.prevent="submitLabel">
        <header class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
            {{ labelEditingId ? '编辑权限标签' : '新建权限标签' }}
          </h3>
        </header>
        <div class="grid gap-4 md:grid-cols-2">
          <label class="flex flex-col gap-1">
            <span
              class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >Key</span
            >
            <UInput
              v-model="labelForm.key"
              :disabled="!!labelEditingId"
              placeholder="如 vip"
              required
            />
          </label>
          <label class="flex flex-col gap-1">
            <span
              class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >名称</span
            >
            <UInput v-model="labelForm.name" placeholder="展示名称" required />
          </label>
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <label class="flex flex-col gap-1">
            <span
              class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >描述</span
            >
            <UInput
              v-model="labelForm.description"
              placeholder="说明（可选）"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span
              class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >颜色</span
            >
            <UInput
              v-model="labelForm.color"
              placeholder="#AABBCC 或主题色名（可选）"
            />
          </label>
        </div>
        <div>
          <p
            class="mb-2 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            权限点（可留空）
          </p>
          <div
            class="grid max-h-64 grid-cols-1 gap-1 overflow-auto rounded-lg border border-slate-200/70 p-3 dark:border-slate-800/60 md:grid-cols-2"
          >
            <label
              v-for="perm in permissions"
              :key="perm.id"
              class="flex items-center gap-2 text-xs"
            >
              <UCheckbox
                :model-value="labelForm.permissionKeys.includes(perm.key)"
                @update:model-value="
                  (v: boolean | 'indeterminate') => {
                    const set = new Set(labelForm.permissionKeys)
                    if (v === true) set.add(perm.key)
                    else set.delete(perm.key)
                    labelForm.permissionKeys = Array.from(set)
                  }
                "
              />
              <span class="font-mono">{{ perm.key }}</span>
            </label>
          </div>
        </div>
        <div class="flex justify-end gap-2">
          <UButton
            type="button"
            color="neutral"
            variant="ghost"
            @click="labelModalOpen = false"
            >取消</UButton
          >
          <UButton type="submit" color="primary" :loading="rbacStore.submitting"
            >保存</UButton
          >
        </div>
      </form>
    </template>
  </UModal>

  <!-- 自助申请弹窗 -->
  <UModal
    v-model:open="selfModalOpen"
    :ui="{
      content:
        'w-full max-w-2xl w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
    }"
  >
    <template #content>
      <form class="space-y-4 p-6 text-sm" @submit.prevent="submitSelfAssign">
        <header class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
            管理员自助申请
          </h3>
        </header>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          当新增模块尚未授权时，可在此输入权限键（用逗号分隔）并立即获取。
        </p>
        <label class="flex flex-col gap-1">
          <span
            class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >权限键</span
          >
          <UInput
            v-model="selfKeys"
            placeholder="例如 auth.manage.users, assets.manage.attachments"
            required
          />
        </label>
        <div class="flex justify-end gap-2">
          <UButton
            type="button"
            color="neutral"
            variant="ghost"
            @click="selfModalOpen = false"
            >取消</UButton
          >
          <UButton type="submit" color="primary" :loading="selfSubmitting"
            >申请</UButton
          >
        </div>
      </form>
    </template>
  </UModal>
</template>
