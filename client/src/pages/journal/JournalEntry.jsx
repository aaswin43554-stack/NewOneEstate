import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';

const TZ = 'Asia/Vientiane';

const DOC_TYPES = ['field_notes', 'roast_log', 'cupping_record', 'allocation_record'];
const DOC_LABELS = {
  field_notes:       'Field Notes',
  roast_log:         'Roast Log',
  cupping_record:    'Cupping Record',
  allocation_record: 'Allocation Record',
};
const STATUS_STYLES = {
  draft:        'bg-gray-100 text-gray-600',
  under_review: 'bg-amber-100 text-amber-700',
  published:    'bg-green-100 text-green-700',
  missing:      'border border-red-300 text-red-600',
};
const STATUS_LABELS = {
  draft:        'Draft',
  under_review: 'Under Review',
  published:    'Published',
  missing:      'Missing',
};

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' });
}

function StatusBadge({ status }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_STYLES[status] || STATUS_STYLES.missing}`}>
      {STATUS_LABELS[status] || 'Missing'}
    </span>
  );
}

export default function JournalEntry() {
  const { allocation_id, type } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [actioning, setActioning] = useState(false);
  const [actionError, setActionError] = useState('');

  const [publishModal, setPublishModal] = useState(false);

  const [editPublishedModal, setEditPublishedModal] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewVersion, setViewVersion] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/journal/${allocation_id}`)
      .then(r => r.json())
      .then(d => {
        setData(d);
        const doc = d.documents?.[type];
        if (doc) setContent(doc.draft_content || doc.published_content || '');
      })
      .finally(() => setLoading(false));
  }, [allocation_id, type]);

  useEffect(load, [load]);

  const doc = data?.documents?.[type];
  const alloc = data?.allocation;
  const status = doc?.status || 'missing';
  const versions = doc?.versions || [];
  const isAdmin = user?.role === 'admin';
  const isEditor = ['admin', 'roaster'].includes(user?.role);

  async function handleBlur() {
    if (!doc?.id || status === 'published') return;
    setSaveStatus('saving');
    await api.put(`/journal/${doc.id}`, { draft_content: content });
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus(''), 2500);
  }

  async function submitForReview() {
    setActioning(true);
    setActionError('');
    const res = await api.post(`/journal/${doc.id}/submit`, {});
    if (res.ok) { load(); }
    else { const d = await res.json(); setActionError(d.error || 'Failed.'); }
    setActioning(false);
  }

  async function confirmPublish() {
    setActioning(true);
    setActionError('');
    const res = await api.post(`/journal/${doc.id}/publish`, {});
    if (res.ok) { setPublishModal(false); load(); }
    else { const d = await res.json(); setActionError(d.error || 'Failed.'); }
    setActioning(false);
  }

  function openEditPublished() {
    setEditContent(doc.published_content || '');
    setEditReason('');
    setEditError('');
    setEditPublishedModal(true);
  }

  async function submitEditPublished(e) {
    e.preventDefault();
    if (!editReason.trim()) { setEditError('Edit reason is required.'); return; }
    setEditSaving(true);
    setEditError('');
    const res = await api.put(`/journal/${doc.id}/edit-published`, { content: editContent, edit_reason: editReason });
    if (res.ok) { setEditPublishedModal(false); load(); }
    else { const d = await res.json(); setEditError(d.error || 'Failed.'); }
    setEditSaving(false);
  }

  async function deleteDraft() {
    setDeleting(true);
    await api.delete(`/journal/${doc.id}`);
    setDeleting(false);
    setDeleteModal(false);
    navigate('/journal');
  }

  if (loading) return <Layout><div className="p-6 text-coffee-600">Loading…</div></Layout>;
  if (!data || !alloc) return <Layout><div className="p-6 text-red-600">Entry not found.</div></Layout>;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto p-4 space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-coffee-900">
            {alloc.allocation_code} — {DOC_LABELS[type]}
          </h1>
          <StatusBadge status={status} />
        </div>

        {/* Cross-links panel */}
        <div className="bg-white border border-coffee-200 rounded-lg p-3">
          <p className="text-xs text-coffee-500 mb-2 font-medium uppercase tracking-wide">Also in this allocation:</p>
          <div className="flex flex-wrap gap-2">
            {DOC_TYPES.map(t => {
              const d = data.documents?.[t];
              const s = d?.status || 'missing';
              const isCurrent = t === type;
              return (
                <Link
                  key={t}
                  to={`/journal/${allocation_id}/${t}`}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-medium transition-colors ${
                    isCurrent
                      ? 'border-coffee-700 bg-coffee-700 text-white cursor-default pointer-events-none'
                      : 'border-coffee-200 bg-white text-coffee-700 hover:bg-coffee-50'
                  }`}
                >
                  {DOC_LABELS[t]}
                  {!isCurrent && <StatusBadge status={s} />}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Content area */}
        <div className="bg-white border border-coffee-200 rounded-lg p-4">
          {status === 'missing' && (
            <p className="text-sm text-coffee-400">No draft has been generated for this document yet.</p>
          )}

          {(status === 'draft' || status === 'under_review') && (
            <>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-coffee-800">Content</h2>
                <span className={`text-xs transition-opacity ${saveStatus ? 'opacity-100' : 'opacity-0'} ${
                  saveStatus === 'saved' ? 'text-green-600 font-medium' : 'text-coffee-400'
                }`}>
                  {saveStatus === 'saving' ? 'Saving…' : 'Saved'}
                </span>
              </div>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                onBlur={handleBlur}
                rows={20}
                className="w-full border border-coffee-200 rounded-md px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-coffee-400"
                placeholder="Enter content…"
              />
            </>
          )}

          {status === 'published' && (
            <>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-coffee-800">Published Content</h2>
                {isAdmin && (
                  <button
                    onClick={openEditPublished}
                    className="px-3 py-1.5 border border-coffee-300 text-coffee-700 rounded text-xs font-semibold hover:bg-coffee-50"
                  >
                    Edit Published Entry
                  </button>
                )}
              </div>
              <pre className="whitespace-pre-wrap text-sm text-coffee-800 font-mono leading-relaxed bg-coffee-50 rounded-md p-4 overflow-auto">
                {doc.published_content}
              </pre>
            </>
          )}
        </div>

        {/* Action buttons */}
        {doc?.id && (
          <div className="flex flex-wrap items-center gap-3">
            {status === 'draft' && isEditor && (
              <button
                onClick={submitForReview}
                disabled={actioning}
                className="px-4 py-2 bg-amber-600 text-white rounded-md text-sm font-semibold hover:bg-amber-700 disabled:opacity-50"
              >
                {actioning ? 'Submitting…' : 'Submit for Review'}
              </button>
            )}
            {status === 'under_review' && isAdmin && (
              <button
                onClick={() => { setActionError(''); setPublishModal(true); }}
                className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-semibold hover:bg-green-700"
              >
                Publish
              </button>
            )}
            {(status === 'draft' || status === 'under_review') && isAdmin && (
              <button
                onClick={() => setDeleteModal(true)}
                className="px-4 py-2 border border-red-300 text-red-600 rounded-md text-sm font-semibold hover:bg-red-50"
              >
                Delete Draft
              </button>
            )}
            {actionError && <p className="text-red-600 text-sm">{actionError}</p>}
          </div>
        )}

        {/* Version history */}
        {versions.length > 0 && (
          <div className="bg-white border border-coffee-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setHistoryOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-coffee-800 hover:bg-coffee-50 text-left"
            >
              <span>Edit History ({versions.length} version{versions.length !== 1 ? 's' : ''})</span>
              <span className="text-coffee-400 text-xs">{historyOpen ? '▲' : '▼'}</span>
            </button>
            {historyOpen && (
              <ul className="border-t border-coffee-100 divide-y divide-coffee-50">
                {versions.map((v, i) => (
                  <li key={v.id || i} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-xs text-coffee-700">
                    <span className="font-semibold text-coffee-500 shrink-0">v{v.version_number}</span>
                    <span className="font-medium shrink-0">{v.edited_by_name}</span>
                    <span className="text-coffee-400 shrink-0">{fmtDate(v.edited_at)}</span>
                    <span className="text-coffee-500 italic truncate flex-1 min-w-0">{v.edit_reason}</span>
                    <button
                      onClick={() => setViewVersion(v)}
                      className="px-2 py-0.5 bg-coffee-100 text-coffee-700 rounded hover:bg-coffee-200 shrink-0"
                    >
                      View
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Publish confirmation modal */}
      {publishModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-coffee-900 mb-2">Publish Entry</h2>
            <p className="text-sm text-coffee-600 mb-5">Publishing is permanent. Proceed?</p>
            {actionError && <p className="text-red-600 text-sm mb-3">{actionError}</p>}
            <div className="flex gap-3">
              <button
                onClick={confirmPublish}
                disabled={actioning}
                className="flex-1 py-2 bg-green-600 text-white rounded font-semibold text-sm disabled:opacity-50"
              >
                {actioning ? 'Publishing…' : 'Publish'}
              </button>
              <button
                onClick={() => setPublishModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded font-semibold text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit published modal */}
      {editPublishedModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6">
            <h2 className="text-lg font-bold text-coffee-900 mb-4">Edit Published Entry</h2>
            <form onSubmit={submitEditPublished} className="space-y-4">
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                rows={14}
                className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm font-mono resize-y"
              />
              <div>
                <label className="block text-sm font-medium text-coffee-800 mb-1">
                  Reason for Edit <span className="text-red-500">*</span>
                </label>
                <input
                  value={editReason}
                  onChange={e => setEditReason(e.target.value)}
                  className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm"
                  placeholder="Describe what was corrected or updated…"
                  required
                />
              </div>
              {editError && <p className="text-red-600 text-sm">{editError}</p>}
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={editSaving}
                  className="flex-1 py-2 bg-coffee-700 text-white rounded font-semibold text-sm disabled:opacity-50"
                >
                  {editSaving ? 'Saving…' : 'Save Edit'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditPublishedModal(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded font-semibold text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-coffee-900 mb-2">Delete Draft</h2>
            <p className="text-sm text-coffee-600 mb-5">This will permanently delete the draft. Are you sure?</p>
            <div className="flex gap-3">
              <button
                onClick={deleteDraft}
                disabled={deleting}
                className="flex-1 py-2 bg-red-600 text-white rounded font-semibold text-sm disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
              <button
                onClick={() => setDeleteModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded font-semibold text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View version modal */}
      {viewVersion && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6">
            <div className="flex items-start justify-between mb-1">
              <h2 className="text-lg font-bold text-coffee-900">Version {viewVersion.version_number}</h2>
              <span className="text-xs text-coffee-500 text-right">
                {viewVersion.edited_by_name}<br />{fmtDate(viewVersion.edited_at)}
              </span>
            </div>
            {viewVersion.edit_reason && (
              <p className="text-xs text-coffee-500 italic mb-3">Reason: {viewVersion.edit_reason}</p>
            )}
            <pre className="whitespace-pre-wrap text-sm text-coffee-800 font-mono bg-coffee-50 rounded-md p-4 max-h-96 overflow-y-auto">
              {viewVersion.content}
            </pre>
            <button
              onClick={() => setViewVersion(null)}
              className="mt-4 px-4 py-2 bg-gray-200 text-gray-700 rounded font-semibold text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}
