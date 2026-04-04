import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Users, Receipt, CalendarDays, X } from 'lucide-react'
import api from '../api/client'

const initials = name => name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '??'

// Try parsing the query as a date — return a Date if valid, null otherwise
function tryParseDate(q) {
  // Try direct parse first
  let d = new Date(q)
  if (!isNaN(d.getTime())) return d
  // Try appending current year (handles "4/4", "Apr 4", "April 4")
  const withYear = `${q} ${new Date().getFullYear()}`
  d = new Date(withYear)
  if (!isNaN(d.getTime())) return d
  return null
}

function matchesDate(billDateStr, queryDate) {
  if (!queryDate || !billDateStr) return false
  const billDate = new Date(billDateStr + (!billDateStr.endsWith('Z') && !billDateStr.includes('+') ? 'Z' : ''))
  return (
    billDate.getFullYear() === queryDate.getFullYear() &&
    billDate.getMonth() === queryDate.getMonth() &&
    billDate.getDate() === queryDate.getDate()
  )
}

// Month-name lookup: "apr" or "april" → month index 3
const MONTHS = [
  ['january','jan'], ['february','feb'], ['march','mar'], ['april','apr'],
  ['may','may'], ['june','jun'], ['july','jul'], ['august','aug'],
  ['september','sep','sept'], ['october','oct'], ['november','nov'], ['december','dec']
]

function getMonthIndex(q) {
  return MONTHS.findIndex(names => names.some(n => n === q))
}

function matchesMonth(billDateStr, monthIndex) {
  if (monthIndex === -1 || !billDateStr) return false
  const billDate = new Date(billDateStr + (!billDateStr.endsWith('Z') && !billDateStr.includes('+') ? 'Z' : ''))
  return billDate.getMonth() === monthIndex
}

export default function GlobalSearch() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [friends, setFriends] = useState([])
  const [bills, setBills] = useState([])
  const [loaded, setLoaded] = useState(false)
  const inputRef = useRef(null)
  const wrapperRef = useRef(null)

  // Fetch data once on first focus
  const loadData = useCallback(async () => {
    if (loaded) return
    try {
      const [f, b] = await Promise.all([api.get('/friends/'), api.get('/bills/')])
      setFriends(f.data.map(e => e.friend))
      setBills(b.data)
      setLoaded(true)
    } catch {}
  }, [loaded])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = e => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Keyboard shortcut: Ctrl/Cmd + K
  useEffect(() => {
    const handler = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
        loadData()
      }
      if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [loadData])

  const q = query.trim().toLowerCase()
  const queryDate = q.length >= 3 ? tryParseDate(query) : null
  const queryMonthIndex = q.length >= 3 ? getMonthIndex(q.replace(/\s+$/, '')) : -1
  // Pure number? Use as day-of-month if 1–31, or amount match
  const queryNum = /^\d+(\.\d+)?$/.test(q) ? parseFloat(q) : null
  const queryDay = queryNum && Number.isInteger(queryNum) && queryNum >= 1 && queryNum <= 31 ? queryNum : null

  const matchedFriends = q.length < 1 ? [] : friends.filter(f =>
    (f.full_name || '').toLowerCase().includes(q) ||
    (f.username || '').toLowerCase().includes(q)
  ).slice(0, 4)

  const matchedBills = q.length < 1 ? [] : bills.filter(b => {
    if ((b.title || '').toLowerCase().includes(q)) return true
    if (matchesDate(b.created_at, queryDate)) return true
    if (matchesMonth(b.created_at, queryMonthIndex)) return true
    if ((b.creator?.username || '').toLowerCase().includes(q)) return true
    // Day-of-month match: "4" finds bills on the 4th of any month
    if (queryDay) {
      const d = new Date(b.created_at + (!b.created_at.endsWith('Z') && !b.created_at.includes('+') ? 'Z' : ''))
      if (d.getDate() === queryDay) return true
    }
    // Amount match: "4500" or "4500.00"
    if (queryNum != null && Math.abs(b.total_amount - queryNum) < 0.01) return true
    return false
  }).slice(0, 5)

  const hasResults = matchedFriends.length > 0 || matchedBills.length > 0

  const go = (path) => {
    setOpen(false)
    setQuery('')
    navigate(path)
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative', flex: 1, maxWidth: 480, margin: '0 auto' }}>
      {/* Input */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          ref={inputRef}
          value={query}
          placeholder="Search friends, bills, dates…"
          onFocus={() => { setOpen(true); loadData() }}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          style={{
            width: '100%',
            padding: '10px 44px 10px 20px',
            borderRadius: 50,
            background: 'rgba(255,255,255,0.07)',
            border: '1.5px solid rgba(255,255,255,0.12)',
            color: 'var(--text)',
            fontSize: 14,
            outline: 'none',
            transition: 'border 0.2s, background 0.2s, box-shadow 0.2s',
            boxSizing: 'border-box',
          }}
          onFocusCapture={e => {
            e.target.style.border = '1.5px solid var(--primary)'
            e.target.style.background = 'rgba(0,255,194,0.06)'
            e.target.style.boxShadow = '0 0 0 3px rgba(0,255,194,0.1)'
          }}
          onBlurCapture={e => {
            e.target.style.border = '1.5px solid rgba(255,255,255,0.12)'
            e.target.style.background = 'rgba(255,255,255,0.07)'
            e.target.style.boxShadow = 'none'
          }}
        />
        {query ? (
          <button onClick={() => { setQuery(''); inputRef.current?.focus() }}
            style={{ position: 'absolute', right: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 2, display: 'flex' }}>
            <X size={15} />
          </button>
        ) : (
          <Search size={16} style={{ position: 'absolute', right: 14, color: 'var(--text-dim)', pointerEvents: 'none' }} />
        )}
      </div>

      {/* Dropdown */}
      {open && q.length > 0 && (
        <div className="glass" style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0,
          borderRadius: 14, zIndex: 9999, overflow: 'hidden',
          boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.1)',
          maxHeight: 400, overflowY: 'auto',
        }}>
          {!hasResults ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
              No results for "{query}"
            </div>
          ) : (
            <div>
              {/* Friends */}
              {matchedFriends.length > 0 && (
                <div>
                  <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Users size={10} /> Friends
                  </div>
                  {matchedFriends.map(f => (
                    <button key={f.id} onClick={() => go(`/friends/${f.id}`)} style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                      background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                      transition: 'background 0.15s',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: f.avatar_color || '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: 'white', flexShrink: 0 }}>
                        {initials(f.full_name || f.username)}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{f.full_name || f.username}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>@{f.username}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Bills */}
              {matchedBills.length > 0 && (
                <div style={{ borderTop: matchedFriends.length > 0 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
                  <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Receipt size={10} /> Bills
                  </div>
                  {matchedBills.map(b => {
                    const date = new Date(b.created_at + (!b.created_at.endsWith('Z') && !b.created_at.includes('+') ? 'Z' : ''))
                    return (
                      <button key={b.id} onClick={() => go(`/bills/${b.id}`)} style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                        background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                        transition: 'background 0.15s',
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                      >
                        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(0,255,194,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Receipt size={15} color="var(--primary)" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <CalendarDays size={10} /> {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>LKR {b.total_amount?.toFixed(2)}</div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
