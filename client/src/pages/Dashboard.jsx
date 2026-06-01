import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';

// ── Palette ────────────────────────────────────────────────────────────────
const C = {
  bg:          '#F5F0E8',
  surface:     '#FFFEFB',
  gold:        '#A67C2E',
  goldBright:  '#C49A3C',
  goldDark:    '#7A5B1E',
  goldAlpha:   'rgba(166,124,46,0.14)',
  textDark:    '#1C1208',
  textMed:     '#3D2B18',
  textDim:     '#6B5030',
  textFaint:   '#9B7A55',
  border:      'rgba(166,124,46,0.20)',
  borderStrong:'rgba(166,124,46,0.45)',
  shadow:      'rgba(44,24,16,0.08)',
};

// ── 8 Modules ──────────────────────────────────────────────────────────────
const MODS = [
  {
    id: 'inventory', label: 'Inventory', sub: 'Green Bean Stock',
    color: '#22c55e', route: '/inventory',
    roles: ['admin','roaster','viewer'],
    stats: [
      { label: 'Active Lots',  val: '3' },
      { label: 'Total Stock',  val: '1,292 kg' },
      { label: 'Origins',      val: '1' },
    ],
    actions: [{ label: 'View Inventory', route: '/inventory', primary: true }, { label: 'Add Lot', route: '/inventory', primary: false }],
  },
  {
    id: 'roast', label: 'Roast Sessions', sub: 'Batch Production',
    color: '#ef4444', route: '/roast',
    roles: ['admin','roaster'],
    stats: [
      { label: 'Total Sessions', val: '5' },
      { label: 'Completed',      val: '4' },
      { label: 'In Progress',    val: '1' },
    ],
    actions: [{ label: 'View Sessions', route: '/roast', primary: true }, { label: 'New Roast', route: '/roast/new', primary: false }],
  },
  {
    id: 'cupping', label: 'Cupping', sub: 'Quality Evaluation',
    color: '#7c3aed', route: '/cupping',
    roles: ['admin','roaster','viewer'],
    stats: [
      { label: 'Sessions',  val: '1' },
      { label: 'Avg Score', val: '82.0' },
      { label: 'Pending',   val: '0' },
    ],
    actions: [{ label: 'View Cupping', route: '/cupping', primary: true }, { label: 'New Session', route: '/cupping/new', primary: false }],
  },
  {
    id: 'allocations', label: 'Allocations', sub: 'Buyer Dispatch',
    color: '#A67C2E', route: '/allocations',
    roles: ['admin','roaster','viewer'],
    stats: [
      { label: 'Total',    val: '8' },
      { label: 'Active',   val: '3' },
      { label: 'Archived', val: '1' },
    ],
    actions: [{ label: 'View Allocations', route: '/allocations', primary: true }, { label: 'New Allocation', route: '/allocations/new', primary: false }],
  },
  {
    id: 'labels', label: 'Labels', sub: 'QR & Bag Labels',
    color: '#0e7490', route: '/labels',
    roles: ['admin','roaster'],
    stats: [
      { label: 'Generated', val: '—' },
      { label: 'Today',     val: '—' },
      { label: 'Scan Rate', val: '—' },
    ],
    actions: [{ label: 'View Labels', route: '/labels', primary: true }],
  },
  {
    id: 'profiles', label: 'Roast Profiles', sub: 'Profile Library',
    color: '#c2410c', route: '/profiles',
    roles: ['admin','roaster'],
    stats: [
      { label: 'Total',    val: '4' },
      { label: 'Approved', val: '1' },
      { label: 'Dev',      val: '2' },
    ],
    actions: [{ label: 'View Profiles', route: '/profiles', primary: true }, { label: 'New Profile', route: '/profiles/new', primary: false }],
  },
  {
    id: 'contacts', label: 'Contacts', sub: 'Buyer Network',
    color: '#be185d', route: '/contacts',
    roles: ['admin'],
    stats: [
      { label: 'Total',    val: '—' },
      { label: 'Buyers',   val: '—' },
      { label: 'Partners', val: '—' },
    ],
    actions: [{ label: 'View Contacts', route: '/contacts', primary: true }, { label: 'Add Contact', route: '/contacts/new', primary: false }],
  },
  {
    id: 'journal', label: 'Journal', sub: 'Field Documentation',
    color: '#4d7c0f', route: '/journal',
    roles: ['admin','roaster','viewer'],
    stats: [
      { label: 'Entries',   val: '—' },
      { label: 'This Week', val: '—' },
      { label: 'Drafts',    val: '—' },
    ],
    actions: [{ label: 'View Journal', route: '/journal', primary: true }],
  },
];

