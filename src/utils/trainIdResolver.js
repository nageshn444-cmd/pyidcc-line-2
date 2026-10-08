/**
 * trainIdResolver.js
 * BMRCL Line-2 Dynamic 4-Digit Train ID Generator
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements deterministic 4-digit Train ID resolution, station alias
 * normalization, validation (01–23), and destination code matching.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Line-2 Station Code Normalizer to guarantee consistent matching across
 * diverse timetable, WTT, and telemetry alias inputs.
 *
 * @param {string} station - Station name or code
 * @returns {string} Normalized uppercase station code
 */
export const normalizeStation = (station) => {
  if (!station) return '';
  const s = String(station).trim().toUpperCase();
  
  // Map common variations/aliases to standard canonical codes
  const stationMap = {
    'BIEC': 'BIET',
    'MADAVARA': 'BIET',
    'MADHAVARA': 'BIET',
    'BIET': 'BIET',
    'BIET_BE': 'BIET',
    'SILK_INSTITUTE': 'APTS',
    'ANJANAPURA': 'APTS',
    'ANJANAPURA_TERMINAL': 'APTS',
    'APTS': 'APTS',
    'APTS_BE': 'APTS',
    'APTD': 'APTS',
    'NAGASANDRA': 'NGSA',
    'NGSA': 'NGSA',
    'NGSA_BE': 'NGSA',
    'NGSA_PT': 'NGSA',
    'YELACHENAHALLI': 'PUTH',
    'PUTTENAHALLI': 'PUTH',
    'PUTH': 'PUTH',
    'PUTH_BE': 'PUTH',
    'PEENYA_INDUSTRY': 'PYID',
    'PEENYA_DEPOT': 'PYID',
    'DEPOT': 'PYID',
    'PYID': 'PYID',
  };

  return stationMap[s] || s;
};

/**
 * Resolves 2-digit destination code based strictly on Line-2 WTT rules:
 * 1. BIET DN → APTS DN            => 70 (Full Loop Down)
 * 2. APTS UP → BIET UP            => 90 (Full Loop Up)
 * 3. NGSA or BIET → PUTH DN       => 72 (Short Loop Down: North -> South)
 * 4. PUTH UP or APTS UP → PYID    => 87 (Depot Ingress / Insertion to Peenya)
 * 5. PUTH UP or APTS UP → NGSA UP => 89 (Short Loop Up: South -> North)
 *
 * @param {Object} trip - WTT trip object with originStationId, destinationStationId, direction
 * @returns {string|null} 2-digit destination code or null if unmapped
 */
export function resolveDestinationCode(trip) {
  if (!trip) return null;

  const origin = normalizeStation(trip.originStationId);
  const dest = normalizeStation(trip.destinationStationId);
  const dir = trip.direction ? String(trip.direction).toUpperCase().trim() : '';

  // Specific Termination / Loop Rules
  if (dest === 'PUTH' && (dir === 'DN' || dir === 'DOWN')) {
    return '72'; // Short Loop Down: South to Yelachenahalli
  }
  if (dest === 'PYID' || dest === 'DEPOT') {
    return '87'; // Depot Ingress / Insertion to Peenya
  }
  if (dest === 'NGSA' && dir === 'UP') {
    return '89'; // Short Loop Up: South to Nagasandra
  }

  // Full Line Terminus Destinations
  if (dest === 'BIET' || (dir === 'UP' && dest !== 'PUTH' && dest !== 'PYID')) {
    return '90'; // Up Line towards Madhavara (BIET)
  }
  if (dest === 'APTS' || (dir === 'DN' || dir === 'DOWN')) {
    return '70'; // Down Line towards Anjanapura (APTS)
  }

  // Fallback by direction
  if (dir === 'UP') return '90';
  if (dir === 'DN' || dir === 'DOWN') return '70';

  return '90';
}

/**
 * Validates and formats the 2-digit Particular Train ID (01 - 23).
 * Supports both canonical unit IDs (1..23) and rake numbers (201..223).
 *
 * @param {string|number} rawId - Train ID or unit number
 * @returns {string|null} 2-digit zero-padded string '01'-'23' or null if invalid
 */
export function formatParticularTrainId(rawId) {
  if (rawId === null || rawId === undefined || rawId === '' || rawId === '--' || rawId === '-') {
    return null;
  }

  const str = String(rawId).trim();
  // Reject negative numbers
  if (str.startsWith('-') || (typeof rawId === 'number' && rawId < 0)) {
    return null;
  }

  const parsed = typeof rawId === 'number' ? rawId : parseInt(str.replace(/^[^\d]+/, ''), 10);

  if (isNaN(parsed)) {
    return null;
  }

  // Support 201-223 series (Line 2 3-digit rake identifiers e.g. 201 -> 01, 223 -> 23)
  if (parsed >= 201 && parsed <= 223) {
    return String(parsed - 200).padStart(2, '0');
  }

  if (parsed < 1 || parsed > 23) {
    // If between 24 and 99, take modulo or preserve 2 digits safely
    return String(parsed).padStart(2, '0').slice(-2);
  }

  return String(parsed).padStart(2, '0');
}

/**
 * Primary Generator: Produces the exact 4-digit Train ID
 *
 * @param {string|number} particularTrainId - Rake unit number (e.g. 1, '01', 201)
 * @param {Object|null} currentTrip - Active WTT cycle trip object
 * @returns {Object} Resolution result:
 *   - computedTrainId: string | null (e.g. '7001', '9005')
 *   - destinationId: string | null (e.g. '70', '90')
 *   - particularTrainIdStr: string | null (e.g. '01', '05')
 *   - status: 'VALID' | 'WTT_MATCH_PENDING' | 'INVALID_PARTICULAR_ID' | 'UNKNOWN_DESTINATION_CODE'
 *   - errorMessage?: string
 */
export function generate4DigitTrainId(particularTrainId, currentTrip) {
  const formattedParticularId = formatParticularTrainId(particularTrainId);

  if (!formattedParticularId) {
    return {
      computedTrainId: null,
      destinationId: null,
      particularTrainIdStr: null,
      status: 'INVALID_PARTICULAR_ID',
      errorMessage: `Particular Train ID '${particularTrainId}' is outside operational range (01-23).`
    };
  }

  if (!currentTrip) {
    return {
      computedTrainId: null,
      destinationId: null,
      particularTrainIdStr: formattedParticularId,
      status: 'WTT_MATCH_PENDING',
      errorMessage: `No active WTT trip matched for Train ${formattedParticularId}.`
    };
  }

  const destinationCode = resolveDestinationCode(currentTrip) || (
    (currentTrip.direction === 'DN' || currentTrip.direction === 'DOWN') ? '70' : '90'
  );

  const computedTrainId = `${destinationCode}${formattedParticularId}`;

  return {
    computedTrainId,
    destinationId: destinationCode,
    particularTrainIdStr: formattedParticularId,
    status: 'VALID'
  };
}
