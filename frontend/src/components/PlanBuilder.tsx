import { useState, type FormEvent } from 'react';
import * as api from '../lib/api.js';
import { navigate } from '../lib/router.js';
import type { PowerKind } from '../lib/api.js';

interface CutRow {
  key: number;
  start: string;
  end: string;
}

interface JobRow {
  key: number;
  name: string;
  minutes: string;
  power: PowerKind;
}

let nextKey = 1;

export default function PlanBuilder() {
  const [label, setLabel] = useState('');
  const [shopOpen, setShopOpen] = useState('09:00');
  const [shopClose, setShopClose] = useState('20:00');
  const [cuts, setCuts] = useState<CutRow[]>([{ key: nextKey++, start: '11:00', end: '13:00' }]);
  const [jobs, setJobs] = useState<JobRow[]>([{ key: nextKey++, name: '', minutes: '30', power: 'grid' }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function addCut() {
    setCuts((prev) => [...prev, { key: nextKey++, start: '', end: '' }]);
  }
  function removeCut(key: number) {
    setCuts((prev) => prev.filter((c) => c.key !== key));
  }
  function addJob() {
    setJobs((prev) => [...prev, { key: nextKey++, name: '', minutes: '30', power: 'grid' }]);
  }
  function removeJob(key: number) {
    setJobs((prev) => prev.filter((j) => j.key !== key));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanJobs = jobs.filter((j) => j.name.trim().length > 0);
    if (cleanJobs.length === 0) {
      setError('Add at least one job.');
      return;
    }

    setBusy(true);
    try {
      const { plan } = await api.createPlan({
        label: label.trim() || shopOpen,
        shopOpen,
        shopClose,
        cuts: cuts.filter((c) => c.start && c.end).map((c) => ({ start: c.start, end: c.end })),
        jobs: cleanJobs.map((j) => ({ name: j.name.trim(), minutes: Number(j.minutes), power: j.power })),
      });
      navigate({ name: 'plan', id: plan.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the plan.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="plan-builder">
      <h1>New day plan</h1>
      <form onSubmit={handleSubmit}>
        <section className="builder-section">
          <label>
            Plan label
            <input placeholder="e.g. Tuesday" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <div className="builder-row">
            <label>
              Shop opens
              <input type="time" value={shopOpen} onChange={(e) => setShopOpen(e.target.value)} required />
            </label>
            <label>
              Shop closes
              <input type="time" value={shopClose} onChange={(e) => setShopClose(e.target.value)} required />
            </label>
          </div>
        </section>

        <section className="builder-section">
          <div className="builder-section__header">
            <h2>Today's power cuts</h2>
            <button type="button" className="link-button" onClick={addCut}>
              + Add cut
            </button>
          </div>
          {cuts.length === 0 && <p className="muted">No cuts entered — assumed grid power all day.</p>}
          {cuts.map((cut) => (
            <div className="builder-row builder-row--removable" key={cut.key}>
              <label>
                From
                <input
                  type="time"
                  value={cut.start}
                  onChange={(e) => setCuts((prev) => prev.map((c) => (c.key === cut.key ? { ...c, start: e.target.value } : c)))}
                />
              </label>
              <label>
                To
                <input
                  type="time"
                  value={cut.end}
                  onChange={(e) => setCuts((prev) => prev.map((c) => (c.key === cut.key ? { ...c, end: e.target.value } : c)))}
                />
              </label>
              <button type="button" className="link-button" onClick={() => removeCut(cut.key)}>
                Remove
              </button>
            </div>
          ))}
        </section>

        <section className="builder-section">
          <div className="builder-section__header">
            <h2>Jobs to schedule</h2>
            <button type="button" className="link-button" onClick={addJob}>
              + Add job
            </button>
          </div>
          <p className="field-hint">
            You can attach a reference document (the file to print, a customer's order, etc.) to each job from its
            row once the plan is built.
          </p>
          {jobs.map((job) => (
            <div className="builder-row builder-row--job" key={job.key}>
              <label className="grow">
                Job
                <input
                  placeholder="e.g. Passport photos"
                  value={job.name}
                  onChange={(e) => setJobs((prev) => prev.map((j) => (j.key === job.key ? { ...j, name: e.target.value } : j)))}
                />
              </label>
              <label>
                Minutes
                <input
                  type="number"
                  min="5"
                  step="5"
                  value={job.minutes}
                  onChange={(e) => setJobs((prev) => prev.map((j) => (j.key === job.key ? { ...j, minutes: e.target.value } : j)))}
                />
              </label>
              <label>
                Power
                <select
                  value={job.power}
                  onChange={(e) =>
                    setJobs((prev) => prev.map((j) => (j.key === job.key ? { ...j, power: e.target.value as PowerKind } : j)))
                  }
                >
                  <option value="grid">Grid only</option>
                  <option value="flexible">Flexible (generator or solar)</option>
                  <option value="solar">Solar or mains only (never generator)</option>
                  <option value="none">No power needed</option>
                </select>
              </label>
              <button type="button" className="link-button" onClick={() => removeJob(job.key)}>
                Remove
              </button>
            </div>
          ))}
        </section>

        {error && <div className="form-error">{error}</div>}

        <button type="submit" disabled={busy}>
          {busy ? 'Building plan…' : 'Build my day plan'}
        </button>
      </form>
    </div>
  );
}
