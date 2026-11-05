import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // Клиент всегда на порту 5173: именно этот адрес разрешён в CORS на сервере
  server: { port: 5173, strictPort: true },
})
