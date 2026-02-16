import { Component, useEffect, useState, type ReactNode } from 'react';
import { app, pages } from '@microsoft/teams-js';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { PublicClientApplication } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { msal_config } from './auth/MsalConfig';
import { Canvas } from './canvas/Canvas';

const msal_instance = new PublicClientApplication(msal_config);

// Initialize MSAL and process any pending auth redirect (e.g. when popup was blocked)
const msal_init = msal_instance.initialize().then(() =>
	msal_instance.handleRedirectPromise().catch(() => null)
);

// Error boundary to catch and display React rendering errors
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
	state = { error: null as Error | null };

	static getDerivedStateFromError(error: Error) {
		return { error };
	}

	render() {
		if (this.state.error) {
			return (
				<div style={{ padding: 20, color: 'red', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
					<h2>Whiteboard Error</h2>
					<p>{this.state.error.message}</p>
					<pre>{this.state.error.stack}</pre>
				</div>
			);
		}
		return this.props.children;
	}
}

export function App() {
	const [is_config_frame, set_config_frame] = useState(false);
	const [msal_ready, set_msal_ready] = useState(false);

	useEffect(() => {
		msal_init.then(() => {
			// Clean up any leftover auth hash (redirect fallback)
			if (window.location.hash.includes('code=')) {
				window.location.hash = '';
				history.replaceState(null, '', window.location.pathname);
			}
			set_msal_ready(true);
		});
	}, []);

	useEffect(() => {
		async function Init_Teams() {
			try {
				const timeout = new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error('Teams SDK timeout')), 3000)
				);
				await Promise.race([app.initialize(), timeout]);

				const context = await app.getContext();

				// If Teams opened us as a config frame, register the save handler
				if (context.page?.frameContext === 'settings') {
					set_config_frame(true);
					const base_url = window.location.origin;
					pages.config.registerOnSaveHandler((event) => {
						pages.config.setConfig({
							contentUrl: `${base_url}/index.html`,
							websiteUrl: `${base_url}/index.html`,
							entityId: 'whiteboard',
							suggestedDisplayName: 'Whiteboard Live',
						});
						event.notifySuccess();
					});
					pages.config.setValidityState(true);
				}

				app.notifySuccess();
			}
			catch {
				// Not running in Teams — standalone mode
			}
		}

		Init_Teams();
	}, []);

	if (!msal_ready) return null;

	if (is_config_frame) {
		return (
			<FluentProvider theme={webLightTheme} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
				<p>Click <strong>Save</strong> to add Whiteboard Live to this tab.</p>
			</FluentProvider>
		);
	}

	return (
		<MsalProvider instance={msal_instance}>
			<ErrorBoundary>
				<Canvas />
			</ErrorBoundary>
		</MsalProvider>
	);
}
