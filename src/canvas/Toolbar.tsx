import { useState, useEffect, useRef, useCallback } from 'react';
import type { ToolType, ToolSettings, ShapeType, ArrowType } from './types';

interface ToolbarProps {
	active_tool: ToolType;
	on_tool_change: (tool: ToolType) => void;
	tool_settings: ToolSettings;
	on_tool_settings_change: (changes: Partial<ToolSettings>) => void;
	snap_enabled: boolean;
	on_toggle_snap: () => void;
	grid_size: number;
	on_grid_size_change: (size: number) => void;
	on_undo: () => void;
	on_redo: () => void;
	on_delete: () => void;
	can_undo: boolean;
	can_redo: boolean;
	has_selection: boolean;
}

const QUICK_COLORS = [
	'#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#ffffff',
	'#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6fa8dc', '#8e7cc3', '#c27ba0',
];

const LASER_COLORS = [
	'#ff2222', '#22cc44', '#2266ff', '#ff8800', '#ffdd00', '#ff00ff', '#00cccc', '#ffffff',
];

const SHAPE_ICONS: Record<ShapeType, string> = {
	rectangle: '▭',
	ellipse: '◯',
	diamond: '◇',
	text: 'T',
};

type DropdownId = 'pen' | 'text' | 'shape' | 'connector' | 'laser' | 'grid';

