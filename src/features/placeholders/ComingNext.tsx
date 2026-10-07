import { Check, Store, type LucideIcon } from 'lucide-react';
import { Page } from '../../app/AppLayout';
import { Badge, Card } from '../../ui/kit';
import './placeholders.css';

type ModuleId = 'shop';

const MODULES: Record<ModuleId, { title: string; icon: LucideIcon; milestone: string; summary: string; features: string[] }> = {
  shop: {
    title: 'Shop',
    icon: Store,
    milestone: 'Milestone 3',
    summary: 'Spend the coins you earn on cosmetics.',
    features: ['Piece sets, boards and backgrounds', 'Move animations and destruction effects', 'Profile icons', 'Equip what you own with one click'],
  },
};

export function ComingNext({ module }: { module: ModuleId }) {
  const m = MODULES[module];
  return (
    <Page title={m.title} subtitle={m.summary}>
      <Card className="coming">
        <div className="coming-icon">
          <m.icon size={30} />
        </div>
        <div className="coming-body">
          <Badge tone="violet">Arrives in {m.milestone}</Badge>
          <h2>Designed and on the roadmap</h2>
          <ul>
            {m.features.map((f) => (
              <li key={f}>
                <Check size={16} /> {f}
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </Page>
  );
}
