import { useState, useEffect, useRef } from 'react';
import type { CanvasState } from './types';
import type { GraphAuth } from '../auth/useGraphToken';
import type { CloudBoard } from '../services/GraphService';
import {
	List_Cloud_Boards, Load_Cloud_Board, Save_Cloud_Board,
	Delete_Cloud_Board, Rename_Cloud_Board,
} from '../services/GraphService';

const BOARDS_INDEX_KEY = 'whitebored-boards-index';
const BOARD_PREFIX = 'whitebored-board-';

export interface BoardInfo {
	id: string;
	name: string;
	created_at: number;
	updated_at: number;
}

function Load_Board_Index(): BoardInfo[] {
	try {
		const raw = localStorage.getItem(BOARDS_INDEX_KEY);
		return raw ? JSON.parse(raw) : [];
	} catch { return []; }
}

function Save_Board_Index(boards: BoardInfo[]): void {
	localStorage.setItem(BOARDS_INDEX_KEY, JSON.stringify(boards));
}

function Generate_Board_Id(): string {
	return 'b_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

interface BoardPanelProps {
	is_open: boolean;
	on_toggle: () => void;
	current_state: CanvasState;
	on_load_board: (state: CanvasState) => void;
	on_clear_canvas: () => void;
	current_board_id: string | null;
	on_board_id_change: (id: string) => void;
	current_board_name: string;
	on_board_name_change: (name: string) => void;
	graph_auth: GraphAuth;
}

export function BoardPanel({
	is_open,
	on_toggle,
	current_state,
	on_load_board,
	on_clear_canvas,
	current_board_id,
	on_board_id_change,
	current_board_name,
	on_board_name_change,
	graph_auth,
}: BoardPanelProps) {
	const [boards, set_boards] = useState<BoardInfo[]>(() => Load_Board_Index());
	const [editing_id, set_editing_id] = useState<string | null>(null);
	const [edit_name, set_edit_name] = useState('');
	const [editing_title, set_editing_title] = useState(false);
	const [title_draft, set_title_draft] = useState('');
	const [export_message, set_export_message] = useState<string | null>(null);
	const file_input_ref = useRef<HTMLInputElement>(null);

	// Cloud storage state
	const [cloud_boards, set_cloud_boards] = useState<CloudBoard[]>([]);
	const [cloud_loading, set_cloud_loading] = useState(false);
	const [cloud_error, set_cloud_error] = useState<string | null>(null);
	const [cloud_editing_id, set_cloud_editing_id] = useState<string | null>(null);
	const [cloud_edit_name, set_cloud_edit_name] = useState('');
	// Track whether the currently open board is a cloud board
	const [active_cloud_id, set_active_cloud_id] = useState<string | null>(null);

	useEffect(() => {
		set_boards(Load_Board_Index());
		// Refresh cloud boards when panel opens and user is signed in
		if (is_open && graph_auth.is_signed_in) Refresh_Cloud_Boards();
	}, [is_open]);

	async function Refresh_Cloud_Boards(): Promise<void> {
		set_cloud_loading(true);
		set_cloud_error(null);
		try {
			const token = await graph_auth.Get_Token();
			if (!token) { set_cloud_error('Not signed in'); return; }
			const items = await List_Cloud_Boards(token);
			set_cloud_boards(items);
		} catch (e: any) {
			set_cloud_error(e.message || 'Failed to load cloud boards');
		} finally {
			set_cloud_loading(false);
		}
	}

	async function Handle_Cloud_Save(): Promise<void> {
		const token = await graph_auth.Get_Token();
		if (!token) return;
		try {
			const saved = await Save_Cloud_Board(token, current_board_name, current_state, active_cloud_id ?? undefined);
			set_active_cloud_id(saved.id);
			set_export_message('Saved to OneDrive!');
			await Refresh_Cloud_Boards();
		} catch (e: any) {
			set_export_message('Cloud save failed: ' + (e.message || ''));
		}
	}

	async function Handle_Cloud_Save_As(): Promise<void> {
		const name = prompt('Cloud board name:', current_board_name || 'Untitled Board');
		if (!name) return;
		const token = await graph_auth.Get_Token();
		if (!token) return;
		try {
			const saved = await Save_Cloud_Board(token, name, current_state);
			set_active_cloud_id(saved.id);
			on_board_name_change(name);
			set_export_message('Saved to OneDrive!');
			await Refresh_Cloud_Boards();
		} catch (e: any) {
			set_export_message('Cloud save failed: ' + (e.message || ''));
		}
	}

	async function Handle_Cloud_Load(board: CloudBoard): Promise<void> {
		const token = await graph_auth.Get_Token();
		if (!token) return;
		try {
			const state = await Load_Cloud_Board(token, board.id);
			on_load_board(state);
			on_board_name_change(board.name);
			on_board_id_change('');
			set_active_cloud_id(board.id);
		} catch (e: any) {
			set_export_message('Load failed: ' + (e.message || ''));
		}
	}

	async function Handle_Cloud_Delete(board: CloudBoard): Promise<void> {
		if (!confirm(`Delete "${board.name}" from OneDrive?`)) return;
		const token = await graph_auth.Get_Token();
		if (!token) return;
		try {
			await Delete_Cloud_Board(token, board.id);
			if (active_cloud_id === board.id) set_active_cloud_id(null);
			await Refresh_Cloud_Boards();
		} catch (e: any) {
			set_export_message('Delete failed: ' + (e.message || ''));
		}
	}

	async function Handle_Cloud_Rename_Commit(): Promise<void> {
		if (!cloud_editing_id || !cloud_edit_name.trim()) { set_cloud_editing_id(null); return; }
		const token = await graph_auth.Get_Token();
		if (!token) return;
		try {
			await Rename_Cloud_Board(token, cloud_editing_id, cloud_edit_name.trim());
			set_cloud_editing_id(null);
			await Refresh_Cloud_Boards();
		} catch (e: any) {
			set_export_message('Rename failed: ' + (e.message || ''));
		}
	}

	// Clear transient messages
	useEffect(() => {
		if (!export_message) return;
		const t = setTimeout(() => set_export_message(null), 2500);
		return () => clearTimeout(t);
	}, [export_message]);

	function Handle_Save(): void {
		const now = Date.now();
		if (current_board_id) {
			// Update existing
			localStorage.setItem(BOARD_PREFIX + current_board_id, JSON.stringify(current_state));
			const updated = boards.map(b => b.id === current_board_id ? { ...b, name: current_board_name, updated_at: now } : b);
			Save_Board_Index(updated);
			set_boards(updated);
			set_export_message('Saved!');
		} else {
			// Save as new
			Handle_Save_As();
		}
	}

	function Handle_Save_As(): void {
		const name = prompt('Board name:', current_board_name || `Board ${boards.length + 1}`);
		if (!name) return;
		const id = Generate_Board_Id();
		const now = Date.now();
		localStorage.setItem(BOARD_PREFIX + id, JSON.stringify(current_state));
		const info: BoardInfo = { id, name, created_at: now, updated_at: now };
		const updated = [...boards, info];
		Save_Board_Index(updated);
		set_boards(updated);
		on_board_id_change(id);
		on_board_name_change(name);
		set_export_message('Saved!');
	}

	function Handle_Load(board: BoardInfo): void {
		const raw = localStorage.getItem(BOARD_PREFIX + board.id);
		if (!raw) return;
		try {
			const state = JSON.parse(raw) as CanvasState;
			on_load_board(state);
			on_board_id_change(board.id);
			on_board_name_change(board.name);
		} catch { /* ignore */ }
	}

	function Handle_Delete(board: BoardInfo): void {
		if (!confirm(`Delete "${board.name}"?`)) return;
		localStorage.removeItem(BOARD_PREFIX + board.id);
		const updated = boards.filter(b => b.id !== board.id);
		Save_Board_Index(updated);
		set_boards(updated);
		if (current_board_id === board.id) {
			on_board_id_change('');
		}
	}

	function Handle_Rename_Start(board: BoardInfo): void {
		set_editing_id(board.id);
		set_edit_name(board.name);
	}

	function Handle_Rename_Commit(): void {
		if (!editing_id || !edit_name.trim()) { set_editing_id(null); return; }
		const updated = boards.map(b => b.id === editing_id ? { ...b, name: edit_name.trim() } : b);
		Save_Board_Index(updated);
		set_boards(updated);
		set_editing_id(null);
	}

	// Compute bounding box of all content
	function Content_Bounds(): { x: number; y: number; w: number; h: number } | null {
		const { shapes, connectors, freehand_paths } = current_state;
		if (shapes.length === 0 && connectors.length === 0 && freehand_paths.length === 0) return null;

		let min_x = Infinity, min_y = Infinity, max_x = -Infinity, max_y = -Infinity;
		for (const s of shapes) {
			min_x = Math.min(min_x, s.x);
			min_y = Math.min(min_y, s.y);
			max_x = Math.max(max_x, s.x + s.width);
			max_y = Math.max(max_y, s.y + s.height);
		}
		for (const c of connectors) {
			for (const end of [c.source, c.target]) {
				if (end.shape_id) continue; // bound to shape, already counted
				min_x = Math.min(min_x, end.x);
				min_y = Math.min(min_y, end.y);
				max_x = Math.max(max_x, end.x);
				max_y = Math.max(max_y, end.y);
			}
		}
		for (const f of freehand_paths) {
			for (const pt of f.points) {
				min_x = Math.min(min_x, pt.x);
				min_y = Math.min(min_y, pt.y);
				max_x = Math.max(max_x, pt.x);
				max_y = Math.max(max_y, pt.y);
			}
		}
		if (!isFinite(min_x)) return null;
		const pad = 20;
		return { x: min_x - pad, y: min_y - pad, w: max_x - min_x + pad * 2, h: max_y - min_y + pad * 2 };
	}

	// Clone just the canvas content group, strip UI elements, set viewBox to content bounds
	function Export_SVG_Element(): SVGSVGElement | null {
		const svg_el = document.querySelector('svg');
		if (!svg_el) return null;
		const bounds = Content_Bounds();
		if (!bounds) return null;

		// Find the content <g> (the transform group with canvas content)
		const content_g = svg_el.querySelector('g[transform]');
		if (!content_g) return null;

		// Build a clean SVG with just the content
		const ns = 'http://www.w3.org/2000/svg';
		const svg = document.createElementNS(ns, 'svg');
		svg.setAttribute('xmlns', ns);
		svg.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`);
		svg.setAttribute('width', String(bounds.w));
		svg.setAttribute('height', String(bounds.h));

		// Clone content group children without the viewport transform
		const g = document.createElementNS(ns, 'g');
		for (const child of Array.from(content_g.children)) {
			g.appendChild(child.cloneNode(true));
		}

		// Remove selection handles, port indicators, hover effects, endpoint handles
		for (const el of Array.from(g.querySelectorAll('[data-handle-index], [data-rotate-handle], [data-port-id], [data-freehand-handle]'))) {
			el.remove();
		}
		// Remove transparent hit-area elements
		for (const el of Array.from(g.querySelectorAll('[stroke="transparent"]'))) {
			el.remove();
		}
		// Remove selection outlines (blue dashed rects from freehand selection)
		for (const el of Array.from(g.querySelectorAll('rect[stroke="#00d4ff"]'))) {
			el.remove();
		}

		svg.appendChild(g);
		return svg;
	}

	function Handle_Export_SVG(): void {
		const svg = Export_SVG_Element();
		if (!svg) { set_export_message('Nothing to export'); return; }
		const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml;charset=utf-8' });
		Download_Blob(blob, 'whiteboard.svg');
		set_export_message('SVG exported!');
	}

	function Handle_Export_PNG(): void {
		const svg = Export_SVG_Element();
		if (!svg) { set_export_message('Nothing to export'); return; }
		const bounds = Content_Bounds()!;
		const scale = 2; // 2x for crisp export
		const data = new XMLSerializer().serializeToString(svg);
		const img = new Image();
		img.onload = () => {
			const canvas = document.createElement('canvas');
			canvas.width = bounds.w * scale;
			canvas.height = bounds.h * scale;
			const ctx = canvas.getContext('2d');
			if (!ctx) return;
			ctx.fillStyle = '#ffffff';
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
			canvas.toBlob(blob => {
				if (blob) Download_Blob(blob, 'whiteboard.png');
				set_export_message('PNG exported!');
			}, 'image/png');
		};
		img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(data)));
	}

	function Handle_Export_JSON(): void {
		const blob = new Blob([JSON.stringify(current_state, null, 2)], { type: 'application/json' });
		Download_Blob(blob, 'whiteboard.json');
		set_export_message('JSON exported!');
	}

	function Handle_Import_JSON(e: React.ChangeEvent<HTMLInputElement>): void {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (ev) => {
			try {
				const state = JSON.parse(ev.target?.result as string) as CanvasState;
				if (state.shapes || state.connectors || state.freehand_paths) {
					on_load_board(state);
					set_export_message('Imported!');
				}
			} catch {
				alert('Invalid whiteboard file');
			}
		};
		reader.readAsText(file);
		// Reset input so the same file can be imported again
		e.target.value = '';
	}

	return (
		<>
			{/* Toggle button */}
			<button onClick={on_toggle} style={toggle_style} title="Boards & Files">
				{is_open ? '◀' : '☰'}
			</button>

			{is_open && (
				<div style={panel_style}>
					{/* Current board name — click to edit */}
					<div style={{ marginBottom: 12 }}>
						{editing_title ? (
							<input
								autoFocus
								value={title_draft}
								onChange={e => set_title_draft(e.target.value)}
								onBlur={() => { on_board_name_change(title_draft.trim() || 'Untitled Board'); set_editing_title(false); }}
								onKeyDown={e => {
									if (e.key === 'Enter') { on_board_name_change(title_draft.trim() || 'Untitled Board'); set_editing_title(false); }
									if (e.key === 'Escape') set_editing_title(false);
								}}
								style={board_name_input_style}
							/>
						) : (
							<div
								onClick={() => { set_editing_title(true); set_title_draft(current_board_name); }}
								style={board_name_display_style}
								title="Click to rename"
							>
								{current_board_name}
								<span style={{ fontSize: 10, color: '#bbb', marginLeft: 4 }}>✎</span>
							</div>
						)}
					</div>

					<h3 style={heading_style}>Boards</h3>

					{/* Save buttons */}
					<div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
						<button onClick={Handle_Save} style={icon_btn_style} title="Save current board">
							<span style={{ fontSize: 20 }}>💾</span>
							<span style={{ fontSize: 10, fontWeight: 500 }}>Save</span>
						</button>
						<button onClick={Handle_Save_As} style={icon_btn_style} title="Save as new board">
							<span style={{ fontSize: 20 }}>📄</span>
							<span style={{ fontSize: 10, fontWeight: 500 }}>Save As</span>
						</button>
						<button onClick={on_clear_canvas} style={{ ...icon_btn_style, color: '#d32f2f' }} title="Clear canvas">
							<span style={{ fontSize: 20 }}>🗑️</span>
							<span style={{ fontSize: 10, fontWeight: 500 }}>Clear</span>
						</button>
					</div>

					{/* Board list — sorted by most recent */}
					<div style={{ flex: 1, overflowY: 'auto', marginBottom: 12 }}>
						{boards.length === 0 && (
							<div style={{ fontSize: 12, color: '#999', textAlign: 'center', padding: 16 }}>
								No saved boards yet
							</div>
						)}
						{[...boards].sort((a, b) => b.updated_at - a.updated_at).map(board => (
							<div
								key={board.id}
								style={{
									...board_item_style,
									background: board.id === current_board_id ? '#e3f2fd' : '#f8f9fa',
									borderColor: board.id === current_board_id ? '#64b5f6' : '#e0e0e0',
								}}
							>
								{editing_id === board.id ? (
									<input
										autoFocus
										value={edit_name}
										onChange={e => set_edit_name(e.target.value)}
										onBlur={Handle_Rename_Commit}
										onKeyDown={e => { if (e.key === 'Enter') Handle_Rename_Commit(); if (e.key === 'Escape') set_editing_id(null); }}
										style={rename_input_style}
									/>
								) : (
									<div
										style={{ cursor: 'pointer', flex: 1, minWidth: 0 }}
										onClick={() => Handle_Load(board)}
										onDoubleClick={() => Handle_Rename_Start(board)}
										title="Click to load, double-click to rename"
									>
										<div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
											{board.name}
										</div>
										<div style={{ fontSize: 10, color: '#999' }}>
											{new Date(board.updated_at).toLocaleDateString()}
										</div>
									</div>
								)}
								<button
									onClick={(e) => { e.stopPropagation(); Handle_Delete(board); }}
									style={delete_btn_style}
									title="Delete board"
								>
									✕
								</button>
							</div>
						))}
					</div>

					{/* Divider */}
					<div style={{ borderTop: '1px solid #e0e0e0', margin: '4px 0 8px' }} />

					{/* Export / Import */}
					<h3 style={heading_style}>Export / Import</h3>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
						<button onClick={Handle_Export_SVG} style={action_btn_style}>📐 Export SVG</button>
						<button onClick={Handle_Export_PNG} style={action_btn_style}>🖼 Export PNG</button>
						<button onClick={Handle_Export_JSON} style={action_btn_style}>📋 Export JSON</button>
						<button onClick={() => file_input_ref.current?.click()} style={action_btn_style}>📂 Import JSON</button>
						<input
							ref={file_input_ref}
							type="file"
							accept=".json"
							onChange={Handle_Import_JSON}
							style={{ display: 'none' }}
						/>
					</div>

					{/* Transient message */}
					{export_message && (
						<div style={{ fontSize: 11, color: '#4caf50', textAlign: 'center', marginBottom: 8 }}>
							{export_message}
						</div>
					)}

					{/* Divider */}
					<div style={{ borderTop: '1px solid #e0e0e0', margin: '4px 0 8px' }} />

					{/* Cloud Storage */}
					<h3 style={heading_style}>Cloud Storage (OneDrive)</h3>
					{!graph_auth.is_signed_in ? (
						<div style={{ marginBottom: 8 }}>
							<button onClick={() => graph_auth.Sign_In()} style={{ ...action_btn_style, background: '#0078d4', color: '#fff', border: '1px solid #0078d4', textAlign: 'center' }}>
								🔑 Sign in with Microsoft
							</button>
						</div>
					) : (
						<div style={{ marginBottom: 8 }}>
							<div style={{ fontSize: 10, color: '#666', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
								<span>✓ {graph_auth.user_name || 'Signed in'}</span>
								<button onClick={() => graph_auth.Sign_Out()} style={{ fontSize: 9, background: 'none', border: 'none', color: '#999', cursor: 'pointer', textDecoration: 'underline' }}>Sign out</button>
							</div>

							{/* Cloud save buttons */}
							<div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
								<button onClick={Handle_Cloud_Save} style={icon_btn_style} title="Save to OneDrive">
									<span style={{ fontSize: 16 }}>☁️</span>
									<span style={{ fontSize: 10, fontWeight: 500 }}>Save</span>
								</button>
								<button onClick={Handle_Cloud_Save_As} style={icon_btn_style} title="Save as new cloud board">
									<span style={{ fontSize: 16 }}>📄</span>
									<span style={{ fontSize: 10, fontWeight: 500 }}>Save As</span>
								</button>
								<button onClick={Refresh_Cloud_Boards} style={icon_btn_style} title="Refresh">
									<span style={{ fontSize: 16 }}>🔄</span>
									<span style={{ fontSize: 10, fontWeight: 500 }}>Refresh</span>
								</button>
							</div>

							{/* Cloud board list */}
							{cloud_loading && <div style={{ fontSize: 11, color: '#999', textAlign: 'center' }}>Loading...</div>}
							{cloud_error && <div style={{ fontSize: 11, color: '#d32f2f', marginBottom: 4 }}>{cloud_error}</div>}
							<div style={{ maxHeight: 160, overflowY: 'auto' }}>
								{cloud_boards.map(board => (
									<div
										key={board.id}
										style={{
											...board_item_style,
											background: board.id === active_cloud_id ? '#e8f0fe' : '#f8f9fa',
											borderColor: board.id === active_cloud_id ? '#4285f4' : '#e0e0e0',
										}}
									>
										{cloud_editing_id === board.id ? (
											<input
												autoFocus
												value={cloud_edit_name}
												onChange={e => set_cloud_edit_name(e.target.value)}
												onBlur={() => Handle_Cloud_Rename_Commit()}
												onKeyDown={e => { if (e.key === 'Enter') Handle_Cloud_Rename_Commit(); if (e.key === 'Escape') set_cloud_editing_id(null); }}
												style={rename_input_style}
											/>
										) : (
											<div
												style={{ cursor: 'pointer', flex: 1, minWidth: 0 }}
												onClick={() => Handle_Cloud_Load(board)}
												onDoubleClick={() => { set_cloud_editing_id(board.id); set_cloud_edit_name(board.name); }}
												title="Click to load, double-click to rename"
											>
												<div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
													☁️ {board.name}
												</div>
												<div style={{ fontSize: 10, color: '#999' }}>
													{new Date(board.modified).toLocaleDateString()}
												</div>
											</div>
										)}
										<button
											onClick={(e) => { e.stopPropagation(); Handle_Cloud_Delete(board); }}
											style={delete_btn_style}
											title="Delete from OneDrive"
										>
											✕
										</button>
									</div>
								))}
								{!cloud_loading && cloud_boards.length === 0 && !cloud_error && (
									<div style={{ fontSize: 11, color: '#999', textAlign: 'center', padding: 8 }}>
										No cloud boards yet
									</div>
								)}
							</div>
						</div>
					)}
				</div>
			)}
		</>
	);
}

function Download_Blob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

const toggle_style: React.CSSProperties = {
	position: 'absolute',
	left: 8,
	top: '50%',
	transform: 'translateY(-50%)',
	width: 28,
	height: 48,
	background: '#fff',
	border: '1px solid #ddd',
	borderRadius: '0 6px 6px 0',
	cursor: 'pointer',
	fontSize: 14,
	zIndex: 100,
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	boxShadow: '2px 0 4px rgba(0,0,0,0.1)',
	fontFamily: 'inherit',
};

const panel_style: React.CSSProperties = {
	position: 'absolute',
	left: 0,
	top: 0,
	bottom: 0,
	width: 200,
	background: '#fff',
	borderRight: '1px solid #e0e0e0',
	padding: '56px 10px 10px',
	overflowY: 'auto',
	zIndex: 90,
	boxShadow: '2px 0 8px rgba(0,0,0,0.08)',
	fontFamily: 'inherit',
	display: 'flex',
	flexDirection: 'column',
};

const heading_style: React.CSSProperties = {
	margin: '0 0 6px',
	fontSize: 12,
	fontWeight: 600,
	color: '#555',
	textTransform: 'uppercase',
	letterSpacing: '0.5px',
};

const action_btn_style: React.CSSProperties = {
	flex: 1,
	padding: '5px 6px',
	fontSize: 11,
	background: '#f5f5f5',
	border: '1px solid #ddd',
	borderRadius: 4,
	cursor: 'pointer',
	fontFamily: 'inherit',
	textAlign: 'left',
};

const icon_btn_style: React.CSSProperties = {
	flex: 1,
	display: 'flex',
	flexDirection: 'column',
	alignItems: 'center',
	gap: 2,
	padding: '8px 4px',
	background: '#f8f9fa',
	border: '1px solid #e0e0e0',
	borderRadius: 8,
	cursor: 'pointer',
	fontFamily: 'inherit',
	transition: 'background 0.12s, border-color 0.12s',
};

const board_item_style: React.CSSProperties = {
	display: 'flex',
	alignItems: 'center',
	gap: 4,
	padding: '6px 8px',
	border: '1px solid #e0e0e0',
	borderRadius: 6,
	marginBottom: 4,
};

const rename_input_style: React.CSSProperties = {
	flex: 1,
	fontSize: 12,
	padding: '2px 4px',
	border: '1px solid #64b5f6',
	borderRadius: 3,
	outline: 'none',
	fontFamily: 'inherit',
};

const delete_btn_style: React.CSSProperties = {
	width: 20,
	height: 20,
	padding: 0,
	background: 'none',
	border: 'none',
	cursor: 'pointer',
	fontSize: 12,
	color: '#999',
	borderRadius: 3,
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
};

const board_name_display_style: React.CSSProperties = {
	fontSize: 15,
	fontWeight: 600,
	color: '#333',
	cursor: 'pointer',
	padding: '4px 6px',
	borderRadius: 4,
	border: '1px solid transparent',
	transition: 'border-color 0.15s',
	overflow: 'hidden',
	textOverflow: 'ellipsis',
	whiteSpace: 'nowrap',
	fontFamily: 'inherit',
};

const board_name_input_style: React.CSSProperties = {
	width: '100%',
	fontSize: 15,
	fontWeight: 600,
	padding: '4px 6px',
	border: '1px solid #64b5f6',
	borderRadius: 4,
	outline: 'none',
	fontFamily: 'inherit',
	boxSizing: 'border-box',
};
