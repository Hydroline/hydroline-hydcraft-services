<script setup lang="ts">
import FeatureCard from './FeatureCard.vue'
import hydCraftImage from '@/assets/images/homepage_230809_owen.webp?base64'
import jianghuImage from '@/assets/images/homepage_240126_jianghu.webp?base64'
import qinjingImage from '@/assets/images/homepage_240126_qinjing.webp?base64'

withDefaults(
  defineProps<{
    railwayStatsText?: string
  }>(),
  {
    railwayStatsText: '',
  },
)
</script>

<template>
  <div class="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 md:grid-cols-3">
    <FeatureCard
      title="绝赞内测中"
      description="这三个卡片凑数的，后面再抠细节。"
      icon="i-lucide-flask-conical"
      :image="jianghuImage"
      theme="#dbeafe"
    />

    <FeatureCard
      title="铁路系统"
      description="原来两个周目加起来有 500+ 线路。"
      icon="i-lucide-train-front"
      :image="qinjingImage"
      theme="#dcfce7"
      to="/transportation/railway"
    />

    <FeatureCard
      title="玩家排行榜"
      description="哈哈，原来有人能 1000+ 小时啊。"
      icon="i-lucide-trophy"
      :image="hydCraftImage"
      theme="#fef3c7"
      to="/rank"
    />
  </div>
</template>
