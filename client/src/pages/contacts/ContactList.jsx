import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';

const SEGMENTS = ['All', 'Laos', 'Thailand', 'Malaysia', 'Singapore', 'Other'];
const STATUSES = ['All', 'prospect', 'active_buyer', 'private_list', 'trade_account'];

const STATUS_COLORS = {
  prospect:      'bg-gray-100 text-gray-600',
  active_buyer:  'bg-green-100 text-green-700',
  private_list:  'bg-purple-100 text-purple-700',
  trade_account: 'bg-blue-100 text-blue-700',
};
const SEGMENT_COLORS = {
  Laos:      'bg-coffee-100 text-coffee-700',
  Thailand:  'bg-amber-100 text-amber-700',
  Malaysia:  'bg-green-100 text-green-700',
  Singapore: 'bg-blue-100 text-blue-700',
  Other:     'bg-gray-100 text-gray-600',
};

function statusLabel(s) {
  return (
    { prospect: 'Prospect', active_buyer: 'Active Buyer', private_list: 'Private List', trade_account: 'Trade Account' }[s] || s
  );
}

function fmtRate(r) {
  if (r == null) return '—';
  const pct = r <= 1 ? Math.round(r * 100) : Math.round(r);
  return `${pct}%`;
}

export default function ContactList() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [segFilter, setSegFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/contacts')
      .then(r => r.json())
      .then(d => setContacts(d.contacts || []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => contacts.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (segFilter !== 'All' && c.market_segment !== segFilter) return false;
    if (statusFilter !== 'All' && c.status !== statusFilter) return false;
    return true;
  }), [contacts, search, segFilter, statusFilter]);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-coffee-900">Contacts</h1>
          <button
            onClick={() => navigate('/contacts/new')}
            className="px-4 py-2 bg-coffee-700 text-white rounded-md text-sm font-semibold hover:bg-coffee-800"
          >
            + New Contact
          </button>
        </div>

        <input
          type="text"
          placeholder="Search by name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-coffee-400"
        />

        <div className="flex flex-wrap gap-y-2 gap-x-4">
          <div className="flex flex-wrap gap-1">
            {SEGMENTS.map(s => (
              <button
                key={s}
                onClick={() => setSegFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  segFilter === s
                    ? 'bg-coffee-700 text-white'
                    : 'bg-coffee-100 text-coffee-700 hover:bg-coffee-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {STATUSES.map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? 'bg-coffee-700 text-white'
                    : 'bg-coffee-100 text-coffee-700 hover:bg-coffee-200'
                }`}
              >
                {s === 'All' ? 'All' : statusLabel(s)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-coffee-500">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-coffee-400 text-center py-12">No contacts found.</p>
        ) : (
          <div className="bg-white border border-coffee-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-coffee-50 border-b border-coffee-200">
                <tr>
                  {['Name', 'Segment', 'Status', 'Contact Method', 'Allocations', 'Return Rate'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-coffee-600 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/contacts/${c.id}`)}
                    className="border-b border-coffee-50 hover:bg-coffee-50 cursor-pointer"
                  >
                    <td className="px-3 py-2 font-medium text-coffee-900">{c.name}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${SEGMENT_COLORS[c.market_segment] || 'bg-gray-100 text-gray-600'}`}>
                        {c.market_segment}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[c.status] || ''}`}>
                        {statusLabel(c.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-coffee-600 text-xs">{c.primary_contact_method || '—'}</td>
                    <td className="px-3 py-2 text-coffee-600">{c.total_allocations_participated ?? '—'}</td>
                    <td className="px-3 py-2 text-coffee-600">{fmtRate(c.return_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
