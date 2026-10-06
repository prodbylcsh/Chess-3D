import { useState } from 'react';
import { STAKES, wagerNet } from '#shared/economy.ts';
import type { StakeId } from '../../api';
import { useProfile } from '../../app/session';
import { Button, Coins, Modal, cx } from '../../ui/kit';

export function StakePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (stake: StakeId) => void }) {
  const profile = useProfile();
  const [stake, setStake] = useState<StakeId>('low');
  const affordable = (id: StakeId) => profile.coins >= STAKES[id].amount;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Play for coins"
      subtitle={
        <>
          Both players stake the same amount; the winner takes the pot minus a 10% fee. Your balance: <Coins amount={profile.coins} />
        </>
      }
      width={480}
    >
      <div className="stakes" role="radiogroup" aria-label="Stake">
        {(Object.keys(STAKES) as StakeId[]).map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={id === stake}
            disabled={!affordable(id)}
            className={cx('stake', id === stake && 'is-selected')}
            onClick={() => setStake(id)}
          >
            <span className="stake-name">{STAKES[id].name}</span>
            <Coins amount={STAKES[id].amount} size={20} />
            <span className="stake-win">Win +{wagerNet(STAKES[id].amount, 'win')}</span>
            {!affordable(id) && <span className="stake-lock">Need {STAKES[id].amount}</span>}
          </button>
        ))}
      </div>
      <Button variant="primary" size="lg" block disabled={!affordable(stake)} onClick={() => onPick(stake)}>
        Find opponent
      </Button>
    </Modal>
  );
}
