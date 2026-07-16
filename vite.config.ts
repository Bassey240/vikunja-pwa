import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {resolveBuildId} from './server/build-info.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Deploy stamp if present (docker builds have no git), else live git state.
const buildId = resolveBuildId({
	fileCandidates: [path.resolve(__dirname, 'build-info.json')],
	gitCwd: __dirname,
})

export default defineConfig({
	plugins: [react()],
	define: {
		__CLIENT_BUILD_ID__: JSON.stringify(buildId),
	},
	// The project-root `.env` holds backend secrets read by
	// scripts/start-server.mjs and has no VITE_* vars. Point envDir at an in-repo
	// dir with no `.env` so Vite's loadEnv() never reads the secrets file (and a
	// sandboxed runner never trips on it); VITE_TARGET still arrives via
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
