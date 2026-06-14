/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_TARGET?: 'pwa'
}

interface ImportMeta {
	readonly env: ImportMetaEnv
}
