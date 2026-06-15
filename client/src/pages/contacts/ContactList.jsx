import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { PageHeader, Button, FilterPills } from '../../components/ui';

const SEGMENTS = [
  { value: 'All',       label: 'All' },
  { value: 'Laos',      label: 'Laos' },
  { value: 'Thailand',  label: 'Thailand' },
  { value: 'Malaysia',  label: 'Malaysia' },
  { value: 'Singapore', label: 'Singapore' },
  { value: 'Other',     label: 'Other' },
];
const STATUSES = [
  { value: 'All',           label: 'All' },
  { value: 'prospect',      label: 'Prospect' },
  { value: 'active_buyer',  label: 'Active Buyer' },
  { value: 'private_list',  label: 'Private List' },
  { value: 'trade_account', label: 'Trade Account' },
];

const STATUS_META = {
  prospect:      { cls: 'badge-draft',        label: 'Prospect' },
  active_buyer:  { cls: 'badge-published',    label: 'Active Buyer' },
  private_list:  { cls: 'badge-anaerobic',    label: 'Private List' },
  trade_account: { cls: 'badge-washed',       label: 'Trade Account' },
};

const SEGMENT_DOT = {
  Laos:      '#8B6A47',
  Thailand:  '#BA7517',
  Malaysia:  '#3B6D11',
  Singapore: '#185FA5',
  Other:     '#A8896A',
};

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtRate(r) {
  if (r == null) return '—';
  const pct = r <= 1 ? Math.round(r * 100) : Math.round(r);
  return `${pct}%`;
}

function ContactCard({ contact, onClick, onDelete, isAdmin }) {
  const meta = STATUS_META[contact.status] || { cls: 'badge-draft', label: contact.status };
  const dotColor = SEGMENT_DOT[contact.market_segment] || '#A8896A';

  return (
    <div
      onClick={onClick}
      className="bg-white border border-coffee-200 rounded-xl p-5 cursor-pointer transition-colors duration-150 hover:border-coffee-300"
    >
      {/* Avatar + name */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="flex items-center justify-center rounded-full flex-shrink-0 bg-coffee-200 text-coffee-600"
          style={{ width: 40, height: 40, fontSize: 14, fontWeight: 500 }}
        >
          {initials(contact.name)}
        </div>
        <div className="min-w-0">
          <p className="text-sm text-coffee-900 truncate" style={{ fontWeight: 500 }}>
            {contact.name}
          </p>
          {contact.company && (
            <p className="text-xs text-coffee-400 truncate">{contact.company}</p>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-coffee-100 pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${meta.cls}`}>
            {meta.label}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-coffee-400">
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: dotColor }}
            />
            {contact.market_segment}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-coffee-300">
          <span>{contact.total_allocations_participated ?? 0} allocations</span>
          <span>Return {fmtRate(contact.return_rate)}</span>
        </div>
        {isAdmin && (
          <div className="flex justify-end mt-2">
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onDelete(); }}
              className="text-xs"
              style={{ color: '#A32D2D' }}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

async function triggerExport(format) {
  const res  = await api.get(`/export/contacts?format=${format}`);
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `contacts-${new Date().toISOString().split('T')[0]}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ContactList() {
  const [contacts,     setContacts]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [segFilter,    setSegFilter]    = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting,      setDeleting]      = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  function load() {
    api.get('/contacts')
      .then(r => r.json())
      .then(d => setContacts(d.contacts || []))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function deleteContact(id) {
    setDeleting(true);
    await api.delete(`/contacts/${id}`);
    setDeleteConfirm(null);
    setDeleting(false);
    load();
  }

  const filtered = useMemo(() => contacts.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (segFilter    !== 'All' && c.market_segment !== segFilter)    return false;
    if (statusFilter !== 'All' && c.status         !== statusFilter) return false;
    return true;
  }), [contacts, search, segFilter, statusFilter]);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-6 py-6">
        <PageHeader
          title="Contacts"
          subtitle={`${filtered.length} contact${filtered.length !== 1 ? 's' : ''}`}
          actions={
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => triggerExport('csv')}>CSV</Button>
              <Button variant="ghost" onClick={() => triggerExport('json')}>JSON</Button>
              <Button variant="primary" onClick={() => navigate('/contacts/new')}>+ New Contact</Button>
            </div>
          }
        />

        {/* Search + filters */}
        <div className="space-y-3 mb-6">
          <input
            type="text"
            placeholder="Search by name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-9 px-3 text-sm border border-coffee-200 rounded-lg bg-white focus:border-coffee-500 focus:ring-2 focus:ring-coffee-100 text-coffee-800"
          />
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-coffee-400">Region</span>
              <FilterPills options={SEGMENTS} value={segFilter} onChange={setSegFilter} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-coffee-400">Status</span>
              <FilterPills options={STATUSES} value={statusFilter} onChange={setStatusFilter} />
            </div>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-coffee-400">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-coffee-300 text-center py-16">
            No contacts found.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {filtered.map(c => (
              <ContactCard
                key={c.id}
                contact={c}
                isAdmin={isAdmin}
                onClick={() => navigate(`/contacts/${c.id}`)}
                onDelete={() => setDeleteConfirm(c.id)}
              />
            ))}
          </div>
        )}

        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(34,21,8,0.2)' }}>
            <div className="bg-white rounded-2xl border border-coffee-200 w-full max-w-sm p-6">
              <h3 className="text-base text-coffee-900 mb-2" style={{ fontWeight: 500 }}>Delete Contact</h3>
              <p className="text-sm text-coffee-600 mb-5">
                This will permanently remove the contact. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <Button onClick={() => deleteContact(deleteConfirm)} disabled={deleting}
                  className="flex-1 justify-center" variant="destructive">
                  {deleting ? 'Deleting…' : 'Delete'}
                </Button>
                <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
