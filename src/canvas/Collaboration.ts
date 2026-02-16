import type { CollabMessage, CollabUser, Point, CanvasState } from './types';

const USER_COLOURS = [
	'#2196F3', '#E91E63', '#4CAF50', '#FF9800', '#9C27B0',
	'#00BCD4', '#F44336', '#8BC34A', '#FF5722', '#3F51B5',
];

// Generate a persistent user ID (stored in localStorage)
function Get_User_Id(): string {
	let id = localStorage.getItem('whitebored-user-id');
	if (!id) {
		id = 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
		localStorage.setItem('whitebored-user-id', id);
	}
	return id;
}

function Get_User_Name(): string {
	return localStorage.getItem('whitebored-user-name') || 'Anonymous';
}

function Get_User_Colour(user_id: string): string {
	// Deterministic colour from user ID
	let hash = 0;
	for (let i = 0; i < user_id.length; i++) {
		hash = ((hash << 5) - hash + user_id.charCodeAt(i)) | 0;
	}
	return USER_COLOURS[Math.abs(hash) % USER_COLOURS.length];
}

export type CollabEventHandler = {
	on_user_join?: (user: CollabUser) => void;
	on_user_leave?: (user_id: string) => void;
	on_cursor_move?: (user_id: string, cursor: Point) => void;
	on_state_sync?: (state: CanvasState) => void;
	on_operation?: (msg: CollabMessage) => void;
	on_state_requested?: () => CanvasState | null;
	on_connection_change?: (connected: boolean) => void;
};

export class CollabSession {
	private ws: WebSocket | null = null;
	private room_id: string;
	private user_id: string;
	private user_name: string;
	private user_colour: string;
	private is_host: boolean;
	private handlers: CollabEventHandler;
	private users: Map<string, CollabUser> = new Map();
	private cursor_throttle: number = 0;
	private reconnect_timer: ReturnType<typeof setTimeout> | null = null;
	private connected: boolean = false;

	constructor(room_id: string, handlers: CollabEventHandler, is_host: boolean = false) {
		this.room_id = room_id;
		this.user_id = Get_User_Id();
		this.user_name = Get_User_Name();
		this.user_colour = Get_User_Colour(this.user_id);
		this.handlers = handlers;
		this.is_host = is_host;
	}

	get User_Id(): string { return this.user_id; }
	get User_Name(): string { return this.user_name; }
	get User_Colour(): string { return this.user_colour; }
	get Room_Id(): string { return this.room_id; }
	get Is_Host(): boolean { return this.is_host; }
	get Is_Connected(): boolean { return this.connected; }
	get Users(): CollabUser[] { return Array.from(this.users.values()); }

	Set_User_Name(name: string): void {
		this.user_name = name;
		localStorage.setItem('whitebored-user-name', name);
	}

	async Connect(): Promise<void> {
		try {
			// Negotiate a WebSocket URL from the API
			const resp = await fetch(`/api/negotiate?room=${encodeURIComponent(this.room_id)}&user=${encodeURIComponent(this.user_id)}`);
			if (!resp.ok) throw new Error(`Negotiate failed: ${resp.status}`);
			const { url } = await resp.json();
			this.ws = new WebSocket(url, 'json.webpubsub.azure.v1');
			this.ws.onopen = () => this.Handle_Open();
			this.ws.onmessage = (e) => this.Handle_Message(e);
			this.ws.onclose = () => this.Handle_Close();
			this.ws.onerror = () => this.Handle_Close();
		} catch (err) {
			console.error('Collab connect failed:', err);
			this.Schedule_Reconnect();
		}
	}

	Disconnect(): void {
		if (this.reconnect_timer) {
			clearTimeout(this.reconnect_timer);
			this.reconnect_timer = null;
		}
		if (this.ws) {
			// Send leave before closing
			this.Send({ type: 'leave', payload: {} });
			this.ws.close();
			this.ws = null;
		}
		this.connected = false;
		this.users.clear();
		this.handlers.on_connection_change?.(false);
	}

