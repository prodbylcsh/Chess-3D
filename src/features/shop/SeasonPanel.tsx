import { useEffect, useState } from 'react';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { BRACKETS } from '#shared/seasons.ts';
import { TIERS } from '#shared/rating.ts';
import { api, type SeasonInfo } from '../../api';
import { CATEGORY_NAMES, itemName } from '../../api/catalog';
import { itemDef } from '#shared/shop.ts';
import { rankText, t, tn } from '../../i18n';
import { ProfileIcon, RankEmblem, SeasonBadge } from '../../ui/art/art';
import { Badge, Button, Coins, Modal, cx } from '../../ui/kit';
import { shortDate } from '../../ui/format';
import { ItemPreview } from './previews';

const bracketName = (id: string) => t(BRACKETS.find((b) => b.id === id)?.name ?? id);
const daysLeft = (end: string) => Math.max(0, Math.ceil((new Date(end).getTime() - Date.now()) / 86_400_000));

/** The running season and what your highest rank so far earns when it ends. */
export function SeasonPanel({ onShowItem }: { onShowItem: (id: string) => void }) {
  const [season, setSeason] = useState<SeasonInfo | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void api.seasons.current().then(setSeason);
  }, []);

  if (!season) return <section className="season season-loading" />;
  const mine = season.rewards.find((r) => r.bracket === season.bracket)!;
  return (
    <section className="season">
      <div className="season-glow" />
      <div className="season-info">
        <Badge tone="violet">{t('Season {n}', { n: season.number })}</Badge>
        <h2 className="display">{t('Season rewards')}</h2>
        <p className="muted">
          <CalendarClock size={15} /> {tn(daysLeft(season.end), 'Ends in {n} day', 'Ends in {n} days')} · {shortDate(new Date(season.end))}
        </p>
        <div className="season-peak">
          <RankEmblem tier={season.peak.tier} division={season.peak.division} size={38} />
          <span>
            <span className="faint">{t('Your highest rank this season')}</span>
            <strong>
              {rankText(season.peak.label)} · {bracketName(season.bracket)}
            </strong>
          </span>
        </div>
      </div>
      <div className="season-rewards">
        <Reward label={t('Badge')}>
          <SeasonBadge season={season.number} bracket={mine.bracket} size={54} />
        </Reward>
        <Reward label={t('Icon')}>
          <ProfileIcon icon={mine.icon} size={54} />
        </Reward>
        <Reward label={t('Coins')}>
          <Coins amount={mine.coins} size={20} />
        </Reward>
        {mine.item && (
          <Reward label={t(CATEGORY_NAMES[itemDef(mine.item)!.category])} onClick={() => onShowItem(mine.item!)}>
            <span className="season-item">
              <span className="season-item-art">
                <ItemPreview id={mine.item} />
              </span>
              {itemName(mine.item)}
            </span>
          </Reward>
        )}
      </div>
      <Button variant="ghost" size="sm" className="season-all" onClick={() => setOpen(true)}>
        {t('All rewards')} <ChevronRight size={15} />
      </Button>
      <AllRewards season={season} open={open} onClose={() => setOpen(false)} onShowItem={onShowItem} />
    </section>
  );
}

function Reward({ label, children, onClick }: { label: string; children: React.ReactNode; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={cx('season-reward', onClick && 'is-link')} onClick={onClick} type={onClick ? 'button' : undefined}>
      <span className="season-reward-art">{children}</span>
      <span className="faint">{label}</span>
    </Tag>
  );
}

function AllRewards({ season, open, onClose, onShowItem }: { season: SeasonInfo; open: boolean; onClose: () => void; onShowItem: (id: string) => void }) {
  const pull = Math.round(season.resetShare * 100);
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={640}
      title={t('Season {n} rewards', { n: season.number })}
      subtitle={t('Rewards depend on the highest rank you reach this season. Higher brackets always get more.')}
    >
      <ul className="bracket-list">
        {[...season.rewards].reverse().map((r) => {
          const bracket = BRACKETS.find((b) => b.id === r.bracket)!;
          const top = TIERS.find((x) => x.id === bracket.tiers[bracket.tiers.length - 1])!;
          return (
            <li key={r.bracket} className={cx('bracket', r.bracket === season.bracket && 'is-mine')}>
              <RankEmblem tier={top.id} division={null} size={34} />
              <span className="bracket-name">
                <strong>{bracketName(r.bracket)}</strong>
                {r.bracket === season.bracket && <span className="gold">{t('Your bracket')}</span>}
              </span>
              <SeasonBadge season={season.number} bracket={r.bracket} size={34} />
              <ProfileIcon icon={r.icon} size={34} />
              <Coins amount={r.coins} size={15} />
              {r.item ? (
                <button type="button" className="link-btn bracket-item" onClick={() => onShowItem(r.item!)}>
                  {itemName(r.item)}
                </button>
              ) : (
                <span className="faint">–</span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="faint bracket-foot">
        {pull === 100
          ? t('When this season ends, everyone starts again at 1,000 MMR.')
          : t('When this season ends, ratings move {n}% of the way back to 1,000 MMR.', { n: pull })}{' '}
        {t('If you already own the item, you get its price in coins instead.')}
      </p>
    </Modal>
  );
}
