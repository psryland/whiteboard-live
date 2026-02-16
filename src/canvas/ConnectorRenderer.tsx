import type { Connector, Shape, Point } from './types';
import { Port_Position, Default_Control_Points } from './helpers';

interface ConnectorRendererProps {
	connector: Connector;
	shapes: Shape[];
	is_selected: boolean;
	on_pointer_down: (e: React.PointerEvent, connector: Connector) => void;
	on_control_point_drag?: (connector_id: string, cp_index: number, e: React.PointerEvent) => void;
	on_endpoint_drag?: (connector_id: string, end: 'source' | 'target', e: React.PointerEvent) => void;
}

export function ConnectorRenderer({ connector, shapes, is_selected, on_pointer_down, on_control_point_drag, on_endpoint_drag }: ConnectorRendererProps) {
	const source = Resolve_End(connector.source, shapes);
	const target = Resolve_End(connector.target, shapes);

	if (!source || !target) return null;

	const { stroke, stroke_width } = connector.style;
	const active_stroke = is_selected ? '#2196F3' : stroke;
	const active_width = is_selected ? stroke_width + 1 : stroke_width;

	// Default to 'forward' for legacy connectors
	const arrow_type = connector.arrow_type ?? 'forward';
	const routing = connector.routing ?? 'ortho';

	// Resolve port sides for perpendicular control points
	const source_side = Resolve_Port_Side(connector.source, shapes);
	const target_side = Resolve_Port_Side(connector.target, shapes);

	// Resolve control points for smooth routing
	const cp = connector.control_points ?? Default_Control_Points(source, target, source_side, target_side);

	if (routing === 'smooth') {
		// Cubic bézier spline
		const d = `M ${source.x} ${source.y} C ${cp[0].x} ${cp[0].y}, ${cp[1].x} ${cp[1].y}, ${target.x} ${target.y}`;

		// Arrow heads computed from tangent at endpoints
		const target_arrow = (arrow_type === 'forward' || arrow_type === 'both')
			? Arrow_Head(cp[1], target, stroke_width)
			: null;
		const source_arrow = (arrow_type === 'back' || arrow_type === 'both')
			? Arrow_Head(cp[0], source, stroke_width)
			: null;

		return (
			<g onPointerDown={(e) => on_pointer_down(e, connector)} data-connector-id={connector.id}>
				{/* Fat invisible hit area */}
				<path d={d} fill="none" stroke="transparent" strokeWidth={12} style={{ cursor: 'pointer' }} />
				{/* Visible curve */}
				<path d={d} fill="none" stroke={active_stroke} strokeWidth={active_width} pointerEvents="none" />
				{target_arrow && <polygon points={Arrow_Points(target_arrow)} fill={active_stroke} pointerEvents="none" />}
				{source_arrow && <polygon points={Arrow_Points(source_arrow)} fill={active_stroke} pointerEvents="none" />}
				{/* Control point + endpoint handles when selected */}
				{is_selected && (
					<>
						<line x1={source.x} y1={source.y} x2={cp[0].x} y2={cp[0].y}
							stroke="#aaa" strokeWidth={1} strokeDasharray="3 2" pointerEvents="none" />
						<line x1={target.x} y1={target.y} x2={cp[1].x} y2={cp[1].y}
							stroke="#aaa" strokeWidth={1} strokeDasharray="3 2" pointerEvents="none" />
						{cp.map((pt, i) => (
							<circle
								key={i}
								cx={pt.x} cy={pt.y} r={5}
								fill="#fff" stroke="#2196F3" strokeWidth={1.5}
								style={{ cursor: 'move' }}
								onPointerDown={(e) => { e.stopPropagation(); on_control_point_drag?.(connector.id, i, e); }}
							/>
						))}
						<EndpointHandle pt={source} end="source" connector_id={connector.id} on_drag={on_endpoint_drag} />
						<EndpointHandle pt={target} end="target" connector_id={connector.id} on_drag={on_endpoint_drag} />
					</>
				)}
			</g>
		);
	}

	// Use orthogonal routing when both ends are bound to shape ports and routing is ortho
	const use_ortho = routing === 'ortho' && connector.source.shape_id && connector.target.shape_id
		&& connector.source.port_id && connector.target.port_id;

	if (use_ortho) {
		const src_shape = shapes.find(s => s.id === connector.source.shape_id);
		const tgt_shape = shapes.find(s => s.id === connector.target.shape_id);
		const src_port = src_shape?.ports.find(p => p.id === connector.source.port_id);
		const tgt_port = tgt_shape?.ports.find(p => p.id === connector.target.port_id);

		if (src_port && tgt_port) {
			const path = Orthogonal_Path(source, target, src_port.side, tgt_port.side);

			const target_arrow = (arrow_type === 'forward' || arrow_type === 'both')
				? Arrow_Head(path[path.length - 2] || source, target, stroke_width)
				: null;
			const source_arrow = (arrow_type === 'back' || arrow_type === 'both')
				? Arrow_Head(path[1] || target, source, stroke_width)
				: null;

			return (
				<g onPointerDown={(e) => on_pointer_down(e, connector)} data-connector-id={connector.id}>
					<polyline points={path.map(p => `${p.x},${p.y}`).join(' ')}
						fill="none" stroke="transparent" strokeWidth={12} style={{ cursor: 'pointer' }} />
					<polyline points={path.map(p => `${p.x},${p.y}`).join(' ')}
						fill="none" stroke={active_stroke} strokeWidth={active_width} pointerEvents="none" />
					{target_arrow && <polygon points={Arrow_Points(target_arrow)} fill={active_stroke} pointerEvents="none" />}
					{source_arrow && <polygon points={Arrow_Points(source_arrow)} fill={active_stroke} pointerEvents="none" />}
					{is_selected && (
						<>
							<EndpointHandle pt={source} end="source" connector_id={connector.id} on_drag={on_endpoint_drag} />
							<EndpointHandle pt={target} end="target" connector_id={connector.id} on_drag={on_endpoint_drag} />
						</>
					)}
				</g>
			);
		}
	}

	// Straight line fallback
	const target_arrow = (arrow_type === 'forward' || arrow_type === 'both')
		? Arrow_Head(source, target, stroke_width)
		: null;
	const source_arrow = (arrow_type === 'back' || arrow_type === 'both')
		? Arrow_Head(target, source, stroke_width)
		: null;

	return (
		<g onPointerDown={(e) => on_pointer_down(e, connector)} data-connector-id={connector.id}>
			<line x1={source.x} y1={source.y} x2={target.x} y2={target.y}
				stroke="transparent" strokeWidth={12} style={{ cursor: 'pointer' }} />
			<line x1={source.x} y1={source.y} x2={target.x} y2={target.y}
				stroke={active_stroke} strokeWidth={active_width} pointerEvents="none" />
			{target_arrow && <polygon points={Arrow_Points(target_arrow)} fill={active_stroke} pointerEvents="none" />}
			{source_arrow && <polygon points={Arrow_Points(source_arrow)} fill={active_stroke} pointerEvents="none" />}
			{is_selected && (
				<>
					<EndpointHandle pt={source} end="source" connector_id={connector.id} on_drag={on_endpoint_drag} />
					<EndpointHandle pt={target} end="target" connector_id={connector.id} on_drag={on_endpoint_drag} />
				</>
			)}
		</g>
	);
}

