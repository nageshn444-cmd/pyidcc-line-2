/**
 * TrainMarker.jsx
 * BMRCL Line-2 Schematic 4-Digit Train Marker Component
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders the train capsule on the Line-2 schematic track with the computed
 * 4-digit Train ID, direction arrows, and operational status badges.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';

/**
 * TrainMarker SVG Component
 *
 * @param {Object} props
 * @param {Object} props.train - Active train state with computedTrainId, particularTrainId, etc.
 * @param {number} [props.x] - Center X position (falls back to train.currentX or train.x or 0)
 * @param {number} [props.y] - Center Y position (falls back to train.currentY or train.y or 0)
 * @param {Function} [props.onClick] - Click callback
 * @param {Function} [props.onMouseEnter] - Hover enter callback
 * @param {Function} [props.onMouseLeave] - Hover leave callback
 */
export default function TrainMarker({
  train,
  x = null,
  y = null,
  onClick = null,
  onMouseEnter = null,
  onMouseLeave = null
}) {
  if (!train) return null;

  const posX = typeof x === 'number' ? x : (train.currentX ?? train.x ?? 0);
  const posY = typeof y === 'number' ? y : (train.currentY ?? train.y ?? 0);

  const isUp = train.direction === 'UP';
  const isValid = train.trainIdStatus === 'VALID' && Boolean(train.computedTrainId);
  const isPending = train.trainIdStatus === 'WTT_MATCH_PENDING';
  const isErr = !isValid && !isPending;

  // Display label priority: 4-digit computed ID -> display fallback -> particular ID
  const label = train.computedTrainId || train.displayTrainId || `T-${train.particularTrainId || train.trainId}`;

  // Color schemes based on direction and validity
  const getFillColor = () => {
    if (train.isStabling) return '#1e293b'; // Slate stabled
    if (train.isRev || (train.statusText && (train.statusText.includes('BUFFER') || train.statusText.includes('CHANGEOVER')))) {
      return '#881337'; // Rose buffer reversal
    }
    if (isErr) return '#7f1d1d'; // Red error
    if (isPending) return '#78350f'; // Amber pending
    return isUp ? '#059669' : '#0284c7'; // Emerald UP / Sky DN
  };

  const getStrokeColor = () => {
    if (train.isStabling) return '#f59e0b';
    if (isErr) return '#ef4444';
    if (isPending) return '#fbbf24';
    return '#ffffff';
  };

  const tooltipText = [
    `Train ID: ${train.computedTrainId || 'Pending'}`,
    `Physical Unit: ${train.particularTrainId || train.trainId}`,
    `Destination Code: ${train.destinationId || 'N/A'}`,
    `Status: ${train.trainIdStatus || 'UNKNOWN'}`,
    `Direction: ${train.direction || 'N/A'}`,
    `Location: ${train.currentStation || 'Line-2'}`,
    train.originStation && train.destinationStation ? `Route: ${train.originStation} ➔ ${train.destinationStation}` : null,
    train.operatorName ? `Operator: ${train.operatorName}` : null
  ].filter(Boolean).join('\n');

  return (
    <g
      className="train-marker cursor-pointer transition-transform duration-300 ease-out select-none group"
      transform={`translate(${posX}, ${posY})`}
      onClick={() => onClick && onClick(train)}
      onMouseEnter={() => onMouseEnter && onMouseEnter(train)}
      onMouseLeave={() => onMouseLeave && onMouseLeave(train)}
    >
      {/* Glow aura on hover */}
      <rect
        x={-30}
        y={-14}
        width={60}
        height={28}
        rx={5}
        fill="transparent"
        className="group-hover:stroke-yellow-400 group-hover:stroke-2 transition-all"
      />

      {/* Main Train Capsule */}
      <rect
        x={-28}
        y={-12}
        width={56}
        height={24}
        rx={4}
        fill={getFillColor()}
        stroke={getStrokeColor()}
        strokeWidth={1.75}
        className={isErr ? 'train-capsule-warning' : 'train-capsule-normal'}
        filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))"
      />

      {/* Directional Headlight Cone (only when moving) */}
      {!train.isStabling && (train.speedKmH === undefined || train.speedKmH > 0) && (
        isUp ? (
          <polygon
            points="28,-6 44,-13 44,13 28,6"
            fill="#facc15"
            opacity="0.4"
          />
        ) : (
          <polygon
            points="-28,-6 -44,-13 -44,13 -28,6"
            fill="#38bdf8"
            opacity="0.4"
          />
        )
      )}

      {/* 4-Digit Train ID Display */}
      <text
        x={0}
        y={4}
        textAnchor="middle"
        fill="#ffffff"
        fontSize="9.5"
        fontWeight="900"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
      >
        {isValid ? (isUp ? `${label} ➔` : `⬅ ${label}`) : label}
      </text>

      {/* Sub-label badge for driver or status */}
      <rect
        x={-36}
        y={14}
        width={72}
        height={12}
        fill="#0f172a"
        fillOpacity="0.95"
        rx={2}
        stroke="#475569"
        strokeWidth={0.8}
      />
      <text
        x={0}
        y={23}
        textAnchor="middle"
        fill={isErr ? '#f87171' : isPending ? '#fbbf24' : isUp ? '#34d399' : '#38bdf8'}
        fontSize="7"
        fontWeight="bold"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
      >
        {isErr ? 'DATA_ERR' : isPending ? 'WTT PENDING' : (train.operatorName ? train.operatorName.split(' ')[0] : `Unit ${train.particularTrainId}`)}
      </text>

      {/* Detail Tooltip */}
      <title>{tooltipText}</title>
    </g>
  );
}