export function Toolbar({
	active_tool,
	on_tool_change,
	tool_settings,
	on_tool_settings_change,
	snap_enabled,
	on_toggle_snap,
	grid_size,
	on_grid_size_change,
	on_undo,
	on_redo,
	on_delete,
	can_undo,
	can_redo,
	has_selection,
}: ToolbarProps) {
	const [open_dropdown, set_open_dropdown] = useState<DropdownId | null>(null);
	const toolbar_ref = useRef<HTMLDivElement>(null);

	// Close dropdown when clicking outside
	useEffect(() => {
		if (!open_dropdown) return;
		const handler = (e: MouseEvent) => {
			if (toolbar_ref.current && !toolbar_ref.current.contains(e.target as Node)) {
				set_open_dropdown(null);
			}
		};
		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	}, [open_dropdown]);

	const Toggle_Dropdown = useCallback((id: DropdownId) => {
		set_open_dropdown(prev => prev === id ? null : id);
	}, []);

	// Determine which tools count as "active" for shape types
	const is_shape_tool = active_tool === 'rectangle' || active_tool === 'ellipse' || active_tool === 'diamond';

	return (
		<div ref={toolbar_ref} style={toolbar_style}>
			{/* Select */}
			<ToolBtn
				icon="⊹"
				label="Select (V)"
				active={active_tool === 'select'}
				on_click={() => on_tool_change('select')}
			/>

			{/* Pen */}
			<ToolBtnWithDropdown
				icon="✎"
				label="Pen (P)"
				active={active_tool === 'freehand'}
				on_click={() => on_tool_change('freehand')}
				dropdown_open={open_dropdown === 'pen'}
				on_toggle_dropdown={() => Toggle_Dropdown('pen')}
			>
				<DropdownSection label="Size">
					<div style={chip_row_style}>
						{[1, 2, 4, 6, 8].map(s => (
							<button
								key={s}
								onClick={() => on_tool_settings_change({ pen_size: s })}
								title={`${s}px`}
								style={{
									...chip_style,
									background: tool_settings.pen_size === s ? '#e3f2fd' : '#f5f5f5',
									border: tool_settings.pen_size === s ? '1px solid #90caf9' : '1px solid #ddd',
								}}
							>
								<svg width={20} height={20}><circle cx={10} cy={10} r={Math.min(s, 8)} fill="#333" /></svg>
							</button>
						))}
					</div>
				</DropdownSection>
				<DropdownSection label="Colour">
					<ColourGrid colors={QUICK_COLORS} selected={tool_settings.pen_color}
						on_select={(c) => on_tool_settings_change({ pen_color: c })} />
				</DropdownSection>
			</ToolBtnWithDropdown>

			{/* Text */}
			<ToolBtnWithDropdown
				icon="T"
				label="Text (T)"
				active={active_tool === 'text'}
				on_click={() => on_tool_change('text')}
				dropdown_open={open_dropdown === 'text'}
				on_toggle_dropdown={() => Toggle_Dropdown('text')}
			>
				<DropdownSection label="Size">
					<div style={chip_row_style}>
						{[12, 14, 16, 20, 24, 32].map(s => (
							<button
								key={s}
								onClick={() => on_tool_settings_change({ text_size: s })}
								style={{
									...chip_style,
									background: tool_settings.text_size === s ? '#e3f2fd' : '#f5f5f5',
									border: tool_settings.text_size === s ? '1px solid #90caf9' : '1px solid #ddd',
									fontSize: 12,
								}}
							>
								{s}
							</button>
						))}
					</div>
				</DropdownSection>
				<DropdownSection label="Colour">
					<ColourGrid colors={QUICK_COLORS} selected={tool_settings.text_color}
						on_select={(c) => on_tool_settings_change({ text_color: c })} />
				</DropdownSection>
			</ToolBtnWithDropdown>

			{/* Shape */}
			<ToolBtnWithDropdown
				icon={SHAPE_ICONS[tool_settings.shape_type] || '▭'}
				label="Shape (S)"
				active={is_shape_tool}
				on_click={() => on_tool_change(tool_settings.shape_type)}
				dropdown_open={open_dropdown === 'shape'}
				on_toggle_dropdown={() => Toggle_Dropdown('shape')}
			>
				<DropdownSection label="Shape type">
					<div style={chip_row_style}>
						{([['rectangle', '▭', 'Rectangle'], ['ellipse', '◯', 'Ellipse'], ['diamond', '◇', 'Diamond']] as const).map(([type, icon, label]) => (
							<button
								key={type}
								onClick={() => {
									on_tool_settings_change({ shape_type: type as ShapeType });
									set_open_dropdown(null);
								}}
								style={{
									...radio_chip_style,
									background: tool_settings.shape_type === type ? '#e3f2fd' : '#f5f5f5',
									border: tool_settings.shape_type === type ? '1px solid #90caf9' : '1px solid #ddd',
								}}
							>
								<span style={{ fontSize: 16 }}>{icon}</span> {label}
							</button>
						))}
					</div>
				</DropdownSection>
			</ToolBtnWithDropdown>

			{/* Connector */}
			<ToolBtnWithDropdown
				icon="→"
				label="Connector (A)"
				active={active_tool === 'arrow'}
				on_click={() => on_tool_change('arrow')}
				dropdown_open={open_dropdown === 'connector'}
				on_toggle_dropdown={() => Toggle_Dropdown('connector')}
			>
				<DropdownSection label="Thickness">
					<div style={chip_row_style}>
						{[1, 2, 3, 4].map(t => (
							<button
								key={t}
								onClick={() => on_tool_settings_change({ connector_thickness: t })}
								title={`${t}px`}
								style={{
									...chip_style,
									background: tool_settings.connector_thickness === t ? '#e3f2fd' : '#f5f5f5',
									border: tool_settings.connector_thickness === t ? '1px solid #90caf9' : '1px solid #ddd',
								}}
							>
								<svg width={24} height={14}><line x1={2} y1={7} x2={22} y2={7} stroke="#333" strokeWidth={t} /></svg>
							</button>
						))}
					</div>
				</DropdownSection>
				<DropdownSection label="Arrow type">
					<div style={chip_row_style}>
						{([['forward', '→ Forward'], ['back', '← Back'], ['both', '↔ Both']] as const).map(([type, label]) => (
							<button
								key={type}
								onClick={() => on_tool_settings_change({ arrow_type: type as ArrowType })}
								style={{
									...radio_chip_style,
									background: tool_settings.arrow_type === type ? '#e3f2fd' : '#f5f5f5',
									border: tool_settings.arrow_type === type ? '1px solid #90caf9' : '1px solid #ddd',
								}}
							>
								{label}
							</button>
						))}
					</div>
				</DropdownSection>
			</ToolBtnWithDropdown>

			{/* Laser */}
			<ToolBtnWithDropdown
				icon="◎"
				label="Laser (L)"
				active={active_tool === 'laser'}
				on_click={() => on_tool_change('laser')}
				dropdown_open={open_dropdown === 'laser'}
				on_toggle_dropdown={() => Toggle_Dropdown('laser')}
			>
				<DropdownSection label="Colour">
					<ColourGrid colors={LASER_COLORS} selected={tool_settings.laser_color}
						on_select={(c) => on_tool_settings_change({ laser_color: c })} />
				</DropdownSection>
			</ToolBtnWithDropdown>

			<div style={separator_style} />

			{/* Grid */}
			<ToolBtnWithDropdown
				icon="⊞"
				label={`Snap to Grid (G) — ${snap_enabled ? 'ON' : 'OFF'}`}
				active={false}
				highlighted={snap_enabled}
				on_click={on_toggle_snap}
				dropdown_open={open_dropdown === 'grid'}
				on_toggle_dropdown={() => Toggle_Dropdown('grid')}
			>
				<DropdownSection label="Grid size">
					<div style={chip_row_style}>
						{[5, 10, 20, 25, 50].map(s => (
							<button
								key={s}
								onClick={() => on_grid_size_change(s)}
								style={{
									...chip_style,
									background: grid_size === s ? '#e3f2fd' : '#f5f5f5',
									border: grid_size === s ? '1px solid #90caf9' : '1px solid #ddd',
									fontSize: 12,
								}}
							>
								{s}px
							</button>
						))}
					</div>
				</DropdownSection>
			</ToolBtnWithDropdown>

			{/* Undo / Redo */}
			<ToolBtn icon="↩" label="Undo (Ctrl+Z)" active={false} on_click={on_undo} disabled={!can_undo} />
			<ToolBtn icon="↪" label="Redo (Ctrl+Y)" active={false} on_click={on_redo} disabled={!can_redo} />

			<div style={separator_style} />

			{/* Delete */}
			<ToolBtn icon="🗑" label="Delete (Del)" active={false} on_click={on_delete} disabled={!has_selection} />
		</div>
	);
}

