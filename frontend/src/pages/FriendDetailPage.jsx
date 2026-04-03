import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import { ArrowLeft, TrendingUp, TrendingDown, Receipt } from 'lucide-react'
import AnimatedNumber from '../components/AnimatedNumber'

const initials = name => name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '??'

const parseDate = dStr => new Date(dStr + (!dStr.endsWith('Z') && !dStr.includes('+') ? 'Z' : ''))

export default function FriendDetailPage() {
  const { friendId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [friend, setFriend] = useState(null)
  const [balance, setBalance] = useState({ to_receive: 0, to_give: 0 })
  const [sharedBills, setSharedBills] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [friendsRes, billsRes] = await Promise.all([
          api.get('/friends/'),
          api.get('/bills/'),
        ])

        const friendEntry = friendsRes.data.find(f => String(f.friend.id) === String(friendId))
        if (friendEntry) {
          setFriend(friendEntry.friend)
          setBalance({ to_receive: friendEntry.to_receive, to_give: friendEntry.to_give })
        }

        const filtered = billsRes.data.filter(bill =>
          bill.participants?.some(p => String(p.user_id) === String(friendId))
        )
        setSharedBills(filtered.sort((a, b) => parseDate(b.created_at) - parseDate(a.created_at)))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [friendId])

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <div style={{ width: 40, height: 40, border: '3px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  if (!friend) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
      Friend not found. <button onClick={() => navigate('/friends')} style={{ color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}>Go back</button>
    </div>
  )

  const net = Math.round((balance.to_receive - balance.to_give) * 100) / 100

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Back button */}
      <button
        onClick={() => navigate('/friends')}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, fontWeight: 600, width: 'fit-content' }}
      >
        <ArrowLeft size={16} /> Back to Friends
      </button>

      {/* Friend Identity + Balance Hero */}
      <div className="glass" style={{ borderRadius: 'var(--radius)', padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Identity Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: friend.avatar_color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, fontWeight: 800, color: 'white',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
          }}>{initials(friend.full_name || friend.username)}</div>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{friend.full_name || friend.username}</h2>
            <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>@{friend.username}</span>
          </div>
        </div>

        {/* Balance Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {/* Net hero */}
          <div style={{
            gridColumn: '1 / -1',
            padding: '20px 24px',
            borderRadius: 'var(--radius-sm)',
            background: net >= 0 ? 'linear-gradient(135deg, rgba(38,222,129,0.12), rgba(38,222,129,0.04))' : 'linear-gradient(135deg, rgba(255,107,107,0.12), rgba(255,107,107,0.04))',
            border: `1px solid ${net >= 0 ? 'rgba(38,222,129,0.3)' : 'rgba(255,107,107,0.3)'}`,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
              {net > 0 ? `${friend.full_name || friend.username} owes you` : net < 0 ? `You owe ${friend.full_name || friend.username}` : 'All Settled Up! 🎉'}
            </div>
            {net !== 0 && (
              <div style={{ fontSize: 34, fontWeight: 800, color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>
                LKR <AnimatedNumber value={Math.abs(net)} />
              </div>
            )}
          </div>

          {/* Mini stats */}
          <div className="glass" style={{ padding: '14px 18px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ background: 'rgba(38,222,129,0.15)', borderRadius: 10, padding: 8 }}><TrendingUp size={16} color="var(--green)" /></div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>They owe you</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)' }}>LKR {balance.to_receive.toFixed(2)}</div>
            </div>
          </div>

          <div className="glass" style={{ padding: '14px 18px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ background: 'rgba(255,107,107,0.15)', borderRadius: 10, padding: 8 }}><TrendingDown size={16} color="var(--red)" /></div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>You owe them</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--red)' }}>LKR {balance.to_give.toFixed(2)}</div>
            </div>
          </div>

          <div className="glass" style={{ padding: '14px 18px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ background: 'rgba(0,255,194,0.15)', borderRadius: 10, padding: 8 }}><Receipt size={16} color="var(--primary)" /></div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Shared bills</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{sharedBills.length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Shared Bill History */}
      <div className="glass" style={{ borderRadius: 'var(--radius)', padding: '20px 24px' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Shared Bill History
        </h3>

        {sharedBills.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-dim)' }}>
            <Receipt size={40} opacity={0.2} style={{ margin: '0 auto 12px' }} />
            <p>No shared bills yet</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {sharedBills.map((bill, idx) => {
              const myParticipant = bill.participants?.find(p => String(p.user_id) === String(user?.id))
              const friendParticipant = bill.participants?.find(p => String(p.user_id) === String(friendId))
              const iPaid = String(bill.creator?.id) === String(user?.id)
              const friendPaid = String(bill.creator?.id) === String(friendId)

              return (
                <div key={bill.id} style={{
                  display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0',
                  borderBottom: idx < sharedBills.length - 1 ? '1px solid var(--card-border)' : 'none'
                }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(0,255,194,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Receipt size={16} color="var(--primary)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{bill.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
                      {parseDate(bill.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      {' • '}
                      {iPaid ? 'You paid' : friendPaid ? `${friend.full_name || friend.username} paid` : 'Split'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>LKR {bill.total_amount?.toFixed(2)}</div>
                    {myParticipant && !iPaid && (
                      <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 2 }}>Your share: LKR {parseFloat(myParticipant.amount_owed || 0).toFixed(2)}</div>
                    )}
                    {friendParticipant && iPaid && (
                      <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 2 }}>Their share: LKR {parseFloat(friendParticipant.amount_owed || 0).toFixed(2)}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
