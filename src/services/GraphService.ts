import type { CanvasState } from '../canvas/types';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const APP_FOLDER_NAME = 'Whiteboard Live';
const FILE_EXT = '.wbl.json';

// Cache the app folder ID after first lookup
let cached_folder_id: string | null = null;

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

/** Get or create the app folder in OneDrive root. */
async function Get_App_Folder_Id(token: string): Promise<string> {
	if (cached_folder_id) return cached_folder_id;

	// Try to find existing folder
	try {
		const res = await Graph_Fetch(token, `${GRAPH_BASE}/me/drive/root:/${APP_FOLDER_NAME}`);
		const folder = await res.json();
		cached_folder_id = folder.id;
		return folder.id;
	} catch {
		// Folder doesn't exist — create it
		const res = await Graph_Fetch(token, `${GRAPH_BASE}/me/drive/root/children`, {
			method: 'POST',
			body: JSON.stringify({
				name: APP_FOLDER_NAME,
				folder: {},
				'@microsoft.graph.conflictBehavior': 'fail',
			}),
		});
		const folder = await res.json();
		cached_folder_id = folder.id;
		return folder.id;
	}
}

/** List all .wbl.json boards in the app folder. */
export async function List_Cloud_Boards(token: string): Promise<CloudBoard[]> {
	const folder_id = await Get_App_Folder_Id(token);
	const res = await Graph_Fetch(token, `${GRAPH_BASE}/me/drive/items/${folder_id}/children`);
	const data = await res.json();
	const boards = (data.value || []).filter((item: any) => item.name?.endsWith(FILE_EXT));
	return boards.map((item: any) => ({
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
		url = `${GRAPH_BASE}/me/drive/items/${existing_id}/content`;
	} else {
		url = `${GRAPH_BASE}/me/drive/root:/${APP_FOLDER_NAME}/${file_name}:/content`;
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
