import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

export default defineConfig({
	plugins: [react()],
	publicDir: 'public',
	server: {
		port: 53000,
		https: {
			key: fs.readFileSync(path.resolve(__dirname, 'certs/localhost+2-key.pem')),
			cert: fs.readFileSync(path.resolve(__dirname, 'certs/localhost+2.pem')),
		},
		headers: {
			// Allow Teams to embed this page in an iframe
			'Content-Security-Policy': "frame-ancestors https://teams.microsoft.com https://*.teams.microsoft.com https://*.microsoft365.com https://*.office.com https://*.skype.com https://localhost:53000",
		},
	},
	build: {
		outDir: 'dist',
		sourcemap: true,
	},
});
