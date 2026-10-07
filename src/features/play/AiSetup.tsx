import { t } from '../../i18n';
import { useState } from 'react';
import { Bot } from 'lucide-react';
import { LEVELS } from '../../ai/search';
import { Button, Modal, Segmented, cx } from '../../ui/kit';

export function AiSetup({ open, onClose, onStart }: { open: boolean; onClose: () => void; onStart: (level: number, color: 'w' | 'b') => void }) {
  const [level, setLevel] = useState(3);
  const [color, setColor] = useState<'w' | 'random' | 'b'>('random');
  return (
    <Modal open={open} onClose={onClose} title={t('Play vs AI')} subtitle={t('Pick a difficulty. You can take moves back while you practise.')} width={480}>
      <div className="levels" role="radiogroup" aria-label={t('Difficulty')}>
        {LEVELS.map((l) => (
          <button key={l.id} type="button" role="radio" aria-checked={l.id === level} className={cx('level', l.id === level && 'is-selected')} onClick={() => setLevel(l.id)}>
            <span className="level-icon">
              <Bot size={20} />
            </span>
            <span className="level-text">
              <strong>{t(l.name)}</strong>
              <span className="faint">{t(l.description)}</span>
            </span>
            <span className="level-dots" aria-label={t('Strength {n} of 5', { n: l.id })}>
              {LEVELS.map((d) => (
                <span key={d.id} className={cx(d.id <= l.id && 'on')} />
              ))}
            </span>
          </button>
        ))}
      </div>
      <div className="sheet-row">
        <span className="sheet-label">{t('Play as')}</span>
        <Segmented
          label={t('Your colour')}
          value={color}
          onChange={setColor}
          options={[
            { value: 'w', label: t('White') },
            { value: 'random', label: t('Random') },
            { value: 'b', label: t('Black') },
          ]}
        />
      </div>
      <Button variant="primary" size="lg" block onClick={() => onStart(level, color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color)}>
        {t('Start game')}
      </Button>
    </Modal>
  );
}
