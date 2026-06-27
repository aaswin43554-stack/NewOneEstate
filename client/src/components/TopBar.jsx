import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronLeft, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

const MODULE_NAMES = {
  '/':                    'Dashboard',
  '/dashboard':           'Dashboard',
  '/inventory':           'Inventory',
  '/allocations':         'Allocations',
  '/roast':               'Roast Sessions',
  '/profiles':            'Profiles',
  '/cupping':             'Cupping',
  '/contacts':            'Contacts',
  '/contacts/private-list': 'Private List',
  '/labels':              'Labels',
  '/journal':             'Journal',
};

function resolveModule(pathname) {
  if (MODULE_NAMES[pathname]) return MODULE_NAMES[pathname];
  const segments = [
    '/contacts/private-list',
    '/inventory',
    '/allocations',
    '/roast',
    '/profiles',
    '/cupping',
    '/contacts',
    '/labels',
    '/journal',
  ];
  for (const seg of segments) {
    if (pathname.startsWith(seg)) return MODULE_NAMES[seg] || seg.slice(1);
  }
  return 'Dashboard';
}

const DASHBOARD_PATHS = new Set(['/', '/dashboard']);

const MAIN_MODULE_PATHS = new Set([
  '/inventory', '/allocations', '/roast', '/profiles',
  '/cupping', '/contacts', '/contacts/private-list', '/labels', '/journal',
]);

const TYPE_ROUTE = {
  lot:        id => `/inventory/${id}`,
  roast:      id => `/roast/${id}`,
  allocation: id => `/allocations/${id}`,
  contact:    id => `/contacts/${id}`,
};

const TYPE_LABEL = {
  lot:        'Lot',
  roast:      'Roast',
  allocation: 'Allocation',
  contact:    'Contact',
};

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const ACTIVITY_ICON = {
  inventory:  '📦',
  roast:      '🔥',
  allocation: '📋',
  contact:    '👤',
  cupping:    '☕',
};

