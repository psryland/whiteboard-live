import { useState } from 'react';
import type { Shape, ShapeStyle, Connector, ArrowType, ConnectorRouting, FreehandPath, CollabUser } from './types';
import { PresenceAvatars } from './RemoteCursors';
import { CollabSession, Share_Url } from './Collaboration';

interface PropertiesPanelProps {
	selected_shapes: Shape[];
	selected_connectors: Connector[];
	selected_freehand: FreehandPath[];
	on_style_change: (changes: Partial<ShapeStyle>) => void;
	on_position_change: (changes: { x?: number; y?: number; width?: number; height?: number; rotation?: number }) => void;
	on_text_change: (text: string) => void;
	on_rounded_change: (rounded: boolean) => void;
	on_z_order: (action: 'bring_front' | 'send_back' | 'bring_forward' | 'send_backward') => void;
	on_connector_change: (changes: Partial<Pick<Connector, 'arrow_type' | 'routing'> & { stroke: string; stroke_width: number }>) => void;
	on_freehand_change: (changes: Partial<{ stroke: string; stroke_width: number }>) => void;
	collab_session: CollabSession | null;
	collab_connected: boolean;
	remote_users: CollabUser[];
	on_start_sharing: () => void;
	on_stop_sharing: () => void;
	allow_remote_editing: boolean;
	on_toggle_remote_editing: (allowed: boolean) => void;
	remote_editing_blocked: boolean;
}

const COLOUR_PAGES = [
	{
		name: 'Pastel',
		colours: [
			'#ffffff', '#f5f5f5', '#dbeafe', '#dcfce7',
			'#fef9c3', '#fed7aa', '#fecaca', '#e9d5ff',
		],
	},
	{
		name: 'Vivid',
		colours: [
			'#ef4444', '#f97316', '#eab308', '#22c55e',
			'#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
		],
	},
	{
		name: 'Bold',
		colours: [
			'#000000', '#1e3a5f', '#1e40af', '#15803d',
			'#a16207', '#b91c1c', '#7e22ce', '#be185d',
		],
	},
	{
		name: 'Earth',
		colours: [
			'#fefce8', '#fef3c7', '#d6d3d1', '#a8a29e',
			'#78716c', '#57534e', '#44403c', '#292524',
		],
	},
	{
		name: 'Cool',
		colours: [
			'#f0f9ff', '#bae6fd', '#7dd3fc', '#38bdf8',
			'#0ea5e9', '#0284c7', '#0369a1', '#075985',
		],
	},
];

function CreatedByTag({ name }: { name?: string }) {
	if (!name) return null;
	return (
		<div style={{ borderTop: '1px solid #e0e0e0', marginTop: 8, paddingTop: 8, fontSize: 11, color: '#999' }}>
			Created by <span style={{ fontWeight: 600, color: '#666' }}>{name}</span>
		</div>
	);
}

