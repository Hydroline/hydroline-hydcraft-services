<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import Cropper from 'cropperjs'
import '@/assets/cropper.css'

let cropperModalInstance = 0

const props = withDefaults(
  defineProps<{
    open: boolean
    imageUrl: string | null
    fileName?: string | null
    submitting?: boolean
    aspectRatio?: number
    confirmLabel?: string
    width?: number
  }>(),
  {
    imageUrl: null,
    submitting: false,
    aspectRatio: 1,
    confirmLabel: '保存裁剪',
    width: 512,
  },
)

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'confirm', file: File): void
}>()

const imageRef = ref<HTMLImageElement | null>(null)
const cropper = ref<Cropper | null>(null)
const ready = ref(false)
const exporting = ref(false)
const internalError = ref<string | null>(null)
const instanceId = ++cropperModalInstance
const previewSelector = `[data-avatar-preview-id="${instanceId}"]`

const canConfirm = computed(
  () => ready.value && !exporting.value && !props.submitting,
)

function destroyCropper() {
  if (cropper.value) {
    cropper.value.destroy()
    cropper.value = null
  }
  ready.value = false
}

function waitForNextFrames(count = 2) {
  if (typeof window === 'undefined') {
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => {
    function step(frame = 0) {
      if (frame >= count) {
        resolve()
        return
      }
      requestAnimationFrame(() => step(frame + 1))
    }
    step()
  })
}

async function initializeCropperFromImage() {
  if (!props.open || !props.imageUrl || !imageRef.value) return
  await nextTick()
  await waitForNextFrames()
  cropper.value?.destroy()
  internalError.value = null
  ready.value = false
  try {
    cropper.value = new Cropper(imageRef.value, {
      aspectRatio: props.aspectRatio ?? 1,
      viewMode: 2,
      dragMode: 'move',
      background: false,
      responsive: true,
      preview: previewSelector,
      autoCropArea: 1,
      movable: true,
      zoomable: true,
      rotatable: true,
      scalable: false,
      minCropBoxWidth: 80,
      minCropBoxHeight: 80,
      ready: () => {
        ready.value = true
      },
    })

    ready.value = true
  } catch (error) {
    console.error('[avatar-cropper] init failed', error)
    internalError.value = '裁剪器初始化失败，请重试'
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      destroyCropper()
    }
  },
)

watch(
  () => props.imageUrl,
  () => {
    destroyCropper()
    internalError.value = null
  },
)

onBeforeUnmount(() => {
  destroyCropper()
})

function handleImageError() {
  internalError.value = '图片加载失败，请重试'
  destroyCropper()
}

function updateOpen(value: boolean) {
  emit('update:open', value)
}

function baseFileName() {
  const name = props.fileName?.trim()
  if (!name) return 'avatar'
  const withoutExt = name.replace(/\.[^.]+$/, '')
  return withoutExt.length > 0 ? withoutExt : 'avatar'
}

function handleAction(
  action: 'zoomIn' | 'zoomOut' | 'rotateL' | 'rotateR' | 'reset',
) {
  if (!cropper.value) return
  switch (action) {
    case 'zoomIn':
      cropper.value.zoom(0.1)
      break
    case 'zoomOut':
      cropper.value.zoom(-0.1)
      break
    case 'rotateL':
      cropper.value.rotate(-90)
      break
    case 'rotateR':
      cropper.value.rotate(90)
      break
    case 'reset':
      cropper.value.reset()
      break
  }
}

function handleConfirm() {
  if (!cropper.value || exporting.value) return
  internalError.value = null
  exporting.value = true
  try {
    const canvas = cropper.value.getCroppedCanvas({
      width: props.width,
      height: props.width,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
    })
    canvas.toBlob(
      (blob) => {
        exporting.value = false
        if (!blob) {
          internalError.value = '裁剪失败，请重试'
          return
        }
        const file = new File([blob], `${baseFileName()}.png`, {
          type: blob.type || 'image/png',
          lastModified: Date.now(),
        })
        emit('confirm', file)
      },
      'image/png',
      0.92,
    )
  } catch (error) {
    exporting.value = false
    console.error('[avatar-cropper] export failed', error)
    internalError.value = '导出失败，请重试'
  }
}
</script>

