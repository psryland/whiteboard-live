import { useState, useEffect, useRef, useMemo } from 'react';
import type { CanvasState } from './types';
import type { GraphAuth } from '../auth/useGraphToken';
import type { CloudBoard } from '../services/GraphService';
import {
	List_Cloud_Boards, Load_Cloud_Board, Save_Cloud_Board,
	Delete_Cloud_Board, Rename_Cloud_Board, Upload_To_OneDrive,
} from '../services/GraphService';

const BOARDS_INDEX_KEY = 'whitebored-boards-index';
const BOARD_PREFIX = 'whitebored-board-';

export interface BoardInfo {
	id: string;
	name: string;
	created_at: number;
	updated_at: number;
}

interface UnifiedBoard {
	id: string;
	name: string;
	storage: 'local' | 'cloud';
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
	const [editing_storage, set_editing_storage] = useState<'local' | 'cloud'>('local');
	const [edit_name, set_edit_name] = useState('');
	const [editing_title, set_editing_title] = useState(false);
	const [title_draft, set_title_draft] = useState('');
	const [status_message, set_status_message] = useState<string | null>(null);
	const file_input_ref = useRef<HTMLInputElement>(null);

	// Cloud storage state
	const [cloud_boards, set_cloud_boards] = useState<CloudBoard[]>([]);
	const [cloud_loading, set_cloud_loading] = useState(false);
	const [cloud_error, set_cloud_error] = useState<string | null>(null);
	const [active_cloud_id, set_active_cloud_id] = useState<string | null>(null);

	// Save-As location picker: when set, shows location choice
	const [pending_save_name, set_pending_save_name] = useState<string | null>(null);

	// Export location picker
	const [export_picker, set_export_picker] = useState<'svg' | 'png' | 'json' | null>(null);

	useEffect(() => {
		set_boards(Load_Board_Index());
		if (is_open && graph_auth.is_signed_in) Refresh_Cloud_Boards();
	}, [is_open]);

	// Clear transient messages
	useEffect(() => {
		if (!status_message) return;
		const t = setTimeout(() => set_status_message(null), 2500);
		return () => clearTimeout(t);
	}, [status_message]);

	// ── Cloud helpers ──

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

	// ── Save handlers ──

	function Handle_Save(): void {
		if (current_board_id) {
			// Update existing local board
			const now = Date.now();
			localStorage.setItem(BOARD_PREFIX + current_board_id, JSON.stringify(current_state));
			const updated = boards.map(b => b.id === current_board_id ? { ...b, name: current_board_name, updated_at: now } : b);
			Save_Board_Index(updated);
			set_boards(updated);
			set_status_message('Saved locally!');
		} else if (active_cloud_id) {
			// Update existing cloud board
			Do_Cloud_Save(current_board_name, active_cloud_id);
		} else {
			// New board — trigger Save As flow
			Handle_Save_As_Click();
		}
	}

	function Handle_Save_As_Click(): void {
		const name = prompt('Board name:', current_board_name || `Board ${boards.length + 1}`);
		if (!name) return;
		set_pending_save_name(name);
	}

	function Save_As_Local(name: string): void {
		const id = Generate_Board_Id();
		const now = Date.now();
		localStorage.setItem(BOARD_PREFIX + id, JSON.stringify(current_state));
		const info: BoardInfo = { id, name, created_at: now, updated_at: now };
		const updated = [...boards, info];
		Save_Board_Index(updated);
		set_boards(updated);
		on_board_id_change(id);
		on_board_name_change(name);
		set_active_cloud_id(null);
		set_status_message('Saved locally!');
		set_pending_save_name(null);
	}

	async function Save_As_Cloud(name: string): Promise<void> {
		set_pending_save_name(null);
		await Do_Cloud_Save(name, undefined);
		on_board_name_change(name);
		on_board_id_change('');
	}

