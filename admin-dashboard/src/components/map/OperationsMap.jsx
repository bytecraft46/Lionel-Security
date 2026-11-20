import React, { useEffect } from 'react';
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import MapResizer from './MapResizer';
import { siteColor, siteIcon } from './pins';

function FitSites({ locations }) {
  const map = useMap();
  useEffect(() => {
    if (!locations.length) return;
    const bounds = locations.map((site) => [site.lat, site.lng]);
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 13 });
  }, [locations, map]);
  return null;
}

export default function OperationsMap({ locations = [], selectedId, onSelect, className = 'h-80' }) {
  const center = locations.length
    ? [locations[0].lat, locations[0].lng]
    : [24.8607, 67.0011];

  return (
    <div className={`w-full overflow-hidden rounded-xl border border-line ${className}`}>
      <MapContainer center={center} zoom={11} scrollWheelZoom className="h-full w-full">
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <MapResizer />
        <FitSites locations={locations} />
        {locations.map((site) => (
          <React.Fragment key={site.id}>
            <Circle
              center={[site.lat, site.lng]}
              radius={site.geofence_type === 'CIRCLE' ? site.radius_meters || 100 : 60}
              pathOptions={{
                color: siteColor(site.computed_status),
                weight: 1,
                fillOpacity: 0.06,
              }}
            />
            <Marker
              position={[site.lat, site.lng]}
              icon={siteIcon(site.computed_status, site.id === selectedId)}
              eventHandlers={{ click: () => onSelect?.(site) }}
            >
              <Popup>
                <strong>{site.name}</strong>
                <br />
                {site.client_name || 'Lionel Security site'}
                <br />
                Strength {site.present_count}/{site.required_strength} ·{' '}
                <span style={{ color: siteColor(site.computed_status) }}>
                  {site.computed_status}
                </span>
              </Popup>
            </Marker>
          </React.Fragment>
        ))}
      </MapContainer>
    </div>
  );
}
