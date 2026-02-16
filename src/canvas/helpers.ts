import type { Shape, Port, Point, Viewport, Bounds } from './types';

let next_id = 1;

export function Generate_Id(prefix: string = 's'): string {
	return `${prefix}_${next_id++}_${Date.now().toString(36)}`;
}

// Ports at corners and multiple points along each edge
export function Default_Ports(): Port[] {
	return [
		// Edge midpoints
		{ id: 'top', side: 'top', offset: 0.5 },
		{ id: 'right', side: 'right', offset: 0.5 },
		{ id: 'bottom', side: 'bottom', offset: 0.5 },
		{ id: 'left', side: 'left', offset: 0.5 },
		// Edge quarter points
		{ id: 'top-q1', side: 'top', offset: 0.25 },
		{ id: 'top-q3', side: 'top', offset: 0.75 },
		{ id: 'bottom-q1', side: 'bottom', offset: 0.25 },
		{ id: 'bottom-q3', side: 'bottom', offset: 0.75 },
		{ id: 'left-q1', side: 'left', offset: 0.25 },
		{ id: 'left-q3', side: 'left', offset: 0.75 },
		{ id: 'right-q1', side: 'right', offset: 0.25 },
		{ id: 'right-q3', side: 'right', offset: 0.75 },
		// Edge eighth points (for finer-grained attachment)
		{ id: 'top-e1', side: 'top', offset: 0.125 },
		{ id: 'top-e3', side: 'top', offset: 0.375 },
		{ id: 'top-e5', side: 'top', offset: 0.625 },
		{ id: 'top-e7', side: 'top', offset: 0.875 },
		{ id: 'bottom-e1', side: 'bottom', offset: 0.125 },
		{ id: 'bottom-e3', side: 'bottom', offset: 0.375 },
		{ id: 'bottom-e5', side: 'bottom', offset: 0.625 },
		{ id: 'bottom-e7', side: 'bottom', offset: 0.875 },
		{ id: 'left-e1', side: 'left', offset: 0.125 },
		{ id: 'left-e3', side: 'left', offset: 0.375 },
		{ id: 'left-e5', side: 'left', offset: 0.625 },
		{ id: 'left-e7', side: 'left', offset: 0.875 },
		{ id: 'right-e1', side: 'right', offset: 0.125 },
		{ id: 'right-e3', side: 'right', offset: 0.375 },
		{ id: 'right-e5', side: 'right', offset: 0.625 },
		{ id: 'right-e7', side: 'right', offset: 0.875 },
	];
}

// Rotate a point around a centre by the given angle in degrees
function Rotate_Point(p: Point, cx: number, cy: number, angle_deg: number): Point {
	if (!angle_deg) return p;
	const rad = angle_deg * Math.PI / 180;
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);
	const dx = p.x - cx;
	const dy = p.y - cy;
	return {
		x: cx + dx * cos - dy * sin,
		y: cy + dx * sin + dy * cos,
	};
}

// Get the absolute position of a port on a shape
// When include_rotation is false, returns the position in the shape's local coordinate space
// (useful for rendering inside an already-rotated SVG group)
export function Port_Position(shape: Shape, port: Port, include_rotation: boolean = true): Point {
	const cx = shape.x + shape.width / 2;
	const cy = shape.y + shape.height / 2;
	let p: Point;

	if (shape.type === 'ellipse') {
		// Place ports on the ellipse perimeter using parametric angle
		const rx = shape.width / 2;
		const ry = shape.height / 2;
		const angle = Port_To_Ellipse_Angle(port);
		p = { x: cx + rx * Math.cos(angle), y: cy - ry * Math.sin(angle) };

	} else if (shape.type === 'diamond') {
		// Place ports on the diamond edges (4 edges connecting midpoints of bounding box sides)
		p = Port_On_Diamond(shape.x, shape.y, shape.width, shape.height, port);

	} else {
		// Rectangle — ports on the bounding box edges
		switch (port.side) {
			case 'top':
				p = { x: shape.x + shape.width * port.offset, y: shape.y };
				break;
			case 'bottom':
				p = { x: shape.x + shape.width * port.offset, y: shape.y + shape.height };
				break;
			case 'left':
				p = { x: shape.x, y: shape.y + shape.height * port.offset };
				break;
			case 'right':
				p = { x: shape.x + shape.width, y: shape.y + shape.height * port.offset };
				break;
		}
	}

	// Apply shape rotation around its centre
	if (include_rotation && shape.rotation) {
		p = Rotate_Point(p, cx, cy, shape.rotation);
	}
	return p;
}