// ── Sub-components ──

function ToolBtn({ icon, label, active, on_click, disabled, highlighted }: {
	icon: string;
	label: string;
	active: boolean;
	on_click: () => void;
	disabled?: boolean;
	highlighted?: boolean;
}) {
	return (
		<button
			onClick={on_click}
			disabled={disabled}
			title={label}
			style={{
				...btn_style,
				background: active ? '#2196F3' : highlighted ? '#e3f2fd' : '#fff',
				color: active ? '#fff' : highlighted ? '#1976D2' : '#333',
				border: highlighted ? '1px solid #90caf9' : '1px solid #ddd',
				opacity: disabled ? 0.4 : 1,
			}}
		>
			{icon}
		</button>
	);
}

function ToolBtnWithDropdown({ icon, label, active, on_click, dropdown_open, on_toggle_dropdown, children, highlighted }: {
	icon: string;
	label: string;
	active: boolean;
	on_click: () => void;
	dropdown_open: boolean;
	on_toggle_dropdown: () => void;
	children: React.ReactNode;
	highlighted?: boolean;
}) {
	return (
		<div style={{ position: 'relative', display: 'flex' }}>
			<button
				onClick={on_click}
				title={label}
				style={{
					...btn_style,
					borderTopRightRadius: 0,
					borderBottomRightRadius: 0,
					background: active ? '#2196F3' : highlighted ? '#e3f2fd' : '#fff',
					color: active ? '#fff' : highlighted ? '#1976D2' : '#333',
					border: active ? '1px solid #2196F3' : highlighted ? '1px solid #90caf9' : '1px solid #ddd',
					borderRight: 'none',
				}}
			>
				{icon}
			</button>
			<button
				onClick={(e) => { e.stopPropagation(); on_toggle_dropdown(); }}
				title={`${label} options`}
				style={{
					...chevron_style,
					background: active ? '#1976D2' : dropdown_open ? '#e3f2fd' : highlighted ? '#e3f2fd' : '#fff',
					color: active ? '#fff' : '#888',
					border: active ? '1px solid #2196F3' : highlighted ? '1px solid #90caf9' : '1px solid #ddd',
					borderLeft: 'none',
				}}
			>
				▾
			</button>
			{dropdown_open && (
				<div style={dropdown_style} onPointerDown={(e) => e.stopPropagation()}>
					{children}
				</div>
			)}
		</div>
	);
}

function DropdownSection({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div style={{ marginBottom: 8 }}>
			<div style={{ fontSize: 10, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
				{label}
			</div>
			{children}
		</div>
	);
}

function ColourGrid({ colors, selected, on_select }: { colors: string[]; selected: string; on_select: (c: string) => void }) {
	return (
		<div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 3 }}>
			{colors.map(c => (
				<button
					key={c}
					onClick={() => on_select(c)}
					style={{
						width: 22, height: 22,
						background: c,
						border: selected === c ? '2px solid #2196F3' : '1px solid #ccc',
						borderRadius: 3,
						cursor: 'pointer',
						padding: 0,
						// White swatch needs a visible border
						boxShadow: c === '#ffffff' ? 'inset 0 0 0 1px #ddd' : undefined,
					}}
				/>
			))}
		</div>
	);
}

// ── Styles ──

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
	fontFamily: 'inherit',
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
	fontFamily: 'inherit',
	padding: 0,
};

const chevron_style: React.CSSProperties = {
	width: 16,
	height: 36,
	border: '1px solid #ddd',
	borderTopRightRadius: 6,
	borderBottomRightRadius: 6,
	borderTopLeftRadius: 0,
	borderBottomLeftRadius: 0,
	cursor: 'pointer',
	fontSize: 10,
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	fontFamily: 'inherit',
	padding: 0,
};

const separator_style: React.CSSProperties = {
	width: 1,
	height: 24,
	background: '#ddd',
	margin: '0 4px',
};

const dropdown_style: React.CSSProperties = {
	position: 'absolute',
	top: '100%',
	left: 0,
	marginTop: 4,
	background: '#fff',
	borderRadius: 8,
	boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
	padding: 10,
	minWidth: 200,
	zIndex: 200,
};

const chip_row_style: React.CSSProperties = {
	display: 'flex',
	gap: 4,
	flexWrap: 'wrap',
};

const chip_style: React.CSSProperties = {
	height: 28,
	minWidth: 28,
	border: '1px solid #ddd',
	borderRadius: 6,
	cursor: 'pointer',
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	fontFamily: 'inherit',
	padding: '0 4px',
};

const radio_chip_style: React.CSSProperties = {
	height: 28,
	border: '1px solid #ddd',
	borderRadius: 6,
	cursor: 'pointer',
	display: 'flex',
	alignItems: 'center',
	gap: 4,
	fontFamily: 'inherit',
	fontSize: 12,
	padding: '0 8px',
	whiteSpace: 'nowrap',
};
