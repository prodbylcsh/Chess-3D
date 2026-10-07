import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { api } from '../api';
import { useToast } from '../ui/kit';
import { useSession } from './session';

interface Badges {
  unreadMessages: number;
  friendRequests: number;
  /** bumps whenever friends or messages change, so screens can reload */
  version: number;
}

const BadgeContext = createContext<Badges>({ unreadMessages: 0, friendRequests: 0, version: 0 });

export const useBadges = () => useContext(BadgeContext);

/** Keeps the sidebar badges current and turns server events into notifications. */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { status, profile, refresh } = useSession();
  const toast = useToast();
  const location = useLocation();
  const [badges, setBadges] = useState<Badges>({ unreadMessages: 0, friendRequests: 0, version: 0 });
  const ready = status === 'ready' && !!profile?.onboarded;

  const recount = useCallback(async () => {
    const [conversations, requests] = await Promise.all([api.messages.conversations(), api.friends.requests()]);
    setBadges((b) => ({
      unreadMessages: conversations.reduce((n, c) => n + c.unread, 0),
      friendRequests: requests.incoming.length,
      version: b.version + 1,
    }));
  }, []);

  useEffect(() => {
    if (!ready) return;
    void recount().catch(() => {});
    return api.events.subscribe((e) => {
      if (e.type === 'profile') {
        void refresh();
        return;
      }
      void recount().catch(() => {});
      // tell the player, unless they are already looking at it
      const onMessages = location.pathname.startsWith('/messages');
      if (e.text && !(e.type === 'messages' && onMessages) && !location.pathname.startsWith('/game')) {
        toast(e.text, { tone: e.type === 'friends' ? 'success' : 'neutral' });
      }
    });
  }, [ready, recount, refresh, toast, location.pathname]);

  return <BadgeContext.Provider value={badges}>{children}</BadgeContext.Provider>;
}
