import { describe, expect, it } from 'vitest';
import { rowReducer, initState } from './MemoryRow.tsx';

// ---------------------------------------------------------------------------
// initState
// ---------------------------------------------------------------------------

describe('initState', () => {
  it('initializes in view mode with memory text and joined tags', () => {
    const state = initState({ id: 'm1', text: 'hello', tags: ['a', 'b'] });
    expect(state).toEqual({
      mode: 'view',
      editText: 'hello',
      editTags: 'a, b',
      error: null,
    });
  });

  it('handles missing tags', () => {
    const state = initState({ id: 'm2', text: 'no tags' });
    expect(state.editTags).toBe('');
  });

  it('handles empty tags array', () => {
    const state = initState({ id: 'm3', text: 'empty', tags: [] });
    expect(state.editTags).toBe('');
  });
});

// ---------------------------------------------------------------------------
// rowReducer
// ---------------------------------------------------------------------------

function viewState(overrides = {}) {
  return {
    mode: 'view',
    editText: 'original',
    editTags: 'tag1',
    error: null,
    ...overrides,
  };
}

function editingState(overrides = {}) {
  return {
    mode: 'editing',
    editText: 'edited',
    editTags: 'tag1, tag2',
    error: null,
    ...overrides,
  };
}

function savingState(overrides = {}) {
  return {
    mode: 'saving',
    editText: 'edited',
    editTags: 'tag1, tag2',
    error: null,
    ...overrides,
  };
}

function confirmingDeleteState(overrides = {}) {
  return {
    mode: 'confirming-delete',
    editText: 'original',
    editTags: 'tag1',
    error: null,
    ...overrides,
  };
}

