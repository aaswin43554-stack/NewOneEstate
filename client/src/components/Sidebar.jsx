import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import {
  LayoutDashboard, Package, Layers, Users, Star,
  Flame, ScrollText, FlaskConical, Tag, LogOut,
} from 'lucide-react';

const GROUPS = [
  {
    label: 'Operations',
    items: [
      { to: '/',          label: 'Dashboard',    icon: LayoutDashboard, exact: true },
      { to: '/inventory', label: 'Inventory',    icon: Package },
      { to: '/allocations', label: 'Allocations', icon: Layers },
    ],
  },
  {
    label: 'Craft',
    items: [
      { to: '/roast',    label: 'Roast Sessions', icon: Flame },
      { to: '/profiles', label: 'Profiles',       icon: ScrollText },
      { to: '/cupping',  label: 'Cupping',        icon: FlaskConical },
    ],
  },
  {
    label: 'Commerce',
    items: [
      { to: '/contacts',              label: 'Contacts',     icon: Users },
      { to: '/contacts/private-list', label: 'Private List', icon: Star },
      { to: '/labels',                label: 'Labels',       icon: Tag },
    ],
  },
];

function CoffeeBeanIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="12" cy="12" rx="7" ry="10" stroke="#6F5035" strokeWidth="1.5" />
      <path d="M12 4 Q8 8 12 12 Q16 16 12 20" stroke="#6F5035" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function roleLabel(role) {
  if (role === 'admin') return 'Admin';
  if (role === 'roaster') return 'Roaster';
  return 'Viewer';
}

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

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
          className="fixed inset-0 z-20 md:hidden"
          style={{ background: 'rgba(34,21,8,0.25)' }}
          onClick={onClose}
        />
      )}

      <aside
        style={{ width: 220, borderRight: '1px solid #E0D0BC' }}
        className={`
          fixed top-0 left-0 h-full bg-coffee-50 z-30 flex flex-col
          transform transition-transform duration-200
          ${open ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0 md:static md:z-auto
        `}
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-4 pt-5 pb-4">
          <CoffeeBeanIcon />
          <span
            className="text-coffee-700 tracking-tight"
            style={{ fontSize: 14, fontWeight: 500 }}
          >
            OEC Ops
          </span>
          {/* Mobile close */}
          <button
            className="ml-auto md:hidden text-coffee-400 hover:text-coffee-700"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Role badge */}
        {user && (
          <div className="px-4 mb-4">
            <span
              className="inline-block px-2 py-0.5 rounded-full text-coffee-400 bg-coffee-100"
              style={{ fontSize: 11 }}
            >
              {roleLabel(user.role)}
            </span>
          </div>
        )}

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto px-2 space-y-4">
          {GROUPS.map(group => (
            <div key={group.label}>
              <p
                className="text-coffee-300 uppercase px-3 mb-1"
                style={{ fontSize: 10, letterSpacing: '0.08em' }}
              >
                {group.label}
              </p>
              {group.items.map(({ to, label, icon: Icon, exact }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={exact}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 h-9 text-sm transition-colors duration-150 ${
                      isActive
                        ? 'bg-coffee-100 text-coffee-700 rounded-r-[6px] border-l-[3px] border-coffee-600'
                        : 'text-coffee-500 hover:text-coffee-700 hover:bg-coffee-100 rounded-r-[6px]'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        size={14}
                        style={{ color: isActive ? '#533A24' : '#8B6A47', flexShrink: 0 }}
                      />
                      <span style={{ fontWeight: isActive ? 500 : 400 }}>{label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* User footer */}
        {user && (
          <div className="px-4 py-4 border-t border-coffee-200">
            <div className="flex items-center gap-2.5 mb-2">
              <div
                className="flex items-center justify-center rounded-full flex-shrink-0 text-coffee-600 bg-coffee-200"
                style={{ width: 32, height: 32, fontSize: 12, fontWeight: 500 }}
              >
                {initials(user.name)}
              </div>
              <div className="min-w-0">
                <p
                  className="text-coffee-800 truncate"
                  style={{ fontSize: 13, fontWeight: 500 }}
                >
                  {user.name}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-coffee-400 hover:text-coffee-700 transition-colors"
              style={{ fontSize: 12 }}
            >
              <LogOut size={12} />
              Sign out
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