<template>
  <UModal
    :open="props.open && Boolean(props.imageUrl)"
    :ui="{
      content:
        'w-full max-w-4xl w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)]',
    }"
    @update:open="updateOpen"
  >
    <template #content>
      <UCard :ui="{ body: 'space-y-6' }">
        <template #header>
          <div class="flex flex-col gap-1">
            <p class="text-base font-semibold text-slate-900 dark:text-white">
              裁剪头像
            </p>
          </div>
        </template>

        <div
          class="grid gap-6 md:grid-cols-[minmax(0,1fr)_220px] md:items-start"
        >
          <div
            class="min-h-80 rounded-2xl border border-slate-200/70 p-3 dark:border-slate-700/70"
          >
            <div
              v-if="props.imageUrl"
              data-avatar-cropper-stage
              class="relative w-full overflow-hidden rounded-xl bg-slate-50 dark:bg-slate-800 h-80 sm:h-[360px] md:h-[420px] lg:h-[480px]"
            >
              <img
                ref="imageRef"
                :src="props.imageUrl"
                alt="待裁剪头像"
                class="block h-full w-full select-none object-contain"
                @load="initializeCropperFromImage"
                @error="handleImageError"
              />
              <div
                v-if="!ready"
                class="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-900/5 text-sm text-slate-500 dark:bg-slate-900/30 dark:text-slate-300"
              >
                图片加载中…
              </div>
            </div>
            <div
              v-else
              class="flex h-full min-h-[320px] items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            >
              请先选择一张图片
            </div>
          </div>

          <div class="flex flex-col gap-4">
            <div
              class="rounded-2xl border border-slate-200/70 p-3 dark:border-slate-700/70"
            >
              <div
                data-avatar-preview
                :data-avatar-preview-id="instanceId"
                class="overflow-hidden mx-auto h-32 w-32 rounded-xl bg-slate-100 dark:bg-slate-800 sm:h-36 sm:w-36 md:h-40 md:w-40"
              ></div>
              <p class="pt-3 text-xs text-slate-500 dark:text-slate-400">
                预览（1:1）
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton
                icon="i-lucide-zoom-in"
                variant="ghost"
                size="sm"
                @click="handleAction('zoomIn')"
              >
                放大
              </UButton>
              <UButton
                icon="i-lucide-zoom-out"
                variant="ghost"
                size="sm"
                @click="handleAction('zoomOut')"
              >
                缩小
              </UButton>
              <UButton
                icon="i-lucide-rotate-ccw"
                variant="ghost"
                size="sm"
                @click="handleAction('rotateL')"
              >
                左旋
              </UButton>
              <UButton
                icon="i-lucide-rotate-cw"
                variant="ghost"
                size="sm"
                @click="handleAction('rotateR')"
              >
                右旋
              </UButton>
              <UButton
                icon="i-lucide-refresh-ccw"
                variant="ghost"
                size="sm"
                @click="handleAction('reset')"
              >
                重置
              </UButton>
            </div>
            <p
              v-if="internalError"
              class="text-sm text-danger-500 dark:text-danger-400"
            >
              {{ internalError }}
            </p>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" @click="updateOpen(false)">取消</UButton>
            <UButton
              color="primary"
              :disabled="!canConfirm"
              :loading="props.submitting || exporting"
              @click="handleConfirm"
            >
              {{ props.confirmLabel }}
            </UButton>
          </div>
        </template>
      </UCard>
    </template>
  </UModal>
</template>

<style scoped>
[data-avatar-cropper-stage] {
  position: relative;
}

[data-avatar-cropper-stage] :deep(.cropper-container) {
  width: 100% !important;
  height: 100% !important;
}

[data-avatar-cropper-stage] :deep(.cropper-wrap-box),
[data-avatar-cropper-stage] :deep(.cropper-canvas) {
  width: 100% !important;
  height: 100% !important;
}

[data-avatar-cropper-stage] :deep(.cropper-view-box),
[data-avatar-cropper-stage] :deep(.cropper-face) {
  border-radius: 16px;
}

[data-avatar-preview] :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
