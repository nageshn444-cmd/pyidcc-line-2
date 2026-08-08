/**
 * Emergency Crew Relief Allocator & Decision Support Engine
 * BMRCL PYIDCC Line 2
 */

// Station indexing for distance and travel time calculation (DN order)
export const STATION_INDEX = {
  "BIET": 0,
  "JIDL": 1,
  "MNJN": 2,
  "NGSA": 3,
  "DSH": 4,
  "JLHL": 5,
  "PYID": 6,
  "PEYA": 7,
  "YPI": 8,
  "YPM": 9,
  "SSFY": 10,
  "MHLI": 11,
  "RJNR": 12,
  "KVPR": 13,
  "SPRU": 14,
  "SPGD": 15,
  "KGWA": 16,
  "CKPE": 17,
  "KRMT": 18,
  "NLC": 19,
  "LBGH": 20,
  "SECE": 21,
  "JYN": 22,
  "RVR": 23,
  "BSNK": 24,
  "JPN": 25,
  "PUTH": 26,
  "APRC": 27,
  "KLPK": 28,
  "VJRH": 29,
  "TGTP": 30,
  "APTS": 31
};

/**
 * Helper to convert HH:MM:SS or HH:MM to seconds from midnight.
 * Handles late-night shifts (before 3 AM) by adding 24 hours.
 */
export const timeToSeconds = (timeStr) => {
  if (!timeStr || timeStr === '--' || timeStr === '-') return 999999;
  const parts = timeStr.split(':');
  let secs = 0;
  if (parts[0]) secs += parseInt(parts[0], 10) * 3600;
  if (parts[1]) secs += parseInt(parts[1], 10) * 60;
  if (parts[2]) secs += parseInt(parts[2], 10);
  
  // Shift late-night train trips (00:00 to 02:59) to the next day for sorting/chronological consistency
  if (secs < 3 * 3600) {
    secs += 24 * 3600;
  }
  return secs;
};

/**
 * Helper to convert seconds to HH:MM:SS format
 */
