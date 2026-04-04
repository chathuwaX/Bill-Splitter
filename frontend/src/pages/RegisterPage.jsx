import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import toast from 'react-hot-toast'
import { Wallet, Eye, EyeOff, AlertCircle } from 'lucide-react'
import styles from './AuthPage.module.css'

export default function RegisterPage() {
  const [form, setForm] = useState({ username: '', email: '', full_name: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    if (!form.username.trim() || !form.email.trim() || !form.password.trim()) {
      setError('Username, email and password are required')
      return
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    setLoading(true)
    try {
      const r = await api.post('/auth/register', {
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
        full_name: form.full_name.trim() || null,
      })
      login(r.data.access_token, r.data.user)
      toast.success('Account created! Welcome to OWEME 🎉')
      navigate('/', { replace: true })
    } catch (err) {
      const msg = err.response?.data?.detail || 'Registration failed. Please try again.'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }))

  return (
    <div className={styles.page}>
      <div className={styles.bg}>
        <div className={styles.blob1} />
        <div className={styles.blob2} />
      </div>
      <div className={`${styles.card} glass slide-up`}>
        <div className={styles.logoRow}>
          <img src="/favicon.svg" alt="OWEME" className={styles.logoImg} />
        </div>
        <h2 className={styles.title}>Create account</h2>
        <p className={styles.subtitle}>Start splitting bills with your friends</p>

        {error && (
          <div className={styles.errorBox}>
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div>
            <label htmlFor="full_name">Full Name</label>
            <input id="full_name" type="text" placeholder="John Doe"
              value={form.full_name} onChange={set('full_name')} autoComplete="name" />
          </div>
          <div>
            <label htmlFor="reg_username">Username *</label>
            <input id="reg_username" type="text" placeholder="john_doe"
              value={form.username} onChange={set('username')} required autoFocus autoComplete="username" />
          </div>
          <div>
            <label htmlFor="reg_email">Email *</label>
            <input id="reg_email" type="email" placeholder="john@example.com"
              value={form.email} onChange={set('email')} required autoComplete="email" />
          </div>
          <div className={styles.pwField}>
            <label htmlFor="reg_password">Password * (min 6 chars)</label>
            <div className={styles.pwWrap}>
              <input
                id="reg_password"
                type={showPw ? 'text' : 'password'}
                placeholder="••••••••"
                value={form.password}
                onChange={set('password')}
                required
                minLength={6}
                autoComplete="new-password"
              />
              <button type="button" className={styles.eyeBtn} onClick={() => setShowPw(v => !v)}>
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '13px' }}
            disabled={loading}
          >
            {loading ? <><span className={styles.spinner} /> Creating account...</> : 'Create Account'}
          </button>
        </form>

        <p className={styles.switchText}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
