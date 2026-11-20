import L from 'leaflet';

const COLORS = {
  GREEN: '#22c55e',
  YELLOW: '#f59e0b',
  RED: '#f43f5e',
};

export function siteIcon(status = 'GREEN', selected = false) {
  const color = COLORS[status] || COLORS.GREEN;
  const size = selected ? 22 : 16;
  return L.divIcon({
    className: '',
    html: `<div class="site-pin ${status === 'RED' ? 'site-pin-pulse' : ''}" style="width:${size}px;height:${size}px;background:${color}"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

export function siteColor(status = 'GREEN') {
  return COLORS[status] || COLORS.GREEN;
}
