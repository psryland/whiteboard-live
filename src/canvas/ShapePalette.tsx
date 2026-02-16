import type { ShapeType } from './types';

interface ShapePaletteProps {
	on_select_tool: (tool: ShapeType) => void;
	is_open: boolean;
	on_toggle: () => void;
}

interface PaletteCategory {
	label: string;
	shapes: { type: ShapeType; label: string; icon: string }[];
}

const CATEGORIES: PaletteCategory[] = [
	{
		label: 'General',
		shapes: [
			{ type: 'rectangle', label: 'Rectangle', icon: '▭' },
			{ type: 'ellipse', label: 'Ellipse', icon: '◯' },
			{ type: 'diamond', label: 'Diamond', icon: '◇' },
			{ type: 'text', label: 'Text', icon: 'T' },
		],
	},
	{
		label: 'Flowchart',
		shapes: [
			{ type: 'rectangle', label: 'Process', icon: '▭' },
			{ type: 'diamond', label: 'Decision', icon: '◇' },
			{ type: 'ellipse', label: 'Terminator', icon: '◯' },
		],
	},
];

export function ShapePalette({ on_select_tool, is_open, on_toggle }: ShapePaletteProps) {
	return (
		<>
			{/* Toggle button */}
			<button
				onClick={on_toggle}
				style={toggle_style}
				title="Shape Palette"
			>
				{is_open ? '◀' : '▶'}
			</button>

			{/* Sidebar panel */}
			{is_open && (
				<div style={panel_style}>
					<h3 style={{ margin: '0 0 8px', fontSize: 13, color: '#666', fontWeight: 600 }}>Shapes</h3>
					{CATEGORIES.map(cat => (
						<div key={cat.label} style={{ marginBottom: 12 }}>
							<div style={{ fontSize: 11, color: '#999', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>
								{cat.label}
							</div>
							<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
								{cat.shapes.map((shape, i) => (
									<button
										key={`${shape.type}-${i}`}
										onClick={() => on_select_tool(shape.type)}
										style={shape_btn_style}
										title={shape.label}
									>
										<span style={{ fontSize: 20 }}>{shape.icon}</span>
										<span style={{ fontSize: 10, color: '#666' }}>{shape.label}</span>
									</button>
								))}
							</div>
						</div>
					))}
				</div>
			)}
		</>
	);
}

const toggle_style: React.CSSProperties = {
	position: 'absolute',
	left: 8,
	top: '50%',
	transform: 'translateY(-50%)',
	width: 28,
	height: 48,
	background: '#fff',
	border: '1px solid #ddd',
	borderRadius: '0 6px 6px 0',
	cursor: 'pointer',
	fontSize: 14,
	zIndex: 100,
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	boxShadow: '2px 0 4px rgba(0,0,0,0.1)',
};

const panel_style: React.CSSProperties = {
	position: 'absolute',
	left: 0,
	top: 0,
	bottom: 0,
	width: 160,
	background: '#fff',
	borderRight: '1px solid #e0e0e0',
	padding: '56px 8px 8px',
	overflowY: 'auto',
	zIndex: 90,
	boxShadow: '2px 0 8px rgba(0,0,0,0.08)',
};

const shape_btn_style: React.CSSProperties = {
	display: 'flex',
	flexDirection: 'column',
	alignItems: 'center',
	gap: 2,
	padding: '6px 4px',
	background: '#f8f9fa',
	border: '1px solid #e0e0e0',
	borderRadius: 6,
	cursor: 'pointer',
	transition: 'background 0.1s',
};
