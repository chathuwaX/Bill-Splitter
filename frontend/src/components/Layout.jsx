import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useState, useEffect } from 'react'
import api from '../api/client'
import { LayoutDashboard, Users, Receipt, History, Bell, LogOut, Sun, Moon, Menu, X, Wallet } from 'lucide-react'
import styles from './Layout.module.css'

export default function Layout() {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [showNotifs, setShowNotifs] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [])

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
    { to: '/friends', icon: Users, label: 'Friends' },
    { to: '/bills', icon: Receipt, label: 'Bills' },
    { to: '/history', icon: History, label: 'History' },
  ]

  const initials = user?.full_name
    ? user.full_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : user?.username?.slice(0, 2).toUpperCase()

  return (
    <div className={styles.layout}>
      <aside className={`${styles.sidebar} ${mobileOpen ? styles.open : ''}`}>
        <div className={styles.logo}><Wallet size={24} color="#6366f1" /><span>FriendBill</span></div>
        <nav className={styles.nav}>
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={() => setMobileOpen(false)}
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
              <Icon size={18} /><span>{label}</span>
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

      <div className={styles.main}>
        <header className={styles.header}>
          <button className={styles.menuBtn} onClick={() => setMobileOpen(o => !o)}>
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className={styles.headerRight}>
            <button className={styles.iconBtn} onClick={toggle} title="Toggle theme">
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className={styles.notifWrapper}>
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
                        <div className={`${styles.notifDot} ${styles[`dot_${n.type}`]}`} />
                        <div>
                          <p className={styles.notifMsg}>{n.message}</p>
                          <p className={styles.notifTime}>{new Date(n.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className={styles.content}><Outlet /></main>
      </div>
    </div>
  )
}
