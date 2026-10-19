import { createApp } from 'vue'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import EduMindPreset from './theme/edumind-preset'
import 'primeicons/primeicons.css'
import './assets/edumind-tokens.css'
import './style.css'
import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(router)
app.use(PrimeVue, { theme: { preset: EduMindPreset, options: { darkModeSelector: false } } })
app.use(ToastService)

app.mount('#app')