export function PropertiesPanel({
	selected_shapes,
	selected_connectors,
	selected_freehand,
	on_style_change,
	on_position_change,
	on_text_change,
	on_rounded_change,
	on_z_order,
	on_connector_change,
	on_freehand_change,
	collab_session,
	collab_connected,
	remote_users,
	on_start_sharing,
	on_stop_sharing,
	allow_remote_editing,
	on_toggle_remote_editing,
	remote_editing_blocked,
}: PropertiesPanelProps) {
	const [active_tab, set_active_tab] = useState<'style' | 'text' | 'arrange'>('style');
	const [copied, set_copied] = useState(false);
	const [copied_code, set_copied_code] = useState(false);

	function Handle_Copy_Link() {
		if (!collab_session) return;
		const url = Share_Url(collab_session.Room_Id);
		navigator.clipboard.writeText(url);
		set_copied(true);
		setTimeout(() => set_copied(false), 2000);
	}

	function Handle_Copy_Code() {
		if (!collab_session) return;
		navigator.clipboard.writeText(collab_session.Room_Id);
		set_copied_code(true);
		setTimeout(() => set_copied_code(false), 2000);
	}

	// Collaboration controls — positioned to overflow left of the panel
	const collab_controls = (
		<div style={{
			position: 'absolute', top: 8, right: '100%', marginRight: 6,
			display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6,
			whiteSpace: 'nowrap', pointerEvents: 'auto',
		}}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
				{collab_session && (
					<PresenceAvatars users={remote_users} self_name={collab_session.User_Name} />
				)}
				{!collab_session ? (
					<button
						onClick={on_start_sharing}
						style={{
							padding: '6px 14px', borderRadius: 8, border: 'none',
							background: '#2196F3', color: '#fff', fontSize: 12,
							fontWeight: 600, cursor: 'pointer', display: 'flex',
							alignItems: 'center', gap: 6,
							boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
						}}
					>🔗 Share</button>
				) : (
					<button
						onClick={on_stop_sharing}
						style={{
							padding: '6px 14px', borderRadius: 8, border: 'none',
							background: collab_connected ? '#4CAF50' : '#ff9800',
							color: '#fff', fontSize: 12, fontWeight: 600,
							cursor: 'pointer',
							boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
						}}
					>{collab_connected ? '● Live' : '○ Connecting...'}</button>
				)}
			</div>

			{/* Share link panel — shown when live session is active */}
			{collab_session && collab_connected && (
				<div style={{
					background: '#fff', border: '1px solid #c8e1ff', borderRadius: 10,
					padding: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', width: 260,
					boxSizing: 'border-box',
				}} onPointerDown={e => e.stopPropagation()}>
					{/* Room code */}
					<div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
						<span style={{ fontSize: 11, fontWeight: 600, color: '#1565C0', whiteSpace: 'nowrap' }}>Room:</span>
						<input
							readOnly
							value={collab_session.Room_Id}
							style={{
								flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: '#333',
								letterSpacing: '1.5px', fontFamily: 'monospace',
								background: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: 4,
								padding: '3px 6px', boxSizing: 'border-box', outline: 'none',
							}}
						/>
						<button
							onClick={Handle_Copy_Code}
							style={{
								padding: '2px 6px', borderRadius: 3, border: 'none',
								background: copied_code ? '#4CAF50' : '#e3f2fd', color: copied_code ? '#fff' : '#1565C0',
								fontSize: 10, cursor: 'pointer', transition: 'background 0.2s',
								flexShrink: 0,
							}}
						>{copied_code ? '✓' : '📋'}</button>
					</div>
					{/* Share URL */}
					<input
						readOnly
						value={Share_Url(collab_session.Room_Id)}
						style={{
							display: 'block', width: '100%', fontSize: 10, color: '#666', background: '#f5f5f5',
							borderRadius: 4, padding: '4px 6px', marginBottom: 8,
							border: '1px solid #e0e0e0', boxSizing: 'border-box', outline: 'none',
						}}
					/>
					{/* Allow Remote Editing — host only */}
					{collab_session.Is_Host && (
						<label style={{
							display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
							fontSize: 11, color: '#555', cursor: 'pointer',
						}}>
							<input
								type="checkbox"
								checked={allow_remote_editing}
								onChange={e => on_toggle_remote_editing(e.target.checked)}
								style={{ margin: 0, cursor: 'pointer' }}
							/>
							Allow remote editing
						</label>
					)}
					{/* Read-only indicator for guests */}
					{!collab_session.Is_Host && remote_editing_blocked && (
						<div style={{
							fontSize: 11, color: '#b71c1c', background: '#ffebee', borderRadius: 4,
							padding: '4px 8px', marginBottom: 8, textAlign: 'center', fontWeight: 600,
						}}>🔒 Editing disabled by host</div>
					)}
					<button
						onClick={Handle_Copy_Link}
						style={{
							width: '100%', padding: '4px 10px', borderRadius: 4, border: 'none',
							background: copied ? '#4CAF50' : '#2196F3', color: '#fff',
							fontSize: 11, fontWeight: 600, cursor: 'pointer',
							transition: 'background 0.2s',
						}}
					>{copied ? '✓ Copied' : '📋 Copy Link'}</button>
				</div>
			)}
		</div>
	);

	// Show connector panel if connectors are selected and no shapes/freehand
	if (selected_connectors.length > 0 && selected_shapes.length === 0 && selected_freehand.length === 0) {
		return (
			<div style={panel_wrapper_style}>
				{collab_controls}
				<div style={panel_style} onPointerDown={e => e.stopPropagation()}>
					<div style={{ padding: 12, overflowY: 'auto', flex: 1 }}>
						<ConnectorTab
							connector={selected_connectors[0]}
							on_connector_change={on_connector_change}
							on_z_order={on_z_order}
						/>
						<CreatedByTag name={selected_connectors[0].created_by} />
					</div>
				</div>
			</div>
		);
	}

	// Show freehand panel if freehand paths are selected and no shapes/connectors
	if (selected_freehand.length > 0 && selected_shapes.length === 0 && selected_connectors.length === 0) {
		return (
			<div style={panel_wrapper_style}>
				{collab_controls}
				<div style={panel_style} onPointerDown={e => e.stopPropagation()}>
					<div style={{ padding: 12, overflowY: 'auto', flex: 1 }}>
						<FreehandTab
							path={selected_freehand[0]}
							on_freehand_change={on_freehand_change}
							on_z_order={on_z_order}
						/>
						<CreatedByTag name={selected_freehand[0].created_by} />
					</div>
				</div>
			</div>
		);
	}

	if (selected_shapes.length === 0) {
		return (
			<div style={panel_wrapper_style}>
				{collab_controls}
				<div style={panel_style}>
					<div style={{ padding: 16, color: '#999', fontSize: 13, textAlign: 'center' }}>
						Select an element to edit its properties
					</div>
				</div>
			</div>
		);
	}

	const shape = selected_shapes[0];
	const style = shape.style;

	return (
		<div style={panel_wrapper_style}>
			{collab_controls}
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
						on_style_change={on_style_change}
						on_rounded_change={on_rounded_change}
						is_rounded={shape.style.rounded ?? false}
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
						on_z_order={on_z_order}
					/>
				)}
				<CreatedByTag name={shape.created_by} />
			</div>
			</div>
		</div>
	);
}

