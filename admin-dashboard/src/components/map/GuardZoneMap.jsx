import React, { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet';
import MapResizer from './MapResizer';

const ZONE_COLORS = [
  '#7c3aed',
  '#0ea5e9',
  '#16a34a',
  '#f59e0b',
  '#e11d48',
  '#0d9488',
  '#2563eb',
  '#db2777',
  '#65a30d',
  '#9333ea',
  '#0891b2',
  '#b45309',
];

function guardIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid #ffffff;box-shadow:0 1px 4px rgba(15,23,42,0.45)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    tooltipAnchor: [0, -8],
  });
}

function FitGuards({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }
    map.fitBounds(points, { padding: [28, 28], maxZoom: 14 });
  }, [points, map]);
  return null;
}

function jitter(lat, lng, index) {
  if (!index) return [lat, lng];
  const angle = index * 2.399963;
  const radius = 0.00009 * Math.sqrt(index);
  return [lat + Math.cos(angle) * radius, lng + Math.sin(angle) * radius];
}

export default function GuardZoneMap({ guards = [], locations = [], zones = [], className = 'h-96' }) {
  const [hidden, setHidden] = useState([]);

  const zoneColor = useMemo(() => {
    const map = {};
    zones.forEach((zone, index) => {
      map[zone.id] = ZONE_COLORS[index % ZONE_COLORS.length];
    });
    return map;
  }, [zones]);

  const sitesById = useMemo(
    () => Object.fromEntries(locations.map((site) => [site.id, site])),
    [locations],
  );

  const zoneCentroids = useMemo(() => {
    const buckets = {};
    locations.forEach((site) => {
      if (site.lat == null || site.lng == null) return;
      const bucket = buckets[site.zone_id] || (buckets[site.zone_id] = []);
      bucket.push([site.lat, site.lng]);
    });
    return Object.fromEntries(
      Object.entries(buckets).map(([zoneId, points]) => [
        zoneId,
        [
          points.reduce((sum, point) => sum + point[0], 0) / points.length,
          points.reduce((sum, point) => sum + point[1], 0) / points.length,
        ],
      ]),
    );
  }, [locations]);

  const zoneInfo = useMemo(() => {
    const map = {};
    zones.forEach((zone) => {
      map[zone.id] = {
        name: zone.name,
        supervisor: zone.supervisor_name || 'Unassigned',
        color: zoneColor[zone.id] || ZONE_COLORS[0],
      };
    });
    return map;
  }, [zones, zoneColor]);

  const placed = useMemo(() => {
    const counters = {};
    const rows = [];
    guards.forEach((guard) => {
      const site = guard.assigned_post_id ? sitesById[guard.assigned_post_id] : null;
      let base = null;
      if (site && site.lat != null && site.lng != null) {
        base = [site.lat, site.lng];
      } else if (guard.zone_id && zoneCentroids[guard.zone_id]) {
        base = zoneCentroids[guard.zone_id];
      }
      if (!base) return;
      const key = `${base[0]},${base[1]}`;
      const index = counters[key] || 0;
      counters[key] = index + 1;
      rows.push({
        guard,
        site,
        zone: guard.zone_id ? zoneInfo[guard.zone_id] : null,
        position: jitter(base[0], base[1], index),
        approximate: !site,
      });
    });
    return rows;
  }, [guards, sitesById, zoneCentroids, zoneInfo]);

  const visible = placed.filter((row) => !row.guard.zone_id || !hidden.includes(row.guard.zone_id));
  const unplaced = guards.length - placed.length;
  const points = useMemo(() => visible.map((row) => row.position), [visible]);

  const zoneCounts = useMemo(() => {
    const counts = {};
    guards.forEach((guard) => {
      const key = guard.zone_id || 'none';
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [guards]);

  function toggleZone(zoneId) {
    setHidden((current) =>
      current.includes(zoneId) ? current.filter((id) => id !== zoneId) : [...current, zoneId],
    );
  }

  const center = points[0] || [24.8607, 67.0011];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {zones.map((zone) => {
          const off = hidden.includes(zone.id);
          const color = zoneColor[zone.id] || ZONE_COLORS[0];
          return (
            <button
              key={zone.id}
              type="button"
              onClick={() => toggleZone(zone.id)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${
                off ? 'border-line text-muted opacity-50' : 'border-line text-ink hover:bg-panelAlt'
              }`}
              title={`${zone.supervisor_name || 'Unassigned'} · click to ${
                off ? 'show' : 'hide'
              } ${zone.name}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: color }} />
              {zone.name}
              <span className="font-mono text-muted">{zoneCounts[zone.id] || 0}</span>
            </button>
          );
        })}
      </div>

      <div className={`w-full overflow-hidden rounded-xl border border-line ${className}`}>
        <MapContainer center={center} zoom={11} scrollWheelZoom className="h-full w-full">
          <TileLayer
            url="https://tile.openstreetmap.de/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            maxZoom={18}
          />
          <MapResizer />
          <FitGuards points={points} />
          {visible.map((row) => {
            const { guard, site, zone, position, approximate } = row;
            const color = zone?.color || ZONE_COLORS[0];
            return (
              <Marker key={guard.id} position={position} icon={guardIcon(color)}>
                <Tooltip direction="top" opacity={1} className="guard-tooltip">
                  <div style={{ minWidth: 190, lineHeight: 1.45 }}>
                    <div style={{ fontWeight: 700, fontSize: 12 }}>{guard.full_name}</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>
                      {guard.employee_id || 'No employee ID'}
                      {guard.phone_number ? ` · ${guard.phone_number}` : ''}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 10 }}>
                      <span style={{ color, fontWeight: 700 }}>{zone?.name || 'No zone'}</span>
                      {' · Supervisor: '}
                      {zone?.supervisor || 'Unassigned'}
                    </div>
                    <div style={{ fontSize: 10, color: '#334155' }}>
                      Location: {site ? site.name : 'Relief pool (zone centre)'}
                      {site?.area ? ` · ${site.area}` : ''}
                    </div>
                    {site?.client_name && (
                      <div style={{ fontSize: 10, color: '#64748b' }}>Client: {site.client_name}</div>
                    )}
                    <div style={{ marginTop: 3, fontSize: 10 }}>
                      Status:{' '}
                      <strong>{(guard.availability || 'AVAILABLE').replaceAll('_', ' ')}</strong>
                      {approximate ? ' · approximate position' : ''}
                    </div>
                  </div>
                </Tooltip>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      <p className="text-[10px] text-muted">
        {placed.length} of {guards.length} guards placed · colours follow zone · hover a marker for
        guard, supervisor and location detail.
        {unplaced > 0 && (
          <>
            {' '}
            {unplaced} guard{unplaced === 1 ? '' : 's'} cannot be placed yet — assign them to a site
            from Zones &amp; Sites → Guards (or give the zone at least one mapped site).
          </>
        )}
      </p>
    </div>
  );
}
