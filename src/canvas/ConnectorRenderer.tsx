import type { Connector, Shape } from './types';
import { Port_Position } from './helpers';

interface ConnectorRendererProps {
	connector: Connector;
	shapes: Shape[];
	is_selected: boolean;
	on_pointer_down: (e: React.PointerEvent, connector: Connector) => void;
}

export function ConnectorRenderer({ connector, shapes, is_selected, on_pointer_down }: ConnectorRendererProps) {
	const source = Resolve_End(connector.source, shapes);
	const target = Resolve_End(connector.target, shapes);

	if (!source || !target) return null;

	const { stroke, stroke_width } = connector.style;

	// Arrow head size
	const head_len = 10;
	const angle = Math.atan2(target.y - source.y, target.x - source.x);
	const arrow_p1 = {
		x: target.x - head_len * Math.cos(angle - Math.PI / 6),
		y: target.y - head_len * Math.sin(angle - Math.PI / 6),
	};
	const arrow_p2 = {
		x: target.x - head_len * Math.cos(angle + Math.PI / 6),
		y: target.y - head_len * Math.sin(angle + Math.PI / 6),
	};

	return (
		<g onPointerDown={(e) => on_pointer_down(e, connector)} data-connector-id={connector.id}>
			{/* Invisible fat hit target */}
			<line
				x1={source.x} y1={source.y}
				x2={target.x} y2={target.y}
				stroke="transparent"
				strokeWidth={12}
				style={{ cursor: 'pointer' }}
			/>
			{/* Visible line */}
			<line
				x1={source.x} y1={source.y}
				x2={target.x} y2={target.y}
				stroke={is_selected ? '#2196F3' : stroke}
				strokeWidth={is_selected ? stroke_width + 1 : stroke_width}
				pointerEvents="none"
			/>
			{/* Arrow head */}
			<polygon
				points={`${target.x},${target.y} ${arrow_p1.x},${arrow_p1.y} ${arrow_p2.x},${arrow_p2.y}`}
				fill={is_selected ? '#2196F3' : stroke}
				pointerEvents="none"
			/>
		</g>
	);
}

function Resolve_End(
	end: Connector['source'],
	shapes: Shape[],
): { x: number; y: number } | null {
	if (end.shape_id && end.port_id) {
		const shape = shapes.find(s => s.id === end.shape_id);
		if (!shape) return null;
		const port = shape.ports.find(p => p.id === end.port_id);
		if (!port) return null;
		return Port_Position(shape, port);
	}
	return { x: end.x, y: end.y };
}
