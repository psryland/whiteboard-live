import { useState } from 'react';
import type { Shape, ShapeStyle } from './types';

interface PropertiesPanelProps {
	selected_shapes: Shape[];
	on_style_change: (changes: Partial<ShapeStyle>) => void;
	on_position_change: (changes: { x?: number; y?: number; width?: number; height?: number; rotation?: number }) => void;
	on_text_change: (text: string) => void;
	on_opacity_change: (opacity: number) => void;
	on_rounded_change: (rounded: boolean) => void;
}

const QUICK_COLOURS = [
	'#ffffff', '#f5f5f5', '#dbeafe', '#dcfce7', '#fef9c3', '#fee2e2', '#f3e8ff', '#fce7f3',
	'#e0e7ff', '#cffafe', '#d1fae5', '#fef3c7', '#ffe4e6', '#ede9fe', '#fce4ec', '#e8eaf6',
];

export function PropertiesPanel({
	selected_shapes,
	on_style_change,
	on_position_change,
	on_text_change,
	on_opacity_change,
	on_rounded_change,
}: PropertiesPanelProps) {
	const [active_tab, set_active_tab] = useState<'style' | 'text' | 'arrange'>('style');

	if (selected_shapes.length === 0) {
		return (
			<div style={panel_style}>
				<div style={{ padding: 16, color: '#999', fontSize: 13, textAlign: 'center' }}>
					Select a shape to edit its properties
				</div>
			</div>
		);
	}

	const shape = selected_shapes[0];
	const style = shape.style;

	return (
		<div style={panel_style} onPointerDown={e => e.stopPropagation()}>
			{/* Tabs */}
			<div style={{ display: 'flex', borderBottom: '1px solid #e0e0e0' }}>
				{(['style', 'text', 'arrange'] as const).map(tab => (
					<button
						key={tab}
						onClick={() => set_active_tab(tab)}
						style={{
							flex: 1,
							padding: '10px 4px',
							border: 'none',
							borderBottom: active_tab === tab ? '2px solid #2196F3' : '2px solid transparent',
							background: 'none',
							cursor: 'pointer',
							fontSize: 12,
							fontWeight: 500,
							color: active_tab === tab ? '#2196F3' : '#888',
							textTransform: 'uppercase',
							letterSpacing: 0.5,
							fontFamily: 'inherit',
							transition: 'color 0.15s, border-color 0.15s',
						}}
					>
						{tab}
					</button>
				))}
			</div>

			<div style={{ padding: 12, overflowY: 'auto', flex: 1 }}>
				{active_tab === 'style' && (
					<StyleTab
						style={style}
						opacity={shape.style.fill === 'none' ? 0 : 100}
						on_style_change={on_style_change}
						on_opacity_change={on_opacity_change}
						on_rounded_change={on_rounded_change}
						is_rounded={(shape as any).rounded ?? false}
					/>
				)}
				{active_tab === 'text' && (
					<TextTab
						text={shape.text}
						style={style}
						on_text_change={on_text_change}
						on_style_change={on_style_change}
					/>
				)}
				{active_tab === 'arrange' && (
					<ArrangeTab
						shape={shape}
						on_position_change={on_position_change}
					/>
				)}
			</div>
		</div>
	);
}

function StyleTab({ style, on_style_change, on_opacity_change, on_rounded_change, is_rounded }: {
	style: ShapeStyle;
	opacity: number;
	on_style_change: (changes: Partial<ShapeStyle>) => void;
	on_opacity_change: (opacity: number) => void;
	on_rounded_change: (rounded: boolean) => void;
	is_rounded: boolean;
}) {
	return (
		<>
			{/* Quick colour palette */}
			<div style={{ marginBottom: 12 }}>
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 3 }}>
					{QUICK_COLOURS.map(c => (
						<button
							key={c}
							onClick={() => on_style_change({ fill: c })}
							style={{
								width: 26, height: 26,
								background: c,
								border: style.fill === c ? '2px solid #2196F3' : '1px solid #ccc',
								borderRadius: 4,
								cursor: 'pointer',
								padding: 0,
							}}
						/>
					))}
				</div>
			</div>

			{/* Fill */}
			<div style={row_style}>
				<label style={label_style}>Fill</label>
				<input
					type="color"
					value={style.fill === 'none' ? '#ffffff' : style.fill}
					onChange={e => on_style_change({ fill: e.target.value })}
					style={{ width: 32, height: 24, border: 'none', cursor: 'pointer' }}
				/>
				<button
					onClick={() => on_style_change({ fill: 'none' })}
					style={{ ...mini_btn_style, background: style.fill === 'none' ? '#e3f2fd' : '#f5f5f5' }}
				>
					None
				</button>
			</div>

			{/* Line/Border */}
			<div style={row_style}>
				<label style={label_style}>Line</label>
				<input
					type="color"
					value={style.stroke}
					onChange={e => on_style_change({ stroke: e.target.value })}
					style={{ width: 32, height: 24, border: 'none', cursor: 'pointer' }}
				/>
				<input
					type="number"
					value={style.stroke_width}
					min={0}
					max={10}
					step={0.5}
					onChange={e => on_style_change({ stroke_width: parseFloat(e.target.value) })}
					style={{ ...input_style, width: 48 }}
				/>
				<span style={{ fontSize: 11, color: '#999' }}>pt</span>
			</div>

			{/* Opacity */}
			<div style={row_style}>
				<label style={label_style}>Opacity</label>
				<input
					type="range"
					min={0}
					max={100}
					value={100}
					onChange={e => on_opacity_change(parseInt(e.target.value))}
					style={{ flex: 1 }}
				/>
				<span style={{ fontSize: 11, color: '#999', minWidth: 32 }}>100%</span>
			</div>

			{/* Checkboxes */}
			<div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
				<label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
					<input type="checkbox" checked={is_rounded} onChange={e => on_rounded_change(e.target.checked)} />
					Rounded
				</label>
			</div>
		</>
	);
}

