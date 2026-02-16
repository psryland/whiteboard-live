import { useState } from 'react';
import type { ShapeStyle } from './types';

interface ColourPickerProps {
	style: ShapeStyle;
	on_change: (style: Partial<ShapeStyle>) => void;
	on_close: () => void;
}

const PALETTE = [
	'#ffffff', '#f8f9fa', '#e9ecef', '#dee2e6', '#adb5bd', '#6c757d', '#495057', '#343a40', '#212529', '#000000',
	'#fff3cd', '#ffeeba', '#ffc107', '#ff9800', '#ff5722', '#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5',
	'#bbdefb', '#90caf9', '#2196F3', '#1976d2', '#0d47a1', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39',
];

export function ColourPicker({ style, on_change, on_close }: ColourPickerProps) {
	const [active_tab, set_active_tab] = useState<'fill' | 'stroke' | 'text'>('fill');

	const current_colour = active_tab === 'fill' ? style.fill
		: active_tab === 'stroke' ? style.stroke
		: style.text_colour;

	function Apply_Colour(colour: string) {
		if (active_tab === 'fill') on_change({ fill: colour });
		else if (active_tab === 'stroke') on_change({ stroke: colour });
		else on_change({ text_colour: colour });
	}

	return (
		<div style={panel_style} onPointerDown={e => e.stopPropagation()}>
			<div style={{ display: 'flex', gap: 0, marginBottom: 8 }}>
				{(['fill', 'stroke', 'text'] as const).map(tab => (
					<button
						key={tab}
						onClick={() => set_active_tab(tab)}
						style={{
							...tab_style,
							background: active_tab === tab ? '#2196F3' : '#f0f0f0',
							color: active_tab === tab ? '#fff' : '#333',
						}}
					>
						{tab === 'fill' ? 'Fill' : tab === 'stroke' ? 'Border' : 'Text'}
					</button>
				))}
			</div>

			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 2 }}>
				{PALETTE.map(colour => (
					<button
						key={colour}
						onClick={() => Apply_Colour(colour)}
						style={{
							width: 22,
							height: 22,
							background: colour,
							border: colour === current_colour ? '2px solid #2196F3' : '1px solid #ccc',
							borderRadius: 3,
							cursor: 'pointer',
							padding: 0,
						}}
					/>
				))}
			</div>

			{/* No-fill option for fill tab */}
			{active_tab === 'fill' && (
				<button
					onClick={() => Apply_Colour('none')}
					style={{ ...tab_style, marginTop: 6, width: '100%', background: current_colour === 'none' ? '#2196F3' : '#f0f0f0', color: current_colour === 'none' ? '#fff' : '#333' }}
				>
					No Fill
				</button>
			)}

			{/* Stroke width for border tab */}
			{active_tab === 'stroke' && (
				<div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
					<label style={{ fontSize: 12, color: '#666' }}>Width:</label>
					<input
						type="range"
						min={1}
						max={6}
						step={0.5}
						value={style.stroke_width}
						onChange={e => on_change({ stroke_width: parseFloat(e.target.value) })}
						style={{ flex: 1 }}
					/>
					<span style={{ fontSize: 12, color: '#666', minWidth: 20 }}>{style.stroke_width}</span>
				</div>
			)}

			{/* Font size for text tab */}
			{active_tab === 'text' && (
				<div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
					<label style={{ fontSize: 12, color: '#666' }}>Size:</label>
					<input
						type="range"
						min={10}
						max={36}
						step={1}
						value={style.font_size}
						onChange={e => on_change({ font_size: parseInt(e.target.value) })}
						style={{ flex: 1 }}
					/>
					<span style={{ fontSize: 12, color: '#666', minWidth: 20 }}>{style.font_size}</span>
				</div>
			)}

			<button onClick={on_close} style={{ ...tab_style, marginTop: 8, width: '100%' }}>Close</button>
		</div>
	);
}

const panel_style: React.CSSProperties = {
	position: 'absolute',
	top: 56,
	left: '50%',
	transform: 'translateX(-50%)',
	background: '#fff',
	borderRadius: 8,
	boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
	padding: 12,
	zIndex: 150,
	minWidth: 250,
	fontFamily: 'inherit',
};

const tab_style: React.CSSProperties = {
	flex: 1,
	padding: '4px 8px',
	border: 'none',
	borderRadius: 4,
	cursor: 'pointer',
	fontSize: 12,
	fontWeight: 500,
	fontFamily: 'inherit',
};
