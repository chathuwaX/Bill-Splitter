import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import toast from 'react-hot-toast'
import { Plus, Receipt, Check, Users, ChevronDown, ChevronUp } from 'lucide-react'
import Modal from '../components/Modal'
import SkeletonCard from '../components/SkeletonCard'
import styles from './BillsPage.module.css'

const initials = name => name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '??'

export default function BillsPage() {
  const { user } = useAuth()
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      setShowCreate(true)
      setSearchParams({})
    }
  }, [searchParams, setSearchParams])

  const load = async () => {
    try { const r = await api.get('/bills/'); setBills(r.data) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const acceptBill = async billId => {
    await api.post(`/bills/${billId}/accept`)
    toast.success('Bill accepted!')
    load()
  }

  const myStatus = bill => bill.participants.find(p => p.user_id === user.id)?.status

  return (
    <>
      <div className={`${styles.page} fade-in`}>
        <div className={styles.header}>
          <div><h1 className={styles.title}>Bills</h1><p className={styles.subtitle}>{bills.length} total bills</p></div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> Create Bill</button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{[1,2,3].map(i => <SkeletonCard key={i} height={100} />)}</div>
        ) : bills.length === 0 ? (
          <div className={styles.empty}>
            <Receipt size={56} opacity={0.2} />
            <p>No bills yet</p>
            <p className={styles.emptyHint}>Create your first bill to start splitting expenses</p>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={15} /> Create Bill</button>
          </div>
        ) : (
          <div className={styles.list}>
            {bills.map(bill => {
              const status = myStatus(bill)
              const isCreator = bill.creator_id === user.id
              const myShare = bill.participants.find(p => p.user_id === user.id)?.amount_owed ?? 0
              const isOpen = expanded === bill.id
              return (
                <div key={bill.id} className={`${styles.billCard} glass`}>
                  <div className={styles.billMain} onClick={() => setExpanded(isOpen ? null : bill.id)}>
                    <div className={styles.billIcon}><Receipt size={18} color="#6366f1" /></div>
                    <div className={styles.billInfo}>
                      <div className={styles.billTitleRow}>
                        <span className={styles.billTitle}>{bill.title}</span>
                        <div className={styles.badges}>
                          {isCreator && <span className="badge badge-info">Creator</span>}
                          <span className={`badge ${status === 'accepted' ? 'badge-accepted' : 'badge-pending'}`}>{status}</span>
                        </div>
                      </div>
                      {bill.description && <p className={styles.billDesc}>{bill.description}</p>}
                      <div className={styles.billMeta}>
                        <span><Users size={12} /> {bill.participants.length} people</span>
                        <span>{new Date(bill.created_at).toLocaleDateString()}</span>
                        <span>Your share: <strong>LKR {myShare.toFixed(2)}</strong></span>
                      </div>
                    </div>
                    <div className={styles.billRight}>
                      <div className={styles.billTotal}>LKR {bill.total_amount.toFixed(2)}</div>
                      {isOpen ? <ChevronUp size={16} color="var(--text-dim)" /> : <ChevronDown size={16} color="var(--text-dim)" />}
                    </div>
                  </div>
                  {isOpen && (
                    <div className={styles.billDetails}>
                      <div className={styles.participantList}>
                        {bill.participants.map(p => (
                          <div key={p.id} className={styles.participantRow}>
                            <div className={styles.pAvatar} style={{ background: p.user.avatar_color }}>{initials(p.user.full_name || p.user.username)}</div>
                            <div className={styles.pInfo}><span>{p.user.full_name || p.user.username}</span>{p.is_creator && <span className={styles.pCreator}>paid</span>}</div>
                            <div className={styles.pAmount}>LKR {p.amount_owed.toFixed(2)}</div>
                            <span className={`badge ${p.status === 'accepted' ? 'badge-accepted' : 'badge-pending'}`}>{p.status}</span>
                          </div>
                        ))}
                      </div>
                      {!isCreator && status === 'pending' && (
                        <button className="btn btn-success" onClick={() => acceptBill(bill.id)} style={{ alignSelf: 'flex-start' }}>
                          <Check size={14} /> Accept Bill
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      {showCreate && <CreateBillModal onClose={() => setShowCreate(false)} onCreated={load} />}
    </>
  )
}

function CreateBillModal({ onClose, onCreated }) {
  const { user } = useAuth()
  const [friends, setFriends] = useState([])
  const [form, setForm] = useState({ title: '', description: '', total_amount: '' })
  const [selected, setSelected] = useState([])
  const [customSplit, setCustomSplit] = useState(false)
  const [splits, setSplits] = useState({})
  const [loading, setLoading] = useState(false)

  useEffect(() => { api.get('/friends/').then(r => setFriends(r.data)) }, [])

  const allParticipants = [
    { id: user.id, username: user.username, full_name: user.full_name, avatar_color: user.avatar_color },
    ...selected.map(id => friends.find(({ friend }) => friend.id === id)?.friend).filter(Boolean)
  ]

  const equalShare = form.total_amount && allParticipants.length
    ? (parseFloat(form.total_amount) / allParticipants.length).toFixed(2) : '0.00'

  const toggleFriend = id => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.title || !form.total_amount || selected.length === 0) {
      toast.error('Please fill all required fields and select at least one friend'); return
    }
    setLoading(true)
    try {
      const payload = { title: form.title, description: form.description || null, total_amount: parseFloat(form.total_amount), participant_ids: selected }
      if (customSplit) {
        payload.custom_splits = allParticipants.map(p => ({ user_id: p.id, amount_owed: parseFloat(splits[p.id] || 0) }))
      }
      await api.post('/bills/', payload)
      toast.success('Bill created!')
      onCreated(); onClose()
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to create bill') }
    finally { setLoading(false) }
  }

  return (
    <Modal title="Create Bill" onClose={onClose} wide>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div><label>Bill Title *</label><input type="text" placeholder="e.g. Dinner at KFC" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required autoFocus /></div>
        <div><label>Total Amount (LKR) *</label><input type="number" step="0.01" min="0.01" placeholder="0.00" value={form.total_amount} onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))} required /></div>
        <div><label>Description</label><textarea placeholder="Optional description..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ resize: 'vertical', minHeight: 70 }} /></div>
        <div>
          <label>Select Friends *</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {friends.length === 0 ? <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>No friends yet. Add friends first.</p>
              : friends.map(({ friend }) => (
              <button key={friend.id} type="button" onClick={() => toggleFriend(friend.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, border: '1px solid', borderColor: selected.includes(friend.id) ? 'var(--primary)' : 'var(--card-border)', background: selected.includes(friend.id) ? 'rgba(99,102,241,0.15)' : 'var(--card)', color: selected.includes(friend.id) ? 'var(--primary-light)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', transition: 'all 0.15s' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: friend.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'white' }}>{initials(friend.full_name || friend.username)}</div>
                {friend.username}{selected.includes(friend.id) && <Check size={12} />}
              </button>
            ))}
          </div>
        </div>
        {selected.length > 0 && (
          <div style={{ padding: '12px 16px', background: 'var(--card)', borderRadius: 10, border: '1px solid var(--card-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Split ({allParticipants.length} people)</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', margin: 0 }}>
                <input type="checkbox" checked={customSplit} onChange={e => setCustomSplit(e.target.checked)} style={{ width: 'auto' }} />
                <span style={{ fontSize: 12 }}>Custom split</span>
              </label>
            </div>
            {!customSplit ? <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Each person pays <strong style={{ color: 'var(--text)' }}>LKR {equalShare}</strong></p>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {allParticipants.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, flex: 1 }}>{p.username} {p.id === user.id ? '(you)' : ''}</span>
                    <input type="number" step="0.01" min="0" placeholder="0.00" value={splits[p.id] || ''} onChange={e => setSplits(s => ({ ...s, [p.id]: e.target.value }))} style={{ width: 120 }} />
                  </div>
                ))}
              </div>}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={loading}><Plus size={15} /> {loading ? 'Creating...' : 'Create Bill'}</button>
        </div>
      </form>
    </Modal>
  )
}
