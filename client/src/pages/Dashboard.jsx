import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import Layout from '../components/Layout';
import { api } from '../lib/api';
import { StatCard, Button, StatusBadge, ProcessBadge } from '../components/ui';
import { Flame, Layers, FlaskConical, UserPlus, Radio } from 'lucide-react';

const EVENT_COLORS = {
  roast:      '#EF9F27',
  allocation: '#3B6D11',
  cupping:    '#534AB7',
  contact:    '#185FA5',
};

const ACCENT_COLORS = {
  stock:       '#A8896A',
  allocations: '#3B6D11',
  requests:    '#BA7517',
  roasts:      '#EF9F27',
  buyers:      '#185FA5',
};

function fmtRelative(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 60)  return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  return `${days}d ago`;
}

// Timeline item row
function TimelineEvent({ event, isLast }) {
  const color = EVENT_COLORS[event.type] || '#A8896A';
  return (
    <div className="flex gap-3">
      {/* Left: line + dot */}
      <div className="flex flex-col items-center flex-shrink-0" style={{ width: 20 }}>
        <div
          className="rounded-full flex-shrink-0"
          style={{ width: 10, height: 10, background: color, marginTop: 3 }}
        />
        {!isLast && (
          <div style={{ width: 1, flex: 1, background: '#E0D0BC', marginTop: 4 }} />
        )}
      </div>
      {/* Right: content */}
      <div className="pb-5 min-w-0 flex-1">
        <p className="text-sm text-coffee-800 leading-snug">{event.description}</p>
        <p className="text-xs text-coffee-400 mt-0.5">{fmtRelative(event.timestamp)}</p>
      </div>
    </div>
  );
}

