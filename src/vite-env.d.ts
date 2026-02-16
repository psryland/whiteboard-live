/// <reference types="vite/client" />

declare module '*.css';

interface ImportMetaEnv {
	readonly VITE_ENTRA_CLIENT_ID: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
