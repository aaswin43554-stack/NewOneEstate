import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';

export default function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    const refresh = localStorage.getItem('refresh_token');
    if (refresh) await api.post('/auth/logout', { refresh_token: refresh }).catch(() => {});
    logout();
    navigate('/login');
  }

  return (
    <header className="bg-coffee-800 text-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-bold tracking-tight text-coffee-100">OEC Ops</span>
          <nav className="hidden sm:flex items-center gap-5 text-sm">
            <Link
              to="/inventory"
              className="text-coffee-300 hover:text-white transition-colors"
            >
              Inventory
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-coffee-100 text-sm font-medium leading-none">{user?.name}</span>
            <span className="text-coffee-400 text-xs mt-0.5 capitalize">{user?.role}</span>
          </div>
          <button
            onClick={handleLogout}
            className="text-coffee-400 hover:text-white text-sm transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
