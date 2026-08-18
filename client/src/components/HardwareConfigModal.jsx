import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Button, FormSelect } from './ui';
import { X, RefreshCw, Cpu } from 'lucide-react';

export default function HardwareConfigModal({ onClose, onStatusChange }) {
  const [ports,       setPorts]       = useState([]);
  const [selectedPort, setSelectedPort] = useState('');
  const [status,       setStatus]       = useState({ connected: false, portPath: null });
  const [loading,      setLoading]      = useState(false);
  const [scanning,     setScanning]     = useState(false);
  const [error,        setError]        = useState('');
  const [message,      setMessage]      = useState('');

  // Fetch current status and available ports
  useEffect(() => {
    fetchStatus();
    scanPorts();
  }, []);

  async function fetchStatus() {
    setLoading(true);
    try {
      const res = await api.get('/hardware/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        if (data.portPath) {
          setSelectedPort(data.portPath);
        }
      }
    } catch {
      setError('Failed to fetch hardware status.');
    } finally {
      setLoading(false);
    }
  }

  async function scanPorts() {
    setScanning(true);
    setError('');
    try {
      const res = await api.get('/hardware/ports');
      const data = await res.json();
      if (res.ok) {
        setPorts(data.ports || []);
        if (data.ports?.length > 0 && !selectedPort) {
          setSelectedPort(data.ports[0].path);
        }
      } else {
        setError(data.error || 'Failed to scan ports.');
      }
    } catch {
      setError('Failed to contact server for USB ports.');
    } finally {
      setScanning(false);
    }
  }

  async function handleConnect(e) {
    e.preventDefault();
    if (!selectedPort) {
      setError('Please select a USB serial port.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await api.post('/hardware/connect', { portPath: selectedPort });
      const data = await res.json();
      if (res.ok) {
        setMessage(data.message);
        setStatus({ connected: true, portPath: selectedPort });
        if (onStatusChange) onStatusChange();
      } else {
        setError(data.error || 'Connection failed.');
      }
    } catch {
      setError('Failed to execute connect request.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await api.post('/hardware/disconnect', {});
      const data = await res.json();
      if (res.ok) {
        setMessage(data.message);
        setStatus({ connected: false, portPath: null });
        if (onStatusChange) onStatusChange();
      } else {
        setError(data.error || 'Disconnect failed.');
      }
    } catch {
      setError('Failed to execute disconnect request.');
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
      <div className="bg-white rounded-2xl border border-coffee-200 w-full max-w-md my-8">
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid #F2EAE0' }}
        >
          <div className="flex items-center gap-2">
            <Cpu size={18} className="text-coffee-600" />
            <h2 className="text-base text-coffee-900 font-medium">
              USB Roaster Connection
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-coffee-400 hover:text-coffee-700 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div
              className="px-3 py-2.5 rounded-lg text-xs"
              style={{ background: '#FCEBEB', color: '#A32D2D' }}
            >
              {error}
            </div>
          )}

          {message && (
            <div
              className="px-3 py-2.5 rounded-lg text-xs"
              style={{ background: '#EAF3DE', color: '#3B6D11' }}
            >
              {message}
            </div>
          )}

          {/* Current connection status */}
          <div className="rounded-xl p-4 border border-coffee-100 bg-coffee-50/50 space-y-2">
            <p className="text-xs text-coffee-400 uppercase tracking-wide">Status</p>
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: status.connected ? '#16A34A' : '#DC2626' }}
              />
              <span className="text-sm font-medium text-coffee-900">
                {status.connected ? 'Connected' : 'Offline'}
              </span>
            </div>
            {status.connected && (
              <p className="text-xs text-coffee-600 font-mono">
                Active Port: {status.portPath}
              </p>
            )}
            {!status.connected && (
              <p className="text-xs text-coffee-500">
                Currently running in mock simulation mode. Select a COM port to connect your Skywalker V2.
              </p>
            )}
          </div>

          {/* Configuration Form */}
          {!status.connected ? (
            <form onSubmit={handleConnect} className="space-y-4">
              <div className="flex items-end gap-2">
                <FormSelect
                  label="Select COM/Serial Port"
                  value={selectedPort}
                  onChange={e => setSelectedPort(e.target.value)}
                  containerClass="flex-1"
                  disabled={loading || scanning}
                >
                  {ports.length === 0 ? (
                    <option value="">No ports detected</option>
                  ) : (
                    ports.map(p => (
                      <option key={p.path} value={p.path}>
                        {p.path} {p.friendlyName ? `(${p.friendlyName})` : ''}
                      </option>
                    ))
                  )}
                </FormSelect>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={scanPorts}
                  disabled={scanning || loading}
                  title="Rescan USB ports"
                >
                  <RefreshCw size={14} className={scanning ? 'animate-spin' : ''} />
                </Button>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onClose}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={loading || ports.length === 0}
                >
                  {loading ? 'Connecting…' : 'Connect Port'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-coffee-500">
                To switch to another USB port, disconnect the current active connection first.
              </p>
              <div className="flex gap-2 justify-end pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onClose}
                  disabled={loading}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleDisconnect}
                  disabled={loading}
                >
                  {loading ? 'Disconnecting…' : 'Disconnect'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
