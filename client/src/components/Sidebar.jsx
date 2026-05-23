import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';

const NAV = [
  { to: '/',                        label: 'Dashboard' },
  { to: '/inventory',               label: 'Inventory' },
  { to: '/allocations',             label: 'Allocations' },
  { to: '/journal',                 label: 'Journal' },
  { to: '/contacts',                label: 'Contacts' },
  { to: '/contacts/private-list',   label: 'Private List' },
  { to: '/roast',                   label: 'Roast Sessions' },
  { to: '/profiles',                label: 'Profiles' },
  { to: '/cupping',                 label: 'Cupping' },
];

export default function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    try { await api.post('/auth/logout', {}); } catch (_) { /* swallow */ }
    logout();
    navigate('/login');
  }

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 h-full w-60 bg-coffee-900 text-white z-30 flex flex-col
          transform transition-transform duration-200
          ${open ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0 md:static md:z-auto
        `}
      >
        {/* Brand */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-coffee-700">
          <span className="font-bold text-lg tracking-wide">OEC Ops</span>
          <button className="md:hidden text-coffee-300 hover:text-white" onClick={onClose}>✕</button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto py-4 space-y-0.5 px-2">
          {NAV.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-coffee-700 text-white'
                    : 'text-coffee-200 hover:bg-coffee-800 hover:text-white'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User + logout */}
        {user && (
          <div className="border-t border-coffee-700 px-4 py-3">
            <p className="text-xs text-coffee-400 truncate">{user.name}</p>
            <p className="text-xs text-coffee-500 capitalize mb-2">{user.role}</p>
            <button
              onClick={handleLogout}
              className="w-full text-left text-xs text-coffee-300 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
