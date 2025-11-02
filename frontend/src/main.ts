import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createHead } from '@unhead/vue/client'
import ui from '@nuxt/ui/vue-plugin'

import router from './router'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'

import './assets/styles/tailwind.css'
import './assets/styles/style.css'

import App from './App.vue'

const app = createApp(App)
const pinia = createPinia()
const head = createHead()

app.use(pinia)
app.use(head)
app.use(router)
app.use(ui)

const uiStore = useUiStore(pinia)
uiStore.hydrateTheme()

void useAuthStore(pinia).initialize()

app.mount('#app')