// Map a port (side + offset) to an angle on the ellipse perimeter.
// Distributes ports evenly around the ellipse, grouped by side.
function Port_To_Ellipse_Angle(port: Port): number {
	// Each side maps to a 90° arc: top = 45°..135°, left = 135°..225°, bottom = 225°..315°, right = 315°..405° (=−45°..45°)
	const base: Record<string, number> = { top: 90, left: 180, bottom: 270, right: 0 };
	// offset 0 → start of arc (base−45°), offset 1 → end (base+45°), offset 0.5 → base
	const deg = base[port.side] + (port.offset - 0.5) * -90;
	return deg * Math.PI / 180;
}

// Map a port to a position on a diamond's edges.
// Diamond vertices: top-mid, right-mid, bottom-mid, left-mid of the bounding box.
function Port_On_Diamond(x: number, y: number, w: number, h: number, port: Port): Point {
	const cx = x + w / 2;
	const cy = y + h / 2;
	const top: Point = { x: cx, y: y };
	const right: Point = { x: x + w, y: cy };
	const bottom: Point = { x: cx, y: y + h };
	const left: Point = { x: x, y: cy };

	// Each side of the bounding box maps to two diamond edges meeting at the adjacent diamond vertex
	let a: Point, b: Point;
	switch (port.side) {
		case 'top':
			// Top bbox edge → from left-vertex to top-vertex (offset 0→0.5) and top-vertex to right-vertex (0.5→1)
			if (port.offset <= 0.5) { a = left; b = top; return Lerp_Points(a, b, port.offset * 2); }
			else { a = top; b = right; return Lerp_Points(a, b, (port.offset - 0.5) * 2); }
		case 'right':
			if (port.offset <= 0.5) { a = top; b = right; return Lerp_Points(a, b, port.offset * 2); }
			else { a = right; b = bottom; return Lerp_Points(a, b, (port.offset - 0.5) * 2); }
		case 'bottom':
			if (port.offset <= 0.5) { a = right; b = bottom; return Lerp_Points(a, b, port.offset * 2); }
			else { a = bottom; b = left; return Lerp_Points(a, b, (port.offset - 0.5) * 2); }
		case 'left':
			if (port.offset <= 0.5) { a = bottom; b = left; return Lerp_Points(a, b, port.offset * 2); }
			else { a = left; b = top; return Lerp_Points(a, b, (port.offset - 0.5) * 2); }
	}
}

