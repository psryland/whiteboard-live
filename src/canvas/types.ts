// Core data types for the whiteboard canvas

export type ShapeType = 'rectangle' | 'ellipse' | 'diamond' | 'text';

export interface Point {
	x: number;
	y: number;
}

export interface Size {
	width: number;
	height: number;
}

export interface Bounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

// Which edge/side a port sits on
export type PortSide = 'top' | 'right' | 'bottom' | 'left';

export interface Port {
	id: string;
	side: PortSide;
	// Normalised offset along the edge (0..1), 0.5 = midpoint
	offset: number;
}

export interface ShapeStyle {
	fill: string;
	stroke: string;
	stroke_width: number;
	font_size: number;
	text_colour: string;
	rounded: boolean;
	opacity: number;
}

export const DEFAULT_STYLE: ShapeStyle = {
	fill: '#ffffff',
	stroke: '#333333',
	stroke_width: 2,
	font_size: 14,
	text_colour: '#333333',
	rounded: false,
	opacity: 100,
};

export interface Shape {
	id: string;
	type: ShapeType;
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number; // degrees
	text: string;
	style: ShapeStyle;
	ports: Port[];
	z_index: number;
}

// A connector endpoint bound to a shape's port, or a free point
export interface ConnectorEnd {
	shape_id: string | null;
	port_id: string | null;
	// Absolute position (used when not bound to a shape)
	x: number;
	y: number;
}

export type ArrowType = 'forward' | 'back' | 'both';
export type ConnectorRouting = 'ortho' | 'smooth' | 'straight';

export interface Connector {
	id: string;
	source: ConnectorEnd;
	target: ConnectorEnd;
	arrow_type: ArrowType;
	routing: ConnectorRouting;
	// User-editable control points for smooth (cubic bézier) routing
	control_points?: Point[];
	style: {
		stroke: string;
		stroke_width: number;
	};
	z_index: number;
}

export interface CanvasState {
	shapes: Shape[];
	connectors: Connector[];
	freehand_paths: FreehandPath[];
}

export type ToolType = 'select' | 'rectangle' | 'ellipse' | 'diamond' | 'text' | 'arrow' | 'freehand' | 'laser';

export interface Viewport {
	offset_x: number;
	offset_y: number;
	zoom: number;
}

export interface FreehandPath {
	id: string;
	points: Point[];
	style: {
		stroke: string;
		stroke_width: number;
	};
	z_index: number;
}

export interface LaserPoint {
	x: number;
	y: number;
	timestamp: number;
}

export interface ToolSettings {
	pen_size: number;
	pen_color: string;
	text_size: number;
	text_color: string;
	shape_type: ShapeType;
	shape_fill: string;
	shape_stroke: string;
	connector_thickness: number;
	connector_routing: ConnectorRouting;
	arrow_type: ArrowType;
	laser_color: string;
}

export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
	pen_size: 2,
	pen_color: '#333333',
	text_size: 14,
	text_color: '#333333',
	shape_type: 'rectangle',
	shape_fill: '#ffffff',
	shape_stroke: '#333333',
	connector_thickness: 2,
	connector_routing: 'ortho',
	arrow_type: 'forward',
	laser_color: '#ff2222',
};
