import React from 'react';
import ReactDOM from 'react-dom/client';

// If this page loaded with an auth code in the hash (MSAL popup redirect),
// don't mount the app. MSAL in the parent window reads the popup URL directly.
const h = window.location.hash;
if (h && (h.indexOf('code=') !== -1 || h.indexOf('error=') !== -1)) {
	document.getElementById('root')!.innerHTML = '<div style="padding:20px;text-align:center;color:#666">Signing in\u2026</div>';
} else {
	import('./App').then(({ App }) => {
		ReactDOM.createRoot(document.getElementById('root')!).render(
			<React.StrictMode>
				<App />
			</React.StrictMode>,
		);
	});
}
