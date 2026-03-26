import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src'),
		},
	},
	server: {
		proxy: {
			'/api': {
				target: 'http://localhost:4300',
				changeOrigin: true,
				cookieDomainRewrite: '',
			},
			'/health': {
				target: 'http://localhost:4300',
				changeOrigin: true,
				cookieDomainRewrite: '',
			},
		},
	},
})
