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
	const { x, y, width, height, style, text, type } = shape;

	const outline_props = {
		fill: style.fill,
		stroke: is_selected ? '#2196F3' : style.stroke,
		strokeWidth: is_selected ? style.stroke_width + 1 : style.stroke_width,
		cursor: 'pointer' as const,
	};

	const group_props = {
		onPointerDown: (e: React.PointerEvent) => on_pointer_down(e, shape),
		onPointerEnter: () => on_pointer_enter(shape),
		onPointerLeave: () => on_pointer_leave(shape),
		onDoubleClick: (e: React.MouseEvent) => on_double_click(e, shape),
	};

	return (
		<g {...group_props} data-shape-id={shape.id}>
			{/* Shape outline */}
			{type === 'rectangle' && (
				<rect x={x} y={y} width={width} height={height} rx={4} {...outline_props} />
			)}
			{type === 'ellipse' && (
				<ellipse
					cx={x + width / 2}
					cy={y + height / 2}
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
					x={x + width / 2}
					y={y + height / 2}
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

			{/* Selection handles */}
			{is_selected && <SelectionHandles x={x} y={y} width={width} height={height} />}

			{/* Port indicators on hover */}
			{(is_hovered || is_selected) && type !== 'text' && (
				<PortIndicators shape={shape} />
			)}
		</g>
	);
}

// Blue resize handles at corners and edge midpoints
function SelectionHandles({ x, y, width, height }: { x: number; y: number; width: number; height: number }) {
	const handle_size = 6;
	const hs = handle_size / 2;
	const points = [
		{ cx: x, cy: y },
		{ cx: x + width, cy: y },
		{ cx: x + width, cy: y + height },
		{ cx: x, cy: y + height },
		{ cx: x + width / 2, cy: y },
		{ cx: x + width, cy: y + height / 2 },
		{ cx: x + width / 2, cy: y + height },
		{ cx: x, cy: y + height / 2 },
	];

	return (
		<>
			{/* Dashed selection border */}
			<rect
				x={x} y={y} width={width} height={height}
				fill="none"
				stroke="#2196F3"
				strokeWidth={1}
				strokeDasharray="4 2"
				pointerEvents="none"
			/>
			{/* Corner/edge handles */}
			{points.map((p, i) => (
				<rect
					key={i}
					x={p.cx - hs}
					y={p.cy - hs}
					width={handle_size}
					height={handle_size}
					fill="white"
					stroke="#2196F3"
					strokeWidth={1.5}
					style={{ cursor: 'nwse-resize' }}
				/>
			))}
		</>
	);
}

// Blue dots at port positions
function PortIndicators({ shape }: { shape: Shape }) {
	return (
		<>
			{shape.ports.map((port) => {
				const pos = Port_Position(shape, port);
				return (
					<circle
						key={port.id}
						cx={pos.x}
						cy={pos.y}
						r={5}
						fill="#2196F3"
						stroke="white"
						strokeWidth={1.5}
						style={{ cursor: 'crosshair' }}
						data-port-id={port.id}
						data-shape-id={shape.id}
					/>
				);
			})}
		</>
	);
}
