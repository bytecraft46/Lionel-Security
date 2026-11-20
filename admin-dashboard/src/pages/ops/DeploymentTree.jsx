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
          <div key={zone.id} className="rounded-xl border border-line bg-panelAlt/40">
            <div className="border-b border-line/70 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[11px] font-bold text-ink">{zone.name}</p>
                <RagDot status={zone.status} />
              </div>
              <p className="mt-0.5 text-[10px] text-muted">
                {zone.supervisor_name || 'No supervisor'} · {zone.present_count}/{zone.required_strength} deployed
              </p>
              <div className="mt-1.5">
                <ProgressBar
                  value={zone.required_strength ? zone.present_count / zone.required_strength : 0}
                  tone={tone}
                />
              </div>
            </div>
            <div className="divide-y divide-line/60">
              {zoneLocations.map((site) => (
                <button
                  key={site.id}
                  type="button"
                  onClick={() => onSelect?.(site)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-panel"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-semibold text-ink">
                      {site.name}
                    </span>
                    <span className="block truncate text-[10px] text-muted">
                      {site.client_name || 'Client site'}
                    </span>
                  </span>
                  <span className="flex flex-shrink-0 items-center gap-2">
                    <span className="font-mono text-[10px] text-muted">
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
