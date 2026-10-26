import { createApp } from 'vue'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import EduMindPreset from './theme/edumind-preset'
import 'primeicons/primeicons.css'
import './assets/edumind-tokens.css'
import './style.css'
import App from './App.vue'
import router from './router'
import { aoExpirarSessao } from './services/http'
import { useSessao } from './composables/useSessao'

// Sessão expirada no meio do uso (401): volta ao login e, depois, à mesma tela.
aoExpirarSessao(() => {
  useSessao().esquecer()
  const atual = router.currentRoute.value
  if (!atual.meta.publica) router.push({ name: 'entrar', query: { voltar: atual.fullPath } })
})

const app = createApp(App)

app.use(router)
app.use(PrimeVue, { theme: { preset: EduMindPreset, options: { darkModeSelector: false } } })
app.use(ToastService)

app.mount('#app')
