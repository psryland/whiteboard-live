import { Configuration, LogLevel } from '@azure/msal-browser';

// Entra ID app registration client ID — set via environment variable at build time
const CLIENT_ID = import.meta.env.VITE_ENTRA_CLIENT_ID || '';

// The SWA redirect URI
const REDIRECT_URI = window.location.origin;

export const msal_config: Configuration = {
	auth: {
		clientId: CLIENT_ID,
		authority: 'https://login.microsoftonline.com/common',
		redirectUri: REDIRECT_URI + '/auth-redirect.html',
		postLogoutRedirectUri: REDIRECT_URI,
	},
	cache: {
		cacheLocation: 'localStorage',
	},
	system: {
		loggerOptions: {
			logLevel: LogLevel.Warning,
			piiLoggingEnabled: false,
		},
	},
};

// Scopes needed for OneDrive + SharePoint file operations
export const graph_scopes = {
	files: ['Files.ReadWrite'],
	sharepoint: ['Sites.ReadWrite.All'],
	user: ['User.Read'],
};

// All scopes for login
export const login_scopes = [
	...graph_scopes.user,
	...graph_scopes.files,
];
