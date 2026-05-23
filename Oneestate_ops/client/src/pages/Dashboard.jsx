import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import Layout from '../components/Layout';
import { api } from '../lib/api';

const MODULES = [
  {
    id: 'M1', phase: 1, title: 'Green Bean Inventory',
    desc: 'Track all green stock by estate, process and harvest year. Project sellable yield for any planned roast quantity.',
    link: '/inventory', linkLabel: 'Open Inventory',
    bullets: ['Manual lot entry on arrival', 'Yield projection calculator', 'Stock reservation per allocation', 'Quality degradation alerts after 12 months'],
    color: 'border-green-400 bg-green-50',
    badge: 'bg-green-100 text-green-700',
  },
  {
    id: 'M2', phase: 1, title: 'Roast Session Logger',
    desc: 'Capture roast session data in real time. Auto-generate batch IDs and link each session to its allocation or development cycle.',
    link: '/roast', linkLabel: 'Open Roast Sessions',
    bullets: ['Live temperature curve with profile overlay', 'Auto-batch IDs: DEV-W-R01 / ALLOC-001-W-B01', '±3°C variance alert vs approved profile', 'Session workflow: in progress → approved / rejected'],
    color: 'border-orange-400 bg-orange-50',
    badge: 'bg-orange-100 text-orange-700',
  },
  {
    id: 'M3', phase: 1, title: 'Allocation Lifecycle',
    desc: 'Manage every release through its complete state lifecycle from planning to permanent archive.',
    link: '/allocations', linkLabel: 'Open Allocations',
    bullets: ['State machine: Upcoming → Open → Closed → Roasting → Resting → Dispatched → Archived', 'Request capture from WhatsApp, Instagram, in-person', 'Bag count enforcement against green stock', 'Dispatch date calculator by process type'],
    color: 'border-blue-400 bg-blue-50',
    badge: 'bg-blue-100 text-blue-700',
  },
  {
    id: 'M4', phase: 2, title: 'Cupping Record',
    desc: 'Structured cupping documentation with SCA-aligned scoring and natural language observations.',
    link: '/cupping', linkLabel: 'Open Cupping',
    bullets: ['7-attribute SCA scoring (aroma, flavour, acidity, body, sweetness, aftertaste, overall)', 'Rest period validation before cupping', 'Comparative radar chart across sessions', 'Auto-generated journal draft from scores & notes'],
    color: 'border-purple-400 bg-purple-50',
    badge: 'bg-purple-100 text-purple-700',
  },
  {
    id: 'M5', phase: 2, title: 'Profile Management',
    desc: 'Store, version and approve roast profiles per process per harvest year.',
    link: '/profiles', linkLabel: 'Open Profiles',
    bullets: ['Approval workflow: development → pending → approved → retired', 'Harvest year separation (2025 Washed ≠ 2026 Washed)', 'One-click duplication to next harvest as starting point', 'Approving a new profile auto-retires the old one'],
    color: 'border-amber-400 bg-amber-50',
    badge: 'bg-amber-100 text-amber-700',
  },
  {
    id: 'M6', phase: 2, title: 'Label & Doc Generator',
    desc: 'Generate print-ready bag labels with full traceability metadata and QR codes.',
    link: '/allocations', linkLabel: 'View Allocations (labels inside)',
    bullets: ['Process-aware rest dates: Washed +4d, Honey +5–7d, Natural/Anaerobic +7–10d', 'QR code links to public journal URL', 'Print-ready output — no manual entry at label time', 'Template versioning so old labels can be regenerated'],
    color: 'border-red-400 bg-red-50',
    badge: 'bg-red-100 text-red-700',
  },
  {
    id: 'M7', phase: 3, title: 'Buyer & Contact Database',
    desc: 'Relationship-based customer database — not a marketing CRM.',
    link: '/contacts', linkLabel: 'Open Contacts',
    bullets: ['Contact records with purchase history', 'Private list flagging (manual trigger only)', 'Market segmentation: Laos, Thailand, Malaysia, Singapore', 'Return rate tracking — no automated messages'],
    color: 'border-teal-400 bg-teal-50',
    badge: 'bg-teal-100 text-teal-700',
  },
  {
    id: 'M8', phase: 3, title: 'Public Journal Bridge',
    desc: 'Pull structured data from all modules to auto-populate journal entry templates.',
    link: '/journal', linkLabel: 'Open Journal',
    bullets: ['4 document types: Field Notes, Roast Log, Cupping Record, Allocation Record', 'Draft generation from live data', 'Publishing workflow — no auto-publishing', 'Permanent archive with versioned edits'],
    color: 'border-indigo-400 bg-indigo-50',
    badge: 'bg-indigo-100 text-indigo-700',
  },
];

