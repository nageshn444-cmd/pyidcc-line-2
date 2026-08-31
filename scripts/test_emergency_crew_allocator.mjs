import assert from 'node:assert/strict';
import {
  hungarianAlgorithm,
  timeToSeconds,
  secondsToTime,
  calculateTravelTimeMinutes,
  extractBmrclTrainId,
  resolveDepTrainId,
  evaluateReliefCandidates,
  evaluateCascadingDelayRelief,
  resolveMultiTrainRelief
} from '../src/utils/EmergencyCrewAllocator.js';

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (err) {
    console.error(`FAIL: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
};

// ---------------------------------------------------------------------------
// 1. hungarianAlgorithm correctness
// ---------------------------------------------------------------------------
test('hungarian: simple 3x3 optimal assignment', () => {
  const cost = [
    [4, 1, 3],
    [2, 0, 5],
    [3, 2, 2]
  ];
  const assignment = hungarianAlgorithm(cost);
  let total = 0;
  assignment.forEach((col, row) => { if (col >= 0) total += cost[row][col]; });
  assert.equal(total, 5, `expected optimal total cost 5, got ${total} (assignment=${assignment})`);
  const usedCols = assignment.filter(c => c >= 0);
  assert.equal(new Set(usedCols).size, usedCols.length, 'columns must be unique');
});

test('hungarian: infeasible pairs (Infinity) are avoided in favor of leaving unassigned', () => {
  const cost = [
    [Infinity, Infinity],
    [-50, Infinity]
  ];
  const assignment = hungarianAlgorithm(cost);
  assert.equal(assignment[1], 0, 'row 1 should take the only feasible column');
  assert.equal(assignment[0], -1, 'row 0 has no feasible column and must be left unassigned, not forced');
});

// ---------------------------------------------------------------------------
// 2. Time / train-ID helpers
// ---------------------------------------------------------------------------
test('timeToSeconds / secondsToTime round trip', () => {
  assert.equal(timeToSeconds('06:15:30'), 6 * 3600 + 15 * 60 + 30);
  assert.equal(secondsToTime(timeToSeconds('06:15:30')), '06:15:30');
  assert.equal(timeToSeconds('01:00:00'), 25 * 3600);
});

test('calculateTravelTimeMinutes basic', () => {
  assert.equal(calculateTravelTimeMinutes('PYID', 'PYID'), 2);
  assert.equal(calculateTravelTimeMinutes('BIET', 'JIDL'), 1 * 3 + 2);
});

test('extractBmrclTrainId only accepts canonical 201-223 range', () => {
  assert.equal(extractBmrclTrainId('205'), '205');
  assert.equal(extractBmrclTrainId('Duty D-205 (leg 1)'), '205');
  assert.equal(extractBmrclTrainId('999'), null);
  assert.equal(extractBmrclTrainId('--'), null);
});

test('resolveDepTrainId picks the first canonical train id from a deployment record', () => {
  assert.equal(resolveDepTrainId({ trainId: '210', rawLegs: { l1Train: '205' } }), '210');
  assert.equal(resolveDepTrainId({ rawLegs: { l1Train: '205' } }), '205');
  assert.equal(resolveDepTrainId({}), null);
});

// ---------------------------------------------------------------------------
// 3. evaluateReliefCandidates regression (pool priority + duty-hour/break rules)
// ---------------------------------------------------------------------------
const baseDeployments = () => ([
  { empId: '1001', empName: 'RAVI KUMAR', dutyId: 'STBK-1', signOnTime: '06:00:00', rawLegs: { l1Start: '06:00:00', l1End: '10:00:00' } },
  {
    empId: '1002', empName: 'SUNIL M', dutyId: 'D-205',
    signOnTime: '03:00:00',
    rawLegs: { l1Start: '03:00:00', l1End: '11:30:00', l1Train: '205' }
  },
  { empId: '1003', empName: 'ANITA R', dutyId: 'PRO-9', signOnTime: '06:00:00', rawLegs: { l1Start: '06:00:00', l1End: '14:00:00' } },
  { empId: '1004', empName: 'DEEPA S', dutyId: 'OR STANDBY-1', signOnTime: '06:00:00', rawLegs: { l1Start: '06:00:00', l1End: '14:00:00' } }
]);

test('evaluateReliefCandidates: duty-hour exceeded operator is rejected', () => {
  const results = evaluateReliefCandidates({
    currentTimeStr: '11:35:00', // SUNIL signed on 03:00 -> 8h 35m elapsed, exceeds 8h limit
    incidentType: 'Train Failure',
    incidentLocation: 'PYID',
    targetTrainId: '210',
    currentOperator: null,
    deployments: baseDeployments(),
    reliefReports: []
  });
  const sunil = results.allRejected.find(c => c.employeeId === '1002');
  assert.ok(sunil, 'Sunil should appear in rejected list');
  assert.equal(sunil.rejectionReason, 'Duty Hour Limit Exceeded');
});

test('evaluateReliefCandidates: STANDBY/OR pool outranks STBK, PRO and plain roster', () => {
  const results = evaluateReliefCandidates({
    currentTimeStr: '07:00:00',
    incidentType: 'Train Failure',
    incidentLocation: 'PYID',
    targetTrainId: '210',
    currentOperator: null,
    deployments: baseDeployments(),
    reliefReports: []
  });
  assert.ok(results.bestPlan.available, 'a relief plan should be available');
  assert.equal(results.bestPlan.operator.pool, 'STANDBY', `expected STANDBY/OR candidate to win, got ${results.bestPlan.operator.pool}`);
});

// ---------------------------------------------------------------------------
// 4. resolveMultiTrainRelief — the global optimizer
// ---------------------------------------------------------------------------
test('resolveMultiTrainRelief: 2-train OCC swap resolves both and flags PARALLEL_SWAP', () => {
  const deployments = [
    { empId: '1002', empName: 'SUNIL M', dutyId: 'D-205', signOnTime: '06:00:00', rawLegs: { l1Start: '06:00:00', l1End: '14:00:00', l1Train: '205' } },
    { empId: '2002', empName: 'KUMAR S', dutyId: 'D-210', signOnTime: '06:00:00', rawLegs: { l1Start: '06:00:00', l1End: '14:00:00', l1Train: '210' } },
    { empId: '3001', empName: 'STANDBY GUY', dutyId: 'STBK-1', signOnTime: '06:00:00', rawLegs: { l1Start: '06:00:00', l1End: '14:00:00' } }
  ];

  const result = resolveMultiTrainRelief({
    currentTimeStr: '07:30:00',
    incidents: [
      { trainId: '205', incidentType: 'Train Swap', location: 'PYID' },
      { trainId: '210', incidentType: 'Train Swap', location: 'PYID' }
    ],
    deployments,
    reliefReports: []
  });

  assert.equal(result.totalCount, 2);
  assert.ok(result.resolvedCount >= 1, 'at least one incident should be resolvable from the standby pool');
  assert.equal(result.executionPlan.length, 2);
  const planTrains = result.executionPlan.map(p => p.trainId).sort();
  assert.deepEqual(planTrains, ['205', '210']);
});

test('resolveMultiTrainRelief: candidate cannot relieve their own train', () => {
  const deployments = [
    { empId: '1002', empName: 'SUNIL M', dutyId: 'D-205', signOnTime: '06:00:00', rawLegs: { l1Start: '06:00:00', l1End: '14:00:00', l1Train: '205' } }
  ];
  const result = resolveMultiTrainRelief({
    currentTimeStr: '07:30:00',
    incidents: [{ trainId: '205', incidentType: 'Train Failure', location: 'PYID' }],
    deployments,
    reliefReports: []
  });
  const a = result.assignments[0];
  assert.ok(!a.reliever || a.reliever.employeeId !== '1002', 'operator must not be assigned to relieve their own train');
});

test('resolveMultiTrainRelief: unresolvable incident (no candidates at all) is left unassigned, not crashed', () => {
  const result = resolveMultiTrainRelief({
    currentTimeStr: '07:00:00',
    incidents: [{ trainId: '999', incidentType: 'Train Failure', location: 'PYID' }],
    deployments: [],
    reliefReports: []
  });
  assert.equal(result.resolvedCount, 0);
  assert.deepEqual(result.unresolvedTrainIds, ['999']);
  assert.equal(result.totalResolutionMinutes, 0);
});

test('resolveMultiTrainRelief: constraint relaxation gives an overrideRequired fallback', () => {
  const deployments = [
    { empId: '5001', empName: 'TIRED TO', dutyId: 'D-1', signOnTime: '03:00:00', rawLegs: { l1Start: '03:00:00', l1End: '14:00:00' } }
  ];
  const strict = resolveMultiTrainRelief({
    currentTimeStr: '11:05:00',
    incidents: [{ trainId: '210', incidentType: 'Train Failure', location: 'PYID' }],
    deployments,
    reliefReports: [],
    allowConstraintRelaxation: false
  });
  assert.equal(strict.resolvedCount, 0, 'strict pass should reject the over-duty operator');

  const relaxed = resolveMultiTrainRelief({
    currentTimeStr: '11:05:00',
    incidents: [{ trainId: '210', incidentType: 'Train Failure', location: 'PYID' }],
    deployments,
    reliefReports: [],
    allowConstraintRelaxation: true
  });
  assert.equal(relaxed.resolvedCount, 1, 'relaxed pass should provide a flagged fallback');
  assert.equal(relaxed.assignments[0].overrideRequired, true);
});

test('resolveMultiTrainRelief: 3-train hand-off deadlock is detected as CHAIN_CYCLE', () => {
  const deployments = [
    { empId: 'A', empName: 'OP A', dutyId: 'D-A', signOnTime: '03:00:00', rawLegs: { l1Start: '03:00:00', l1End: '14:00:00', l1Train: '201' } },
    { empId: 'B', empName: 'OP B', dutyId: 'D-B', signOnTime: '03:00:00', rawLegs: { l1Start: '03:00:00', l1End: '14:00:00', l1Train: '202' } },
    { empId: 'C', empName: 'OP C', dutyId: 'D-C', signOnTime: '03:00:00', rawLegs: { l1Start: '03:00:00', l1End: '14:00:00', l1Train: '203' } }
  ];
  const result = resolveMultiTrainRelief({
    currentTimeStr: '07:00:00',
    incidents: [
      { trainId: '201', incidentType: 'Train Swap', location: 'PYID' },
      { trainId: '202', incidentType: 'Train Swap', location: 'PYID' },
      { trainId: '203', incidentType: 'Train Swap', location: 'PYID' }
    ],
    deployments,
    reliefReports: []
  });

  assert.equal(result.resolvedCount, 3, 'all three should resolve (derangement always exists for n=3)');
  const chainCycles = result.cycles.filter(c => c.type === 'CHAIN_CYCLE');
  assert.equal(chainCycles.length, 1, `expected exactly one CHAIN_CYCLE, got ${JSON.stringify(result.cycles)}`);
  assert.equal(result.executionPlan.length, 3);
});

// ---------------------------------------------------------------------------
// 5. evaluateCascadingDelayRelief — upgraded internals, legacy public contract
// ---------------------------------------------------------------------------
test('evaluateCascadingDelayRelief: preserves legacy output shape and resolves a chain', () => {
  const deployments = [
    { empId: '1001', empName: 'PRIMARY OP', dutyId: 'D-205', signOnTime: '06:00:00', rawLegs: { l1Start: '06:00:00', l1End: '14:00:00', l1Train: '205' } },
    { empId: '1002', empName: 'FOLLOWER OP', dutyId: 'D-206', signOnTime: '06:00:00', rawLegs: { l1Start: '06:00:00', l1End: '14:00:00', l1Train: '206' } },
    { empId: '2001', empName: 'STANDBY A', dutyId: 'STBK-1', signOnTime: '06:00:00', rawLegs: { l1Start: '06:00:00', l1End: '14:00:00' } },
    { empId: '2002', empName: 'STANDBY B', dutyId: 'RD3-1', signOnTime: '06:00:00', rawLegs: { l1Start: '06:00:00', l1End: '14:00:00' } }
  ];
  const result = evaluateCascadingDelayRelief({
    currentTimeStr: '07:00:00',
    primaryTrainId: '205',
    delayMinutes: 15,
    incidentLocation: 'PYID',
    deployments,
    reliefReports: []
  });

  ['primaryTrainId', 'primaryDelayMinutes', 'totalImpactedTrains', 'totalRelieversAssigned',
    'estimatedNormalizationMinutes', 'normalizationTimeStr', 'cascadePlans'].forEach(key => {
    assert.ok(key in result, `missing legacy key: ${key}`);
  });
  assert.ok(Array.isArray(result.cascadePlans));
  assert.ok(result.cascadePlans.length >= 1);
  assert.equal(result.cascadePlans[0].trainId, '205');
  assert.equal(result.cascadePlans[0].isPrimary, true);
  assert.ok(result.globalOptimization, 'globalOptimization should be exposed');
});

// ---------------------------------------------------------------------------
// 6. Real crew-compliance gates (H7 standing groups, deployment status,
//    crewRegistry activeCrew/isRelieved, leave_requests)
// ---------------------------------------------------------------------------
test('compliance: candidate marked ON_LEAVE in deployment is rejected, not offered', () => {
  const deployments = [
    { empId: '7001', empName: 'ON LEAVE TO', dutyId: 'STBK-1', status: 'ON_LEAVE', signOnTime: '06:00:00', rawLegs: { l1Start: '06:00:00', l1End: '14:00:00' } },
    { empId: '7002', empName: 'GOOD TO', dutyId: 'STBK-2', signOnTime: '06:00:00', rawLegs: { l1Start: '06:00:00', l1End: '14:00:00' } }
  ];
  const results = evaluateReliefCandidates({
    currentTimeStr: '07:00:00',
    incidentType: 'Train Failure',
    incidentLocation: 'PYID',
    targetTrainId: '210',
    currentOperator: null,
    deployments,
    reliefReports: []
  });
  const rejected = results.allRejected.find(c => c.employeeId === '7001');
  assert.ok(rejected, 'ON_LEAVE candidate should be rejected, not silently dropped');
  assert.match(rejected.rejectionReason, /ON_LEAVE/);
  assert.equal(results.bestPlan.operator.employeeId, '7002', 'the compliant candidate should still be recommended');
});

test('compliance: H7 standing-group employee (Pink Line 4) is never offered as mainline reliever', () => {
  const deployments = [
    { empId: '21414', empName: 'PINK LINE 4 STAFF', dutyId: 'STBK-1', signOnTime: '06:00:00', rawLegs: { l1Start: '06:00:00', l1End: '14:00:00' } }
  ];
  const results = evaluateReliefCandidates({
    currentTimeStr: '07:00:00',
    incidentType: 'Train Failure',
    incidentLocation: 'PYID',
    targetTrainId: '210',
    currentOperator: null,
    deployments,
    reliefReports: []
  });
  assert.equal(results.bestPlan.available, false, 'no eligible reliever should be found');
  const rejected = results.allRejected.find(c => c.employeeId === '21414');
  assert.ok(rejected);
  assert.match(rejected.rejectionReason, /H7/);
});

test('compliance: crewRegistry isRelieved/activeCrew=false blocks a candidate even if deployment looks fine', () => {
  const deployments = [
    { empId: '8001', empName: 'TRANSFERRED TO', dutyId: 'STBK-1', signOnTime: '06:00:00', rawLegs: { l1Start: '06:00:00', l1End: '14:00:00' } }
  ];
  const crewRegistry = [
    { empId: '8001', activeCrew: false, isRelieved: true, relievedReason: 'Working as Station Controller' }
  ];
  const results = evaluateReliefCandidates({
    currentTimeStr: '07:00:00',
    incidentType: 'Train Failure',
    incidentLocation: 'PYID',
    targetTrainId: '210',
    currentOperator: null,
    deployments,
    reliefReports: [],
    crewRegistry
  });
  const rejected = results.allRejected.find(c => c.employeeId === '8001');
  assert.ok(rejected, 'relieved/inactive crewRegistry record should block the candidate');
  assert.match(rejected.rejectionReason, /Relieved/);
});

test('compliance: approved leave_requests entry covering today blocks a candidate (defense-in-depth)', () => {
  const deployments = [
    { empId: '9001', empName: 'ON APPROVED LEAVE', dutyId: 'STBK-1', signOnTime: '06:00:00', rawLegs: { l1Start: '06:00:00', l1End: '14:00:00' } },
    { empId: '9002', empName: 'FINE TO', dutyId: 'STBK-2', signOnTime: '06:00:00', rawLegs: { l1Start: '06:00:00', l1End: '14:00:00' } }
  ];
  const leaveRequests = [
    { empId: '9001', status: 'APPROVED', startDate: '2026-08-29', endDate: '2026-08-31', leaveType: 'CL' }
  ];
  const results = evaluateReliefCandidates({
    currentTimeStr: '07:00:00',
    incidentType: 'Train Failure',
    incidentLocation: 'PYID',
    targetTrainId: '210',
    currentOperator: null,
    deployments,
    reliefReports: [],
    leaveRequests,
    todayDateStr: '2026-08-30'
  });
  const rejected = results.allRejected.find(c => c.employeeId === '9001');
  assert.ok(rejected, 'approved leave covering today should block the candidate');
  assert.match(rejected.rejectionReason, /Approved Leave/);
  assert.equal(results.bestPlan.operator.employeeId, '9002');
});

test('compliance: without todayDateStr, leave_requests are not consulted (opt-in, no false positives)', () => {
  const deployments = [
    { empId: '9001', empName: 'HAS AN OLD LEAVE RECORD', dutyId: 'STBK-1', signOnTime: '06:00:00', rawLegs: { l1Start: '06:00:00', l1End: '14:00:00' } }
  ];
  const leaveRequests = [
    { empId: '9001', status: 'APPROVED', startDate: '2020-01-01', endDate: '2020-01-05', leaveType: 'CL' }
  ];
  const results = evaluateReliefCandidates({
    currentTimeStr: '07:00:00',
    incidentType: 'Train Failure',
    incidentLocation: 'PYID',
    targetTrainId: '210',
    currentOperator: null,
    deployments,
    reliefReports: [],
    leaveRequests
  });
  assert.equal(results.bestPlan.available, true);
  assert.equal(results.bestPlan.operator.employeeId, '9001', 'should not be blocked when no todayDateStr is supplied');
});

test('resolveMultiTrainRelief: compliance gates also apply in the batch/optimal path', () => {
  const deployments = [
    { empId: '21482', empName: 'PINK LINE 4 STAFF 2', dutyId: 'STBK-1', signOnTime: '06:00:00', rawLegs: { l1Start: '06:00:00', l1End: '14:00:00' } },
    { empId: '4001', empName: 'CLEAN CANDIDATE', dutyId: 'STBK-2', signOnTime: '06:00:00', rawLegs: { l1Start: '06:00:00', l1End: '14:00:00' } }
  ];
  const result = resolveMultiTrainRelief({
    currentTimeStr: '07:00:00',
    incidents: [{ trainId: '210', incidentType: 'Train Failure', location: 'PYID' }],
    deployments,
    reliefReports: []
  });
  assert.equal(result.assignments[0].reliever?.employeeId, '4001', 'the standing-group-blocked employee must never be chosen even by the optimizer');
});

test('consoleData: Standby, STBK, OR, and PRO operators from Roster Desk Console are prioritized', () => {
  const consoleData = {
    standbys: [
      { empNo: '88000087', name: 'Manoj LG', code: 'OR', time: '06:00-14:00' },
      { empNo: '88000143', name: 'Nandan Kumar BN', code: 'STANDBY', time: '06:15-14:15' }
    ],
    outstationStepbacks: [
      { empNo: '21953', name: 'Raveen G', station: 'PUTH', time: '06:00-14:00' }
    ],
    customRegisters: {
      PRO: [{ empNo: '88000051', name: 'Mallikarjun HS', info: '06:40:00' }]
    }
  };

  const results = evaluateReliefCandidates({
    currentTimeStr: '07:00:00',
    incidentType: 'Train Failure',
    incidentLocation: 'PYID',
    targetTrainId: '201',
    deployments: [],
    consoleData,
    reliefReports: []
  });

  assert.equal(results.bestPlan.available, true);
  assert.ok(['88000087', '88000143', '21953', '88000051'].includes(results.bestPlan.operator.employeeId));
  assert.equal(results.bestPlan.operator.pool, 'STANDBY');
});

console.log(`\n${passed} test(s) passed.`);
if (process.exitCode) {
  console.error('SOME TESTS FAILED');
} else {
  console.log('ALL TESTS PASSED');
}