// ── Canvas icon drawers (native primitives only) ───────────────────────────
function drawIcon(ctx, id, x, y, size, color) {
  const s = size * 0.38;
  ctx.strokeStyle = color;
  ctx.fillStyle   = color;
  ctx.lineWidth   = size * 0.045;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  if (id === 'inventory') {
    // 3D cube
    const h = s * 0.55;
    ctx.beginPath();
    ctx.moveTo(x, y - h);
    ctx.lineTo(x + s, y - h * 0.4);
    ctx.lineTo(x + s, y + h * 0.6);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x - s, y + h * 0.6);
    ctx.lineTo(x - s, y - h * 0.4);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x, y + h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s, y - h * 0.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - s, y - h * 0.4); ctx.stroke();

  } else if (id === 'roast') {
    // Flame
    ctx.beginPath();
    ctx.moveTo(x, y + s);
    ctx.bezierCurveTo(x - s * 0.8, y + s * 0.3, x - s * 0.6, y - s * 0.2, x, y - s);
    ctx.bezierCurveTo(x + s * 0.2, y - s * 0.4, x + s * 0.1, y - s * 0.6, x - s * 0.1, y - s * 0.2);
    ctx.bezierCurveTo(x + s * 0.6, y - s * 0.5, x + s * 0.8, y, x + s * 0.7, y + s * 0.5);
    ctx.bezierCurveTo(x + s * 0.9, y + s * 0.2, x + s, y - s * 0.1, x + s * 0.8, y - s * 0.4);
    ctx.bezierCurveTo(x + s * 1.1, y + s * 0.1, x + s * 0.8, y + s, x, y + s);
    ctx.closePath();
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;

  } else if (id === 'cupping') {
    // Coffee cup
    ctx.beginPath();
    ctx.moveTo(x - s * 0.7, y - s * 0.4);
    ctx.lineTo(x - s * 0.5, y + s * 0.7);
    ctx.lineTo(x + s * 0.5, y + s * 0.7);
    ctx.lineTo(x + s * 0.7, y - s * 0.4);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + s * 0.7, y + s * 0.15, s * 0.35, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - s * 0.4, y - s * 0.4);
    ctx.lineTo(x + s * 0.4, y - s * 0.4);
    ctx.stroke();

  } else if (id === 'allocations') {
    // Bar chart
    const bars = [0.45, 0.75, 0.55, 1.0];
    const bw = s * 0.38;
    bars.forEach((h, i) => {
      const bx = x - s * 0.7 + i * (bw + s * 0.1);
      const by = y + s * 0.6;
      ctx.beginPath();
      ctx.rect(bx, by - s * 1.2 * h, bw, s * 1.2 * h);
      ctx.fill();
    });
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.9, y + s * 0.6);
    ctx.lineTo(x + s * 0.9, y + s * 0.6);
    ctx.stroke();
    ctx.globalAlpha = 1;

  } else if (id === 'labels') {
    // QR pattern — 3 finder squares + dots
    const qsz = s * 0.32;
    [[x - s * 0.55, y - s * 0.55], [x + s * 0.55, y - s * 0.55], [x - s * 0.55, y + s * 0.55]].forEach(([qx, qy]) => {
      ctx.beginPath(); ctx.rect(qx - qsz, qy - qsz, qsz * 2, qsz * 2); ctx.stroke();
      ctx.beginPath(); ctx.rect(qx - qsz * 0.55, qy - qsz * 0.55, qsz * 1.1, qsz * 1.1); ctx.fill();
    });
    const dots = [[x + 0.1*s, y + 0.1*s],[x + 0.4*s, y + 0.1*s],[x + 0.55*s, y + 0.25*s],
                  [x + 0.1*s, y + 0.4*s],[x + 0.4*s, y + 0.55*s]];
    dots.forEach(([dx, dy]) => {
      ctx.beginPath(); ctx.arc(dx, dy, s * 0.07, 0, Math.PI * 2); ctx.fill();
    });

  } else if (id === 'profiles') {
    // Temperature curve graph
    ctx.beginPath();
    ctx.moveTo(x - s * 0.8, y + s * 0.6);
    ctx.lineTo(x + s * 0.8, y + s * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - s * 0.8, y + s * 0.6);
    ctx.lineTo(x - s * 0.8, y - s * 0.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - s * 0.7, y + s * 0.5);
    ctx.bezierCurveTo(x - s * 0.3, y + s * 0.4, x + s * 0.1, y - s * 0.1, x + s * 0.7, y - s * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + s * 0.7, y - s * 0.6, s * 0.1, 0, Math.PI * 2);
    ctx.fill();

  } else if (id === 'contacts') {
    // 2 person silhouettes
    [-0.28, 0.22].forEach((dx, i) => {
      const px = x + dx * s * 2;
      const alpha = i === 0 ? 0.55 : 1;
      ctx.globalAlpha = alpha;
      ctx.beginPath(); ctx.arc(px, y - s * 0.3, s * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(px - s * 0.45, y + s * 0.8);
      ctx.bezierCurveTo(px - s * 0.45, y + s * 0.1, px + s * 0.45, y + s * 0.1, px + s * 0.45, y + s * 0.8);
      ctx.closePath();
      ctx.fill();
    });
    ctx.globalAlpha = 1;

  } else if (id === 'journal') {
    // Open book
    ctx.beginPath();
    ctx.rect(x - s * 0.85, y - s * 0.6, s * 0.82, s * 1.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(x + s * 0.03, y - s * 0.6, s * 0.82, s * 1.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.6);
    ctx.lineTo(x, y + s * 0.6);
    ctx.stroke();
    [-0.25, 0.05, 0.35].forEach(dy => {
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.7, y + dy * s); ctx.lineTo(x - s * 0.1, y + dy * s); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + s * 0.1, y + dy * s); ctx.lineTo(x + s * 0.75, y + dy * s); ctx.stroke();
      ctx.globalAlpha = 1;
    });
  }
}

