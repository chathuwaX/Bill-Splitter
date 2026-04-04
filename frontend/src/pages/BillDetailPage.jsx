import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import { ArrowLeft, Receipt, Users, CalendarDays, CheckCircle, Clock, GitMerge } from 'lucide-react'

const initials = name => name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '??'
const parseDate = d => new Date(d + (!d.endsWith('Z') && !d.includes('+') ? 'Z' : ''))

export default function BillDetailPage() {
  const { billId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [bill, setBill] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/bills/')
      .then(res => {
        const found = res.data.find(b => String(b.id) === String(billId))
        setBill(found || null)
      })
      .finally(() => setLoading(false))
  }, [billId])

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <div style={{ width: 40, height: 40, border: '3px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  if (!bill) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
      Bill not found. <button onClick={() => navigate(-1)} style={{ color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}>Go back</button>
    </div>
  )

  const isCreator = bill.creator?.id === user?.id
  const myParticipant = bill.participants?.find(p => p.user_id === user?.id)
  const date = parseDate(bill.created_at)
  const perPerson = bill.total_amount / (bill.participants?.length || 1)

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Back */}
      <button onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, fontWeight: 600, width: 'fit-content' }}>
        <ArrowLeft size={16} /> Back
      </button>

      {/* Hero card */}
      <div className="glass" style={{ borderRadius: 'var(--radius)', padding: '28px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(0,255,194,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Receipt size={26} color="var(--primary)" />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px' }}>{bill.title}</h2>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', color: 'var(--text-dim)', fontSize: 13 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CalendarDays size={13} /> {date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Users size={13} /> {bill.participants?.length} people</span>
            </div>
          </div>
          {myParticipant && (
            <span style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
              background: myParticipant.status === 'accepted' ? 'rgba(38,222,129,0.15)' : 'rgba(255,165,0,0.15)',
              color: myParticipant.status === 'accepted' ? 'var(--green)' : '#ffa500',
            }}>{myParticipant.status}</span>
          )}
        </div>

        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <div className="glass" style={{ padding: '14px 16px', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Total Bill</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>LKR {bill.total_amount?.toFixed(2)}</div>
          </div>
          <div className="glass" style={{ padding: '14px 16px', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Per Person</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>LKR {perPerson.toFixed(2)}</div>
          </div>
          <div className="glass" style={{ padding: '14px 16px', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Paid By</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--primary)' }}>{isCreator ? 'You' : bill.creator?.full_name || bill.creator?.username}</div>
          </div>
        </div>
      </div>

      {/* Participants */}
      <div className="glass" style={{ borderRadius: 'var(--radius)', padding: '20px 24px' }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Participants</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {bill.participants?.map((p, idx) => {
            const isMe = p.user_id === user?.id
            const isCreatorP = p.user_id === bill.creator?.id
            return (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0',
                borderBottom: idx < bill.participants.length - 1 ? '1px solid var(--card-border)' : 'none'
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                  background: isMe ? 'var(--primary)' : `hsl(${(p.user_id * 67) % 360}, 60%, 45%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 800, color: 'white'
                }}>
                  {initials(p.user?.full_name || p.user?.username || `U${p.user_id}`)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                    {isMe ? 'You' : p.user?.full_name || p.user?.username || `User ${p.user_id}`}
                    {isCreatorP && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--primary)', fontWeight: 700 }}>PAID</span>}
                  </div>
                  {p.is_merged && <div style={{ fontSize: 12, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 4 }}><GitMerge size={11} /> Merged into debt</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>LKR {parseFloat(p.amount_owed || 0).toFixed(2)}</div>
                  <div style={{ fontSize: 11, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                    {p.status === 'accepted'
                      ? <><CheckCircle size={11} color="var(--green)" /><span style={{ color: 'var(--green)' }}>Settled</span></>
                      : <><Clock size={11} color="#ffa500" /><span style={{ color: '#ffa500' }}>Pending</span></>
                    }
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
