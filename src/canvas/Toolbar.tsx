import type { ToolType } from './types';

interface ToolbarProps {
	active_tool: ToolType;
	on_tool_change: (tool: ToolType) => void;
	on_undo: () => void;
	on_redo: () => void;
	on_delete: () => void;
	on_toggle_colour_picker: () => void;
	on_duplicate: () => void;
	snap_enabled: boolean;
	on_toggle_snap: () => void;
	grid_size: number;
	on_grid_size_change: (size: number) => void;
	can_undo: boolean;
	can_redo: boolean;
	has_selection: boolean;
}

interface ToolButton {
	tool: ToolType;
	label: string;
	icon: string;
	shortcut: string;
}

const TOOLS: ToolButton[] = [
	{ tool: 'select', label: 'Select', icon: '⊹', shortcut: 'V' },
	{ tool: 'rectangle', label: 'Rectangle', icon: '▭', shortcut: 'R' },
	{ tool: 'ellipse', label: 'Ellipse', icon: '◯', shortcut: 'O' },
	{ tool: 'diamond', label: 'Diamond', icon: '◇', shortcut: 'D' },
	{ tool: 'text', label: 'Text', icon: 'T', shortcut: 'T' },
	{ tool: 'arrow', label: 'Arrow', icon: '→', shortcut: 'A' },
	{ tool: 'freehand', label: 'Freehand', icon: '✎', shortcut: 'P' },
	{ tool: 'laser', label: 'Laser Pointer', icon: '◎', shortcut: 'L' },
];

export function Toolbar({
	active_tool,
	on_tool_change,
	on_undo,
	on_redo,
	on_delete,
	on_toggle_colour_picker,
	on_duplicate,
	snap_enabled,
	on_toggle_snap,
	grid_size,
	on_grid_size_change,
	can_undo,
	can_redo,
	has_selection,
}: ToolbarProps) {
	return (
		<div style={toolbar_style}>
			{TOOLS.map((t) => (
				<button
					key={t.tool}
					onClick={() => on_tool_change(t.tool)}
					title={`${t.label} (${t.shortcut})`}
					style={{
						...btn_style,
						background: active_tool === t.tool ? '#2196F3' : '#fff',
						color: active_tool === t.tool ? '#fff' : '#333',
					}}
				>
					{t.icon}
				</button>
			))}

			<div style={separator_style} />

			<button onClick={on_toggle_colour_picker} disabled={!has_selection} title="Colour (C)" style={btn_style}>🎨</button>
			<button onClick={on_duplicate} disabled={!has_selection} title="Duplicate (Ctrl+D)" style={btn_style}>⧉</button>

			<div style={separator_style} />

			<button
				onClick={on_toggle_snap}
				title={`Snap to Grid (G) — ${snap_enabled ? 'ON' : 'OFF'}\nHold Alt to temporarily disable`}
				style={{
					...btn_style,
					background: snap_enabled ? '#e3f2fd' : '#fff',
					color: snap_enabled ? '#1976D2' : '#999',
					border: snap_enabled ? '1px solid #90caf9' : '1px solid #ddd',
				}}
			>⊞</button>
			<select
				value={grid_size}
				onChange={e => on_grid_size_change(parseInt(e.target.value))}
				title="Grid Size"
				style={{
					height: 36,
					border: '1px solid #ddd',
					borderRadius: 6,
					fontSize: 12,
					padding: '0 4px',
					cursor: 'pointer',
					background: '#fff',
					color: '#555',
					fontFamily: 'inherit',
				}}
			>
				<option value={5}>5px</option>
				<option value={10}>10px</option>
				<option value={20}>20px</option>
				<option value={25}>25px</option>
				<option value={50}>50px</option>
			</select>

			<div style={separator_style} />

			<button onClick={on_undo} disabled={!can_undo} title="Undo (Ctrl+Z)" style={btn_style}>↩</button>
			<button onClick={on_redo} disabled={!can_redo} title="Redo (Ctrl+Y)" style={btn_style}>↪</button>

			<div style={separator_style} />

			<button onClick={on_delete} disabled={!has_selection} title="Delete (Del)" style={btn_style}>🗑</button>
		</div>
	);
}

const toolbar_style: React.CSSProperties = {
	position: 'absolute',
	top: 8,
	left: '50%',
	transform: 'translateX(-50%)',
	display: 'flex',
	gap: 2,
	padding: 4,
	background: '#fff',
	borderRadius: 8,
	boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
	zIndex: 100,
	alignItems: 'center',
};

const btn_style: React.CSSProperties = {
	width: 36,
	height: 36,
	border: '1px solid #ddd',
	borderRadius: 6,
	cursor: 'pointer',
	fontSize: 18,
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	transition: 'background 0.1s',
};

const separator_style: React.CSSProperties = {
	width: 1,
	height: 24,
	background: '#ddd',
	margin: '0 4px',
};
