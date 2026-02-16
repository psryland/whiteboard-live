import type { CanvasState } from '../canvas/types';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const APP_FOLDER = '/me/drive/special/approot';
const FILE_EXT = '.wbl.json';

export interface CloudBoard {
	id: string;
	name: string;
	file_name: string;
	modified: string;
	size: number;
	web_url?: string;
}

async function Graph_Fetch(token: string, url: string, init?: RequestInit): Promise<Response> {
	const res = await fetch(url, {
		...init,
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			...init?.headers,
		},
	});
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`Graph API ${res.status}: ${text}`);
	}
	return res;
}

/** Ensure the app folder exists (OneDrive creates /Apps/Whiteboard Live/ automatically via approot). */
async function Ensure_App_Folder(token: string): Promise<void> {
	// Accessing approot auto-creates it; just check it exists
	await Graph_Fetch(token, `${GRAPH_BASE}${APP_FOLDER}`);
}

/** List all .wbl.json boards in the app folder. */
export async function List_Cloud_Boards(token: string): Promise<CloudBoard[]> {
	await Ensure_App_Folder(token);
	const res = await Graph_Fetch(token, `${GRAPH_BASE}${APP_FOLDER}/children?$filter=endsWith(name,'${FILE_EXT}')&$orderby=lastModifiedDateTime desc`);
	const data = await res.json();
	return (data.value || []).map((item: any) => ({
		id: item.id,
		name: item.name.replace(FILE_EXT, ''),
		file_name: item.name,
		modified: item.lastModifiedDateTime,
		size: item.size,
		web_url: item.webUrl,
	}));
}

/** Load a board by its OneDrive item ID. */
export async function Load_Cloud_Board(token: string, item_id: string): Promise<CanvasState> {
	const res = await Graph_Fetch(token, `${GRAPH_BASE}/me/drive/items/${item_id}/content`);
	return await res.json();
}

/** Save a board to the app folder (creates or updates by file name). */
export async function Save_Cloud_Board(token: string, name: string, state: CanvasState, existing_id?: string): Promise<CloudBoard> {
	const file_name = Sanitize_Filename(name) + FILE_EXT;
	const body = JSON.stringify(state);

	let url: string;
	if (existing_id) {
		// Update existing file content
		url = `${GRAPH_BASE}/me/drive/items/${existing_id}/content`;
	} else {
		// Create or replace by path
		url = `${GRAPH_BASE}${APP_FOLDER}:/${file_name}:/content`;
	}

	const res = await Graph_Fetch(token, url, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body,
	});
	const item = await res.json();
	return {
		id: item.id,
		name: name,
		file_name: item.name,
		modified: item.lastModifiedDateTime,
		size: item.size,
		web_url: item.webUrl,
	};
}

/** Rename a cloud board (changes the file name in OneDrive). */
export async function Rename_Cloud_Board(token: string, item_id: string, new_name: string): Promise<void> {
	const file_name = Sanitize_Filename(new_name) + FILE_EXT;
	await Graph_Fetch(token, `${GRAPH_BASE}/me/drive/items/${item_id}`, {
		method: 'PATCH',
		body: JSON.stringify({ name: file_name }),
	});
}

/** Delete a cloud board by item ID. */
export async function Delete_Cloud_Board(token: string, item_id: string): Promise<void> {
	await fetch(`${GRAPH_BASE}/me/drive/items/${item_id}`, {
		method: 'DELETE',
		headers: { Authorization: `Bearer ${token}` },
	});
}

// ── SharePoint helpers ──

export interface SharePointSite {
	id: string;
	name: string;
	web_url: string;
}

/** Search for SharePoint sites the user can access. */
export async function Search_Sites(token: string, query: string): Promise<SharePointSite[]> {
	const res = await Graph_Fetch(token, `${GRAPH_BASE}/sites?search=${encodeURIComponent(query)}&$top=10`);
	const data = await res.json();
	return (data.value || []).map((s: any) => ({
		id: s.id,
		name: s.displayName || s.name,
		web_url: s.webUrl,
	}));
}

/** Save a board to a SharePoint site's default document library. */
export async function Save_To_SharePoint(token: string, site_id: string, name: string, state: CanvasState): Promise<CloudBoard> {
	const file_name = Sanitize_Filename(name) + FILE_EXT;
	const body = JSON.stringify(state);

	// Get the default drive for this site
	const drive_res = await Graph_Fetch(token, `${GRAPH_BASE}/sites/${site_id}/drive`);
	const drive = await drive_res.json();

	const url = `${GRAPH_BASE}/drives/${drive.id}/root:/Whiteboard Live/${file_name}:/content`;
	const res = await Graph_Fetch(token, url, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body,
	});
	const item = await res.json();
	return {
		id: item.id,
		name,
		file_name: item.name,
		modified: item.lastModifiedDateTime,
		size: item.size,
		web_url: item.webUrl,
	};
}

function Sanitize_Filename(name: string): string {
	// Remove characters not allowed in OneDrive file names
	return name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'Untitled Board';
}
