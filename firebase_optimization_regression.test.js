import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  executeDeployment,
  getDeploymentRoster,
  checkDeploymentExists,
  calculateDefaultDayType,
  getDeploymentId,
  validateDeploymentContext,
  createMockFirestore,
} from './src/services/deploymentService.js';
import { computeDutyLegKms } from './src/utils/kmCalculator.js';
import { normalizeDutyId, normalizeScheduleType } from './src/services/wttAndLinkRosterImportService.js';

describe('FIREBASE OPTIMIZATION REGRESSION SUITE — Zero Regressions & Integrity Verification', () => {
  const mockDb = createMockFirestore();

  const sampleRosterDate1 = {
    date: '2026-10-05',
    dayType: 'WEEKDAY',
    duties: [
      { dutyId: '01', dutyNo: '01', empId: '20787', empName: 'Baskar S', status: 'ACTIVE', trainId: '201' },
      { dutyId: '02', dutyNo: '02', empId: '88000110', empName: 'Mahesh S', status: 'ACTIVE', trainId: '202' },
    ],
  };

  const sampleRosterDate2 = {
    date: '2026-10-06',
    dayType: 'WEEKDAY',
    duties: [
      { dutyId: '01', dutyNo: '01', empId: '88000118', empName: 'Harsha SG', status: 'ACTIVE', trainId: '203' },
      { dutyId: '02', dutyNo: '02', empId: '88000116', empName: 'Vinod Biebavi', status: 'ACTIVE', trainId: '204' },
    ],
  };

  it('REGRESSION 1: Write Amplification Test — Deployments write only canonical ID and latest pointer', async () => {
    const result = await executeDeployment(
      {
        deploymentDate: '2026-10-05',
        dayType: 'WEEKDAY',
        rosterData: sampleRosterDate1,
        sourceFile: '05_Oct_2026_Weekday.xlsx',
        user: 'CrewController_01',
      },
      mockDb
    );

    assert.equal(result.success, true);
    assert.equal(result.deploymentId, '2026-10-05_WEEKDAY');

    const depMap = mockDb._collections.get('dispatch_deployments');
    assert.ok(depMap.has('2026-10-05_WEEKDAY'), 'Canonical ID must exist');
    assert.ok(depMap.has('latest'), 'Latest pointer must exist');
    assert.equal(depMap.has('2026-10-05'), false, 'Bare date alias must NOT be written');
    assert.equal(depMap.has('05-10-2026'), false, 'Indian bare date alias must NOT be written');
    assert.equal(depMap.has('current'), false, 'Current alias must NOT be written');

    // Total documents written for this date in dispatch_deployments: exactly 2 (canonical + latest)
    assert.equal(depMap.size, 2, 'Should only contain canonical ID and latest pointer (reduced from 7)');
  });

  it('REGRESSION 2: Date Isolation — Distinct dates never overwrite or cross-contaminate', async () => {
    await executeDeployment(
      {
        deploymentDate: '2026-10-06',
        dayType: 'WEEKDAY',
        rosterData: sampleRosterDate2,
        sourceFile: '06_Oct_2026_Weekday.xlsx',
        user: 'CrewController_01',
      },
      mockDb
    );

    const r1 = await getDeploymentRoster({ deploymentDate: '2026-10-05', dayType: 'WEEKDAY' }, mockDb);
    const r2 = await getDeploymentRoster({ deploymentDate: '2026-10-06', dayType: 'WEEKDAY' }, mockDb);

    assert.equal(r1.deploymentId, '2026-10-05_WEEKDAY');
    assert.equal(r1.rosterData.duties[0].empName, 'Baskar S');

    assert.equal(r2.deploymentId, '2026-10-06_WEEKDAY');
    assert.equal(r2.rosterData.duties[0].empName, 'Harsha SG');
  });

  it('REGRESSION 3: Non-Destructive Isolated Deletion — Deleting one date leaves other dates intact', async () => {
    const depMap = mockDb._collections.get('dispatch_deployments');
    depMap.delete('2026-10-06_WEEKDAY');

    const check06 = await checkDeploymentExists('2026-10-06', 'WEEKDAY', mockDb);
    assert.equal(check06.exists, false, 'Deleted date must report not found');

    const check05 = await checkDeploymentExists('2026-10-05', 'WEEKDAY', mockDb);
    assert.equal(check05.exists, true, 'Prior date must remain 100% intact');
    assert.equal(check05.data.rosterData.duties[0].empName, 'Baskar S');
  });

  it('REGRESSION 4: WTT Schedule Type Normalization & Matching', () => {
    assert.equal(normalizeScheduleType('weekday'), 'WEEKDAY');
    assert.equal(normalizeScheduleType('saturday'), 'SATURDAY');
    assert.equal(normalizeScheduleType('sat & gh'), 'SATURDAY');
    assert.equal(normalizeScheduleType('sunday'), 'SUNDAY');
    assert.equal(normalizeScheduleType('monday'), 'MONDAY');
    assert.equal(normalizeScheduleType('auto'), 'WEEKDAY');
  });

  it('REGRESSION 5: Duty ID Normalization', () => {
    assert.equal(normalizeDutyId('1'), '01');
    assert.equal(normalizeDutyId('01'), '01');
    assert.equal(normalizeDutyId('CR01'), '01');
    assert.equal(normalizeDutyId('CR 05'), '05');
    assert.equal(normalizeDutyId('Duty 12'), '12');
  });

  it('REGRESSION 6: Kilometer Calculation Engine Fidelity', () => {
    const duty1 = {
      dutyNo: '01',
      leg1TrainNo: '201',
      leg1From: 'BIET',
      leg1To: 'APTS',
      leg2TrainNo: '202',
      leg2From: 'APTS',
      leg2To: 'BIET',
    };

    const comp = computeDutyLegKms(duty1, 'WEEKDAY');
    assert.ok(comp, 'KM computation result must exist');
    assert.equal(typeof comp.totalKm, 'number');
    assert.ok(comp.totalKm >= 0, 'Total KM must be non-negative');
  });

  it('REGRESSION 7: Day Type Automatic Calendar Computation', () => {
    // 2026-10-04 is Sunday
    assert.equal(calculateDefaultDayType('2026-10-04'), 'SUNDAY');
    // 2026-10-05 is Monday
    assert.equal(calculateDefaultDayType('2026-10-05'), 'MONDAY');
    // 2026-10-10 is Saturday
    assert.equal(calculateDefaultDayType('2026-10-10'), 'SATURDAY');
    // 2026-10-07 is Wednesday (Weekday)
    assert.equal(calculateDefaultDayType('2026-10-07'), 'WEEKDAY');
  });

  it('REGRESSION 8: Deployment Context Validation Guard', () => {
    assert.throws(
      () => validateDeploymentContext('2026-10-05', { date: '2026-10-06' }),
      /DEPLOYMENT DATE MISMATCH/
    );
    assert.equal(validateDeploymentContext('2026-10-05', { date: '2026-10-05' }), true);
  });
});
