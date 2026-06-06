import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { Button, FormInput, FormSelect, PageHeader } from '../../components/ui';

const PROCESSES = ['Washed', 'Honey', 'Natural', 'Anaerobic'];

export default function RoastNew() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preselectedAlloc = params.get('allocation_id');

  const [mode,            setMode]       = useState('production');
  const [allocations,     setAllocs]     = useState([]);
  const [allocId,         setAllocId]    = useState(preselectedAlloc || '');
  const [process,         setProcess]    = useState('Washed');
  const [estate,          setEstate]     = useState('');
  const [processDesc,     setProcessDesc]= useState('');
  const [moisture,        setMoisture]   = useState('');
  const [chargeTemp,      setChargeTemp] = useState('');
  const [greenKg,         setGreenKg]    = useState('');
  const [loading,         setLoading]    = useState(false);
  const [error,           setError]      = useState('');

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
        ...(mode === 'production'
          ? { allocation_id: allocId }
          : {
              process,
              ...(estate      ? { estate }                           : {}),
              ...(processDesc ? { process_description: processDesc } : {}),
              ...(moisture    ? { moisture_pct: parseFloat(moisture) } : {}),
            }
        ),
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
      <div className="max-w-lg mx-auto px-6 py-6">
        <PageHeader title="Start Roast Session" />

        {/* Mode toggle */}
        <div
          className="flex rounded-lg overflow-hidden mb-6"
          style={{ border: '1px solid #E0D0BC' }}
        >
          {['production', 'development'].map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="flex-1 py-2.5 text-sm transition-colors"
              style={{
                background: mode === m ? '#533A24' : '#FFFFFF',
                color:      mode === m ? '#FFFFFF' : '#8B6A47',
                fontWeight: mode === m ? 500 : 400,
              }}
            >
              {m === 'production' ? 'Production Roast' : 'Development Roast'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'production' ? (
            <FormSelect
              label="Allocation"
              value={allocId}
              onChange={e => setAllocId(e.target.value)}
              required
            >
              <option value="">Select allocation…</option>
              {allocations.map(a => (
                <option key={a.id} value={a.id}>
                  {a.allocation_code} · {a.process} · {a.harvest_year}
                </option>
              ))}
            </FormSelect>
          ) : (
            <>
              <FormSelect
                label="Process"
                value={process}
                onChange={e => setProcess(e.target.value)}
              >
                {PROCESSES.map(p => <option key={p}>{p}</option>)}
              </FormSelect>
              <FormInput
                label="Estate (optional)"
                type="text"
                value={estate}
                onChange={e => setEstate(e.target.value)}
                placeholder="e.g. Suan Saket"
              />
              <FormInput
                label="Process Description (optional)"
                type="text"
                value={processDesc}
                onChange={e => setProcessDesc(e.target.value)}
                placeholder="e.g. Fully washed, raised bed dried"
              />
              <FormInput
                label="Moisture % (optional)"
                type="number"
                step="0.1"
                value={moisture}
                onChange={e => setMoisture(e.target.value)}
                placeholder="e.g. 11.5"
              />
            </>
          )}

          <div>
            <FormInput
              label="Charge Temperature (°C)"
              type="number"
              value={chargeTemp}
              onChange={e => setChargeTemp(e.target.value)}
              placeholder="e.g. 200"
              required
            />
            {chargeTempWarn && (
              <p className="text-xs mt-1" style={{ color: '#BA7517' }}>
                Typical charge temp is 170–250°C
              </p>
            )}
          </div>

          <div>
            <FormInput
              label="Green Weight (kg)"
              type="number"
              step="0.001"
              value={greenKg}
              onChange={e => setGreenKg(e.target.value)}
              placeholder="e.g. 5.000"
              required
            />
            {greenG && (
              <p className="text-xs text-coffee-400 mt-1">= {greenG}g</p>
            )}
            {greenWarn && (
              <p className="text-xs mt-1" style={{ color: '#BA7517' }}>
                Typical green weight is 0.1–20 kg
              </p>
            )}
          </div>

          {error && (
            <p className="text-xs" style={{ color: '#A32D2D' }}>{error}</p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full justify-center"
            size="lg"
          >
            {loading ? 'Starting…' : 'Start Roast'}
          </Button>
        </form>
      </div>
    </Layout>
  );
}
