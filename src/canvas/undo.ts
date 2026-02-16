import type { CanvasState } from './types';

// Snapshot-based undo/redo — simple and reliable
// Each action saves a full snapshot of the canvas state

const MAX_HISTORY = 100;

export class UndoManager {
	private m_undo_stack: CanvasState[] = [];
	private m_redo_stack: CanvasState[] = [];

	// Deep-clone the state for the snapshot
	private static Clone(state: CanvasState): CanvasState {
		return JSON.parse(JSON.stringify(state));
	}

	// Call before making a change to save the current state
	Push(state: CanvasState): void {
		this.m_undo_stack.push(UndoManager.Clone(state));
		if (this.m_undo_stack.length > MAX_HISTORY) {
			this.m_undo_stack.shift();
		}
		// Any new action invalidates the redo stack
		this.m_redo_stack = [];
	}

	Undo(current_state: CanvasState): CanvasState | null {
		if (this.m_undo_stack.length === 0) return null;
		this.m_redo_stack.push(UndoManager.Clone(current_state));
		return this.m_undo_stack.pop()!;
	}

	Redo(current_state: CanvasState): CanvasState | null {
		if (this.m_redo_stack.length === 0) return null;
		this.m_undo_stack.push(UndoManager.Clone(current_state));
		return this.m_redo_stack.pop()!;
	}

	get Can_Undo(): boolean {
		return this.m_undo_stack.length > 0;
	}

	get Can_Redo(): boolean {
		return this.m_redo_stack.length > 0;
	}

	Clear(): void {
		this.m_undo_stack = [];
		this.m_redo_stack = [];
	}
}
