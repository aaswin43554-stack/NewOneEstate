import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/ui';

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

const SEGMENT_DOT = {
  Laos:      '#8B6A47',
  Thailand:  '#BA7517',
  Malaysia:  '#3B6D11',
  Singapore: '#185FA5',
  Other:     '#A8896A',
};

function PrivateCard({ contact, onClick }) {
  const dotColor = SEGMENT_DOT[contact.market_segment] || '#A8896A';

  return (
    <div
      onClick={onClick}
      className="bg-white border border-coffee-200 rounded-xl p-5 cursor-pointer transition-colors duration-150 hover:border-coffee-300"
      style={{ borderLeft: '3px solid #534AB7' }}
    >
      {/* Avatar + name */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="flex items-center justify-center rounded-full flex-shrink-0"
          style={{ width: 40, height: 40, fontSize: 14, fontWeight: 500, background: '#EEEDFE', color: '#534AB7' }}
        >
          {initials(contact.name)}
        </div>
        <div className="min-w-0">
          <p className="text-sm text-coffee-900 truncate" style={{ fontWeight: 500 }}>
            {contact.name}
          </p>
          {contact.preferred_channel && (
            <p className="text-xs text-coffee-400 truncate">{contact.preferred_channel}</p>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-coffee-100 pt-3">
        {contact.primary_contact_method && (
          <p className="text-sm text-coffee-700 mb-2 select-all">
            {contact.primary_contact_method}
          </p>
        )}
        <div className="flex items-center justify-between text-xs text-coffee-300">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: dotColor }} />
            {contact.market_segment}
          </span>
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
            style={{ background: '#EEEDFE', color: '#534AB7' }}
          >
            Private List
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ContactPrivateList() {
  const [contacts, setContacts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/contacts/private-list')
      .then(r => r.json())
      .then(d => setContacts(d.contacts || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-6 py-6">
        <PageHeader
          title="Private List"
          subtitle={loading ? 'Loading…' : `${contacts.length} VIP buyer${contacts.length !== 1 ? 's' : ''}`}
        />

        <div
          className="mb-6 px-4 py-3 rounded-xl text-sm"
          style={{ background: '#FAEEDA', color: '#BA7517' }}
        >
          Contact these buyers personally before opening each allocation. No automated outreach.
        </div>

        {loading ? (
          <p className="text-sm text-coffee-400">Loading…</p>
        ) : contacts.length === 0 ? (
          <p className="text-sm text-coffee-300 text-center py-16">
            No private list contacts yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {contacts.map(c => (
              <PrivateCard
                key={c.id}
                contact={c}
                onClick={() => navigate(`/contacts/${c.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
