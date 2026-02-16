import { useEffect, useState } from 'react';
import { app, pages } from '@microsoft/teams-js';
import { FluentProvider, webDarkTheme, webLightTheme, teamsHighContrastTheme } from '@fluentui/react-components';
import { Whiteboard } from './components/Whiteboard';

type ThemeName = 'dark' | 'default' | 'contrast';

function Get_Fluent_Theme(theme_name: ThemeName) {
	switch (theme_name) {
		case 'dark': return webDarkTheme;
		case 'contrast': return teamsHighContrastTheme;
		default: return webLightTheme;
	}
}

export function App() {
	const [is_initialized, set_initialized] = useState(false);
	const [is_config_frame, set_config_frame] = useState(false);
	const [theme_name, set_theme_name] = useState<ThemeName>('dark');
	const [is_in_teams, set_in_teams] = useState(false);

	useEffect(() => {
		async function Init_Teams() {
			try {
				// Race against a timeout — Teams SDK can hang if not in an iframe
				const timeout = new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error('Teams SDK timeout')), 3000)
				);
				await Promise.race([app.initialize(), timeout]);

				set_in_teams(true);

				const context = await app.getContext();
				const teams_theme = context.app.theme as ThemeName;
				if (teams_theme) {
					set_theme_name(teams_theme);
				}

				app.registerOnThemeChangeHandler((new_theme: string) => {
					set_theme_name(new_theme as ThemeName);
				});

				// If Teams opened us as a config frame, register the save handler
				// and immediately mark as valid so the user can click "Save"
				if (context.page?.frameContext === 'settings') {
					set_config_frame(true);
					const base_url = window.location.origin;
					pages.config.registerOnSaveHandler((event) => {
						pages.config.setConfig({
							contentUrl: `${base_url}/index.html`,
							websiteUrl: `${base_url}/index.html`,
							entityId: 'whiteboard',
							suggestedDisplayName: 'Whitebored of Peace',
						});
						event.notifySuccess();
					});
					pages.config.setValidityState(true);
				}

				app.notifySuccess();
			}
			catch {
				// Not running in Teams or SDK timed out — standalone mode
				set_in_teams(false);
				const prefers_dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
				set_theme_name(prefers_dark ? 'dark' : 'default');
			}
			finally {
				set_initialized(true);
			}
		}

		Init_Teams();
	}, []);

	if (!is_initialized) {
		return (
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
				<p>Loading whiteboard...</p>
			</div>
		);
	}

	// Config frame — shown when adding the tab to a channel/meeting
	if (is_config_frame) {
		const fluent_theme = Get_Fluent_Theme(theme_name);
		return (
			<FluentProvider theme={fluent_theme} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
				<p>Click <strong>Save</strong> to add Whitebored of Peace to this tab.</p>
			</FluentProvider>
		);
	}

	const fluent_theme = Get_Fluent_Theme(theme_name);
	// Always use a white canvas — it's a whiteboard after all
	const tldraw_theme = 'light' as const;

	return (
		<FluentProvider theme={fluent_theme} style={{ position: 'fixed', inset: 0 }}>
			<Whiteboard
				tldraw_theme={tldraw_theme}
				is_in_teams={is_in_teams}
			/>
		</FluentProvider>
	);
}