	async function Do_Cloud_Save(name: string, existing_id?: string): Promise<void> {
		const token = await graph_auth.Get_Token();
		if (!token) return;
		try {
			const saved = await Save_Cloud_Board(token, name, current_state, existing_id);
			set_active_cloud_id(saved.id);
			set_status_message('Saved to OneDrive!');
			await Refresh_Cloud_Boards();
		} catch (e: any) {
			set_status_message('Cloud save failed: ' + (e.message || ''));
		}
	}

	// ── Load / Delete / Rename for local boards ──

	function Handle_Load_Local(board: BoardInfo): void {
		const raw = localStorage.getItem(BOARD_PREFIX + board.id);
		if (!raw) return;
		try {
			const state = JSON.parse(raw) as CanvasState;
			on_load_board(state);
			on_board_id_change(board.id);
			on_board_name_change(board.name);
			set_active_cloud_id(null);
		} catch { /* ignore */ }
	}

	function Handle_Delete_Local(board: BoardInfo): void {
		if (!confirm(`Delete "${board.name}"?`)) return;
		localStorage.removeItem(BOARD_PREFIX + board.id);
		const updated = boards.filter(b => b.id !== board.id);
		Save_Board_Index(updated);
		set_boards(updated);
		if (current_board_id === board.id) on_board_id_change('');
	}

	function Handle_Rename_Local_Commit(): void {
		if (!editing_id || !edit_name.trim()) { set_editing_id(null); return; }
		const updated = boards.map(b => b.id === editing_id ? { ...b, name: edit_name.trim() } : b);
		Save_Board_Index(updated);
		set_boards(updated);
		set_editing_id(null);
	}

	// ── Load / Delete / Rename for cloud boards ──

	async function Handle_Load_Cloud(board: CloudBoard): Promise<void> {
		const token = await graph_auth.Get_Token();
		if (!token) return;
		try {
			const state = await Load_Cloud_Board(token, board.id);
			on_load_board(state);
			on_board_name_change(board.name);
			on_board_id_change('');
			set_active_cloud_id(board.id);
		} catch (e: any) {
			set_status_message('Load failed: ' + (e.message || ''));
		}
	}

	async function Handle_Delete_Cloud(board: CloudBoard): Promise<void> {
		if (!confirm(`Delete "${board.name}" from OneDrive?`)) return;
		const token = await graph_auth.Get_Token();
		if (!token) return;
		try {
			await Delete_Cloud_Board(token, board.id);
			if (active_cloud_id === board.id) set_active_cloud_id(null);
			await Refresh_Cloud_Boards();
		} catch (e: any) {
			set_status_message('Delete failed: ' + (e.message || ''));
		}
	}

	async function Handle_Rename_Cloud_Commit(): Promise<void> {
		if (!editing_id || !edit_name.trim()) { set_editing_id(null); return; }
		const token = await graph_auth.Get_Token();
		if (!token) return;
		try {
			await Rename_Cloud_Board(token, editing_id, edit_name.trim());
			set_editing_id(null);
			await Refresh_Cloud_Boards();
		} catch (e: any) {
			set_status_message('Rename failed: ' + (e.message || ''));
		}
	}

	// ── Export helpers ──

	function Content_Bounds(): { x: number; y: number; w: number; h: number } | null {
		const { shapes, connectors, freehand_paths } = current_state;
		if (shapes.length === 0 && connectors.length === 0 && freehand_paths.length === 0) return null;
		let min_x = Infinity, min_y = Infinity, max_x = -Infinity, max_y = -Infinity;
		for (const s of shapes) {
			min_x = Math.min(min_x, s.x); min_y = Math.min(min_y, s.y);
			max_x = Math.max(max_x, s.x + s.width); max_y = Math.max(max_y, s.y + s.height);
		}
		for (const c of connectors) {
			for (const end of [c.source, c.target]) {
				if (end.shape_id) continue;
				min_x = Math.min(min_x, end.x); min_y = Math.min(min_y, end.y);
				max_x = Math.max(max_x, end.x); max_y = Math.max(max_y, end.y);
			}
		}
		for (const f of freehand_paths) {
			for (const pt of f.points) {
				min_x = Math.min(min_x, pt.x); min_y = Math.min(min_y, pt.y);
				max_x = Math.max(max_x, pt.x); max_y = Math.max(max_y, pt.y);
			}
		}
		if (!isFinite(min_x)) return null;
		const pad = 20;
		return { x: min_x - pad, y: min_y - pad, w: max_x - min_x + pad * 2, h: max_y - min_y + pad * 2 };
	}

