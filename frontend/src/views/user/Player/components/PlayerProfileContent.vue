<script setup lang="ts">
import { computed, ref } from 'vue'
import PlayerBindingDetailDialog from './PlayerBindingDetailDialog.vue'
import PlayerGameStatsPanel from './PlayerGameStatsPanel.vue'
import PlayerProfileHeroSection from './PlayerProfileHeroSection.vue'
import PlayerProfileInfoSection from './PlayerProfileInfoSection.vue'
import PlayerProfileAccountsSection from './PlayerProfileAccountsSection.vue'
import PlayerProfileBioSection from './PlayerProfileBioSection.vue'
import PlayerProfileMessageBoardSection from './PlayerProfileMessageBoardSection.vue'
import PlayerAllMessagesDialog from './PlayerAllMessagesDialog.vue'
import PlayerComposeMessageDialog from './PlayerComposeMessageDialog.vue'
import { usePlayerPortalStore } from '@/stores/user/playerPortal'
import type {
  PlayerMinecraftResponse,
  PlayerRegionResponse,
  PlayerStatsResponse,
  PlayerSummary,
  PlayerStatusSnapshot,
} from '@/types/portal'
import { matchBindingLuckperms } from './player-profile-helpers'

const props = defineProps<{
  isViewingSelf: boolean
  summary: PlayerSummary | null
  minecraft: PlayerMinecraftResponse | null
  stats: PlayerStatsResponse | null
  formatDateTime: (value: string | null | undefined) => string
  formatMetricValue: (value: number, unit: string) => string
  region: PlayerRegionResponse | null
  statusSnapshot: PlayerStatusSnapshot | null
  formatIpLocation: (value: string | null | undefined) => string
  serverOptions: Array<{ id: string; displayName: string }>
}>()

const playerPortalStore = usePlayerPortalStore()
const toast = useToast()
const isRefreshingStats = ref(false)
const detailDialogOpen = ref(false)
const selectedBinding = ref<PlayerSummary['authmeBindings'][number] | null>(
  null,
)
const biographyEditorOpen = ref(false)
const composeDialogOpen = ref(false)
const allMessagesDialogOpen = ref(false)

const hasBiography = computed(() =>
  Boolean(playerPortalStore.biography?.markdown?.trim()),
)

const selectedBindingLuckperms = computed(() => {
  const binding = selectedBinding.value
  const luckperms = props.summary?.luckperms
  if (!binding || !luckperms) return null
  return (
    luckperms.find((entry) => matchBindingLuckperms(binding, entry)) ?? null
  )
})

function openBindingDetail(binding: PlayerSummary['authmeBindings'][number]) {
  selectedBinding.value = binding
  detailDialogOpen.value = true
}

function handleDetailDialogOpenChange(value: boolean) {
  detailDialogOpen.value = value
  if (!value) {
    selectedBinding.value = null
  }
}

const isViewerLogged = computed(() => Boolean(playerPortalStore.viewerId))

function handleBadgeClick() {
  allMessagesDialogOpen.value = true
}

