import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3015,
    host: '0.0.0.0',
    // Workspace path is a junction (Harees Laptop -> Aarees Laptop).
    // Vite realpath-resolves files to the target and then blocks them.
    fs: {
      strict: false,
      allow: [
        'D:/Harees Laptop/DutyDesk/admin-dashboard',
        'D:/Aarees Laptop/DutyDesk/admin-dashboard',
      ],
    },
  },
})
