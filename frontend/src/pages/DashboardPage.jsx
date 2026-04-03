import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import { TrendingUp, TrendingDown, Wallet, Users, Receipt, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import AnimatedNumber from '../components/AnimatedNumber'
import SkeletonCard from '../components/SkeletonCard'
import styles from './DashboardPage.module.css'

const initials = name => name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '??'

// ── localStorage helpers ─────────────────────────────────────────────────────
// Cache raw API responses so the skeleton is never shown on subsequent visits.
// All keys are namespaced under 'fmbk_' to avoid collisions.
const LS = {
  get: key => {
    try { return JSON.parse(localStorage.getItem('fmbk_' + key)); }
    catch { return null; }
  },
  set: (key, val) => {
    try { localStorage.setItem('fmbk_' + key, JSON.stringify(val)); }
    catch { /* storage full or unavailable — fail silently */ }
  },
};

export default function DashboardPage() {
  const { user } = useAuth()

  // Initialise from localStorage so state survives a page refresh.
  // The API calls below always fire and overwrite with authoritative DB data.
  const [summary, setSummary] = useState(() => LS.get('summary'))
  const [friends, setFriends] = useState(() => LS.get('friends') || [])
  const [allBills, setAllBills] = useState(() => LS.get('allBills') || [])

  // Track per-friend merge in-progress state (purely for UX feedback)
  const [mergingId, setMergingId] = useState(null)
  // Show a warning banner instead of silently defaulting to zero on DB failure
  const [dbError, setDbError] = useState(null)

  // Skip the skeleton if we already have cached data — fresh data loads silently.
  const [loading, setLoading] = useState(() => !LS.get('summary'))

  // ── Data loader — queries the DB on every mount and after merges ───────────
  // On success: clears any error banner and updates all state + localStorage.
  // On failure: sets the error banner. Cached values stay visible — no zeros.
  const loadData = () =>
    Promise.all([
      api.get('/bills/summary/balances'),
      api.get('/friends/'),
      api.get('/bills/'),
    ]).then(([s, f, b]) => {
      setDbError(null);
      setSummary(s.data); LS.set('summary', s.data);
      setFriends(f.data); LS.set('friends', f.data);
      setAllBills(b.data); LS.set('allBills', b.data);
    }).catch(err => {
      console.error('Database connection failed:', err);
      setDbError('⚠️ Could not reach the database. Showing last known values — restart the backend server to reconnect.');
    }).finally(() => setLoading(false));

  useEffect(() => { loadData() }, [])

  const handleMerge = async (friendId, toReceive, toGive) => {
    // ── Step 1: Type-safe numbers (prevents NaN / string-concat bugs) ─────────
    const recv = Math.round((parseFloat(toReceive) || 0) * 100) / 100;
    const give = Math.round((parseFloat(toGive)    || 0) * 100) / 100;

    // ── Step 2: Calculate remainder = |toReceive - toGive| ───────────────────
    const remainder = Math.round(Math.abs(recv - give) * 100) / 100;

    // ── Step 3: Winner rule — larger bucket keeps remainder, smaller → 0 ─────
    let newRecv = 0;
    let newGive = 0;
    if (recv > give) {
      newRecv = remainder;
      newGive = 0;
    } else if (give > recv) {
      newGive = remainder;
      newRecv = 0;
    }
    // Equal → both stay 0

    // ── Step 4: Optimistic patch — only the targeted friend, no global reset ──
    setFriends(prev => {
      const next = prev.map(f =>
        f.friend.id === friendId
          ? { ...f, to_receive: newRecv, to_give: newGive, net_balance: newRecv - newGive }
          : f
      );
      LS.set('friends', next);   // persist so hard-refresh also shows remainder
      return next;
    });

    setMergingId(friendId);

    // ── Step 5: Commit to friendbill.db — SQL UPDATE on friend_balances ───────
    // The backend writes remainder into the correct column for BOTH users' rows.
    try {
      await api.post(`/debts/merge/${friendId}`);
      // Re-fetch to confirm DB state — now safe because the backend wrote the
      // correct remainder, so loadData() will return the same values we patched.
      loadData().catch(console.error);
    } catch (e) {
      if (e.response?.status !== 200) {
        console.error('Merge failed:', e);
        // Roll back optimistic patch — reload authoritative DB state.
        loadData().catch(console.error);
      }
    }

    setMergingId(null);
  };

  if (loading) return (
    <div className={styles.page}>
      <div className={styles.greeting}><div className="skeleton" style={{ width: 200, height: 32 }} /></div>
      <div className={styles.statsGrid}>{[1, 2, 3].map(i => <SkeletonCard key={i} height={120} />)}</div>
      <div className={styles.grid}><SkeletonCard height={300} /><SkeletonCard height={300} /></div>
    </div>
  )

  // ── Aggregate totals ───────────────────────────────────────────────────────
  // Source of truth: to_receive / to_give from the /friends/ API (DB-computed).
  //   to_receive — friend accepted the bill I created → Others Owe You
  //   to_give    — I'm a debtor on a bill the friend created → You Owe Others
  let totalToReceive = 0;
  let totalToGive = 0;
  friends.forEach(({ to_receive, to_give }) => {
    totalToReceive += (to_receive ?? 0);
    totalToGive += (to_give ?? 0);
  });
  totalToReceive = Math.round(totalToReceive * 100) / 100;
  totalToGive = Math.round(totalToGive * 100) / 100;

  // Net balance — always derived from DB-sourced values.
  const computedNet = Math.round((totalToReceive - totalToGive) * 100) / 100;

  return (
    <div className={`${styles.page} fade-in`}>
      <div className={styles.greeting}>
        <h1>Hey, {user?.full_name?.split(' ')[0] || user?.username} 👋</h1>
        <p>Here's your financial overview</p>
      </div>

      {/* DB connection warning — only shown when the backend is unreachable */}
      {dbError && (
        <div style={{
          background: 'rgba(239,68,68,0.12)',
          border: '1px solid rgba(239,68,68,0.35)',
          borderRadius: '10px',
          padding: '10px 16px',
          marginBottom: '8px',
          color: '#f87171',
          fontSize: '0.83rem',
          fontWeight: 500,
          letterSpacing: '0.01em',
        }}>
          {dbError}
        </div>
      )}

      <div className={styles.statsGrid}>
        <div className={`${styles.statCard} glass`}>
          <div className={styles.statIcon} style={{ background: 'rgba(16,185,129,0.15)' }}><TrendingUp size={20} color="#10b981" /></div>
          <div><p className={styles.statLabel}>Others owe you</p><p className={`${styles.statValue} amount-positive`}>LKR <AnimatedNumber value={totalToReceive} /></p></div>
        </div>
        <div className={`${styles.statCard} glass`}>
          <div className={styles.statIcon} style={{ background: 'rgba(239,68,68,0.15)' }}><TrendingDown size={20} color="#ef4444" /></div>
          <div><p className={styles.statLabel}>You owe others</p><p className={`${styles.statValue} amount-negative`}>LKR <AnimatedNumber value={totalToGive} /></p></div>
        </div>
        <div className={`${styles.statCard} glass ${styles.netCard}`} style={{ borderColor: computedNet >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)' }}>
          <div className={styles.statIcon} style={{ background: computedNet >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)' }}><Wallet size={20} color={computedNet >= 0 ? '#10b981' : '#ef4444'} /></div>
          <div><p className={styles.statLabel}>Net balance</p><p className={`${styles.statValue} ${computedNet >= 0 ? 'amount-positive' : 'amount-negative'}`}>{computedNet >= 0 ? '+' : '-'}LKR <AnimatedNumber value={Math.abs(computedNet)} /></p></div>
        </div>
      </div>

      <div style={{ width: '100%', display: 'flex' }}>
        <div className={`${styles.section} glass`} style={{ flexGrow: 1, width: '100%' }}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}><Users size={16} /> Friends</div>
            <Link to="/friends" className={styles.seeAll}>See all <ArrowRight size={14} /></Link>
          </div>
          {friends.length === 0 ? (
            <div className={styles.empty}><Users size={40} opacity={0.2} /><p>No friends yet</p><p className={styles.emptyHint}>Add friends to start splitting bills 🎉</p></div>
          ) : friends.slice(0, 6).map(({ friend, to_receive, to_give }) => {
            // ── Per-friend balance display ──────────────────────────────────
            // to_receive — DB: accepted bills I created → friend owes me (green)
            // to_give    — DB: bills friend created → I owe them (red)
            // Both values are gross (non-negative, ABS guaranteed by server).
            const recv = typeof to_receive === 'number' ? Math.round(to_receive * 100) / 100 : 0;
            const give = typeof to_give === 'number' ? Math.round(to_give * 100) / 100 : 0;

            // Merge is only meaningful when there's something in BOTH directions.
            const canMerge = recv > 0 && give > 0;
            const isMerging = mergingId === friend.id;
            const hasBalance = recv > 0 || give > 0;

            return (
              <div key={friend.id} className={styles.friendRow}>
                {/* Friend Identity */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: '1.2' }}>
                  <div className={styles.friendAvatar} style={{ background: friend.avatar_color }}>{initials(friend.full_name || friend.username)}</div>
                  <div className={styles.friendInfo}>
                    <span className={styles.friendName}>{friend.full_name || friend.username}</span>
                    <span className={styles.friendHandle}>@{friend.username}</span>
                  </div>
                </div>

                {/* Horizontal Data Columns container */}
                <div style={{ display: 'flex', flex: '2', alignItems: 'center', justifyContent: 'space-between' }}>
                  
                  {/* Column 1: You Owe (Far Left of data section) */}
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>You Owe</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#ef4444', lineHeight: '1' }}>LKR {give.toFixed(2)}</div>
                  </div>

                  {/* Column 2: Others Owe (Center of data section) */}
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Others Owe</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#10b981', lineHeight: '1' }}>LKR {recv.toFixed(2)}</div>
                  </div>

                  {/* Column 3: Action (Far Right) */}
                  <div style={{ flex: '0.5', display: 'flex', justifyContent: 'flex-end' }}>
                    {hasBalance ? (
                      <button
                        onClick={() => handleMerge(friend.id, recv, give)}
                        disabled={!canMerge || isMerging}
                        className="glass"
                        style={{
                          padding: '8px 18px', fontSize: '0.85rem', borderRadius: '8px',
                          background: canMerge && !isMerging ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.9), rgba(139, 92, 246, 0.9))' : 'rgba(255, 255, 255, 0.08)',
                          color: canMerge && !isMerging ? '#fff' : 'rgba(255, 255, 255, 0.35)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          cursor: canMerge && !isMerging ? 'pointer' : 'not-allowed',
                          fontWeight: '600',
                          transition: 'all 0.2s ease',
                          boxShadow: canMerge && !isMerging ? '0 4px 12px rgba(99, 102, 241, 0.25)' : 'none',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {isMerging ? 'Merging…' : 'Merge'}
                      </button>
                    ) : (
                      <div className={`${styles.friendBalance} amount-neutral`} style={{ opacity: 0.6, fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                        Settled ✓
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
