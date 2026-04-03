import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import { TrendingUp, TrendingDown, Wallet, Users, Receipt, ArrowRight, Send, CheckCircle } from 'lucide-react'
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
  // Pending incoming payments (awaiting current user to accept) and unread notifications
  const [pendingPayments, setPendingPayments] = useState([])
  const [userNotifications, setUserNotifications] = useState([])
  // Track friend being paid
  const [payModalFriend, setPayModalFriend] = useState(null)
  const [payAmount, setPayAmount] = useState('')
  const [isPaying, setIsPaying] = useState(false)

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
      api.get('/payments/'),
      api.get('/notifications/'),
    ]).then(([s, f, b, p, n]) => {
      setDbError(null);
      setSummary(s.data); LS.set('summary', s.data);
      setFriends(f.data); LS.set('friends', f.data);
      setAllBills(b.data); LS.set('allBills', b.data);
      setPendingPayments(p.data.filter(pay => pay.status === 'pending'));
      setUserNotifications(n.data);
    }).catch(err => {
      console.error('Database connection failed:', err);
      setDbError('⚠️ Could not reach the database. Showing last known values — restart the backend server to reconnect.');
    }).finally(() => setLoading(false));

  useEffect(() => { loadData() }, [])

  const handleMerge = async (friendId, toReceive, toGive) => {
    // ── Step 1: Type-safe numbers (prevents NaN / string-concat bugs) ─────────
    const recv = Math.round((parseFloat(toReceive) || 0) * 100) / 100;
    const give = Math.round((parseFloat(toGive) || 0) * 100) / 100;

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

  const openPayModal = (friend, amount) => {
    setPayModalFriend(friend);
    setPayAmount(amount.toFixed(2));
  };

  const handlePaySubmit = async (e) => {
    e.preventDefault();
    if (!payModalFriend) return;
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0) return toast.error('Enter a valid amount');

    setIsPaying(true);
    try {
      await api.post('/payments/', {
        payee_id: payModalFriend.id,
        amount: amt,
        note: `Manual payment to ${payModalFriend.username}`
      });
      toast.success('Payment sent! Waiting for friend to accept.');
      setPayModalFriend(null);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Payment failed');
    } finally {
      setIsPaying(false);
    }
  };

  const handleAcceptPayment = async (paymentId) => {
    try {
      await api.post(`/payments/${paymentId}/accept`);
      // Auto-mark the related notification as read so the red dot disappears
      try {
        const { data: notifs } = await api.get('/notifications/');
        const match = notifs.find(n => !n.is_read && n.reference_id === paymentId && n.type === 'payment');
        if (match) await api.post(`/notifications/${match.id}/read`);
      } catch (_) { /* non-critical — don't block the main action */ }
      toast.success('Payment accepted! Balance updated.');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to accept payment');
    }
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
    <>
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

        <div className={styles.heroWrapper}>
          <div className={`${styles.heroNetCard} glass`} style={{ 
            borderColor: computedNet === 0 && totalToReceive === 0 ? 'rgba(255,255,255,0.1)' : computedNet >= 0 ? 'rgba(38,222,129,0.3)' : 'rgba(255,107,107,0.3)',
            background: computedNet === 0 && totalToReceive === 0 ? 'var(--card)' : computedNet >= 0 ? 'linear-gradient(135deg, rgba(38,222,129,0.1), rgba(38,222,129,0.02))' : 'linear-gradient(135deg, rgba(255,107,107,0.1), rgba(255,107,107,0.02))' 
          }}>
            <div className={styles.heroNetLabel}>Total Net Balance</div>
            {computedNet === 0 && totalToReceive === 0 && totalToGive === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--text)' }}>All Settled Up! 🎉</span>
                <span style={{ fontSize: 15, color: 'var(--primary-light)', fontWeight: 500 }}>Time for another dinner?</span>
              </div>
            ) : (
              <div className={`${styles.heroNetValue} ${computedNet >= 0 ? 'amount-positive' : 'amount-negative'}`}>
                {computedNet >= 0 ? '+' : '-'}LKR <AnimatedNumber value={Math.abs(computedNet)} />
              </div>
            )}
          </div>
          
          <div className={styles.miniStatsRow}>
            <div className={`${styles.statCard} glass`}>
              <div className={styles.statIcon} style={{ background: 'rgba(38,222,129,0.15)' }}><TrendingUp size={20} color="var(--green)" /></div>
              <div><p className={styles.statLabel}>Others owe you</p><p className={`${styles.statValue} amount-positive`}>LKR <AnimatedNumber value={totalToReceive} /></p></div>
            </div>
            <div className={`${styles.statCard} glass`}>
              <div className={styles.statIcon} style={{ background: 'rgba(255,107,107,0.15)' }}><TrendingDown size={20} color="var(--red)" /></div>
              <div><p className={styles.statLabel}>You owe others</p><p className={`${styles.statValue} amount-negative`}>LKR <AnimatedNumber value={totalToGive} /></p></div>
            </div>
          </div>
        </div>

        <div className={styles.dashboardGrid}>
          {/* Left: Friend Summary */}
          <div className={`${styles.section} glass`}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}><Users size={16} /> Friend Summary</div>
              <Link to="/friends" className={styles.seeAll}>See all <ArrowRight size={14} /></Link>
            </div>
            {friends.length === 0 ? (
              <div className={styles.empty} style={{ padding: '50px 20px' }}>
                <div style={{ background: 'var(--bg2)', width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <Users size={32} color="var(--primary)" />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>No friends yet</h3>
                <p style={{ color: 'var(--text-dim)', fontSize: 14, marginBottom: 24, padding: '0 20px', lineHeight: 1.5 }}>Add some friends to your network to start sharing expenses easily.</p>
                <Link to="/friends" className="btn btn-primary" style={{ textDecoration: 'none' }}>
                  Find Friends
                </Link>
              </div>
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
              // Find any pending payment from this friend to the current user
              const pendingFromFriend = pendingPayments.find(p => p.payer_id === friend.id);

              // Find unread bill-type notifications from this friend
              // (bill notifs: reference_id = bill.id, and that bill's creator is this friend)
              const unreadBillNotif = userNotifications.find(n =>
                !n.is_read && n.type === 'bill' &&
                allBills.find(b => b.id === n.reference_id && b.creator?.id === friend.id)
              );
              const hasUnread = !!pendingFromFriend || !!unreadBillNotif;

              return (
                <div key={friend.id} className={styles.friendRow}>
                  {/* Friend Identity */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                    <div style={{ position: 'relative' }}>
                      <div className={styles.friendAvatar} style={{ background: friend.avatar_color }}>{initials(friend.full_name || friend.username)}</div>
                      {hasUnread && (
                        <div style={{
                          position: 'absolute', top: -2, right: -2,
                          width: 10, height: 10, borderRadius: '50%',
                          background: 'var(--red)', border: '2px solid var(--bg2)',
                        }} />
                      )}
                    </div>
                    <div className={styles.friendInfo}>
                      <span className={styles.friendName}>{friend.full_name || friend.username}</span>
                      <span className={styles.friendHandle}>@{friend.username}</span>
                    </div>
                  </div>

                  {/* Data and Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', justifyContent: 'flex-end', flexGrow: 1 }}>
                    {/* Amounts Container */}
                    <div style={{ display: 'flex', gap: '16px', textAlign: 'right' }}>
                      {give > 0 && (
                        <div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>You Owe</div>
                          <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--red)', whiteSpace: 'nowrap' }}>LKR {give.toFixed(2)}</div>
                        </div>
                      )}
                      
                      {recv > 0 && (
                        <div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Others Owe</div>
                          <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--green)', whiteSpace: 'nowrap' }}>LKR {recv.toFixed(2)}</div>
                        </div>
                      )}

                      {!hasBalance && (
                        <div className="amount-neutral" style={{ opacity: 0.6, fontSize: '0.9rem', whiteSpace: 'nowrap', marginTop: '8px' }}>
                          Settled ✓
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    {(canMerge || give > 0 || pendingFromFriend || unreadBillNotif) && (
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {unreadBillNotif && (
                          <button
                            onClick={async () => {
                              try {
                                await api.post(`/notifications/${unreadBillNotif.id}/read`);
                                loadData();
                              } catch (_) {}
                            }}
                            className="glass"
                            title="Mark bill notification as read"
                            style={{
                              padding: '6px 12px', fontSize: '0.8rem', borderRadius: '6px',
                              background: 'rgba(0,255,194,0.15)', color: 'var(--primary)', border: '1px solid rgba(0,255,194,0.3)',
                              cursor: 'pointer', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px'
                            }}
                          >
                            <CheckCircle size={13} /> Got it
                          </button>
                        )}
                        {pendingFromFriend && (
                          <button
                            onClick={() => handleAcceptPayment(pendingFromFriend.id)}
                            className="glass"
                            title={`Accept payment of LKR ${pendingFromFriend.amount?.toFixed(2)}`}
                            style={{
                              padding: '6px 12px', fontSize: '0.8rem', borderRadius: '6px',
                              background: 'linear-gradient(135deg, var(--green), #059669)',
                              color: '#fff', border: 'none', cursor: 'pointer', fontWeight: '700',
                              display: 'flex', alignItems: 'center', gap: '4px'
                            }}
                          >
                            <CheckCircle size={13} /> Accept LKR {parseFloat(pendingFromFriend.amount).toFixed(2)}
                          </button>
                        )}
                        {canMerge && (
                          <button
                            onClick={() => handleMerge(friend.id, recv, give)}
                            disabled={isMerging}
                            className="glass"
                            style={{
                              padding: '6px 12px', fontSize: '0.8rem', borderRadius: '6px',
                              background: 'var(--card)', color: 'var(--text)', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', fontWeight: '600'
                            }}
                          >
                            {isMerging ? 'Merging…' : 'Merge'}
                          </button>
                        )}
                        {give > 0 && (
                          <button
                            onClick={() => openPayModal(friend, give)}
                            className="glass"
                            style={{
                              padding: '6px 12px', fontSize: '0.8rem', borderRadius: '6px',
                              background: 'var(--primary)', color: 'var(--bg)', border: 'none', cursor: 'pointer', fontWeight: '700'
                            }}
                          >
                            Pay
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Right: Recent Activity */}
          <div className={`${styles.section} glass`}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}><Receipt size={16} /> Recent Activity</div>
              <Link to="/bills" className={styles.seeAll}>See all <ArrowRight size={14} /></Link>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              {allBills.length === 0 ? (
                <div className={styles.empty} style={{ padding: '50px 20px', flex: 1, display: 'flex', justifyContent: 'center' }}>
                  <div style={{ background: 'var(--bg2)', width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                    <Receipt size={32} color="var(--primary)" />
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Everything is quiet</h3>
                  <p style={{ color: 'var(--text-dim)', fontSize: 14, marginBottom: 24, padding: '0 20px', lineHeight: 1.5 }}>You have no recent bills. Ready to log a new outing?</p>
                  <Link to="/bills?new=true" className="btn btn-primary" style={{ textDecoration: 'none' }}>
                    Add your first bill
                  </Link>
                </div>
              ) : allBills.slice(0, 5).map(bill => {
                const parseDate = dStr => new Date(dStr + (!dStr.endsWith('Z') && !dStr.includes('+') ? 'Z' : ''));
                return (
                  <Link to="/bills" key={bill.id} className={styles.billRow} style={{ textDecoration: 'none' }}>
                    <div className={styles.billIcon}><Receipt size={16} color="var(--primary)" /></div>
                    <div className={styles.billInfo}>
                      <span className={styles.billTitle}>{bill.title}</span>
                      <span className={styles.billMeta}>
                        {parseDate(bill.created_at).toLocaleDateString()}
                        {' • '}
                        {bill.creator.id === user?.id ? 'You paid' : `${bill.creator.full_name || bill.creator.username} paid`}
                      </span>
                    </div>
                    <div className={styles.billAmount}>LKR {bill.total_amount.toFixed(2)}</div>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </div>
      {payModalFriend && (
        <Modal title={`Pay ${payModalFriend.full_name || payModalFriend.username}`} onClose={() => setPayModalFriend(null)} top={20} left={35}>
          <form onSubmit={handlePaySubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-muted)' }}>Amount (LKR)</label>
              <input
                type="number"
                step="0.01"
                value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
                autoFocus
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--card-border)',
                  color: 'var(--text)',
                  fontSize: '18px',
                  fontWeight: '700',
                  outline: 'none'
                }}
              />
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
              This payment needs to be accepted by your friend before the balance is updated.
            </p>
            <button
              type="submit"
              disabled={isPaying}
              className="btn btn-primary"
              style={{ width: '100%', padding: '14px', borderRadius: '10px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              {isPaying ? 'Processing...' : <><Send size={16} /> Confirm Payment</>}
            </button>
          </form>
        </Modal>
      )}
    </>
  )
}
