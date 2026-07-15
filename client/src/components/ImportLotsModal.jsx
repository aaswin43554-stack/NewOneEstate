import { useState, useRef } from 'react';
import { api } from '../lib/api';
import { Button } from './ui';
import { X, Upload } from 'lucide-react';

const EXPECTED_HEADERS = [
  'lot_code', 'estate', 'process', 'harvest_year', 'arrival_date',
  'arrival_weight_g', 'storage_location', 'moisture_content', 'water_activity', 'supplier_notes',
];

// Minimal RFC 4180 CSV parser — handles quoted fields, escaped quotes ("")
// and commas/newlines inside quotes. Matches the escaping export.js writes.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function rowsToObjects(csvRows) {
  if (csvRows.length === 0) return [];
  const headers = csvRows[0].map(h => h.trim());
  return csvRows.slice(1)
    .filter(r => r.some(cell => cell.trim() !== ''))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
}

export default function ImportLotsModal({ onClose, onImported }) {
  const [fileName, setFileName] = useState('');
  const [rows,     setRows]     = useState([]);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState(null); // { created, failed }
  const fileInputRef = useRef(null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setResult(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = rowsToObjects(parseCSV(String(reader.result)));
      if (parsed.length === 0) {
        setError('No data rows found in this file.');
        setRows([]);
        return;
      }
      setRows(parsed);
    };
    reader.onerror = () => setError('Could not read that file.');
    reader.readAsText(file);
  }

  async function handleImport() {
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await api.post('/lots/import', { rows });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Import failed.'); return; }
      setResult(data);
      if (data.created.length > 0) onImported();
    } catch {
      setError('Network error — import did not complete.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(34,21,8,0.2)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl border border-coffee-200 w-full max-w-lg my-8">
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid #F2EAE0' }}
        >
          <h2 className="text-base text-coffee-900" style={{ fontWeight: 500 }}>
            Import Lots from CSV
          </h2>
          <button onClick={onClose} className="text-coffee-400 hover:text-coffee-700 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-coffee-400">
            Columns: <span className="font-mono">{EXPECTED_HEADERS.join(', ')}</span>.
            {' '}<span style={{ fontWeight: 500 }}>lot_code</span>, <span style={{ fontWeight: 500 }}>estate</span>,{' '}
            <span style={{ fontWeight: 500 }}>process</span>, <span style={{ fontWeight: 500 }}>harvest_year</span>,{' '}
            <span style={{ fontWeight: 500 }}>arrival_date</span>, <span style={{ fontWeight: 500 }}>arrival_weight_g</span>{' '}
            and <span style={{ fontWeight: 500 }}>storage_location</span> are required.
          </p>

          {error && (
            <div className="px-3 py-2.5 rounded-lg text-sm" style={{ background: '#FCEBEB', color: '#A32D2D' }}>
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed transition-colors hover:bg-coffee-50"
            style={{ borderColor: '#E0D0BC' }}
          >
            <Upload size={20} className="text-coffee-400" />
            <span className="text-sm text-coffee-600">
              {fileName || 'Click to choose a .csv file'}
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            className="hidden"
          />

          {rows.length > 0 && !result && (
            <p className="text-sm text-coffee-600">
              {rows.length} row{rows.length !== 1 ? 's' : ''} ready to import.
            </p>
          )}

          {result && (
            <div className="space-y-2">
              <p className="text-sm" style={{ color: '#3B6D11', fontWeight: 500 }}>
                {result.created.length} lot{result.created.length !== 1 ? 's' : ''} created.
              </p>
              {result.failed.length > 0 && (
                <div className="rounded-lg border max-h-48 overflow-y-auto" style={{ borderColor: '#F3C0C0' }}>
                  {result.failed.map(f => (
                    <div
                      key={f.row}
                      className="px-3 py-2 text-xs border-b last:border-0"
                      style={{ borderColor: '#F3C0C0' }}
                    >
                      <span style={{ fontWeight: 500 }}>Row {f.row}{f.lot_code ? ` (${f.lot_code})` : ''}:</span>{' '}
                      <span style={{ color: '#A32D2D' }}>{f.error}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1 justify-center">
              {result ? 'Close' : 'Cancel'}
            </Button>
            {!result && (
              <Button
                type="button"
                variant="primary"
                onClick={handleImport}
                disabled={loading || rows.length === 0}
                className="flex-1 justify-center"
              >
                {loading ? 'Importing…' : `Import ${rows.length || ''} Row${rows.length !== 1 ? 's' : ''}`}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
