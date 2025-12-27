<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePlayerPortalStore } from '@/stores/user/playerPortal'
import { translateAuthErrorMessage } from '@/utils/errors/auth-errors'
import type { PlayerSummary } from '@/types/portal'
import { resolveBindingIdentifier } from './player-profile-helpers'

const props = defineProps<{
  summary: PlayerSummary | null
  isViewingSelf: boolean
}>()

const playerPortalStore = usePlayerPortalStore()
const toast = useToast()

const likeLoading = ref(false)

const likeSummary = computed(() => playerPortalStore.likes)
const likeCountDisplay = computed(() => likeSummary.value?.total ?? 0)
const hasLiked = computed(() => likeSummary.value?.viewerLiked ?? false)
const likeButtonDisabled = computed(() => {
  return (
    !props.summary ||
    likeLoading.value ||
    !playerPortalStore.targetUserId ||
    !playerPortalStore.viewerId
  )
})

const primaryMinecraftProfile = computed(() => {
  const profiles = props.summary?.minecraftProfiles ?? []
  return profiles.find((profile) => profile.isPrimary) ?? profiles[0] ?? null
})

const primaryAuthmeBinding = computed(
  () => props.summary?.authmeBindings?.[0] ?? null,
)

const primaryAuthmeIdentifier = computed(() =>
  resolveBindingIdentifier(primaryAuthmeBinding.value),
)

const primaryAvatarUrl = computed(() => {
  const identifier = primaryAuthmeIdentifier.value
  if (!identifier) return null
  return `https://mc-heads.hydcraft.cn/avatar/${encodeURIComponent(
    identifier,
  )}/64`
})

const fallbackAvatarUrl = computed(() => {
  return (
    props.summary?.avatarUrl ??
    props.summary?.image ??
    primaryAvatarUrl.value ??
    null
  )
})

const displayName = computed(() => {
  const summary = props.summary
  if (!summary) return null
  const name =
    summary.displayName?.trim() ||
    summary.name?.trim() ||
    summary.email?.trim() ||
    primaryMinecraftProfile.value?.nickname?.trim() ||
    primaryAuthmeBinding.value?.realname?.trim() ||
    primaryAuthmeBinding.value?.username?.trim()
  return name || null
})

async function handleLikeToggle() {
  if (likeLoading.value) return
  if (!playerPortalStore.targetUserId) return
  if (!playerPortalStore.viewerId) {
    return
  }
  likeLoading.value = true
  try {
    if (hasLiked.value) {
      await playerPortalStore.unlikePlayer({
        id: playerPortalStore.targetUserId,
      })
    } else {
      await playerPortalStore.likePlayer({
        id: playerPortalStore.targetUserId,
      })
    }
  } catch (error) {
    const description =
      error instanceof Error
        ? translateAuthErrorMessage(error.message)
        : '点赞失败'
    toast.add({
      title: '点赞失败',
      description,
      color: 'error',
    })
  } finally {
    likeLoading.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-col gap-3">
      <div class="flex gap-2 select-none">
        <template v-if="props.summary">
          <div
            class="flex h-18 w-18 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-700/60"
          >
            <img
              v-if="fallbackAvatarUrl"
              :src="fallbackAvatarUrl"
              :alt="displayName ?? props.summary.email"
              class="h-full w-full object-cover"
            />
            <UIcon v-else name="i-lucide-user-round" class="h-8 w-8" />
          </div>

          <img
            v-if="primaryAvatarUrl"
            :src="primaryAvatarUrl"
            :alt="
              primaryAuthmeIdentifier ??
              primaryAuthmeBinding?.username ??
              'MC Avatar'
            "
            class="h-18 w-18 rounded-xl border border-slate-200 object-cover dark:border-slate-700 shadow"
          />
        </template>
        <template v-else>
          <USkeleton
            class="h-18 w-18 rounded-xl border border-slate-200 bg-slate-200/70 dark:bg-slate-700"
          />
          <USkeleton
            class="h-18 w-18 rounded-xl border border-slate-200 bg-slate-200/70 dark:bg-slate-700"
          />
        </template>

        <div class="flex items-center">
          <UTooltip
            v-if="props.summary?.authmeBindings?.length > 1"
            :text="`共 ${props.summary?.authmeBindings?.length ?? 0} 个账户`"
          >
            <UButton
              class="w-6 h-6 flex justify-center items-center rounded-full mt-auto"
              variant="ghost"
              size="sm"
            >
              ...
            </UButton>
          </UTooltip>
        </div>
      </div>

      <div>
        <div
          class="flex items-center gap-1 font-semibold text-slate-700 dark:text-white"
        >
          <template v-if="props.summary">
            <div>
              <span class="text-2xl">
                {{
                  displayName ||
                  primaryMinecraftProfile?.nickname ||
                  primaryAuthmeBinding?.realname ||
                  props.summary.email
                }}
              </span>
              <span
                class="mx-2 select-none"
                v-if="
                  primaryAuthmeBinding?.realname &&
                  primaryMinecraftProfile?.nickname
                "
                >/</span
              >
              <span
                v-if="
                  primaryAuthmeBinding?.realname &&
                  primaryMinecraftProfile?.nickname
                "
              >
                {{ primaryAuthmeBinding?.realname }}
              </span>
            </div>

            <div class="flex items-center ml-1">
              <UButton
                variant="soft"
                color="error"
                class="flex justify-center items-center px-1 py-0.5"
                size="xs"
                :loading="likeLoading"
                :disabled="likeButtonDisabled"
                @click="handleLikeToggle"
              >
                <UIcon name="i-lucide-heart" class="h-3 w-3" />
                <span>{{ likeCountDisplay }}</span>
              </UButton>
            </div>
          </template>
          <template v-else>
            <div class="flex-1 flex flex-col gap-1">
              <USkeleton class="h-6 w-32" />
              <USkeleton class="h-4 w-24" />
            </div>
            <div class="flex items-center gap-2">
              <USkeleton class="h-6 w-6 rounded-full" />
              <USkeleton class="h-6 w-6 rounded-full" />
            </div>
          </template>
        </div>

        <template v-if="props.summary">
          <div class="text-xs text-slate-500 dark:text-slate-500 mt-1">
            {{ props.summary.id }}
          </div>
        </template>
        <template v-else>
          <USkeleton class="h-4 w-40 mt-1" />
        </template>

        <template v-if="props.summary?.rbacLabels?.length">
          <div class="flex flex-wrap gap-1 mt-1">
            <UBadge
              v-for="label in props.summary?.rbacLabels"
              :key="label.id"
              variant="soft"
              size="sm"
              :style="
                label.color
                  ? {
                      backgroundColor: label.color,
                      color: '#ffffff',
                      borderColor: 'transparent',
                    }
                  : undefined
              "
            >
              {{ label.name || label.key }}
            </UBadge>
          </div>
        </template>
        <template v-else-if="!props.summary">
          <div class="flex gap-2 mt-1">
            <USkeleton class="h-5 w-16" />
            <USkeleton class="h-5 w-16" />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
