import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Button, ProcessBadge } from '../../components/ui';
import { ChevronDown, ChevronUp, Wand2, QrCode, Download } from 'lucide-react';

const TZ = 'Asia/Vientiane';
const DOC_TYPES = ['field_notes', 'roast_log', 'cupping_record', 'allocation_record'];
const DOC_LABELS = {
  field_notes:       'Field Notes',
  roast_log:         'Roast Log',
  cupping_record:    'Cupping Record',
  allocation_record: 'Allocation Record',
};
const STATUS_META = {
  draft:        { cls: 'badge-draft',        label: 'Draft' },
  under_review: { cls: 'badge-under-review', label: 'Under Review' },
  published:    { cls: 'badge-published',    label: 'Published' },
  missing:      { cls: 'badge-missing',      label: 'Missing' },
};

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' });
}

function Modal({ title, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(34,21,8,0.2)' }}
    >
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 border border-coffee-200">
        <h2 className="text-base text-coffee-900 mb-4" style={{ fontWeight: 500 }}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

export default function JournalEntry() {
  const { allocation_id, type } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [content,    setContent]    = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [actioning,  setActioning]  = useState(false);
  const [actionError, setActionError] = useState('');

  const [aiDrafting,   setAiDrafting]   = useState(false);
  const [aiDraftError, setAiDraftError] = useState('');

  const [publishModal,       setPublishModal]       = useState(false);
  const [editPublishedModal, setEditPublishedModal] = useState(false);
  const [editContent,        setEditContent]        = useState('');
  const [editReason,         setEditReason]         = useState('');
  const [editSaving,         setEditSaving]         = useState(false);
  const [editError,          setEditError]          = useState('');
  const [deleteModal,        setDeleteModal]        = useState(false);
  const [deleting,           setDeleting]           = useState(false);
  const [historyOpen,        setHistoryOpen]        = useState(false);
  const [viewVersion,        setViewVersion]        = useState(null);

  const [qrUrl,      setQrUrl]      = useState('');
  const [qrDataUrl,  setQrDataUrl]  = useState('');
  const [qrFilename, setQrFilename] = useState('');
  const [qrLoading,  setQrLoading]  = useState(false);
  const [qrError,    setQrError]    = useState('');

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

  useEffect(() => {
    const a = data?.allocation;
    if (!a || qrUrl) return;
    function toSlug(s) {
      return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }
    const slug = [toSlug(a.allocation_code), toSlug(a.process), toSlug(a.estate)].filter(Boolean).join('-');
    setQrUrl(`https://oneestate.coffee/journal/${slug}`);
  }, [data]);

  const doc      = data?.documents?.[type];
  const alloc    = data?.allocation;
  const status   = doc?.status || 'missing';
  const versions = doc?.versions || [];
  const isAdmin  = user?.role === 'admin';
  const isEditor = ['admin', 'roaster'].includes(user?.role);

  async function handleBlur() {
    if (!doc?.id || status === 'published') return;
    setSaveStatus('saving');
    await api.put(`/journal/${doc.id}`, { draft_content: content });
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus(''), 2500);
  }

  async function submitForReview() {
    setActioning(true); setActionError('');
    const res = await api.post(`/journal/${doc.id}/submit`, {});
    if (res.ok) load();
    else { const d = await res.json(); setActionError(d.error || 'Failed.'); }
    setActioning(false);
  }

  async function confirmPublish() {
    setActioning(true); setActionError('');
    const res = await api.post(`/journal/${doc.id}/publish`, {});
    if (res.ok) { setPublishModal(false); load(); }
    else { const d = await res.json(); setActionError(d.error || 'Failed.'); }
    setActioning(false);
  }

  async function submitEditPublished(e) {
    e.preventDefault();
    if (!editReason.trim()) { setEditError('Edit reason is required.'); return; }
    setEditSaving(true); setEditError('');
    const res = await api.put(`/journal/${doc.id}/edit-published`, { content: editContent, edit_reason: editReason });
    if (res.ok) { setEditPublishedModal(false); load(); }
    else { const d = await res.json(); setEditError(d.error || 'Failed.'); }
    setEditSaving(false);
  }

  async function generateAiDraft() {
    setAiDrafting(true); setAiDraftError('');
    try {
      const res = await api.post('/ai/journal-draft', { allocation_id, doc_type: type });
      const d   = await res.json();
      if (!res.ok) { setAiDraftError(d.error || 'AI failed.'); return; }
      setContent(d.draft || '');
    } catch {
      setAiDraftError('Network error.');
    } finally {
      setAiDrafting(false);
    }
  }

  async function generateQr() {
    if (!qrUrl.trim()) { setQrError('Enter a URL first.'); return; }
    setQrLoading(true); setQrError(''); setQrDataUrl('');
    try {
      const res = await api.get(`/journal/${allocation_id}/qr?url=${encodeURIComponent(qrUrl.trim())}`);
      const d = await res.json();
      if (!res.ok) { setQrError(d.error || 'Failed.'); return; }
      setQrDataUrl(d.dataUrl);
      setQrFilename(d.filename);
    } catch {
      setQrError('Network error.');
    } finally {
      setQrLoading(false);
    }
  }

  function downloadQr() {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = qrFilename;
    a.click();
  }

  async function deleteDraft() {
    setDeleting(true);
    await api.delete(`/journal/${doc.id}`);
    setDeleting(false);
    setDeleteModal(false);
    navigate('/journal');
  }

  if (loading) return <Layout><div className="px-6 py-6 text-sm text-coffee-400">Loading…</div></Layout>;
  if (!data || !alloc) return <Layout><div className="px-6 py-6 text-sm" style={{ color: '#A32D2D' }}>Entry not found.</div></Layout>;

  const statusMeta = STATUS_META[status] || STATUS_META.missing;

  return (
    <Layout>
      {/* Centered document layout */}
      <div className="max-w-[720px] mx-auto px-6 py-6">

        {/* Page header */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs text-coffee-400">{alloc.allocation_code}</span>
            {alloc.process && <ProcessBadge process={alloc.process} />}
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${statusMeta.cls}`}>
              {statusMeta.label}
            </span>
          </div>
          <h1 className="text-xl text-coffee-900" style={{ fontWeight: 500 }}>
            {DOC_LABELS[type]}
          </h1>
        </div>

        {/* Tab strip */}
        <div className="flex gap-0 mb-6 border-b border-coffee-200">
          {DOC_TYPES.map(t => {
            const isActive = t === type;
            const docStatus = data.documents?.[t]?.status || 'missing';
            const dotColor = {
              published:    '#3B7A1A',
              under_review: '#BA7517',
              draft:        '#C4A87A',
              missing:      null,
            }[docStatus];

            return (
              <Link
                key={t}
                to={`/journal/${allocation_id}/${t}`}
                className="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors duration-150 -mb-px whitespace-nowrap"
                style={{
                  color:        isActive ? '#533A24' : '#A8896A',
                  borderBottom: isActive ? '2px solid #6F5035' : '2px solid transparent',
                  fontWeight:   isActive ? 500 : 400,
                }}
              >
                {DOC_LABELS[t]}
                {dotColor && (
                  <span
                    title={STATUS_META[docStatus]?.label}
                    style={{
                      display:      'inline-block',
                      width:        7,
                      height:       7,
                      borderRadius: '50%',
                      background:   isActive ? 'transparent' : dotColor,
                      flexShrink:   0,
                      opacity:      isActive ? 0 : 1,
                      transition:   'opacity 150ms',
                    }}
                  />
                )}
              </Link>
            );
          })}
        </div>

        {/* Content area */}
        <div className="bg-white border border-coffee-200 rounded-xl p-6 mb-5">
          {status === 'missing' && (
            <p className="text-sm text-coffee-400 py-8 text-center">
              No draft has been generated for this document yet.
              Go back to the Journal dashboard to generate drafts.
            </p>
          )}

          {(status === 'draft' || status === 'under_review') && isEditor && (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-coffee-400 uppercase tracking-wide">Content</p>
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={generateAiDraft}
                    disabled={aiDrafting}
                    title="Generate an AI-written draft using all available allocation data"
                  >
                    <Wand2 size={13} className="mr-1" />
                    {aiDrafting ? 'Generating…' : 'AI Draft'}
                  </Button>
                  <span
                    className="text-xs transition-opacity duration-200"
                    style={{
                      opacity: saveStatus ? 1 : 0,
                      color: saveStatus === 'saved' ? '#3B6D11' : '#A8896A',
                    }}
                  >
                    {saveStatus === 'saving' ? 'Saving…' : 'Saved'}
                  </span>
                </div>
              </div>
              {aiDraftError && (
                <p className="text-xs mb-2" style={{ color: '#A32D2D' }}>{aiDraftError}</p>
              )}
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                onBlur={handleBlur}
                rows={22}
                className="w-full border border-coffee-200 rounded-lg px-4 py-3 text-coffee-800 font-mono resize-y focus:border-coffee-500 focus:ring-2 focus:ring-coffee-100"
                style={{ fontSize: 15, lineHeight: 1.75 }}
                placeholder="Enter document content…"
              />
            </>
          )}

          {status === 'draft' && !isEditor && (
            <pre
              className="whitespace-pre-wrap text-coffee-800 font-mono"
              style={{ fontSize: 15, lineHeight: 1.75 }}
            >
              {doc.draft_content || 'No content yet.'}
            </pre>
          )}

          {status === 'published' && (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-coffee-400 uppercase tracking-wide">Published</p>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditContent(doc.published_content || '');
                      setEditReason('');
                      setEditError('');
                      setEditPublishedModal(true);
                    }}
                  >
                    Edit
                  </Button>
                )}
              </div>
              <div
                className="text-coffee-800"
                style={{ fontSize: 15, lineHeight: 1.75 }}
              >
                <pre className="whitespace-pre-wrap font-sans">
                  {doc.published_content}
                </pre>
              </div>
            </>
          )}
        </div>

        {/* Action buttons */}
        {doc?.id && (
          <div className="flex flex-wrap items-center gap-3 mb-5">
            {status === 'draft' && isEditor && (
              <Button
                variant="primary"
                onClick={submitForReview}
                disabled={actioning}
                style={{ background: '#BA7517', color: '#fff' }}
              >
                {actioning ? 'Submitting…' : 'Submit for Review'}
              </Button>
            )}
            {status === 'under_review' && isAdmin && (
              <Button
                variant="primary"
                onClick={() => { setActionError(''); setPublishModal(true); }}
                style={{ background: '#3B6D11', color: '#fff' }}
              >
                Publish
              </Button>
            )}
            {(status === 'draft' || status === 'under_review') && isAdmin && (
              <Button
                variant="destructive"
                onClick={() => setDeleteModal(true)}
              >
                Delete Draft
              </Button>
            )}
            {actionError && (
              <p className="text-xs" style={{ color: '#A32D2D' }}>{actionError}</p>
            )}
          </div>
        )}

        {/* Package QR Code */}
        <div className="bg-white border border-coffee-200 rounded-xl p-5 mb-5">
          <div className="flex items-center gap-2 mb-4">
            <QrCode size={14} className="text-coffee-400" />
            <p className="text-xs text-coffee-400 uppercase tracking-wide">Package QR Code</p>
          </div>

          <div className="flex gap-2 mb-3">
            <input
              type="url"
              value={qrUrl}
              onChange={e => { setQrUrl(e.target.value); setQrDataUrl(''); }}
              placeholder="https://oneestate.coffee/journal/your-slug"
              className="flex-1 h-9 px-3 text-sm border border-coffee-200 rounded-lg focus:border-coffee-500 focus:ring-2 focus:ring-coffee-100"
            />
            <button
              onClick={generateQr}
              disabled={qrLoading || !qrUrl.trim()}
              className="px-4 h-9 text-xs rounded-lg border transition-colors disabled:opacity-40"
              style={{ borderColor: '#E0D0BC', color: '#8B6A47', background: '#FAF6F0' }}
            >
              {qrLoading ? 'Generating…' : 'Generate'}
            </button>
          </div>

          {qrError && <p className="text-xs mb-3" style={{ color: '#A32D2D' }}>{qrError}</p>}

          {qrDataUrl && (
            <div className="flex flex-col items-center gap-3 pt-3" style={{ borderTop: '1px solid #F2EAE0' }}>
              <img
                src={qrDataUrl}
                alt="QR Code"
                className="rounded-lg"
                style={{ width: 180, height: 180, imageRendering: 'pixelated' }}
              />
              <p className="text-xs text-coffee-400 text-center max-w-xs break-all">{qrUrl}</p>
              <button
                onClick={downloadQr}
                className="flex items-center gap-1.5 px-4 py-2 text-xs rounded-lg transition-colors"
                style={{ background: '#533A24', color: '#fff' }}
              >
                <Download size={12} />
                Download PNG ({qrFilename})
              </button>
            </div>
          )}
        </div>

        {/* Version history */}
        {versions.length > 0 && (
          <div className="bg-white border border-coffee-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setHistoryOpen(o => !o)}
              className="w-full flex items-center justify-between px-5 py-3 text-sm text-coffee-700 transition-colors hover:bg-coffee-50"
              style={{ fontWeight: 500 }}
            >
              <span>Edit History ({versions.length})</span>
              {historyOpen
                ? <ChevronUp size={14} className="text-coffee-400" />
                : <ChevronDown size={14} className="text-coffee-400" />
              }
            </button>
            {historyOpen && (
              <div className="border-t border-coffee-100 divide-y divide-coffee-50">
                {versions.map((v, i) => (
                  <div key={v.id || i} className="flex items-center gap-3 px-5 py-3 text-xs text-coffee-600">
                    <span className="text-coffee-300 w-6 flex-shrink-0">v{v.version_number}</span>
                    <span style={{ fontWeight: 500 }}>{v.edited_by_name}</span>
                    <span className="text-coffee-400">{fmtDate(v.edited_at)}</span>
                    <span className="text-coffee-400 italic truncate flex-1">{v.edit_reason}</span>
                    <Button variant="ghost" size="sm" onClick={() => setViewVersion(v)}>
                      View
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Publish modal */}
      {publishModal && (
        <Modal title="Publish Entry" onClose={() => setPublishModal(false)}>
          <p className="text-sm text-coffee-500 mb-5">
            Publishing is permanent and enters the archive. Proceed?
          </p>
          {actionError && <p className="text-xs mb-3" style={{ color: '#A32D2D' }}>{actionError}</p>}
          <div className="flex gap-3">
            <Button
              variant="primary"
              onClick={confirmPublish}
              disabled={actioning}
              className="flex-1 justify-center"
              style={{ background: '#3B6D11', color: '#fff' }}
            >
              {actioning ? 'Publishing…' : 'Publish'}
            </Button>
            <Button variant="secondary" onClick={() => setPublishModal(false)}>Cancel</Button>
          </div>
        </Modal>
      )}

      {/* Edit published modal */}
      {editPublishedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(34,21,8,0.2)' }}>
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 border border-coffee-200">
            <h2 className="text-base text-coffee-900 mb-4" style={{ fontWeight: 500 }}>
              Edit Published Entry
            </h2>
            <form onSubmit={submitEditPublished} className="space-y-4">
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                rows={14}
                className="w-full border border-coffee-200 rounded-lg px-4 py-3 text-coffee-800 font-mono resize-y focus:border-coffee-500 focus:ring-2 focus:ring-coffee-100"
                style={{ fontSize: 14, lineHeight: 1.7 }}
              />
              <div className="flex flex-col gap-1">
                <label className="text-sm text-coffee-600" style={{ fontWeight: 500 }}>
                  Reason for Edit
                </label>
                <input
                  value={editReason}
                  onChange={e => setEditReason(e.target.value)}
                  className="h-9 px-3 text-sm border border-coffee-200 rounded-lg focus:border-coffee-500 focus:ring-2 focus:ring-coffee-100"
                  placeholder="Describe what was corrected…"
                  required
                />
              </div>
              {editError && <p className="text-xs" style={{ color: '#A32D2D' }}>{editError}</p>}
              <div className="flex gap-3">
                <Button type="submit" disabled={editSaving} className="flex-1 justify-center">
                  {editSaving ? 'Saving…' : 'Save Edit'}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setEditPublishedModal(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {deleteModal && (
        <Modal title="Delete Draft" onClose={() => setDeleteModal(false)}>
          <p className="text-sm text-coffee-500 mb-5">
            This will permanently delete the draft. Are you sure?
          </p>
          <div className="flex gap-3">
            <Button
              variant="destructive"
              onClick={deleteDraft}
              disabled={deleting}
              className="flex-1 justify-center"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
            <Button variant="secondary" onClick={() => setDeleteModal(false)}>Cancel</Button>
          </div>
        </Modal>
      )}

      {/* View version modal */}
      {viewVersion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(34,21,8,0.2)' }}>
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 border border-coffee-200">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base text-coffee-900" style={{ fontWeight: 500 }}>
                Version {viewVersion.version_number}
              </h2>
              <span className="text-xs text-coffee-400 text-right">
                {viewVersion.edited_by_name} · {fmtDate(viewVersion.edited_at)}
              </span>
            </div>
            {viewVersion.edit_reason && (
              <p className="text-xs text-coffee-400 italic mb-3">
                "{viewVersion.edit_reason}"
              </p>
            )}
            <pre
              className="whitespace-pre-wrap text-coffee-800 font-mono rounded-xl p-4 max-h-96 overflow-y-auto"
              style={{ background: '#FAF6F0', fontSize: 13, lineHeight: 1.7 }}
            >
              {viewVersion.content}
            </pre>
            <Button variant="secondary" onClick={() => setViewVersion(null)} className="mt-4">
              Close
            </Button>
          </div>
        </div>
      )}
    </Layout>
  );
}
