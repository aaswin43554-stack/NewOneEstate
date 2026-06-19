import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Circle } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Button } from '../components/ui';

const STEPS = [
  {
    id: 'lot',
    title: 'Add your first green lot',
    description: 'Log your green bean arrival — estate, process, harvest year, and weight. This is the foundation every roast session and allocation links back to.',
    action: '/inventory',
    actionLabel: 'Go to Inventory',
    tip: 'Tip: Roast loss defaults are pre-set by process (Washed 17%, Honey 16%, Natural/Anaerobic 18%). You can adjust them per lot.',
  },
  {
    id: 'profile',
    title: 'Create and approve a roast profile',
    description: 'Before you can open an allocation, an approved profile must exist for that process and harvest year. Set your target charge temp, eject temp, and DTR.',
    action: '/profiles',
    actionLabel: 'Go to Profiles',
    tip: "Tip: Use \"Duplicate\" on last year's profile to create a starting point for a new harvest.",
  },
  {
    id: 'allocation',
    title: 'Create your first allocation',
    description: 'Allocations are the core of the platform. Create one, link it to your lot, then move it through the lifecycle: open requests → roast → rest → dispatch → close.',
    action: '/allocations/new',
    actionLabel: 'Create Allocation',
    tip: 'Tip: The dispatch date is calculated automatically based on process rest days (Washed +4d, Honey +5d, Natural/Anaerobic +7d).',
  },
  {
    id: 'roast',
    title: 'Run your first roast session',
    description: 'Start a live roast session linked to your allocation. The system records the temperature curve, auto-generates a batch code, and checks it against your approved profile.',
    action: '/roast/new',
    actionLabel: 'New Roast Session',
    tip: 'Tip: Connect your Skywalker V2 via USB and set SKYWALKER_PORT in your environment for live hardware data. Otherwise the mock simulation runs.',
  },
  {
    id: 'cupping',
    title: 'Log a cupping session',
    description: 'Cup your roast and log scores across all SCA attributes. The system warns if you cup before the minimum rest period for the process has elapsed.',
    action: '/cupping/new',
    actionLabel: 'New Cupping',
    tip: 'Tip: Use the AI Structuring button to clean up informal tasting notes into precise specialty coffee vocabulary.',
  },
  {
    id: 'label',
    title: 'Generate your bag label',
    description: 'Once roasting is complete, generate a label with roast dates, ready-to-brew date, and a QR code linking to the public journal entry for this allocation.',
    action: '/labels',
    actionLabel: 'Go to Labels',
    tip: 'Tip: Ready-to-brew and best-before dates are calculated automatically — no manual entry at label time.',
  },
];

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [completed, setCompleted] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('oec_onboarding_completed') || '[]');
    } catch {
      return [];
    }
  });

  function toggle(id) {
    const next = completed.includes(id)
      ? completed.filter(c => c !== id)
      : [...completed, id];
    setCompleted(next);
    localStorage.setItem('oec_onboarding_completed', JSON.stringify(next));
  }

  const doneCount = completed.length;
  const totalCount = STEPS.length;
  const allDone = doneCount === totalCount;

  return (
    <div style={{ minHeight: '100vh', background: '#FDFAF6', fontFamily: 'Inter, sans-serif' }}>
      {/* Top bar */}
      <div style={{ background: '#533A24', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ color: '#FAF6F0', fontSize: 14, fontWeight: 500, margin: 0 }}>
          One Estate Coffee · OEC Ops
        </p>
        <button
          onClick={() => navigate('/')}
          style={{ color: '#C8A87A', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Skip setup →
        </button>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '48px 24px 80px' }}>
        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 12, color: '#A8896A', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Getting started
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 600, color: '#221508', marginBottom: 8 }}>
            Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
          </h1>
          <p style={{ fontSize: 15, color: '#6F5035', lineHeight: 1.6 }}>
            OEC Ops manages your full operational chain — from green bean arrival to dispatch and public documentation.
            Complete these steps to get your first allocation cycle running.
          </p>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: '#A8896A' }}>Setup progress</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#533A24' }}>{doneCount} / {totalCount} complete</span>
          </div>
          <div style={{ height: 6, background: '#EDE0D0', borderRadius: 99, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${(doneCount / totalCount) * 100}%`,
                background: allDone ? '#3B6D11' : '#8B6A47',
                borderRadius: 99,
                transition: 'width 300ms ease',
              }}
            />
          </div>
        </div>

        {allDone && (
          <div
            style={{
              background: '#EAF3DE', border: '1px solid #B5D9A0', borderRadius: 14,
              padding: '16px 20px', marginBottom: 32, display: 'flex', alignItems: 'center', gap: 12,
            }}
          >
            <CheckCircle size={20} color="#3B6D11" />
            <div>
              <p style={{ fontWeight: 500, color: '#1A4A0A', marginBottom: 2 }}>Setup complete</p>
              <p style={{ fontSize: 13, color: '#2D6B14' }}>Your platform is ready. Head to the dashboard to manage your operation.</p>
            </div>
            <Button
              variant="primary"
              style={{ marginLeft: 'auto', background: '#3B6D11', flexShrink: 0 }}
              onClick={() => navigate('/')}
            >
              Go to Dashboard
            </Button>
          </div>
        )}

        {/* Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {STEPS.map((step, i) => {
            const done = completed.includes(step.id);
            return (
              <div
                key={step.id}
                style={{
                  background: '#FFFFFF',
                  border: `1px solid ${done ? '#B5D9A0' : '#E0D0BC'}`,
                  borderRadius: 14,
                  padding: '20px 24px',
                  opacity: done ? 0.8 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <button
                    onClick={() => toggle(step.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, marginTop: 2 }}
                  >
                    {done
                      ? <CheckCircle size={22} color="#3B6D11" />
                      : <Circle size={22} color="#C4AD96" />
                    }
                  </button>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: '#A8896A', fontWeight: 500 }}>STEP {i + 1}</span>
                      {done && (
                        <span style={{ fontSize: 11, color: '#3B6D11', fontWeight: 500 }}>✓ Done</span>
                      )}
                    </div>
                    <p style={{ fontSize: 15, fontWeight: 500, color: done ? '#8B6A47' : '#221508', marginBottom: 6 }}>
                      {step.title}
                    </p>
                    <p style={{ fontSize: 13, color: '#6F5035', lineHeight: 1.6, marginBottom: 10 }}>
                      {step.description}
                    </p>
                    <p style={{ fontSize: 12, color: '#A8896A', fontStyle: 'italic', marginBottom: 12 }}>
                      {step.tip}
                    </p>
                    <Button
                      variant={done ? 'ghost' : 'secondary'}
                      size="sm"
                      onClick={() => navigate(step.action)}
                    >
                      {step.actionLabel}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Multi-tenant note */}
        <div
          style={{
            marginTop: 40, padding: '20px 24px',
            background: '#FAF6F0', border: '1px solid #E0D0BC', borderRadius: 14,
          }}
        >
          <p style={{ fontSize: 13, fontWeight: 500, color: '#533A24', marginBottom: 6 }}>Onboarding a second roaster?</p>
          <p style={{ fontSize: 13, color: '#6F5035', lineHeight: 1.6 }}>
            Each roaster gets their own tenant — all data is fully isolated. Create a new account via the registration endpoint,
            then share these setup steps. Every module, every allocation, every contact is scoped to that tenant.
          </p>
          <p style={{ fontSize: 12, color: '#A8896A', marginTop: 8 }}>
            All data can be exported at any time via CSV or JSON from Inventory, Allocations, Roast Sessions, Cupping, Contacts, Profiles, Labels, and Journal.
          </p>
        </div>
      </div>
    </div>
  );
}