	function Export_SVG_Element(): SVGSVGElement | null {
		const svg_el = document.querySelector('svg');
		if (!svg_el) return null;
		const bounds = Content_Bounds();
		if (!bounds) return null;
		const content_g = svg_el.querySelector('g[transform]');
		if (!content_g) return null;
		const ns = 'http://www.w3.org/2000/svg';
		const svg = document.createElementNS(ns, 'svg');
		svg.setAttribute('xmlns', ns);
		svg.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`);
		svg.setAttribute('width', String(bounds.w));
		svg.setAttribute('height', String(bounds.h));
		const g = document.createElementNS(ns, 'g');
		for (const child of Array.from(content_g.children)) g.appendChild(child.cloneNode(true));
		for (const el of Array.from(g.querySelectorAll('[data-handle-index], [data-rotate-handle], [data-port-id], [data-freehand-handle]'))) el.remove();
		for (const el of Array.from(g.querySelectorAll('[stroke="transparent"]'))) el.remove();
		for (const el of Array.from(g.querySelectorAll('rect[stroke="#00d4ff"]'))) el.remove();
		svg.appendChild(g);
		return svg;
	}

	function Get_SVG_String(): string | null {
		const svg = Export_SVG_Element();
		return svg ? svg.outerHTML : null;
	}

	function Get_PNG_Blob(): Promise<Blob | null> {
		return new Promise((resolve) => {
			const svg = Export_SVG_Element();
			if (!svg) { resolve(null); return; }
			const bounds = Content_Bounds()!;
			const scale = 2;
			const data = new XMLSerializer().serializeToString(svg);
			const img = new Image();
			img.onload = () => {
				const canvas = document.createElement('canvas');
				canvas.width = bounds.w * scale;
				canvas.height = bounds.h * scale;
				const ctx = canvas.getContext('2d');
				if (!ctx) { resolve(null); return; }
				ctx.fillStyle = '#ffffff';
				ctx.fillRect(0, 0, canvas.width, canvas.height);
				ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
				canvas.toBlob(blob => resolve(blob), 'image/png');
			};
			img.onerror = () => resolve(null);
			img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(data)));
		});
	}

	function Handle_Export_Download(format: 'svg' | 'png' | 'json'): void {
		set_export_picker(null);
		if (format === 'svg') {
			const str = Get_SVG_String();
			if (!str) { set_status_message('Nothing to export'); return; }
			Download_Blob(new Blob([str], { type: 'image/svg+xml;charset=utf-8' }), 'whiteboard.svg');
			set_status_message('SVG exported!');
		} else if (format === 'png') {
			Get_PNG_Blob().then(blob => {
				if (!blob) { set_status_message('Nothing to export'); return; }
				Download_Blob(blob, 'whiteboard.png');
				set_status_message('PNG exported!');
			});
		} else {
			const blob = new Blob([JSON.stringify(current_state, null, 2)], { type: 'application/json' });
			Download_Blob(blob, 'whiteboard.json');
			set_status_message('JSON exported!');
		}
	}

	async function Handle_Export_OneDrive(format: 'svg' | 'png' | 'json'): Promise<void> {
		set_export_picker(null);
		const token = await graph_auth.Get_Token();
		if (!token) return;
		const base_name = current_board_name || 'whiteboard';
		try {
			if (format === 'svg') {
				const str = Get_SVG_String();
				if (!str) { set_status_message('Nothing to export'); return; }
				await Upload_To_OneDrive(token, `${base_name}.svg`, str, 'image/svg+xml');
			} else if (format === 'png') {
				const blob = await Get_PNG_Blob();
				if (!blob) { set_status_message('Nothing to export'); return; }
				await Upload_To_OneDrive(token, `${base_name}.png`, blob, 'image/png');
			} else {
				const str = JSON.stringify(current_state, null, 2);
				await Upload_To_OneDrive(token, `${base_name}.json`, str, 'application/json');
			}
			set_status_message(`Uploaded ${format.toUpperCase()} to OneDrive!`);
		} catch (e: any) {
			set_status_message('Upload failed: ' + (e.message || ''));
		}
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
					set_status_message('Imported!');
				}
			} catch {
				alert('Invalid whiteboard file');
			}
		};
		reader.readAsText(file);
		e.target.value = '';
	}

	// ── Unified board list ──

	const unified_boards: UnifiedBoard[] = useMemo(() => {
		const local_items: UnifiedBoard[] = boards.map(b => ({
			id: b.id, name: b.name, storage: 'local', updated_at: b.updated_at,
		}));
		const cloud_items: UnifiedBoard[] = cloud_boards.map(b => ({
			id: b.id, name: b.name, storage: 'cloud', updated_at: new Date(b.modified).getTime(),
		}));
		return [...local_items, ...cloud_items].sort((a, b) => b.updated_at - a.updated_at);
	}, [boards, cloud_boards]);

	function Is_Active(board: UnifiedBoard): boolean {
		return (board.storage === 'local' && board.id === current_board_id)
			|| (board.storage === 'cloud' && board.id === active_cloud_id);
	}

	function Handle_Board_Click(board: UnifiedBoard): void {
		if (board.storage === 'local') {
			const info = boards.find(b => b.id === board.id);
			if (info) Handle_Load_Local(info);
		} else {
			const cb = cloud_boards.find(b => b.id === board.id);
			if (cb) Handle_Load_Cloud(cb);
		}
	}

	function Handle_Board_Rename_Start(board: UnifiedBoard): void {
		set_editing_id(board.id);
		set_editing_storage(board.storage);
		set_edit_name(board.name);
	}

	function Handle_Board_Rename_Commit(): void {
		if (editing_storage === 'local') Handle_Rename_Local_Commit();
		else Handle_Rename_Cloud_Commit();
	}

	function Handle_Board_Delete(board: UnifiedBoard): void {
		if (board.storage === 'local') {
			const info = boards.find(b => b.id === board.id);
			if (info) Handle_Delete_Local(info);
		} else {
			const cb = cloud_boards.find(b => b.id === board.id);
			if (cb) Handle_Delete_Cloud(cb);
		}
	}

	// Determine active board storage for display
	const active_storage: 'local' | 'cloud' | null =
		current_board_id ? 'local' : active_cloud_id ? 'cloud' : null;

	return (
		<>
			{/* Toggle button */}
			<button onClick={on_toggle} style={toggle_style} title="Boards & Files">
				{is_open ? '◀' : '☰'}
			</button>

			{is_open && (
				<div style={panel_style}>
					{/* Current board name — click to edit */}
					<div style={{ marginBottom: 8 }}>
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
								{active_storage === 'cloud' ? '☁️ ' : active_storage === 'local' ? '💻 ' : ''}
								{current_board_name}
								<span style={{ fontSize: 10, color: '#bbb', marginLeft: 4 }}>✎</span>
							</div>
						)}
					</div>

					{/* Save / Save As / Clear */}
					<div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
						<button onClick={Handle_Save} style={icon_btn_style} title="Save current board">
							<span style={{ fontSize: 20 }}>💾</span>
							<span style={{ fontSize: 10, fontWeight: 500 }}>Save</span>
						</button>
						<button onClick={Handle_Save_As_Click} style={icon_btn_style} title="Save as new board">
							<span style={{ fontSize: 20 }}>📄</span>
							<span style={{ fontSize: 10, fontWeight: 500 }}>Save As</span>
						</button>
						<button onClick={on_clear_canvas} style={{ ...icon_btn_style, color: '#d32f2f' }} title="Clear canvas">
							<span style={{ fontSize: 20 }}>🗑️</span>
							<span style={{ fontSize: 10, fontWeight: 500 }}>Clear</span>
						</button>
					</div>

					{/* Save location picker — appears when Save As is pending */}
					{pending_save_name !== null && (
						<div style={picker_style}>
							<div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>
								Save "{pending_save_name}" to:
							</div>
							<div style={{ display: 'flex', gap: 6 }}>
								<button
									onClick={() => Save_As_Local(pending_save_name)}
									style={picker_btn_style}
								>
									💻 Locally
								</button>
								<button
									onClick={() => Save_As_Cloud(pending_save_name)}
									disabled={!graph_auth.is_signed_in}
									style={{
										...picker_btn_style,
										opacity: graph_auth.is_signed_in ? 1 : 0.4,
										cursor: graph_auth.is_signed_in ? 'pointer' : 'default',
									}}
									title={graph_auth.is_signed_in ? 'Save to OneDrive' : 'Sign in to save to OneDrive'}
								>
									☁️ OneDrive
								</button>
								<button
									onClick={() => set_pending_save_name(null)}
									style={{ ...picker_btn_style, background: '#f5f5f5' }}
								>
									✕
								</button>
							</div>
						</div>
					)}

					{/* Board list heading with refresh */}
					<div style={{ display: 'flex', alignItems: 'center', gap: 4, margin: '8px 0 6px' }}>
						<h3 style={{ ...heading_style, margin: 0, flex: 1 }}>Boards</h3>
						{graph_auth.is_signed_in && (
							<button
								onClick={Refresh_Cloud_Boards}
								style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#999', padding: 2 }}
								title="Refresh cloud boards"
							>
								🔄
							</button>
						)}
					</div>

					{/* Unified board list */}
					<div style={{ flex: 1, overflowY: 'auto', marginBottom: 8 }}>
						{cloud_loading && <div style={{ fontSize: 11, color: '#999', textAlign: 'center', padding: 4 }}>Loading cloud boards...</div>}
						{cloud_error && <div style={{ fontSize: 11, color: '#d32f2f', marginBottom: 4 }}>{cloud_error}</div>}
						{unified_boards.length === 0 && !cloud_loading && (
							<div style={{ fontSize: 12, color: '#999', textAlign: 'center', padding: 16 }}>
								No saved boards yet
							</div>
						)}
						{unified_boards.map(board => (
							<div
								key={`${board.storage}-${board.id}`}
								style={{
									...board_item_style,
									background: Is_Active(board) ? '#e3f2fd' : '#f8f9fa',
									borderColor: Is_Active(board) ? '#64b5f6' : '#e0e0e0',
								}}
							>
								{editing_id === board.id ? (
									<input
										autoFocus
										value={edit_name}
										onChange={e => set_edit_name(e.target.value)}
										onBlur={Handle_Board_Rename_Commit}
										onKeyDown={e => { if (e.key === 'Enter') Handle_Board_Rename_Commit(); if (e.key === 'Escape') set_editing_id(null); }}
										style={rename_input_style}
									/>
								) : (
									<div
										style={{ cursor: 'pointer', flex: 1, minWidth: 0 }}
										onClick={() => Handle_Board_Click(board)}
										onDoubleClick={() => Handle_Board_Rename_Start(board)}
										title="Click to load, double-click to rename"
									>
										<div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
											{board.storage === 'cloud' ? '☁️ ' : '💻 '}{board.name}
										</div>
										<div style={{ fontSize: 10, color: '#999' }}>
											{new Date(board.updated_at).toLocaleDateString()}
										</div>
									</div>
								)}
								<button
									onClick={(e) => { e.stopPropagation(); Handle_Board_Delete(board); }}
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
					<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 8 }}>
						{(['svg', 'png', 'json'] as const).map(fmt => (
							<div key={fmt} style={{ position: 'relative' }}>
								<button
									onClick={() => set_export_picker(export_picker === fmt ? null : fmt)}
									style={export_btn_style}
								>
									{fmt.toUpperCase()} ▾
								</button>
								{export_picker === fmt && (
									<div style={export_dropdown_style}>
										<button onClick={() => Handle_Export_Download(fmt)} style={export_option_style}>
											📥 Download
										</button>
										<button
											onClick={() => Handle_Export_OneDrive(fmt)}
											disabled={!graph_auth.is_signed_in}
											style={{
												...export_option_style,
												borderBottom: 'none',
												opacity: graph_auth.is_signed_in ? 1 : 0.4,
												cursor: graph_auth.is_signed_in ? 'pointer' : 'default',
											}}
											title={graph_auth.is_signed_in ? 'Upload to OneDrive' : 'Sign in first'}
										>
											☁️ OneDrive
										</button>
									</div>
								)}
							</div>
						))}
						<button onClick={() => file_input_ref.current?.click()} style={export_btn_style}>
							Import
						</button>
					</div>
					<input
						ref={file_input_ref}
						type="file"
						accept=".json"
						onChange={Handle_Import_JSON}
						style={{ display: 'none' }}
					/>

					{/* Transient message */}
					{status_message && (
						<div style={{ fontSize: 11, color: '#4caf50', textAlign: 'center', marginBottom: 8 }}>
							{status_message}
						</div>
					)}

					{/* Divider */}
					<div style={{ borderTop: '1px solid #e0e0e0', margin: '4px 0 8px' }} />

					{/* Account section — pinned to bottom */}
					<div style={{ marginTop: 'auto' }}>
						{graph_auth.is_signed_in ? (
							<div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
								<span style={{ color: '#4caf50' }}>●</span>
								<span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#555' }}>
									{graph_auth.user_name || 'Signed in'}
								</span>
								<button
									onClick={() => graph_auth.Sign_Out()}
									style={{ fontSize: 10, background: 'none', border: 'none', color: '#999', cursor: 'pointer', textDecoration: 'underline', whiteSpace: 'nowrap' }}
								>
									Sign out
								</button>
							</div>
						) : (
							<button
								onClick={() => graph_auth.Sign_In()}
								style={{
									...action_btn_style,
									background: '#0078d4', color: '#fff', border: '1px solid #0078d4',
									textAlign: 'center', width: '100%',
								}}
							>
								🔑 Sign in with Microsoft
							</button>
						)}
					</div>
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
	width: 220,
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

const picker_style: React.CSSProperties = {
	background: '#f0f7ff',
	border: '1px solid #c8e1ff',
	borderRadius: 8,
	padding: 10,
	marginBottom: 8,
};

const picker_btn_style: React.CSSProperties = {
	flex: 1,
	padding: '6px 4px',
	fontSize: 11,
	background: '#fff',
	border: '1px solid #ddd',
	borderRadius: 6,
	cursor: 'pointer',
	fontFamily: 'inherit',
	textAlign: 'center',
};

const export_btn_style: React.CSSProperties = {
	width: '100%',
	padding: '6px 4px',
	fontSize: 11,
	fontWeight: 500,
	background: '#f8f9fa',
	border: '1px solid #e0e0e0',
	borderRadius: 6,
	cursor: 'pointer',
	fontFamily: 'inherit',
	textAlign: 'center',
};

const export_dropdown_style: React.CSSProperties = {
	position: 'absolute',
	left: 0,
	right: 0,
	top: '100%',
	background: '#fff',
	border: '1px solid #ddd',
	borderRadius: 4,
	boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
	zIndex: 10,
	overflow: 'hidden',
};

const export_option_style: React.CSSProperties = {
	display: 'block',
	width: '100%',
	padding: '6px 10px',
	fontSize: 11,
	background: 'none',
	border: 'none',
	borderBottom: '1px solid #f0f0f0',
	cursor: 'pointer',
	textAlign: 'left',
	fontFamily: 'inherit',
};
