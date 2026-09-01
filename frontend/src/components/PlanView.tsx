import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import * as api from '../lib/api.js';
import { ApiClientError } from '../lib/api.js';
import { parseTime } from '../lib/time.js';
import Timeline from './Timeline.js';
import type { ActualPowerKind } from '../lib/api.js';

// three.js/react-three-fiber is the single largest dependency in the bundle —
// deferring it means the login/dashboard/settings screens never pay for it.
const PowerScene = lazy(() => import('./PowerScene.js'));

interface PlanViewProps {
  planId: string;
}

export default function PlanView({ planId }: PlanViewProps) {
  const [plan, setPlan] = useState<api.PlanDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scrubMinutes, setScrubMinutes] = useState(0);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  useEffect(() => {
    setPlan(null);
    api
      .getPlan(planId)
      .then(({ plan: loaded }) => {
        setPlan(loaded);
        setScrubMinutes(parseTime(loaded.shopOpen));
      })
      .catch(() => setError('Could not load this plan.'));
  }, [planId]);

  const activePower: ActualPowerKind | null = useMemo(() => {
    if (!plan) return null;
    const active = plan.jobs.find((j) => {
      if (!j.scheduledStart || !j.scheduledEnd) return false;
      const start = parseTime(j.scheduledStart);
      const end = parseTime(j.scheduledEnd);
      return scrubMinutes >= start && scrubMinutes < end;
    });
    return active?.actualPower ?? null;
  }, [plan, scrubMinutes]);

  async function handleRecompute() {
    setBusy(true);
    setValidationErrors([]);
    try {
      const { plan: updated } = await api.autoSchedule(planId);
      setPlan(updated);
      setOverrides({});
    } catch {
      setError('Could not recompute the schedule.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveOverrides() {
    if (!plan) return;
    setBusy(true);
    setValidationErrors([]);
    try {
      const placements = plan.jobs.map((job) => ({
        jobId: job.id,
        start: overrides[job.id] ?? job.scheduledStart ?? plan.shopOpen,
      }));
      const { plan: updated } = await api.manualSchedule(planId, placements);
      setPlan(updated);
      setOverrides({});
    } catch (err) {
      if (err instanceof ApiClientError && err.details) {
        setValidationErrors(err.details);
      } else {
        setError('Could not save your arrangement.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleAttach(jobId: string, file: File) {
    setAttachmentError(null);
    try {
      await api.uploadAttachment(planId, jobId, file);
      const { plan: reloaded } = await api.getPlan(planId);
      setPlan(reloaded);
    } catch (err) {
      setAttachmentError(err instanceof ApiClientError ? err.message : 'Could not attach that file.');
    }
  }

  async function handleRemoveAttachment(jobId: string) {
    if (!window.confirm('Remove this attachment? This cannot be undone.')) return;
    try {
      await api.deleteAttachment(planId, jobId);
      const { plan: reloaded } = await api.getPlan(planId);
      setPlan(reloaded);
    } catch {
      setAttachmentError('Could not remove that attachment.');
    }
  }

  if (error) return <div className="form-error">{error}</div>;
  if (!plan) return <p className="muted">Loading…</p>;

  const hasOverrides = Object.keys(overrides).length > 0;

  return (
    <div className="plan-view">
      <div className="plan-view__header">
        <h1>{plan.label}</h1>
        <div className="plan-view__stats">
          {plan.feasible === false && <span className="badge badge--warn">Not everything fits today</span>}
          <span className="stat">
            {plan.totalGeneratorMinutes ?? 0} min on generator · ৳{(plan.totalGeneratorCost ?? 0).toFixed(2)}
            {plan.hasSolar ? ` · ${plan.totalSolarMinutes ?? 0} min on solar (free)` : ''}
          </span>
        </div>
      </div>

      <div className="plan-view__grid">
        <Timeline
          plan={plan}
          scrubMinutes={scrubMinutes}
          onScrub={setScrubMinutes}
          selectedJobId={selectedJobId}
          onSelectJob={setSelectedJobId}
        />
        <Suspense fallback={<div className="power-scene power-scene--loading" />}>
          <PowerScene activePower={activePower} hasSolar={plan.hasSolar} />
        </Suspense>
      </div>

      <div className="plan-view__actions">
        <button type="button" onClick={handleRecompute} disabled={busy}>
          Reset to auto-plan
        </button>
        <button type="button" onClick={handleSaveOverrides} disabled={busy || !hasOverrides}>
          Save my arrangement
        </button>
      </div>

      {validationErrors.length > 0 && (
        <div className="form-error">
          <strong>That arrangement doesn't work:</strong>
          <ul>
            {validationErrors.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      {attachmentError && <div className="form-error">{attachmentError}</div>}

      <div className="job-table-scroll">
        <table className="job-table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Length</th>
              <th>Power</th>
              <th>Start time</th>
              <th>Ran on</th>
              <th>Document</th>
            </tr>
          </thead>
          <tbody>
            {plan.jobs.map((job) => (
              <tr key={job.id} className={selectedJobId === job.id ? 'is-selected' : ''}>
                <td>{job.name}</td>
                <td>{job.minutes} min</td>
                <td>{job.power}</td>
                <td>
                  <input
                    type="time"
                    value={overrides[job.id] ?? job.scheduledStart ?? ''}
                    onChange={(e) => setOverrides((prev) => ({ ...prev, [job.id]: e.target.value }))}
                  />
                </td>
                <td>
                  {job.unscheduled ? (
                    <span className="badge badge--warn">Unscheduled</span>
                  ) : (
                    <span className={`badge badge--${job.actualPower}`}>{job.actualPower}</span>
                  )}
                </td>
                <td>
                  {job.attachment ? (
                    <span className="job-table__file">
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => api.downloadAttachment(planId, job.id, job.attachment!.name)}
                      >
                        {job.attachment.name}
                      </button>
                      <button type="button" className="link-button" onClick={() => handleRemoveAttachment(job.id)}>
                        Remove
                      </button>
                    </span>
                  ) : (
                    <label className="job-table__attach">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path
                          d="M18 8.5v7a5 5 0 0 1-10 0V6a3 3 0 0 1 6 0v8.5a1 1 0 0 1-2 0V8"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      Attach file
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.gif"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void handleAttach(job.id, file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
