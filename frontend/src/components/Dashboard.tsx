import { useEffect, useState } from 'react';
import * as api from '../lib/api.js';
import { hrefFor } from '../lib/router.js';

export default function Dashboard() {
  const [plans, setPlans] = useState<api.PlanSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    api
      .listPlans()
      .then(({ plans: list }) => setPlans(list))
      .catch(() => setError('Could not load your plans.'));
  }, []);

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this plan? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await api.deletePlan(id);
      setPlans((prev) => prev?.filter((p) => p.id !== id) ?? null);
    } catch {
      setError('Could not delete that plan.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h1>Your day plans</h1>
        <a className="button" href={hrefFor({ name: 'plan-new' })}>
          + New plan
        </a>
      </div>

      {error && <div className="form-error">{error}</div>}

      {plans === null && !error && <p className="muted">Loading…</p>}

      {plans && plans.length === 0 && (
        <div className="empty-state">
          <p>No plans yet. Create one to see today's jobs laid out around the power cuts.</p>
        </div>
      )}

      <div className="plan-grid">
        {plans?.map((plan) => (
          <a key={plan.id} className="plan-card" href={hrefFor({ name: 'plan', id: plan.id })}>
            <div className="plan-card__top">
              <h2>{plan.label}</h2>
              {plan.feasible === false && <span className="badge badge--warn">Won't all fit</span>}
              {plan.feasible === true && <span className="badge badge--ok">Fits</span>}
            </div>
            <p className="plan-card__hours">
              {plan.shopOpen} – {plan.shopClose}
            </p>
            <p className="plan-card__cost">
              {plan.totalGeneratorMinutes ? `${plan.totalGeneratorMinutes} min on generator` : 'No generator time needed'}
              {plan.totalGeneratorCost ? ` · ৳${plan.totalGeneratorCost.toFixed(2)}` : ''}
            </p>
            <button
              type="button"
              className="link-button plan-card__delete"
              disabled={deletingId === plan.id}
              onClick={(e) => {
                e.preventDefault();
                void handleDelete(plan.id);
              }}
            >
              {deletingId === plan.id ? 'Deleting…' : 'Delete'}
            </button>
          </a>
        ))}
      </div>
    </div>
  );
}
