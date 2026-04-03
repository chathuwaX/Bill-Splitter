import { useState } from 'react'
import Modal from './Modal'
import api from '../api/client'
import toast from 'react-hot-toast'
import { Send } from 'lucide-react'

export default function SettleModal({ friend, netBalance, onClose, onSettled }) {
  const [amount, setAmount] = useState(Math.abs(netBalance).toFixed(2))
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  const canPay = netBalance < 0

  const handleSettle = async () => {
    if (!canPay) return
    const parsed = parseFloat(amount)
    if (isNaN(parsed) || parsed <= 0) {
      toast.error('Please enter a valid positive amount')
      return
    }
    if (parsed > Math.abs(netBalance) + 0.01) {
      toast.error(`Amount cannot exceed LKR ${Math.abs(netBalance).toFixed(2)}`)
      return
    }
    setLoading(true)
    try {
      await api.post('/payments/', {
        payee_id: friend.id,
        amount: parsed,
        note: note || null,
      })
      toast.success(`Payment of LKR ${parsed.toFixed(2)} sent to ${friend.username}!`)
      onSettled()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send payment')
    } finally {
      setLoading(false)
    }
  }

  const initials = (friend.full_name || friend.username).split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <Modal title="Settle Payment" onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--card)', borderRadius: 12, border: '1px solid var(--card-border)' }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: friend.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'white' }}>
          {initials}
        </div>
        <div>
          <div style={{ fontWeight: 600 }}>{friend.full_name || friend.username}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {netBalance < 0
              ? `You owe LKR ${Math.abs(netBalance).toFixed(2)}`
              : `They owe you LKR ${netBalance.toFixed(2)}`}
          </div>
        </div>
      </div>

      {canPay ? (
        <>
          <div>
            <label>Amount (LKR)</label>
            <input type="number" step="0.01" min="0.01" max={Math.abs(netBalance)}
              value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div>
            <label>Note (optional)</label>
            <input type="text" placeholder="e.g. Cash payment" value={note} onChange={e => setNote(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={handleSettle} disabled={loading}
            style={{ width: '100%', justifyContent: 'center', padding: 13 }}>
            <Send size={15} /> {loading ? 'Sending...' : 'Send Cash Payment'}
          </button>
          <p style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center' }}>
            {friend.username} will need to accept this payment to clear the debt.
          </p>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: 14 }}>
          <p>{friend.username} owes you LKR {netBalance.toFixed(2)}.</p>
          <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-dim)' }}>They need to initiate the payment to you.</p>
        </div>
      )}
    </Modal>
  )
}
