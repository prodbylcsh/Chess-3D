import { Check, MessageCircle, Settings, Store, UserRound, Users, type LucideIcon } from 'lucide-react';
import { Page } from '../../app/AppLayout';
import { Badge, Card } from '../../ui/kit';
import './placeholders.css';

type ModuleId = 'community' | 'shop' | 'profile' | 'messages' | 'settings';

const MODULES: Record<ModuleId, { title: string; icon: LucideIcon; milestone: string; summary: string; features: string[] }> = {
  community: {
    title: 'Community',
    icon: Users,
    milestone: 'Milestone 2',
    summary: 'Find players and build your friends list.',
    features: ['Search players by username', 'Send, accept and decline friend requests', 'View any player’s public profile', 'Invite friends straight into a game'],
  },
  shop: {
    title: 'Shop',
    icon: Store,
    milestone: 'Milestone 3',
    summary: 'Spend the coins you earn on cosmetics.',
    features: ['Piece sets, boards and backgrounds', 'Move animations and destruction effects', 'Profile icons', 'Equip what you own with one click'],
  },
  profile: {
    title: 'Profile',
    icon: UserRound,
    milestone: 'Milestone 2',
    summary: 'Your rank, history and collection, visible to everyone.',
    features: ['Rank emblem with division progress', 'Game history with results and MMR changes (visible only to you)', 'Awards and statistics', 'Choose the cosmetics you use in games'],
  },
  messages: {
    title: 'Messages',
    icon: MessageCircle,
    milestone: 'Milestone 2',
    summary: 'Chat with your friends.',
    features: ['Conversations with unread badges', 'Game invites inside the chat', 'Online status'],
  },
  settings: {
    title: 'Settings',
    icon: Settings,
    milestone: 'Milestone 2',
    summary: 'Account and app preferences.',
    features: ['Language', 'Change email and password', 'Sound and camera preferences', 'Sign out and delete account'],
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
