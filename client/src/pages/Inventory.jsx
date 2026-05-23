import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import Layout from '../components/Layout';
import AddLotModal from '../components/AddLotModal';

const PROCESSES = ['Washed', 'Honey', 'Natural', 'Anaerobic'];

function gToKg(g) {
  return (g / 1000).toFixed(2);
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function QualityBadge() {
  return (
    <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap">
      ⚠ Aged
    </span>
  );
}

export default function Inventory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [grouped, setGrouped] = useState({});
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState({ process: '', harvest_year: '' });
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const canWrite = user?.role === 'admin' || user?.role === 'roaster';

  const fetchLots = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filter.process)       params.set('process', filter.process);
      if (filter.harvest_year)  params.set('harvest_year', filter.harvest_year);
      const res = await api.get(`/lots?${params}`);
      if (!res.ok) { setError('Failed to load inventory.'); return; }
      const data = await res.json();
      setGrouped(data.grouped || {});
      setTotal(data.total || 0);
    } catch {
      setError('Failed to load inventory.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchLots(); }, [fetchLots]);

  const processOrder = PROCESSES.filter((p) => grouped[p]);

  return (
    <Layout>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-coffee-900">Green Bean Inventory</h1>
            <p className="text-sm text-coffee-400 mt-1">
              {loading ? 'Loading…' : `${total} active lot${total !== 1 ? 's' : ''}`}
            </p>
          </div>
          {canWrite && (
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 bg-coffee-700 text-white px-4 py-2.5 rounded-xl hover:bg-coffee-800 transition-colors font-medium text-sm shadow-sm shrink-0"
            >
              + Add New Lot
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-6">
          <select
            value={filter.process}
            onChange={(e) => setFilter((f) => ({ ...f, process: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-coffee-800 bg-white focus:outline-none focus:ring-2 focus:ring-coffee-300"
          >
            <option value="">All processes</option>
            {PROCESSES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select
            value={filter.harvest_year}
            onChange={(e) => setFilter((f) => ({ ...f, harvest_year: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-coffee-800 bg-white focus:outline-none focus:ring-2 focus:ring-coffee-300"
          >
            <option value="">All years</option>
            {[2026, 2025, 2024, 2023, 2022, 2021].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="text-center py-20 text-coffee-300 text-sm">Loading inventory…</div>
        ) : processOrder.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-coffee-400 text-sm">No lots found.</p>
            {canWrite && (
              <button
                onClick={() => setShowModal(true)}
                className="mt-3 text-coffee-700 underline text-sm"
              >
                Add the first lot
              </button>
            )}
          </div>
        ) : (
          processOrder.map((process) => {
            const yearGroups = grouped[process];
            const years = Object.keys(yearGroups).sort((a, b) => b - a);
            return (
              <section key={process} className="mb-10">
                {/* Process heading */}
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-base font-bold text-coffee-800 uppercase tracking-wide">{process}</h2>
                  <div className="h-px flex-1 bg-coffee-100" />
                </div>

                {years.map((year) => (
                  <div key={year} className="mb-5">
                    <p className="text-xs font-semibold text-coffee-400 uppercase tracking-wider mb-2">
                      Harvest {year}
                    </p>
                    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="bg-coffee-50 border-b border-gray-100">
                            {['Lot Code', 'Estate', 'Process', 'Year', 'Arrival', 'Current Weight', 'Location', ''].map((h) => (
                              <th
                                key={h}
                                className={`px-4 py-3 text-xs font-semibold text-coffee-600 uppercase tracking-wide whitespace-nowrap ${h === 'Current Weight' ? 'text-right' : 'text-left'}`}
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {yearGroups[year].map((lot) => (
                            <tr
                              key={lot.id}
                              onClick={() => navigate(`/inventory/${lot.id}`)}
                              className="hover:bg-coffee-50 cursor-pointer transition-colors group"
                            >
                              <td className="px-4 py-3 font-mono font-semibold text-coffee-800 group-hover:text-coffee-900">
                                {lot.lot_code}
                              </td>
                              <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{lot.estate}</td>
                              <td className="px-4 py-3 text-gray-500">{lot.process}</td>
                              <td className="px-4 py-3 text-gray-500">{lot.harvest_year}</td>
                              <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(lot.arrival_date)}</td>
                              <td className="px-4 py-3 text-right font-semibold text-coffee-800 whitespace-nowrap">
                                {gToKg(lot.current_weight_g)} kg
                              </td>
                              <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{lot.storage_location}</td>
                              <td className="px-4 py-3">
                                {lot.quality_alert && <QualityBadge />}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </section>
            );
          })
        )}
      </main>

      {showModal && (
        <AddLotModal
          onClose={() => setShowModal(false)}
          onCreated={() => { setShowModal(false); fetchLots(); }}
        />
      )}
    </Layout>
  );
}
