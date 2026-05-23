import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';

const SEGMENT_COLORS = {
  Laos:      'bg-coffee-100 text-coffee-700',
  Thailand:  'bg-amber-100 text-amber-700',
  Malaysia:  'bg-green-100 text-green-700',
  Singapore: 'bg-blue-100 text-blue-700',
  Other:     'bg-gray-100 text-gray-600',
};

export default function ContactPrivateList() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/contacts/private-list')
      .then(r => r.json())
      .then(d => setContacts(d.contacts || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <h1 className="text-2xl font-bold text-coffee-900">
          Private List{!loading && ` — ${contacts.length} contacts`}
        </h1>

        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          Contact these buyers personally before opening each allocation.
        </div>

        {loading ? (
          <p className="text-coffee-500">Loading…</p>
        ) : contacts.length === 0 ? (
          <p className="text-coffee-400 text-center py-12">No private list contacts yet.</p>
        ) : (
          <div className="space-y-3">
            {contacts.map(c => (
              <div key={c.id} className="bg-white border border-coffee-200 rounded-lg px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-coffee-900 leading-tight">{c.name}</p>
                    <p className="text-base text-coffee-800 mt-1 font-medium select-all">{c.primary_contact_method}</p>
                    {c.preferred_channel && (
                      <p className="text-sm text-coffee-500 mt-0.5">{c.preferred_channel}</p>
                    )}
                  </div>
                  <span className={`shrink-0 text-xs px-2 py-1 rounded font-semibold ${SEGMENT_COLORS[c.market_segment] || 'bg-gray-100 text-gray-600'}`}>
                    {c.market_segment}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
