'use client';

import { useState } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import styles from './TagPicker.module.css';

const PALETTE = [
  '#58A6FF', '#00E676', '#FF9800', '#AB47BC', '#EF5350',
  '#42A5F5', '#FFC107', '#26C6DA', '#EC407A', '#8D6E63',
];

export default function TagPicker({ selectedIds = [], onChange }) {
  const { tags, addTag } = useFinance();
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [saving, setSaving] = useState(false);

  function toggle(id) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((i) => i !== id)
        : [...selectedIds, id]
    );
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    const { data, error } = await addTag(newName.trim(), newColor);
    setSaving(false);
    if (!error && data) {
      onChange([...selectedIds, data.id]);
      setNewName('');
      setNewColor(PALETTE[0]);
      setIsCreating(false);
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.chips}>
        {tags.map((tag) => {
          const active = selectedIds.includes(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              className={styles.chip}
              onClick={() => toggle(tag.id)}
              style={
                active
                  ? { background: `${tag.cor}25`, borderColor: tag.cor, color: tag.cor }
                  : undefined
              }
            >
              <span className={styles.dot} style={{ background: tag.cor }} />
              {tag.nome}
            </button>
          );
        })}
        <button
          type="button"
          className={styles.addChip}
          onClick={() => setIsCreating((v) => !v)}
        >
          + nova tag
        </button>
      </div>

      {isCreating && (
        <div className={styles.createRow}>
          <input
            className="input"
            placeholder="Nome da tag"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <div className={styles.palette}>
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                className={styles.swatch}
                style={{
                  background: c,
                  boxShadow: newColor === c ? `0 0 0 2px var(--bg-surface), 0 0 0 4px ${c}` : 'none',
                }}
                onClick={() => setNewColor(c)}
                aria-label={`Cor ${c}`}
              />
            ))}
          </div>
          <button
            type="button"
            className={`btn btn-primary ${styles.createBtn}`}
            onClick={handleCreate}
            disabled={saving || !newName.trim()}
          >
            {saving ? 'Criando...' : 'Criar tag'}
          </button>
        </div>
      )}
    </div>
  );
}