export default function TopBar({ onMenuOpen }) {
  const location  = useLocation();
  const navigate  = useNavigate();
  const moduleName = resolveModule(location.pathname);

  // ── Search state ──────────────────────────────────────────────────────────
  const [query,       setQuery]       = useState('');
  const [results,     setResults]     = useState([]);
  const [searching,   setSearching]   = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setShowResults(false); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res  = await api.get(`/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        setResults(data.results || []);
        setShowResults(true);
      } catch { /* silent */ } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  // Close search dropdown on outside click
  useEffect(() => {
    function handle(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  function pickResult(r) {
    setQuery('');
    setShowResults(false);
    const route = TYPE_ROUTE[r.type];
    if (route) navigate(route(r.id));
  }

  // ── Notification state ────────────────────────────────────────────────────
  const [showNotifs, setShowNotifs] = useState(false);
  const [activity,   setActivity]   = useState([]);
  const bellRef = useRef(null);

  async function openNotifs() {
    if (showNotifs) { setShowNotifs(false); return; }
    try {
      const res  = await api.get('/dashboard-stats');
      const data = await res.json();
      setActivity(data.recentActivity || []);
    } catch { /* silent */ }
    setShowNotifs(true);
  }

  // Close notifications on outside click
  useEffect(() => {
    function handle(e) {
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setShowNotifs(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  return (
    <header
      className="flex items-center justify-between bg-white px-5"
      style={{ height: 56, borderBottom: '1px solid #E5E5E5', flexShrink: 0 }}
    >
      {/* Left: mobile menu + back button + breadcrumb */}
      <div className="flex items-center gap-2">
        <button
          className="md:hidden text-coffee-400 hover:text-coffee-700 mr-1"
          onClick={onMenuOpen}
        >
          ☰
        </button>

        {/* Back button — hidden on dashboard; main modules go to dashboard, sub-pages go to previous */}
        {!DASHBOARD_PATHS.has(location.pathname) && (
          <button
            onClick={() => MAIN_MODULE_PATHS.has(location.pathname) ? navigate('/dashboard') : navigate(-1)}
            className="flex items-center justify-center rounded-lg text-coffee-500 hover:text-coffee-800 hover:bg-coffee-100 transition-colors"
            style={{ width: 30, height: 30 }}
            title="Go back"
          >
            <ChevronLeft size={18} />
          </button>
        )}

        <nav className="flex items-center gap-1.5" style={{ fontSize: 14 }}>
          <span className="text-coffee-400">OEC Ops</span>
          <span className="text-coffee-300">/</span>
          <span className="text-coffee-800" style={{ fontWeight: 500 }}>
            {moduleName}
          </span>
        </nav>
      </div>

      {/* Right: search + bell */}
      <div className="flex items-center gap-3">

        {/* Search */}
        <div ref={searchRef} className="relative">
          <label
            className="flex items-center gap-2 px-3 rounded-lg bg-coffee-100 cursor-text"
            style={{ height: 32, width: 180 }}
          >
            <Search size={13} className="text-coffee-300 flex-shrink-0" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => results.length > 0 && setShowResults(true)}
              placeholder="Search…"
              className="bg-transparent text-sm text-coffee-700 placeholder-coffee-300 w-full outline-none"
              style={{ fontWeight: 400 }}
            />
            {query && (
              <button
                onClick={() => { setQuery(''); setShowResults(false); }}
                className="text-coffee-300 hover:text-coffee-500 flex-shrink-0"
              >
                <X size={11} />
              </button>
            )}
          </label>

          {showResults && (
            <div
              className="absolute right-0 mt-1 bg-white rounded-xl shadow-lg border border-coffee-100 overflow-hidden z-50"
              style={{ width: 280, top: '100%' }}
            >
              {searching && (
                <div className="px-4 py-3 text-sm text-coffee-400">Searching…</div>
              )}
              {!searching && results.length === 0 && (
                <div className="px-4 py-3 text-sm text-coffee-400">No results for "{query}"</div>
              )}
              {!searching && results.length > 0 && (
                <ul>
                  {results.map((r, i) => (
                    <li key={i}>
                      <button
                        onClick={() => pickResult(r)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-coffee-50 transition-colors"
                      >
                        <span
                          className="text-xs font-medium px-1.5 py-0.5 rounded bg-coffee-100 text-coffee-500 flex-shrink-0"
                          style={{ fontSize: 10 }}
                        >
                          {TYPE_LABEL[r.type] || r.type}
                        </span>
                        <span className="text-sm text-coffee-800 font-medium truncate">{r.label}</span>
                        {r.sub && (
                          <span className="text-xs text-coffee-400 ml-auto flex-shrink-0 truncate max-w-20">
                            {r.sub}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Bell / Notifications */}
        <div ref={bellRef} className="relative">
          <button
            onClick={openNotifs}
            className="text-coffee-400 hover:text-coffee-700 transition-colors p-1 relative"
          >
            <Bell size={16} />
            {activity.length > 0 && !showNotifs && (
              <span
                className="absolute top-0 right-0 bg-amber-500 rounded-full"
                style={{ width: 6, height: 6 }}
              />
            )}
          </button>

          {showNotifs && (
            <div
              className="absolute right-0 mt-1 bg-white rounded-xl shadow-lg border border-coffee-100 overflow-hidden z-50"
              style={{ width: 320, top: '100%' }}
            >
              <div className="px-4 py-3 border-b border-coffee-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-coffee-800">Recent Activity</span>
                <button
                  onClick={() => setShowNotifs(false)}
                  className="text-coffee-300 hover:text-coffee-500"
                >
                  <X size={13} />
                </button>
              </div>
              {activity.length === 0 ? (
                <div className="px-4 py-4 text-sm text-coffee-400">No recent activity.</div>
              ) : (
                <ul className="max-h-80 overflow-y-auto">
                  {activity.map((a, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 px-4 py-3 border-b border-coffee-50 last:border-0"
                    >
                      <span className="text-base flex-shrink-0 mt-0.5">
                        {ACTIVITY_ICON[a.type] || '📌'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-coffee-700 leading-snug">{a.description}</p>
                        <p className="text-xs text-coffee-400 mt-0.5">{timeAgo(a.timestamp)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

      </div>
    </header>
  );
}
