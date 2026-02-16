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
	let p: Point;
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

	// Apply shape rotation around its centre
	if (include_rotation && shape.rotation) {
		const cx = shape.x + shape.width / 2;
		const cy = shape.y + shape.height / 2;
		p = Rotate_Point(p, cx, cy, shape.rotation);
	}
	return p;
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
