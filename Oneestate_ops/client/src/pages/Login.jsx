import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

function slugify(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function Login() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ name: '', email: '', password: '', company: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }

  function switchMode(m) { setMode(m); setError(''); setForm({ name: '', email: '', password: '', company: '' }); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await api.post('/auth/login', { email: form.email, password: form.password });
        const data = await res.json();
        if (!res.ok) { setError(data.error || 'Invalid credentials. Check your email and password.'); return; }
        login(data);
        navigate('/');
      } else {
        if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return; }
        if (!form.company.trim()) { setError('Company name is required.'); return; }
        const slug = slugify(form.company) || 'my-company';
        const res = await api.post('/auth/register', {
          name: form.name,
          email: form.email,
          password: form.password,
          tenant_name: form.company,
          tenant_slug: slug + '-' + Date.now().toString(36),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || data.errors?.[0]?.msg || 'Registration failed.'); return; }
        login(data);
        navigate('/');
      }
    } catch {
      setError('Could not reach the server. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-coffee-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-coffee-800 rounded-2xl mb-4">
            <span className="text-white font-bold text-lg">OEC</span>
          </div>
          <h1 className="text-xl font-bold text-coffee-900">One Estate Coffee</h1>
          <p className="text-coffee-400 text-sm mt-1">Ops Platform</p>
        </div>

        {/* Toggle tabs */}
        <div className="flex bg-coffee-100 rounded-xl p-1 mb-4">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              mode === 'login' ? 'bg-white text-coffee-900 shadow-sm' : 'text-coffee-500 hover:text-coffee-700'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              mode === 'register' ? 'bg-white text-coffee-900 shadow-sm' : 'text-coffee-500 hover:text-coffee-700'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-coffee-100 p-8">
          <h2 className="text-lg font-semibold text-coffee-900 mb-6">
            {mode === 'login' ? 'Welcome back' : 'Set up your account'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-coffee-700 mb-1.5">Your Name</label>
                  <input
                    type="text" autoComplete="name" required
                    value={form.name}
                    onChange={e => set('name', e.target.value)}
                    placeholder="e.g. Somchai"
                    className="w-full border border-coffee-200 rounded-xl px-3 py-2.5 text-coffee-900 text-sm focus:outline-none focus:ring-2 focus:ring-coffee-400 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-coffee-700 mb-1.5">Company / Farm Name</label>
                  <input
                    type="text" required
                    value={form.company}
                    onChange={e => set('company', e.target.value)}
                    placeholder="e.g. One Estate Coffee"
                    className="w-full border border-coffee-200 rounded-xl px-3 py-2.5 text-coffee-900 text-sm focus:outline-none focus:ring-2 focus:ring-coffee-400 focus:border-transparent"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-coffee-700 mb-1.5">Email</label>
              <input
                type="email" autoComplete="email" required
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="you@example.com"
                className="w-full border border-coffee-200 rounded-xl px-3 py-2.5 text-coffee-900 text-sm focus:outline-none focus:ring-2 focus:ring-coffee-400 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-coffee-700 mb-1.5">Password</label>
              <input
                type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required
                value={form.password}
                onChange={e => set('password', e.target.value)}
                placeholder={mode === 'register' ? 'At least 8 characters' : ''}
                className="w-full border border-coffee-200 rounded-xl px-3 py-2.5 text-coffee-900 text-sm focus:outline-none focus:ring-2 focus:ring-coffee-400 focus:border-transparent"
              />
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full bg-coffee-700 text-white py-2.5 rounded-xl hover:bg-coffee-800 disabled:opacity-50 transition-colors font-medium text-sm mt-2"
            >
              {loading
                ? (mode === 'login' ? 'Signing in…' : 'Creating account…')
                : (mode === 'login' ? 'Sign In' : 'Create Account')}
            </button>
          </form>

          {mode === 'login' && (
            <p className="text-center text-xs text-coffee-400 mt-5">
              No account?{' '}
              <button onClick={() => switchMode('register')} className="text-coffee-600 font-semibold hover:underline">
                Create one
              </button>
            </p>
          )}
          {mode === 'register' && (
            <p className="text-center text-xs text-coffee-400 mt-5">
              Already have an account?{' '}
              <button onClick={() => switchMode('login')} className="text-coffee-600 font-semibold hover:underline">
                Sign in
              </button>
            </p>
          )}
        </div>

        {/* Existing credentials hint */}
        {mode === 'login' && (
          <div className="mt-4 bg-coffee-50 border border-coffee-200 rounded-xl px-4 py-3 text-xs text-coffee-500 text-center">
            Demo account: <span className="font-mono font-semibold text-coffee-700">admin@oneestate.com</span>
            <br />Password: <span className="font-mono font-semibold text-coffee-700">Admin123!</span>
          </div>
        )}
      </div>
    </div>
  );
}
