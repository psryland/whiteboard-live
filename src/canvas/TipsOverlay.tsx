import { useState } from 'react';

const tips: { key: string; desc: string }[] = [
	{ key: 'Double-click canvas', desc: 'Create a rectangle with text editing' },
	{ key: 'Double-click shape', desc: 'Edit shape text' },
	{ key: 'F2', desc: 'Edit text of selected shape or connector label' },
	{ key: 'Delete / Backspace', desc: 'Delete selected elements' },
	{ key: 'Ctrl+Z / Ctrl+Y', desc: 'Undo / Redo' },
	{ key: 'Ctrl+C / Ctrl+V', desc: 'Copy / Paste' },
	{ key: 'Ctrl+D', desc: 'Duplicate selection' },
	{ key: 'Ctrl+A', desc: 'Select all' },
	{ key: 'Ctrl+Alt+A', desc: 'Select all (own objects only)' },
	{ key: 'Shift+drag select', desc: 'Select own objects only' },
	{ key: 'Escape', desc: 'Cancel / deselect all' },
	{ key: 'V', desc: 'Select tool' },
	{ key: 'R', desc: 'Rectangle tool' },
	{ key: 'O', desc: 'Ellipse tool' },
	{ key: 'A', desc: 'Arrow/connector tool' },
	{ key: 'T', desc: 'Text tool' },
	{ key: 'P', desc: 'Pen (freehand) tool' },
	{ key: 'L', desc: 'Laser pointer tool' },
	{ key: 'G', desc: 'Toggle snap-to-grid' },
	{ key: 'Alt (while dragging)', desc: 'Temporarily disable grid snap' },
	{ key: 'Shift+click two shapes', desc: 'Quick-connect with an arrow' },
	{ key: 'Hover shape edges', desc: 'Show connection ports (blue dots)' },
	{ key: 'Drag from port', desc: 'Create a connector to another shape' },
	{ key: 'Mouse wheel', desc: 'Zoom in/out' },
	{ key: 'Middle-click drag', desc: 'Pan the canvas' },
	{ key: 'Right-click drag', desc: 'Pan the canvas' },
	{ key: 'Ctrl+S', desc: 'Save board' },
	{ key: 'Ctrl+Shift+S', desc: 'Save board as…' },
	{ key: 'Ctrl+Shift+E', desc: 'Export as SVG/PNG' },
];

export function TipsOverlay() {
	const [expanded, set_expanded] = useState(false);

	return (
		<div style={{
			position: 'absolute',
			bottom: 8,
			left: 8,
			zIndex: 80,
			pointerEvents: 'auto',
			display: 'flex',
			flexDirection: 'column',
			alignItems: 'flex-start',
		}}>
			{expanded && (
				<div style={{
					marginBottom: 4,
					background: 'rgba(255,255,255,0.96)',
					border: '1px solid #ddd',
					borderRadius: 8,
					boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
					padding: '8px 0',
					maxHeight: 'calc(100vh - 120px)',
					overflowY: 'auto',
					width: 'min(340px, calc(100vw - 24px))',
				}}>
					<div style={{ padding: '4px 12px 8px', fontSize: 11, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #eee' }}>
						Keyboard Shortcuts & Tips
					</div>
					{tips.map((tip, i) => (
						<div key={i} style={{
							display: 'flex',
							justifyContent: 'space-between',
							alignItems: 'center',
							padding: '4px 12px',
							fontSize: 12,
							borderBottom: i < tips.length - 1 ? '1px solid #f5f5f5' : 'none',
						}}>
							<kbd style={{
								background: '#f0f0f0',
								border: '1px solid #ddd',
								borderRadius: 4,
								padding: '1px 6px',
								fontSize: 11,
								fontFamily: 'inherit',
								color: '#333',
								whiteSpace: 'nowrap',
								flexShrink: 0,
							}}>{tip.key}</kbd>
							<span style={{ color: '#666', textAlign: 'right', marginLeft: 12 }}>{tip.desc}</span>
						</div>
					))}
				</div>
			)}
			<button
				onClick={() => set_expanded(!expanded)}
				style={{
					background: expanded ? '#2196F3' : 'rgba(255,255,255,0.9)',
					color: expanded ? '#fff' : '#555',
					border: '1px solid #ddd',
					borderRadius: 8,
					padding: '5px 12px',
					fontSize: 12,
					fontWeight: 600,
					cursor: 'pointer',
					boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
					display: 'flex',
					alignItems: 'center',
					gap: 6,
				}}
			>
				💡 Tips {expanded ? '▾' : '▴'}
			</button>
		</div>
	);
}
