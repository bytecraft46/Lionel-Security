import React from 'react';
import { RagDot, ProgressBar, EmptyState } from '../../components/ui';

export default function DeploymentTree({ zones = [], locations = [], onSelect }) {
  if (!zones.length) return <EmptyState title="No zones in scope" />;

  return (
    <div className="space-y-3">
      {zones.map((zone) => {
        const zoneLocations = locations.filter((site) => site.zone_id === zone.id);
        const tone = zone.status === 'RED' ? 'red' : zone.status === 'YELLOW' ? 'yellow' : 'green';
        return (
          <div key={zone.id} className="rounded-xl border border-line bg-panelAlt/30 overflow-hidden">
            <div className="border-b border-line bg-panelAlt px-3.5 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-bold text-ink">{zone.name}</p>
                <RagDot status={zone.status} />
              </div>
              <p className="mt-0.5 text-[10px] text-muted font-medium">
                {zone.supervisor_name || 'No supervisor'} · {zone.present_count}/{zone.required_strength} on shift · {zone.assigned_guards ?? '—'} assigned
              </p>
              <div className="mt-2">
                <ProgressBar
                  value={zone.required_strength ? zone.present_count / zone.required_strength : 0}
                  tone={tone}
                />
              </div>
            </div>
            <div className="divide-y divide-line/70">
              {zoneLocations.map((site) => (
                <button
                  key={site.id}
                  type="button"
                  onClick={() => onSelect?.(site)}
                  className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-panelAlt group"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-ink group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {site.name}
                    </span>
                    <span className="block truncate text-[10px] text-muted">
                      {site.client_name || 'Client site'}
                    </span>
                  </span>
                  <span className="flex flex-shrink-0 items-center gap-2">
                    <span className="font-mono text-xs font-bold text-ink">
                      {site.present_count}/{site.required_strength}
                    </span>
                    <RagDot status={site.computed_status} />
                  </span>
                </button>
              ))}
              {zoneLocations.length === 0 && (
                <p className="px-3 py-2 text-[10px] text-muted">No locations assigned.</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
