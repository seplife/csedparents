import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base '/' : Vercel sert depuis la racine (csedparents.vercel.app/)
// Pour GitHub Pages (seplife.github.io/csedparents/), remettre base: '/csedparents/'
export default defineConfig({ base: '/', plugins: [react()] })