export const secondsToTime = (secs) => {
  if (secs >= 999999) return '--';
  const shiftedSecs = secs >= 24 * 3600 ? secs - 24 * 3600 : secs;
  const h = Math.floor(shiftedSecs / 3600).toString().padStart(2, '0');
  const m = Math.floor((shiftedSecs % 3600) / 60).toString().padStart(2, '0');
  const s = (shiftedSecs % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
};

/**
 * Calculates travel time between two stations in minutes
 * Assumes 3 minutes travel time per station hop + 2 minutes fixed overhead buffer
 */
export const calculateTravelTimeMinutes = (fromStation, toStation) => {
  const fromIdx = STATION_INDEX[fromStation];
  const toIdx = STATION_INDEX[toStation];
  
  if (fromIdx === undefined || toIdx === undefined) return 15; // default fallback travel time
  if (fromIdx === toIdx) return 2; // same station buffer
  
  return Math.abs(fromIdx - toIdx) * 3 + 2;
};

/**
 * Determines the current scheduled location of an operator based on their roster legs
 */
export const determineOperatorLocation = (operator, currentTimeSecs) => {
  const legs = operator.rawLegs;
  if (!legs) return operator.signOnLocation || "PYID";
  
  const l1Start = timeToSeconds(legs.l1Start);
  const l1End = timeToSeconds(legs.l1End);
  const l2Start = timeToSeconds(legs.l2Start);
  const l2End = timeToSeconds(legs.l2End);
  const l3Start = timeToSeconds(legs.l3Start);
  const l3End = timeToSeconds(legs.l3End);
  const l4Start = timeToSeconds(legs.l4Start);
  const l4End = timeToSeconds(legs.l4End);
  
  if (currentTimeSecs < l1Start) {
    return operator.signOnLocation || "PYID";
  }
  if (currentTimeSecs >= l1Start && currentTimeSecs <= l1End) {
    return legs.l1End && legs.l1End !== '--' ? legs.l1End : "PYID";
  }
  if (currentTimeSecs > l1End && currentTimeSecs < l2Start) {
    // Rest / break between Leg 1 and Leg 2
    return legs.l1End || legs.l2Start || "PYID";
  }
  if (currentTimeSecs >= l2Start && currentTimeSecs <= l2End) {
    return legs.l2End && legs.l2End !== '--' ? legs.l2End : "APTS";
  }
  if (currentTimeSecs > l2End && currentTimeSecs < l3Start) {
    // Rest / break between Leg 2 and Leg 3
    return legs.l2End || legs.l3Start || "APTS";
  }
  if (currentTimeSecs >= l3Start && currentTimeSecs <= l3End) {
    return legs.l3End && legs.l3End !== '--' ? legs.l3End : "PYID";
  }
  if (currentTimeSecs > l3End && currentTimeSecs < l4Start) {
    // Rest / break between Leg 3 and Leg 4
    return legs.l3End || legs.l4Start || "PYID";
  }
  if (currentTimeSecs >= l4Start && currentTimeSecs <= l4End) {
    return legs.l4End && legs.l4End !== '--' ? legs.l4End : "APTS";
  }
  
  return operator.signOffLocation || "PYID";
};

/**
 * Main allocation scoring engine. Evaluates all candidates and generates recommendations.
 */
export const evaluateReliefCandidates = ({
  currentTimeStr,
  incidentType,
  incidentLocation = "PYID",
  targetTrainId = "",
  currentOperator = null, // The operator currently on the train being relieved
  extraOperators = [],
  deployments = [],
  missedTrips = [],
  reliefReports = [],
  crewRegistry = []
}) => {
  const currentTimeSecs = timeToSeconds(currentTimeStr);
  
  // 1. Gather all candidates from the three pools
  const candidatesMap = new Map();
  
  // Pool 1: Extra Operators (Priority 1)
  extraOperators.forEach(op => {
    if (op.availabilityStatus === "AVAILABLE" || op.status === "AVAILABLE") {
      candidatesMap.set(String(op.employeeId), {
        employeeId: String(op.employeeId),
        employeeName: op.employeeName,
        currentLocation: op.currentLocation || "PYID",
        currentDuty: "EXTRA",
        signOnTime: op.signOnTime || currentTimeStr,
        signOffTime: secondsToTime(timeToSeconds(op.signOnTime || currentTimeStr) + 8 * 3600),
        pool: "EXTRA",
        tripCount: 0,
        remarks: "Extra Operator Available Today"
      });
    }
  });
  
  // Pool 2 & 3: STBK, PRO, RD3, TGTP Standby Duties and Regular Active Operators
  deployments.forEach(dep => {
    const empId = String(dep.empId);
    if (!empId || empId === '--' || empId === '-') return;
    
    // Skip if already in the Extra pool
    if (candidatesMap.has(empId)) return;
    
    // Skip the operator currently on the train needing relief
    if (currentOperator && String(currentOperator.employeeId) === empId) return;
    
    const dutyUpper = String(dep.dutyId).toUpperCase();
    const isStbk = dutyUpper.includes("STBK") || dutyUpper.includes("STANDBY");
    const isPro = dutyUpper.includes("PRO");
    const isRd3 = dutyUpper.includes("RD3");
    const isTgtp = dutyUpper.includes("TGTP");
    
    const poolType = isStbk ? "STBK" : isPro ? "PRO" : isRd3 ? "RD3" : isTgtp ? "TGTP" : "ACTIVE";
    const calculatedLoc = determineOperatorLocation(dep, currentTimeSecs);
    
    candidatesMap.set(empId, {
      employeeId: empId,
      employeeName: dep.empName,
      currentLocation: calculatedLoc,
      currentDuty: dep.dutyId,
      signOnTime: dep.signOnTime || "06:00:00",
      signOffTime: dep.rawLegs?.l4End || dep.rawLegs?.l3End || "14:00:00",
      pool: poolType,
      tripCount: 2, // Default average trips
      remarks: isStbk ? "Standby / STBK Peenya Operator" : isPro ? "PRO Standby Duty" : isRd3 ? "RD3 Standby Duty" : isTgtp ? "TGTP Standby Operator" : "Active Roster TO"
    });
  });
  
  const candidatesList = Array.from(candidatesMap.values());
  
  // Helper stats for Duty Balance Improvement (+30)
  // Calculate average duty hours of all active operators
  let totalDutyHours = 0;
  let activeCount = 0;
  candidatesList.forEach(c => {
    if (c.pool !== "EXTRA") {
      const signOn = timeToSeconds(c.signOnTime);
      const signOff = timeToSeconds(c.signOffTime);
      totalDutyHours += (signOff - signOn) / 3600;
      activeCount++;
    }
  });
  const avgDutyHours = activeCount > 0 ? totalDutyHours / activeCount : 8;
  
  // 2. Evaluate each candidate against rules and score them
  const evaluatedCandidates = candidatesList.map(candidate => {
    const signOnSecs = timeToSeconds(candidate.signOnTime);
    const signOffSecs = timeToSeconds(candidate.signOffTime);
    
    // A. Duty Hour Protection (Step 3)
    const dutyDurationSecs = currentTimeSecs - signOnSecs;
    const isDutyDurationExceeded = dutyDurationSecs > 8 * 3600;
    const isSignOffExceeded = currentTimeSecs >= signOffSecs;
    
    if (isDutyDurationExceeded || isSignOffExceeded) {
      return {
        ...candidate,
        status: "REJECTED",
        rejectionReason: "Duty Hour Limit Exceeded",
        recommendationScore: 0,
        breakTime: "--",
        missedTripCount: 0
      };
    }
    
    // B. FIFO break time checks (Step 5)
    // Find when they were last relieved
    const operatorReliefs = reliefReports
      .filter(r => String(r.reliefOperator?.employeeId || r.reliefOperatorId) === candidate.employeeId)
      .sort((a, b) => b.timestamp?.seconds - a.timestamp?.seconds || b.incidentTime - a.incidentTime);
      
    let lastRelievedSecs = 0;
    let hasRecentRelief = false;
    let timeSinceLastRelief = 999999;
    
    if (operatorReliefs.length > 0) {
      const lastRelief = operatorReliefs[0];
      const reliefTimeStr = lastRelief.incidentTime || secondsToTime(lastRelief.timestamp?.seconds || 0);
      lastRelievedSecs = timeToSeconds(reliefTimeStr);
      timeSinceLastRelief = currentTimeSecs - lastRelievedSecs;
      
      // If relieved less than 15 minutes ago, they are on break and break is not completed
      if (timeSinceLastRelief >= 0 && timeSinceLastRelief < 15 * 60) {
        hasRecentRelief = true;
      }
    }
    
    if (hasRecentRelief) {
      return {
        ...candidate,
        status: "REJECTED",
        rejectionReason: "Break Not Completed",
        recommendationScore: 0,
        breakTime: `${Math.round(timeSinceLastRelief / 60)} Mins Ago`,
        missedTripCount: 0
      };
    }
    
    // C. Missed Trip Count
    const operatorMissedTrips = missedTrips.filter(mt => String(mt.employeeId) === candidate.employeeId);
    const missedTripCount = operatorMissedTrips.length;
    
    // D. Score Calculation
    let score = 0;
    const scoreBreakdown = [];
    
    // Priority 1: Extra Operator (+100)
    if (candidate.pool === "EXTRA") {
      score += 100;
      scoreBreakdown.push({ label: "Extra Operator Available", points: 100 });
    }

    // Priority 1B: STBK (Step-back / Standby Peenya) (+95)
    if (candidate.pool === "STBK") {
      score += 95;
      scoreBreakdown.push({ label: "STBK / Standby Peenya Operator", points: 95 });
    }
    
    // Missed Trip Recovery (+90)
    if (missedTripCount > 0) {
      score += 90;
      scoreBreakdown.push({ label: "Missed Trip Recovery", points: 90 });
    }
    
    // Priority 2: PRO Duty (+85)
    if (candidate.pool === "PRO") {
      score += 85;
      scoreBreakdown.push({ label: "PRO Standby Duty", points: 85 });
    }

    // Priority 2B: TGTP Standby Duty (+80)
    if (candidate.pool === "TGTP") {
      score += 80;
      scoreBreakdown.push({ label: "TGTP Standby Duty", points: 80 });
    }
    
    // Priority 2C: RD3 Duty (+75)
    if (candidate.pool === "RD3") {
      score += 75;
      scoreBreakdown.push({ label: "RD3 Standby Duty", points: 75 });
    }
    
    // FIFO Eligible (+60)
    const candidateDurationHours = (currentTimeSecs - signOnSecs) / 3600;
    if (candidateDurationHours > 4) { // Worked longer than half a shift
      score += 60;
      scoreBreakdown.push({ label: "FIFO Eligible (Continuous Work)", points: 60 });
    }
    
    // 15-Minute Break Completed (+50)
    if (candidate.pool === "EXTRA" || candidate.pool === "STBK" || candidate.pool === "PRO" || (operatorReliefs.length > 0 && timeSinceLastRelief >= 15 * 60)) {
      score += 50;
      scoreBreakdown.push({ label: "15-Minute Break Completed", points: 50 });
    }
    
    // Short Loop Possible (+40)
    let isShortLoop = false;
    if (incidentLocation === "PYID" && currentOperator) {
      const currOpReliefs = reliefReports.filter(r => String(r.originalOperator?.employeeId || r.originalOperatorId) === currentOperator.employeeId);
      if (currOpReliefs.length > 0) {
        const lastReliefTime = timeToSeconds(currOpReliefs[0].incidentTime);
        if (currentTimeSecs - lastReliefTime >= 15 * 60) {
          isShortLoop = true;
        }
      }
    }
    
    if (isShortLoop) {
      score += 40;
      scoreBreakdown.push({ label: "Short Loop Possible (PYID UP → DN)", points: 40 });
    }
    
    // Duty Balance Improvement (+30)
    if (candidateDurationHours < avgDutyHours) {
      score += 30;
      scoreBreakdown.push({ label: "Duty Balance Improvement", points: 30 });
    }
    
    // Travel time penalty (nearest suitable operator)
    const travelTime = calculateTravelTimeMinutes(candidate.currentLocation, incidentLocation);
    const distancePenalty = Math.min(20, travelTime * 2);
    score -= distancePenalty;
    if (distancePenalty > 0) {
      scoreBreakdown.push({ label: `Distance Penalty (${travelTime} min travel)`, points: -distancePenalty });
    }
    
    const breakTimeText = operatorReliefs.length > 0 
      ? `${Math.round(timeSinceLastRelief / 60)} Mins Rested` 
      : "Full Shift Available";
      
    return {
      ...candidate,
      status: "ELIGIBLE",
      dutyHours: `${Math.floor(candidateDurationHours)}h ${Math.round((candidateDurationHours % 1) * 60)}m`,
      breakTime: breakTimeText,
      missedTripCount,
      recommendationScore: Math.max(0, score),
      scoreBreakdown,
      travelTimeMinutes: travelTime
    };
  });
  
  // Sort eligible candidates by score descending, then by travel time ascending
  const eligibleCandidates = evaluatedCandidates
    .filter(c => c.status === "ELIGIBLE")
    .sort((a, b) => b.recommendationScore - a.recommendationScore || a.travelTimeMinutes - b.travelTimeMinutes);
    
  const rejectedCandidates = evaluatedCandidates.filter(c => c.status === "REJECTED");
  
  // 3. Assemble Relief Plans (Best, Alt A, Alt B)
  const bestOp = eligibleCandidates[0] || null;
  const altAOp = eligibleCandidates[1] || null;
  const altBOp = eligibleCandidates[2] || null;
  
  const generatePlanDescription = (op, planName) => {
    if (!op) return { planName, available: false, description: "No suitable relief operator found in pool." };
    
    let priorityText = "Priority 3 (Roster TO)";
    if (op.pool === "EXTRA") priorityText = "Priority 1 (Extra TO)";
    if (op.pool === "STBK") priorityText = "Priority 1 (Standby STBK Peenya)";
    if (op.pool === "PRO" || op.pool === "RD3" || op.pool === "TGTP") priorityText = "Priority 2 (Standby TO)";
    
    const travelText = op.travelTimeMinutes === 2 
      ? "already at station" 
      : `requires ${op.travelTimeMinutes} mins travel from ${op.currentLocation}`;
      
    return {
      planName,
      available: true,
      operator: op,
      score: op.recommendationScore,
      recoveryTimeMinutes: op.travelTimeMinutes + 3, // travel time + dispatch setup
      description: `${op.employeeName} (${op.employeeId}) recommended on ${priorityText}. Currently ${travelText}. Duty Hours: ${op.dutyHours}. Rest Time: ${op.breakTime}.`
    };
  };
  
  return {
    bestPlan: generatePlanDescription(bestOp, "Best Relief Plan"),
    alternativePlanA: generatePlanDescription(altAOp, "Alternative Plan A"),
    alternativePlanB: generatePlanDescription(altBOp, "Alternative Plan B"),
    allEligible: eligibleCandidates,
    allRejected: rejectedCandidates,
    shortLoopPossible: incidentLocation === "PYID" && currentOperator && (evaluatedCandidates.some(c => c.scoreBreakdown?.some(b => b.label.includes("Short Loop"))))
  };
};

/**
 * Cascading Delay & Multi-Train Relief Allocation Engine
 * When a primary train gets delayed by a technical issue, downstream trains on the same track
 * suffer secondary delay propagation. This function calculates projected delay for following trains
 * and assigns unique relievers from STBK, PRO, RD3 STBY, TGTP STBY, and EXTRA pools until train service normalizes.
 */
export const evaluateCascadingDelayRelief = ({
  currentTimeStr,
  primaryTrainId,
  delayMinutes = 15,
  incidentLocation = "PYID",
  extraOperators = [],
  deployments = [],
  missedTrips = [],
  reliefReports = []
}) => {
  const primaryDelay = Math.max(5, parseInt(delayMinutes, 10) || 15);
  const currentTimeSecs = timeToSeconds(currentTimeStr);

  // 1. Gather all active trains from deployments sorted chronologically
  const activeTrainMap = new Map();
  deployments.forEach(d => {
    const tid = d.trainId || d.rawLegs?.l1Train || d.rawLegs?.l2Train || d.rawLegs?.l3Train || d.rawLegs?.l4Train;
    if (tid && tid !== '--' && tid !== '-' && d.empId && d.empId !== '--') {
      if (!activeTrainMap.has(tid)) {
        activeTrainMap.set(tid, {
          trainId: tid,
          employeeId: d.empId,
          employeeName: d.empName,
          dutyId: d.dutyId,
          signOnTime: d.signOnTime || "06:00:00",
          signOffTime: d.rawLegs?.l4End || d.rawLegs?.l3End || "14:00:00",
          rawLegs: d.rawLegs
        });
      }
    }
  });

  const sortedTrains = Array.from(activeTrainMap.values()).sort((a, b) => 
    a.trainId.localeCompare(b.trainId, undefined, { numeric: true })
  );

  const primaryIdx = sortedTrains.findIndex(t => t.trainId === primaryTrainId);
  const targetChain = primaryIdx >= 0 ? sortedTrains.slice(primaryIdx) : sortedTrains.slice(0, 5);

  const assignedRelieverIds = new Set();
  const trainCascadePlans = [];

  let currentProjectedDelay = primaryDelay;

  targetChain.forEach((trainItem, index) => {
    if (currentProjectedDelay <= 0) return; // Service normalized!

    const isPrimary = index === 0;
    const trainDelay = isPrimary 
      ? primaryDelay 
      : Math.max(0, currentProjectedDelay - Math.floor(index * 3)); // Delay dampening per following train

    if (trainDelay <= 0) return;

    // Calculate projected takeover time
    const scheduledSecs = currentTimeSecs + index * 600; // 10 min headway intervals
    const projectedSecs = scheduledSecs + trainDelay * 60;
    const projectedTimeStr = secondsToTime(projectedSecs);

    // Evaluate candidates excluding already assigned relievers in this cascade
    const candidateEval = evaluateReliefCandidates({
      currentTimeStr: projectedTimeStr,
      incidentType: isPrimary ? "Train Technical Failure" : "Cascading Headway Delay",
      incidentLocation: isPrimary ? incidentLocation : (trainItem.rawLegs?.l1End || incidentLocation),
      targetTrainId: trainItem.trainId,
      currentOperator: { employeeId: trainItem.employeeId, employeeName: trainItem.employeeName },
      extraOperators: extraOperators.filter(op => !assignedRelieverIds.has(String(op.employeeId))),
      deployments: deployments.filter(dep => !assignedRelieverIds.has(String(dep.empId))),
      missedTrips,
      reliefReports
    });

    const chosenReliever = candidateEval.bestPlan?.available ? candidateEval.bestPlan.operator : null;

    if (chosenReliever) {
      assignedRelieverIds.add(chosenReliever.employeeId);
    }

    trainCascadePlans.push({
      sequence: index + 1,
      trainId: trainItem.trainId,
      currentOperatorId: trainItem.employeeId,
      currentOperatorName: trainItem.employeeName,
      dutyId: trainItem.dutyId,
      isPrimary,
      delayMinutes: trainDelay,
      scheduledTime: secondsToTime(scheduledSecs),
      projectedTakeoverTime: projectedTimeStr,
      location: isPrimary ? incidentLocation : (trainItem.rawLegs?.l1End || incidentLocation),
      suggestedReliever: chosenReliever ? {
        employeeId: chosenReliever.employeeId,
        employeeName: chosenReliever.employeeName,
        pool: chosenReliever.pool,
        dutyId: chosenReliever.currentDuty,
        location: chosenReliever.currentLocation,
        travelTimeMinutes: chosenReliever.travelTimeMinutes,
        score: chosenReliever.recommendationScore,
        status: "RECOMMENDED"
      } : {
        employeeId: "--",
        employeeName: "NO RELIEVER AVAILABLE",
        pool: "NONE",
        dutyId: "--",
        location: "--",
        travelTimeMinutes: 0,
        score: 0,
        status: "UNASSIGNED"
      }
    });

    // Reduce projected delay for subsequent trains as relievers are deployed
    currentProjectedDelay = Math.max(0, trainDelay - 4);
  });

  const totalImpactedTrains = trainCascadePlans.length;
  const totalRelieversAssigned = trainCascadePlans.filter(p => p.suggestedReliever.employeeId !== "--").length;
  const estimatedNormalizationMinutes = primaryDelay + totalImpactedTrains * 3;

  return {
    primaryTrainId,
    primaryDelayMinutes: primaryDelay,
    totalImpactedTrains,
    totalRelieversAssigned,
    estimatedNormalizationMinutes,
    normalizationTimeStr: secondsToTime(currentTimeSecs + estimatedNormalizationMinutes * 60),
    cascadePlans: trainCascadePlans
  };
};
