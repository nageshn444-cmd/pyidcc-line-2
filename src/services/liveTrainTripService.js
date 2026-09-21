/**
 * liveTrainTripService.js
 * BMRCL Line-2 Live Train Trip Association & 4-Digit ID Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Attaches computedTrainId, destinationId, and particularTrainId onto the
 * active train runtime object based on the current WTT trip.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { generate4DigitTrainId, formatParticularTrainId } from '../utils/trainIdResolver.js';

/**
 * Normalizes a trip object into the canonical WTTCycleTrip format expected
 * by the Train ID resolution engine.
 *
 * @param {Object} rawTrip - Raw trip from WTT matrix or live schedule
 * @returns {Object|null} Normalized WTTCycleTrip
 */
export function normalizeWTTCycleTrip(rawTrip) {
  if (!rawTrip) return null;

  let originStationId = rawTrip.originStationId || rawTrip.startStation;
  let destinationStationId = rawTrip.destinationStationId || rawTrip.endStation;
  let direction = rawTrip.direction ? String(rawTrip.direction).toUpperCase() : null;

  // If station codes are stored as a map of stations e.g. { BIET: '05:00', APTS: '05:45' }
  if ((!originStationId || !destinationStationId) && rawTrip.stations) {
    const validStations = Object.keys(rawTrip.stations).filter(
      k => rawTrip.stations[k] && rawTrip.stations[k] !== '--' && rawTrip.stations[k] !== '-'
    );
    if (validStations.length >= 2) {
      originStationId = validStations[0];
      destinationStationId = validStations[validStations.length - 1];
    }
  }

  if (!originStationId || !destinationStationId) {
    return null;
  }

  // Derive direction if missing
  if (!direction) {
    direction = rawTrip.terminalLoopRoute || (rawTrip.isUp ? 'UP' : 'DN');
  }
  if (direction === 'DOWN') direction = 'DN';

  return {
    tripId: String(rawTrip.id || rawTrip.tripId || rawTrip.tripKey || `${originStationId}_${destinationStationId}`),
    originStationId,
    destinationStationId,
    direction,
    tripType: rawTrip.tripType || (originStationId === 'BIET' && destinationStationId === 'APTS' ? 'FULL_LOOP' : 'SHORT_LOOP'),
    dayType: rawTrip.scheduleType || rawTrip.dayType || 'WEEKDAY'
  };
}

/**
 * Finds the currently active WTT trip for a given train unit based on timestamp
 * or route progression.
 *
 * @param {Object} params
 * @param {string|number} params.trainUnitId - Train physical identifier (e.g. 1, 201)
 * @param {number} [params.chainageKm] - Current live track chainage
 * @param {string} [params.direction] - Current travel direction ('UP' | 'DN')
 * @param {number} [params.timestampMinutes] - Current clock time in minutes from midnight
 * @param {Array} [params.trips] - Array of candidate trips for this train
 * @returns {Object|null} Active WTTCycleTrip or null
 */
export function findActiveTripForTrain({
  trainUnitId,
  chainageKm = null,
  direction = null,
  timestampMinutes = null,
  trips = []
}) {
  if (!Array.isArray(trips) || trips.length === 0) {
    return null;
  }

  // 1. Try to find trip matching current timestamp window
  if (typeof timestampMinutes === 'number') {
    const timeMatch = trips.find(tr => {
      const startMin = tr.startMin ?? tr.startTimeMin;
      const endMin = tr.endMin ?? tr.endTimeMin;
      if (typeof startMin === 'number' && typeof endMin === 'number') {
        return timestampMinutes >= startMin && timestampMinutes <= endMin;
      }
      return false;
    });

    if (timeMatch) {
      return normalizeWTTCycleTrip(timeMatch);
    }
  }

  // 2. Try to find trip matching direction
  if (direction) {
    const dirUpper = String(direction).toUpperCase();
    const dirNorm = (dirUpper === 'DOWN' || dirUpper === 'DN') ? 'DN' : 'UP';
    const dirMatch = trips.find(tr => {
      const tripDir = String(tr.direction || tr.terminalLoopRoute || '').toUpperCase();
      const tripDirNorm = (tripDir === 'DOWN' || tripDir === 'DN') ? 'DN' : 'UP';
      return tripDirNorm === dirNorm;
    });

    if (dirMatch) {
      return normalizeWTTCycleTrip(dirMatch);
    }
  }

  // 3. Fall back to first available trip
  return normalizeWTTCycleTrip(trips[0]);
}

/**
 * Enriches a live train runtime object with the 4-digit Train ID resolution results.
 *
 * @param {Object} train - Active train runtime state
 * @param {Object|null} currentTrip - Active WTT cycle trip
 * @returns {Object} Enriched train object with computedTrainId, destinationId, etc.
 */
export function enrichLiveTrainWith4DigitId(train, currentTrip = null) {
  if (!train) return train;

  const rawParticularId = train.particularTrainId || train.trainId;
  const normalizedTrip = currentTrip ? normalizeWTTCycleTrip(currentTrip) : null;

  const idResult = generate4DigitTrainId(rawParticularId, normalizedTrip);

  const particularTrainIdStr = idResult.particularTrainIdStr || formatParticularTrainId(rawParticularId) || String(rawParticularId);

  // Fallback display label if WTT pending or unmapped
  const displayTrainId = idResult.computedTrainId ?? (
    idResult.status === 'WTT_MATCH_PENDING'
      ? `T-${particularTrainIdStr} (PENDING)`
      : idResult.status === 'UNKNOWN_DESTINATION_CODE'
      ? `T-${particularTrainIdStr} (UNMAPPED)`
      : 'DATA_ERR'
  );

  return {
    ...train,
    particularTrainId: particularTrainIdStr,
    destinationId: idResult.destinationId,
    computedTrainId: idResult.computedTrainId,
    trainIdStatus: idResult.status,
    trainIdErrorMessage: idResult.errorMessage,
    displayTrainId,
    // Keep legacy trainId populated with computed ID if valid, otherwise fallback
    trainId: idResult.computedTrainId || train.trainId
  };
}
