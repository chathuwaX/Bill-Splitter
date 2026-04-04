import { Outlet, Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../api/client'
import { LayoutDashboard, Users, Receipt, History, Bell, LogOut, Sun, Moon, Menu, X, Wallet, Plus, UserPlus } from 'lucide-react'
import styles from './Layout.module.css'
import GlobalSearch from './GlobalSearch'

function formatRelativeTime(dateStr) {
  if (!dateStr) return ''
  if (!dateStr.endsWith('Z') && !dateStr.includes('+')) dateStr += 'Z'
  const now = new Date()
  const d = new Date(dateStr)
  const diffMs = now - d
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return 'Yesterday'
  if (diffDay < 7) return `${diffDay}d ago`
  return d.toLocaleDateString()
}

export default function Layout() {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [notifications, setNotifications] = useState([])
  const [showNotifs, setShowNotifs] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const notifRef = useRef(null)

  // Auto-mark notifications as read on navigation
  useEffect(() => {
    const markAsRead = async (type) => {
      try {
        await api.post(`/notifications/read-by-type?type=${type}`)
        setNotifications(prev => prev.map(n => n.type === type ? { ...n, is_read: true } : n))
      } catch (err) { console.error('Failed to mark as read:', err) }
    }

    if (location.pathname === '/bills') markAsRead('bill')
    else if (location.pathname === '/friends') markAsRead('friend')
    else if (location.pathname === '/history') markAsRead('payment')
  }, [location.pathname])

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 3000)

    const handleRefresh = () => fetchNotifications()
    window.addEventListener('refreshNotifications', handleRefresh)

    return () => {
      clearInterval(interval)
      window.removeEventListener('refreshNotifications', handleRefresh)
    }
  }, [])

  // Close notification panel when clicking outside
  useEffect(() => {
    if (!showNotifs) return
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifs(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showNotifs])

  const fetchNotifications = async () => {
    try { const r = await api.get('/notifications/'); setNotifications(r.data) } catch {}
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  const handleMarkAllRead = async () => {
    await api.post('/notifications/read-all')
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  // Mark a single notification as read then navigate to its target
  const handleNotifClick = async (n) => {
    // Mark as read immediately (fire-and-forget)
    if (!n.is_read) {
      api.post(`/notifications/${n.id}/read`).catch(() => {})
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
    }

    // Resolve target path from type + reference_id
    const id = n.reference_id
    let path = null
    if (n.type === 'bill' && id)     path = '/bills'
    if (n.type === 'payment' && id)  path = '/history'
    if (n.type === 'friend' && id)   path = '/friends'

    if (path) {
      setShowNotifs(false)
      navigate(path)
    }
  }

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/friends', icon: Users, label: 'Friends', count: notifications.filter(n => !n.is_read && n.type === 'friend').length },
    { to: '/bills', icon: Receipt, label: 'Bills', count: notifications.filter(n => !n.is_read && n.type === 'bill').length },
    { to: '/history', icon: History, label: 'History', count: notifications.filter(n => !n.is_read && n.type === 'payment').length },
  ]

  const initials = user?.full_name
    ? user.full_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : user?.username?.slice(0, 2).toUpperCase()

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <Link to="/" className={styles.logo}>
          <img src="/favicon.svg" alt="" className={styles.logoIconImg} />
          <span className={styles.logoText}>OWEME</span>
        </Link>
        <button className={styles.menuBtn} onClick={() => setMobileOpen(o => !o)}>
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <GlobalSearch />
        <div className={styles.headerRight}>
          <button className={styles.iconBtn} onClick={() => navigate('/friends?add=true')} title="Add Friend">
            <UserPlus size={18} />
          </button>
          <button className={styles.iconBtn} onClick={toggle} title="Toggle theme">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className={styles.notifWrapper} ref={notifRef}>
            <button className={styles.iconBtn} onClick={() => setShowNotifs(o => !o)}>
              <Bell size={18} />
              {unreadCount > 0 && <span className={styles.badge}>{unreadCount}</span>}
            </button>
            {showNotifs && (
              <div className={`${styles.notifPanel} glass`}>
                <div className={styles.notifHeader}>
                  <span>Notifications</span>
                  {unreadCount > 0 && <button onClick={handleMarkAllRead} className={styles.markRead}>Mark all read</button>}
                </div>
                <div className={styles.notifList}>
                  {notifications.length === 0 ? (
                    <div className={styles.emptyNotif}><Bell size={32} opacity={0.3} /><p>No notifications yet</p></div>
                  ) : notifications.slice(0, 15).map(n => (
                    <div key={n.id}
                      className={`${styles.notifItem} ${!n.is_read ? styles.unread : ''}`}
                      onClick={() => handleNotifClick(n)}
                      style={{ cursor: n.reference_id ? 'pointer' : 'default' }}
                    >
                      <div style={{
                        width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: 13, color: 'white', letterSpacing: '0.5px',
                        background: n.type === 'payment' ? 'var(--green)' : n.type === 'friend' ? 'var(--purple)' : n.type === 'bill' ? 'var(--primary)' : 'var(--text-dim)',
                      }}>
                        {(n.message.split(' ')[0] || '?').slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p className={styles.notifMsg}>{n.message}</p>
                        <p className={styles.notifTime}>{formatRelativeTime(n.created_at)}</p>
                      </div>
                      {!n.is_read && (
                        <div style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: 'var(--red)', flexShrink: 0, marginLeft: 8,
                          alignSelf: 'center',
                        }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className={styles.body}>
        <aside className={`${styles.sidebar} ${mobileOpen ? styles.open : ''}`}>
          <nav className={styles.nav}>
            {navItems.map(({ to, icon: Icon, label, count }) => (
              <NavLink key={to} to={to} end={to === '/'} onClick={() => setMobileOpen(false)}
                className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
                <Icon size={18} /><span>{label}</span>
                {count > 0 && <div className={styles.navBadge} />}
              </NavLink>
            ))}
          </nav>
          <div className={styles.sidebarBottom}>
            <div className={styles.userCard}>
              <div className={styles.avatar} style={{ background: user?.avatar_color }}>{initials}</div>
              <div className={styles.userInfo}>
                <span className={styles.userName}>{user?.full_name || user?.username}</span>
                <span className={styles.userHandle}>@{user?.username}</span>
              </div>
            </div>
            <button className={styles.iconBtn} onClick={() => { logout(); navigate('/login') }} title="Logout">
              <LogOut size={16} />
            </button>
          </div>
        </aside>

        {mobileOpen && <div className={styles.overlay} onClick={() => setMobileOpen(false)} />}

        <main className={styles.main}>
          <div className={styles.content}><Outlet /></div>
        </main>
      </div>
      <button 
        className={styles.fab} 
        onClick={() => navigate('/bills?new=true')}
        title="Create Bill"
      >
        <Plus size={24} className={styles.fabIcon} />
        <span className={styles.fabText}>New Bill</span>
      </button>
    </div>
  )
}
