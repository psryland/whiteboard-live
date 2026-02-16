import type { Shape, Port, Point, Viewport, Bounds } from './types';

let next_id = 1;

export function Generate_Id(prefix: string = 's'): string {
	return `${prefix}_${next_id++}_${Date.now().toString(36)}`;
}

// Default ports at the midpoint of each edge
export function Default_Ports(): Port[] {
	return [
		{ id: 'top', side: 'top', offset: 0.5 },
		{ id: 'right', side: 'right', offset: 0.5 },
		{ id: 'bottom', side: 'bottom', offset: 0.5 },
		{ id: 'left', side: 'left', offset: 0.5 },
	];
}

// Get the absolute position of a port on a shape
export function Port_Position(shape: Shape, port: Port): Point {
	switch (port.side) {
		case 'top':
			return { x: shape.x + shape.width * port.offset, y: shape.y };
		case 'bottom':
			return { x: shape.x + shape.width * port.offset, y: shape.y + shape.height };
		case 'left':
			return { x: shape.x, y: shape.y + shape.height * port.offset };
		case 'right':
			return { x: shape.x + shape.width, y: shape.y + shape.height * port.offset };
	}
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
