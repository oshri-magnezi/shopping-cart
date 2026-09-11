import { useId, useState } from 'react';
import { useTranslation } from '../i18n/useTranslation.js';
import { formatCurrency, formatDateTime } from '../utils/format.js';
import './SpendingTrend.css';

const WIDTH = 640;
const HEIGHT = 120;
const PAD = { top: 14, right: 14, bottom: 14, left: 14 };

/**
 * What each trip cost, oldest to newest.
 *
 * The three stat tiles beside it already give the totals; this answers the one
 * question a number cannot — whether the spending is drifting up or down.
 *
 * The scale starts at zero rather than at the cheapest trip. A floating
 * baseline would turn a ₪20 wobble into a cliff, which is exactly the drama
 * this is meant to report on rather than manufacture.
 */
export function SpendingTrend({ history, locale }) {
  const { t } = useTranslation();
  const gradientId = useId();
  const [hovered, setHovered] = useState(null);

  // History is newest-first; a time axis has to run the other way.
  const points = history
    .filter((entry) => typeof entry.totalCost === 'number')
    .slice()
    .reverse()
    .map((entry) => ({ value: entry.totalCost, at: entry.completedAt, name: entry.name }));

  // One point is not a trend, and the tiles already state the number.
  if (points.length < 2) return null;

  const max = Math.max(...points.map((p) => p.value));
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  const x = (i) => PAD.left + (points.length === 1 ? plotW / 2 : (i * plotW) / (points.length - 1));
  const y = (v) => PAD.top + plotH - (max === 0 ? 0 : (v / max) * plotH);

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${PAD.top + plotH} L${x(0)},${PAD.top + plotH} Z`;

  const last = points[points.length - 1];
  const active = hovered === null ? null : points[hovered];

  return (
    <figure className="trend card">
      <figcaption className="trend-caption">
        <span className="trend-label">{t('history.trendLabel')}</span>
        <span className="trend-readout tabular" dir="ltr">
          {formatCurrency((active ?? last).value, locale)}
        </span>
      </figcaption>

      <svg
        className="trend-plot"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={t('history.trendSummary', {
          count: points.length,
          first: formatCurrency(points[0].value, locale),
          last: formatCurrency(last.value, locale),
        })}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Only the newest trip is marked. A dot on every point, with a number
            beside it, is the noise this is meant to replace. */}
        <circle
          cx={x(points.length - 1)}
          cy={y(last.value)}
          r="4"
          fill="var(--color-accent)"
          stroke="var(--color-surface)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />

        {active ? (
          <circle
            cx={x(hovered)}
            cy={y(active.value)}
            r="4"
            fill="var(--color-primary)"
            stroke="var(--color-surface)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {/* Hit targets are full-height bands, because a 4px dot is not a
            pointer target and is hopeless on a phone. */}
        {points.map((point, i) => (
          <rect
            key={i}
            x={x(i) - plotW / points.length / 2}
            y="0"
            width={plotW / points.length}
            height={HEIGHT}
            fill="transparent"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <title>
              {`${formatCurrency(point.value, locale)}${
                point.at ? ` · ${formatDateTime(point.at, locale)}` : ''
              }`}
            </title>
          </rect>
        ))}
      </svg>
    </figure>
  );
}
