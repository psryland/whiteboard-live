import type { Shape } from './types';
import { Diamond_Points, Port_Position } from './helpers';

interface ShapeRendererProps {
	shape: Shape;
	is_selected: boolean;
	is_hovered: boolean;
	on_pointer_down: (e: React.PointerEvent, shape: Shape) => void;
	on_pointer_enter: (shape: Shape) => void;
	on_pointer_leave: (shape: Shape) => void;
	on_double_click: (e: React.MouseEvent, shape: Shape) => void;
}

export function ShapeRenderer({
	shape,
	is_selected,
	is_hovered,
	on_pointer_down,
	on_pointer_enter,
	on_pointer_leave,
	on_double_click,
}: ShapeRendererProps) {
	const { x, y, width, height, style, text, type, rotation } = shape;
	const cx = x + width / 2;
	const cy = y + height / 2;

	// Shape keeps its own colours regardless of selection
	const outline_props = {
		fill: style.fill,
		stroke: style.stroke,
		strokeWidth: style.stroke_width,
		cursor: 'pointer' as const,
	};

	const group_props = {
		onPointerDown: (e: React.PointerEvent) => on_pointer_down(e, shape),
		onPointerEnter: () => on_pointer_enter(shape),
		onPointerLeave: () => on_pointer_leave(shape),
		onDoubleClick: (e: React.MouseEvent) => on_double_click(e, shape),
	};

	// Apply rotation transform around shape centre
	const transform = rotation ? `rotate(${rotation}, ${cx}, ${cy})` : undefined;

	return (
		<g {...group_props} data-shape-id={shape.id} transform={transform}>
			{/* Shape outline — always drawn with the shape's own style */}
			{type === 'rectangle' && (
				<rect x={x} y={y} width={width} height={height}
					rx={style.rounded ? Math.min(width, height) / 4 : 0} {...outline_props} />
			)}
			{type === 'ellipse' && (
				<ellipse
					cx={cx}
					cy={cy}
					rx={width / 2}
					ry={height / 2}
					{...outline_props}
				/>
			)}
			{type === 'diamond' && (
				<polygon points={Diamond_Points(x, y, width, height)} {...outline_props} />
			)}
			{type === 'text' && (
				<rect x={x} y={y} width={width} height={height} fill="transparent" stroke="none" />
			)}

			{/* Text label */}
			{text && (
				<text
					x={cx}
					y={cy}
					textAnchor="middle"
					dominantBaseline="central"
					fontSize={style.font_size}
					fill={style.text_colour}
					pointerEvents="none"
					style={{ userSelect: 'none' }}
				>
					{text}
				</text>
			)}

			{/* Selection UI: dashed border + circular grab handles + rotate handle */}
			{is_selected && <SelectionHandles x={x} y={y} width={width} height={height} />}

			{/* Port indicators on hover */}
			{(is_hovered || is_selected) && type !== 'text' && (
				<PortIndicators shape={shape} />
			)}
		</g>
	);
}

const HANDLE_CURSORS = ['nw-resize', 'ne-resize', 'se-resize', 'sw-resize', 'n-resize', 'e-resize', 's-resize', 'w-resize'];
const HANDLE_R = 5;
const ROTATE_OFFSET = 24; // distance of rotate handle above the shape

function SelectionHandles({ x, y, width, height }: { x: number; y: number; width: number; height: number }) {
	const points = [
		{ cx: x, cy: y },                         // 0 TL
		{ cx: x + width, cy: y },                  // 1 TR
		{ cx: x + width, cy: y + height },          // 2 BR
		{ cx: x, cy: y + height },                  // 3 BL
		{ cx: x + width / 2, cy: y },               // 4 T
		{ cx: x + width, cy: y + height / 2 },      // 5 R
		{ cx: x + width / 2, cy: y + height },       // 6 B
		{ cx: x, cy: y + height / 2 },               // 7 L
	];

	const rotate_x = x + width / 2;
	const rotate_y = y - ROTATE_OFFSET;

	return (
		<>
			{/* Dashed selection border */}
			<rect
				x={x} y={y} width={width} height={height}
				fill="none"
				stroke="#00d4ff"
				strokeWidth={1}
				strokeDasharray="6 3"
				pointerEvents="none"
			/>

			{/* Line from top-centre to rotate handle */}
			<line
				x1={x + width / 2} y1={y}
				x2={rotate_x} y2={rotate_y}
				stroke="#00d4ff"
				strokeWidth={1}
				pointerEvents="none"
			/>

			{/* Rotate handle */}
			<circle
				cx={rotate_x}
				cy={rotate_y}
				r={HANDLE_R + 1}
				fill="white"
				stroke="#00d4ff"
				strokeWidth={1.5}
				style={{ cursor: 'grab' }}
				data-rotate-handle="true"
			/>
			{/* Rotate icon (↻ arrow) */}
			<text
				x={rotate_x}
				y={rotate_y + 0.5}
				textAnchor="middle"
				dominantBaseline="central"
				fontSize={9}
				fill="#00d4ff"
				pointerEvents="none"
				style={{ userSelect: 'none' }}
			>↻</text>

			{/* Resize grab handles — circular, cyan, like Draw.io */}
			{points.map((p, i) => (
				<circle
					key={i}
					cx={p.cx}
					cy={p.cy}
					r={HANDLE_R}
					fill="#00d4ff"
					stroke="white"
					strokeWidth={1.5}
					data-handle-index={i}
					style={{ cursor: HANDLE_CURSORS[i] }}
				/>
			))}
		</>
	);
}

// Port indicators rendered inside the shape's rotated group — use un-rotated positions
// Only show midpoint and quarter ports visually; eighth-point ports are invisible snap targets
function PortIndicators({ shape }: { shape: Shape }) {
	return (
		<>
			{shape.ports.map((port) => {
				const pos = Port_Position(shape, port, false);
				const is_primary = !port.id.includes('-e');
				return (
					<circle
						key={port.id}
						cx={pos.x}
						cy={pos.y}
						r={is_primary ? 5 : 4}
						fill={is_primary ? '#2196F3' : 'transparent'}
						stroke={is_primary ? 'white' : 'transparent'}
						strokeWidth={is_primary ? 1.5 : 0}
						style={{ cursor: 'crosshair' }}
						data-port-id={port.id}
						data-shape-id={shape.id}
					/>
				);
			})}
		</>
	);
}
