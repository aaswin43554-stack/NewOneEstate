/**
 * OEC Ops shared component library
 * All components use the coffee color scale exclusively.
 * Max font-weight: 500. No shadows, no gradients. Borders only.
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronUp, ChevronDown, X } from 'lucide-react';

// ─── Button ────────────────────────────────────────────────────────────────────
export function Button({ variant = 'primary', size = 'md', children, className = '', ...props }) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors duration-150 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed';

  const sizes = {
    sm:  'h-7  px-3 text-xs',
    md:  'h-8  px-4 text-sm',
    lg:  'h-9  px-5 text-sm',
  };

  const variants = {
    primary:     'bg-coffee-700 text-white hover:bg-coffee-800',
    secondary:   'bg-white border border-coffee-200 text-coffee-700 hover:bg-coffee-50',
    ghost:       'text-coffee-500 hover:text-coffee-700 hover:bg-coffee-100',
    destructive: 'text-[#A32D2D] hover:text-[#A32D2D]',
  };

  const destructiveStyle =
    variant === 'destructive'
      ? { background: '#FCEBEB' }
      : {};

  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      style={destructiveStyle}
      {...props}
    >
      {children}
    </button>
  );
}

// ─── StatusBadge ───────────────────────────────────────────────────────────────
const STATUS_META = {
  draft:        { cls: 'badge-draft',        dot: '#888780', label: 'Draft' },
  under_review: { cls: 'badge-under-review', dot: '#BA7517', label: 'Under Review' },
  published:    { cls: 'badge-published',    dot: '#3B6D11', label: 'Published' },
  active:       { cls: 'badge-published',    dot: '#3B6D11', label: 'Active' },
  missing:      { cls: 'badge-missing',      dot: '#A32D2D', label: 'Missing' },
  archived:     { cls: 'badge-draft',        dot: '#888780', label: 'Archived' },
};

export function StatusBadge({ status, label }) {
  const meta = STATUS_META[status] || STATUS_META.missing;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs ${meta.cls}`}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: meta.dot }}
      />
      {label || meta.label}
    </span>
  );
}

// ─── ProcessBadge ──────────────────────────────────────────────────────────────
const PROCESS_META = {
  Washed:    'badge-washed',
  Honey:     'badge-honey',
  Natural:   'badge-natural',
  Anaerobic: 'badge-anaerobic',
};

export function ProcessBadge({ process }) {
  const cls = PROCESS_META[process] || 'badge-draft';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${cls}`}>
      {process}
    </span>
  );
}

// ─── StatCard ──────────────────────────────────────────────────────────────────
export function StatCard({ label, value, trend, trendUp, accentColor = '#A8896A', className = '' }) {
  return (
    <div
      className={`bg-white border border-coffee-200 rounded-xl p-5 ${className}`}
      style={{ borderLeft: `3px solid ${accentColor}` }}
    >
      <p className="text-xs text-coffee-400 uppercase tracking-wide mb-2">{label}</p>
      <p className="text-[28px] leading-none text-coffee-900" style={{ fontWeight: 500 }}>
        {value}
      </p>
      {trend && (
        <p
          className="text-xs mt-2"
          style={{
            color: trendUp
              ? 'var(--status-published-text)'
              : 'var(--status-missing-text)',
          }}
        >
          {trend}
        </p>
      )}
    </div>
  );
}

// ─── DataTable ─────────────────────────────────────────────────────────────────
export function DataTable({
  columns,
  rows,
  onRowClick,
  emptyMessage = 'No data found.',
  loading = false,
  keyField = 'id',
}) {
  const [sortCol, setSortCol]   = useState(null);
  const [sortDir, setSortDir]   = useState('asc');
  const [hoveredRow, setHovered] = useState(null);

  function toggleSort(col) {
    if (!col.sortable) return;
    if (sortCol === col.key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col.key);
      setSortDir('asc');
    }
  }

  let displayRows = rows;
  if (sortCol) {
    displayRows = [...rows].sort((a, b) => {
      const av = a[sortCol] ?? '';
      const bv = b[sortCol] ?? '';
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-coffee-200 bg-white">
      <table className="w-full">
        <thead>
          <tr className="bg-coffee-50 border-b border-coffee-100">
            {columns.map(col => (
              <th
                key={col.key}
                onClick={() => toggleSort(col)}
                className={`px-4 py-3 text-left text-xs text-coffee-400 uppercase tracking-wide h-10 ${
                  col.sortable ? 'cursor-pointer select-none hover:text-coffee-600' : ''
                } ${col.align === 'right' ? 'text-right' : ''}`}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {col.sortable && (
                    <span className="flex flex-col">
                      <ChevronUp
                        size={10}
                        style={{
                          color:
                            sortCol === col.key && sortDir === 'asc'
                              ? '#6F5035'
                              : '#C9B49A',
                        }}
                      />
                      <ChevronDown
                        size={10}
                        style={{
                          color:
                            sortCol === col.key && sortDir === 'desc'
                              ? '#6F5035'
                              : '#C9B49A',
                        }}
                      />
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-sm text-coffee-300"
              >
                Loading…
              </td>
            </tr>
          ) : displayRows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-sm text-coffee-300"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            displayRows.map((row, idx) => (
              <tr
                key={row[keyField] || idx}
                onClick={() => onRowClick?.(row)}
                onMouseEnter={() => setHovered(row[keyField] || idx)}
                onMouseLeave={() => setHovered(null)}
                className={`border-b border-coffee-100 h-12 ${
                  onRowClick ? 'cursor-pointer' : ''
                }`}
                style={{
                  background:
                    hoveredRow === (row[keyField] || idx) ? '#FDFAF6' : '#FFFFFF',
                }}
              >
                {columns.map(col => (
                  <td
                    key={col.key}
                    className={`px-4 text-sm text-coffee-800 ${
                      col.align === 'right' ? 'text-right' : ''
                    }`}
                  >
                    {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── FormInput ─────────────────────────────────────────────────────────────────
export function FormInput({
  label,
  helper,
  error,
  id,
  type = 'text',
  className = '',
  containerClass = '',
  ...props
}) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  const hasError = !!error;

  return (
    <div className={`flex flex-col gap-1 ${containerClass}`}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm text-coffee-600"
          style={{ fontWeight: 500 }}
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        type={type}
        className={`h-9 px-3 text-sm text-coffee-900 bg-white rounded-lg border transition-colors duration-150 ${
          hasError
            ? 'border-[#A32D2D] ring-2 ring-[#FCEBEB]'
            : 'border-coffee-200 focus:border-coffee-500 focus:ring-2 focus:ring-coffee-100'
        } ${className}`}
        {...props}
      />
      {helper && !error && (
        <p className="text-xs text-coffee-400">{helper}</p>
      )}
      {error && (
        <p className="text-xs" style={{ color: '#A32D2D' }}>
          {error}
        </p>
      )}
    </div>
  );
}

export function FormTextarea({ label, helper, error, id, className = '', containerClass = '', ...props }) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  const hasError = !!error;
  return (
    <div className={`flex flex-col gap-1 ${containerClass}`}>
      {label && (
        <label htmlFor={inputId} className="text-sm text-coffee-600" style={{ fontWeight: 500 }}>
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        className={`px-3 py-2 text-sm text-coffee-900 bg-white rounded-lg border transition-colors duration-150 resize-none ${
          hasError
            ? 'border-[#A32D2D] ring-2 ring-[#FCEBEB]'
            : 'border-coffee-200 focus:border-coffee-500 focus:ring-2 focus:ring-coffee-100'
        } ${className}`}
        {...props}
      />
      {helper && !error && <p className="text-xs text-coffee-400">{helper}</p>}
      {error && <p className="text-xs" style={{ color: '#A32D2D' }}>{error}</p>}
    </div>
  );
}

export function FormSelect({ label, helper, error, id, className = '', containerClass = '', children, ...props }) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  const hasError = !!error;
  return (
    <div className={`flex flex-col gap-1 ${containerClass}`}>
      {label && (
        <label htmlFor={inputId} className="text-sm text-coffee-600" style={{ fontWeight: 500 }}>
          {label}
        </label>
      )}
      <select
        id={inputId}
        className={`h-9 px-3 text-sm text-coffee-900 bg-white rounded-lg border transition-colors duration-150 ${
          hasError
            ? 'border-[#A32D2D] ring-2 ring-[#FCEBEB]'
            : 'border-coffee-200 focus:border-coffee-500 focus:ring-2 focus:ring-coffee-100'
        } ${className}`}
        {...props}
      >
        {children}
      </select>
      {helper && !error && <p className="text-xs text-coffee-400">{helper}</p>}
      {error && <p className="text-xs" style={{ color: '#A32D2D' }}>{error}</p>}
    </div>
  );
}

// ─── RightPanel ────────────────────────────────────────────────────────────────
export function RightPanel({ open, onClose, title, children, width = 400 }) {
  const overlayRef = useRef(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        ref={overlayRef}
        className="flex-1"
        style={{ background: 'rgba(34, 21, 8, 0.20)' }}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className="panel-slide-in bg-white border-l border-coffee-200 flex flex-col h-full overflow-hidden"
        style={{ width }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-coffee-100 flex-shrink-0">
          <h2 className="text-sm text-coffee-800" style={{ fontWeight: 500 }}>
            {title}
          </h2>
          <button onClick={onClose} className="text-coffee-400 hover:text-coffee-700 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Toast ─────────────────────────────────────────────────────────────────────
export function Toast({ message, type = 'info', onDismiss }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss?.(), 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const colors = {
    info:    { bg: '#F2EAE0', text: '#533A24' },
    success: { bg: '#EAF3DE', text: '#3B6D11' },
    error:   { bg: '#FCEBEB', text: '#A32D2D' },
    warning: { bg: '#FAEEDA', text: '#BA7517' },
  };
  const c = colors[type] || colors.info;

  return (
    <div
      className="toast-enter fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm flex items-center gap-3 border"
      style={{ background: c.bg, color: c.text, borderColor: c.text + '33', minWidth: 240 }}
    >
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} className="opacity-60 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  );
}

// ─── FilterPills ───────────────────────────────────────────────────────────────
export function FilterPills({ options, value, onChange, className = '' }) {
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {options.map(opt => {
        const optVal = typeof opt === 'string' ? opt : opt.value;
        const optLabel = typeof opt === 'string' ? opt : opt.label;
        const isActive = value === optVal;
        return (
          <button
            key={optVal}
            onClick={() => onChange(optVal)}
            className="h-7 px-3 rounded-full text-xs transition-colors duration-150"
            style={{
              background: isActive ? '#533A24' : '#F2EAE0',
              color:      isActive ? '#FFFFFF' : '#8B6A47',
              fontWeight: isActive ? 500 : 400,
            }}
          >
            {optLabel}
          </button>
        );
      })}
    </div>
  );
}

// ─── PageHeader ────────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-xl text-coffee-900" style={{ fontWeight: 500 }}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-coffee-400 mt-0.5">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// ─── EmptyState ────────────────────────────────────────────────────────────────
export function EmptyState({ message, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-sm text-coffee-400 mb-3">{message}</p>
      {action}
    </div>
  );
}

// ─── SectionLabel ──────────────────────────────────────────────────────────────
export function SectionLabel({ children }) {
  return (
    <p className="text-xs text-coffee-300 uppercase tracking-[0.08em] mb-1.5 px-3">
      {children}
    </p>
  );
}

// ─── PanelField ────────────────────────────────────────────────────────────────
export function PanelField({ label, value, className = '' }) {
  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      <span className="text-xs text-coffee-400 uppercase tracking-wide">{label}</span>
      <span className="text-sm text-coffee-800">{value ?? '—'}</span>
    </div>
  );
}