// Build an L-shaped or S-shaped orthogonal path between two ports
function Orthogonal_Path(
	from: Point, to: Point,
	from_side: string, to_side: string,
): Point[] {
	const gap = 20; // minimum distance from shape before turning
	const points: Point[] = [from];

	// Extend from the source port in its natural direction
	const ext_from = Extend_Point(from, from_side, gap);
	// Extend from the target port in its natural direction
	const ext_to = Extend_Point(to, to_side, gap);

	// Simple L-bend: go out from source, turn, go to target entry
	if (from_side === 'left' || from_side === 'right') {
		// Source goes horizontal, then vertical to target entry, then horizontal to target
		const mid_x = (ext_from.x + ext_to.x) / 2;
		if (to_side === 'top' || to_side === 'bottom') {
			// L-shape: horizontal then vertical
			points.push(ext_from);
			points.push({ x: ext_to.x, y: ext_from.y });
			points.push(ext_to);
		} else {
			// S-shape: both horizontal exits
			points.push(ext_from);
			points.push({ x: mid_x, y: ext_from.y });
			points.push({ x: mid_x, y: ext_to.y });
			points.push(ext_to);
		}
	} else {
		// Source goes vertical
		const mid_y = (ext_from.y + ext_to.y) / 2;
		if (to_side === 'left' || to_side === 'right') {
			// L-shape: vertical then horizontal
			points.push(ext_from);
			points.push({ x: ext_from.x, y: ext_to.y });
			points.push(ext_to);
		} else {
			// S-shape: both vertical exits
			points.push(ext_from);
			points.push({ x: ext_from.x, y: mid_y });
			points.push({ x: ext_to.x, y: mid_y });
			points.push(ext_to);
		}
	}

	points.push(to);
	return points;
}

