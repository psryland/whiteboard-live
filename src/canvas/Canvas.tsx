import { useCallback, useEffect, useRef, useState } from 'react';
import type { Shape, Connector, CanvasState, ToolType, Viewport, Point, ConnectorEnd, ShapeStyle, FreehandPath, LaserPoint, ToolSettings } from './types';
import { DEFAULT_STYLE, DEFAULT_TOOL_SETTINGS } from './types';
import { Generate_Id, Default_Ports, Screen_To_Canvas, Nearest_Port, Port_Position, Normalise_Bounds, Bounds_Overlap, Shape_Bounds, Snap_To_Grid, DEFAULT_GRID_SIZE, DEFAULT_GRID_MAJOR_MULT, Freehand_Bounds, Simplify_Points, Smooth_Points, Get_Svg_Path_From_Stroke } from './helpers';
import { getStroke } from 'perfect-freehand';
import { UndoManager } from './undo';
import { ShapeRenderer } from './ShapeRenderer';
import { ConnectorRenderer } from './ConnectorRenderer';
import { Toolbar } from './Toolbar';
import { BoardPanel } from './BoardPanel';
import { PropertiesPanel } from './PropertiesPanel';

const STORAGE_KEY = 'whitebored-of-peace';

function Load_State(): CanvasState {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			// Migrate shapes missing the rotation field or rounded style
			const shapes = (parsed.shapes || []).map((s: any) => ({
				rotation: 0,
				...s,
				style: { rounded: false, ...s.style },
			}));
			// Migrate connectors missing arrow_type
			const connectors = (parsed.connectors || []).map((c: any) => ({ arrow_type: 'forward' as const, routing: 'ortho' as const, ...c }));
			return { shapes, connectors, freehand_paths: parsed.freehand_paths || [] };
		}
	} catch { /* ignore */ }
	return { shapes: [], connectors: [], freehand_paths: [] };
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
	const [shapes, set_shapes] = useState<Shape[]>(() => Load_State().shapes);
	const [connectors, set_connectors] = useState<Connector[]>(() => Load_State().connectors);
	const [freehand_paths, set_freehand_paths] = useState<FreehandPath[]>(() => Load_State().freehand_paths);

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
		type: 'none' | 'pan' | 'move' | 'create' | 'marquee' | 'connector' | 'resize' | 'rotate' | 'freehand' | 'laser' | 'freehand_move' | 'freehand_resize' | 'cp_drag';
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
		set_shapes(prev => prev.filter(s => !selected_ids.has(s.id)));
		// Also remove connectors attached to deleted shapes
		set_connectors(prev => prev.filter(c =>
			!selected_ids.has(c.id) &&
			(!c.source.shape_id || !selected_ids.has(c.source.shape_id)) &&
			(!c.target.shape_id || !selected_ids.has(c.target.shape_id))
		));
		set_freehand_paths(prev => prev.filter(p => !selected_ids.has(p.id)));
		set_selected_ids(new Set());
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
			new_shapes.push({ ...s, id: new_id, x: s.x + 20, y: s.y + 20, ports: Default_Ports() });
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
			return { ...s, id: new_id, x: s.x + 30, y: s.y + 30, ports: Default_Ports() };
		});
		const new_connectors = clipboard.current.connectors.map(c => ({
			...c,
			id: Generate_Id('c'),
			source: { ...c.source, shape_id: c.source.shape_id ? (id_map.get(c.source.shape_id) ?? c.source.shape_id) : null },
			target: { ...c.target, shape_id: c.target.shape_id ? (id_map.get(c.target.shape_id) ?? c.target.shape_id) : null },
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
		set_shapes(prev => prev.map(s =>
			selected_ids.has(s.id) ? { ...s, style: { ...s.style, ...changes } } : s
		));
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
		set_connectors(prev => [...prev, {
			id: Generate_Id('c'),
			source: { shape_id: source_id, port_id: src_port.id, x: 0, y: 0 },
			target: { shape_id: target_id, port_id: tgt_port.id, x: 0, y: 0 },
			arrow_type: tool_settings.arrow_type,
			routing: tool_settings.connector_routing,
			style: { stroke: '#333333', stroke_width: tool_settings.connector_thickness },
		}]);
	}, [shapes, Push_Undo, tool_settings]);

	const Handle_Tool_Settings_Change = useCallback((changes: Partial<ToolSettings>) => {
		set_tool_settings(prev => ({ ...prev, ...changes }));
		// If shape_type changed, also change active tool
		if (changes.shape_type) {
			set_active_tool(changes.shape_type);
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
				};
				set_shapes(prev => [...prev, new_shape]);
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
		if (ds.type === 'none') return;

		const screen_pt = Get_SVG_Point(e);
		const canvas_pt = Screen_To_Canvas(screen_pt, viewport);
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
				return [...without, { id: '__drawing__', points: [...ds.freehand_points!], style: { stroke: tool_settings.pen_color, stroke_width: tool_settings.pen_size } }];
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
				const cp = [...(c.control_points || [{ x: 0, y: 0 }, { x: 0, y: 0 }])];
				cp[ds.cp_index!] = canvas_pt;
				return { ...c, control_points: cp };
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
			// Check if we landed on a shape port
			const canvas_pt = Screen_To_Canvas(Get_SVG_Point(e), viewport);
			const target_shape = shapes.find(s =>
				canvas_pt.x >= s.x && canvas_pt.x <= s.x + s.width &&
				canvas_pt.y >= s.y && canvas_pt.y <= s.y + s.height
			);
			if (target_shape && target_shape.id !== ds.connector_source?.shape_id) {
				const target_port = Nearest_Port(target_shape, canvas_pt);
				Push_Undo();
				const new_connector: Connector = {
					id: Generate_Id('c'),
					source: ds.connector_source!,
					target: {
						shape_id: target_shape.id,
						port_id: target_port.id,
						x: 0,
						y: 0,
					},
					arrow_type: tool_settings.arrow_type,
					routing: tool_settings.connector_routing,
					style: { stroke: '#333333', stroke_width: tool_settings.connector_thickness },
				};
				set_connectors(prev => [...prev, new_connector]);
			}
		} else if (ds.type === 'move') {
			// Move complete — nothing special needed
		} else if (ds.type === 'resize') {
			// Resize complete
		} else if (ds.type === 'rotate') {
			// Rotate complete
		} else if (ds.type === 'freehand' && ds.freehand_points) {
			// Finalize freehand path — simplify then smooth for natural-looking curves
			if (ds.freehand_points.length > 1) {
				const simplified = Simplify_Points(ds.freehand_points, 2);
				const smoothed = Smooth_Points(simplified, 2);
				const path: FreehandPath = {
					id: Generate_Id('f'),
					points: smoothed,
					style: { stroke: tool_settings.pen_color, stroke_width: tool_settings.pen_size },
				};
				set_freehand_paths(prev => [...prev.filter(p => p.id !== '__drawing__'), path]);
			} else {
				set_freehand_paths(prev => prev.filter(p => p.id !== '__drawing__'));
			}
		} else if (ds.type === 'freehand_move') {
			// Move complete
		} else if (ds.type === 'freehand_resize') {
			// Resize complete
		} else if (ds.type === 'cp_drag') {
			// Control point drag complete
		} else if (ds.type === 'laser') {
			// Laser trail fades on its own via animation
		}

		drag_state.current = { type: 'none', start_canvas: { x: 0, y: 0 }, start_screen: { x: 0, y: 0 } };
	}, [shapes, viewport, Push_Undo, Get_SVG_Point, tool_settings]);

	// ── Shape pointer events ──

	const Handle_Shape_PointerDown = useCallback((e: React.PointerEvent, shape: Shape) => {
		// When drawing or using laser, let the event bubble up to the canvas handler
		if (active_tool === 'freehand' || active_tool === 'laser') return;

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

	// Freehand path click handler
	const Handle_Freehand_PointerDown = useCallback((e: React.PointerEvent, path_id: string) => {
		// When drawing or using laser, let the event bubble up to the canvas handler
		if (active_tool === 'freehand' || active_tool === 'laser') return;

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
					{/* Connectors behind shapes */}
					{connectors.map(c => (
						<ConnectorRenderer
							key={c.id}
							connector={c}
							shapes={shapes}
							is_selected={selected_ids.has(c.id)}
							on_pointer_down={Handle_Connector_PointerDown}
							on_control_point_drag={Handle_Control_Point_Drag}
						/>
					))}

					{/* Shapes */}
					{shapes.map(s => (
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
					))}

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

					{/* Freehand paths */}
					{freehand_paths.map(path => {
						const is_sel = selected_ids.has(path.id);
						const is_drawing = path.id === '__drawing__';

						// Generate the pressure-sensitive stroke outline
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

						// Also create a simple polyline for the hit area
						const pts_str = path.points.map(p => `${p.x},${p.y}`).join(' ');

						return (
							<g key={path.id} onPointerDown={(e) => Handle_Freehand_PointerDown(e, path.id)}>
								{/* Fat invisible hit area */}
								<polyline
									points={pts_str}
									fill="none" stroke="transparent" strokeWidth={16}
									style={{ cursor: 'pointer' }}
								/>
								{/* Selection bounding box + handles */}
								{is_sel && bounds && bounds.width > 0 && bounds.height > 0 && (
									<>
										<rect
											x={bounds.x - 4} y={bounds.y - 4}
											width={bounds.width + 8} height={bounds.height + 8}
											fill="none" stroke="#00d4ff" strokeWidth={1}
											strokeDasharray="4 2" pointerEvents="none" opacity={0.6}
										/>
										{/* Corner resize handles */}
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
								{/* Pressure-sensitive filled stroke */}
								<path
									d={path_d}
									fill={path.style.stroke}
									stroke="none"
									pointerEvents="none"
								/>
							</g>
						);
					})}

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
				on_style_change={Apply_Style_Change}
				on_position_change={Handle_Position_Change}
				on_text_change={Handle_Panel_Text_Change}
				on_opacity_change={() => {}}
				on_rounded_change={Handle_Rounded_Change}
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
