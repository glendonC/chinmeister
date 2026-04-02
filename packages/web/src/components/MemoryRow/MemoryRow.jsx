import { useState } from 'react';
import { formatRelativeTime } from '../../lib/relativeTime.js';
import { getToolMeta } from '../../lib/toolMeta.js';
import ToolIcon from '../ToolIcon/ToolIcon.jsx';
import styles from './MemoryRow.module.css';

const MAX_MEMORY_TEXT_LENGTH = 2000;
const MAX_MEMORY_TAGS = 50;
const MAX_MEMORY_TAG_LENGTH = 50;

export default function MemoryRow({ memory, onUpdate, onDelete }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(memory.text);
  const [editTags, setEditTags] = useState((memory.tags || []).join(', '));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const tags = memory.tags || [];
  const when = formatRelativeTime(memory.updated_at || memory.created_at);
  const rawTool = memory.host_tool || null;
  const toolMeta = rawTool && rawTool !== 'unknown' ? getToolMeta(rawTool) : null;
  const handle = memory.handle || null;
  const model = memory.agent_model || null;
  const accentColor = toolMeta?.color || 'var(--soft)';

  function handleEdit() {
    setEditText(memory.text);
    setEditTags((memory.tags || []).join(', '));
    setError(null);
    setIsEditing(true);
  }

  function handleCancel() {
    setIsEditing(false);
    setError(null);
  }

  async function handleSave() {
    const trimmedText = editText.trim();
    if (!trimmedText) return;
    const newTags = editTags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .map((t) => t.slice(0, MAX_MEMORY_TAG_LENGTH))
      .filter(Boolean)
      .slice(0, MAX_MEMORY_TAGS);
    const textChanged = trimmedText !== memory.text;
    const tagsChanged = JSON.stringify(newTags) !== JSON.stringify(memory.tags || []);
    if (!textChanged && !tagsChanged) {
      setIsEditing(false);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onUpdate(
        memory.id,
        textChanged ? trimmedText : undefined,
        tagsChanged ? newTags : undefined,
      );
      setIsEditing(false);
    } catch (err) {
      setError(err.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onDelete(memory.id);
    } catch (err) {
      setError(err.message || 'Delete failed');
      setSaving(false);
      setConfirmDelete(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') handleCancel();
    if (e.key === 'Enter' && e.metaKey) handleSave();
  }

  if (isEditing) {
    return (
      <div className={styles.row}>
        <div className={styles.accent} style={{ background: accentColor }} />
        <div className={styles.body} onKeyDown={handleKeyDown}>
          <div className={styles.editForm}>
            <input
              className={styles.editTagsInput}
              type="text"
              value={editTags}
              onChange={(e) => setEditTags(e.target.value)}
              placeholder="Tags (comma-separated)"
              disabled={saving}
            />
            <textarea
              className={styles.editTextarea}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              maxLength={MAX_MEMORY_TEXT_LENGTH}
              rows={3}
              disabled={saving}
              autoFocus
            />
            {error && <span className={styles.editError}>{error}</span>}
            <div className={styles.editFooter}>
              <span className={styles.editAuthor}>{handle}</span>
              <div className={styles.editActions}>
                <button
                  className={styles.btnSave}
                  onClick={handleSave}
                  disabled={saving || !editText.trim()}
                >
                  {saving ? 'Saving\u2026' : 'Save'}
                </button>
                <button className={styles.btnCancel} onClick={handleCancel} disabled={saving}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.row}>
      <div className={styles.accent} style={{ background: accentColor }} />
      <div className={styles.body}>
        <div className={styles.text}>{memory.text}</div>

        <div className={styles.footer}>
          <div className={styles.source}>
            {toolMeta && (
              <>
                <ToolIcon tool={rawTool} size={14} />
                <span className={styles.toolLabel}>{toolMeta.label}</span>
              </>
            )}
            {model && (
              <>
                {toolMeta && <span className={styles.sep}>&middot;</span>}
                <span className={styles.modelLabel}>{model}</span>
              </>
            )}
            {handle && (
              <>
                {(toolMeta || model) && <span className={styles.sep}>&middot;</span>}
                <span>{handle}</span>
              </>
            )}
            {when && (
              <>
                <span className={styles.sep}>&middot;</span>
                <span>{when}</span>
              </>
            )}
            {tags.length > 0 && (
              <>
                <span className={styles.sep}>&middot;</span>
                {tags.map((t) => (
                  <span key={t} className={styles.tag}>
                    {t}
                  </span>
                ))}
              </>
            )}
          </div>

          {(onUpdate || onDelete) && (
            <div className={styles.actions}>
              {onUpdate && (
                <button className={styles.btnText} onClick={handleEdit}>
                  Edit
                </button>
              )}
              {onDelete && (
                <>
                  <span className={styles.actionSep}>&middot;</span>
                  <button
                    className={confirmDelete ? styles.btnText : styles.btnDelete}
                    onClick={handleDelete}
                    onBlur={() => setConfirmDelete(false)}
                    disabled={saving}
                  >
                    {confirmDelete ? (
                      <span className={styles.confirmLabel}>Confirm?</span>
                    ) : (
                      'Delete'
                    )}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