	// Send cursor position (throttled to ~20fps)
	Send_Cursor(cursor: Point): void {
		const now = Date.now();
		if (now - this.cursor_throttle < 50) return;
		this.cursor_throttle = now;
		this.Send({ type: 'cursor', payload: cursor });
	}

	// Send a canvas operation
	Send_Operation(type: 'op_add' | 'op_update' | 'op_delete', payload: any): void {
		this.Send({ type, payload });
	}

	// Send full state (host responds to state requests)
	Send_State(state: CanvasState): void {
		this.Send({ type: 'state_sync', payload: state });
	}

	private Send(partial: { type: CollabMessage['type']; payload: any }): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
		const msg: CollabMessage = {
			type: partial.type,
			sender_id: this.user_id,
			sender_name: this.user_name,
			sender_colour: this.user_colour,
			room_id: this.room_id,
			payload: partial.payload,
			timestamp: Date.now(),
		};
		// Use Web PubSub's JSON subprotocol format to send to group
		this.ws.send(JSON.stringify({
			type: 'sendToGroup',
			group: this.room_id,
			dataType: 'json',
			data: msg,
		}));
	}

	private Handle_Open(): void {
		this.connected = true;
		this.handlers.on_connection_change?.(true);

		// Join the room group
		this.ws!.send(JSON.stringify({
			type: 'joinGroup',
			group: this.room_id,
		}));

		// Announce ourselves
		setTimeout(() => {
			this.Send({
				type: 'join',
				payload: {
					name: this.user_name,
					colour: this.user_colour,
					is_host: this.is_host,
				},
			});

			// If not host, request the current state
			if (!this.is_host) {
				this.Send({ type: 'request_state', payload: {} });
			}
		}, 200);
	}

	private Handle_Message(event: MessageEvent): void {
		try {
			const envelope = JSON.parse(event.data);
			// Web PubSub wraps messages — extract the actual data
			const msg: CollabMessage = envelope.data ?? envelope;
			if (!msg.type || msg.sender_id === this.user_id) return;

			switch (msg.type) {
				case 'join': {
					const user: CollabUser = {
						id: msg.sender_id,
						name: msg.payload.name || msg.sender_name,
						colour: msg.payload.colour || msg.sender_colour,
						status: 'viewing',
						permission: 'edit',
					};
					this.users.set(user.id, user);
					this.handlers.on_user_join?.(user);
					break;
				}
				case 'leave': {
					this.users.delete(msg.sender_id);
					this.handlers.on_user_leave?.(msg.sender_id);
					break;
				}
				case 'cursor': {
					const user = this.users.get(msg.sender_id);
					if (user) {
						user.cursor = msg.payload;
						user.status = 'editing';
					}
					this.handlers.on_cursor_move?.(msg.sender_id, msg.payload);
					break;
				}
				case 'state_sync': {
					this.handlers.on_state_sync?.(msg.payload);
					break;
				}
				case 'request_state': {
					// If we're host, respond with current state
					if (this.is_host) {
						const state = this.handlers.on_state_requested?.();
						if (state) this.Send_State(state);
					}
					break;
				}
				case 'op_add':
				case 'op_update':
				case 'op_delete': {
					const user = this.users.get(msg.sender_id);
					if (user) user.status = 'editing';
					this.handlers.on_operation?.(msg);
					break;
				}
			}
		} catch (err) {
			console.warn('Collab message parse error:', err);
		}
	}

	private Handle_Close(): void {
		this.connected = false;
		this.handlers.on_connection_change?.(false);
		this.Schedule_Reconnect();
	}

	private Schedule_Reconnect(): void {
		if (this.reconnect_timer) return;
		this.reconnect_timer = setTimeout(() => {
			this.reconnect_timer = null;
			this.Connect();
		}, 3000);
	}
}

// Generate a short room ID for sharing
export function Generate_Room_Id(): string {
	const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
	let id = '';
	for (let i = 0; i < 6; i++) {
		id += chars[Math.floor(Math.random() * chars.length)];
	}
	return id;
}

// Build a shareable URL from a room ID
export function Share_Url(room_id: string): string {
	return `${window.location.origin}${window.location.pathname}?room=${room_id}`;
}
