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
	const [theme_name, set_theme_name] = useState<ThemeName>('dark');
	const [is_in_teams, set_in_teams] = useState(false);

	useEffect(() => {
		async function Init_Teams() {
			try {
				await app.initialize();
				set_in_teams(true);

				const context = await app.getContext();
				const teams_theme = context.app.theme as ThemeName;
				if (teams_theme) {
					set_theme_name(teams_theme);
				}

				// Listen for theme changes
				app.registerOnThemeChangeHandler((new_theme: string) => {
					set_theme_name(new_theme as ThemeName);
				});

				// Notify Teams that the app has loaded
				pages.appButton?.onClick(() => {});
				app.notifySuccess();
			}
			catch {
				// Not running in Teams — standalone mode
				set_in_teams(false);

				// Respect system preference when standalone
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
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#1b1b1b', color: '#e0e0e0' }}>
				Loading whiteboard...
			</div>
		);
	}

	const fluent_theme = Get_Fluent_Theme(theme_name);
	const tldraw_theme = theme_name === 'default' ? 'light' : 'dark';

	return (
		<FluentProvider theme={fluent_theme} style={{ height: '100%' }}>
			<Whiteboard
				tldraw_theme={tldraw_theme}
				is_in_teams={is_in_teams}
			/>
		</FluentProvider>
	);
}
