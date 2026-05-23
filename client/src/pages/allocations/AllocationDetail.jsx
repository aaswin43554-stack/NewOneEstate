import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';

const TZ = 'Asia/Vientiane';

const JOURNAL_DOC_TYPES = ['field_notes', 'roast_log', 'cupping_record', 'allocation_record'];
const JOURNAL_DOC_LABELS = {
  field_notes: 'Field Notes', roast_log: 'Roast Log',
  cupping_record: 'Cupping Record', allocation_record: 'Allocation Record',
};
const JOURNAL_STATUS_STYLES = {
  draft: 'bg-gray-100 text-gray-600', under_review: 'bg-amber-100 text-amber-700',
  published: 'bg-green-100 text-green-700', missing: 'border border-red-300 text-red-600',
};
const JOURNAL_STATUS_LABELS = {
  draft: 'Draft', under_review: 'Under Review', published: 'Published', missing: 'Missing',
};

const STATE_LABELS = {
  upcoming:'Upcoming', open_for_requests:'Open for Requests', closed:'Closed',
  roasting_in_progress:'Roasting', resting:'Resting', dispatched:'Dispatched', archived:'Archived',
};
const NEXT_LABELS = {
  upcoming:'Open for Requests', open_for_requests:'Close', closed:'Start Roasting',
  roasting_in_progress:'Move to Resting', resting:'Dispatch', dispatched:'Archive',
};
const PROCESS_COLORS = {
  Washed:'bg-blue-100 text-blue-700', Honey:'bg-amber-100 text-amber-700',
  Natural:'bg-green-100 text-green-700', Anaerobic:'bg-purple-100 text-purple-700',
};
const STATUS_COLORS = {
  pending:'bg-gray-100 text-gray-700', confirmed:'bg-green-100 text-green-700',
  fulfilled:'bg-blue-100 text-blue-700',
};

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' });
}
function fmtDateOnly(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: TZ });
}