function StyleTab({ style, on_style_change, on_rounded_change, is_rounded }: {
	style: ShapeStyle;
	on_style_change: (changes: Partial<ShapeStyle>) => void;
	on_rounded_change: (rounded: boolean) => void;
	is_rounded: boolean;
}) {
	const [colour_page, set_colour_page] = useState(0);
	const page = COLOUR_PAGES[colour_page];

	return (
		<>
			{/* Paginated colour palette */}
			<div style={{ marginBottom: 12 }}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
					<button
						onClick={() => set_colour_page(p => (p - 1 + COLOUR_PAGES.length) % COLOUR_PAGES.length)}
						style={nav_btn_style}
					>‹</button>
					<div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3 }}>
						{page.colours.map(c => (
							<button
								key={c}
								onClick={() => on_style_change({ fill: c })}
								style={{
									width: '100%', aspectRatio: '1', boxSizing: 'border-box',
									background: c,
									border: style.fill === c ? '2px solid #2196F3' : '1px solid #ccc',
									borderRadius: 4,
									cursor: 'pointer',
									padding: 0,
								}}
							/>
						))}
					</div>
					<button
						onClick={() => set_colour_page(p => (p + 1) % COLOUR_PAGES.length)}
						style={nav_btn_style}
					>›</button>
				</div>
				{/* Page dots */}
				<div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
					{COLOUR_PAGES.map((_, i) => (
						<div
							key={i}
							onClick={() => set_colour_page(i)}
							style={{
								width: 7, height: 7, borderRadius: '50%',
								background: i === colour_page ? '#90caf9' : '#ddd',
								cursor: 'pointer',
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
					style={{ width: 28, height: 22, border: 'none', cursor: 'pointer', padding: 0 }}
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
					style={{ width: 28, height: 22, border: 'none', cursor: 'pointer', padding: 0 }}
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
			<div style={{ marginBottom: 8 }}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
					<label style={{ ...label_style, marginBottom: 0 }}>Opacity</label>
					<input
						type="range"
						min={0}
						max={100}
						value={style.opacity ?? 100}
						onChange={e => on_style_change({ opacity: parseInt(e.target.value) })}
						style={{ flex: 1, minWidth: 0 }}
					/>
					<span style={{ fontSize: 11, color: '#999', minWidth: 28, textAlign: 'right' }}>{style.opacity ?? 100}%</span>
				</div>
			</div>

			{/* Checkboxes */}
			<div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
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

function ArrangeTab({ shape, on_position_change, on_z_order }: {
	shape: Shape;
	on_position_change: (changes: { x?: number; y?: number; width?: number; height?: number; rotation?: number }) => void;
	on_z_order: (action: 'bring_front' | 'send_back' | 'bring_forward' | 'send_backward') => void;
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

			{/* Z-order controls */}
			<div style={{ borderTop: '1px solid #e0e0e0', marginTop: 12, paddingTop: 8 }}>
				<label style={{ ...label_style, marginBottom: 6, display: 'block' }}>Order</label>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
					<button onClick={() => on_z_order('bring_front')} style={z_btn_style} title="Bring to Front">
						⬆⬆ Front
					</button>
					<button onClick={() => on_z_order('send_back')} style={z_btn_style} title="Send to Back">
						⬇⬇ Back
					</button>
					<button onClick={() => on_z_order('bring_forward')} style={z_btn_style} title="Bring Forward">
						⬆ Forward
					</button>
					<button onClick={() => on_z_order('send_backward')} style={z_btn_style} title="Send Backward">
						⬇ Backward
					</button>
				</div>
			</div>

			<div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>
				<strong>Type:</strong> {shape.type}
			</div>
		</>
	);
}

const CONNECTOR_COLOURS = [
	'#333333', '#666666', '#999999',
	'#2196F3', '#1565C0', '#0D47A1',
	'#4CAF50', '#2E7D32', '#1B5E20',
	'#FF9800', '#E65100', '#BF360C',
	'#F44336', '#C62828', '#880E4F',
	'#9C27B0', '#4A148C', '#311B92',
];

function ConnectorTab({ connector, on_connector_change, on_z_order }: {
	connector: Connector;
	on_connector_change: (changes: Partial<Pick<Connector, 'arrow_type' | 'routing'> & { stroke: string; stroke_width: number }>) => void;
	on_z_order: (action: 'bring_front' | 'send_back' | 'bring_forward' | 'send_backward') => void;
}) {
	const arrow_options: { value: ArrowType; label: string }[] = [
		{ value: 'forward', label: '→ Forward' },
		{ value: 'back', label: '← Back' },
		{ value: 'both', label: '↔ Both' },
	];
	const routing_options: { value: ConnectorRouting; label: string }[] = [
		{ value: 'ortho', label: '⊾ Orthogonal' },
		{ value: 'smooth', label: '∿ Smooth' },
		{ value: 'straight', label: '╲ Straight' },
	];

	return (
		<>
			<div style={{ fontSize: 11, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
				Connector
			</div>

			{/* Colour */}
			<div style={{ marginBottom: 10 }}>
				<label style={label_style}>Colour</label>
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 3 }}>
					{CONNECTOR_COLOURS.map(c => (
						<div
							key={c}
							onClick={() => on_connector_change({ stroke: c })}
							style={{
								width: 24, height: 24, borderRadius: 4,
								background: c, cursor: 'pointer',
								border: connector.style.stroke === c ? '2px solid #2196F3' : '1px solid #ddd',
								boxSizing: 'border-box',
							}}
						/>
					))}
				</div>
			</div>

			{/* Thickness */}
			<div style={{ ...row_style, marginBottom: 10 }}>
				<label style={label_style}>Thickness</label>
				<input
					type="range"
					min={1}
					max={8}
					value={connector.style.stroke_width}
					onChange={e => on_connector_change({ stroke_width: parseInt(e.target.value) })}
					style={{ flex: 1 }}
				/>
				<span style={{ fontSize: 11, color: '#999', minWidth: 24 }}>{connector.style.stroke_width}px</span>
			</div>

			{/* Arrow type */}
			<div style={{ marginBottom: 10 }}>
				<label style={label_style}>Arrows</label>
				<div style={{ display: 'flex', gap: 4 }}>
					{arrow_options.map(opt => (
						<button
							key={opt.value}
							onClick={() => on_connector_change({ arrow_type: opt.value })}
							style={{
								...z_btn_style,
								flex: 1,
								background: connector.arrow_type === opt.value ? '#e3f2fd' : '#f5f5f5',
								border: connector.arrow_type === opt.value ? '1px solid #90caf9' : '1px solid #e0e0e0',
								fontWeight: connector.arrow_type === opt.value ? 600 : 400,
							}}
						>
							{opt.label}
						</button>
					))}
				</div>
			</div>

			{/* Routing */}
			<div style={{ marginBottom: 10 }}>
				<label style={label_style}>Routing</label>
				<div style={{ display: 'flex', gap: 4 }}>
					{routing_options.map(opt => (
						<button
							key={opt.value}
							onClick={() => on_connector_change({ routing: opt.value })}
							style={{
								...z_btn_style,
								flex: 1,
								background: connector.routing === opt.value ? '#e3f2fd' : '#f5f5f5',
								border: connector.routing === opt.value ? '1px solid #90caf9' : '1px solid #e0e0e0',
								fontWeight: connector.routing === opt.value ? 600 : 400,
							}}
						>
							{opt.label}
						</button>
					))}
				</div>
			</div>

			{/* Z-order */}
			<div style={{ borderTop: '1px solid #e0e0e0', marginTop: 8, paddingTop: 8 }}>
				<label style={{ ...label_style, marginBottom: 6, display: 'block' }}>Order</label>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
					<button onClick={() => on_z_order('bring_front')} style={z_btn_style}>⬆⬆ Front</button>
					<button onClick={() => on_z_order('send_back')} style={z_btn_style}>⬇⬇ Back</button>
					<button onClick={() => on_z_order('bring_forward')} style={z_btn_style}>⬆ Forward</button>
					<button onClick={() => on_z_order('send_backward')} style={z_btn_style}>⬇ Backward</button>
				</div>
			</div>
		</>
	);
}

function FreehandTab({ path, on_freehand_change, on_z_order }: {
	path: FreehandPath;
	on_freehand_change: (changes: Partial<{ stroke: string; stroke_width: number }>) => void;
	on_z_order: (action: 'bring_front' | 'send_back' | 'bring_forward' | 'send_backward') => void;
}) {
	return (
		<>
			<div style={{ fontSize: 11, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
				Pen Stroke
			</div>

			{/* Colour */}
			<div style={{ marginBottom: 10 }}>
				<label style={label_style}>Colour</label>
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 3 }}>
					{CONNECTOR_COLOURS.map(c => (
						<div
							key={c}
							onClick={() => on_freehand_change({ stroke: c })}
							style={{
								width: 24, height: 24, borderRadius: 4,
								background: c, cursor: 'pointer',
								border: path.style.stroke === c ? '2px solid #2196F3' : '1px solid #ddd',
								boxSizing: 'border-box',
							}}
						/>
					))}
				</div>
				<div style={{ ...row_style, marginTop: 6 }}>
					<input
						type="color"
						value={path.style.stroke}
						onChange={e => on_freehand_change({ stroke: e.target.value })}
						style={{ width: 28, height: 22, border: 'none', cursor: 'pointer', padding: 0 }}
					/>
					<span style={{ fontSize: 11, color: '#999' }}>Custom</span>
				</div>
			</div>

			{/* Thickness */}
			<div style={{ ...row_style, marginBottom: 10 }}>
				<label style={label_style}>Thickness</label>
				<input
					type="range"
					min={1}
					max={10}
					value={path.style.stroke_width}
					onChange={e => on_freehand_change({ stroke_width: parseInt(e.target.value) })}
					style={{ flex: 1, minWidth: 0 }}
				/>
				<span style={{ fontSize: 11, color: '#999', minWidth: 24 }}>{path.style.stroke_width}px</span>
			</div>

			{/* Z-order */}
			<div style={{ borderTop: '1px solid #e0e0e0', marginTop: 8, paddingTop: 8 }}>
				<label style={{ ...label_style, marginBottom: 6, display: 'block' }}>Order</label>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
					<button onClick={() => on_z_order('bring_front')} style={z_btn_style}>⬆⬆ Front</button>
					<button onClick={() => on_z_order('send_back')} style={z_btn_style}>⬇⬇ Back</button>
					<button onClick={() => on_z_order('bring_forward')} style={z_btn_style}>⬆ Forward</button>
					<button onClick={() => on_z_order('send_backward')} style={z_btn_style}>⬇ Backward</button>
				</div>
			</div>
		</>
	);
}

// Outer wrapper — allows collab controls to overflow left
const panel_wrapper_style: React.CSSProperties = {
	position: 'absolute',
	right: 0,
	top: 0,
	bottom: 0,
	width: 220,
	zIndex: 90,
	pointerEvents: 'none',
};

const panel_style: React.CSSProperties = {
	position: 'relative',
	width: '100%',
	height: '100%',
	background: '#fff',
	borderLeft: '1px solid #e0e0e0',
	display: 'flex',
	flexDirection: 'column',
	boxShadow: '-2px 0 8px rgba(0,0,0,0.05)',
	overflowY: 'auto',
	overflowX: 'hidden',
	fontFamily: 'inherit',
	pointerEvents: 'auto',
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

const z_btn_style: React.CSSProperties = {
	padding: '4px 6px',
	border: '1px solid #e0e0e0',
	borderRadius: 4,
	fontSize: 11,
	cursor: 'pointer',
	fontFamily: 'inherit',
	background: '#f5f5f5',
};

const nav_btn_style: React.CSSProperties = {
	width: 20,
	height: 20,
	padding: 0,
	background: 'none',
	border: '1px solid #ddd',
	borderRadius: '50%',
	cursor: 'pointer',
	fontSize: 14,
	lineHeight: 1,
	color: '#888',
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	flexShrink: 0,
};