async function handleStatsRefresh() {
  if (isRefreshingStats.value) return
  isRefreshingStats.value = true
  try {
    const period = props.stats?.period ?? '30d'
    await playerPortalStore.refreshStats(period)
    toast.add({ title: '游戏统计信息已刷新', color: 'primary' })
  } catch (error) {
    toast.add({
      title: '刷新失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  } finally {
    isRefreshingStats.value = false
  }
}

// 每个板块的加载/准备状态
const accountsReady = computed(() => Boolean(props.summary))
const messageBoardReady = computed(() => !playerPortalStore.loading)
const statsReady = computed(() => Boolean(props.stats))
const panelMaxHeight = (ready: boolean, collapsedHeight = 180) =>
  ready ? '2000px' : `${collapsedHeight}px`
</script>

<template>
  <div class="mt-8 grid gap-8 lg:grid-cols-[320px_1fr]">
    <div class="space-y-8 md:pt-6">
      <PlayerProfileHeroSection
        :summary="props.summary"
        :is-viewing-self="props.isViewingSelf"
      />
      <PlayerProfileInfoSection
        :summary="props.summary"
        :region="props.region"
        :status-snapshot="props.statusSnapshot"
        :minecraft="props.minecraft"
        :format-date-time="props.formatDateTime"
        :format-ip-location="props.formatIpLocation"
        :is-viewing-self="props.isViewingSelf"
        :biography="playerPortalStore.biography"
        @edit-biography="biographyEditorOpen = true"
      />
    </div>

    <div class="flex flex-col gap-4">
      <section>
        <div
          class="flex items-center justify-between px-1 text-lg text-slate-600 dark:text-slate-300 mb-1"
        >
          <span>游戏账户</span>
        </div>
        <div
          class="transition-[max-height] duration-300 ease-in-out"
          :style="{ maxHeight: panelMaxHeight(accountsReady, 220) }"
        >
          <div v-if="accountsReady" class="px-0 pb-1">
            <PlayerProfileAccountsSection
              :summary="props.summary"
              :format-date-time="props.formatDateTime"
              :format-ip-location="props.formatIpLocation"
              :is-player-logged="Boolean(playerPortalStore.logged)"
              @bindingSelected="openBindingDetail"
            />
          </div>
          <div
            v-else
            class="flex min-h-[120px] items-center justify-center px-1 pb-1 text-slate-500 dark:text-slate-400"
          >
            <UIcon name="i-lucide-loader-2" class="h-5 w-5 animate-spin" />
          </div>
        </div>
      </section>

      <section>
        <div
          class="flex items-center justify-between px-1 text-lg text-slate-600 dark:text-slate-300 mb-1"
        >
          <span>用户自述</span>

          <div class="flex items-center gap-2">
            <UButton
              size="xs"
              variant="soft"
              class="flex items-center gap-1"
              @click="allMessagesDialogOpen = true"
            >
              <UIcon name="i-lucide-messages-square" class="h-3 w-3" />
              所有留言
            </UButton>

            <UTooltip
              v-if="!isViewerLogged"
              text="登录后可留言,与他/她分享想法"
            >
              <span>
                <UButton size="xs" variant="soft" :disabled="!isViewerLogged">
                  <UIcon name="i-lucide-plus" class="h-3 w-3" />
                  留言
                </UButton>
              </span>
            </UTooltip>

            <UButton
              v-else
              size="xs"
              variant="soft"
              color="primary"
              class="flex items-center gap-1"
              @click="composeDialogOpen = true"
            >
              <UIcon name="i-lucide-plus" class="h-3 w-3" />
              写留言
            </UButton>
          </div>
        </div>

        <div
          class="transition-[max-height] duration-300 ease-in-out"
          :style="{ maxHeight: panelMaxHeight(messageBoardReady, 180) }"
        >
          <div v-if="messageBoardReady" class="flex flex-col gap-2 px-1 pb-2">
            <PlayerProfileMessageBoardSection
              :messages="playerPortalStore.messages"
              @badge-click="handleBadgeClick"
            />

            <PlayerProfileBioSection
              v-if="hasBiography"
              :biography="playerPortalStore.biography"
              :open="biographyEditorOpen"
              @update:open="(value) => (biographyEditorOpen = value)"
            />
          </div>
          <div
            v-else
            class="flex min-h-[120px] items-center justify-center px-1 pb-2 text-slate-500 dark:text-slate-400"
          >
            <UIcon name="i-lucide-loader-2" class="h-5 w-5 animate-spin" />
          </div>
        </div>
      </section>

      <div class="flex flex-col gap-4">
        <PlayerGameStatsPanel
          :stats="props.stats"
          :bindings="props.summary?.authmeBindings ?? []"
          :is-viewing-self="props.isViewingSelf"
          :refreshing="isRefreshingStats"
          @refresh="handleStatsRefresh"
        />
      </div>

      <section>
        <div
          class="flex items-center justify-between px-1 text-lg text-slate-600 dark:text-slate-300 mb-1"
        >
          <span>站内统计信息</span>
        </div>

        <div
          class="transition-[max-height] duration-300 ease-in-out"
          :style="{ maxHeight: panelMaxHeight(statsReady, 170) }"
        >
          <div v-if="statsReady" class="px-1 pb-1">
            <div class="grid gap-2 md:grid-cols-4">
              <div
                v-for="metric in props.stats?.metrics ?? []"
                :key="metric.id"
                class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white backdrop-blur dark:bg-slate-800"
              >
                <p class="text-xs text-slate-500 dark:text-slate-500">
                  {{ metric.label }}
                </p>
                <p class="text-xl font-semibold text-slate-900 dark:text-white">
                  {{ props.formatMetricValue(metric.value, metric.unit) }}
                </p>
              </div>
            </div>
          </div>
          <div
            v-else
            class="flex min-h-[120px] items-center justify-center px-1 pb-1 text-slate-500 dark:text-slate-400"
          >
            <UIcon name="i-lucide-loader-2" class="h-5 w-5 animate-spin" />
          </div>
        </div>
      </section>
    </div>

    <PlayerBindingDetailDialog
      :open="detailDialogOpen"
      :binding="selectedBinding"
      :luckperms-entry="selectedBindingLuckperms"
      :format-date-time="props.formatDateTime"
      :format-ip-location="props.formatIpLocation"
      :is-viewing-self="props.isViewingSelf"
      :server-options="props.serverOptions"
      @update:open="handleDetailDialogOpenChange"
    />

    <PlayerComposeMessageDialog
      :open="composeDialogOpen"
      :target-user-id="playerPortalStore.targetUserId"
      @update:open="(value) => (composeDialogOpen = value)"
    />

    <PlayerAllMessagesDialog
      :open="allMessagesDialogOpen"
      :messages="playerPortalStore.messages"
      :is-viewer-logged="isViewerLogged"
      :target-user-id="playerPortalStore.targetUserId"
      :viewer-id="playerPortalStore.viewerId"
      :format-date-time="props.formatDateTime"
      @update:open="(value) => (allMessagesDialogOpen = value)"
    />
  </div>
</template>
