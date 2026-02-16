import { useCallback, useEffect, useRef, useState } from 'react';
import type { Shape, Connector, CanvasState, ToolType, Viewport, Point, ConnectorEnd, ShapeStyle, FreehandPath, LaserPoint, ToolSettings, CollabUser } from './types';
import { DEFAULT_STYLE, DEFAULT_TOOL_SETTINGS } from './types';
import { Generate_Id, Default_Ports, Screen_To_Canvas, Nearest_Port, Port_Position, Normalise_Bounds, Bounds_Overlap, Shape_Bounds, Snap_To_Grid, DEFAULT_GRID_SIZE, DEFAULT_GRID_MAJOR_MULT, Freehand_Bounds, Simplify_Points, Smooth_Points, Get_Svg_Path_From_Stroke, Default_Control_Points } from './helpers';
import { getStroke } from 'perfect-freehand';
import { UndoManager } from './undo';
import { ShapeRenderer } from './ShapeRenderer';
import { ConnectorRenderer } from './ConnectorRenderer';
import { Toolbar } from './Toolbar';
import { BoardPanel } from './BoardPanel';
import { PropertiesPanel } from './PropertiesPanel';
import { CollabSession, Generate_Room_Id } from './Collaboration';
import { RemoteCursors } from './RemoteCursors';

const STORAGE_KEY = 'whiteboard-live';

// Resolve a connector endpoint to an absolute point
function Resolve_Connector_End(end: ConnectorEnd, shapes: Shape[]): Point {
	if (end.shape_id && end.port_id) {
		const shape = shapes.find(s => s.id === end.shape_id);
		if (shape) {
			const port = shape.ports.find(p => p.id === end.port_id);
			if (port) return Port_Position(shape, port);
		}
	}
	return { x: end.x, y: end.y };
}

function Resolve_Port_Side_For_End(end: ConnectorEnd, shapes: Shape[]): string | undefined {
	if (!end.shape_id || !end.port_id) return undefined;
	const shape = shapes.find(s => s.id === end.shape_id);
	return shape?.ports.find(p => p.id === end.port_id)?.side;
}

function Load_State(): CanvasState & { max_z: number } {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			let z = 0;
			// Migrate shapes missing the rotation field or rounded style
			const shapes = (parsed.shapes || []).map((s: any) => ({
				rotation: 0,
				z_index: s.z_index ?? ++z,
				...s,
				style: { rounded: false, opacity: 100, ...s.style },
			}));
			// Migrate connectors missing arrow_type
			const connectors = (parsed.connectors || []).map((c: any) => ({ arrow_type: 'forward' as const, routing: 'ortho' as const, z_index: c.z_index ?? ++z, ...c }));
			const freehand_paths = (parsed.freehand_paths || []).map((f: any) => ({ z_index: f.z_index ?? ++z, ...f }));

			// Find the actual maximum z_index across all elements
			const max_z = Math.max(z,
				...shapes.map((s: any) => s.z_index ?? 0),
				...connectors.map((c: any) => c.z_index ?? 0),
				...freehand_paths.map((f: any) => f.z_index ?? 0),
			);
			return { shapes, connectors, freehand_paths, max_z };
		}
	} catch { /* ignore */ }
	return { shapes: [], connectors: [], freehand_paths: [], max_z: 0 };
}

function Save_State(state: CanvasState): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch { /* ignore */ }
}

