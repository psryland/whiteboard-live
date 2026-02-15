import { Tldraw, TLUiComponents } from 'tldraw';
import 'tldraw/tldraw.css';
import '../styles/whiteboard.css';

interface WhiteboardProps {
	tldraw_theme: 'light' | 'dark';
	is_in_teams: boolean;
}

// Hide tldraw's debug UI in production
const custom_components: Partial<TLUiComponents> = {
	DebugPanel: null,
	DebugMenu: null,
};

export function Whiteboard({ tldraw_theme }: WhiteboardProps) {
	return (
		<div className="whiteboard-container">
			<Tldraw
				persistenceKey="teams-whiteboard"
				components={custom_components}
				inferDarkMode={false}
				options={{
					maxPages: 1,
				}}
				onMount={(editor) => {
					// Apply the Teams theme
					editor.user.updateUserPreferences({ colorScheme: tldraw_theme });
				}}
			/>
		</div>
	);
}
