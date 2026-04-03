import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import toast from 'react-hot-toast'
import { Receipt, Send, ArrowDownLeft, Check, History, GitMerge, Eye } from 'lucide-react'
import SkeletonCard from '../components/SkeletonCard'
import MergeDetailsModal from '../components/MergeDetailsModal'
import styles from './HistoryPage.module.css'

export default function HistoryPage() {
  const { user } = useAuth()
  const [bills, setBills] = useState([])
  const [payments, setPayments] = useState([])
  const [debts, setDebts] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')
  const [viewDebt, setViewDebt] = useState(null)

  const load = async () => {
    try {
      const [b, p, d] = await Promise.all([
        api.get('/bills/'),
        api.get('/payments/'),
        api.get('/debts/'),
      ])
      setBills(b.data)
      setPayments(p.data)
      setDebts(d.data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const acceptPayment = async id => {
    await api.post(`/payments/${id}/accept`)
    toast.success('Payment accepted!')
    load()
  }

  // Build unified timeline
  const timeline = [
    ...bills.map(b => ({ type: 'bill', data: b, date: new Date(b.created_at) })),
    ...payments.map(p => ({ type: 'payment', data: p, date: new Date(p.created_at) })),
    ...debts.map(d => ({ type: 'merge', data: d, date: new Date(d.created_at) })),
  ].sort((a, b) => b.date - a.date)

  const filtered = tab === 'all'
    ? timeline
    : tab === 'bills'
    ? timeline.filter(t => t.type === 'bill')
    : tab === 'payments'
    ? timeline.filter(t => t.type === 'payment')
    : timeline.filter(t => t.type === 'merge')  // 'merged' tab

  const pendingPayments = payments.filter(p => p.payee_id === user.id && p.status === 'pending')

  const tabs = ['all', 'bills', 'payments', 'merged']

  const todayStr = new Date().toLocaleDateString();
  const recentFiltered = filtered.filter(t => t.date.toLocaleDateString() === todayStr);
  const olderFiltered  = filtered.filter(t => t.date.toLocaleDateString() !== todayStr);

  return (
    <div className={`${styles.page} fade-in`}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>History</h1>
          <p className={styles.subtitle}>{timeline.length} transactions</p>
        </div>
      </div>

      {pendingPayments.length > 0 && (
        <div className={`${styles.pendingSection} glass`}>
          <h3 className={styles.sectionLabel}>Pending Payments to Accept</h3>
          {pendingPayments.map(p => (
            <div key={p.id} className={styles.pendingRow}>
              <div className={styles.pendingIcon}><ArrowDownLeft size={16} color="#10b981" /></div>
              <div className={styles.pendingInfo}>
                <span>{p.payer.username} sent you LKR {p.amount.toFixed(2)}</span>
                {p.note && <span className={styles.note}>{p.note}</span>}
              </div>
              <button className="btn btn-success" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => acceptPayment(p.id)}>
                <Check size={13} /> Accept
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={styles.tabs}>
        {tabs.map(t => (
          <button key={t} className={`${styles.tab} ${tab === t ? styles.activeTab : ''}`} onClick={() => setTab(t)}>
            {t === 'merged' ? <><GitMerge size={12} /> Merged</> : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{[1,2,3,4].map(i => <SkeletonCard key={i} height={80} />)}</div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <History size={48} opacity={0.2} />
          <p>No {tab === 'all' ? '' : tab} transactions yet</p>
          <p className={styles.emptyHint}>
            {tab === 'merged' ? 'Merge debts from the Friends page to see them here' : 'Your bills and payments will appear here'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {recentFiltered.length > 0 && (
            <div className={`glass`} style={{ padding: '16px', borderRadius: '12px' }}>
              <div className={styles.sectionTitle} style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.95rem' }}>
                <History size={16} /> Recent History (Today)
              </div>
              <div className={styles.timeline}>
                {recentFiltered.map(item => (
                  <TimelineItem
                    key={`recent-${item.type}-${item.data.id}`}
                    item={item}
                    userId={user.id}
                    onAcceptPayment={acceptPayment}
                    onViewMerge={setViewDebt}
                  />
                ))}
              </div>
            </div>
          )}

          {olderFiltered.length > 0 && (
            <div>
              {recentFiltered.length > 0 && (
                <div className={styles.sectionTitle} style={{ marginBottom: '12px', marginLeft: '4px', fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
                  Older
                </div>
              )}
              <div className={styles.timeline}>
                {olderFiltered.map(item => (
                  <TimelineItem
                    key={`older-${item.type}-${item.data.id}`}
                    item={item}
                    userId={user.id}
                    onAcceptPayment={acceptPayment}
                    onViewMerge={setViewDebt}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
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

function TimelineItem({ item, userId, onAcceptPayment, onViewMerge }) {
  const { type, data, date } = item

  if (type === 'bill') {
    const isCreator = data.creator_id === userId
    const myParticipant = data.participants.find(p => p.user_id === userId)
    return (
      <div className={`${styles.timelineItem} glass`}>
        <div className={styles.itemIcon} style={{ background: 'rgba(99,102,241,0.1)' }}><Receipt size={16} color="#6366f1" /></div>
        <div className={styles.itemContent}>
          <div className={styles.itemTitle}>{data.title}</div>
          <div className={styles.itemMeta}>
            {isCreator ? 'You created this bill' : `Created by ${data.creator.username}`} · {data.participants.length} people
            {myParticipant?.is_merged && <span className={styles.mergedTag}><GitMerge size={10} /> merged</span>}
          </div>
        </div>
        <div className={styles.itemRight}>
          <div className={styles.itemAmount}>LKR {data.total_amount.toFixed(2)}</div>
          <div className={styles.itemDate}>{date.toLocaleDateString()}</div>
          {myParticipant && <span className={`badge ${myParticipant.status === 'accepted' ? 'badge-accepted' : 'badge-pending'}`}>{myParticipant.status}</span>}
        </div>
      </div>
    )
  }

  if (type === 'merge') {
    const iOwe = data.from_user_id === userId
    const other = iOwe ? data.to_user : data.from_user
    return (
      <div className={`${styles.timelineItem} ${styles.mergeItem} glass`}>
        <div className={styles.itemIcon} style={{ background: 'rgba(99,102,241,0.15)' }}>
          <GitMerge size={16} color="#6366f1" />
        </div>
        <div className={styles.itemContent}>
          <div className={styles.itemTitle}>
            Merged Debt · {iOwe ? `You owe ${other.full_name || other.username}` : `${other.full_name || other.username} owes you`}
          </div>
          <div className={styles.itemMeta}>{data.description}</div>
        </div>
        <div className={styles.itemRight}>
          <div className={`${styles.itemAmount} ${iOwe ? 'amount-negative' : 'amount-positive'}`}>
            {iOwe ? '-' : '+'}LKR {data.net_amount.toFixed(2)}
          </div>
          <div className={styles.itemDate}>{date.toLocaleDateString()}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={`badge ${data.status === 'settled' ? 'badge-accepted' : 'badge-pending'}`}>{data.status}</span>
            <button className={styles.detailBtn} onClick={() => onViewMerge(data)}>
              <Eye size={11} /> Details
            </button>
          </div>
        </div>
      </div>
    )
  }

  // payment
  const isSender = data.payer_id === userId
  return (
    <div className={`${styles.timelineItem} glass`}>
      <div className={styles.itemIcon} style={{ background: isSender ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)' }}>
        {isSender ? <Send size={16} color="#ef4444" /> : <ArrowDownLeft size={16} color="#10b981" />}
      </div>
      <div className={styles.itemContent}>
        <div className={styles.itemTitle}>{isSender ? `Paid ${data.payee.username}` : `Received from ${data.payer.username}`}</div>
        {data.note && <div className={styles.itemMeta}>{data.note}</div>}
        {data.debt_id && <div className={styles.itemMeta} style={{ color: 'var(--primary-light)' }}><GitMerge size={10} /> Settling merged debt</div>}
      </div>
      <div className={styles.itemRight}>
        <div className={`${styles.itemAmount} ${isSender ? 'amount-negative' : 'amount-positive'}`}>{isSender ? '-' : '+'}LKR {data.amount.toFixed(2)}</div>
        <div className={styles.itemDate}>{date.toLocaleDateString()}</div>
        <span className={`badge ${data.status === 'accepted' ? 'badge-accepted' : 'badge-pending'}`}>{data.status}</span>
        {!isSender && data.status === 'pending' && (
          <button className="btn btn-success" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => onAcceptPayment(data.id)}>
            <Check size={11} /> Accept
          </button>
        )}
      </div>
    </div>
  )
}
