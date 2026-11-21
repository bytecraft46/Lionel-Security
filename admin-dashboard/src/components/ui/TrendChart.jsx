import React from 'react';

/**
 * Smooth SVG area chart of a single daily series, matching the reference design.
 * Rendered without card chrome so the container owns the header and filters.
 */
const WIDTH = 1000;

// Round the ceiling up to a multiple of four so every quarter tick is a whole number.
function niceMax(value) {
  return Math.max(4, Math.ceil(value / 4) * 4);
}

export default function TrendChart({
  data = [],
  labels = [],
  height = 240,
  unit = '',
  pointLabel = 'check-ins',
}) {
  if (data.length === 0) return null;

  const maxVal = niceMax(Math.max(0, ...data));
  const paddingX = 40;
  const paddingY = 30;
  const chartWidth = WIDTH - paddingX * 2;
  const chartHeight = height - paddingY * 2;
  const span = Math.max(data.length - 1, 1);

  const points = data.map((val, idx) => ({
    x: paddingX + (idx / span) * chartWidth,
    y: height - paddingY - (val / maxVal) * chartHeight,
    val,
  }));

  // Smooth cubic bezier path through every point.
  const pathD = points.reduce((acc, point, i, arr) => {
    if (i === 0) return `M ${point.x} ${point.y}`;
    const prev = arr[i - 1];
    const cpX1 = prev.x + (point.x - prev.x) / 2;
    const cpX2 = prev.x + (point.x - prev.x) / 2;
    return `${acc} C ${cpX1} ${prev.y}, ${cpX2} ${point.y}, ${point.x} ${point.y}`;
  }, '');

  const areaD = `${pathD} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`;

  const yTicks = [1, 0.75, 0.5, 0.25, 0].map((fraction) => Math.round(maxVal * fraction));
  // Evenly spaced labels that always include the first and last day of the series.
  const labelCount = Math.min(8, points.length);
  const labelIndexes = new Set(
    Array.from({ length: labelCount }, (_, i) =>
      Math.round((i * (points.length - 1)) / Math.max(labelCount - 1, 1)),
    ),
  );

  return (
    <div className="relative w-full overflow-hidden">
      <svg viewBox={`0 0 ${WIDTH} ${height}`} className="w-full h-auto overflow-visible">
        <defs>
          <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF6B4A" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#FF6B4A" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {yTicks.map((tick) => {
          const y = height - paddingY - (tick / maxVal) * chartHeight;
          return (
            <g key={tick}>
              <line x1={paddingX} y1={y} x2={WIDTH - paddingX} y2={y} stroke="#F1F5F9" strokeWidth="1" />
              <text
                x={paddingX - 10}
                y={y + 3}
                textAnchor="end"
                fill="#94A3B8"
                fontSize="10"
                fontFamily="inherit"
              >
                {tick}{unit}
              </text>
            </g>
          );
        })}

        <path d={areaD} fill="url(#trendGradient)" />
        <path d={pathD} fill="none" stroke="#FF5733" strokeWidth="2.5" strokeLinecap="round" />

        {points.map((pt, idx) => (
          <circle
            key={labels[idx] || idx}
            cx={pt.x}
            cy={pt.y}
            r={pt.val > 0 ? '4' : '2.5'}
            fill="#FF5733"
            stroke="#FFFFFF"
            strokeWidth="2"
          >
            <title>{`${labels[idx]}: ${pt.val} ${pointLabel}`}</title>
          </circle>
        ))}

        {points.map((pt, idx) => {
          if (!labelIndexes.has(idx)) return null;
          const anchor = idx === 0 ? 'start' : idx === points.length - 1 ? 'end' : 'middle';
          return (
            <text
              key={`label-${labels[idx] || idx}`}
              x={pt.x}
              y={height - 8}
              textAnchor={anchor}
              fill="#94A3B8"
              fontSize="9"
              fontFamily="inherit"
            >
              {labels[idx]}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