function Extend_Point(p: Point, side: string, dist: number): Point {
	switch (side) {
		case 'top': return { x: p.x, y: p.y - dist };
		case 'bottom': return { x: p.x, y: p.y + dist };
		case 'left': return { x: p.x - dist, y: p.y };
		case 'right': return { x: p.x + dist, y: p.y };
		default: return p;
	}
}

function Arrow_Head(from: Point, to: Point, stroke_width: number = 2) {
	const head_len = 6 + stroke_width * 3;
	const angle = Math.atan2(to.y - from.y, to.x - from.x);
	return {
		tip: to,
		p1: { x: to.x - head_len * Math.cos(angle - Math.PI / 6), y: to.y - head_len * Math.sin(angle - Math.PI / 6) },
		p2: { x: to.x - head_len * Math.cos(angle + Math.PI / 6), y: to.y - head_len * Math.sin(angle + Math.PI / 6) },
	};
}

function Arrow_Points(arrow: { tip: Point; p1: Point; p2: Point }): string {
	return `${arrow.tip.x},${arrow.tip.y} ${arrow.p1.x},${arrow.p1.y} ${arrow.p2.x},${arrow.p2.y}`;
}

function Resolve_End(
	end: Connector['source'],
	shapes: Shape[],
): Point | null {
	if (end.shape_id && end.port_id) {
		const shape = shapes.find(s => s.id === end.shape_id);
		if (!shape) return null;
		const port = shape.ports.find(p => p.id === end.port_id);
		if (!port) return null;
		return Port_Position(shape, port);
	}
	return { x: end.x, y: end.y };
}

// Diamond-shaped handle for dragging connector endpoints
function EndpointHandle({ pt, end, connector_id, on_drag }: {
	pt: Point;
	end: 'source' | 'target';
	connector_id: string;
	on_drag?: (connector_id: string, end: 'source' | 'target', e: React.PointerEvent) => void;
}) {
	const s = 6;
	const points = `${pt.x},${pt.y - s} ${pt.x + s},${pt.y} ${pt.x},${pt.y + s} ${pt.x - s},${pt.y}`;
	return (
		<polygon
			points={points}
			fill="#fff"
			stroke="#ff9800"
			strokeWidth={1.5}
			style={{ cursor: 'crosshair' }}
			onPointerDown={(e) => { e.stopPropagation(); on_drag?.(connector_id, end, e); }}
		/>
	);
}

// Get the port side ('top'|'right'|'bottom'|'left') for a connector endpoint
function Resolve_Port_Side(end: Connector['source'], shapes: Shape[]): string | undefined {
	if (!end.shape_id || !end.port_id) return undefined;
	const shape = shapes.find(s => s.id === end.shape_id);
	if (!shape) return undefined;
	const port = shape.ports.find(p => p.id === end.port_id);
	return port?.side;
}
