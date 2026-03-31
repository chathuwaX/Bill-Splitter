import { useState, useEffect } from 'react'
import Modal from './Modal'
import api from '../api/client'
import toast from 'react-hot-toast'
import { ArrowRight, Receipt, TrendingUp, TrendingDown, Send, Loader } from 'lucide-react'
import styles from './MergeDetailsModal.module.css'

export default function MergeDetailsModal({ debt, currentUserId, onClose, onSettled }) {
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    api.get(`/debts/${debt.id}/sources`)
      .then(r => setSources(r.data))
      .catch(() => toast.error('Failed to load merge details'))
      .finally(() => setLoading(false))
  }, [debt.id])

  const iOwe = debt.from_user_id === currentUserId
  const otherUser = iOwe ? debt.to_user : debt.from_user
  const isSettled = debt.status === 'settled'

  const handlePay = async () => {
    setPaying(true)
    try {
      await api.post('/payments/', {
        payee_id: debt.to_user_id,
        amount: debt.net_amount,
        note: `Settling merged debt #${debt.id}`,
        debt_id: debt.id,
      })
      toast.success('Payment sent — waiting for acceptance')
      onSettled?.()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Payment failed')
    } finally {
      setPaying(false)
    }
  }

  return (
    <Modal title="Merge Details" onClose={onClose} wide>
      <div className={styles.wrap}>

        {/* Net balance card */}
        <div className={`${styles.netCard} ${iOwe ? styles.netOwed : styles.netOwing}`}>
          <div className={styles.netIcon}>
            {iOwe ? <TrendingDown size={22} /> : <TrendingUp size={22} />}
          </div>
          <div className={styles.netInfo}>
            <span className={styles.netLabel}>
              {isSettled ? 'Settled' : iOwe ? `You owe ${otherUser.full_name || otherUser.username}` : `${otherUser.full_name || otherUser.username} owes you`}
            </span>
            <span className={styles.netAmount}>LKR {debt.net_amount.toFixed(2)}</span>
          </div>
          {isSettled && <span className={styles.settledBadge}>✓ Settled</span>}
        </div>

        {/* Direction arrow */}
        <div className={styles.dirRow}>
          <UserChip user={iOwe ? debt.from_user : debt.to_user} label="From" />
          <ArrowRight size={20} color="var(--primary-light)" />
          <UserChip user={iOwe ? debt.to_user : debt.from_user} label="To" />
        </div>

        {/* Source bills */}
        <div className={styles.sourcesSection}>
          <p className={styles.sourcesLabel}>Included debts ({sources.length})</p>
          {loading ? (
            <div className={styles.loadingRow}><Loader size={16} className={styles.spin} /> Loading...</div>
          ) : sources.length === 0 ? (
            <p className={styles.empty}>No source details available</p>
          ) : (
            <div className={styles.sourceList}>
              {sources.map((s, i) => (
                <div key={i} className={`${styles.sourceItem} ${s.direction === 'you_owe' ? styles.sourceOwed : styles.sourceOwing}`}>
                  <div className={styles.sourceIcon}>
                    <Receipt size={14} color={s.direction === 'you_owe' ? '#ef4444' : '#10b981'} />
                  </div>
                  <div className={styles.sourceInfo}>
                    <span className={styles.sourceTitle}>{s.bill_title}</span>
                    {s.bill_description && <span className={styles.sourceDesc}>{s.bill_description}</span>}
                    <span className={styles.sourceMeta}>
                      {s.direction === 'you_owe' ? 'You owed' : 'They owed'} · {new Date(s.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <span className={`${styles.sourceAmount} ${s.direction === 'you_owe' ? 'amount-negative' : 'amount-positive'}`}>
                    {s.direction === 'you_owe' ? '-' : '+'}LKR {s.amount.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pay button — only if current user owes and debt is active */}
        {iOwe && !isSettled && (
          <button className="btn btn-primary" onClick={handlePay} disabled={paying}
            style={{ width: '100%', justifyContent: 'center', padding: 13 }}>
            {paying ? <><Loader size={15} className={styles.spin} /> Sending...</> : <><Send size={15} /> Pay LKR {debt.net_amount.toFixed(2)}</>}
          </button>
        )}
      </div>
    </Modal>
  )
}

function UserChip({ user, label }) {
  const initials = (user.full_name || user.username)
    .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: user.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white' }}>{initials}</div>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{user.full_name || user.username}</span>
      </div>
    </div>
  )
}