export function Canvas() {
	const svg_ref = useRef<SVGSVGElement>(null);
	const undo_mgr = useRef(new UndoManager()).current;

	// Canvas data
	const initial_state = useRef(Load_State()).current;
	const [shapes, set_shapes] = useState<Shape[]>(() => initial_state.shapes);
	const [connectors, set_connectors] = useState<Connector[]>(() => initial_state.connectors);
	const [freehand_paths, set_freehand_paths] = useState<FreehandPath[]>(() => initial_state.freehand_paths);

	// Refs to current state (for callbacks that must read latest values)
	const shapes_ref = useRef(shapes);
	shapes_ref.current = shapes;
	const connectors_ref = useRef(connectors);
	connectors_ref.current = connectors;
	const freehand_ref = useRef(freehand_paths);
	freehand_ref.current = freehand_paths;

	// Global z-index counter — initialised from existing items
	const z_counter = useRef(initial_state.max_z);
	function Next_Z(): number { return ++z_counter.current; }

	// Viewport (pan/zoom)
	const [viewport, set_viewport] = useState<Viewport>({ offset_x: 0, offset_y: 0, zoom: 1 });

	// Tool & interaction state
	const [active_tool, set_active_tool] = useState<ToolType>('select');
	const [selected_ids, set_selected_ids] = useState<Set<string>>(new Set());
	const [hovered_shape_id, set_hovered_shape_id] = useState<string | null>(null);

	// Grid snapping
	const [snap_enabled, set_snap_enabled] = useState(true);
	const [grid_size, set_grid_size] = useState(DEFAULT_GRID_SIZE);

	// Drag state
	const drag_state = useRef<{
		type: 'none' | 'pan' | 'move' | 'create' | 'marquee' | 'connector' | 'resize' | 'rotate' | 'freehand' | 'laser' | 'freehand_move' | 'freehand_resize' | 'cp_drag' | 'endpoint_drag';
		start_canvas: Point;
		start_screen: Point;
		start_viewport?: Viewport;
		moved?: boolean;
		shape_origins?: Map<string, Point>;
		creating_shape?: Shape;
		marquee_start?: Point;
		connector_source?: ConnectorEnd;
		// Resize state
		resize_shape_id?: string;
		resize_handle?: number;
		resize_original?: { x: number; y: number; width: number; height: number };
		// Rotate state
		rotate_shape_id?: string;
		rotate_start_angle?: number;
		rotate_original?: number;
		// Freehand state
		freehand_points?: Point[];
		// Laser state
		laser_points?: LaserPoint[];
		// Freehand move/resize state
		freehand_path_origins?: Map<string, Point[]>;
		freehand_resize_bounds?: { x: number; y: number; width: number; height: number };
		freehand_resize_handle?: number;
		// Control point drag state
		cp_connector_id?: string;
		cp_index?: number;
		// Endpoint drag state
		endpoint_connector_id?: string;
		endpoint_end?: 'source' | 'target';
		endpoint_original?: Point; // original endpoint position when drag started
		endpoint_original_cp?: Point; // original control point for the dragged end
	}>({ type: 'none', start_canvas: { x: 0, y: 0 }, start_screen: { x: 0, y: 0 } });

	// Marquee rectangle (screen coords for overlay display)
	const [marquee, set_marquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

	// In-progress connector preview
	const [connector_preview, set_connector_preview] = useState<{ from: Point; to: Point } | null>(null);

	// Text editing
	const [editing_shape_id, set_editing_shape_id] = useState<string | null>(null);
	const text_input_ref = useRef<HTMLInputElement>(null);
	const editing_started_at = useRef<number>(0);

	// Colour picker removed — colours now in toolbar dropdowns

	// Tool settings for pen, text, shape, connector, laser
	const [tool_settings, set_tool_settings] = useState<ToolSettings>(DEFAULT_TOOL_SETTINGS);

	// Shape palette sidebar
	const [show_board_panel, set_show_board_panel] = useState(false);
	const [current_board_id, set_current_board_id] = useState<string | null>(null);
	const [current_board_name, set_current_board_name] = useState('Untitled Board');

	// Quick-connect: track the first shape for Shift+click connection
	const quick_connect_source = useRef<string | null>(null);

	// Clipboard for copy/paste
	const clipboard = useRef<{ shapes: Shape[]; connectors: Connector[] } | null>(null);

	// Laser trail for rendering
	const [laser_trail, set_laser_trail] = useState<LaserPoint[]>([]);
	const laser_raf = useRef<number>(0);

	// ── Collaboration state ──
	const [collab_session, set_collab_session] = useState<CollabSession | null>(null);
	const [remote_users, set_remote_users] = useState<CollabUser[]>([]);
	const [collab_connected, set_collab_connected] = useState(false);
	const [collab_toast, set_collab_toast] = useState<string | null>(null);
	const collab_ref = useRef<CollabSession | null>(null);

	// Check URL for room parameter on mount
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const room = params.get('room');
		if (room) {
			const saved_name = localStorage.getItem('whitebored-user-name') || '';
			const name = prompt('Enter your display name to join the session:', saved_name) || saved_name || 'Anonymous';
			localStorage.setItem('whitebored-user-name', name);
			Start_Collab_Session(room, false);
		}
	}, []);

	// Clean up collab toast
	useEffect(() => {
		if (!collab_toast) return;
		const t = setTimeout(() => set_collab_toast(null), 3000);
		return () => clearTimeout(t);
	}, [collab_toast]);

	function Start_Collab_Session(room_id: string, is_host: boolean): void {
		if (collab_ref.current) {
			collab_ref.current.Disconnect();
		}

		const session = new CollabSession(room_id, {
			on_user_join: (user) => {
				set_remote_users(prev => [...prev.filter(u => u.id !== user.id), user]);
				set_collab_toast(`${user.name} joined`);
			},
			on_user_leave: (user_id) => {
				set_remote_users(prev => {
					const leaving = prev.find(u => u.id === user_id);
					if (leaving) set_collab_toast(`${leaving.name} left`);
					return prev.filter(u => u.id !== user_id);
				});
			},
			on_cursor_move: (user_id, cursor, sender_name, sender_colour) => {
				set_remote_users(prev => {
					const exists = prev.some(u => u.id === user_id);
					if (exists) {
						return prev.map(u => u.id === user_id ? { ...u, cursor, status: 'editing', name: sender_name || u.name, colour: sender_colour || u.colour } : u);
					}
					// User not yet known (join message may not have arrived) — add them
					return [...prev, { id: user_id, name: sender_name || 'Unknown', colour: sender_colour || '#888', status: 'editing' as const, permission: 'edit' as const, cursor }];
				});
			},
			on_state_sync: (state) => {
				set_shapes(state.shapes || []);
				set_connectors(state.connectors || []);
				set_freehand_paths(state.freehand_paths || []);
				const max_z = Math.max(0,
					...(state.shapes || []).map(s => s.z_index ?? 0),
					...(state.connectors || []).map(c => c.z_index ?? 0),
					...(state.freehand_paths || []).map(f => f.z_index ?? 0),
				);
				z_counter.current = max_z;
				undo_mgr.Clear();
			},
			on_operation: (msg) => {
				const { type, payload } = msg;
				if (type === 'op_add') {
					if (payload.kind === 'shape') set_shapes(prev => [...prev, payload.item]);
					else if (payload.kind === 'connector') set_connectors(prev => [...prev, payload.item]);
					else if (payload.kind === 'freehand') set_freehand_paths(prev => [...prev, payload.item]);
				} else if (type === 'op_update') {
					if (payload.kind === 'shape') set_shapes(prev => prev.map(s => s.id === payload.item.id ? payload.item : s));
					else if (payload.kind === 'connector') set_connectors(prev => prev.map(c => c.id === payload.item.id ? payload.item : c));
					else if (payload.kind === 'freehand') set_freehand_paths(prev => prev.map(f => f.id === payload.item.id ? payload.item : f));
				} else if (type === 'op_delete') {
					const ids = new Set(payload.ids as string[]);
					set_shapes(prev => prev.filter(s => !ids.has(s.id)));
					set_connectors(prev => prev.filter(c => !ids.has(c.id)));
					set_freehand_paths(prev => prev.filter(f => !ids.has(f.id)));
				}
			},
			on_state_requested: () => ({ shapes: shapes_ref.current, connectors: connectors_ref.current, freehand_paths: freehand_ref.current }),
			on_connection_change: (connected) => set_collab_connected(connected),
		}, is_host);

		collab_ref.current = session;
		set_collab_session(session);
		session.Connect();
	}

	function Stop_Collab_Session(): void {
		if (collab_ref.current) {
			collab_ref.current.Disconnect();
			collab_ref.current = null;
		}
		set_collab_session(null);
		set_remote_users([]);
		set_collab_connected(false);
		// Remove room from URL
		const url = new URL(window.location.href);
		url.searchParams.delete('room');
		window.history.replaceState({}, '', url.toString());
	}

	function Handle_Start_Sharing(): void {
		const saved_name = localStorage.getItem('whitebored-user-name') || '';
		const name = prompt('Enter your display name:', saved_name) || saved_name || 'Anonymous';
		localStorage.setItem('whitebored-user-name', name);
		const room_id = Generate_Room_Id();
		Start_Collab_Session(room_id, true);
		// Add room to URL
		const url = new URL(window.location.href);
		url.searchParams.set('room', room_id);
		window.history.replaceState({}, '', url.toString());
	}

	// Broadcast operation to collaborators
	function Broadcast_Add(kind: 'shape' | 'connector' | 'freehand', item: any): void {
		collab_ref.current?.Send_Operation('op_add', { kind, item });
	}
	function Broadcast_Update(kind: 'shape' | 'connector' | 'freehand', item: any): void {
		collab_ref.current?.Send_Operation('op_update', { kind, item });
	}
	function Broadcast_Delete(ids: string[]): void {
		collab_ref.current?.Send_Operation('op_delete', { ids });
	}

	// Persist state on change
	useEffect(() => {
		Save_State({ shapes, connectors, freehand_paths });
	}, [shapes, connectors, freehand_paths]);

	// Focus text input when editing
	useEffect(() => {
		if (editing_shape_id && text_input_ref.current) {
			text_input_ref.current.focus();
			text_input_ref.current.select();
		}
	}, [editing_shape_id]);

	// Save undo snapshot before making a change
	const Push_Undo = useCallback(() => {
		undo_mgr.Push({ shapes, connectors, freehand_paths });
	}, [shapes, connectors, freehand_paths, undo_mgr]);

	const Do_Undo = useCallback(() => {
		const prev = undo_mgr.Undo({ shapes, connectors, freehand_paths });
		if (prev) {
			set_shapes(prev.shapes);
			set_connectors(prev.connectors);
			set_freehand_paths(prev.freehand_paths);
			set_selected_ids(new Set());
		}
	}, [shapes, connectors, freehand_paths, undo_mgr]);

	const Do_Redo = useCallback(() => {
		const next = undo_mgr.Redo({ shapes, connectors, freehand_paths });
		if (next) {
			set_shapes(next.shapes);
			set_connectors(next.connectors);
			set_freehand_paths(next.freehand_paths);
			set_selected_ids(new Set());
		}
	}, [shapes, connectors, freehand_paths, undo_mgr]);

	const Delete_Selected = useCallback(() => {
		if (selected_ids.size === 0) return;
		Push_Undo();
		const ids_to_delete = Array.from(selected_ids);
		set_shapes(prev => prev.filter(s => !selected_ids.has(s.id)));
		// Also remove connectors attached to deleted shapes
		set_connectors(prev => prev.filter(c =>
			!selected_ids.has(c.id) &&
			(!c.source.shape_id || !selected_ids.has(c.source.shape_id)) &&
			(!c.target.shape_id || !selected_ids.has(c.target.shape_id))
		));
		set_freehand_paths(prev => prev.filter(p => !selected_ids.has(p.id)));
		set_selected_ids(new Set());
		Broadcast_Delete(ids_to_delete);
	}, [selected_ids, Push_Undo]);

	// Duplicate selected shapes with a small offset
	const Duplicate_Selected = useCallback(() => {
		if (selected_ids.size === 0) return;
		Push_Undo();
		const id_map = new Map<string, string>();
		const new_shapes: Shape[] = [];
		for (const s of shapes) {
			if (!selected_ids.has(s.id)) continue;
			const new_id = Generate_Id('s');
			id_map.set(s.id, new_id);
			new_shapes.push({ ...s, id: new_id, x: s.x + 20, y: s.y + 20, ports: Default_Ports(), z_index: Next_Z() });
		}
		// Duplicate connectors between selected shapes
		const new_connectors: Connector[] = [];
		for (const c of connectors) {
			if (!selected_ids.has(c.id)) continue;
			const new_src_id = c.source.shape_id ? id_map.get(c.source.shape_id) : null;
			const new_tgt_id = c.target.shape_id ? id_map.get(c.target.shape_id) : null;
			if (new_src_id || new_tgt_id) {
				new_connectors.push({
					...c,
					id: Generate_Id('c'),
					source: { ...c.source, shape_id: new_src_id ?? c.source.shape_id },
					target: { ...c.target, shape_id: new_tgt_id ?? c.target.shape_id },
					z_index: Next_Z(),
				});
			}
		}
		set_shapes(prev => [...prev, ...new_shapes]);
		set_connectors(prev => [...prev, ...new_connectors]);
		set_selected_ids(new Set(new_shapes.map(s => s.id)));
	}, [selected_ids, shapes, connectors, Push_Undo]);

	// Copy selected shapes to clipboard
	const Copy_Selected = useCallback(() => {
		if (selected_ids.size === 0) return;
		const copied_shapes = shapes.filter(s => selected_ids.has(s.id));
		const copied_connectors = connectors.filter(c => selected_ids.has(c.id));
		clipboard.current = { shapes: copied_shapes, connectors: copied_connectors };
	}, [selected_ids, shapes, connectors]);

	// Paste from clipboard with offset
	const Paste = useCallback(() => {
		if (!clipboard.current || clipboard.current.shapes.length === 0) return;
		Push_Undo();
		const id_map = new Map<string, string>();
		const new_shapes = clipboard.current.shapes.map(s => {
			const new_id = Generate_Id('s');
			id_map.set(s.id, new_id);
			return { ...s, id: new_id, x: s.x + 30, y: s.y + 30, ports: Default_Ports(), z_index: Next_Z() };
		});
		const new_connectors = clipboard.current.connectors.map(c => ({
			...c,
			id: Generate_Id('c'),
			source: { ...c.source, shape_id: c.source.shape_id ? (id_map.get(c.source.shape_id) ?? c.source.shape_id) : null },
			target: { ...c.target, shape_id: c.target.shape_id ? (id_map.get(c.target.shape_id) ?? c.target.shape_id) : null },
			z_index: Next_Z(),
		}));
		set_shapes(prev => [...prev, ...new_shapes]);
		set_connectors(prev => [...prev, ...new_connectors]);
		set_selected_ids(new Set(new_shapes.map(s => s.id)));
		// Update clipboard positions so repeated paste cascades
		clipboard.current = { shapes: new_shapes, connectors: new_connectors };
	}, [Push_Undo]);

	// Apply colour changes to selected shapes
	const Apply_Style_Change = useCallback((changes: Partial<ShapeStyle>) => {
		Push_Undo();
		set_shapes(prev => prev.map(s => {
			if (!selected_ids.has(s.id)) return s;
			const updated = { ...s, style: { ...s.style, ...changes } };
			Broadcast_Update('shape', updated);
			return updated;
		}));
	}, [selected_ids, Push_Undo]);

	// Quick-connect: auto-create arrow between two shapes
	const Quick_Connect = useCallback((source_id: string, target_id: string) => {
		if (source_id === target_id) return;
		const src = shapes.find(s => s.id === source_id);
		const tgt = shapes.find(s => s.id === target_id);
		if (!src || !tgt) return;

		// Find the best ports based on relative positions
		const src_centre = { x: src.x + src.width / 2, y: src.y + src.height / 2 };
		const tgt_centre = { x: tgt.x + tgt.width / 2, y: tgt.y + tgt.height / 2 };
		const src_port = Nearest_Port(src, tgt_centre);
		const tgt_port = Nearest_Port(tgt, src_centre);

		Push_Undo();
		const new_connector: Connector = {
			id: Generate_Id('c'),
			source: { shape_id: source_id, port_id: src_port.id, x: 0, y: 0 },
			target: { shape_id: target_id, port_id: tgt_port.id, x: 0, y: 0 },
			arrow_type: tool_settings.arrow_type,
			routing: tool_settings.connector_routing,
			style: { stroke: '#333333', stroke_width: tool_settings.connector_thickness },
			z_index: Next_Z(),
		};
		set_connectors(prev => [...prev, new_connector]);
		Broadcast_Add('connector', new_connector);
	}, [shapes, Push_Undo, tool_settings]);

	const Handle_Tool_Settings_Change = useCallback((changes: Partial<ToolSettings>) => {
		set_tool_settings(prev => ({ ...prev, ...changes }));
		// Activate the corresponding tool when its settings change
		if (changes.shape_type) {
			set_active_tool(changes.shape_type);
		} else if (changes.connector_routing !== undefined || changes.arrow_type !== undefined || changes.connector_thickness !== undefined) {
			set_active_tool('arrow');
		} else if (changes.pen_size !== undefined || changes.pen_color !== undefined) {
			set_active_tool('freehand');
		} else if (changes.text_size !== undefined || changes.text_color !== undefined) {
			set_active_tool('text');
		} else if (changes.laser_color !== undefined) {
			set_active_tool('laser');
		}
	}, []);

	// Get SVG-relative mouse position
	const Get_SVG_Point = useCallback((e: React.MouseEvent | PointerEvent | MouseEvent): Point => {
		const svg = svg_ref.current;
		if (!svg) return { x: 0, y: 0 };
		const rect = svg.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	}, []);

	// ── Pointer events on the SVG background ──

	const Handle_Canvas_PointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
		e.preventDefault(); // Prevent browser native drag behavior on SVG elements
		// Freehand and laser tools should work even when clicking over existing objects
		const on_background = (e.target as Element) === svg_ref.current;
		if (!on_background && active_tool !== 'freehand' && active_tool !== 'laser') return;

		const screen_pt = Get_SVG_Point(e);
		const canvas_pt = Screen_To_Canvas(screen_pt, viewport);

		// Middle-click or right-click → pan
		if (e.button === 1 || e.button === 2) {
			drag_state.current = {
				type: 'pan',
				start_canvas: canvas_pt,
				start_screen: screen_pt,
				start_viewport: { ...viewport },
			};
			e.preventDefault();
			return;
		}

		// Left click on background
		if (e.button === 0) {
			if (active_tool === 'select') {
				// Start marquee selection
				set_selected_ids(new Set());
				drag_state.current = {
					type: 'marquee',
					start_canvas: canvas_pt,
					start_screen: screen_pt,
					marquee_start: canvas_pt,
				};
			} else if (active_tool === 'arrow') {
				// Start connector from free point
				drag_state.current = {
					type: 'connector',
					start_canvas: canvas_pt,
					start_screen: screen_pt,
					connector_source: { shape_id: null, port_id: null, x: canvas_pt.x, y: canvas_pt.y },
				};
			} else if (active_tool === 'text') {
				// Create a text shape immediately and start editing
				Push_Undo();
				const new_shape: Shape = {
					id: Generate_Id('s'),
					type: 'text',
					x: canvas_pt.x - 50,
					y: canvas_pt.y - 15,
					width: 100,
					height: 30,
					rotation: 0,
					text: '',
					style: { ...DEFAULT_STYLE, fill: 'none', stroke: 'none', stroke_width: 0, font_size: tool_settings.text_size, text_colour: tool_settings.text_color },
					ports: Default_Ports(),
					z_index: Next_Z(),
				};
				set_shapes(prev => [...prev, new_shape]);
				Broadcast_Add('shape', new_shape);
				set_selected_ids(new Set([new_shape.id]));
				editing_started_at.current = Date.now();
				set_editing_shape_id(new_shape.id);
				set_active_tool('select');
			} else if (active_tool === 'freehand') {
				Push_Undo();
				drag_state.current = {
					type: 'freehand',
					start_canvas: canvas_pt,
					start_screen: screen_pt,
					freehand_points: [canvas_pt],
				};
			} else if (active_tool === 'laser') {
				const now = Date.now();
				drag_state.current = {
					type: 'laser',
					start_canvas: canvas_pt,
					start_screen: screen_pt,
					laser_points: [{ ...canvas_pt, timestamp: now }],
				};
				set_laser_trail([{ ...canvas_pt, timestamp: now }]);
				// Start fade animation
				const Fade = () => {
					const cutoff = Date.now() - 1500;
					set_laser_trail(prev => {
						const filtered = prev.filter(p => p.timestamp > cutoff);
						if (filtered.length > 0) {
							laser_raf.current = requestAnimationFrame(Fade);
						}
						return filtered;
					});
				};
				cancelAnimationFrame(laser_raf.current);
				laser_raf.current = requestAnimationFrame(Fade);
			} else {
				// Start creating a shape
				const new_shape: Shape = {
					id: Generate_Id('s'),
					type: active_tool as Shape['type'],
					x: canvas_pt.x,
					y: canvas_pt.y,
					width: 0,
					height: 0,
					rotation: 0,
					text: '',
					style: { ...DEFAULT_STYLE, fill: tool_settings.shape_fill, stroke: tool_settings.shape_stroke },
					ports: Default_Ports(),
					z_index: Next_Z(),
				};
				drag_state.current = {
					type: 'create',
					start_canvas: canvas_pt,
					start_screen: screen_pt,
					creating_shape: new_shape,
				};
			}
		}
	}, [viewport, active_tool, Get_SVG_Point, tool_settings]);

	const Handle_Canvas_PointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
		const ds = drag_state.current;

		// Broadcast cursor position even when not dragging
		const screen_pt = Get_SVG_Point(e);
		const canvas_pt = Screen_To_Canvas(screen_pt, viewport);
		collab_ref.current?.Send_Cursor(canvas_pt);

		if (ds.type === 'none') return;

		ds.moved = true;

		if (ds.type === 'pan' && ds.start_viewport) {
			set_viewport({
				...ds.start_viewport,
				offset_x: ds.start_viewport.offset_x + (screen_pt.x - ds.start_screen.x),
				offset_y: ds.start_viewport.offset_y + (screen_pt.y - ds.start_screen.y),
			});
		} else if (ds.type === 'move' && ds.shape_origins) {
			const dx = canvas_pt.x - ds.start_canvas.x;
			const dy = canvas_pt.y - ds.start_canvas.y;
			const should_snap = snap_enabled && !e.altKey;
			set_shapes(prev => prev.map(s => {
				const origin = ds.shape_origins!.get(s.id);
				if (!origin) return s;
				let nx = origin.x + dx;
				let ny = origin.y + dy;
				if (should_snap) {
					nx = Snap_To_Grid(nx, grid_size);
					ny = Snap_To_Grid(ny, grid_size);
				}
				return { ...s, x: nx, y: ny };
			}));
		} else if (ds.type === 'create' && ds.creating_shape) {
			const should_snap = snap_enabled && !e.altKey;
			let bounds = Normalise_Bounds(ds.start_canvas, canvas_pt);
			if (should_snap) {
				bounds = {
					x: Snap_To_Grid(bounds.x, grid_size),
					y: Snap_To_Grid(bounds.y, grid_size),
					width: Snap_To_Grid(bounds.width, grid_size),
					height: Snap_To_Grid(bounds.height, grid_size),
				};
			}
			// Shift constrains to square
			if (e.shiftKey) {
				const size = Math.max(bounds.width, bounds.height);
				bounds = { ...bounds, width: size, height: size };
			}
			ds.creating_shape = {
				...ds.creating_shape,
				x: bounds.x,
				y: bounds.y,
				width: bounds.width,
				height: bounds.height,
			};
			// Force re-render by updating shapes with the temp shape
			set_shapes(prev => {
				const without = prev.filter(s => s.id !== ds.creating_shape!.id);
				return [...without, ds.creating_shape!];
			});
		} else if (ds.type === 'marquee' && ds.marquee_start) {
			const bounds = Normalise_Bounds(ds.marquee_start, canvas_pt);
			set_marquee({
				x: bounds.x, y: bounds.y,
				w: bounds.width, h: bounds.height,
			});
		} else if (ds.type === 'connector') {
			const source_end = ds.connector_source!;
			const from = source_end.shape_id
				? Port_Position(
					shapes.find(s => s.id === source_end.shape_id)!,
					shapes.find(s => s.id === source_end.shape_id)!.ports.find(p => p.id === source_end.port_id)!
				)
				: { x: source_end.x, y: source_end.y };

			// Show port indicators on shape under cursor
			const hover_shape = shapes.find(s =>
				canvas_pt.x >= s.x && canvas_pt.x <= s.x + s.width &&
				canvas_pt.y >= s.y && canvas_pt.y <= s.y + s.height &&
				s.id !== source_end.shape_id
			);
			set_hovered_shape_id(hover_shape?.id ?? null);
			set_connector_preview({ from, to: canvas_pt });
		} else if (ds.type === 'resize' && ds.resize_original && ds.resize_shape_id != null) {
			const orig = ds.resize_original;
			const handle = ds.resize_handle!;
			let { x, y, width, height } = orig;
			const dx = canvas_pt.x - ds.start_canvas.x;
			const dy = canvas_pt.y - ds.start_canvas.y;

			// Handle index: 0=TL, 1=TR, 2=BR, 3=BL, 4=T, 5=R, 6=B, 7=L
			if (handle === 0) { x += dx; y += dy; width -= dx; height -= dy; }
			else if (handle === 1) { y += dy; width += dx; height -= dy; }
			else if (handle === 2) { width += dx; height += dy; }
			else if (handle === 3) { x += dx; width -= dx; height += dy; }
			else if (handle === 4) { y += dy; height -= dy; }
			else if (handle === 5) { width += dx; }
			else if (handle === 6) { height += dy; }
			else if (handle === 7) { x += dx; width -= dx; }

			// Shift constrains to square aspect ratio (corner handles only)
			if (e.shiftKey && handle <= 3) {
				const size = Math.max(width, height);
				if (handle === 0) { x += width - size; y += height - size; }
				else if (handle === 1) { y += height - size; }
				// handle 2: anchor is TL, no adjustment needed
				else if (handle === 3) { x += width - size; }
				width = size;
				height = size;
			}

			if (snap_enabled && !e.altKey) {
				x = Snap_To_Grid(x, grid_size);
				y = Snap_To_Grid(y, grid_size);
				width = Snap_To_Grid(width, grid_size);
				height = Snap_To_Grid(height, grid_size);
			}

			// Enforce minimum size
			if (width < 10) { width = 10; }
			if (height < 10) { height = 10; }

			set_shapes(prev => prev.map(s =>
				s.id === ds.resize_shape_id ? { ...s, x, y, width, height } : s
			));
		} else if (ds.type === 'rotate' && ds.rotate_shape_id) {
			const shape = shapes.find(s => s.id === ds.rotate_shape_id);
			if (shape) {
				const cx = shape.x + shape.width / 2;
				const cy = shape.y + shape.height / 2;
				const current_angle = Math.atan2(canvas_pt.y - cy, canvas_pt.x - cx) * (180 / Math.PI);
				let rotation = (ds.rotate_original ?? 0) + (current_angle - (ds.rotate_start_angle ?? 0));
				// Snap to 15° increments when Shift is held
				if (e.shiftKey) {
					rotation = Math.round(rotation / 15) * 15;
				}
				set_shapes(prev => prev.map(s =>
					s.id === ds.rotate_shape_id ? { ...s, rotation } : s
				));
			}
		} else if (ds.type === 'freehand' && ds.freehand_points) {
			ds.freehand_points.push(canvas_pt);
			// Live preview by updating freehand paths
			set_freehand_paths(prev => {
				const without = prev.filter(p => p.id !== '__drawing__');
				return [...without, { id: '__drawing__', points: [...ds.freehand_points!], style: { stroke: tool_settings.pen_color, stroke_width: tool_settings.pen_size }, z_index: Number.MAX_SAFE_INTEGER }];
			});
		} else if (ds.type === 'freehand_move' && ds.freehand_path_origins) {
			ds.moved = true;
			const dx = canvas_pt.x - ds.start_canvas.x;
			const dy = canvas_pt.y - ds.start_canvas.y;
			set_freehand_paths(prev => prev.map(p => {
				const orig = ds.freehand_path_origins!.get(p.id);
				if (!orig) return p;
				return { ...p, points: orig.map(pt => ({ x: pt.x + dx, y: pt.y + dy })) };
			}));
		} else if (ds.type === 'freehand_resize' && ds.freehand_path_origins && ds.freehand_resize_bounds) {
			const orig_bounds = ds.freehand_resize_bounds;
			const handle = ds.freehand_resize_handle ?? 2;
			const dx = canvas_pt.x - ds.start_canvas.x;
			const dy = canvas_pt.y - ds.start_canvas.y;

			// Calculate new bounds based on handle being dragged
			let new_x = orig_bounds.x, new_y = orig_bounds.y;
			let new_w = orig_bounds.width, new_h = orig_bounds.height;
			if (handle === 0) { new_x += dx; new_y += dy; new_w -= dx; new_h -= dy; }
			else if (handle === 1) { new_y += dy; new_w += dx; new_h -= dy; }
			else if (handle === 2) { new_w += dx; new_h += dy; }
			else if (handle === 3) { new_x += dx; new_w -= dx; new_h += dy; }
			if (new_w < 5) new_w = 5;
			if (new_h < 5) new_h = 5;

			// Scale all points from original bounds to new bounds
			const ow = orig_bounds.width || 1;
			const oh = orig_bounds.height || 1;
			set_freehand_paths(prev => prev.map(p => {
				const orig = ds.freehand_path_origins!.get(p.id);
				if (!orig) return p;
				return {
					...p,
					points: orig.map(pt => ({
						x: new_x + ((pt.x - orig_bounds.x) / ow) * new_w,
						y: new_y + ((pt.y - orig_bounds.y) / oh) * new_h,
					})),
				};
			}));
		} else if (ds.type === 'cp_drag' && ds.cp_connector_id != null) {
			// Drag a bézier control point to the current canvas position
			set_connectors(prev => prev.map(c => {
				if (c.id !== ds.cp_connector_id) return c;
				const source_pt = Resolve_Connector_End(c.source, shapes);
				const target_pt = Resolve_Connector_End(c.target, shapes);
				const src_side = Resolve_Port_Side_For_End(c.source, shapes);
				const tgt_side = Resolve_Port_Side_For_End(c.target, shapes);
				const cp = [...(c.control_points || Default_Control_Points(source_pt, target_pt, src_side, tgt_side))];
				cp[ds.cp_index!] = canvas_pt;
				return { ...c, control_points: cp };
			}));
		} else if (ds.type === 'endpoint_drag' && ds.endpoint_connector_id) {
			// Snap to nearest port if cursor is over a shape, otherwise free-floating
			const hover_shape = shapes.find(s =>
				canvas_pt.x >= s.x && canvas_pt.x <= s.x + s.width &&
				canvas_pt.y >= s.y && canvas_pt.y <= s.y + s.height
			);
			set_hovered_shape_id(hover_shape?.id ?? null);

			const new_end: ConnectorEnd = hover_shape
				? { shape_id: hover_shape.id, port_id: Nearest_Port(hover_shape, canvas_pt).id, x: 0, y: 0 }
				: { shape_id: null, port_id: null, x: canvas_pt.x, y: canvas_pt.y };

			// Translate the associated control point by the same delta as the endpoint
			const resolved_new = hover_shape
				? Port_Position(hover_shape, hover_shape.ports.find(p => p.id === new_end.port_id)!)
				: canvas_pt;
			const orig = ds.endpoint_original ?? canvas_pt;
			const dx = resolved_new.x - orig.x;
			const dy = resolved_new.y - orig.y;
			const cp_index = ds.endpoint_end === 'source' ? 0 : 1;
			const orig_cp = ds.endpoint_original_cp;

			set_connectors(prev => prev.map(c => {
				if (c.id !== ds.endpoint_connector_id) return c;
				const src_pt = Resolve_Connector_End(c.source, shapes);
				const tgt_pt = Resolve_Connector_End(c.target, shapes);
				const src_side = Resolve_Port_Side_For_End(c.source, shapes);
				const tgt_side = Resolve_Port_Side_For_End(c.target, shapes);
				const cp = [...(c.control_points || Default_Control_Points(src_pt, tgt_pt, src_side, tgt_side))];
				if (orig_cp) {
					cp[cp_index] = { x: orig_cp.x + dx, y: orig_cp.y + dy };
				}
				if (ds.endpoint_end === 'source') {
					return { ...c, source: new_end, control_points: cp };
				}
				return { ...c, target: new_end, control_points: cp };
			}));
		} else if (ds.type === 'laser' && ds.laser_points) {
			const now = Date.now();
			ds.laser_points.push({ ...canvas_pt, timestamp: now });
			set_laser_trail(prev => [...prev.filter(p => p.timestamp > now - 1500), { ...canvas_pt, timestamp: now }]);
		}
	}, [viewport, shapes, Get_SVG_Point, tool_settings]);

	const Handle_Canvas_PointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
		const ds = drag_state.current;

		if (ds.type === 'create' && ds.creating_shape) {
			const shape = ds.creating_shape;
			// Require a minimum size
			if (shape.width < 10 || shape.height < 10) {
				// Clicked without dragging — create a default-sized shape
				shape.width = shape.type === 'text' ? 100 : 120;
				shape.height = shape.type === 'text' ? 30 : 80;
			}
			Push_Undo();
			set_shapes(prev => {
				const without = prev.filter(s => s.id !== shape.id);
				return [...without, shape];
			});
			Broadcast_Add('shape', shape);
			set_selected_ids(new Set([shape.id]));
			set_active_tool('select');
		} else if (ds.type === 'marquee' && ds.marquee_start) {
			const canvas_pt = Screen_To_Canvas(Get_SVG_Point(e), viewport);
			const sel_bounds = Normalise_Bounds(ds.marquee_start, canvas_pt);
			const ids = new Set<string>();
			for (const shape of shapes) {
				if (Bounds_Overlap(sel_bounds, Shape_Bounds(shape))) {
					ids.add(shape.id);
				}
			}
			// Also select freehand paths whose bounding box overlaps
			for (const fp of freehand_paths) {
				if (Bounds_Overlap(sel_bounds, Freehand_Bounds(fp.points))) {
					ids.add(fp.id);
				}
			}
			set_selected_ids(ids);
			set_marquee(null);
		} else if (ds.type === 'connector') {
			set_connector_preview(null);
			const canvas_pt = Screen_To_Canvas(Get_SVG_Point(e), viewport);
			const target_shape = shapes.find(s =>
				canvas_pt.x >= s.x && canvas_pt.x <= s.x + s.width &&
				canvas_pt.y >= s.y && canvas_pt.y <= s.y + s.height
			);

			// Determine target end — snap to shape port or free point
			const target_end: ConnectorEnd = target_shape && target_shape.id !== ds.connector_source?.shape_id
				? { shape_id: target_shape.id, port_id: Nearest_Port(target_shape, canvas_pt).id, x: 0, y: 0 }
				: { shape_id: null, port_id: null, x: canvas_pt.x, y: canvas_pt.y };

			// Require minimum drag distance to avoid accidental connectors
			const dx = canvas_pt.x - ds.start_canvas.x;
			const dy = canvas_pt.y - ds.start_canvas.y;
			if (Math.hypot(dx, dy) > 5 && !(target_shape && target_shape.id === ds.connector_source?.shape_id)) {
				Push_Undo();
				const new_connector: Connector = {
					id: Generate_Id('c'),
					source: ds.connector_source!,
					target: target_end,
					arrow_type: tool_settings.arrow_type,
					routing: tool_settings.connector_routing,
					style: { stroke: '#333333', stroke_width: tool_settings.connector_thickness },
					z_index: Next_Z(),
				};
				set_connectors(prev => [...prev, new_connector]);
				Broadcast_Add('connector', new_connector);
			}
		} else if (ds.type === 'move') {
			// Broadcast updated shapes and connectors after move
			for (const id of selected_ids) {
				const s = shapes.find(sh => sh.id === id);
				if (s) Broadcast_Update('shape', s);
			}
		} else if (ds.type === 'resize') {
			// Broadcast resized shape
			for (const id of selected_ids) {
				const s = shapes.find(sh => sh.id === id);
				if (s) Broadcast_Update('shape', s);
			}
		} else if (ds.type === 'rotate') {
			// Broadcast rotated shape
			for (const id of selected_ids) {
				const s = shapes.find(sh => sh.id === id);
				if (s) Broadcast_Update('shape', s);
			}
		} else if (ds.type === 'freehand' && ds.freehand_points) {
			// Finalize freehand path — simplify then smooth for natural-looking curves
			if (ds.freehand_points.length > 1) {
				const simplified = Simplify_Points(ds.freehand_points, 2);
				const smoothed = Smooth_Points(simplified, 2);
				const path: FreehandPath = {
					id: Generate_Id('f'),
					points: smoothed,
					style: { stroke: tool_settings.pen_color, stroke_width: tool_settings.pen_size },
					z_index: Next_Z(),
				};
				set_freehand_paths(prev => [...prev.filter(p => p.id !== '__drawing__'), path]);
				Broadcast_Add('freehand', path);
			} else {
				set_freehand_paths(prev => prev.filter(p => p.id !== '__drawing__'));
			}
		} else if (ds.type === 'freehand_move') {
			// Broadcast moved freehand path
			for (const id of selected_ids) {
				const fp = freehand_paths.find(f => f.id === id);
				if (fp) Broadcast_Update('freehand', fp);
			}
		} else if (ds.type === 'freehand_resize') {
			// Broadcast resized freehand path
			for (const id of selected_ids) {
				const fp = freehand_paths.find(f => f.id === id);
				if (fp) Broadcast_Update('freehand', fp);
			}
		} else if (ds.type === 'cp_drag') {
			// Broadcast updated connector after CP drag
			if (ds.cp_connector_id) {
				const c = connectors.find(cn => cn.id === ds.cp_connector_id);
				if (c) Broadcast_Update('connector', c);
			}
		} else if (ds.type === 'endpoint_drag' && ds.endpoint_connector_id) {
			set_hovered_shape_id(null);
			// If snapped to a shape port, recalculate the dragged end's CP to be perpendicular
			const ep_connector_id = ds.endpoint_connector_id;
			set_connectors(prev => prev.map(c => {
				if (c.id !== ep_connector_id) return c;
				const end = ds.endpoint_end === 'source' ? c.source : c.target;
				if (!end.shape_id || !end.port_id) {
					// free-floating — keep translated CPs, broadcast current state
					Broadcast_Update('connector', c);
					return c;
				}

				const src_pt = Resolve_Connector_End(c.source, shapes);
				const tgt_pt = Resolve_Connector_End(c.target, shapes);
				const src_side = Resolve_Port_Side_For_End(c.source, shapes);
				const tgt_side = Resolve_Port_Side_For_End(c.target, shapes);
				const defaults = Default_Control_Points(src_pt, tgt_pt, src_side, tgt_side);
				const cp = [...(c.control_points || defaults)];
				const cp_index = ds.endpoint_end === 'source' ? 0 : 1;
				cp[cp_index] = defaults[cp_index]; // perpendicular to the snapped port
				const updated = { ...c, control_points: cp };
				Broadcast_Update('connector', updated);
				return updated;
			}));
		} else if (ds.type === 'laser') {
			// Laser trail fades on its own via animation
		}

		drag_state.current = { type: 'none', start_canvas: { x: 0, y: 0 }, start_screen: { x: 0, y: 0 } };
	}, [shapes, viewport, Push_Undo, Get_SVG_Point, tool_settings]);

	// ── Shape pointer events ──

	const Handle_Shape_PointerDown = useCallback((e: React.PointerEvent, shape: Shape) => {
		// When drawing or using laser, let the event bubble up to the canvas handler
		if (active_tool === 'freehand' || active_tool === 'laser') return;
		e.preventDefault();

		e.stopPropagation();
		const screen_pt = Get_SVG_Point(e);
		const canvas_pt = Screen_To_Canvas(screen_pt, viewport);

		// Check if clicking on a resize handle
		const target = e.target as Element;
		const handle_index = target.getAttribute('data-handle-index');
		if (handle_index !== null && selected_ids.has(shape.id)) {
			Push_Undo();
			drag_state.current = {
				type: 'resize',
				start_canvas: canvas_pt,
				start_screen: screen_pt,
				resize_shape_id: shape.id,
				resize_handle: parseInt(handle_index),
				resize_original: { x: shape.x, y: shape.y, width: shape.width, height: shape.height },
			};
			return;
		}

		// Check if clicking on the rotate handle
		if (target.getAttribute('data-rotate-handle') && selected_ids.has(shape.id)) {
			const cx = shape.x + shape.width / 2;
			const cy = shape.y + shape.height / 2;
			const start_angle = Math.atan2(canvas_pt.y - cy, canvas_pt.x - cx) * (180 / Math.PI);
			Push_Undo();
			drag_state.current = {
				type: 'rotate',
				start_canvas: canvas_pt,
				start_screen: screen_pt,
				rotate_shape_id: shape.id,
				rotate_start_angle: start_angle,
				rotate_original: shape.rotation ?? 0,
			};
			return;
		}

		// Check if clicking on a port (for connector creation)
		const port_id = target.getAttribute('data-port-id');
		if (port_id && active_tool !== 'arrow') {
			// Start connector from this port
			drag_state.current = {
				type: 'connector',
				start_canvas: canvas_pt,
				start_screen: screen_pt,
				connector_source: { shape_id: shape.id, port_id, x: 0, y: 0 },
			};
			return;
		}

		if (active_tool === 'arrow') {
			const port = Nearest_Port(shape, canvas_pt);
			drag_state.current = {
				type: 'connector',
				start_canvas: canvas_pt,
				start_screen: screen_pt,
				connector_source: { shape_id: shape.id, port_id: port.id, x: 0, y: 0 },
			};
			return;
		}

		// Select the shape
		if (e.shiftKey) {
			// Quick-connect: Shift+click on a shape
			if (quick_connect_source.current && quick_connect_source.current !== shape.id) {
				Quick_Connect(quick_connect_source.current, shape.id);
				quick_connect_source.current = null;
				set_selected_ids(new Set([shape.id]));
				return;
			}
			// First Shift+click — set as source
			quick_connect_source.current = shape.id;
			// Also toggle selection
			set_selected_ids(prev => {
				const next = new Set(prev);
				if (next.has(shape.id)) next.delete(shape.id);
				else next.add(shape.id);
				return next;
			});
		} else {
			quick_connect_source.current = null;
			if (!selected_ids.has(shape.id)) {
				set_selected_ids(new Set([shape.id]));
			}
		}

		// Start dragging
		const ids = selected_ids.has(shape.id) ? selected_ids : new Set([shape.id]);
		const origins = new Map<string, Point>();
		for (const s of shapes) {
			if (ids.has(s.id)) {
				origins.set(s.id, { x: s.x, y: s.y });
			}
		}

		Push_Undo();
		drag_state.current = {
			type: 'move',
			start_canvas: canvas_pt,
			start_screen: screen_pt,
			shape_origins: origins,
			moved: false,
		};
	}, [viewport, active_tool, selected_ids, shapes, Push_Undo, Get_SVG_Point]);

	const Handle_Shape_DoubleClick = useCallback((_e: React.MouseEvent, shape: Shape) => {
		editing_started_at.current = Date.now();
		set_editing_shape_id(shape.id);
		set_selected_ids(new Set([shape.id]));
	}, []);

	const Handle_Text_Change = useCallback((value: string) => {
		if (!editing_shape_id) return;
		set_shapes(prev => prev.map(s =>
			s.id === editing_shape_id ? { ...s, text: value } : s
		));
	}, [editing_shape_id]);

	const Handle_Text_Commit = useCallback(() => {
		// Guard against immediate blur when input first mounts
		if (Date.now() - editing_started_at.current < 200) return;
		set_editing_shape_id(null);
	}, []);

	// ── Canvas double-click → create shape ──
	const Handle_Canvas_DoubleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
		if ((e.target as Element) !== svg_ref.current) return;
		const canvas_pt = Screen_To_Canvas(Get_SVG_Point(e), viewport);
		Push_Undo();
		const new_shape: Shape = {
			id: Generate_Id('s'),
			type: 'rectangle',
			x: canvas_pt.x - 60,
			y: canvas_pt.y - 40,
			width: 120,
			height: 80,
			rotation: 0,
			text: '',
			style: { ...DEFAULT_STYLE, fill: tool_settings.shape_fill, stroke: tool_settings.shape_stroke },
			ports: Default_Ports(),
			z_index: Next_Z(),
		};
		set_shapes(prev => [...prev, new_shape]);
		set_selected_ids(new Set([new_shape.id]));
		editing_started_at.current = Date.now();
		set_editing_shape_id(new_shape.id);
		set_active_tool('select');
	}, [viewport, Push_Undo, Get_SVG_Point]);

	// ── Mouse wheel → zoom ──
	const Handle_Wheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
		e.preventDefault();
		const screen_pt = Get_SVG_Point(e);
		const zoom_factor = e.deltaY < 0 ? 1.1 : 0.9;
		const new_zoom = Math.max(0.1, Math.min(5, viewport.zoom * zoom_factor));

		// Zoom towards the cursor position
		set_viewport(v => ({
			zoom: new_zoom,
			offset_x: screen_pt.x - (screen_pt.x - v.offset_x) * (new_zoom / v.zoom),
			offset_y: screen_pt.y - (screen_pt.y - v.offset_y) * (new_zoom / v.zoom),
		}));
	}, [viewport.zoom, Get_SVG_Point]);

	// Prevent context menu on right-click (we use it for panning)
	const Handle_ContextMenu = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
	}, []);

	// ── Keyboard shortcuts ──
	useEffect(() => {
		function On_KeyDown(e: KeyboardEvent) {
			// Don't handle shortcuts while editing text
			if (editing_shape_id) {
				if (e.key === 'Escape' || e.key === 'Enter') {
					set_editing_shape_id(null);
				}
				return;
			}

			if (e.ctrlKey || e.metaKey) {
				if (e.key === 'z') { e.preventDefault(); Do_Undo(); }
				if (e.key === 'y') { e.preventDefault(); Do_Redo(); }
				if (e.key === 'a') { e.preventDefault(); set_selected_ids(new Set(shapes.map(s => s.id))); }
				if (e.key === 'c') { e.preventDefault(); Copy_Selected(); }
				if (e.key === 'v') { e.preventDefault(); Paste(); }
				if (e.key === 'd') { e.preventDefault(); Duplicate_Selected(); }
				return;
			}

			switch (e.key) {
				case 'Delete':
				case 'Backspace':
					Delete_Selected();
					break;
				case 'Escape':
					set_selected_ids(new Set());
					set_active_tool('select');
					break;
				case 'F2':
					// Edit text of selected shape
					if (selected_ids.size === 1) {
						const id = Array.from(selected_ids)[0];
						editing_started_at.current = Date.now();
						set_editing_shape_id(id);
					}
					e.preventDefault();
					break;
				case 'v': case 'V': set_active_tool('select'); break;
				case 's': case 'S': set_active_tool(tool_settings.shape_type); break;
				case 't': case 'T': set_active_tool('text'); break;
				case 'a': case 'A': set_active_tool('arrow'); break;
				case 'p': case 'P': set_active_tool('freehand'); break;
				case 'l': case 'L': set_active_tool('laser'); break;
				case 'g': case 'G': set_snap_enabled(prev => !prev); break;
			}
		}

		window.addEventListener('keydown', On_KeyDown);
		return () => window.removeEventListener('keydown', On_KeyDown);
	}, [editing_shape_id, shapes, Do_Undo, Do_Redo, Delete_Selected, Copy_Selected, Paste, Duplicate_Selected, tool_settings.shape_type]);

	// Connector click handler
	const Handle_Connector_PointerDown = useCallback((e: React.PointerEvent, connector: Connector) => {
		if (active_tool === 'freehand' || active_tool === 'laser') return;

		e.preventDefault();
		e.stopPropagation();
		if (e.shiftKey) {
			set_selected_ids(prev => {
				const next = new Set(prev);
				if (next.has(connector.id)) next.delete(connector.id);
				else next.add(connector.id);
				return next;
			});
		} else {
			set_selected_ids(new Set([connector.id]));
		}
	}, [active_tool]);

	// Board persistence handlers
	const Handle_Load_Board = useCallback((state: CanvasState) => {
		set_shapes(state.shapes || []);
		set_connectors(state.connectors || []);
		set_freehand_paths(state.freehand_paths || []);
		set_selected_ids(new Set());
		undo_mgr.Clear();
		// Reset z_counter to the max z_index in the loaded state
		const max_z = Math.max(0,
			...(state.shapes || []).map(s => s.z_index ?? 0),
			...(state.connectors || []).map(c => c.z_index ?? 0),
			...(state.freehand_paths || []).map(f => f.z_index ?? 0),
		);
		z_counter.current = max_z;
	}, [undo_mgr]);

	const Handle_Clear_Canvas = useCallback(() => {
		if (!confirm('Clear the entire canvas?')) return;
		Push_Undo();
		set_shapes([]);
		set_connectors([]);
		set_freehand_paths([]);
		set_selected_ids(new Set());
	}, [Push_Undo]);

	// Control point drag handler for smooth connectors
	const Handle_Control_Point_Drag = useCallback((connector_id: string, cp_index: number, e: React.PointerEvent) => {
		const screen_pt = Get_SVG_Point(e);
		const canvas_pt = Screen_To_Canvas(screen_pt, viewport);
		Push_Undo();
		drag_state.current = {
			type: 'cp_drag',
			start_canvas: canvas_pt,
			start_screen: screen_pt,
			cp_connector_id: connector_id,
			cp_index,
		};
	}, [viewport, Push_Undo, Get_SVG_Point]);

	const Handle_Endpoint_Drag = useCallback((connector_id: string, end: 'source' | 'target', e: React.PointerEvent) => {
		const screen_pt = Get_SVG_Point(e);
		const canvas_pt = Screen_To_Canvas(screen_pt, viewport);

		// Capture original endpoint position and its control point
		const conn = connectors.find(c => c.id === connector_id);
		const orig_pt = conn ? Resolve_Connector_End(end === 'source' ? conn.source : conn.target, shapes) : canvas_pt;
		const cp_index = end === 'source' ? 0 : 1;
		const src_pt = conn ? Resolve_Connector_End(conn.source, shapes) : canvas_pt;
		const tgt_pt = conn ? Resolve_Connector_End(conn.target, shapes) : canvas_pt;
		const src_side = conn ? Resolve_Port_Side_For_End(conn.source, shapes) : undefined;
		const tgt_side = conn ? Resolve_Port_Side_For_End(conn.target, shapes) : undefined;
		const cps = conn?.control_points || Default_Control_Points(src_pt, tgt_pt, src_side, tgt_side);
		const orig_cp = cps[cp_index];

		Push_Undo();
		drag_state.current = {
			type: 'endpoint_drag',
			start_canvas: canvas_pt,
			start_screen: screen_pt,
			endpoint_connector_id: connector_id,
			endpoint_end: end,
			endpoint_original: orig_pt,
			endpoint_original_cp: orig_cp,
		};
		set_connector_preview(null);
	}, [viewport, connectors, shapes, Push_Undo, Get_SVG_Point]);

	// Freehand path click handler
	const Handle_Freehand_PointerDown = useCallback((e: React.PointerEvent, path_id: string) => {
		// When drawing or using laser, let the event bubble up to the canvas handler
		if (active_tool === 'freehand' || active_tool === 'laser') return;

		e.preventDefault();
		e.stopPropagation();
		const screen_pt = Get_SVG_Point(e);
		const canvas_pt = Screen_To_Canvas(screen_pt, viewport);

		// Check if clicking on a resize handle of an already-selected freehand path
		const target = e.target as Element;
		const handle_index = target.getAttribute('data-freehand-handle');
		if (handle_index !== null && selected_ids.has(path_id)) {
			const path = freehand_paths.find(p => p.id === path_id);
			if (path) {
				const bounds = Freehand_Bounds(path.points);
				Push_Undo();
				drag_state.current = {
					type: 'freehand_resize',
					start_canvas: canvas_pt,
					start_screen: screen_pt,
					freehand_path_origins: new Map([[path_id, path.points.map(p => ({ ...p }))]]),
					freehand_resize_bounds: { ...bounds },
					freehand_resize_handle: parseInt(handle_index),
				};
				return;
			}
		}

		if (e.shiftKey) {
			set_selected_ids(prev => {
				const next = new Set(prev);
				if (next.has(path_id)) next.delete(path_id);
				else next.add(path_id);
				return next;
			});
		} else {
			if (!selected_ids.has(path_id)) {
				set_selected_ids(new Set([path_id]));
			}
		}

		// Start dragging to move selected freehand paths
		const ids = selected_ids.has(path_id) ? selected_ids : new Set([path_id]);
		const origins = new Map<string, Point[]>();
		for (const p of freehand_paths) {
			if (ids.has(p.id)) {
				origins.set(p.id, p.points.map(pt => ({ ...pt })));
			}
		}
		Push_Undo();
		drag_state.current = {
			type: 'freehand_move',
			start_canvas: canvas_pt,
			start_screen: screen_pt,
			freehand_path_origins: origins,
			moved: false,
		};
	}, [active_tool, viewport, selected_ids, freehand_paths, Push_Undo, Get_SVG_Point]);

	// The editing shape (for text input overlay)
	const editing_shape = editing_shape_id ? shapes.find(s => s.id === editing_shape_id) : null;

	const selected_shapes = shapes.filter(s => selected_ids.has(s.id));
	const selected_connectors = connectors.filter(c => selected_ids.has(c.id));
	const selected_freehand = freehand_paths.filter(f => selected_ids.has(f.id));

	// Properties panel handlers
	const Handle_Position_Change = useCallback((changes: { x?: number; y?: number; width?: number; height?: number; rotation?: number }) => {
		Push_Undo();
		set_shapes(prev => prev.map(s => {
			if (!selected_ids.has(s.id)) return s;
			return {
				...s,
				...(changes.x !== undefined && { x: changes.x }),
				...(changes.y !== undefined && { y: changes.y }),
				...(changes.width !== undefined && { width: changes.width }),
				...(changes.height !== undefined && { height: changes.height }),
				...(changes.rotation !== undefined && { rotation: changes.rotation }),
			};
		}));
	}, [selected_ids, Push_Undo]);

	const Handle_Panel_Text_Change = useCallback((text: string) => {
		set_shapes(prev => prev.map(s =>
			selected_ids.has(s.id) ? { ...s, text } : s
		));
	}, [selected_ids]);

	const Handle_Rounded_Change = useCallback((rounded: boolean) => {
		Push_Undo();
		set_shapes(prev => prev.map(s =>
			selected_ids.has(s.id) ? { ...s, style: { ...s.style, rounded } } : s
		));
	}, [selected_ids, Push_Undo]);

	const Handle_Connector_Change = useCallback((changes: Partial<{ arrow_type: import('./types').ArrowType; routing: import('./types').ConnectorRouting; stroke: string; stroke_width: number }>) => {
		Push_Undo();
		set_connectors(prev => prev.map(c => {
			if (!selected_ids.has(c.id)) return c;
			const updated = { ...c };
			if (changes.arrow_type !== undefined) updated.arrow_type = changes.arrow_type;
			if (changes.routing !== undefined) {
				updated.routing = changes.routing;
				// Clear control points when switching routing so defaults are recalculated
				updated.control_points = undefined;
			}
			if (changes.stroke !== undefined || changes.stroke_width !== undefined) {
				updated.style = {
					...updated.style,
					...(changes.stroke !== undefined && { stroke: changes.stroke }),
					...(changes.stroke_width !== undefined && { stroke_width: changes.stroke_width }),
				};
			}
			Broadcast_Update('connector', updated);
			return updated;
		}));
	}, [selected_ids, Push_Undo]);

	const Handle_Freehand_Change = useCallback((changes: Partial<{ stroke: string; stroke_width: number }>) => {
		Push_Undo();
		set_freehand_paths(prev => prev.map(f => {
			if (!selected_ids.has(f.id)) return f;
			const updated = {
				...f,
				style: {
					...f.style,
					...(changes.stroke !== undefined && { stroke: changes.stroke }),
					...(changes.stroke_width !== undefined && { stroke_width: changes.stroke_width }),
				},
			};
			Broadcast_Update('freehand', updated);
			return updated;
		}));
	}, [selected_ids, Push_Undo]);

	const Handle_Z_Order= useCallback((action: 'bring_front' | 'send_back' | 'bring_forward' | 'send_backward') => {
		Push_Undo();

		// Collect all z_index values across all element types
		type ZItem = { id: string; z: number };
		const all_items: ZItem[] = [
			...shapes.map(s => ({ id: s.id, z: s.z_index ?? 0 })),
			...connectors.map(c => ({ id: c.id, z: c.z_index ?? 0 })),
			...freehand_paths.map(f => ({ id: f.id, z: f.z_index ?? 0 })),
		].sort((a, b) => a.z - b.z);

		const selected_set = selected_ids;
		const sel = all_items.filter(i => selected_set.has(i.id));
		const rest = all_items.filter(i => !selected_set.has(i.id));

		let reordered: ZItem[];
		switch (action) {
			case 'bring_front': reordered = [...rest, ...sel]; break;
			case 'send_back': reordered = [...sel, ...rest]; break;
			case 'bring_forward': {
				reordered = [...all_items];
				for (const s of sel) {
					const idx = reordered.indexOf(s);
					if (idx < reordered.length - 1) {
						reordered.splice(idx, 1);
						reordered.splice(idx + 1, 0, s);
					}
				}
				break;
			}
			case 'send_backward': {
				reordered = [...all_items];
				for (const s of [...sel].reverse()) {
					const idx = reordered.indexOf(s);
					if (idx > 0) {
						reordered.splice(idx, 1);
						reordered.splice(idx - 1, 0, s);
					}
				}
				break;
			}
		}

		// Assign new sequential z_index values
		const z_map = new Map<string, number>();
		reordered.forEach((item, i) => z_map.set(item.id, i + 1));
		z_counter.current = reordered.length;

		set_shapes(prev => prev.map(s => ({ ...s, z_index: z_map.get(s.id) ?? s.z_index })));
		set_connectors(prev => prev.map(c => ({ ...c, z_index: z_map.get(c.id) ?? c.z_index })));
		set_freehand_paths(prev => prev.map(f => ({ ...f, z_index: z_map.get(f.id) ?? f.z_index })));
	}, [selected_ids, shapes, connectors, freehand_paths, Push_Undo]);

	return (
		<div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#f8f9fa' }}>
			<Toolbar
				active_tool={active_tool}
				on_tool_change={set_active_tool}
				tool_settings={tool_settings}
				on_tool_settings_change={Handle_Tool_Settings_Change}
				snap_enabled={snap_enabled}
				on_toggle_snap={() => set_snap_enabled(prev => !prev)}
				grid_size={grid_size}
				on_grid_size_change={set_grid_size}
				on_undo={Do_Undo}
				on_redo={Do_Redo}
				on_delete={Delete_Selected}
				can_undo={undo_mgr.Can_Undo}
				can_redo={undo_mgr.Can_Redo}
				has_selection={selected_ids.size > 0}
			/>

			<BoardPanel
				is_open={show_board_panel}
				on_toggle={() => set_show_board_panel(prev => !prev)}
				current_state={{ shapes, connectors, freehand_paths }}
				on_load_board={Handle_Load_Board}
				on_clear_canvas={Handle_Clear_Canvas}
				current_board_id={current_board_id}
				on_board_id_change={set_current_board_id}
				current_board_name={current_board_name}
				on_board_name_change={set_current_board_name}
			/>

			<svg
				ref={svg_ref}
				style={{ width: '100%', height: '100%', cursor: Active_Cursor(active_tool) }}
				onPointerDown={Handle_Canvas_PointerDown}
				onPointerMove={Handle_Canvas_PointerMove}
				onPointerUp={Handle_Canvas_PointerUp}
				onDoubleClick={Handle_Canvas_DoubleClick}
				onWheel={Handle_Wheel}
				onContextMenu={Handle_ContextMenu}
			>
				{/* Grid patterns — minor lines and major lines */}
				{(() => {
					const major = grid_size * DEFAULT_GRID_MAJOR_MULT;
					return (
						<defs>
							<pattern id="grid-minor"
								width={grid_size * viewport.zoom}
								height={grid_size * viewport.zoom}
								patternUnits="userSpaceOnUse"
								x={viewport.offset_x % (grid_size * viewport.zoom)}
								y={viewport.offset_y % (grid_size * viewport.zoom)}
							>
								<path
									d={`M ${grid_size * viewport.zoom} 0 L 0 0 0 ${grid_size * viewport.zoom}`}
									fill="none" stroke="#e8e8e8" strokeWidth={0.5}
								/>
							</pattern>
							<pattern id="grid-major"
								width={major * viewport.zoom}
								height={major * viewport.zoom}
								patternUnits="userSpaceOnUse"
								x={viewport.offset_x % (major * viewport.zoom)}
								y={viewport.offset_y % (major * viewport.zoom)}
							>
								<rect width="100%" height="100%" fill="url(#grid-minor)" />
								<path
									d={`M ${major * viewport.zoom} 0 L 0 0 0 ${major * viewport.zoom}`}
									fill="none" stroke="#d0d0d0" strokeWidth={1}
								/>
							</pattern>
						</defs>
					);
				})()}
				<rect width="100%" height="100%" fill="url(#grid-major)" pointerEvents="none" />

				{/* Transformed canvas content */}
				<g transform={`translate(${viewport.offset_x}, ${viewport.offset_y}) scale(${viewport.zoom})`}>
					{/* All elements rendered in z-index order */}
					{(() => {
						type RenderItem =
							| { kind: 'shape'; item: Shape }
							| { kind: 'connector'; item: Connector }
							| { kind: 'freehand'; item: FreehandPath };
						const items: RenderItem[] = [
							...shapes.map(s => ({ kind: 'shape' as const, item: s })),
							...connectors.map(c => ({ kind: 'connector' as const, item: c })),
							...freehand_paths.map(f => ({ kind: 'freehand' as const, item: f })),
						];
						items.sort((a, b) => (a.item.z_index ?? 0) - (b.item.z_index ?? 0));

						return items.map(entry => {
							if (entry.kind === 'connector') {
								const c = entry.item;
								return (
									<ConnectorRenderer
										key={c.id}
										connector={c}
										shapes={shapes}
										is_selected={selected_ids.has(c.id)}
										on_pointer_down={Handle_Connector_PointerDown}
										on_control_point_drag={Handle_Control_Point_Drag}
										on_endpoint_drag={Handle_Endpoint_Drag}
									/>
								);
							}
							if (entry.kind === 'shape') {
								const s = entry.item;
								return (
									<ShapeRenderer
										key={s.id}
										shape={s}
										is_selected={selected_ids.has(s.id)}
										is_hovered={hovered_shape_id === s.id}
										on_pointer_down={Handle_Shape_PointerDown}
										on_pointer_enter={(shape) => set_hovered_shape_id(shape.id)}
										on_pointer_leave={() => set_hovered_shape_id(null)}
										on_double_click={Handle_Shape_DoubleClick}
									/>
								);
							}
							if (entry.kind === 'freehand') {
								const path = entry.item;
								const is_sel = selected_ids.has(path.id);
								const is_drawing = path.id === '__drawing__';
								const stroke_points = getStroke(path.points, {
									size: path.style.stroke_width * 2,
									thinning: 0.5,
									smoothing: 0.5,
									streamline: 0.5,
									simulatePressure: true,
									start: { cap: true, taper: 0 },
									end: { cap: true, taper: is_drawing ? 0 : 20 },
									last: !is_drawing,
								});
								const path_d = Get_Svg_Path_From_Stroke(stroke_points);
								const bounds = is_sel ? Freehand_Bounds(path.points) : null;
								const pts_str = path.points.map(p => `${p.x},${p.y}`).join(' ');

								return (
									<g key={path.id} onPointerDown={(e) => Handle_Freehand_PointerDown(e, path.id)}>
										<polyline points={pts_str} fill="none" stroke="transparent" strokeWidth={16} style={{ cursor: 'pointer' }} />
										{is_sel && bounds && bounds.width > 0 && bounds.height > 0 && (
											<>
												<rect
													x={bounds.x - 4} y={bounds.y - 4}
													width={bounds.width + 8} height={bounds.height + 8}
													fill="none" stroke="#00d4ff" strokeWidth={1}
													strokeDasharray="4 2" pointerEvents="none" opacity={0.6}
												/>
												{[
													{ hx: bounds.x - 4, hy: bounds.y - 4, idx: 0, cursor: 'nwse-resize' },
													{ hx: bounds.x + bounds.width + 4, hy: bounds.y - 4, idx: 1, cursor: 'nesw-resize' },
													{ hx: bounds.x + bounds.width + 4, hy: bounds.y + bounds.height + 4, idx: 2, cursor: 'nwse-resize' },
													{ hx: bounds.x - 4, hy: bounds.y + bounds.height + 4, idx: 3, cursor: 'nesw-resize' },
												].map(h => (
													<circle
														key={h.idx}
														cx={h.hx} cy={h.hy} r={4}
														fill="#fff" stroke="#00d4ff" strokeWidth={1.5}
														style={{ cursor: h.cursor }}
														data-freehand-handle={h.idx}
													/>
												))}
											</>
										)}
										<path d={path_d} fill={path.style.stroke} stroke="none" pointerEvents="none" />
									</g>
								);
							}
							return null;
						});
					})()}

					{/* Connector preview while dragging */}
					{connector_preview && (
						<line
							x1={connector_preview.from.x} y1={connector_preview.from.y}
							x2={connector_preview.to.x} y2={connector_preview.to.y}
							stroke="#2196F3"
							strokeWidth={2}
							strokeDasharray="6 3"
							pointerEvents="none"
						/>
					)}

					{/* Laser pointer trail */}
					{laser_trail.length > 0 && (() => {
						const now = Date.now();
						const last = laser_trail[laser_trail.length - 1];
						const lc = tool_settings.laser_color;
						return (
							<>
								{/* Trail segments with fade */}
								{laser_trail.map((pt, i) => {
									if (i === 0) return null;
									const prev = laser_trail[i - 1];
									const age = (now - pt.timestamp) / 1500;
									const opacity = Math.max(0, 1 - age);
									return (
										<line
											key={i}
											x1={prev.x} y1={prev.y}
											x2={pt.x} y2={pt.y}
											stroke={lc}
											strokeWidth={4}
											strokeLinecap="round"
											opacity={opacity}
											pointerEvents="none"
										/>
									);
								})}
								{/* Glowing dot at current position */}
								<circle cx={last.x} cy={last.y} r={8} fill={`${lc}26`} pointerEvents="none" />
								<circle cx={last.x} cy={last.y} r={5} fill={`${lc}4d`} pointerEvents="none" />
								<circle cx={last.x} cy={last.y} r={3} fill={lc} pointerEvents="none" />
							</>
						);
					})()}
				</g>

				{/* Marquee selection (screen coords, outside the transform) */}
				{marquee && (
					<rect
						x={marquee.x * viewport.zoom + viewport.offset_x}
						y={marquee.y * viewport.zoom + viewport.offset_y}
						width={marquee.w * viewport.zoom}
						height={marquee.h * viewport.zoom}
						fill="rgba(33, 150, 243, 0.1)"
						stroke="#2196F3"
						strokeWidth={1}
						strokeDasharray="4 2"
						pointerEvents="none"
					/>
				)}
			</svg>

			{/* Remote cursors overlay (rendered in screen space on top of SVG) */}
			{remote_users.length > 0 && (
				<svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50 }}>
					<RemoteCursors users={remote_users} viewport={viewport} />
				</svg>
			)}

			{/* Collaboration toast */}
			{collab_toast && (
				<div style={{
					position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
					background: '#333', color: '#fff', padding: '8px 20px', borderRadius: 20,
					fontSize: 12, display: 'flex', alignItems: 'center', gap: 8,
					boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 100,
				}}>
					<div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4CAF50' }} />
					{collab_toast}
				</div>
			)}

			{/* Text editing overlay */}
			{editing_shape && (
				<input
					ref={text_input_ref}
					type="text"
					value={editing_shape.text}
					onChange={(e) => Handle_Text_Change(e.target.value)}
					onBlur={Handle_Text_Commit}
					onKeyDown={(e) => {
						if (e.key === 'Enter' || e.key === 'Escape') Handle_Text_Commit();
						e.stopPropagation();
					}}
					style={{
						position: 'absolute',
						left: editing_shape.x * viewport.zoom + viewport.offset_x,
						top: editing_shape.y * viewport.zoom + viewport.offset_y,
						width: editing_shape.width * viewport.zoom,
						height: editing_shape.height * viewport.zoom,
						fontSize: editing_shape.style.font_size * viewport.zoom,
						textAlign: 'center',
						border: '2px solid #2196F3',
						borderRadius: 4,
						outline: 'none',
						background: 'rgba(255,255,255,0.95)',
						zIndex: 200,
						boxSizing: 'border-box',
					}}
				/>
			)}

			{/* Properties panel */}
			<PropertiesPanel
				selected_shapes={selected_shapes}
				selected_connectors={selected_connectors}
				selected_freehand={selected_freehand}
				on_style_change={Apply_Style_Change}
				on_position_change={Handle_Position_Change}
				on_text_change={Handle_Panel_Text_Change}
				on_rounded_change={Handle_Rounded_Change}
				on_z_order={Handle_Z_Order}
				on_connector_change={Handle_Connector_Change}
				on_freehand_change={Handle_Freehand_Change}
				collab_session={collab_session}
				collab_connected={collab_connected}
				remote_users={remote_users}
				on_start_sharing={Handle_Start_Sharing}
				on_stop_sharing={Stop_Collab_Session}
			/>
		</div>
	);
}

function Active_Cursor(tool: ToolType): string {
	switch (tool) {
		case 'select': return 'default';
		case 'arrow': return 'crosshair';
		default: return 'crosshair';
	}
}
