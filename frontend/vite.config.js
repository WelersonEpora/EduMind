import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// O backend roda em outra porta em dev. O proxy evita CORS, como no AgroMind.
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/health': 'http://localhost:3000'
    }
  }
})
