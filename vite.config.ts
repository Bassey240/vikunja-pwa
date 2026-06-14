import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
	plugins: [react()],
	// The project-root `.env` is a symlink to a private-local file outside the
	// repo (backend secrets read by scripts/start-server.mjs). Sandboxed runners
	// can't follow that symlink out of the project dir, so Vite's loadEnv() dies
	// with EPERM. Point envDir at an in-repo dir with no `.env` — the frontend
	// has no VITE_* vars in that file anyway, and VITE_TARGET still arrives via
	// process.env. See vite-env/README.md.
	envDir: path.resolve(__dirname, 'vite-env'),
	build: {
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (!id.includes('node_modules')) {
						return undefined
					}

					if (id.includes('@dnd-kit/')) {
						return 'dnd-vendor'
					}

					if (
						id.includes('/react/') ||
						id.includes('/react-dom/') ||
						id.includes('/react-router') ||
						id.includes('/scheduler/')
					) {
						return 'react-vendor'
					}

					return 'vendor'
				},
			},
		},
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src'),
		},
	},
	server: {
		host: true,
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