function TextTab({ text, style, on_text_change, on_style_change }: {
	text: string;
	style: ShapeStyle;
	on_text_change: (text: string) => void;
	on_style_change: (changes: Partial<ShapeStyle>) => void;
}) {
	return (
		<>
			<div style={{ marginBottom: 12 }}>
				<label style={label_style}>Label</label>
				<textarea
					value={text}
					onChange={e => on_text_change(e.target.value)}
					onKeyDown={e => e.stopPropagation()}
					style={{ ...input_style, width: '100%', height: 60, resize: 'vertical', fontFamily: 'inherit' }}
				/>
			</div>

			<div style={row_style}>
				<label style={label_style}>Colour</label>
				<input
					type="color"
					value={style.text_colour}
					onChange={e => on_style_change({ text_colour: e.target.value })}
					style={{ width: 32, height: 24, border: 'none', cursor: 'pointer' }}
				/>
			</div>

			<div style={row_style}>
				<label style={label_style}>Size</label>
				<input
					type="number"
					value={style.font_size}
					min={8}
					max={72}
					onChange={e => on_style_change({ font_size: parseInt(e.target.value) })}
					style={{ ...input_style, width: 48 }}
				/>
				<span style={{ fontSize: 11, color: '#999' }}>px</span>
			</div>
		</>
	);
}

function ArrangeTab({ shape, on_position_change }: {
	shape: Shape;
	on_position_change: (changes: { x?: number; y?: number; width?: number; height?: number; rotation?: number }) => void;
}) {
	return (
		<>
			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
				<div>
					<label style={label_style}>X</label>
					<input
						type="number"
						value={Math.round(shape.x)}
						onChange={e => on_position_change({ x: parseInt(e.target.value) })}
						onKeyDown={e => e.stopPropagation()}
						style={{ ...input_style, width: '100%' }}
					/>
				</div>
				<div>
					<label style={label_style}>Y</label>
					<input
						type="number"
						value={Math.round(shape.y)}
						onChange={e => on_position_change({ y: parseInt(e.target.value) })}
						onKeyDown={e => e.stopPropagation()}
						style={{ ...input_style, width: '100%' }}
					/>
				</div>
				<div>
					<label style={label_style}>Width</label>
					<input
						type="number"
						value={Math.round(shape.width)}
						min={10}
						onChange={e => on_position_change({ width: parseInt(e.target.value) })}
						onKeyDown={e => e.stopPropagation()}
						style={{ ...input_style, width: '100%' }}
					/>
				</div>
				<div>
					<label style={label_style}>Height</label>
					<input
						type="number"
						value={Math.round(shape.height)}
						min={10}
						onChange={e => on_position_change({ height: parseInt(e.target.value) })}
						onKeyDown={e => e.stopPropagation()}
						style={{ ...input_style, width: '100%' }}
					/>
				</div>
			</div>

			<div style={{ ...row_style, marginTop: 8 }}>
				<label style={label_style}>Rotation</label>
				<input
					type="number"
					value={Math.round(shape.rotation ?? 0)}
					step={15}
					onChange={e => on_position_change({ rotation: parseInt(e.target.value) || 0 })}
					onKeyDown={e => e.stopPropagation()}
					style={{ ...input_style, width: 64 }}
				/>
				<span style={{ fontSize: 11, color: '#999' }}>°</span>
			</div>

			<div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>
				<strong>Type:</strong> {shape.type}
			</div>
		</>
	);
}

const panel_style: React.CSSProperties = {
	position: 'absolute',
	right: 0,
	top: 0,
	bottom: 0,
	width: 240,
	background: '#fff',
	borderLeft: '1px solid #e0e0e0',
	display: 'flex',
	flexDirection: 'column',
	zIndex: 90,
	boxShadow: '-2px 0 8px rgba(0,0,0,0.05)',
	overflowY: 'auto',
	fontFamily: 'inherit',
};

const row_style: React.CSSProperties = {
	display: 'flex',
	alignItems: 'center',
	gap: 8,
	marginBottom: 8,
};

const label_style: React.CSSProperties = {
	fontSize: 11,
	fontWeight: 500,
	color: '#777',
	minWidth: 48,
	display: 'block',
	marginBottom: 2,
	letterSpacing: 0.3,
	textTransform: 'uppercase',
};

const input_style: React.CSSProperties = {
	padding: '5px 8px',
	border: '1px solid #e0e0e0',
	borderRadius: 6,
	fontSize: 13,
	outline: 'none',
	boxSizing: 'border-box',
	fontFamily: 'inherit',
	transition: 'border-color 0.15s',
};

const mini_btn_style: React.CSSProperties = {
	padding: '4px 10px',
	border: '1px solid #e0e0e0',
	borderRadius: 6,
	fontSize: 11,
	cursor: 'pointer',
	fontFamily: 'inherit',
	fontWeight: 500,
};