// ── Detail content per module ──────────────────────────────────────────────
function DetailContent({ mod, stats }) {
  const navigate = useNavigate();
  if (mod.id === 'inventory') {
    const lots = [];
    if (stats?.grouped) {
      Object.values(stats.grouped).forEach(byY => Object.values(byY).forEach(arr => lots.push(...arr)));
    }
    const PROC = { Washed:'#3B82F6', Honey:'#D97706', Natural:'#22C55E', Anaerobic:'#A855F7' };
    return (
      <div>
        <h3 style={{ fontFamily:'Playfair Display', fontSize:18, color:C.textDark, marginBottom:16 }}>Lot Inventory</h3>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                {['Lot Code','Estate','Process','Weight (kg)','Quality'].map(h => (
                  <th key={h} style={{ textAlign:'left', padding:'8px 12px', color:C.textFaint, fontWeight:500, fontFamily:'Outfit' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lots.map(l => (
                <tr key={l.id}
                    onClick={() => navigate(`/inventory/${l.id}`)}
                    onMouseEnter={e => e.currentTarget.style.background = C.goldAlpha}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    style={{ cursor:'pointer', borderBottom:`1px solid ${C.border}` }}>
                  <td style={{ padding:'10px 12px', fontFamily:'Space Mono', fontSize:12, color:C.textDark }}>{l.lot_code}</td>
                  <td style={{ padding:'10px 12px', color:C.textMed }}>{l.estate}</td>
                  <td style={{ padding:'10px 12px' }}>
                    <span style={{ background: PROC[l.process] || '#888', color:'#fff', borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:600 }}>{l.process}</span>
                  </td>
                  <td style={{ padding:'10px 12px', fontFamily:'Space Mono', fontSize:12, color:C.textDark }}>{(l.current_weight_g/1000).toFixed(1)}</td>
                  <td style={{ padding:'10px 12px' }}>
                    {l.quality_alert
                      ? <span style={{ color:'#DC2626', fontWeight:600, fontSize:12 }}>⚠ Alert</span>
                      : <span style={{ color:'#16A34A', fontSize:12 }}>✓ Good</span>}
                  </td>
                </tr>
              ))}
              {lots.length === 0 && <tr><td colSpan={5} style={{ padding:24, textAlign:'center', color:C.textFaint }}>No lots</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (mod.id === 'allocations') {
    const STATE_COLOR = { upcoming:'#6B7280', open_for_requests:'#2563EB', closed:'#7C3AED', roasting_in_progress:'#D97706', resting:'#0891B2', dispatched:'#16A34A', archived:'#9CA3AF' };
    return (
      <div>
        <h3 style={{ fontFamily:'Playfair Display', fontSize:18, color:C.textDark, marginBottom:16 }}>Allocations</h3>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                {['Code','Estate','Process','State','Green (kg)'].map(h => (
                  <th key={h} style={{ textAlign:'left', padding:'8px 12px', color:C.textFaint, fontWeight:500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(stats?.allocations || []).map(a => (
                <tr key={a.id}
                    onClick={() => navigate(`/allocations/${a.id}`)}
                    onMouseEnter={e => e.currentTarget.style.background = C.goldAlpha}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    style={{ cursor:'pointer', borderBottom:`1px solid ${C.border}` }}>
                  <td style={{ padding:'10px 12px', fontFamily:'Space Mono', fontSize:12, color:C.textDark }}>{a.allocation_code}</td>
                  <td style={{ padding:'10px 12px', color:C.textMed }}>{a.estate}</td>
                  <td style={{ padding:'10px 12px', color:C.textMed }}>{a.process}</td>
                  <td style={{ padding:'10px 12px' }}>
                    <span style={{ background: STATE_COLOR[a.state] || '#888', color:'#fff', borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:600 }}>
                      {a.state.replace(/_/g,' ')}
                    </span>
                  </td>
                  <td style={{ padding:'10px 12px', fontFamily:'Space Mono', fontSize:12 }}>{(a.planned_green_quantity_g/1000).toFixed(1)}</td>
                </tr>
              ))}
              {(stats?.allocations||[]).length === 0 && <tr><td colSpan={5} style={{ padding:24, textAlign:'center', color:C.textFaint }}>No allocations</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div style={{ textAlign:'center', paddingTop:60 }}>
      <p style={{ color:C.textFaint, fontSize:15, fontFamily:'Outfit' }}>
        Open the full {mod.label} module to see all data.
      </p>
      <button
        onClick={() => navigate(mod.route)}
        style={{ marginTop:24, padding:'12px 28px', background:`linear-gradient(135deg,${C.goldBright},${C.goldDark})`, color:C.surface, border:'none', borderRadius:10, fontFamily:'Outfit', fontWeight:700, fontSize:14, cursor:'pointer' }}
      >
        Go to {mod.label} →
      </button>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();
  const navigate  = useNavigate();

  // Role switcher
  const [role, setRole] = useState(user?.role || 'admin');
  const mods = MODS.filter(m => m.roles.includes(role));

  // Clock
  const [clock, setClock] = useState('');
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Stats from API
  const [dashStats, setDashStats]   = useState(null);
  const [lotStats,  setLotStats]    = useState(null);
  const [allocStats, setAllocStats] = useState(null);
  useEffect(() => {
    api.get('/dashboard-stats').then(r => r.json()).then(setDashStats).catch(() => {});
    api.get('/lots').then(r => r.json()).then(setLotStats).catch(() => {});
    api.get('/allocations').then(r => r.json()).then(d => setAllocStats(d)).catch(() => {});
  }, []);

  // Carousel state
  const [selIdx, setSelIdx]     = useState(0);
  const [detailMod, setDetailMod] = useState(null);

  // Canvas refs
  const carouselRef  = useRef(null);  // container div
  const canvasRef    = useRef(null);
  const particleRef  = useRef(null);

  // Animation state (mutable refs — no re-renders)
  const anim = useRef({
    currentAngle: Math.PI / 2,
    targetAngle:  Math.PI / 2,
    angularVel:   0,
    idleTick:     0,
    idleBob:      0,
    dragging:     false,
    dragStartX:   0,
    dragLastX:    0,
    dragVelocity: 0,
    dragDelta:    0,
    lastTime:     0,
    selIdx:       0,
    mods:         mods,
    rafId:        0,
  });

  const selIdxRef = useRef(selIdx);
  const modsRef   = useRef(mods);

  useEffect(() => { anim.current.mods = mods; modsRef.current = mods; }, [mods]);

  // ── snap helper ───────────────────────────────────────────────────────────
  const snap = useCallback(() => {
    const n = modsRef.current.length;
    const step = (2 * Math.PI) / n;
    const rawIdx = (Math.PI / 2 - anim.current.currentAngle) / step;
    const snapIdx = Math.round(rawIdx);
    const newSel = ((snapIdx % n) + n) % n;
    anim.current.targetAngle = Math.PI / 2 - snapIdx * step;
    anim.current.selIdx = newSel;
    selIdxRef.current = newSel;
    setSelIdx(newSel);
  }, []);

  // ── rotate to index ───────────────────────────────────────────────────────
  const rotateTo = useCallback((idx) => {
    const n = modsRef.current.length;
    const step = (2 * Math.PI) / n;
    const current = anim.current.currentAngle;
    let target = Math.PI / 2 - idx * step;
    // pick shortest arc
    while (target - current > Math.PI)  target -= 2 * Math.PI;
    while (current - target > Math.PI)  target += 2 * Math.PI;
    anim.current.targetAngle = target;
    anim.current.selIdx = idx;
    selIdxRef.current  = idx;
    setSelIdx(idx);
  }, []);

  // ── keyboard nav ──────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (detailMod) { if (e.key === 'Escape') setDetailMod(null); return; }
      const n = modsRef.current.length;
      if (e.key === 'ArrowLeft')  rotateTo(((selIdxRef.current - 1) + n) % n);
      if (e.key === 'ArrowRight') rotateTo((selIdxRef.current + 1) % n);
      if (e.key === 'Enter') navigate(modsRef.current[selIdxRef.current]?.route || '/');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailMod, rotateTo, navigate]);

  // ── particle system ───────────────────────────────────────────────────────
  useEffect(() => {
    const cvs = particleRef.current;
    if (!cvs) return;
    const dpr = window.devicePixelRatio || 1;
    const W = window.innerWidth, H = window.innerHeight;
    cvs.width  = Math.round(W * dpr);
    cvs.height = Math.round(H * dpr);
    cvs.style.width  = W + 'px';
    cvs.style.height = H + 'px';
    const pctx = cvs.getContext('2d');
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const COUNT = 50;
    const particles = Array.from({ length: COUNT }, () => ({
      x:       Math.random() * W,
      y:       Math.random() * H,
      r:       0.4 + Math.random() * 1.8,
      speed:   0.15 + Math.random() * 0.45,
      opacity: 0.06 + Math.random() * 0.12,
      drift:   (Math.random() - 0.5) * 0.44,
      gold:    Math.random() > 0.5,
    }));

    let rafId;
    function draw() {
      pctx.clearRect(0, 0, W, H);
      particles.forEach(p => {
        p.y    -= p.speed;
        p.x    += p.drift;
        if (p.y < -8) { p.y = H + 4; p.x = Math.random() * W; }
        const [r,g,b] = p.gold ? [196,154,60] : [166,124,46];
        pctx.beginPath();
        pctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        pctx.fillStyle = `rgba(${r},${g},${b},${p.opacity})`;
        pctx.fill();
      });
      rafId = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(rafId);
  }, []);

  // ── main carousel loop ────────────────────────────────────────────────────
  useEffect(() => {
    const cvs = canvasRef.current;
    const area = carouselRef.current;
    if (!cvs || !area) return;

    const ctx = cvs.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    let W = 0, H = 0, orx = 0, ory = 0, cx = 0, cy = 0;

    function resize() {
      const rect = area.getBoundingClientRect();
      W = rect.width; H = rect.height;
      cvs.width  = Math.round(W * dpr);
      cvs.height = Math.round(H * dpr);
      cvs.style.width  = W + 'px';
      cvs.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = W / 2; cy = H / 2;
      const m = Math.min(W, H);
      orx = m * 0.38; ory = m * 0.15;
    }

    const ro = new ResizeObserver(resize);
    ro.observe(area);
    resize();

    // Card positions cache for tap detection
    const cardPos = [];

    function frame(ts) {
      const dt = Math.min((ts - anim.current.lastTime) / 16.67, 3);
      anim.current.lastTime = ts;

      const a = anim.current;

      if (!a.dragging) {
        const diff = a.targetAngle - a.currentAngle;
        a.angularVel = a.angularVel * 0.75 + diff * 0.16;
        a.currentAngle += a.angularVel * dt;

        a.idleTick += dt * 0.018;
        a.idleBob   = Math.sin(a.idleTick) * 5;
      }

      const n = a.mods.length;
      ctx.clearRect(0, 0, W, H);

      // Dashed orbit ellipse
      const bob = a.dragging ? 0 : a.idleBob;
      ctx.save();
      ctx.strokeStyle = 'rgba(166,124,46,0.18)';
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 10]);
      ctx.lineDashOffset = -(a.idleTick * 20);
      ctx.beginPath();
      ctx.ellipse(cx, cy + bob, orx, ory, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Sort back-to-front by depth
      const items = Array.from({ length: n }, (_, i) => {
        const angle = a.currentAngle + i * (2 * Math.PI / n);
        const depth = (Math.sin(angle) + 1) / 2;
        return { i, angle, depth };
      }).sort((a, b) => a.depth - b.depth);

      cardPos.length = 0;

      items.forEach(({ i, angle, depth }) => {
        const px = cx + orx * Math.cos(angle);
        const py = cy + ory * Math.sin(angle) + bob;
        const isSel = i === a.selIdx;
        const base  = Math.min(W, H) * 0.155;
        const depthScale   = 0.44 + depth * 0.56;
        const selectedScale = isSel ? 1.2 : 1.0;
        const size  = base * depthScale * selectedScale;
        const alpha = 0.30 + depth * 0.70;
        const mod   = a.mods[i];
        const [mr, mg, mb] = hexToRgb(mod.color);

        cardPos.push({ i, x: px, y: py, size });

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(px, py);

        // Glow halo for selected
        if (isSel) {
          const hg = ctx.createRadialGradient(0, 0, size * 0.3, 0, 0, size * 2);
          hg.addColorStop(0, `rgba(${mr},${mg},${mb},0.18)`);
          hg.addColorStop(1, 'transparent');
          ctx.fillStyle = hg;
          ctx.beginPath(); ctx.arc(0, 0, size * 2, 0, Math.PI * 2); ctx.fill();
        }

        // Card shadow
        ctx.shadowColor  = isSel ? `rgba(${mr},${mg},${mb},0.35)` : 'rgba(44,24,16,0.10)';
        ctx.shadowBlur   = isSel ? 28 : 12;
        ctx.shadowOffsetY = isSel ? 4 : 3;

        const r = size * 0.28;
        const hw = size * 0.75, hh = size * 0.9;

        // Card fill
        const grad = ctx.createLinearGradient(-hw, -hh, hw, hh);
        if (isSel) {
          grad.addColorStop(0, `rgba(${mr},${mg},${mb},0.18)`);
          grad.addColorStop(1, `rgba(${mr},${mg},${mb},0.06)`);
        } else {
          grad.addColorStop(0, 'rgba(255,254,251,0.85)');
          grad.addColorStop(1, 'rgba(245,240,232,0.70)');
        }
        roundRect(ctx, -hw, -hh, hw * 2, hh * 2, r);
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
        ctx.fillStyle = grad;
        ctx.fill();

        // Border
        ctx.strokeStyle = isSel ? `rgba(${mr},${mg},${mb},0.70)` : 'rgba(166,124,46,0.28)';
        ctx.lineWidth   = isSel ? 1.8 : 1;
        roundRect(ctx, -hw, -hh, hw * 2, hh * 2, r);
        ctx.stroke();

        // Top accent bar
        if (isSel) {
          ctx.fillStyle = `rgba(${mr},${mg},${mb},0.80)`;
          ctx.beginPath();
          ctx.moveTo(-hw + r, -hh);
          ctx.arcTo(hw, -hh, hw, -hh + r, r);
          ctx.lineTo(hw, -hh + hh * 0.04);
          ctx.lineTo(-hw, -hh + hh * 0.04);
          ctx.arcTo(-hw, -hh, -hw + r, -hh, r);
          ctx.closePath();
          ctx.fill();
        }

        // Top shimmer
        const shim = ctx.createLinearGradient(0, -hh, 0, -hh + hh * 0.76);
        shim.addColorStop(0, 'rgba(255,255,255,0.60)');
        shim.addColorStop(1, 'rgba(255,255,255,0)');
        roundRect(ctx, -hw, -hh, hw * 2, hh * 2, r);
        ctx.fillStyle = shim;
        ctx.fill();

        // Icon
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
        const iconColor = isSel ? mod.color : `rgba(${mr},${mg},${mb},0.65)`;
        drawIcon(ctx, mod.id, 0, -hh * 0.1, size, iconColor);

        // Label
        ctx.shadowColor = 'transparent';
        ctx.font = `${600} ${Math.max(9, size * 0.17)}px Outfit, sans-serif`;
        ctx.fillStyle = isSel ? mod.color : C.textMed;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(mod.label, 0, hh * 0.58);

        ctx.restore();
      });

      anim.current.rafId = requestAnimationFrame(frame);
    }

    anim.current.lastTime = performance.now();
    anim.current.rafId = requestAnimationFrame(frame);

    // ── Drag / tap handlers ─────────────────────────────────────────────────
    function getClientX(e) { return e.touches ? e.touches[0].clientX : e.clientX; }

    function onPointerDown(e) {
      anim.current.dragging     = true;
      anim.current.dragStartX   = getClientX(e);
      anim.current.dragLastX    = getClientX(e);
      anim.current.dragVelocity = 0;
      anim.current.dragDelta    = 0;
    }

    function onPointerMove(e) {
      if (!anim.current.dragging) return;
      if (e.cancelable) e.preventDefault();
      const cx2 = getClientX(e);
      const dx  = cx2 - anim.current.dragLastX;
      anim.current.currentAngle += dx * 0.006;
      anim.current.targetAngle   = anim.current.currentAngle;
      anim.current.dragVelocity  = dx;
      anim.current.dragDelta    += Math.abs(cx2 - anim.current.dragStartX);
      anim.current.dragLastX    = cx2;
    }

    function onPointerUp(e) {
      if (!anim.current.dragging) return;
      anim.current.dragging = false;

      // Tap: small movement → find closest card and rotate to it
      if (anim.current.dragDelta < 10) {
        const rect  = area.getBoundingClientRect();
        const tapX  = (e.changedTouches ? e.changedTouches[0].clientX : e.clientX) - rect.left;
        const tapY  = (e.changedTouches ? e.changedTouches[0].clientY : e.clientY) - rect.top;
        let best = -1, bestDist = Infinity;
        cardPos.forEach(({ i, x, y, size }) => {
          const d = Math.hypot(tapX - x, tapY - y);
          if (d < Math.max(60, size * 0.9) && d < bestDist) { bestDist = d; best = i; }
        });
        if (best >= 0) { rotateTo(best); return; }
      }

      // Momentum + snap
      anim.current.angularVel = anim.current.dragVelocity * 0.013;
      snap();
    }

    cvs.addEventListener('mousedown',  onPointerDown);
    window.addEventListener('mousemove',  onPointerMove);
    window.addEventListener('mouseup',    onPointerUp);
    cvs.addEventListener('touchstart', onPointerDown, { passive: true });
    cvs.addEventListener('touchmove',  onPointerMove, { passive: false });
    cvs.addEventListener('touchend',   onPointerUp);

    return () => {
      cancelAnimationFrame(anim.current.rafId);
      ro.disconnect();
      cvs.removeEventListener('mousedown',  onPointerDown);
      window.removeEventListener('mousemove',  onPointerMove);
      window.removeEventListener('mouseup',    onPointerUp);
      cvs.removeEventListener('touchstart', onPointerDown);
      cvs.removeEventListener('touchmove',  onPointerMove);
      cvs.removeEventListener('touchend',   onPointerUp);
    };
  }, [snap, rotateTo]);

  // ── When mods list changes (role switch) reset selIdx ─────────────────────
  useEffect(() => {
    anim.current.selIdx = 0;
    selIdxRef.current   = 0;
    setSelIdx(0);
    rotateTo(0);
  }, [role, rotateTo]);

  const selectedMod = mods[selIdx] || mods[0];

  // Info panel transition
  const [panelKey, setPanelKey] = useState(0);
  const [panelVisible, setPanelVisible] = useState(true);
  useEffect(() => {
    setPanelVisible(false);
    const t = setTimeout(() => { setPanelKey(k => k + 1); setPanelVisible(true); }, 150);
    return () => clearTimeout(t);
  }, [selIdx]);

  // Detail API data
  const [detailData, setDetailData] = useState({});
  useEffect(() => {
    if (!detailMod) return;
    if (detailMod.id === 'inventory' && lotStats)   setDetailData(d => ({ ...d, inventory: lotStats }));
    if (detailMod.id === 'allocations' && allocStats) setDetailData(d => ({ ...d, allocations: allocStats }));
  }, [detailMod, lotStats, allocStats]);

  return (
    <>
      {/* Particle canvas — fixed full-screen behind everything */}
      <canvas
        ref={particleRef}
        style={{ position:'fixed', inset:0, zIndex:1, pointerEvents:'none' }}
      />

      {/* CSS orbit rings — positioned behind carousel canvas */}
      <div id="css-rings" style={{ position:'fixed', inset:0, zIndex:2, pointerEvents:'none' }} />

      {/* Main wrap */}
      <div style={{
        position:'fixed', inset:0, zIndex:10,
        display:'flex', flexDirection:'column',
        background:'radial-gradient(ellipse 90% 70% at 15% 5%,#E8DCCA 0%,transparent 50%),radial-gradient(ellipse 70% 60% at 85% 95%,#EDDFCC 0%,transparent 50%),#F5F0E8',
        fontFamily:'Outfit, sans-serif',
        overflow:'hidden',
      }}>

        {/* ── Topbar ───────────────────────────────────────────────────── */}
        <div style={{
          height:56, flexShrink:0,
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'0 20px',
          background:'rgba(255,254,251,0.92)',
          backdropFilter:'blur(24px)',
          borderBottom:`1px solid ${C.border}`,
          boxShadow:`0 1px 0 0 ${C.goldAlpha}, 0 2px 12px ${C.shadow}`,
          position:'relative', zIndex:20,
        }}>
          {/* Brand */}
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ position:'relative', width:34, height:34 }}>
              <div style={{
                position:'absolute', inset:0, borderRadius:'50%',
                border:`1.5px solid ${C.gold}`,
                animation:'spin 9s linear infinite',
              }}>
                <div style={{
                  position:'absolute', top:-3, left:'50%', transform:'translateX(-50%)',
                  width:6, height:6, borderRadius:'50%',
                  background:C.goldBright,
                  boxShadow:`0 0 6px ${C.goldBright}`,
                }} />
              </div>
              <div style={{
                position:'absolute', inset:6,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:13,
              }}>☕</div>
            </div>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:C.textDark, fontFamily:'Playfair Display', lineHeight:1.1 }}>One Estate Coffee</div>
              <div style={{ fontSize:10, color:C.textFaint, letterSpacing:'0.08em', textTransform:'uppercase' }}>Ops Center</div>
            </div>
          </div>

          {/* Status pill — hidden on mobile */}
          <div className="topbar-center" style={{ display:'flex', alignItems:'center', gap:7, background:C.goldAlpha, border:`1px solid ${C.border}`, borderRadius:20, padding:'4px 12px' }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:'#22C55E', boxShadow:'0 0 6px #22C55E' }} />
            <span style={{ fontSize:11, color:C.textDim, fontWeight:500 }}>All systems nominal</span>
          </div>

          {/* Right: clock + role */}
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <span id="clock-display" style={{ fontFamily:'Space Mono', fontSize:12, color:C.textFaint }}>{clock}</span>
            <div style={{ display:'flex', gap:3, background:C.goldAlpha, borderRadius:8, padding:3, border:`1px solid ${C.border}` }}>
              {['admin','roaster','viewer'].map(r => (
                <button key={r} onClick={() => setRole(r)} style={{
                  padding:'4px 10px', borderRadius:6, border:'none', cursor:'pointer',
                  fontSize:11, fontWeight:role === r ? 700 : 400,
                  background: role === r ? `linear-gradient(135deg,${C.goldBright},${C.goldDark})` : 'transparent',
                  color: role === r ? C.surface : C.textDim,
                  transition:'all 0.18s',
                  textTransform:'capitalize',
                }}>
                  {r === 'roaster' ? 'Roast' : r === 'viewer' ? 'View' : 'Admin'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Stage ─────────────────────────────────────────────────────── */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0 }}>

          {/* Carousel area — flex:1, canvas lives here */}
          <div ref={carouselRef} style={{ flex:1, position:'relative', minHeight:0 }}>
            <canvas
              ref={canvasRef}
              style={{ position:'absolute', inset:0, zIndex:5, cursor:'grab', touchAction:'none' }}
            />
          </div>

          {/* Info panel — flex-shrink:0, NEVER overlaps canvas */}
          <div style={{
            flexShrink:0, height:220,
            background:'rgba(255,254,251,0.88)',
            backdropFilter:'blur(20px)',
            borderTop:`1px solid ${C.border}`,
            padding:'16px 24px 12px',
            zIndex:15,
          }}>
            {selectedMod && (
              <InfoPanel
                key={panelKey}
                mod={selectedMod}
                visible={panelVisible}
                dashStats={dashStats}
                navigate={navigate}
                onOpen={() => setDetailMod(selectedMod)}
              />
            )}
          </div>
        </div>

        {/* ── Status bar — hidden on mobile ─────────────────────────────── */}
        <div className="statusbar" style={{
          height:26, flexShrink:0,
          background:'rgba(255,254,251,0.85)',
          borderTop:`1px solid ${C.border}`,
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'0 20px', fontSize:10, color:C.textFaint,
          fontFamily:'Space Mono',
        }}>
          <span>OEC Ops · {user?.email}</span>
          <span>{mods.length} modules · {role}</span>
          <span>{new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</span>
        </div>
      </div>

      {/* ── Module Detail slide-in ──────────────────────────────────────── */}
      <div style={{
        position:'fixed', inset:0, zIndex:300,
        transform: detailMod ? 'translateX(0)' : 'translateX(102%)',
        transition:'transform 0.48s cubic-bezier(0.25,0.46,0.45,0.94)',
        background:C.bg,
        display:'flex', flexDirection:'column',
        overflowY:'auto',
      }}>
        {detailMod && (
          <>
            {/* Detail topbar */}
            <div style={{
              height:56, flexShrink:0,
              display:'flex', alignItems:'center', gap:16,
              padding:'0 20px',
              background:C.surface,
              borderBottom:`1px solid ${C.border}`,
              position:'sticky', top:0, zIndex:10,
            }}>
              <button onClick={() => setDetailMod(null)} style={{
                background:'none', border:'none', cursor:'pointer',
                color:C.gold, fontWeight:700, fontSize:14, fontFamily:'Outfit',
                display:'flex', alignItems:'center', gap:6,
              }}>← Back</button>
              <div style={{ width:10, height:10, borderRadius:'50%', background:detailMod.color }} />
              <span style={{ fontFamily:'Playfair Display', fontSize:17, color:C.textDark, fontWeight:600 }}>{detailMod.label}</span>
              <span style={{ fontSize:10, background:C.goldAlpha, color:C.gold, border:`1px solid ${C.border}`, borderRadius:4, padding:'2px 7px', fontWeight:700, letterSpacing:'0.05em' }}>PREVIEW</span>
              <span style={{ marginLeft:'auto', fontFamily:'Space Mono', fontSize:12, color:C.textFaint }}>{clock}</span>
            </div>

            {/* Summary stat cards */}
            <div style={{ padding:'20px 24px 0', display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:12 }}>
              {detailMod.stats.map((s, i) => (
                <div key={i} style={{
                  background:C.surface, borderRadius:12, padding:'14px 16px',
                  border:`1px solid ${C.border}`,
                  borderTop:`2px solid ${detailMod.color}`,
                  boxShadow:`0 2px 8px ${C.shadow}`,
                }}>
                  <div style={{ fontSize:11, color:C.textFaint, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>{s.label}</div>
                  <div style={{ fontFamily:'Space Mono', fontSize:20, color:C.textDark, fontWeight:700 }}>{s.val}</div>
                </div>
              ))}
            </div>

            {/* Content */}
            <div style={{ padding:24 }}>
              <DetailContent
                mod={detailMod}
                stats={detailMod.id === 'inventory' ? detailData.inventory : detailMod.id === 'allocations' ? detailData.allocations : null}
              />
            </div>

            {/* Action buttons */}
            <div style={{ padding:'0 24px 32px', display:'flex', gap:12, flexWrap:'wrap' }}>
              {detailMod.actions.map((a, i) => (
                <button key={i} onClick={() => navigate(a.route)} style={{
                  padding:'10px 22px', borderRadius:10, border:'none', cursor:'pointer',
                  fontFamily:'Outfit', fontWeight:700, fontSize:14,
                  background: a.primary ? `linear-gradient(135deg,${C.goldBright},${C.goldDark})` : C.goldAlpha,
                  color: a.primary ? C.surface : C.textDark,
                  boxShadow: a.primary ? `0 4px 16px rgba(166,124,46,0.35)` : 'none',
                  outline: a.primary ? 'none' : `1px solid ${C.border}`,
                  transition:'all 0.18s',
                }}>
                  {a.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
        @keyframes bgbr { from { filter:brightness(0.98); } to { filter:brightness(1.04); } }
        @media (max-width:640px) { .topbar-center { display:none !important; } .statusbar { display:none !important; } }
        @media (max-width:480px) { #clock-display { display:none; } }
        * { box-sizing:border-box; margin:0; padding:0; }
      `}</style>
    </>
  );
}

// ── Info Panel ──────────────────────────────────────────────────────────────
function InfoPanel({ mod, visible, dashStats, navigate, onOpen }) {
  const base = { opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(10px)', transition:'opacity 0.32s cubic-bezier(0.34,1.56,0.64,1), transform 0.32s cubic-bezier(0.34,1.56,0.64,1)' };
  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', gap:10 }}>
      {/* Name + subtitle */}
      <div style={{ ...base, transitionDelay:'0ms' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:mod.color, boxShadow:`0 0 8px ${mod.color}` }} />
          <span style={{ fontFamily:'Playfair Display', fontSize:20, color:mod.color, fontWeight:600 }}>{mod.label}</span>
        </div>
        <div style={{ fontSize:10, color:C.textFaint, letterSpacing:'0.12em', textTransform:'uppercase', marginTop:2, marginLeft:18 }}>{mod.sub}</div>
      </div>

      {/* Stats row */}
      <div style={{ ...base, transitionDelay:'45ms', display:'flex', gap:1, background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, overflow:'hidden', flex:1, maxHeight:68 }}>
        {mod.stats.map((s, i) => (
          <div key={i} style={{
            flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'6px 8px',
            borderRight: i < mod.stats.length - 1 ? `1px solid ${C.border}` : 'none',
          }}>
            <span style={{ fontFamily:'Space Mono', fontSize:16, color:C.textDark, fontWeight:700, lineHeight:1.1 }}>{s.val}</span>
            <span style={{ fontSize:10, color:C.textFaint, marginTop:3, textAlign:'center', letterSpacing:'0.04em' }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div style={{ ...base, transitionDelay:'90ms', display:'flex', gap:8 }}>
        <button onClick={() => navigate(mod.route)} style={{
          flex:1, padding:'9px 0', borderRadius:10, border:'none', cursor:'pointer',
          background:`linear-gradient(135deg,${C.goldBright},${C.goldDark})`,
          color:C.surface, fontFamily:'Outfit', fontWeight:700, fontSize:13,
          boxShadow:`0 4px 14px rgba(166,124,46,0.35)`,
        }}>
          Open Module ↗
        </button>
        <button onClick={onOpen} style={{
          padding:'9px 16px', borderRadius:10, cursor:'pointer',
          background:C.goldAlpha, color:C.textDark,
          fontFamily:'Outfit', fontWeight:600, fontSize:13,
          border:`1px solid ${C.border}`,
        }}>
          Preview
        </button>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return [r, g, b];
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}
