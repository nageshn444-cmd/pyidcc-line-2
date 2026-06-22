export const checkRosterIntegrity = (deployment) => {
  const warnings = [];
  // Example: Check for unmanned trains
  deployment.forEach(row => {
    if (row.empId === '--') {
      warnings.push({ refId: row.dutyId, severity: 'CRITICAL', message: 'Unmanned Train - Action Required' });
    }
  });
  return warnings;
};
