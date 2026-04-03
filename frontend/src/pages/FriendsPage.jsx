import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import toast from 'react-hot-toast'
import { UserPlus, Search, Check } from 'lucide-react'
import Modal from '../components/Modal'
import SkeletonCard from '../components/SkeletonCard'
import { useAuth } from '../context/AuthContext'
import styles from './FriendsPage.module.css'

const initials = name => name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '??'

export default function FriendsPage() {
  const { user } = useAuth()
  const [friends, setFriends] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [search, setSearch] = useState('')

  const load = async () => {
    try {
      const [f, r, b] = await Promise.all([
        api.get('/friends/'),
        api.get('/friends/requests'),
        api.get('/bills/')
      ])
      
      const rawFriends = f.data;
      const rawBills = b.data;
      
      const activityMap = {};
      rawBills.forEach(bill => {
        if (!bill.participants) return;
        bill.participants.forEach(p => {
          activityMap[p.user_id] = (activityMap[p.user_id] || 0) + 1;
        });
      });
      
      const friendsWithSizing = rawFriends.map(fObj => {
        const count = activityMap[fObj.friend.id] || 0;
        const size = Math.min(220, 100 + (count * 15));
        return { ...fObj, activityCount: count, bubbleSize: size };
      });
      
      setFriends(friendsWithSizing)
      setRequests(r.data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const acceptRequest = async id => {
    await api.post(`/friends/accept/${id}`)
    toast.success('Friend request accepted!')
    load()
  }

  const filtered = friends.filter(({ friend }) =>
    (friend.full_name || friend.username).toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
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
          <div className={styles.grid}>{[1, 2, 3, 4].map(i => <div key={i} style={{ width: 120, height: 120, borderRadius: '50%' }} className="skeleton" />)}</div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <UserPlus size={48} opacity={0.2} />
            <p>{search ? 'No friends match your search' : 'No friends yet'}</p>
            {!search && <p className={styles.emptyHint}>Add friends to start splitting bills together 🎉</p>}
          </div>
        ) : (
          <div className={styles.grid}>
            {filtered.map((fObj) => {
              const { friend, bubbleSize } = fObj;
              const fontSize = Math.max(14, bubbleSize * 0.22);
              return (
                <Link key={friend.id} to={`/friends/${friend.id}`} style={{ textDecoration: 'none' }} className={styles.friendBubbleWrapper}>
                  <div className={styles.friendCard} style={{ width: bubbleSize, height: bubbleSize }}>
                    <div className={styles.cardTop}>
                      <div className={styles.avatar} style={{ background: friend.avatar_color, fontSize }}>
                        {initials(friend.full_name || friend.username)}
                      </div>
                    </div>
                  </div>
                  <div className={styles.info}>
                    <span className={styles.name}>{friend.full_name || friend.username}</span>
                    <span className={styles.handle}>@{friend.username}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
      {showAddModal && <AddFriendModal onClose={() => setShowAddModal(false)} onAdded={load} />}
    </>
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
    <Modal title="Add Friend" onClose={onClose} top={40} left={30} >
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
