import { useEffect, useMemo, useState, type FormEvent } from 'react';
import * as api from '../lib/api.js';

function monthLabel(yyyyMm: string): string {
  const [year, month] = yyyyMm.split('-').map(Number);
  return new Date(year!, month! - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export default function MeterView() {
  const [readings, setReadings] = useState<api.MeterReading[] | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [readingKwh, setReadingKwh] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .listMeterReadings()
      .then(({ readings: list }) => setReadings(list))
      .catch(() => setError('Could not load meter readings.'));
  }, []);

  const rows = useMemo(() => {
    if (!readings) return [];
    return readings.map((reading, index) => {
      const previous = readings[index - 1];
      const usage = previous ? reading.readingKwh - previous.readingKwh : null;
      const days = previous ? Math.max(1, Math.round((+new Date(reading.date) - +new Date(previous.date)) / 86_400_000)) : null;
      return { reading, usage, days };
    });
  }, [readings]);

  const monthlyTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of rows) {
      if (row.usage === null) continue;
      const key = row.reading.date.slice(0, 7);
      totals.set(key, (totals.get(key) ?? 0) + row.usage);
    }
    return [...totals.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [rows]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const kwh = Number(readingKwh);
    if (!Number.isFinite(kwh) || kwh < 0) {
      setError('Enter a valid meter reading.');
      return;
    }
    setBusy(true);
    try {
      await api.createMeterReading(date, kwh, note.trim() || undefined);
      const { readings: list } = await api.listMeterReadings();
      setReadings(list);
      setReadingKwh('');
      setNote('');
    } catch {
      setError('Could not save that reading.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this meter reading? This cannot be undone.')) return;
    try {
      await api.deleteMeterReading(id);
      setReadings((prev) => prev?.filter((r) => r.id !== id) ?? null);
    } catch {
      setError('Could not delete that reading.');
    }
  }

  return (
    <div className="meter-view">
      <h1>Electricity meter</h1>
      <p className="muted">
        Log your grid meter's reading whenever you check it — LoadShift works out how many kWh you used between
        readings and totals it up by month.
      </p>

      <form className="meter-form" onSubmit={handleSubmit}>
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label>
          Meter reading (kWh)
          <input
            type="number"
            min="0"
            step="0.1"
            value={readingKwh}
            onChange={(e) => setReadingKwh(e.target.value)}
            placeholder="e.g. 4213.5"
            required
          />
        </label>
        <label className="grow">
          Note (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. after meter reset" />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Add reading'}
        </button>
      </form>

      {error && <div className="form-error">{error}</div>}

      {monthlyTotals.length > 0 && (
        <div className="meter-summary">
          {monthlyTotals.map(([key, total]) => (
            <div key={key} className="meter-summary__card">
              <span className="meter-summary__month">{monthLabel(key)}</span>
              <span className="meter-summary__value">{total.toFixed(1)} kWh</span>
            </div>
          ))}
        </div>
      )}

      {readings && readings.length === 0 && (
        <div className="empty-state">Add your first meter reading to start tracking monthly usage.</div>
      )}

      {rows.length > 0 && (
        <div className="job-table-scroll">
          <table className="job-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reading</th>
                <th>Since previous</th>
                <th>Note</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map(({ reading, usage, days }) => (
                <tr key={reading.id}>
                  <td>{reading.date}</td>
                  <td>{reading.readingKwh.toFixed(1)} kWh</td>
                  <td>{usage === null ? '—' : `${usage.toFixed(1)} kWh over ${days} day${days === 1 ? '' : 's'}`}</td>
                  <td>{reading.note ?? ''}</td>
                  <td>
                    <button type="button" className="link-button" onClick={() => handleDelete(reading.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