export default function AllocationDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [transitionModal, setTransitionModal] = useState(false);
  const [transitionChecks, setTransitionChecks] = useState(null);
  const [transNotes, setTransNotes] = useState('');
  const [transSaving, setTransSaving] = useState(false);
  const [transError, setTransError]   = useState('');
  const [reqForm, setReqForm] = useState({ contact_name:'', contact_method:'', channel:'WhatsApp', quantity_bags:1, notes:'' });
  const [reqOpen, setReqOpen] = useState(false);
  const [reqSaving, setReqSaving] = useState(false);
  const [reqError,  setReqError]  = useState('');
  const [rowErrors, setRowErrors] = useState({});
  const [journalDocs,       setJournalDocs]       = useState(null);
  const [journalLoading,    setJournalLoading]    = useState(false);
  const [journalGenerating, setJournalGenerating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/allocations/${id}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(load, [load]);

  const loadJournal = useCallback(() => {
    setJournalLoading(true);
    api.get(`/journal/${id}`)
      .then(r => r.json())
      .then(d => setJournalDocs(d.documents || null))
      .catch(() => setJournalDocs(null))
      .finally(() => setJournalLoading(false));
  }, [id]);

  useEffect(loadJournal, [loadJournal]);

  async function generateJournalDrafts() {
    setJournalGenerating(true);
    await api.post(`/journal/generate/${id}`, {});
    setJournalGenerating(false);
    loadJournal();
  }

  async function openTransitionModal() {
    const res = await api.get(`/allocations/${id}/transition-check`);
    const d = await res.json();
    setTransitionChecks(d);
    setTransitionModal(true);
  }

  async function confirmTransition() {
    setTransSaving(true);
    setTransError('');
    const res = await api.put(`/allocations/${id}/transition`, { notes: transNotes || undefined });
    const d = await res.json();
    if (res.ok) { setTransitionModal(false); setTransNotes(''); load(); }
    else { setTransError(d.error || 'Failed.'); }
    setTransSaving(false);
  }

  async function addRequest(e) {
    e.preventDefault();
    setReqSaving(true); setReqError('');
    const res = await api.post(`/allocations/${id}/requests`, reqForm);
    const d = await res.json();
    if (res.ok) { setReqOpen(false); setReqForm({ contact_name:'', contact_method:'', channel:'WhatsApp', quantity_bags:1, notes:'' }); load(); }
    else { setReqError(d.error || 'Failed.'); }
    setReqSaving(false);
  }

  async function updateReqStatus(reqId, status) {
    const res = await api.put(`/allocations/${id}/requests/${reqId}`, { status });
    const d = await res.json();
    if (res.ok) { load(); setRowErrors(p => ({ ...p, [reqId]: null })); }
    else { setRowErrors(p => ({ ...p, [reqId]: d.error })); }
  }

  if (loading) return <Layout><div className="p-6 text-coffee-600">Loading…</div></Layout>;
  if (!data) return <Layout><div className="p-6 text-red-600">Allocation not found.</div></Layout>;

  const { allocation: a, lot, requests, state_log, roast_sessions, dispatch_date, projected_bags, confirmed_bags } = data;
  const isArchived = a.state === 'archived';
  const isAdmin = ['admin', 'roaster'].includes(user?.role);
  const bagPct = projected_bags > 0 ? Math.min(100, Math.round((confirmed_bags / projected_bags) * 100)) : 0;
  const bagColor = bagPct >= 100 ? 'bg-red-500' : bagPct >= 90 ? 'bg-amber-400' : 'bg-green-500';
  const allChecksPassed = transitionChecks?.checks?.every(c => c.passed);
  const REST_DAYS_MAP = { Washed:4, Honey:5, Natural:7, Anaerobic:7 };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-4 space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-coffee-900">{a.allocation_code}</h1>
          <span className={`text-xs px-2 py-1 rounded font-semibold ${PROCESS_COLORS[a.process] || ''}`}>{a.process}</span>
          <span className="text-sm text-coffee-500">{a.harvest_year}</span>
          <span className="text-xs px-2 py-1 bg-coffee-100 text-coffee-700 rounded font-medium capitalize">
            {STATE_LABELS[a.state] || a.state}
          </span>
          {isArchived && <span className="text-sm">🔒</span>}
        </div>

        {/* State transition panel */}
        <div className="bg-white border border-coffee-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-coffee-800">{STATE_LABELS[a.state] || a.state}</p>
              {state_log.length > 0 && (
                <p className="text-xs text-coffee-500 mt-0.5">
                  by {state_log[state_log.length-1].transitioned_by_name} · {fmtDate(state_log[state_log.length-1].transitioned_at)}
                </p>
              )}
            </div>
            {!isArchived && NEXT_LABELS[a.state] && isAdmin && (
              <button onClick={openTransitionModal}
                className="px-4 py-2 bg-coffee-700 text-white rounded-md text-sm font-semibold hover:bg-coffee-800">
                Move to: {NEXT_LABELS[a.state]}
              </button>
            )}
            {isArchived && <p className="text-sm text-coffee-400">This allocation is sealed.</p>}
          </div>
        </div>

        {/* Requests panel */}
        <div className="bg-white border border-coffee-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-coffee-800">Requests</h2>
            <div className="flex gap-2">
              {!isArchived && isAdmin && a.state === 'open_for_requests' && (
                <>
                  <button onClick={() => setReqOpen(p => !p)}
                    className="px-3 py-1.5 bg-coffee-700 text-white rounded text-xs font-semibold hover:bg-coffee-800">
                    + Add Request
                  </button>
                  <Link to={`/allocations/${id}/add-request`}
                    className="px-3 py-1.5 border border-coffee-300 text-coffee-700 rounded text-xs font-semibold hover:bg-coffee-50">
                    Quick Add →
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Inline request form */}
          {reqOpen && (
            <form onSubmit={addRequest} className="bg-coffee-50 rounded-lg p-3 mb-4 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input value={reqForm.contact_name} placeholder="Contact name *"
                  onChange={e => setReqForm(p => ({ ...p, contact_name: e.target.value }))}
                  className="border border-coffee-300 rounded px-2 py-1.5 text-sm" required />
                <input value={reqForm.contact_method} placeholder="WhatsApp / @handle / email *"
                  onChange={e => setReqForm(p => ({ ...p, contact_method: e.target.value }))}
                  className="border border-coffee-300 rounded px-2 py-1.5 text-sm" required />
                <select value={reqForm.channel}
                  onChange={e => setReqForm(p => ({ ...p, channel: e.target.value }))}
                  className="border border-coffee-300 rounded px-2 py-1.5 text-sm">
                  {['WhatsApp','Instagram','Website','In_Person','Other'].map(c => <option key={c}>{c}</option>)}
                </select>
                <input type="number" min={1} value={reqForm.quantity_bags} placeholder="# bags *"
                  onChange={e => setReqForm(p => ({ ...p, quantity_bags: parseInt(e.target.value) }))}
                  className="border border-coffee-300 rounded px-2 py-1.5 text-sm" required />
              </div>
              <input value={reqForm.notes} placeholder="Notes (optional)"
                onChange={e => setReqForm(p => ({ ...p, notes: e.target.value }))}
                className="w-full border border-coffee-300 rounded px-2 py-1.5 text-sm" />
              {reqError && <p className="text-red-600 text-xs">{reqError}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={reqSaving}
                  className="px-4 py-1.5 bg-coffee-700 text-white rounded text-sm font-semibold disabled:opacity-50">
                  {reqSaving ? 'Saving…' : 'Add'}
                </button>
                <button type="button" onClick={() => setReqOpen(false)}
                  className="px-4 py-1.5 bg-gray-200 rounded text-sm">Cancel</button>
              </div>
            </form>
          )}

          {/* Bag progress */}
          <div className="mb-3">
            <p className="text-xs text-coffee-500 mb-1">{confirmed_bags} bags confirmed of {projected_bags} projected</p>
            <div className="w-full h-2 bg-coffee-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${bagColor}`} style={{ width: `${bagPct}%` }} />
            </div>
          </div>

          {requests.length === 0 ? (
            <p className="text-sm text-coffee-400">No requests yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-coffee-500 border-b border-coffee-100">
                <th className="text-left py-1">Contact</th>
                <th className="text-left py-1">Channel</th>
                <th className="text-right py-1">Bags</th>
                <th className="text-left py-1 pl-3">Status</th>
                {isAdmin && !isArchived && <th />}
              </tr></thead>
              <tbody>
                {requests.map(r => (
                  <tr key={r.id} className="border-b border-coffee-50">
                    <td className="py-1.5">{r.contact_name}</td>
                    <td className="py-1.5">
                      <span className="text-xs bg-coffee-100 text-coffee-700 px-1.5 py-0.5 rounded">{r.channel.replace('_',' ')}</span>
                    </td>
                    <td className="py-1.5 text-right font-semibold">{r.quantity_bags}</td>
                    <td className="py-1.5 pl-3">
                      <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${STATUS_COLORS[r.status]||''}`}>{r.status}</span>
                      {rowErrors[r.id] && <p className="text-xs text-red-600 mt-0.5">{rowErrors[r.id]}</p>}
                    </td>
                    {isAdmin && !isArchived && (
                      <td className="py-1.5 text-right">
                        {r.status === 'pending' && (
                          <button onClick={() => updateReqStatus(r.id, 'confirmed')}
                            className="text-xs text-green-600 hover:underline">Confirm</button>
                        )}
                        {r.status === 'confirmed' && (
                          <button onClick={() => updateReqStatus(r.id, 'fulfilled')}
                            className="text-xs text-blue-600 hover:underline">Fulfil</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Production Roast Sessions */}
        <div className="bg-white border border-coffee-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-coffee-800">Production Roast Sessions</h2>
            {a.state === 'roasting_in_progress' && isAdmin && (
              <Link to={`/roast/new?allocation_id=${a.id}`}
                className="px-3 py-1.5 bg-coffee-700 text-white rounded text-xs font-semibold hover:bg-coffee-800">
                + Start Production Roast
              </Link>
            )}
          </div>
          {roast_sessions.length === 0 ? (
            <p className="text-sm text-coffee-400">No production roast sessions logged yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-coffee-500 border-b border-coffee-100">
                <th className="text-left py-1">Batch</th>
                <th className="text-left py-1">Status</th>
                <th className="text-right py-1">Eject °C</th>
                <th className="text-right py-1">DTR%</th>
                <th className="text-center py-1">⚠</th>
              </tr></thead>
              <tbody>
                {roast_sessions.map(s => (
                  <tr key={s.batch_code} className="border-b border-coffee-50 cursor-pointer hover:bg-coffee-50"
                    onClick={() => navigate(`/roast/${s.id}`)}>
                    <td className="py-1.5 font-mono text-xs">{s.batch_code}</td>
                    <td className="py-1.5">
                      <span className="text-xs bg-coffee-100 text-coffee-700 px-1.5 py-0.5 rounded">
                        {s.status.replace(/_/g,' ')}
                      </span>
                    </td>
                    <td className="py-1.5 text-right">{s.eject_temp_c || '—'}</td>
                    <td className="py-1.5 text-right">{s.dtr ? `${s.dtr}%` : '—'}</td>
                    <td className="py-1.5 text-center">{s.variance_flagged ? '⚠' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Dispatch date */}
        <div className="bg-white border border-coffee-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-coffee-800 mb-1">Dispatch Date</h2>
          {dispatch_date ? (
            <p className="text-sm text-coffee-700">
              Earliest dispatch: <strong>{dispatch_date}</strong> ({REST_DAYS_MAP[a.process] || 7} days rest for {a.process})
            </p>
          ) : (
            <p className="text-sm text-coffee-400">Calculated once roast sessions are complete.</p>
          )}
        </div>

        {/* Label link */}
        {['resting', 'dispatched'].includes(a.state) && (
          <div className="bg-white border border-coffee-200 rounded-lg p-4 flex items-center justify-between">
            <span className="text-sm text-coffee-700">Bag Label</span>
            <Link to={`/labels/${a.id}`} className="px-4 py-2 bg-coffee-700 text-white rounded text-sm font-semibold hover:bg-coffee-800">
              View Label →
            </Link>
          </div>
        )}

        {/* State history */}
        <div className="bg-white border border-coffee-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-coffee-800 mb-3">State History</h2>
          {state_log.length === 0 ? (
            <p className="text-sm text-coffee-400">No transitions yet.</p>
          ) : (
            <ul className="space-y-2">
              {state_log.map(entry => (
                <li key={entry.id} className="text-xs text-coffee-600">
                  <span className="font-medium capitalize">{(entry.from_state||'—').replace(/_/g,' ')}</span>
                  {' → '}
                  <span className="font-medium capitalize">{entry.to_state.replace(/_/g,' ')}</span>
                  {' · '}{entry.transitioned_by_name}
                  {' · '}{fmtDate(entry.transitioned_at)}
                  {entry.notes && <span className="text-coffee-400"> · {entry.notes}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Journal Entries */}
        <div className="bg-white border border-coffee-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-coffee-800 mb-3">Journal Entries</h2>
          {journalLoading ? (
            <p className="text-sm text-coffee-400">Loading…</p>
          ) : (
            <>
              {JOURNAL_DOC_TYPES.map(t => {
                const doc = journalDocs?.[t];
                const status = doc?.status || 'missing';
                return (
                  <div key={t} className="flex items-center justify-between py-2 border-b border-coffee-50 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-coffee-700">{JOURNAL_DOC_LABELS[t]}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${JOURNAL_STATUS_STYLES[status]}`}>
                        {JOURNAL_STATUS_LABELS[status]}
                      </span>
                    </div>
                    {doc?.id ? (
                      <Link
                        to={`/journal/${id}/${t}`}
                        className="text-xs px-2 py-1 border border-coffee-300 text-coffee-700 rounded hover:bg-coffee-50"
                      >
                        Open
                      </Link>
                    ) : (
                      <span className="text-xs text-coffee-300">—</span>
                    )}
                  </div>
                );
              })}
              {JOURNAL_DOC_TYPES.every(t => !journalDocs?.[t]?.id) && (
                <div className="mt-3">
                  <button
                    onClick={generateJournalDrafts}
                    disabled={journalGenerating}
                    className="px-3 py-1.5 bg-coffee-700 text-white rounded text-xs font-semibold hover:bg-coffee-800 disabled:opacity-50"
                  >
                    {journalGenerating ? 'Generating…' : 'Generate journal drafts'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Transition modal */}
      {transitionModal && transitionChecks && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-coffee-900 mb-4">
              Move to: {STATE_LABELS[transitionChecks.next_state] || transitionChecks.next_state}
            </h2>
            {transitionChecks.checks.length > 0 && (
              <ul className="space-y-2 mb-4">
                {transitionChecks.checks.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className={c.passed ? 'text-green-600' : 'text-red-600'}>
                      {c.passed ? '✓' : '✗'}
                    </span>
                    <span>
                      <span className="font-medium">{c.label}</span>
                      {!c.passed && c.reason && (
                        <span className="block text-xs text-red-600 mt-0.5">{c.reason}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {allChecksPassed && (
              <textarea
                value={transNotes}
                onChange={e => setTransNotes(e.target.value)}
                placeholder="Notes (optional)…"
                rows={2}
                className="w-full border border-coffee-300 rounded px-3 py-2 text-sm mb-4"
              />
            )}
            {transError && <p className="text-red-600 text-sm mb-3">{transError}</p>}
            <div className="flex gap-3">
              <button
                onClick={confirmTransition}
                disabled={!allChecksPassed || transSaving}
                className="flex-1 py-2 bg-coffee-700 text-white rounded font-semibold text-sm disabled:opacity-40"
              >
                {transSaving ? 'Moving…' : 'Confirm Transition'}
              </button>
              <button onClick={() => setTransitionModal(false)} className="px-4 py-2 bg-gray-200 rounded font-semibold text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
