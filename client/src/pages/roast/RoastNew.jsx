import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';

const PROCESSES = ['Washed', 'Honey', 'Natural', 'Anaerobic'];

export default function RoastNew() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preselectedAlloc = params.get('allocation_id');

  const [mode, setMode]         = useState('production');
  const [allocations, setAllocs] = useState([]);
  const [allocId, setAllocId]   = useState(preselectedAlloc || '');
  const [process, setProcess]   = useState('Washed');
  const [chargeTemp, setChargeTemp] = useState('');
  const [greenKg, setGreenKg]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    api.get('/allocations?state=roasting_in_progress')
      .then(r => r.json())
      .then(d => setAllocs(d.allocations || []))
      .catch(() => {});
  }, []);

  const greenG = greenKg ? Math.round(parseFloat(greenKg) * 1000) : null;

  const chargeTempWarn = chargeTemp && (parseInt(chargeTemp) < 170 || parseInt(chargeTemp) > 250);
  const greenWarn = greenKg && (parseFloat(greenKg) < 0.1 || parseFloat(greenKg) > 20);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!chargeTemp || !greenKg) { setError('All fields are required.'); return; }
    if (mode === 'production' && !allocId) { setError('Please select an allocation.'); return; }

    setLoading(true);
    try {
      const body = {
        is_development: mode === 'development',
        charge_temp_c: parseInt(chargeTemp),
        green_weight_in_g: greenG,
        ...(mode === 'production' ? { allocation_id: allocId } : { process }),
      };
      const res = await api.post('/roast-sessions', body);
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || 'Failed to start session.');
        return;
      }
      const { session } = await res.json();
      navigate(`/roast/${session.id}/live`);
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <div className="max-w-lg mx-auto p-6">
        <h1 className="text-2xl font-bold text-coffee-900 mb-6">Start Roast Session</h1>

        {/* Mode toggle */}
        <div className="flex rounded-lg overflow-hidden border border-coffee-300 mb-6">
          {['production', 'development'].map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-3 text-sm font-semibold capitalize transition-colors ${
                mode === m ? 'bg-coffee-700 text-white' : 'bg-white text-coffee-600 hover:bg-coffee-50'
              }`}
            >
              {m === 'production' ? 'Production Roast' : 'Development Roast'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {mode === 'production' ? (
            <div>
              <label className="block text-sm font-medium text-coffee-800 mb-1">
                Allocation <span className="text-red-500">*</span>
              </label>
              <select
                value={allocId}
                onChange={e => setAllocId(e.target.value)}
                className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm"
                required
              >
                <option value="">Select allocation…</option>
                {allocations.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.allocation_code} · {a.process} · {a.harvest_year}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-coffee-800 mb-1">Process</label>
              <select
                value={process}
                onChange={e => setProcess(e.target.value)}
                className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm"
              >
                {PROCESSES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-coffee-800 mb-1">
              Charge Temperature (°C) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={chargeTemp}
              onChange={e => setChargeTemp(e.target.value)}
              className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm"
              placeholder="e.g. 200"
              required
            />
            {chargeTempWarn && (
              <p className="text-amber-600 text-xs mt-1">Typical charge temp is 170–250°C</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-coffee-800 mb-1">
              Green Weight (kg) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="0.001"
              value={greenKg}
              onChange={e => setGreenKg(e.target.value)}
              className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm"
              placeholder="e.g. 5.000"
              required
            />
            {greenG && <p className="text-coffee-500 text-xs mt-1">= {greenG}g</p>}
            {greenWarn && (
              <p className="text-amber-600 text-xs mt-1">Typical green weight is 0.1–20 kg</p>
            )}
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-coffee-700 text-white rounded-md font-semibold hover:bg-coffee-800 disabled:opacity-50"
          >
            {loading ? 'Starting…' : 'Start Roast'}
          </button>
        </form>
      </div>
    </Layout>
  );
}
