import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';
import {
  GraduationCap,
  MessageCircle,
  Puzzle,
  Settings,
  Store,
  Swords,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { rankOf } from '#shared/rating.ts';
import { LogoMark, ProfileIcon, RankEmblem } from '../ui/art/art';
import { Badge, Coins, cx } from '../ui/kit';
import { rankText, tk, useT } from '../i18n';
import { useBadges } from './notifications';
import { useProfile } from './session';
import './layout.css';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  soon?: boolean;
  /** shown in the phone tab bar */
  mobile?: boolean;
}

export const NAV: NavItem[] = [
  { to: '/play', label: tk('Play'), icon: Swords, mobile: true },
  { to: '/puzzles', label: tk('Puzzles'), icon: Puzzle, soon: true },
  { to: '/learn', label: tk('Learn'), icon: GraduationCap, soon: true },
  { to: '/community', label: tk('Community'), icon: Users, mobile: true },
  { to: '/shop', label: tk('Shop'), icon: Store, mobile: true },
  { to: '/profile', label: tk('Profile'), icon: UserRound, mobile: true },
  { to: '/messages', label: tk('Messages'), icon: MessageCircle, mobile: true },
  { to: '/settings', label: tk('Settings'), icon: Settings },
];

export function Wordmark() {
  return (
    <div className="wordmark">
      <LogoMark size={34} />
      <span>Wizard Chess</span>
    </div>
  );
}

export function AppLayout() {
  const profile = useProfile();
  const rank = rankOf(profile.mmr);
  const badges = useBadges();
  const t = useT();
  const count = (to: string) => (to === '/messages' ? badges.unreadMessages : to === '/community' ? badges.friendRequests : 0);

  return (
    <div className="app">
      <aside className="sidebar">
        <Wordmark />

        <nav className="nav" aria-label={t('Main')}>
          {NAV.map((item) =>
            item.soon ? (
              <span key={item.to} className="nav-item is-soon" aria-disabled title={t('Coming soon')}>
                <item.icon size={19} strokeWidth={1.9} />
                <span>{t(item.label)}</span>
                <Badge>{t('Soon')}</Badge>
              </span>
            ) : (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => cx('nav-item', isActive && 'is-active')}>
                <item.icon size={19} strokeWidth={1.9} />
                <span>{t(item.label)}</span>
                {count(item.to) > 0 && <span className="nav-count">{count(item.to)}</span>}
              </NavLink>
            ),
          )}
        </nav>

        <div className="sidebar-foot">
          <div className="balance">
            <span className="faint">{t('Balance')}</span>
            <Coins amount={profile.coins} />
          </div>
          <NavLink to="/profile" className="me-chip">
            <ProfileIcon icon={profile.iconId} size={40} />
            <span className="me-text">
              <strong>{profile.username}</strong>
              <span className="me-rank">
                <RankEmblem tier={rank.tier.id} division={rank.division} size={16} />
                {rankText(rank.label)}
              </span>
            </span>
          </NavLink>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>

      <nav className="tabbar" aria-label={t('Main')}>
        {NAV.filter((i) => i.mobile).map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => cx('tab', isActive && 'is-active')}>
            <span className="tab-icon">
              <item.icon size={21} strokeWidth={1.9} />
              {count(item.to) > 0 && <span className="tab-dot" />}
            </span>
            <span>{t(item.label)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/** Standard page frame: title row plus content. */
export function Page({
  title,
  subtitle,
  actions,
  children,
  wide,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cx('page', wide && 'page-wide')}>
      <header className="page-head">
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </header>
      {children}
    </div>
  );
}
