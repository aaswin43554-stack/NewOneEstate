import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Button, StatusBadge, ProcessBadge, FormInput } from '../../components/ui';

const TZ = 'Asia/Vientiane';

const JOURNAL_DOC_TYPES  = ['field_notes', 'roast_log', 'cupping_record', 'allocation_record'];
const JOURNAL_DOC_LABELS = {
  field_notes: 'Field Notes', roast_log: 'Roast Log',
  cupping_record: 'Cupping Record', allocation_record: 'Allocation Record',
};
const JOURNAL_STATUS_MAP = {
  draft:        { status: 'draft',        label: 'Draft' },
  under_review: { status: 'under_review', label: 'Under Review' },
  published:    { status: 'published',    label: 'Published' },
  missing:      { status: 'missing',      label: 'Missing' },
};

const STATE_LABELS = {
  upcoming:             'Upcoming',
  open_for_requests:    'Open for Requests',
  roasting_in_progress: 'Roasting in Progress',
  allocation_closed:    'Allocation Closed',
};

const STATE_TO_STATUS = {
  upcoming:             'draft',
  open_for_requests:    'published',
  roasting_in_progress: 'under_review',
  allocation_closed:    'draft',
};

const NEXT_LABELS = {
  upcoming:             'Open for Requests',
  open_for_requests:    'Start Roasting',
  roasting_in_progress: 'Close Allocation',
};

const REQUEST_STATUS_MAP = {
  pending:   { cls: 'badge-draft',        label: 'Pending' },
  confirmed: { cls: 'badge-published',    label: 'Confirmed' },
  fulfilled: { cls: 'badge-under-review', label: 'Fulfilled' },
};

const REST_DAYS_MAP = { Washed: 4, Honey: 5, Natural: 7, Anaerobic: 7 };

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' });
}

// A DATE column comes back from the API as a TZ-shifted UTC timestamp (node-pg
// parses it at the server's local midnight), so a naive .split('T')[0] can land a
// day early and silently shift the date back on save. Render it in the app's
// timezone to get the correct YYYY-MM-DD for a date input.
function toInputDate(v) {
  if (!v) return '';
  return new Date(v).toLocaleDateString('en-CA', { timeZone: TZ });
}