function Lerp_Points(a: Point, b: Point, t: number): Point {
	return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// Find the nearest port on a shape to a given point
export function Nearest_Port(shape: Shape, point: Point): Port {
	let best = shape.ports[0];
	let best_dist = Infinity;
	for (const port of shape.ports) {
		const pos = Port_Position(shape, port);
		const dist = Math.hypot(pos.x - point.x, pos.y - point.y);
		if (dist < best_dist) {
			best = port;
			best_dist = dist;
		}
	}
	return best;
}

// Convert screen coordinates to canvas coordinates
export function Screen_To_Canvas(screen: Point, viewport: Viewport): Point {
	return {
		x: (screen.x - viewport.offset_x) / viewport.zoom,
		y: (screen.y - viewport.offset_y) / viewport.zoom,
	};
}

// Check if a point is inside a shape's bounding box
export function Point_In_Shape(point: Point, shape: Shape): boolean {
	return (
		point.x >= shape.x &&
		point.x <= shape.x + shape.width &&
		point.y >= shape.y &&
		point.y <= shape.y + shape.height
	);
}

// Check if two bounds overlap (for marquee selection)
export function Bounds_Overlap(a: Bounds, b: Bounds): boolean {
	return !(
		a.x + a.width < b.x ||
		b.x + b.width < a.x ||
		a.y + a.height < b.y ||
		b.y + b.height < a.y
	);
}

// Create a normalised bounds from two corner points (handles negative width/height)
export function Normalise_Bounds(p1: Point, p2: Point): Bounds {
	return {
		x: Math.min(p1.x, p2.x),
		y: Math.min(p1.y, p2.y),
		width: Math.abs(p2.x - p1.x),
		height: Math.abs(p2.y - p1.y),
	};
}

export function Shape_Bounds(shape: Shape): Bounds {
	return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
}

// Diamond path for SVG polygon
export function Diamond_Points(x: number, y: number, w: number, h: number): string {
	const cx = x + w / 2;
	const cy = y + h / 2;
	return `${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`;
}

// Grid defaults (overridden by user preference)
export const DEFAULT_GRID_SIZE = 10;
export const DEFAULT_GRID_MAJOR_MULT = 10; // major lines every N minor lines

export function Snap_To_Grid(value: number, grid_size: number = DEFAULT_GRID_SIZE): number {
	return Math.round(value / grid_size) * grid_size;
}

// Default bézier control points that leave the shape perpendicular to the port edge.
// When port sides are provided, each CP extends outward from the endpoint in the
// direction normal to that edge, rotated by the shape's rotation angle.
// Otherwise falls back to 1/3 and 2/3 along the line.
export function Default_Control_Points(source: Point, target: Point, source_side?: string, target_side?: string, source_rotation?: number, target_rotation?: number): Point[] {
	const dist = Math.hypot(target.x - source.x, target.y - source.y);
	const arm = Math.max(30, dist * 0.4);

	function Extend(pt: Point, side: string | undefined, fallback_dx: number, fallback_dy: number, rotation?: number): Point {
		if (!side) return { x: pt.x + fallback_dx, y: pt.y + fallback_dy };

		// Axis-aligned direction for this port side
		let dx = 0, dy = 0;
		switch (side) {
			case 'top':    dy = -arm; break;
			case 'bottom': dy = arm; break;
			case 'left':   dx = -arm; break;
			case 'right':  dx = arm; break;
			default:       return { x: pt.x + fallback_dx, y: pt.y + fallback_dy };
		}

		// Rotate the direction vector by the shape's rotation
		if (rotation) {
			const rad = rotation * Math.PI / 180;
			const cos = Math.cos(rad);
			const sin = Math.sin(rad);
			const rdx = dx * cos - dy * sin;
			const rdy = dx * sin + dy * cos;
			dx = rdx;
			dy = rdy;
		}

		return { x: pt.x + dx, y: pt.y + dy };
	}

	const dx = target.x - source.x;
	const dy = target.y - source.y;
	return [
		Extend(source, source_side, dx * 0.33, dy * 0.33, source_rotation),
		Extend(target, target_side, -dx * 0.33, -dy * 0.33, target_rotation),
	];
}

// Compute axis-aligned bounding box of a set of points
export function Freehand_Bounds(points: Point[]): Bounds {
	if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
	let min_x = Infinity, min_y = Infinity, max_x = -Infinity, max_y = -Infinity;
	for (const p of points) {
		if (p.x < min_x) min_x = p.x;
		if (p.y < min_y) min_y = p.y;
		if (p.x > max_x) max_x = p.x;
		if (p.y > max_y) max_y = p.y;
	}
	return { x: min_x, y: min_y, width: max_x - min_x, height: max_y - min_y };
}

// Smooth a polyline using Chaikin's corner-cutting algorithm.
// Each pass doubles the point count, producing progressively smoother curves.
export function Smooth_Points(points: Point[], iterations: number = 2): Point[] {
	if (points.length < 3) return points;
	let result = points;
	for (let iter = 0; iter < iterations; iter++) {
		const smoothed: Point[] = [result[0]]; // keep first point
		for (let i = 0; i < result.length - 1; i++) {
			const p0 = result[i];
			const p1 = result[i + 1];
			smoothed.push({ x: 0.75 * p0.x + 0.25 * p1.x, y: 0.75 * p0.y + 0.25 * p1.y });
			smoothed.push({ x: 0.25 * p0.x + 0.75 * p1.x, y: 0.25 * p0.y + 0.75 * p1.y });
		}
		smoothed.push(result[result.length - 1]); // keep last point
		result = smoothed;
	}
	return result;
}

// Simplify a polyline by removing points that are closer than min_dist to each other (Radial Distance)
export function Simplify_Points(points: Point[], min_dist: number = 3): Point[] {
	if (points.length < 3) return points;
	const result: Point[] = [points[0]];
	for (let i = 1; i < points.length - 1; i++) {
		const last = result[result.length - 1];
		const d = Math.hypot(points[i].x - last.x, points[i].y - last.y);
		if (d >= min_dist) result.push(points[i]);
	}
	result.push(points[points.length - 1]); // always keep last
	return result;
}

// Convert perfect-freehand outline points to an SVG path d attribute
export function Get_Svg_Path_From_Stroke(stroke: [number, number][]): string {
	if (stroke.length === 0) return '';
	const d = stroke.reduce(
		(acc, [x0, y0], i, arr) => {
			const [x1, y1] = arr[(i + 1) % arr.length];
			acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
			return acc;
		},
		['M', ...stroke[0], 'Q'] as (string | number)[]
	);
	d.push('Z');
	return d.join(' ');
}
