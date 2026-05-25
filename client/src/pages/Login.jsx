import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

function CoffeeBeanIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="12" cy="12" rx="7" ry="10" stroke="#6F5035" strokeWidth="1.5" />
      <path d="M12 4 Q8 8 12 12 Q16 16 12 20" stroke="#6F5035" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function slugify(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function Field({ label, type = 'text', value, onChange, placeholder, autoComplete, required }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm text-coffee-600" style={{ fontWeight: 500 }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className="h-9 px-3 text-sm text-coffee-900 bg-white border border-coffee-200 rounded-lg focus:border-coffee-500 focus:ring-2 focus:ring-coffee-100 transition-colors"
      />
    </div>
  );
}

export default function Login() {
  const [mode, setMode]   = useState('login');
  const [form, setForm]   = useState({ name: '', email: '', password: '', company: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }

  function switchMode(m) {
    setMode(m);
    setError('');
    setForm({ name: '', email: '', password: '', company: '' });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        const res  = await api.post('/auth/login', { email: form.email, password: form.password });
        const data = await res.json();
        if (!res.ok) { setError(data.error || 'Invalid credentials.'); return; }
        login(data);
        navigate('/');
      } else {
        if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return; }
        if (!form.company.trim())     { setError('Company name is required.'); return; }
        const slug = slugify(form.company) || 'my-company';
        const res  = await api.post('/auth/register', {
          name: form.name, email: form.email, password: form.password,
          tenant_name: form.company,
          tenant_slug: slug + '-' + Date.now().toString(36),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || data.errors?.[0]?.msg || 'Registration failed.'); return; }
        login(data);
        navigate('/');
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: '#FDFAF6' }}
    >
      <div style={{ width: '100%', maxWidth: 360 }}>
        {/* Brand */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center rounded-2xl mb-3"
            style={{ width: 48, height: 48, background: '#FAF6F0', border: '1px solid #E0D0BC' }}
          >
            <CoffeeBeanIcon />
          </div>
          <h1 className="text-base text-coffee-900" style={{ fontWeight: 500 }}>
            One Estate Coffee
          </h1>
          <p className="text-sm text-coffee-400 mt-0.5">Ops Platform</p>
        </div>

        {/* Tab toggle */}
        <div
          className="flex rounded-xl p-1 mb-5"
          style={{ background: '#F2EAE0' }}
        >
          {['login', 'register'].map(m => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className="flex-1 py-2 rounded-lg text-sm transition-colors duration-150"
              style={{
                background:   mode === m ? '#FFFFFF' : 'transparent',
                color:        mode === m ? '#221508' : '#A8896A',
                fontWeight:   mode === m ? 500 : 400,
                border:       mode === m ? '1px solid #E0D0BC' : 'none',
              }}
            >
              {m === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white border border-coffee-200 rounded-2xl p-7">
          <h2 className="text-base text-coffee-900 mb-5" style={{ fontWeight: 500 }}>
            {mode === 'login' ? 'Welcome back' : 'Set up your account'}
          </h2>

          {error && (
            <div
              className="mb-4 px-3 py-2.5 rounded-lg text-sm"
              style={{ background: '#FCEBEB', color: '#A32D2D' }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <Field
                  label="Your Name"
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="e.g. Somchai"
                  autoComplete="name"
                  required
                />
                <Field
                  label="Company / Farm Name"
                  value={form.company}
                  onChange={e => set('company', e.target.value)}
                  placeholder="e.g. One Estate Coffee"
                  required
                />
              </>
            )}

            <Field
              label="Email"
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
            <Field
              label="Password"
              type="password"
              value={form.password}
              onChange={e => set('password', e.target.value)}
              placeholder={mode === 'register' ? 'At least 8 characters' : ''}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full h-9 rounded-lg text-sm text-white transition-colors duration-150 disabled:opacity-40"
              style={{ background: '#533A24', fontWeight: 500 }}
            >
              {loading
                ? (mode === 'login' ? 'Signing in…' : 'Creating account…')
                : (mode === 'login' ? 'Sign In' : 'Create Account')
              }
            </button>
          </form>

          <p className="text-center text-xs text-coffee-400 mt-5">
            {mode === 'login' ? 'No account? ' : 'Already have one? '}
            <button
              onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
              className="text-coffee-600 hover:text-coffee-800 transition-colors"
              style={{ fontWeight: 500 }}
            >
              {mode === 'login' ? 'Create one' : 'Sign in'}
            </button>
          </p>
        </div>

        {/* Demo credentials hint */}
        {mode === 'login' && (
          <div
            className="mt-4 px-4 py-3 rounded-xl text-xs text-coffee-400 text-center"
            style={{ background: '#FAF6F0', border: '1px solid #E0D0BC' }}
          >
            Demo:{' '}
            <span className="font-mono text-coffee-600">admin@oneestate.com</span>
            {' '}· Password:{' '}
            <span className="font-mono text-coffee-600">Admin123!</span>
          </div>
        )}
      </div>
    </div>
  );
}