export default function AllocationDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [data,             setData]             = useState(null);
  const [loading,          setLoading]          = useState(true);
  const [transitionModal,  setTransitionModal]  = useState(false);
  const [transitionChecks, setTransitionChecks] = useState(null);
  const [transNotes,       setTransNotes]       = useState('');
  const [transSaving,      setTransSaving]      = useState(false);
  const [transError,       setTransError]       = useState('');
  const [reqForm, setReqForm] = useState({ contact_id: '', quantity_bags: 1, notes: '' });
  const [contacts,      setContacts]      = useState([]);
  const [reqOpen,       setReqOpen]       = useState(false);
  const [reqSaving,     setReqSaving]     = useState(false);
  const [reqError,      setReqError]      = useState('');
  const [rowErrors,     setRowErrors]     = useState({});
  const [rowActioning,  setRowActioning]  = useState({});
  const [editingReq,    setEditingReq]    = useState(null);
  const [editReqSaving, setEditReqSaving] = useState(false);

  // Allocation edit modal
  const [editOpen,   setEditOpen]   = useState(false);
  const [editFields, setEditFields] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError,  setEditError]  = useState('');

  // Allocation delete
  const [deleteOpen,   setDeleteOpen]   = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting,     setDeleting]     = useState(false);
  const [deleteError,  setDeleteError]  = useState('');

  // Archive
  const [archiving,   setArchiving]   = useState(false);
  const [archiveError, setArchiveError] = useState('');

  const [journalDocs,       setJournalDocs]       = useState(null);
  const [journalLoading,    setJournalLoading]    = useState(false);
  const [journalGenerating, setJournalGenerating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setRowErrors({});
    api.get(`/allocations/${id}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(load, [load]);

  // Contacts list — requests are created by pulling a contact from here.
  useEffect(() => {
    api.get('/contacts')
      .then(r => r.json())
      .then(d => setContacts(d.contacts || []))
      .catch(() => setContacts([]));
  }, []);

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
    if (!reqForm.contact_id) { setReqError('Please select a contact.'); return; }
    const bags = parseInt(reqForm.quantity_bags, 10);
    if (!Number.isInteger(bags) || bags < 1) { setReqError('Enter a valid number of bags.'); return; }
    setReqSaving(true); setReqError('');
    const res = await api.post(`/allocations/${id}/requests`, {
      contact_id:    reqForm.contact_id,
      quantity_bags: bags,
      notes:         reqForm.notes || undefined,
    });
    const d = await res.json();
    if (res.ok) {
      setReqOpen(false);
      setReqForm({ contact_id: '', quantity_bags: 1, notes: '' });
      load();
    } else { setReqError(d.error || 'Failed.'); }
    setReqSaving(false);
  }

  async function updateReqStatus(reqId, status) {
    setRowActioning(p => ({ ...p, [reqId]: true }));
    setRowErrors(p => ({ ...p, [reqId]: null }));
    const res = await api.put(`/allocations/${id}/requests/${reqId}`, { status });
    const d = await res.json();
    if (res.ok) { load(); }
    else { setRowErrors(p => ({ ...p, [reqId]: d.error })); }
    setRowActioning(p => ({ ...p, [reqId]: false }));
  }

  async function saveReqEdit(reqId) {
    setEditReqSaving(true);
    const bags = parseInt(editingReq.quantity_bags);
    if (!bags || bags < 1) { setRowErrors(p => ({ ...p, [reqId]: 'Enter at least 1 bag.' })); setEditReqSaving(false); return; }
    const res = await api.put(`/allocations/${id}/requests/${reqId}`, { quantity_bags: bags });
    const d = await res.json();
    if (res.ok) { setEditingReq(null); load(); }
    else { setRowErrors(p => ({ ...p, [reqId]: d.error })); }
    setEditReqSaving(false);
  }

  async function deleteReq(reqId) {
    if (!window.confirm('Delete this request?')) return;
    setRowActioning(p => ({ ...p, [reqId]: true }));
    const res = await api.delete(`/allocations/${id}/requests/${reqId}`);
    const d = await res.json().catch(() => ({}));
    if (res.ok) { load(); }
    else { setRowErrors(p => ({ ...p, [reqId]: d.error || 'Failed to delete.' })); }
    setRowActioning(p => ({ ...p, [reqId]: false }));
  }

  function openEdit() {
    const a = data?.allocation;
    if (!a) return;
    setEditFields({
      allocation_code:           a.allocation_code || '',
      estate:                    a.estate || '',
      planned_green_quantity_g:  a.planned_green_quantity_g ? (a.planned_green_quantity_g / 1000).toFixed(2) : '',
      planned_bag_size_g:        a.planned_bag_size_g || '',
      window_open_date:          toInputDate(a.window_open_date),
      window_close_date:         toInputDate(a.window_close_date),
      projected_bags_override:   a.projected_bags_override != null ? String(a.projected_bags_override) : '',
    });
    setEditError('');
    setEditOpen(true);
  }

  async function saveEdit(e) {
    e.preventDefault();
    setEditSaving(true); setEditError('');
    const body = {
      allocation_code:           editFields.allocation_code || undefined,
      estate:                    editFields.estate || undefined,
      planned_green_quantity_g:  editFields.planned_green_quantity_g
        ? Math.round(parseFloat(editFields.planned_green_quantity_g) * 1000) : undefined,
      planned_bag_size_g:        editFields.planned_bag_size_g ? parseInt(editFields.planned_bag_size_g) : undefined,
      window_open_date:          editFields.window_open_date  || undefined,
      window_close_date:         editFields.window_close_date || undefined,
      projected_bags_override:   editFields.projected_bags_override !== ''
        ? parseInt(editFields.projected_bags_override) : null,
    };
    const res = await api.put(`/allocations/${id}`, body);
    const d   = await res.json();
    if (res.ok) { setEditOpen(false); load(); }
    else { setEditError(d.error || 'Failed to update.'); }
    setEditSaving(false);
  }

  async function confirmDelete() {
    setDeleting(true); setDeleteError('');
    const res = await api.delete(`/allocations/${id}`);
    const d   = await res.json();
    if (res.ok) { navigate('/allocations'); }
    else { setDeleteError(d.error || 'Failed to delete.'); setDeleting(false); }
  }

  async function archiveAllocation() {
    setArchiving(true); setArchiveError('');
    const res = await api.put(`/allocations/${id}/archive`, {});
    const d   = await res.json();
    if (res.ok) { load(); }
    else { setArchiveError(d.error || 'Failed to archive.'); }
    setArchiving(false);
  }

  async function unarchiveAllocation() {
    setArchiving(true); setArchiveError('');
    const res = await api.put(`/allocations/${id}/unarchive`, {});
    const d   = await res.json();
    if (res.ok) { load(); }
    else { setArchiveError(d.error || 'Failed to unarchive.'); setArchiving(false); }
  }

  if (loading) return <Layout><div className="px-6 py-6 text-sm text-coffee-400">Loading…</div></Layout>;
  if (!data)   return <Layout><div className="px-6 py-6 text-sm" style={{ color: '#A32D2D' }}>Allocation not found.</div></Layout>;

  const { allocation: a, lot, lots = [], requests, state_log, roast_sessions, dispatch_date, projected_bags, confirmed_bags } = data;
  const isClosed   = a.state === 'allocation_closed';
  const isArchived = !!a.archived_at;
  const isAdmin    = ['admin', 'roaster'].includes(user?.role);
  const bagPct    = projected_bags > 0 ? Math.min(100, Math.round((confirmed_bags / projected_bags) * 100)) : 0;
  const bagBarColor = bagPct >= 100 ? '#A32D2D' : bagPct >= 90 ? '#BA7517' : '#3B6D11';
  const allChecksPassed = transitionChecks?.checks?.every(c => c.passed) ?? true;

  // Can add requests while upcoming/open, or admin while roasting
  const canAddRequests = !isClosed && isAdmin &&
    (a.state === 'upcoming' ||
     a.state === 'open_for_requests' ||
     (a.state === 'roasting_in_progress' && user?.role === 'admin'));

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl text-coffee-900" style={{ fontWeight: 500 }}>{a.allocation_code}</h1>
          <ProcessBadge process={a.process} />
          <span className="text-sm text-coffee-400">{a.harvest_year}</span>
          <StatusBadge
            status={STATE_TO_STATUS[a.state] || 'draft'}
            label={STATE_LABELS[a.state] || a.state}
          />
          {a.source === 'one_estate' && (
            <span
              className="text-xs px-2 py-0.5 rounded"
              style={{ background: '#EAF3DE', color: '#3B6D11' }}
            >
              Synced from One Estate
            </span>
          )}
          <div className="ml-auto flex gap-2">
            {isAdmin && !isClosed && (
              <button
                onClick={openEdit}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors"
                style={{ borderColor: '#E0D0BC', color: '#8B6A47' }}
              >
                <Pencil size={12} /> Edit
              </button>
            )}
            {/* Delete is available to admins in any state, including closed. */}
            {user?.role === 'admin' && (
              <button
                onClick={() => { setDeleteConfirm(''); setDeleteError(''); setDeleteOpen(true); }}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors"
                style={{ borderColor: '#F3C0C0', color: '#A32D2D' }}
              >
                <Trash2 size={12} /> Delete
              </button>
            )}
            {user?.role === 'admin' && isClosed && !isArchived && (
              <button
                onClick={archiveAllocation}
                disabled={archiving}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50"
                style={{ borderColor: '#E0D0BC', color: '#8B6A47' }}
              >
                {archiving ? '…' : 'Archive'}
              </button>
            )}
            {user?.role === 'admin' && isArchived && (
              <button
                onClick={unarchiveAllocation}
                disabled={archiving}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50"
                style={{ borderColor: '#E0D0BC', color: '#8B6A47' }}
              >
                {archiving ? '…' : 'Unarchive'}
              </button>
            )}
          </div>
        </div>

        {/* State transition */}
        <div className="bg-white border border-coffee-200 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-coffee-800" style={{ fontWeight: 500 }}>
                {STATE_LABELS[a.state] || a.state}
              </p>
              {state_log.length > 0 && (
                <p className="text-xs text-coffee-400 mt-0.5">
                  by {state_log[state_log.length - 1].transitioned_by_name}
                  {' · '}{fmtDate(state_log[state_log.length - 1].transitioned_at)}
                </p>
              )}
            </div>
            {!isClosed && NEXT_LABELS[a.state] && isAdmin && (
              <Button onClick={openTransitionModal}>
                Move to: {NEXT_LABELS[a.state]}
              </Button>
            )}
            {archiveError && <p className="text-xs" style={{ color: '#A32D2D' }}>{archiveError}</p>}
          {isClosed && !isArchived && <p className="text-xs text-coffee-400">This allocation is closed.</p>}
          {isArchived && (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: '#F2EAE0', color: '#8B6A47' }}
            >
              Archived
            </span>
          )}
          </div>
        </div>

        {/* Source lots */}
        {lots.length > 0 && (
          <div className="bg-white border border-coffee-200 rounded-xl p-5">
            <p className="text-xs text-coffee-400 uppercase tracking-wide mb-3">
              Source {lots.length > 1 ? 'Lots' : 'Lot'}
            </p>
            <div className="space-y-2">
              {lots.map(l => (
                <div key={l.lot_id} className="flex items-center justify-between text-sm">
                  <Link
                    to={`/inventory/${l.lot_id}`}
                    className="text-coffee-800 hover:text-coffee-900 transition-colors"
                  >
                    <span style={{ fontWeight: 500 }}>{l.lot_code}</span>
                    <span className="text-coffee-400">  · {l.process} · {l.harvest_year}</span>
                  </Link>
                  <span className="text-coffee-600 tabular-nums">
                    {(l.green_quantity_g / 1000).toFixed(2)} kg
                  </span>
                </div>
              ))}
            </div>
            {lots.length > 1 && (
              <div className="flex items-center justify-between text-sm mt-3 pt-3" style={{ borderTop: '1px solid #F2EAE0' }}>
                <span className="text-coffee-400 uppercase tracking-wide text-xs">Total green</span>
                <span className="text-coffee-800 tabular-nums" style={{ fontWeight: 500 }}>
                  {(a.planned_green_quantity_g / 1000).toFixed(2)} kg
                </span>
              </div>
            )}
          </div>
        )}

        {/* Requests */}
        <div className="bg-white border border-coffee-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-coffee-400 uppercase tracking-wide">Requests</p>
            <div className="flex gap-2">
              {canAddRequests && (
                <>
                  <Button variant="secondary" size="sm" onClick={() => setReqOpen(p => !p)}>
                    + Add Request
                  </Button>
                  <Link to={`/allocations/${id}/add-request`}>
                    <Button variant="ghost" size="sm">Quick Add</Button>
                  </Link>
                  {a.state === 'roasting_in_progress' && (
                    <span className="text-xs text-coffee-400 italic">
                      Admin late add
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          {reqOpen && (
            <form onSubmit={addRequest} className="rounded-xl p-4 mb-4 space-y-3" style={{ background: '#FAF6F0', border: '1px solid #F2EAE0' }}>
              {contacts.length === 0 ? (
                <p className="text-sm text-coffee-500">
                  No contacts yet.{' '}
                  <Link to="/contacts/new" className="underline" style={{ color: '#3B6D11' }}>
                    Add a contact
                  </Link>{' '}
                  first, then pull them into a request.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-[1fr_120px] gap-3">
                    <div>
                      <label className="block text-xs text-coffee-500 mb-1">Contact *</label>
                      <select
                        value={reqForm.contact_id}
                        onChange={e => setReqForm(p => ({ ...p, contact_id: e.target.value }))}
                        className="w-full h-9 px-3 text-sm border border-coffee-200 rounded-lg bg-white"
                        required
                      >
                        <option value="">Select from contacts…</option>
                        {contacts.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}{c.market_segment ? ` · ${c.market_segment}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-coffee-500 mb-1"># Bags *</label>
                      <input
                        type="number"
                        min={1}
                        value={reqForm.quantity_bags}
                        onChange={e => setReqForm(p => ({ ...p, quantity_bags: e.target.value }))}
                        className="w-full h-9 px-3 text-sm border border-coffee-200 rounded-lg"
                        required
                      />
                    </div>
                  </div>
                  {(() => {
                    const c = contacts.find(x => x.id === reqForm.contact_id);
                    return c ? (
                      <p className="text-xs text-coffee-400">
                        {c.primary_contact_method || 'No contact method on file'}
                        {c.preferred_channel ? ` · via ${c.preferred_channel}` : ''}
                      </p>
                    ) : null;
                  })()}
                  <input
                    value={reqForm.notes}
                    placeholder="Notes (optional)"
                    onChange={e => setReqForm(p => ({ ...p, notes: e.target.value }))}
                    className="w-full h-9 px-3 text-sm border border-coffee-200 rounded-lg"
                  />
                  {reqError && <p className="text-xs" style={{ color: '#A32D2D' }}>{reqError}</p>}
                  <div className="flex gap-2">
                    <Button type="submit" disabled={reqSaving || !reqForm.contact_id} size="sm">
                      {reqSaving ? 'Saving…' : 'Add'}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setReqOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                </>
              )}
            </form>
          )}

          <div className="mb-4">
            <p className="text-xs text-coffee-400 mb-1.5">
              {confirmed_bags} bags confirmed of {projected_bags} projected
              {a.projected_bags_override != null && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded text-xs" style={{ background: '#EAF3DE', color: '#3B6D11' }}>
                  override
                </span>
              )}
            </p>
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: '#F2EAE0' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${bagPct}%`, background: bagBarColor }}
              />
            </div>
          </div>

          {requests.length === 0 ? (
            <p className="text-sm text-coffee-300">No requests yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid #F2EAE0' }}>
                  <th className="text-left py-2 text-coffee-400 uppercase tracking-wide">Contact</th>
                  <th className="text-left py-2 text-coffee-400 uppercase tracking-wide">Channel</th>
                  <th className="text-right py-2 text-coffee-400 uppercase tracking-wide">Bags</th>
                  <th className="text-left py-2 pl-3 text-coffee-400 uppercase tracking-wide">Status</th>
                  {isAdmin && !isClosed && <th />}
                </tr>
              </thead>
              <tbody>
                {requests.map(r => {
                  const reqMeta = REQUEST_STATUS_MAP[r.status] || { cls: 'badge-draft', label: r.status };
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid #F2EAE0' }}>
                      <td className="py-2 text-coffee-700">{r.contact_name}</td>
                      <td className="py-2">
                        <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: '#F2EAE0', color: '#8B6A47' }}>
                          {r.channel.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        {isAdmin && !isClosed && editingReq?.id === r.id ? (
                          <input
                            type="number" min={1}
                            value={editingReq.quantity_bags}
                            onChange={e => setEditingReq(p => ({ ...p, quantity_bags: e.target.value }))}
                            className="w-16 h-7 px-2 text-sm text-right border border-coffee-400 rounded-lg"
                            autoFocus
                          />
                        ) : (
                          <span className="text-coffee-900" style={{ fontWeight: 500 }}>{r.quantity_bags}</span>
                        )}
                      </td>
                      <td className="py-2 pl-3">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full capitalize ${reqMeta.cls}`}>
                          {reqMeta.label}
                        </span>
                        {rowErrors[r.id] && (
                          <p className="text-xs mt-0.5" style={{ color: '#A32D2D' }}>{rowErrors[r.id]}</p>
                        )}
                      </td>
                      {isAdmin && !isClosed && (
                        <td className="py-2 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-3">
                            {editingReq?.id === r.id ? (
                              <>
                                <button onClick={() => saveReqEdit(r.id)} disabled={editReqSaving} className="text-xs disabled:opacity-40" style={{ color: '#3B6D11' }}>
                                  {editReqSaving ? '…' : 'Save'}
                                </button>
                                <button onClick={() => setEditingReq(null)} className="text-xs text-coffee-400">Cancel</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => setEditingReq({ id: r.id, quantity_bags: r.quantity_bags })} className="text-xs text-coffee-400 hover:text-coffee-700 transition-colors">
                                  Edit
                                </button>
                                {r.status === 'pending' && (
                                  <button onClick={() => updateReqStatus(r.id, 'confirmed')} disabled={!!rowActioning[r.id]} className="text-xs transition-colors disabled:opacity-40" style={{ color: '#3B6D11' }}>
                                    {rowActioning[r.id] ? '…' : 'Confirm'}
                                  </button>
                                )}
                                {r.status === 'confirmed' && (
                                  <button onClick={() => updateReqStatus(r.id, 'fulfilled')} disabled={!!rowActioning[r.id]} className="text-xs transition-colors disabled:opacity-40" style={{ color: '#185FA5' }}>
                                    {rowActioning[r.id] ? '…' : 'Fulfil'}
                                  </button>
                                )}
                                <button onClick={() => deleteReq(r.id)} disabled={!!rowActioning[r.id]} className="text-xs transition-colors disabled:opacity-40" style={{ color: '#A32D2D' }}>
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Production Roast Sessions */}
        <div className="bg-white border border-coffee-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-coffee-400 uppercase tracking-wide">Production Roast Sessions</p>
            {a.state === 'roasting_in_progress' && isAdmin && (
              <Link to={`/roast/new?allocation_id=${a.id}`}>
                <Button size="sm">+ Start Production Roast</Button>
              </Link>
            )}
          </div>
          {roast_sessions.length === 0 ? (
            <p className="text-sm text-coffee-300">No production roast sessions logged yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid #F2EAE0' }}>
                  <th className="text-left py-2 text-coffee-400 uppercase tracking-wide">Batch</th>
                  <th className="text-left py-2 text-coffee-400 uppercase tracking-wide">Status</th>
                  <th className="text-right py-2 text-coffee-400 uppercase tracking-wide">Eject °C</th>
                  <th className="text-right py-2 text-coffee-400 uppercase tracking-wide">DTR%</th>
                  <th className="text-center py-2 text-coffee-400">⚠</th>
                </tr>
              </thead>
              <tbody>
                {roast_sessions.map(s => (
                  <tr key={s.batch_code} className="cursor-pointer" style={{ borderBottom: '1px solid #F2EAE0' }} onClick={() => navigate(`/roast/${s.id}`)}>
                    <td className="py-2 font-mono text-coffee-800">{s.batch_code}</td>
                    <td className="py-2">
                      <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: '#F2EAE0', color: '#8B6A47' }}>
                        {s.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-2 text-right text-coffee-700">{s.eject_temp_c || '—'}</td>
                    <td className="py-2 text-right text-coffee-700">{s.dtr ? `${s.dtr}%` : '—'}</td>
                    <td className="py-2 text-center" style={{ color: s.variance_flagged ? '#BA7517' : 'transparent' }}>⚠</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Dispatch date */}
        <div className="bg-white border border-coffee-200 rounded-xl p-5">
          <p className="text-xs text-coffee-400 uppercase tracking-wide mb-2">Dispatch Date</p>
          {dispatch_date ? (
            <p className="text-sm text-coffee-700">
              Earliest: <span style={{ fontWeight: 500 }}>{dispatch_date}</span>
              <span className="text-coffee-400 ml-1">({REST_DAYS_MAP[a.process] || 7} days rest for {a.process})</span>
            </p>
          ) : (
            <p className="text-sm text-coffee-300">Calculated once roast sessions are complete.</p>
          )}
        </div>

        {/* Label link */}
        {(a.state === 'roasting_in_progress' || a.state === 'allocation_closed') && (
          <div className="bg-white border border-coffee-200 rounded-xl p-5 flex items-center justify-between">
            <p className="text-sm text-coffee-700">Bag Label</p>
            <Link to={`/labels/${a.id}`}>
              <Button variant="secondary" size="sm">View Label</Button>
            </Link>
          </div>
        )}

        {/* State history */}
        <div className="bg-white border border-coffee-200 rounded-xl p-5">
          <p className="text-xs text-coffee-400 uppercase tracking-wide mb-3">State History</p>
          {state_log.length === 0 ? (
            <p className="text-sm text-coffee-300">No transitions yet.</p>
          ) : (
            <ul className="space-y-2">
              {state_log.map(entry => (
                <li key={entry.id} className="text-xs text-coffee-500">
                  <span className="text-coffee-700" style={{ fontWeight: 500 }}>
                    {(entry.from_state || '—').replace(/_/g, ' ')}
                  </span>
                  {' → '}
                  <span className="text-coffee-700" style={{ fontWeight: 500 }}>
                    {entry.to_state.replace(/_/g, ' ')}
                  </span>
                  {' · '}{entry.transitioned_by_name || 'system'}
                  {' · '}{fmtDate(entry.transitioned_at)}
                  {entry.notes && <span className="text-coffee-400"> · {entry.notes}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Journal Entries */}
        <div className="bg-white border border-coffee-200 rounded-xl p-5">
          <p className="text-xs text-coffee-400 uppercase tracking-wide mb-3">Journal Entries</p>
          {journalLoading ? (
            <p className="text-sm text-coffee-400">Loading…</p>
          ) : (
            <>
              {JOURNAL_DOC_TYPES.map(t => {
                const doc    = journalDocs?.[t];
                const status = doc?.status || 'missing';
                const meta   = JOURNAL_STATUS_MAP[status] || JOURNAL_STATUS_MAP.missing;
                return (
                  <div key={t} className="flex items-center justify-between py-2.5" style={{ borderBottom: '1px solid #F2EAE0' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-coffee-700">{JOURNAL_DOC_LABELS[t]}</span>
                      <StatusBadge status={meta.status} label={meta.label} />
                    </div>
                    {doc?.id ? (
                      <Link to={`/journal/${id}/${t}`}>
                        <Button variant="ghost" size="sm">Open</Button>
                      </Link>
                    ) : (
                      <span className="text-xs text-coffee-300">—</span>
                    )}
                  </div>
                );
              })}
              {JOURNAL_DOC_TYPES.every(t => !journalDocs?.[t]?.id) && (
                <div className="mt-3">
                  <Button variant="secondary" size="sm" onClick={generateJournalDrafts} disabled={journalGenerating}>
                    {journalGenerating ? 'Generating…' : 'Generate journal drafts'}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Edit allocation modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(34,21,8,0.2)' }}>
          <div className="bg-white rounded-2xl border border-coffee-200 w-full max-w-md p-6">
            <h2 className="text-base text-coffee-900 mb-4" style={{ fontWeight: 500 }}>Edit Allocation</h2>
            {a.state === 'roasting_in_progress' && (
              <p className="text-xs mb-4 px-3 py-2 rounded-lg" style={{ background: '#FEF9E7', color: '#854D0E' }}>
                Roasting in progress — only Projected Bags can be changed.
              </p>
            )}
            <form onSubmit={saveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-coffee-500 uppercase tracking-wide mb-1.5">Allocation Code</label>
                <input
                  value={editFields.allocation_code}
                  onChange={e => setEditFields(p => ({ ...p, allocation_code: e.target.value }))}
                  className="w-full h-9 px-3 text-sm border border-coffee-200 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-coffee-500 uppercase tracking-wide mb-1.5">Estate</label>
                <input
                  value={editFields.estate}
                  disabled={a.state === 'roasting_in_progress'}
                  onChange={e => setEditFields(p => ({ ...p, estate: e.target.value }))}
                  className="w-full h-9 px-3 text-sm border border-coffee-200 rounded-lg disabled:opacity-50 disabled:bg-coffee-50"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-coffee-500 uppercase tracking-wide mb-1.5">Green Qty (kg)</label>
                  <input
                    type="number" step="0.01"
                    value={editFields.planned_green_quantity_g}
                    disabled={a.state === 'roasting_in_progress'}
                    onChange={e => setEditFields(p => ({ ...p, planned_green_quantity_g: e.target.value }))}
                    className="w-full h-9 px-3 text-sm border border-coffee-200 rounded-lg disabled:opacity-50 disabled:bg-coffee-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-coffee-500 uppercase tracking-wide mb-1.5">Bag Size (g)</label>
                  <input
                    type="number"
                    value={editFields.planned_bag_size_g}
                    disabled={a.state === 'roasting_in_progress'}
                    onChange={e => setEditFields(p => ({ ...p, planned_bag_size_g: e.target.value }))}
                    className="w-full h-9 px-3 text-sm border border-coffee-200 rounded-lg disabled:opacity-50 disabled:bg-coffee-50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-coffee-500 uppercase tracking-wide mb-1.5">Window Opens</label>
                  <input
                    type="date"
                    value={editFields.window_open_date}
                    disabled={a.state === 'roasting_in_progress'}
                    onChange={e => setEditFields(p => ({ ...p, window_open_date: e.target.value }))}
                    className="w-full h-9 px-3 text-sm border border-coffee-200 rounded-lg disabled:opacity-50 disabled:bg-coffee-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-coffee-500 uppercase tracking-wide mb-1.5">Window Closes</label>
                  <input
                    type="date"
                    value={editFields.window_close_date}
                    disabled={a.state === 'roasting_in_progress'}
                    onChange={e => setEditFields(p => ({ ...p, window_close_date: e.target.value }))}
                    className="w-full h-9 px-3 text-sm border border-coffee-200 rounded-lg disabled:opacity-50 disabled:bg-coffee-50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-coffee-500 uppercase tracking-wide mb-1.5">
                  Projected Bags Override
                </label>
                <input
                  type="number"
                  min={1}
                  placeholder={`Auto (${projected_bags} bags)`}
                  value={editFields.projected_bags_override}
                  onChange={e => setEditFields(p => ({ ...p, projected_bags_override: e.target.value }))}
                  className="w-full h-9 px-3 text-sm border border-coffee-200 rounded-lg"
                />
                <p className="text-xs text-coffee-400 mt-1">
                  Leave blank to auto-calculate · clear to reset to auto
                </p>
              </div>
              {editError && <p className="text-xs" style={{ color: '#A32D2D' }}>{editError}</p>}
              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={editSaving} className="flex-1 justify-center" style={{ background: '#3B6D11', color: '#fff' }}>
                  {editSaving ? 'Saving…' : 'Save Changes'}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete allocation modal */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(34,21,8,0.2)' }}>
          <div className="bg-white rounded-2xl border border-coffee-200 w-full max-w-sm p-6">
            <h2 className="text-base text-coffee-900 mb-2" style={{ fontWeight: 500 }}>Delete Allocation</h2>
            <p className="text-sm text-coffee-600 mb-4">
              This will permanently delete <strong>{data?.allocation?.allocation_code}</strong> and all its requests. This cannot be undone.
            </p>
            <p className="text-xs text-coffee-500 mb-2">
              Type <strong>{data?.allocation?.allocation_code}</strong> to confirm:
            </p>
            <input
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder={data?.allocation?.allocation_code}
              className="w-full h-9 px-3 text-sm border border-coffee-200 rounded-lg mb-4 font-mono"
            />
            {deleteError && <p className="text-xs mb-3" style={{ color: '#A32D2D' }}>{deleteError}</p>}
            <div className="flex gap-3">
              <Button
                onClick={confirmDelete}
                disabled={deleteConfirm !== data?.allocation?.allocation_code || deleting}
                className="flex-1 justify-center"
                variant="destructive"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </Button>
              <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Transition modal */}
      {transitionModal && transitionChecks && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(34,21,8,0.2)' }}>
          <div className="bg-white rounded-2xl border border-coffee-200 w-full max-w-md p-6">
            <div className="mb-4">
              <p className="text-xs text-coffee-400 uppercase tracking-wide mb-1">State Transition</p>
              <h2 className="text-base text-coffee-900" style={{ fontWeight: 500 }}>
                Move to: {STATE_LABELS[transitionChecks.next_state] || transitionChecks.next_state}
              </h2>
            </div>

            {transitionChecks.checks.length > 0 && (
              <ul className="space-y-3 mb-5">
                {transitionChecks.checks.map((c, i) => {
                  const fixLink = !c.passed ? {
                    'Approved roast profile': { to: '/profiles', label: `Create a ${a.process} profile` },
                    'Confirmed requests':     null,
                    'Green stock reserved':   lot ? { to: `/inventory/${lot.id}`, label: 'Go to lot inventory' } : null,
                    'Green stock available':  lot ? { to: `/inventory/${lot.id}`, label: 'Check lot inventory' } : null,
                    'All sessions approved for bagging': { to: '/roast', label: 'Go to Roast Sessions' },
                    'Bag count within yield': null,
                  }[c.label] : null;

                  return (
                    <li
                      key={i}
                      className="rounded-lg px-3 py-2.5 flex items-start gap-3"
                      style={{ background: c.passed ? '#F2FAF0' : '#FDF4F4', border: `1px solid ${c.passed ? '#C8E6C0' : '#F3C0C0'}` }}
                    >
                      <span className="mt-0.5 text-xs" style={{ color: c.passed ? '#3B6D11' : '#A32D2D', fontWeight: 600, flexShrink: 0 }}>
                        {c.passed ? '✓' : '✗'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm" style={{ color: c.passed ? '#3B6D11' : '#7A1A1A', fontWeight: 500 }}>{c.label}</p>
                        {!c.passed && c.reason && (
                          <p className="text-xs mt-0.5" style={{ color: '#A32D2D', lineHeight: 1.5 }}>{c.reason}</p>
                        )}
                        {fixLink && (
                          <Link to={fixLink.to} onClick={() => setTransitionModal(false)}
                            className="inline-flex items-center gap-1 text-xs mt-1.5 underline underline-offset-2 transition-opacity hover:opacity-70"
                            style={{ color: '#A32D2D', fontWeight: 500 }}>
                            {fixLink.label} →
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {allChecksPassed && (
              <textarea
                value={transNotes}
                onChange={e => setTransNotes(e.target.value)}
                placeholder="Notes (optional)…"
                rows={2}
                className="w-full px-3 py-2 text-sm border border-coffee-200 rounded-lg mb-4 focus:border-coffee-500 focus:ring-2 focus:ring-coffee-100 resize-none"
              />
            )}

            {transError && <p className="text-xs mb-3" style={{ color: '#A32D2D' }}>{transError}</p>}

            <div className="flex gap-3">
              <Button
                onClick={confirmTransition}
                disabled={!allChecksPassed || transSaving}
                className="flex-1 justify-center"
                style={allChecksPassed ? { background: '#3B6D11', color: '#fff' } : {}}
              >
                {transSaving ? 'Moving…' : 'Confirm Transition'}
              </Button>
              <Button variant="secondary" onClick={() => setTransitionModal(false)}>Cancel</Button>
            </div>

            {!allChecksPassed && (
              <p className="text-xs text-center mt-3 text-coffee-400">
                Resolve the items above, then return to proceed.
              </p>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
