import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import { TrendingUp, TrendingDown, Wallet, Users, Receipt, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import AnimatedNumber from '../components/AnimatedNumber'
import SkeletonCard from '../components/SkeletonCard'
import styles from './DashboardPage.module.css'

const initials = name => name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '??'

export default function DashboardPage() {
  const { user } = useAuth()
  const [summary, setSummary] = useState(null)
  const [friends, setFriends] = useState([])
  const [recentBills, setRecentBills] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/bills/summary/balances'),
      api.get('/friends/'),
      api.get('/bills/'),
    ]).then(([s, f, b]) => {
      setSummary(s.data); setFriends(f.data); setRecentBills(b.data.slice(0, 5))
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className={styles.page}>
      <div className={styles.greeting}><div className="skeleton" style={{ width: 200, height: 32 }} /></div>
      <div className={styles.statsGrid}>{[1,2,3].map(i => <SkeletonCard key={i} height={120} />)}</div>
      <div className={styles.grid}><SkeletonCard height={300} /><SkeletonCard height={300} /></div>
    </div>
  )

  const net = summary?.net_balance ?? 0

  return (
    <div className={`${styles.page} fade-in`}>
      <div className={styles.greeting}>
        <h1>Hey, {user?.full_name?.split(' ')[0] || user?.username} 👋</h1>
        <p>Here's your financial overview</p>
      </div>

      <div className={styles.statsGrid}>
        <div className={`${styles.statCard} glass`}>
          <div className={styles.statIcon} style={{ background: 'rgba(16,185,129,0.15)' }}><TrendingUp size={20} color="#10b981" /></div>
          <div><p className={styles.statLabel}>Others owe you</p><p className={`${styles.statValue} amount-positive`}>LKR <AnimatedNumber value={summary?.total_owed ?? 0} /></p></div>
        </div>
        <div className={`${styles.statCard} glass`}>
          <div className={styles.statIcon} style={{ background: 'rgba(239,68,68,0.15)' }}><TrendingDown size={20} color="#ef4444" /></div>
          <div><p className={styles.statLabel}>You owe others</p><p className={`${styles.statValue} amount-negative`}>LKR <AnimatedNumber value={summary?.total_owe ?? 0} /></p></div>
        </div>
        <div className={`${styles.statCard} glass ${styles.netCard}`} style={{ borderColor: net >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)' }}>
          <div className={styles.statIcon} style={{ background: net >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)' }}><Wallet size={20} color={net >= 0 ? '#10b981' : '#ef4444'} /></div>
          <div><p className={styles.statLabel}>Net balance</p><p className={`${styles.statValue} ${net >= 0 ? 'amount-positive' : 'amount-negative'}`}>{net >= 0 ? '+' : '-'}LKR <AnimatedNumber value={Math.abs(net)} /></p></div>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={`${styles.section} glass`}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}><Users size={16} /> Friends</div>
            <Link to="/friends" className={styles.seeAll}>See all <ArrowRight size={14} /></Link>
          </div>
          {friends.length === 0 ? (
            <div className={styles.empty}><Users size={40} opacity={0.2} /><p>No friends yet</p><p className={styles.emptyHint}>Add friends to start splitting bills 🎉</p></div>
          ) : friends.slice(0, 6).map(({ friend, net_balance }) => (
            <div key={friend.id} className={styles.friendRow}>
              <div className={styles.friendAvatar} style={{ background: friend.avatar_color }}>{initials(friend.full_name || friend.username)}</div>
              <div className={styles.friendInfo}>
                <span className={styles.friendName}>{friend.full_name || friend.username}</span>
                <span className={styles.friendHandle}>@{friend.username}</span>
              </div>
              <div className={`${styles.friendBalance} ${net_balance > 0 ? 'amount-positive' : net_balance < 0 ? 'amount-negative' : 'amount-neutral'}`}>
                {net_balance === 0 ? 'Settled' : net_balance > 0 ? `+LKR ${net_balance.toFixed(2)}` : `-LKR ${Math.abs(net_balance).toFixed(2)}`}
              </div>
            </div>
          ))}
        </div>

        <div className={`${styles.section} glass`}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}><Receipt size={16} /> Recent Bills</div>
            <Link to="/bills" className={styles.seeAll}>See all <ArrowRight size={14} /></Link>
          </div>
          {recentBills.length === 0 ? (
            <div className={styles.empty}><Receipt size={40} opacity={0.2} /><p>No bills yet</p><p className={styles.emptyHint}>Create your first bill to get started</p></div>
          ) : recentBills.map(bill => (
            <div key={bill.id} className={styles.billRow}>
              <div className={styles.billIcon}><Receipt size={16} color="#6366f1" /></div>
              <div className={styles.billInfo}>
                <span className={styles.billTitle}>{bill.title}</span>
                <span className={styles.billMeta}>{bill.participants.length} people · {new Date(bill.created_at).toLocaleDateString()}</span>
              </div>
              <div className={styles.billAmount}>LKR {bill.total_amount.toFixed(2)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
