import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createHead } from '@unhead/vue/client'
import ui from '@nuxt/ui/vue-plugin'
import { addCollection } from '@iconify/vue'
import lucideIcons from '@iconify-json/lucide/icons.json'

import router from './router'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { useFeatureStore } from '@/stores/feature'

import './assets/styles/tailwind.css'
import './assets/styles/style.css'

import App from './App.vue'
import { THEME_KEY } from 'vue-echarts'

addCollection(lucideIcons)

import { use as echartsUse, registerTheme } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from 'echarts/components'
echartsUse([
  CanvasRenderer,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
])

const ECHARTS_FONT_STACK =
  "'Bricolage Grotesque', 'Helvetica Neue', 'Helvetica', 'Roboto', 'BlinkMacSystemFont', 'MiSans', 'HarmonyOS Sans SC', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', '微软雅黑', Arial, sans-serif"

registerTheme('hyd-font', {
  textStyle: {
    fontFamily: ECHARTS_FONT_STACK,
  },
  title: {
    textStyle: { fontFamily: ECHARTS_FONT_STACK },
    subtextStyle: { fontFamily: ECHARTS_FONT_STACK },
  },
  legend: {
    textStyle: { fontFamily: ECHARTS_FONT_STACK },
  },
  tooltip: {
    textStyle: { fontFamily: ECHARTS_FONT_STACK },
  },
  categoryAxis: {
    axisLabel: { fontFamily: ECHARTS_FONT_STACK },
    nameTextStyle: { fontFamily: ECHARTS_FONT_STACK },
  },
  valueAxis: {
    axisLabel: { fontFamily: ECHARTS_FONT_STACK },
    nameTextStyle: { fontFamily: ECHARTS_FONT_STACK },
  },
  timeAxis: {
    axisLabel: { fontFamily: ECHARTS_FONT_STACK },
    nameTextStyle: { fontFamily: ECHARTS_FONT_STACK },
  },
  logAxis: {
    axisLabel: { fontFamily: ECHARTS_FONT_STACK },
    nameTextStyle: { fontFamily: ECHARTS_FONT_STACK },
  },
})

const app = createApp(App)
const pinia = createPinia()
const head = createHead()

app.use(pinia)
app.use(head)
app.use(router)
app.use(ui)

const uiStore = useUiStore(pinia)
uiStore.hydrateTheme()

const featureStore = useFeatureStore(pinia)
void featureStore.initialize()

void useAuthStore(pinia).initialize()

app.provide(THEME_KEY, 'hyd-font')

app.mount('#app')
