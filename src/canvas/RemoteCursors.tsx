import type { CollabUser } from './types';

interface RemoteCursorsProps {
	users: CollabUser[];
	viewport: { offset_x: number; offset_y: number; zoom: number };
}

// SVG cursor path (matches the mockup arrow shape)
const CURSOR_PATH = 'M 0 0 L 0 18 L 5 14 L 10 22 L 13 20 L 8 12 L 14 10 Z';

export function RemoteCursors({ users, viewport }: RemoteCursorsProps) {
	return (
		<g pointerEvents="none">
			{users.map(user => {
				if (!user.cursor) return null;
				// Convert canvas coords to screen coords
				const sx = user.cursor.x * viewport.zoom + viewport.offset_x;
				const sy = user.cursor.y * viewport.zoom + viewport.offset_y;
				return (
					<g key={user.id} transform={`translate(${sx}, ${sy})`}>
						<path
							d={CURSOR_PATH}
							fill={user.colour}
							stroke="#fff"
							strokeWidth={1}
						/>
						<rect
							x={16} y={12}
							width={user.name.length * 6.5 + 12}
							height={18}
							rx={4}
							fill={user.colour}
						/>
						<text
							x={22} y={24}
							fontSize={10}
							fontWeight={600}
							fill="#fff"
							fontFamily="Segoe UI, system-ui, sans-serif"
						>
							{user.name}
						</text>
					</g>
				);
			})}
		</g>
	);
}

// Presence avatars for the toolbar
export function PresenceAvatars({ users, self_name }: { users: CollabUser[]; self_name: string }) {
	const all = [
		{ id: 'self', name: self_name, colour: '#2196F3' },
		...users,
	];
	const count = all.length;

	return (
		<div style={{
			display: 'flex',
			alignItems: 'center',
			gap: 2,
			paddingLeft: 12,
			borderLeft: '1px solid #e0e0e0',
			marginLeft: 8,
		}}>
			{all.slice(0, 5).map((u, i) => (
				<div
					key={u.id}
					title={u.name + (u.id === 'self' ? ' (you)' : '')}
					style={{
						width: 26,
						height: 26,
						borderRadius: '50%',
						background: u.colour,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						fontSize: 11,
						fontWeight: 700,
						color: '#fff',
						border: '2px solid #fff',
						boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
						marginLeft: i > 0 ? -8 : 0,
						zIndex: 10 - i,
						position: 'relative',
					}}
				>
					{u.name.charAt(0).toUpperCase()}
				</div>
			))}
			{count > 5 && (
				<span style={{ fontSize: 11, color: '#888', marginLeft: 4 }}>+{count - 5}</span>
			)}
			<span style={{ fontSize: 11, color: '#888', marginLeft: 6, whiteSpace: 'nowrap' }}>
				{count} online
			</span>
		</div>
	);
}