// Pending action row
function PendingAction({ action }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-3 py-3 border-b border-coffee-100 last:border-0">
      <div className="flex-1 min-w-0">
        <StatusBadge status={action.status} />
        <p className="text-sm text-coffee-800 mt-1 leading-snug">{action.description}</p>
      </div>
      {action.link && (
        <Button variant="ghost" size="sm" onClick={() => navigate(action.link)}>
          View
        </Button>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard-stats')
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const greenStockKg = stats
    ? (stats.totalGreenStockG / 1000).toFixed(1) + ' kg'
    : loading ? '…' : '0 kg';

  // Build mock recent activity from available stats context
  const recentActivity = [
    stats?.activeAllocation && {
      type: 'allocation',
      description: `Allocation ${stats.activeAllocation.allocation_code} is currently active`,
      timestamp: new Date(Date.now() - 3600000).toISOString(),
    },
    stats?.totalRoastsCount > 0 && {
      type: 'roast',
      description: `${stats.totalRoastsCount} roast session${stats.totalRoastsCount !== 1 ? 's' : ''} logged in the system`,
      timestamp: new Date(Date.now() - 7200000).toISOString(),
    },
    stats?.activeAllocationsCount > 0 && {
      type: 'cupping',
      description: `${stats.activeAllocationsCount} active allocation${stats.activeAllocationsCount !== 1 ? 's' : ''} in progress`,
      timestamp: new Date(Date.now() - 86400000).toISOString(),
    },
    stats?.totalContactsCount > 0 && {
      type: 'contact',
      description: `${stats.totalContactsCount} buyer contact${stats.totalContactsCount !== 1 ? 's' : ''} in the database`,
      timestamp: new Date(Date.now() - 172800000).toISOString(),
    },
  ].filter(Boolean);

  const pendingActions = [
    stats?.totalBagsRequested > 0 && {
      status: 'under_review',
      description: `${stats.totalBagsRequested} bags requested — pending roast & dispatch`,
      link: '/allocations',
    },
    stats?.activeAllocationsCount > 0 && {
      status: 'draft',
      description: `${stats.activeAllocationsCount} allocation${stats.activeAllocationsCount !== 1 ? 's' : ''} in active state`,
      link: '/allocations',
    },
  ].filter(Boolean);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-6 py-6">

        {/* Greeting */}
        <div className="mb-6">
          <h1 className="text-xl text-coffee-900" style={{ fontWeight: 500 }}>
            Good morning{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
          </h1>
          <p className="text-sm text-coffee-400 mt-0.5">
            Suan Saket Estate · Doi Saket, Chiang Mai
          </p>
        </div>

        {/* Live roast indicator */}
        {stats?.activeAllocation && (
          <div
            className="flex items-center gap-3 mb-5 px-4 py-3 rounded-xl bg-white border border-coffee-200 cursor-pointer"
            onClick={() => navigate('/roast')}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: '#3B6D11', boxShadow: '0 0 0 4px #EAF3DE' }}
            />
            <p className="text-sm text-coffee-800">
              <span style={{ fontWeight: 500 }}>
                {stats.activeAllocation.allocation_code}
              </span>
              {' '}— allocation in progress
            </p>
            <Radio size={14} className="text-coffee-400 ml-auto" />
          </div>
        )}

        {/* 5-column stat grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          <StatCard
            label="Green Bean Stock"
            value={greenStockKg}
            accentColor={ACCENT_COLORS.stock}
          />
          <StatCard
            label="Active Allocations"
            value={loading ? '…' : stats?.activeAllocationsCount ?? 0}
            accentColor={ACCENT_COLORS.allocations}
          />
          <StatCard
            label="Outstanding Requests"
            value={loading ? '…' : stats?.totalBagsRequested != null ? `${stats.totalBagsRequested} bags` : '0 bags'}
            accentColor={ACCENT_COLORS.requests}
          />
          <StatCard
            label="Roast Batches"
            value={loading ? '…' : stats?.totalRoastsCount ?? 0}
            accentColor={ACCENT_COLORS.roasts}
          />
          <StatCard
            label="Specialty Buyers"
            value={loading ? '…' : stats?.totalContactsCount ?? 0}
            accentColor={ACCENT_COLORS.buyers}
          />
        </div>

        {/* Two-column content area */}
        <div className="grid md:grid-cols-[65%_35%] gap-5">

          {/* Left: Recent Activity timeline */}
          <div className="bg-white border border-coffee-200 rounded-xl p-5">
            <p
              className="text-xs text-coffee-400 uppercase tracking-wide mb-5"
              style={{ letterSpacing: '0.08em' }}
            >
              Recent Activity
            </p>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-coffee-300 py-8 text-center">
                Activity will appear here as you use the platform.
              </p>
            ) : (
              <div>
                {recentActivity.map((event, i) => (
                  <TimelineEvent
                    key={i}
                    event={event}
                    isLast={i === recentActivity.length - 1}
                  />
                ))}
              </div>
            )}

            {/* Quick actions */}
            <div
              className="flex flex-wrap gap-2 pt-4 mt-2"
              style={{ borderTop: '1px solid #F2EAE0' }}
            >
              <Button variant="secondary" size="sm" onClick={() => navigate('/inventory')}>
                <Package14 /> Inventory
              </Button>
              <Button variant="secondary" size="sm" onClick={() => navigate('/allocations')}>
                <Layers14 /> Allocations
              </Button>
              <Button variant="primary" size="sm" onClick={() => navigate('/roast/new')}>
                <Flame size={13} /> New Roast
              </Button>
            </div>
          </div>

          {/* Right: Pending Actions */}
          <div className="bg-white border border-coffee-200 rounded-xl p-5">
            <p
              className="text-xs text-coffee-400 uppercase tracking-wide mb-4"
              style={{ letterSpacing: '0.08em' }}
            >
              Needs Attention
            </p>
            {pendingActions.length === 0 ? (
              <p className="text-sm text-coffee-300 py-8 text-center">
                Nothing pending — you're all caught up.
              </p>
            ) : (
              pendingActions.map((action, i) => (
                <PendingAction key={i} action={action} />
              ))
            )}

            {/* Module shortcuts */}
            <div className="mt-4 space-y-1.5">
              {[
                { label: 'View roast sessions',    icon: <Flame size={13} />,       to: '/roast' },
                { label: 'Open cupping records',   icon: <FlaskConical size={13} />, to: '/cupping' },
                { label: 'Add new contact',        icon: <UserPlus size={13} />,    to: '/contacts/new' },
              ].map(link => (
                <button
                  key={link.to}
                  onClick={() => navigate(link.to)}
                  className="flex items-center gap-2 w-full text-left text-sm text-coffee-500 hover:text-coffee-800 transition-colors py-1"
                >
                  <span className="text-coffee-400">{link.icon}</span>
                  {link.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

// Tiny icon wrappers for consistent sizing
function Package14() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m16.5 9.4-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" x2="12" y1="22" y2="12"/></svg>; }
function Layers14()  { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>; }
