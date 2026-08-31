import type { PlanDetail } from '../lib/api.js';
import { parseTime, formatTime } from '../lib/time.js';

const POWER_LABEL: Record<string, string> = {
  grid: 'Grid',
  generator: 'Generator',
  solar: 'Solar',
  none: 'No power',
};

interface TimelineProps {
  plan: PlanDetail;
  scrubMinutes: number;
  onScrub: (minutes: number) => void;
  selectedJobId: string | null;
  onSelectJob: (id: string | null) => void;
}

export default function Timeline({ plan, scrubMinutes, onScrub, selectedJobId, onSelectJob }: TimelineProps) {
  const open = parseTime(plan.shopOpen);
  const close = parseTime(plan.shopClose);
  const total = close - open;
  const pct = (minutes: number) => `${((minutes - open) / total) * 100}%`;

  return (
    <div className="timeline">
      <div className="timeline__track">
        {plan.cuts.map((cut) => (
          <div
            key={cut.id}
            className="timeline__cut"
            style={{ left: pct(parseTime(cut.start)), width: `${(parseTime(cut.end) - parseTime(cut.start)) / total * 100}%` }}
            title={`Power cut ${cut.start}–${cut.end}`}
          />
        ))}

        {plan.jobs
          .filter((j) => j.scheduledStart && j.scheduledEnd)
          .map((job) => {
            const start = parseTime(job.scheduledStart!);
            const end = parseTime(job.scheduledEnd!);
            return (
              <button
                type="button"
                key={job.id}
                className={`timeline__job timeline__job--${job.actualPower} ${selectedJobId === job.id ? 'is-selected' : ''}`}
                style={{ left: pct(start), width: `${((end - start) / total) * 100}%` }}
                onClick={() => onSelectJob(job.id === selectedJobId ? null : job.id)}
                title={`${job.name} · ${job.scheduledStart}–${job.scheduledEnd} · ${POWER_LABEL[job.actualPower ?? '']}`}
              >
                <span>{job.name}</span>
              </button>
            );
          })}

        <div className="timeline__playhead" style={{ left: pct(scrubMinutes) }} />
      </div>

      <input
        type="range"
        className="timeline__scrubber"
        min={open}
        max={close}
        value={scrubMinutes}
        onChange={(e) => onScrub(Number(e.target.value))}
      />

      <div className="timeline__labels">
        <span>{plan.shopOpen}</span>
        <span className="timeline__now">{formatTime(scrubMinutes)}</span>
        <span>{plan.shopClose}</span>
      </div>

      {plan.jobs.some((j) => j.unscheduled) && (
        <div className="timeline__unscheduled">
          <strong>Didn't fit today:</strong>{' '}
          {plan.jobs
            .filter((j) => j.unscheduled)
            .map((j) => j.name)
            .join(', ')}
        </div>
      )}
    </div>
  );
}
