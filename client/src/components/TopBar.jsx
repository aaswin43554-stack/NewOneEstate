import { useLocation } from 'react-router-dom';
import { Bell, Search } from 'lucide-react';
import { useAuth } from '../lib/auth';

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
  // Match partial paths
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

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

export default function TopBar({ onMenuOpen }) {
  const location = useLocation();
  const { user } = useAuth();
  const moduleName = resolveModule(location.pathname);

  return (
    <header
      className="flex items-center justify-between bg-white px-5"
      style={{ height: 56, borderBottom: '1px solid #E0D0BC', flexShrink: 0 }}
    >
      {/* Left: mobile menu + breadcrumb */}
      <div className="flex items-center gap-3">
        {/* Mobile hamburger */}
        <button
          className="md:hidden text-coffee-400 hover:text-coffee-700 mr-1"
          onClick={onMenuOpen}
        >
          ☰
        </button>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5" style={{ fontSize: 14 }}>
          <span className="text-coffee-400">OEC Ops</span>
          <span className="text-coffee-300">/</span>
          <span className="text-coffee-800" style={{ fontWeight: 500 }}>
            {moduleName}
          </span>
        </nav>
      </div>

      {/* Right: search + bell + avatar */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <label
          className="flex items-center gap-2 px-3 rounded-lg bg-coffee-100 cursor-text"
          style={{ height: 32, width: 140 }}
        >
          <Search size={13} className="text-coffee-300 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search…"
            className="bg-transparent text-sm text-coffee-700 placeholder-coffee-300 w-full"
            style={{ fontWeight: 400 }}
          />
        </label>

        {/* Bell */}
        <button className="text-coffee-400 hover:text-coffee-700 transition-colors p-1">
          <Bell size={16} />
        </button>

        {/* Avatar */}
        {user && (
          <div
            className="flex items-center justify-center rounded-full bg-coffee-200 text-coffee-600 flex-shrink-0"
            style={{ width: 32, height: 32, fontSize: 12, fontWeight: 500 }}
          >
            {initials(user.name)}
          </div>
        )}
      </div>
    </header>
  );
}
