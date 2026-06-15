import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // バックエンドの /assets/ (データ画像配信) と衝突しないように出力先を変更
    assetsDir: 'static',
  },
})
