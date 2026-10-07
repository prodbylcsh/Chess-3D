import { useEffect, useState } from 'react';
import { Search, UserPlus, Users, X } from 'lucide-react';
import { api, type FriendEntry, type FriendRequest, type PublicProfile } from '../../api';
import { Page } from '../../app/AppLayout';
import { useBadges } from '../../app/notifications';
import { Badge, Card, EmptyState, Field, Segmented, Spinner } from '../../ui/kit';
import { timeAgo } from '../../ui/format';
import { ChallengeButton, FriendButton, MessageButton, PlayerLine } from '../social/social';
import './community.css';

type Tab = 'friends' | 'requests';

export function CommunityPage() {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('friends');
  const { friendRequests } = useBadges();

  return (
    <Page title="Community" subtitle="Find players, make friends and challenge them.">
      <div className="search-box">
        <Field
          placeholder="Search players by username"
          leading={<Search size={18} />}
          trailing={
            query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
                <X size={16} />
              </button>
            )
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search players"
        />
      </div>

      {query.trim() ? (
        <SearchResults query={query.trim()} />
      ) : (
        <div className="community-grid">
          <div>
            <div className="community-tabs">
              <Segmented
                label="Friends or requests"
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'friends', label: 'Friends' },
                  {
                    value: 'requests',
                    label: (
                      <>
                        Requests {friendRequests > 0 && <Badge tone="gold">{friendRequests}</Badge>}
                      </>
                    ),
                  },
                ]}
              />
            </div>
            {tab === 'friends' ? <Friends /> : <Requests />}
          </div>
          <Suggestions />
        </div>
      )}
    </Page>
  );
}

function SearchResults({ query }: { query: string }) {
  const [results, setResults] = useState<PublicProfile[] | null>(null);
  useEffect(() => {
    setResults(null);
    let live = true;
    const t = setTimeout(() => void api.profiles.search(query).then((r) => live && setResults(r)), 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query]);

  if (!results) return <Loading />;
  if (!results.length) {
    return (
      <EmptyState icon={<Search size={26} />} title="No players found">
        Nobody's username contains “{query}”.
      </EmptyState>
    );
  }
  return (
    <Card className="people">
      {results.map((p) => (
        <div key={p.id} className="person">
          <PlayerLine player={p} />
          <div className="person-actions">
            <FriendButton playerId={p.id} compact />
          </div>
        </div>
      ))}
    </Card>
  );
}

function Friends() {
  const { version } = useBadges();
  const [friends, setFriends] = useState<FriendEntry[] | null>(null);
  useEffect(() => {
    void api.friends.list().then(setFriends);
  }, [version]);

  if (!friends) return <Loading />;
  if (!friends.length) {
    return (
      <EmptyState icon={<Users size={26} />} title="No friends yet">
        Search for players above, or add someone from the suggestions.
      </EmptyState>
    );
  }
  const onlineCount = friends.filter((f) => f.profile.online).length;
  return (
    <Card className="people">
      <p className="people-head faint">
        {friends.length} friends · {onlineCount} online
      </p>
      {friends.map((f) => (
        <div key={f.profile.id} className="person">
          <PlayerLine player={f.profile} sub={<> · {f.profile.online ? 'Online' : 'Offline'}</>} />
          <div className="person-actions">
            <MessageButton player={f.profile} compact />
            <ChallengeButton player={f.profile} compact />
          </div>
        </div>
      ))}
    </Card>
  );
}

function Requests() {
  const { version } = useBadges();
  const [data, setData] = useState<{ incoming: FriendRequest[]; outgoing: FriendRequest[] } | null>(null);
  useEffect(() => {
    void api.friends.requests().then(setData);
  }, [version]);

  if (!data) return <Loading />;
  if (!data.incoming.length && !data.outgoing.length) {
    return (
      <EmptyState icon={<UserPlus size={26} />} title="No pending requests">
        Friend requests you send or receive appear here.
      </EmptyState>
    );
  }
  return (
    <>
      {data.incoming.length > 0 && (
        <Card className="people">
          <p className="people-head faint">Received</p>
          {data.incoming.map((r) => (
            <div key={r.profile.id} className="person">
              <PlayerLine player={r.profile} sub={<> · {timeAgo(r.at)}</>} />
              <div className="person-actions">
                <FriendButton playerId={r.profile.id} compact />
              </div>
            </div>
          ))}
        </Card>
      )}
      {data.outgoing.length > 0 && (
        <Card className="people">
          <p className="people-head faint">Sent</p>
          {data.outgoing.map((r) => (
            <div key={r.profile.id} className="person">
              <PlayerLine player={r.profile} sub={<> · {timeAgo(r.at)}</>} />
              <div className="person-actions">
                <FriendButton playerId={r.profile.id} compact />
              </div>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

function Suggestions() {
  const { version } = useBadges();
  const [list, setList] = useState<PublicProfile[] | null>(null);
  useEffect(() => {
    void api.profiles.suggestions().then(setList);
  }, [version]);
  return (
    <Card className="people suggestions">
      <p className="people-head">
        <strong>Players near your rank</strong>
      </p>
      {!list ? (
        <Loading />
      ) : list.length === 0 ? (
        <p className="faint people-empty">You know everyone already!</p>
      ) : (
        list.map((p) => (
          <div key={p.id} className="person">
            <PlayerLine player={p} size={40} />
            <FriendButton playerId={p.id} compact iconOnly />
          </div>
        ))
      )}
    </Card>
  );
}

function Loading() {
  return (
    <div className="people-loading">
      <Spinner />
    </div>
  );
}