describe('rowReducer', () => {
  // --- START_EDIT ---
  describe('START_EDIT', () => {
    it('transitions from view to editing with provided text and tags', () => {
      const result = rowReducer(viewState(), {
        type: 'START_EDIT',
        text: 'new text',
        tags: 'new, tags',
      });
      expect(result.mode).toBe('editing');
      expect(result.editText).toBe('new text');
      expect(result.editTags).toBe('new, tags');
      expect(result.error).toBeNull();
    });

    it('is a no-op from editing mode', () => {
      const state = editingState();
      const result = rowReducer(state, { type: 'START_EDIT', text: 'x', tags: 'y' });
      expect(result).toBe(state);
    });

    it('is a no-op from saving mode', () => {
      const state = savingState();
      const result = rowReducer(state, { type: 'START_EDIT', text: 'x', tags: 'y' });
      expect(result).toBe(state);
    });

    it('is a no-op from confirming-delete mode', () => {
      const state = confirmingDeleteState();
      const result = rowReducer(state, { type: 'START_EDIT', text: 'x', tags: 'y' });
      expect(result).toBe(state);
    });
  });

  // --- CANCEL_EDIT ---
  describe('CANCEL_EDIT', () => {
    it('transitions from editing back to view', () => {
      const result = rowReducer(editingState({ error: 'old error' }), { type: 'CANCEL_EDIT' });
      expect(result.mode).toBe('view');
      expect(result.error).toBeNull();
    });

    it('is a no-op from view mode', () => {
      const state = viewState();
      const result = rowReducer(state, { type: 'CANCEL_EDIT' });
      expect(result).toBe(state);
    });

    it('is a no-op from saving mode', () => {
      const state = savingState();
      const result = rowReducer(state, { type: 'CANCEL_EDIT' });
      expect(result).toBe(state);
    });
  });

  // --- SET_TEXT ---
  describe('SET_TEXT', () => {
    it('updates editText in editing mode', () => {
      const result = rowReducer(editingState(), { type: 'SET_TEXT', value: 'updated' });
      expect(result.editText).toBe('updated');
    });

    it('is a no-op from view mode', () => {
      const state = viewState();
      const result = rowReducer(state, { type: 'SET_TEXT', value: 'x' });
      expect(result).toBe(state);
    });

    it('is a no-op from saving mode', () => {
      const state = savingState();
      const result = rowReducer(state, { type: 'SET_TEXT', value: 'x' });
      expect(result).toBe(state);
    });
  });

  // --- SET_TAGS ---
  describe('SET_TAGS', () => {
    it('updates editTags in editing mode', () => {
      const result = rowReducer(editingState(), { type: 'SET_TAGS', value: 'new, tags' });
      expect(result.editTags).toBe('new, tags');
    });

    it('is a no-op from view mode', () => {
      const state = viewState();
      const result = rowReducer(state, { type: 'SET_TAGS', value: 'x' });
      expect(result).toBe(state);
    });
  });

  // --- SET_ERROR ---
  describe('SET_ERROR', () => {
    it('sets error in editing mode', () => {
      const result = rowReducer(editingState(), { type: 'SET_ERROR', error: 'Bad input' });
      expect(result.error).toBe('Bad input');
      expect(result.mode).toBe('editing');
    });

    it('is a no-op from view mode', () => {
      const state = viewState();
      const result = rowReducer(state, { type: 'SET_ERROR', error: 'nope' });
      expect(result).toBe(state);
    });
  });

  // --- REQUEST_DELETE ---
  describe('REQUEST_DELETE', () => {
    it('transitions from view to confirming-delete', () => {
      const result = rowReducer(viewState(), { type: 'REQUEST_DELETE' });
      expect(result.mode).toBe('confirming-delete');
    });

    it('is a no-op from editing mode', () => {
      const state = editingState();
      const result = rowReducer(state, { type: 'REQUEST_DELETE' });
      expect(result).toBe(state);
    });
  });

  // --- CANCEL_DELETE ---
  describe('CANCEL_DELETE', () => {
    it('transitions from confirming-delete back to view', () => {
      const result = rowReducer(confirmingDeleteState(), { type: 'CANCEL_DELETE' });
      expect(result.mode).toBe('view');
    });

    it('is a no-op from view mode', () => {
      const state = viewState();
      const result = rowReducer(state, { type: 'CANCEL_DELETE' });
      expect(result).toBe(state);
    });
  });

  // --- START_SAVE ---
  describe('START_SAVE', () => {
    it('transitions from editing to saving', () => {
      const result = rowReducer(editingState({ error: 'old' }), { type: 'START_SAVE' });
      expect(result.mode).toBe('saving');
      expect(result.error).toBeNull();
    });

    it('transitions from confirming-delete to saving', () => {
      const result = rowReducer(confirmingDeleteState(), { type: 'START_SAVE' });
      expect(result.mode).toBe('saving');
    });

    it('is a no-op from view mode', () => {
      const state = viewState();
      const result = rowReducer(state, { type: 'START_SAVE' });
      expect(result).toBe(state);
    });

    it('is a no-op from saving mode (already saving)', () => {
      const state = savingState();
      const result = rowReducer(state, { type: 'START_SAVE' });
      expect(result).toBe(state);
    });
  });

  // --- SAVE_SUCCESS ---
  describe('SAVE_SUCCESS', () => {
    it('transitions from saving back to view', () => {
      const result = rowReducer(savingState(), { type: 'SAVE_SUCCESS' });
      expect(result.mode).toBe('view');
    });

    it('is a no-op from editing mode', () => {
      const state = editingState();
      const result = rowReducer(state, { type: 'SAVE_SUCCESS' });
      expect(result).toBe(state);
    });
  });

  // --- SAVE_ERROR ---
  describe('SAVE_ERROR', () => {
    it('transitions from saving back to editing with error', () => {
      const result = rowReducer(savingState(), { type: 'SAVE_ERROR', error: 'Network error' });
      expect(result.mode).toBe('editing');
      expect(result.error).toBe('Network error');
    });

    it('is a no-op from editing mode', () => {
      const state = editingState();
      const result = rowReducer(state, { type: 'SAVE_ERROR', error: 'err' });
      expect(result).toBe(state);
    });
  });

  // --- DELETE_SUCCESS ---
  describe('DELETE_SUCCESS', () => {
    it('returns state unchanged (component will unmount)', () => {
      const state = savingState();
      const result = rowReducer(state, { type: 'DELETE_SUCCESS' });
      expect(result).toBe(state);
    });
  });

  // --- DELETE_ERROR ---
  describe('DELETE_ERROR', () => {
    it('transitions from saving back to view with error', () => {
      const result = rowReducer(savingState(), { type: 'DELETE_ERROR', error: 'Delete failed' });
      expect(result.mode).toBe('view');
      expect(result.error).toBe('Delete failed');
    });

    it('is a no-op from editing mode', () => {
      const state = editingState();
      const result = rowReducer(state, { type: 'DELETE_ERROR', error: 'err' });
      expect(result).toBe(state);
    });
  });

  // --- Default case ---
  describe('unknown action', () => {
    it('returns state unchanged for unknown action types', () => {
      const state = viewState();
      const result = rowReducer(state, { type: 'UNKNOWN_ACTION' });
      expect(result).toBe(state);
    });
  });
});
