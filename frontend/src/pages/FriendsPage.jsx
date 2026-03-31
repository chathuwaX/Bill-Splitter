import { useState, useEffect } from 'react'
import api from '../api/client'
import toast from 'react-hot-toast'
import { UserPlus, Search, Check, Send, GitMerge, Eye, Loader } from 'lucide-react'
import Modal from '../components/Modal'
import SettleModal from '../components/SettleModal'
import MergeDetailsModal from '../components/MergeDetailsModal'
import SkeletonCard from '../components/SkeletonCard'
import { useAuth } from '../context/AuthContext'
import styles from './FriendsPage.module.css'

const initials = name => name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '??'

export default function FriendsPage() {
  const { user } = useAuth()
  const [friends, setFriends] = useState([])
  const [requests, setRequests] = useState([])
  const [debts, setDebts] = useState([])          // merged debt records
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [settleTarget, setSettleTarget] = useState(null)
  const [mergeTarget, setMergeTarget] = useState(null)   // friend to merge with
  const [viewDebt, setViewDebt] = useState(null)         // debt to view details
  const [mergingId, setMergingId] = useState(null)       // friend id being merged
  const [search, setSearch] = useState('')

  const load = async () => {
    try {
      const [f, r, d] = await Promise.all([
        api.get('/friends/'),
        api.get('/friends/requests'),
        api.get('/debts/'),
      ])
      setFriends(f.data)
      setRequests(r.data)
      setDebts(d.data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const acceptRequest = async id => {
    await api.post(`/friends/accept/${id}`)
    toast.success('Friend request accepted!')
    load()
  }

  const handleMerge = async (friendId) => {
    setMergingId(friendId)
    try {
      const r = await api.post(`/debts/merge/${friendId}`)
      toast.success(r.data.message || 'Debts merged successfully!')
      load()
      // Open the details modal for the newly created debt
      setViewDebt(r.data.debt)
    } catch (err) {
      const msg = err.response?.data?.detail
      if (msg?.includes('cancel out')) {
        toast.success('Debts cancel out perfectly — all settled!')
        load()
      } else {
        toast.error(msg || 'Failed to merge debts')
      }
    } finally {
      setMergingId(null)
    }
  }

  // Get active merged debt for a specific friend pair
  const getActiveMergedDebt = (friendId) =>
    debts.find(d =>
      d.status === 'active' &&
      ((d.from_user_id === user.id && d.to_user_id === friendId) ||
       (d.to_user_id === user.id && d.from_user_id === friendId))
    )

  const filtered = friends.filter(({ friend }) =>
    (friend.full_name || friend.username).toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className={`${styles.page} fade-in`}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Friends</h1>
          <p className={styles.subtitle}>{friends.length} friends · {requests.length} pending requests</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}><UserPlus size={16} /> Add Friend</button>
      </div>

      {requests.length > 0 && (
        <div className={`${styles.requestsSection} glass`}>
          <h3 className={styles.sectionTitle}>Pending Requests</h3>
          {requests.map(r => (
            <div key={r.id} className={styles.requestRow}>
              <div className={styles.avatar} style={{ background: r.requester.avatar_color }}>{initials(r.requester.full_name || r.requester.username)}</div>
              <div className={styles.info}>
                <span className={styles.name}>{r.requester.full_name || r.requester.username}</span>
                <span className={styles.handle}>@{r.requester.username}</span>
              </div>
              <button className="btn btn-success" onClick={() => acceptRequest(r.id)}><Check size={14} /> Accept</button>
            </div>
          ))}
        </div>
      )}

      <div className={styles.searchWrap}>
        <Search size={16} className={styles.searchIcon} />
        <input type="text" placeholder="Search friends..." value={search}
          onChange={e => setSearch(e.target.value)} className={styles.searchInput} />
      </div>

      {loading ? (
        <div className={styles.grid}>{[1,2,3,4].map(i => <SkeletonCard key={i} height={180} />)}</div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <UserPlus size={48} opacity={0.2} />
          <p>{search ? 'No friends match your search' : 'No friends yet'}</p>
          {!search && <p className={styles.emptyHint}>Add friends to start splitting bills together 🎉</p>}
        </div>
      ) : (
        <div className={styles.grid}>
          {filtered.map(({ friend, net_balance }) => {
            const activeMergedDebt = getActiveMergedDebt(friend.id)
            const isMerging = mergingId === friend.id
            return (
              <div key={friend.id} className={`${styles.friendCard} glass`}>
                <div className={styles.cardTop}>
                  <div className={styles.avatar} style={{ background: friend.avatar_color }}>{initials(friend.full_name || friend.username)}</div>
                  <div className={styles.info}>
                    <span className={styles.name}>{friend.full_name || friend.username}</span>
                    <span className={styles.handle}>@{friend.username}</span>
                  </div>
                </div>

                <div className={styles.balanceRow}>
                  <div>
                    <p className={styles.balanceLabel}>{net_balance === 0 ? 'All settled' : net_balance > 0 ? 'Owes you' : 'You owe'}</p>
                    <p className={`${styles.balanceAmount} ${net_balance > 0 ? 'amount-positive' : net_balance < 0 ? 'amount-negative' : 'amount-neutral'}`}>
                      {net_balance === 0 ? '🎉 Settled up' : `LKR ${Math.abs(net_balance).toFixed(2)}`}
                    </p>
                  </div>
                  {net_balance !== 0 && (
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '7px 12px' }}
                      onClick={() => setSettleTarget({ friend, net_balance })}>
                      <Send size={13} /> Settle
                    </button>
                  )}
                </div>

                {/* Merged debt net balance card */}
                {activeMergedDebt && (
                  <div className={styles.mergedCard}>
                    <div className={styles.mergedLabel}>
                      <GitMerge size={12} />
                      <span>Merged Net</span>
                    </div>
                    <div className={styles.mergedAmount}>
                      LKR {activeMergedDebt.net_amount.toFixed(2)}
                    </div>
                    <button className={styles.viewBtn} onClick={() => setViewDebt(activeMergedDebt)}>
                      <Eye size={12} /> View Details
                    </button>
                  </div>
                )}

                {/* Action buttons */}
                <div className={styles.cardActions}>
                  {!activeMergedDebt && net_balance !== 0 && (
                    <button
                      className={`btn btn-ghost ${styles.mergeBtn}`}
                      onClick={() => handleMerge(friend.id)}
                      disabled={isMerging}
                    >
                      {isMerging
                        ? <><Loader size={13} className={styles.spin} /> Merging...</>
                        : <><GitMerge size={13} /> Merge Debts</>}
                    </button>
                  )}
                  {activeMergedDebt && (
                    <button className={`btn btn-ghost ${styles.mergeBtn}`} onClick={() => setViewDebt(activeMergedDebt)}>
                      <Eye size={13} /> View Merged Debt
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showAddModal && <AddFriendModal onClose={() => setShowAddModal(false)} onAdded={load} />}
      {settleTarget && (
        <SettleModal
          friend={settleTarget.friend}
          netBalance={settleTarget.net_balance}
          onClose={() => setSettleTarget(null)}
          onSettled={load}
        />
      )}
      {viewDebt && (
        <MergeDetailsModal
          debt={viewDebt}
          currentUserId={user.id}
          onClose={() => setViewDebt(null)}
          onSettled={load}
        />
      )}
    </div>
  )
}

function AddFriendModal({ onClose, onAdded }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(new Set())

  const search = async () => {
    if (!query.trim()) return
    setLoading(true)
    try { const r = await api.get(`/friends/search?q=${encodeURIComponent(query)}`); setResults(r.data) }
    finally { setLoading(false) }
  }

  const sendRequest = async userId => {
    try {
      await api.post('/friends/request', { username: results.find(u => u.id === userId)?.username })
      setSent(s => new Set([...s, userId]))
      toast.success('Friend request sent!')
      onAdded()
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to send request') }
  }

  return (
    <Modal title="Add Friend" onClose={onClose}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="text" placeholder="Search by username or email" value={query}
          onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} autoFocus />
        <button className="btn btn-primary" onClick={search} disabled={loading} style={{ whiteSpace: 'nowrap' }}>
          <Search size={15} /> Search
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {results.map(u => (
          <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--card)', borderRadius: 10, border: '1px solid var(--card-border)' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: u.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'white', flexShrink: 0 }}>
              {initials(u.full_name || u.username)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{u.full_name || u.username}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>@{u.username}</div>
            </div>
            <button className={sent.has(u.id) ? 'btn btn-success' : 'btn btn-primary'}
              style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => sendRequest(u.id)} disabled={sent.has(u.id)}>
              {sent.has(u.id) ? <><Check size={13} /> Sent</> : <><UserPlus size={13} /> Add</>}
            </button>
          </div>
        ))}
        {results.length === 0 && query && !loading && (
          <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 13, padding: '16px 0' }}>No users found</p>
        )}
      </div>
    </Modal>
  )
}
