import { useCallback, useEffect, useRef, useState } from 'react';
import type { Shape, Connector, CanvasState, ToolType, Viewport, Point, ConnectorEnd, ShapeStyle } from './types';
import { DEFAULT_STYLE } from './types';
import { Generate_Id, Default_Ports, Screen_To_Canvas, Nearest_Port, Port_Position, Normalise_Bounds, Bounds_Overlap, Shape_Bounds } from './helpers';
import { UndoManager } from './undo';
import { ShapeRenderer } from './ShapeRenderer';
import { ConnectorRenderer } from './ConnectorRenderer';
import { Toolbar } from './Toolbar';
import { ColourPicker } from './ColourPicker';
import { ShapePalette } from './ShapePalette';

const STORAGE_KEY = 'whitebored-of-peace';

function Load_State(): CanvasState {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) return JSON.parse(raw);
	} catch { /* ignore */ }
	return { shapes: [], connectors: [] };
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

	// Viewport (pan/zoom)
	const [viewport, set_viewport] = useState<Viewport>({ offset_x: 0, offset_y: 0, zoom: 1 });

	// Tool & interaction state
	const [active_tool, set_active_tool] = useState<ToolType>('select');
	const [selected_ids, set_selected_ids] = useState<Set<string>>(new Set());
	const [hovered_shape_id, set_hovered_shape_id] = useState<string | null>(null);

	// Drag state
	const drag_state = useRef<{
		type: 'none' | 'pan' | 'move' | 'create' | 'marquee' | 'connector';
		start_canvas: Point;
		start_screen: Point;
		start_viewport?: Viewport;
		moved?: boolean;
		// For shape dragging — original positions of selected shapes
		shape_origins?: Map<string, Point>;
		// For shape creation — the shape being created
		creating_shape?: Shape;
		// For marquee selection
		marquee_start?: Point;
		// For connector creation
		connector_source?: ConnectorEnd;
	}>({ type: 'none', start_canvas: { x: 0, y: 0 }, start_screen: { x: 0, y: 0 } });

	// Marquee rectangle (screen coords for overlay display)
	const [marquee, set_marquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

	// In-progress connector preview
	const [connector_preview, set_connector_preview] = useState<{ from: Point; to: Point } | null>(null);

	// Text editing
	const [editing_shape_id, set_editing_shape_id] = useState<string | null>(null);
	const text_input_ref = useRef<HTMLInputElement>(null);

	// Colour picker
	const [show_colour_picker, set_show_colour_picker] = useState(false);

	// Shape palette sidebar
	const [show_shape_palette, set_show_shape_palette] = useState(false);

	// Quick-connect: track the first shape for Shift+click connection
	const quick_connect_source = useRef<string | null>(null);

	// Clipboard for copy/paste
	const clipboard = useRef<{ shapes: Shape[]; connectors: Connector[] } | null>(null);

	// Persist state on change
	useEffect(() => {
		Save_State({ shapes, connectors });
	}, [shapes, connectors]);

	// Focus text input when editing
	useEffect(() => {
		if (editing_shape_id && text_input_ref.current) {
			text_input_ref.current.focus();
			text_input_ref.current.select();
		}
	}, [editing_shape_id]);

	// Save undo snapshot before making a change
	const Push_Undo = useCallback(() => {
		undo_mgr.Push({ shapes, connectors });
	}, [shapes, connectors, undo_mgr]);

	const Do_Undo = useCallback(() => {
		const prev = undo_mgr.Undo({ shapes, connectors });
		if (prev) {
			set_shapes(prev.shapes);
			set_connectors(prev.connectors);
			set_selected_ids(new Set());
		}
	}, [shapes, connectors, undo_mgr]);

	const Do_Redo = useCallback(() => {
		const next = undo_mgr.Redo({ shapes, connectors });
		if (next) {
			set_shapes(next.shapes);
			set_connectors(next.connectors);
			set_selected_ids(new Set());
		}
	}, [shapes, connectors, undo_mgr]);

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
			style: { stroke: '#333333', stroke_width: 2 },
		}]);
	}, [shapes, Push_Undo]);

	// Get SVG-relative mouse position
	const Get_SVG_Point = useCallback((e: React.MouseEvent | PointerEvent | MouseEvent): Point => {
		const svg = svg_ref.current;
		if (!svg) return { x: 0, y: 0 };
		const rect = svg.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	}, []);

	// ── Pointer events on the SVG background ──

	const Handle_Canvas_PointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
		// Only handle clicks on the SVG background, not on shapes
		if ((e.target as Element) !== svg_ref.current) return;

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
			} else {
				// Start creating a shape
				const new_shape: Shape = {
					id: Generate_Id('s'),
					type: active_tool as Shape['type'],
					x: canvas_pt.x,
					y: canvas_pt.y,
					width: 0,
					height: 0,
					text: '',
					style: { ...DEFAULT_STYLE },
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
	}, [viewport, active_tool, Get_SVG_Point]);

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
			set_shapes(prev => prev.map(s => {
				const origin = ds.shape_origins!.get(s.id);
				if (!origin) return s;
				return { ...s, x: origin.x + dx, y: origin.y + dy };
			}));
		} else if (ds.type === 'create' && ds.creating_shape) {
			const bounds = Normalise_Bounds(ds.start_canvas, canvas_pt);
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
		}
	}, [viewport, shapes, Get_SVG_Point]);

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
					style: { stroke: '#333333', stroke_width: 2 },
				};
				set_connectors(prev => [...prev, new_connector]);
			}
		} else if (ds.type === 'move') {
			// Move complete — nothing special needed
		}

		drag_state.current = { type: 'none', start_canvas: { x: 0, y: 0 }, start_screen: { x: 0, y: 0 } };
	}, [shapes, viewport, Push_Undo, Get_SVG_Point]);

	// ── Shape pointer events ──

	const Handle_Shape_PointerDown = useCallback((e: React.PointerEvent, shape: Shape) => {
		e.stopPropagation();
		const screen_pt = Get_SVG_Point(e);
		const canvas_pt = Screen_To_Canvas(screen_pt, viewport);

		// Check if clicking on a port (for connector creation)
		const target = e.target as Element;
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
			text: '',
			style: { ...DEFAULT_STYLE },
			ports: Default_Ports(),
		};
		set_shapes(prev => [...prev, new_shape]);
		set_selected_ids(new Set([new_shape.id]));
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
				case 'v': case 'V': set_active_tool('select'); break;
				case 'r': case 'R': set_active_tool('rectangle'); break;
				case 'o': case 'O': set_active_tool('ellipse'); break;
				case 'd': case 'D': set_active_tool('diamond'); break;
				case 't': case 'T': set_active_tool('text'); break;
				case 'a': case 'A': set_active_tool('arrow'); break;
			}
		}

		window.addEventListener('keydown', On_KeyDown);
		return () => window.removeEventListener('keydown', On_KeyDown);
	}, [editing_shape_id, shapes, Do_Undo, Do_Redo, Delete_Selected, Copy_Selected, Paste, Duplicate_Selected]);

	// Connector click handler
	const Handle_Connector_PointerDown = useCallback((e: React.PointerEvent, connector: Connector) => {
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
	}, []);

	// The editing shape (for text input overlay)
	const editing_shape = editing_shape_id ? shapes.find(s => s.id === editing_shape_id) : null;

	// Get the style of the first selected shape (for the colour picker)
	const selected_shape_style = (() => {
		for (const s of shapes) {
			if (selected_ids.has(s.id)) return s.style;
		}
		return DEFAULT_STYLE;
	})();

	return (
		<div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#f8f9fa' }}>
			<Toolbar
				active_tool={active_tool}
				on_tool_change={set_active_tool}
				on_undo={Do_Undo}
				on_redo={Do_Redo}
				on_delete={Delete_Selected}
				on_toggle_colour_picker={() => set_show_colour_picker(prev => !prev)}
				on_duplicate={Duplicate_Selected}
				can_undo={undo_mgr.Can_Undo}
				can_redo={undo_mgr.Can_Redo}
				has_selection={selected_ids.size > 0}
			/>

			{show_colour_picker && selected_ids.size > 0 && (
				<ColourPicker
					style={selected_shape_style}
					on_change={Apply_Style_Change}
					on_close={() => set_show_colour_picker(false)}
				/>
			)}

			<ShapePalette
				on_select_tool={(tool) => { set_active_tool(tool); set_show_shape_palette(false); }}
				is_open={show_shape_palette}
				on_toggle={() => set_show_shape_palette(prev => !prev)}
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
				{/* Grid pattern */}
				<defs>
					<pattern id="grid" width={20 * viewport.zoom} height={20 * viewport.zoom} patternUnits="userSpaceOnUse"
						x={viewport.offset_x % (20 * viewport.zoom)}
						y={viewport.offset_y % (20 * viewport.zoom)}
					>
						<circle cx={1} cy={1} r={0.5} fill="#ddd" />
					</pattern>
				</defs>
				<rect width="100%" height="100%" fill="url(#grid)" pointerEvents="none" />

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
