import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base : le site est servi depuis https://seplife.github.io/csedparents/
export default defineConfig({ base: '/csedparents/', plugins: [react()] })