const PRINCIPLES = [
  { title: 'Traceability is non-negotiable', body: 'Every bag traces back to the specific roast session, green lot, and harvest year.' },
  { title: 'Allocation is a state machine', body: 'Every release moves through defined states with enforced transition rules. No workarounds.' },
  { title: 'Dev and production are separate', body: 'Development roasts are never confused with allocation roasts in data, logs, or output.' },
  { title: 'Documentation is a primary output', body: 'Every operation produces structured data that feeds the public journal automatically.' },
  { title: 'Personal relationships first', body: 'No automated email sequences, no drip campaigns, no engagement scoring — ever.' },
  { title: 'Data ownership is yours', body: 'All data is exportable in standard formats at any time. The platform stores, never locks.' },
];

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard-stats')
      .then(res => res.json())
      .then(data => {
        setStats(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const phase1Done = MODULES.filter(m => m.phase === 1);
  const phase2Done = MODULES.filter(m => m.phase === 2);
  const phase3     = MODULES.filter(m => m.phase === 3);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Hero */}
        <div className="bg-coffee-900 text-white rounded-2xl p-8 mb-8">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="text-coffee-300 text-xs font-semibold uppercase tracking-widest mb-2">
                Suan Saket Estate · Doi Saket, Chiang Mai, Thailand
              </div>
              <h1 className="text-3xl font-bold mb-1">One Estate Coffee</h1>
              <p className="text-coffee-300 text-lg">Roast & Allocation Management Platform</p>
              <p className="text-coffee-400 text-sm mt-3 max-w-2xl">
                A single source of truth from green bean arrival to customer delivery and public journal documentation.
                Replaces spreadsheets, messaging apps, and disconnected roast software.
              </p>
            </div>
            <div className="text-right">
              <div className="text-coffee-400 text-xs mb-1">Signed in as</div>
              <div className="text-white font-semibold">{user?.name}</div>
              <div className="text-coffee-400 text-xs capitalize">{user?.role}</div>
              <div className="mt-4 flex gap-2 justify-end flex-wrap">
                <button onClick={() => navigate('/inventory')}
                  className="px-4 py-2 bg-coffee-700 hover:bg-coffee-600 rounded-lg text-sm font-semibold transition-colors">
                  Inventory
                </button>
                <button onClick={() => navigate('/allocations')}
                  className="px-4 py-2 bg-coffee-700 hover:bg-coffee-600 rounded-lg text-sm font-semibold transition-colors">
                  Allocations
                </button>
                <button onClick={() => navigate('/roast')}
                  className="px-4 py-2 bg-white text-coffee-900 hover:bg-coffee-100 rounded-lg text-sm font-semibold transition-colors">
                  + New Roast
                </button>
              </div>
            </div>
          </div>

          {/* Phase progress bar */}
          <div className="mt-8 grid grid-cols-3 gap-3 text-center">
            {[
              { label: 'Phase 1 — Operational Foundation', done: true, modules: 'M1 · M2 · M3' },
              { label: 'Phase 2 — Quality & Output', done: true, modules: 'M4 · M5 · M6' },
              { label: 'Phase 3 — Full Platform', done: true, modules: 'M7 · M8' },
            ].map(p => (
              <div key={p.label} className={`rounded-lg p-3 ${p.done ? 'bg-green-800/50 border border-green-600' : 'bg-coffee-800 border border-coffee-700'}`}>
                <div className={`text-xs font-bold mb-0.5 ${p.done ? 'text-green-300' : 'text-coffee-400'}`}>
                  {p.done ? '✓ Complete' : 'Upcoming'}
                </div>
                <div className="text-white text-sm font-semibold">{p.label}</div>
                <div className={`text-xs mt-1 ${p.done ? 'text-green-400' : 'text-coffee-500'}`}>{p.modules}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Live Operational Metrics & Explanation Dashboard */}
        <div className="mb-8 bg-gradient-to-br from-coffee-900 to-coffee-800 text-white rounded-2xl p-6 shadow-lg border border-coffee-700/50">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="text-base font-bold uppercase tracking-wider text-emerald-300">Live Operations & Metrics Summary</h2>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {/* Green Bean Stock Card */}
            <div className="bg-coffee-950/60 p-4 rounded-xl border border-coffee-700/30 hover:border-emerald-600/50 transition-colors">
              <div className="text-xs text-coffee-300 font-semibold mb-1">Green Bean Stock</div>
              <div className="text-2xl font-black text-emerald-400">
                {loading ? '...' : stats ? `${(stats.totalGreenStockG / 1000).toFixed(1)} kg` : '0 kg'}
              </div>
              <div className="text-[10px] text-coffee-400 mt-2 leading-relaxed">
                Raw specialty green lot inventory physically stored in warehouse. Feeds yield calculations for all production roasts.
              </div>
            </div>

            {/* Active Allocations Card */}
            <div className="bg-coffee-950/60 p-4 rounded-xl border border-coffee-700/30 hover:border-emerald-600/50 transition-colors">
              <div className="text-xs text-coffee-300 font-semibold mb-1">Active Allocations</div>
              <div className="text-2xl font-black text-emerald-400">
                {loading ? '...' : stats ? stats.activeAllocationsCount : '0'}
              </div>
              <div className="text-[10px] text-coffee-400 mt-2 leading-relaxed">
                Allocations currently in request, roasting, or resting phases. (e.g. active lot <span className="text-white font-bold">{loading ? '...' : stats?.activeAllocation?.allocation_code || 'W-02'}</span>).
              </div>
            </div>

            {/* Outstanding Requests Card */}
            <div className="bg-coffee-950/60 p-4 rounded-xl border border-coffee-700/30 hover:border-emerald-600/50 transition-colors">
              <div className="text-xs text-coffee-300 font-semibold mb-1">Outstanding Requests</div>
              <div className="text-2xl font-black text-emerald-400">
                {loading ? '...' : stats ? `${stats.totalBagsRequested} bags` : '0 bags'}
              </div>
              <div className="text-[10px] text-coffee-400 mt-2 leading-relaxed">
                Unfulfilled micro-lot requests collected across channels (WhatsApp, IG, Website) that are waiting for roasting/resting.
              </div>
            </div>

            {/* Roast Sessions Card */}
            <div className="bg-coffee-950/60 p-4 rounded-xl border border-coffee-700/30 hover:border-emerald-600/50 transition-colors">
              <div className="text-xs text-coffee-300 font-semibold mb-1">Roast Batches</div>
              <div className="text-2xl font-black text-emerald-400">
                {loading ? '...' : stats ? stats.totalRoastsCount : '0'}
              </div>
              <div className="text-[10px] text-coffee-400 mt-2 leading-relaxed">
                Historical batch logs including profile developments (DEV) and production runs linked to allocations.
              </div>
            </div>

            {/* Buyer CRM Card */}
            <div className="bg-coffee-950/60 p-4 rounded-xl border border-coffee-700/30 hover:border-emerald-600/50 transition-colors">
              <div className="text-xs text-coffee-300 font-semibold mb-1">Specialty Buyers</div>
              <div className="text-2xl font-black text-emerald-400">
                {loading ? '...' : stats ? stats.totalContactsCount : '0'}
              </div>
              <div className="text-[10px] text-coffee-400 mt-2 leading-relaxed">
                Registered buyers and micro-roaster trade contacts with logged taste preferences and custom allocation access.
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-emerald-950/30 rounded-lg border border-emerald-900/50 flex gap-2 text-xs text-emerald-200">
            <span className="font-bold flex-shrink-0">🛈 Crop-to-Cup Note:</span>
            <span>
              The metrics above reflect real-time allocations synced from the public website journal. Every allocation (like the active <strong className="text-white">W-02 Washed Process</strong>) enforces strict green bean weight constraints to protect roasting yields and prevent order overcommitment.
            </span>
          </div>
        </div>

        {/* Phase 1 modules */}
        <SectionHeader phase={1} title="Phase 1 — Operational Foundation" subtitle="One Estate's daily operation runs on the platform. Replaces spreadsheets and disconnected tools." done />
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          {phase1Done.map(m => <ModuleCard key={m.id} module={m} onNav={navigate} />)}
        </div>

        {/* Phase 2 modules */}
        <SectionHeader phase={2} title="Phase 2 — Quality & Customer Output" subtitle="Complete the quality control and customer-facing output layer." done />
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          {phase2Done.map(m => <ModuleCard key={m.id} module={m} onNav={navigate} />)}
        </div>

        {/* Phase 3 modules */}
        <SectionHeader phase={3} title="Phase 3 — Full Platform" subtitle="Buyer database and public journal — complete, connected, and ready for use." done />
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          {phase3.map(m => <ModuleCard key={m.id} module={m} onNav={navigate} />)}
        </div>

        {/* Architecture Principles */}
        <div className="bg-white border border-coffee-200 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-bold text-coffee-900 mb-1">Architecture Principles</h2>
          <p className="text-sm text-coffee-500 mb-5">These principles inform every build decision and reflect One Estate's operational philosophy.</p>
          <div className="grid md:grid-cols-2 gap-4">
            {PRINCIPLES.map(p => (
              <div key={p.title} className="flex gap-3">
                <div className="w-2 h-2 rounded-full bg-coffee-700 mt-1.5 flex-shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-coffee-800">{p.title}</div>
                  <div className="text-xs text-coffee-500 mt-0.5">{p.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Non-Negotiables */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-bold text-amber-900 mb-4">Constraints & Non-Negotiables</h2>
          <ul className="space-y-2">
            {[
              'The system enforces the request-first, roast-to-order model. No path exists to manage permanent inventory or open-ended subscriptions.',
              'Development roast data is never visible on customer-facing outputs (labels, journal). Separation enforced at the data model level.',
              'Allocation IDs are never reused. The sequence is continuous and permanent.',
              'Once an allocation reaches Archived state it is immutable. No edits, no deletions.',
              'No marketing automation. The platform supports relationships, not campaigns.',
              'All published documentation enters a permanent archive. Edits require logged reasons.',
            ].map(rule => (
              <li key={rule} className="flex gap-2 text-sm text-amber-800">
                <span className="text-amber-500 font-bold flex-shrink-0">—</span>
                {rule}
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-coffee-400 py-4 border-t border-coffee-100">
          One Estate Coffee · Suan Saket Estate · Doi Saket, Chiang Mai, Thailand ·
          Platform v1.0 · Internal use only
        </div>
      </div>
    </Layout>
  );
}

function SectionHeader({ phase, title, subtitle, done }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {done ? `✓ Phase ${phase} Complete` : `Phase ${phase} — Upcoming`}
          </span>
        </div>
        <h2 className="text-xl font-bold text-coffee-900">{title}</h2>
        <p className="text-sm text-coffee-500 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

function ModuleCard({ module: m, onNav }) {
  const isAvailable = m.link !== null;
  return (
    <div className={`rounded-xl border-2 p-5 flex flex-col ${m.color} ${isAvailable ? 'cursor-pointer hover:shadow-md transition-shadow' : 'opacity-70'}`}
      onClick={() => isAvailable && onNav(m.link)}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${m.badge}`}>{m.id}</span>
          <h3 className="text-base font-bold text-coffee-900 mt-2">{m.title}</h3>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${m.phase === 3 ? 'bg-gray-200 text-gray-500' : 'bg-green-100 text-green-700'}`}>
          Phase {m.phase}
        </span>
      </div>
      <p className="text-xs text-coffee-600 mb-3 flex-1">{m.desc}</p>
      <ul className="space-y-1 mb-4">
        {m.bullets.map(b => (
          <li key={b} className="text-xs text-coffee-700 flex gap-1.5">
            <span className="text-coffee-400 flex-shrink-0">·</span>{b}
          </li>
        ))}
      </ul>
      <div className={`text-xs font-semibold ${isAvailable ? 'text-coffee-700' : 'text-gray-400'}`}>
        {isAvailable ? `→ ${m.linkLabel}` : m.linkLabel}
      </div>
    </div>
  );
}
