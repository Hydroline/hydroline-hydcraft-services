import { defineStore } from 'pinia'

type ThemeMode = 'light' | 'dark' | 'system'

const THEME_KEY = 'hydroline.themeMode'

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement
  const resolved = mode === 'system' ? getSystemTheme() : mode
  root.classList.toggle('dark', resolved === 'dark')
  root.dataset.theme = resolved
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') {
    return 'light'
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export const useUiStore = defineStore('ui', {
  state: () => ({
    loadingCount: 0,
    themeMode:
      (typeof window !== 'undefined'
        ? (localStorage.getItem(THEME_KEY) as ThemeMode | null)
        : null) ?? 'system',
    loginDialogOpen: false,
    heroInView: true,
    heroActiveDescription: '',
    heroActiveSubtitle: '',
    previewMode: false,
  }),
  getters: {
    isLoading(state) {
      return state.loadingCount > 0
    },
    resolvedTheme(state): 'light' | 'dark' {
      if (state.themeMode === 'system') {
        return getSystemTheme()
      }
      return state.themeMode
    },
  },
  actions: {
    startLoading() {
      this.loadingCount += 1
    },
    stopLoading() {
      this.loadingCount = Math.max(0, this.loadingCount - 1)
    },
    setTheme(mode: ThemeMode) {
      this.themeMode = mode
      if (typeof window !== 'undefined') {
        localStorage.setItem(THEME_KEY, mode)
        applyTheme(mode)
      }
    },
    hydrateTheme() {
      if (typeof window === 'undefined') {
        return
      }
      applyTheme(this.themeMode)
      window
        .matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', () => {
          if (this.themeMode === 'system') {
            applyTheme('system')
          }
        })
    },
    openLoginDialog() {
      this.loginDialogOpen = true
    },
    closeLoginDialog() {
      this.loginDialogOpen = false
    },
    setHeroInView(value: boolean) {
      this.heroInView = value
    },
    setHeroActiveDescription(description: string) {
      this.heroActiveDescription = description
    },
    setHeroActiveSubtitle(subtitle: string) {
      this.heroActiveSubtitle = subtitle
    },
  },
})
