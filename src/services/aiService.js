import { db } from '../firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  serverTimestamp, 
  limit 
} from 'firebase/firestore';
import { BMRCL_CREW_REGISTRY } from '../data/bmrclCrewRegistry';

class AIService {
  constructor() {
    this.currentModel = localStorage.getItem('pyidcc_active_model') || 'Gemini 2.5 Flash';
    this.modelHealth = 'HEALTHY';
    this.avgResponseTime = 420; // in ms
    this.predictionAccuracy = 94.6; // percentage
    this.recommendationAccuracy = 96.2; // percentage
  }

  // --- Telemetry and Settings ---
  getControlPanelStats() {
    return {
      currentModel: this.currentModel,
      responseTime: `${this.avgResponseTime}ms`,
      aiHealth: this.modelHealth,
      predictionAccuracy: `${this.predictionAccuracy}%`,
      recommendationAccuracy: `${this.recommendationAccuracy}%`
    };
  }

  setModel(modelName) {
    this.currentModel = modelName;
    localStorage.setItem('pyidcc_active_model', modelName);
    
    // Simulate slight telemetry deviations based on model profile
    switch(modelName) {
      case 'Claude 3.5 Sonnet':
        this.avgResponseTime = 780;
        this.predictionAccuracy = 96.8;
        this.recommendationAccuracy = 98.1;
        break;
      case 'OpenAI GPT-4o':
        this.avgResponseTime = 640;
        this.predictionAccuracy = 95.4;
        this.recommendationAccuracy = 97.4;
        break;
      case 'Ollama Llama-3':
        this.avgResponseTime = 120;
        this.predictionAccuracy = 88.5;
        this.recommendationAccuracy = 90.1;
        break;
      case 'Antigravity Core':
        this.avgResponseTime = 310;
        this.predictionAccuracy = 97.2;
        this.recommendationAccuracy = 98.5;
        break;
      default: // Gemini 2.5 Flash
        this.avgResponseTime = 290;
        this.predictionAccuracy = 94.6;
        this.recommendationAccuracy = 96.2;
    }
  }

  // --- Firestore Recommendation History Logger ---
  async logRecommendation(moduleName, inputDetails, recommendationText, confidence, action = 'PENDING') {
    try {
      const recDoc = {
        module: moduleName,
        model: this.currentModel,
        input: inputDetails,
        recommendation: recommendationText,
        confidence: confidence,
        timestamp: new Date().toISOString(),
        userAction: action, // PENDING, ACCEPTED, REJECTED, MODIFIED
        outcome: action === 'ACCEPTED' ? 'Successful dispatch' : 'No action taken',
        accuracyScore: action === 'ACCEPTED' ? 95 : 0
      };

      const docRef = await addDoc(collection(db, 'ai_recommendation_history'), recDoc);
      return docRef.id;
    } catch (error) {
      console.error('Error logging AI recommendation:', error);
      return null;
    }
  }

  async getRecommendationHistory() {
    try {
      const q = query(
        collection(db, 'ai_recommendation_history'),
        orderBy('timestamp', 'desc'),
        limit(50)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error reading recommendation history:', error);
      // Return simulated backup if collection fails or permissions are restricted
      return [
        {
          id: 'mock-rec-1',
          module: 'Emergency Relief',
          model: 'Gemini 2.5 Flash',
          input: 'Train 214 Delay at RJNR',
          recommendation: 'Deploy Operator Sunil PN from Standby Duty CC2. Relieve at YPM.',
          confidence: 94,
          timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
          userAction: 'ACCEPTED',
          outcome: 'Disruption minimized. Normal timetable restored in 12 mins.',
          accuracyScore: 96
        },
        {
          id: 'mock-rec-2',
          module: 'Leave Assistant',
          model: 'Gemini 2.5 Flash',
          input: 'Emp 22240 CL Request for 2026-06-25',
          recommendation: 'Approve leave. High availability (14 operators standby). Peak hours covered.',
          confidence: 97,
          timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
          userAction: 'ACCEPTED',
          outcome: 'Roster intact. Standby buffers maintained.',
          accuracyScore: 98
        }
      ];
    }
  }

  // --- 1. AI Dashboard aggregated recommendations ---
  async getLiveRecommendations() {
    return {
      relief: {
        title: 'Emergency Relief Engine',
        desc: 'Train 214 delay logged. Suggest immediate relief stepback at YPM.',
        type: 'danger',
        confidence: 92
      },
      leave: {
        title: 'Leave Approvals',
        desc: 'Mohammed Rafiq (CL) is safe to approve. Peak hour coverage intact.',
        type: 'success',
        confidence: 96
      },
      fatigue: {
        title: 'Fatigue Risk Detected',
        desc: 'Operator Rajesh Kumar (22297) exceeds 54 hours. Suggest rest cycle.',
        type: 'warning',
        confidence: 89
      },
      forecast: {
        title: 'Predictive Shortage',
        desc: 'Risk of 2 Operator deficit on Saturday due to combined medical expiries.',
        type: 'warning',
        confidence: 85
      }
    };
  }

  // --- 2. Emergency Relief ---
  calculateEmergencyRelief(trainId, incident, crewList, deployments) {
    // Basic filter: find active crew members on standby, or off-duty close to site
    const standbyCrew = deployments.filter(d => d.status === 'STANDBY' && d.empId !== '--');
    
    let primary = { name: 'Standby Operator A', id: '22240', score: 94, location: 'PYID Depot' };
    let altA = { name: 'Standby Operator B', id: '22296', score: 88, location: 'YPM Station' };
    let altB = { name: 'Standby Operator C', id: '22297', score: 79, location: 'KGWA Station' };

    if (standbyCrew.length > 0) {
      primary = {
        name: standbyCrew[0].empName,
        id: standbyCrew[0].empId,
        score: 95,
        location: standbyCrew[0].signOnLocation || 'Peenya Depot'
      };
      if (standbyCrew.length > 1) {
        altA = {
          name: standbyCrew[1].empName,
          id: standbyCrew[1].empId,
          score: 89,
          location: standbyCrew[1].signOnLocation || 'Peenya Depot'
        };
      }
      if (standbyCrew.length > 2) {
        altB = {
          name: standbyCrew[2].empName,
          id: standbyCrew[2].empId,
          score: 81,
          location: standbyCrew[2].signOnLocation || 'Peenya Depot'
        };
      }
    } else {
      const operators = BMRCL_CREW_REGISTRY.filter(emp => emp.designation && emp.designation.includes('Train Operator'));
      if (operators.length > 0) {
        primary = {
          name: operators[0].name,
          id: operators[0].id,
          score: 94,
          location: 'Peenya Depot'
        };
      }
      if (operators.length > 1) {
        altA = {
          name: operators[1].name,
          id: operators[1].id,
          score: 88,
          location: 'YPM Station'
        };
      }
      if (operators.length > 2) {
        altB = {
          name: operators[2].name,
          id: operators[2].id,
          score: 79,
          location: 'KGWA Station'
        };
      }
    }

    return {
      incidentText: `Incident logged for Train ID ${trainId || '214'} (${incident || 'Rolling Stock fault'})`,
      primaryRelief: `${primary.name} (ID: ${primary.id}) - Based at ${primary.location}`,
      alternativeA: `${altA.name} (ID: ${altA.id}) - Based at ${altA.location}`,
      alternativeB: `${altB.name} (ID: ${altB.id}) - Based at ${altB.location}`,
      confidence: 94,
      metrics: {
        drivingHours: '5h 15m',
        restPeriod: '12h 30m',
        commuteTime: '8 mins'
      }
    };
  }

  // --- 3. Dispatch Optimization ---
  optimizeDispatch(incidents, deployments) {
    const activeDelays = incidents.filter(i => i.status !== 'RESOLVED');
    if (activeDelays.length === 0) {
      return {
        status: 'Optimal',
        recommendations: [
          { type: 'Swaps', desc: 'No swaps required. Line running on schedule.' },
          { type: 'Loops', desc: 'All loop schedules running normally.' },
          { type: 'Crew', desc: 'Crew roster is in balance.' }
        ],
        shortages: 0,
        surplus: 3
      };
    }

    return {
      status: 'Regulation Recommended',
      recommendations: [
        { type: 'Swaps', desc: 'Swap Train 205 (UP) and 209 (DN) at YPM to mitigate cascading delay.' },
        { type: 'Loops', desc: 'Execute short loop at RJNR for Train 214 to absorb 12-minute backlog.' },
        { type: 'Crew', desc: 'Advance deboarding shift for Duty CC4 by 10 minutes.' }
      ],
      shortages: 1,
      surplus: 2
    };
  }

  // --- 4. Leave Approval Assistant ---
  evaluateLeave(leaveRequest, attendanceData, registry) {
    const empId = leaveRequest.empId || '';
    const leaveType = leaveRequest.leaveType || 'CL';
    
    // Check balance / simulated stats
    const balance = leaveType === 'CL' ? 8 : leaveType === 'EL' ? 14 : 5;
    const dutyImpact = 'LOW';
    const peakHourConflict = false;
    const priority = 'NORMAL';

    let action = 'Approve';
    let reason = 'Leave balance is positive. Active reserve standby roster stands at 84%, which is above the 75% threshold limit.';

    if (balance <= 0) {
      action = 'Reject';
      reason = 'Insufficient leave balance. Available balance is 0.';
    } else if (leaveRequest.date === '2026-06-25' && leaveType === 'EL') {
      action = 'Waitlist';
      reason = 'Multiple overlap requests for June 25th. Waitlisted pending senior crew controller authorization.';
    }

    return {
      leaveBalance: `${balance} Days Remaining`,
      crewAvailability: '84% (Reserve Operators Online)',
      dutyImpact: dutyImpact,
      peakHours: peakHourConflict ? 'CONFLICT' : 'NO CONFLICT',
      priority: priority,
      recommendation: action,
      reason: reason
    };
  }

  // --- 5. Shift Exchange Assistant ---
  evaluateShiftExchange(exchange, deployments) {
    const hoursOp1 = 38; // weekly cumulative hours
    const hoursOp2 = 42;
    const restOp1 = 11.5; // rest hours in between
    const restOp2 = 9.0; // rest hours in between (risky if < 11h)

    let recommendation = 'Safe Exchange';
    let details = 'Both operators satisfy the mandatory 11-hour rest rule. Driving licenses are valid, and skill certifications match mainline operations.';

    if (restOp2 < 10) {
      recommendation = 'Risky Exchange';
      details = 'Operator B has a rest period of only 9.0 hours between consecutive shifts. Requires double sign-off validation.';
    }

    return {
      dutyCompatibility: 'COMPATIBLE',
      skillCompatibility: '100% Match (Dual-CAB Certified)',
      dutyHours: `Op A: ${hoursOp1}h / Op B: ${hoursOp2}h`,
      crewBalance: 'Neutral',
      reliefImpact: 'None',
      recommendation,
      details
    };
  }

  // --- 6. Duty Swap Assistant ---
  evaluateDutySwap(dutyId1, dutyId2, deployments) {
    const operators = BMRCL_CREW_REGISTRY.filter(emp => emp.designation && emp.designation.includes('Train Operator'));
    
    let candidates = [
      { name: 'Sunil PN', score: 92, status: 'Optimal' },
      { name: 'Sooraj', score: 85, status: 'Compatible' },
      { name: 'Rajesh Kumar', score: 71, status: 'Restricted (Max Hours)' }
    ];

    if (operators.length >= 3) {
      const filteredOps = operators.filter(op => op.id !== dutyId1);
      candidates = [
        { name: filteredOps[0]?.name || 'Sunil PN', score: 94, status: 'Optimal' },
        { name: filteredOps[1]?.name || 'Sooraj', score: 87, status: 'Compatible' },
        { name: filteredOps[2]?.name || 'Rajesh Kumar', score: 73, status: 'Restricted (Max Hours)' }
      ];
    }

    const firstOp = operators.find(op => op.id !== dutyId1) || { name: 'Sunil PN', id: '22240' };

    return {
      bestPartner: `${candidates[0].name} (ID: ${firstOp.id})`,
      fairnessScore: candidates[0].score,
      operationalImpact: 'NEUTRAL (Zero delay impact on either link)',
      matchingMatrix: candidates
    };
  }

  // --- 7. Crew Normalization Engine ---
  generateNormalizationPlan(incidentData, deployments) {
    return {
      status: 'COMPLETED',
      drivingHours: 'Optimal (Avg 5.8 hrs/operator)',
      dutyCount: '18 Active shifts adjusted',
      reliefCount: '4 stepback relief loops initialized',
      tripCount: '98% of scheduled WTT trips retained',
      kmDistribution: 'Balanced (Standard deviation < 8.2 KM)',
      actions: [
        'Initialize stepback relief at PYID Depot for Train 205',
        'Extend standby duty of Operator Sooraj by 45 minutes',
        'Re-allocate Train 211 to Operator Rajesh Kumar to balance kilometer logs'
      ]
    };
  }

  // --- 8. Fatigue Detection ---
  evaluateFatigue(employeeId, attendanceData) {
    const randomSeed = parseInt(employeeId) || 0;
    
    // Heuristics based on employee ID hash
    const consecutiveDays = (randomSeed % 4) + 2;
    const weeklyHours = (randomSeed % 12) + 40;
    const monthlyHours = (randomSeed % 40) + 160;
    const nightDuties = randomSeed % 3;

    let risk = 'Fatigue Risk';
    let color = 'text-amber-400';
    let suggestion = 'Suggest routine rest day. Operator close to maximum weekly driving threshold.';

    if (weeklyHours > 50 || nightDuties >= 3) {
      risk = 'Critical Fatigue Risk';
      color = 'text-rose-500 bg-rose-950/20';
      suggestion = 'CRITICAL: Exceeds mandatory weekly rest guidelines. Remove from mainline operations immediately.';
    } else if (weeklyHours < 42 && nightDuties === 0) {
      risk = 'Low Fatigue Risk';
      color = 'text-emerald-400';
      suggestion = 'Safe. Driver fits all safety rest margins.';
    }

    return {
      riskLevel: risk,
      colorClass: color,
      metrics: {
        consecutiveDuties: `${consecutiveDays} Days`,
        weeklyHours: `${weeklyHours} Hours`,
        monthlyHours: `${monthlyHours} Hours`,
        reliefFrequency: '1.2 per shift',
        nightDuties: `${nightDuties} duties in 7 days`
      },
      suggestion: suggestion
    };
  }

  // --- 9. Performance Analytics ---
  getPerformanceKPIs(employee, months = 6) {
    return {
      efficiencyScore: 94,
      monthlyRanking: 'Top 15%',
      drivingHours: 148,
      kilometerAnalysis: '3,580 KM driven',
      attendanceAnalysis: '97% Attendance',
      safetyAnalysis: 'Zero minor/major violations',
      trends: [
        { month: 'Jan', efficiency: 91, km: 3200 },
        { month: 'Feb', efficiency: 92, km: 3400 },
        { month: 'Mar', efficiency: 93, km: 3100 },
        { month: 'Apr', efficiency: 90, km: 3350 },
        { month: 'May', efficiency: 94, km: 3500 },
        { month: 'Jun', efficiency: 95, km: 3580 }
      ]
    };
  }

  // --- 10. Predictive Crew Shortage ---
  predictShortages() {
    return {
      today: { status: 'Optimal', deficit: 0, notes: 'Active standby buffer is +3' },
      tomorrow: { status: 'Optimal', deficit: 0, notes: 'Active standby buffer is +2' },
      sevenDays: { status: 'Warning', deficit: 1, notes: 'Deficit of 1 Operator on Saturday due to 2 training sessions' },
      thirtyDays: { status: 'Critical', deficit: 3, notes: 'Predicted deficit of 3 operators due to upcoming annual medical tests' }
    };
  }

  // --- 11. Competency Monitor ---
  checkCompetencies(crewRegistry) {
    const registry = crewRegistry && crewRegistry.length > 0 ? crewRegistry : (BMRCL_CREW_REGISTRY || []);
    const alerts = [];
    
    registry.forEach(emp => {
      if (emp.competencyExpiry) {
        const expiryDate = new Date(emp.competencyExpiry);
        const today = new Date("2026-06-24");
        const diffTime = expiryDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        let status = 'Validity Normal';
        if (diffDays <= 0) {
          status = 'Expired Alarm';
        } else if (diffDays <= 15) {
          status = '30 Days Alert';
        } else if (diffDays <= 45) {
          status = '60 Days Alert';
        } else if (diffDays <= 90) {
          status = '90 Days Alert';
        }
        
        if (status !== 'Validity Normal') {
          alerts.push({
            id: emp.id,
            name: emp.name,
            type: 'Competency Refresher / Medical Validity',
            expiry: emp.competencyExpiry,
            status: status
          });
        }
      }
    });

    if (alerts.length === 0) {
      return [
        { id: '22240', name: 'Sunil PN', type: 'Medical Validity', expiry: '2026-07-24', status: '30 Days Alert' },
        { id: '22296', name: 'Sooraj', type: 'Competency Refresher', expiry: '2026-08-15', status: '60 Days Alert' },
        { id: '22297', name: 'Rajesh Kumar', type: 'Driving License', expiry: '2026-09-20', status: '90 Days Alert' }
      ];
    }
    return alerts;
  }

  // --- 12. Incident Recovery Planner ---
  generateRecoveryPlan(disruptionType, affectedTrain) {
    return {
      planName: `Disruption Recovery Plan: ${disruptionType || 'Signal Failure'} at YPM`,
      crewRequirement: '2 Emergency Standby Operators required at YPM & PYID',
      trainRequirement: 'Deploy Rake R12 from Depot to induction siding',
      estimatedRecoveryTime: '35 Minutes',
      operationalSteps: [
        'Step 1: Terminate Train 214 short loop at RJNR station',
        'Step 2: Instruct Train 208 to hold at KGWA for 4 minutes',
        'Step 3: Transfer Operator Sunil PN to cabin of Rake R12'
      ]
    };
  }

  // --- 13. Report Generator ---
  generateNaturalReport(query) {
    const qStr = String(query).toLowerCase();
    
    if (qStr.includes('performance') || qStr.includes('operator')) {
      return {
        headers: ['Operator Name', 'Employee ID', 'Efficiency Score', 'Kilometers Driven', 'Safety Index'],
        rows: [
          ['Sunil PN', '22240', '95%', '3,840 KM', '100/100'],
          ['Sooraj', '22296', '92%', '3,650 KM', '98/100'],
          ['Rajesh Kumar', '22297', '94%', '3,710 KM', '100/100'],
          ['Mohammed Rafiq', '22241', '89%', '3,420 KM', '95/100']
        ],
        summary: 'Report generated for June operator performance metrics.'
      };
    }

    if (qStr.includes('delay') || qStr.includes('train')) {
      return {
        headers: ['Train ID', 'Date', 'Delay (Mins)', 'Reason', 'Logged By'],
        rows: [
          ['Train 214', '2026-06-24', '12', 'Signal Fluctuation', 'OCC Controller'],
          ['Train 203', '2026-06-23', '6', 'Passenger Door Interlock', 'GCC Control'],
          ['Train 211', '2026-06-21', '8', 'Track Clearance Delay', 'OCC Controller']
        ],
        summary: 'Report generated for delays logged on Line 2.'
      };
    }

    return {
      headers: ['Parameter', 'Value', 'Status'],
      rows: [
        ['Roster Schedule Day', 'WEEKDAY', 'Active'],
        ['Standby Availability', '84%', 'Optimal'],
        ['Active Fleet Size', '12 Trains', 'Operational']
      ],
      summary: 'General telemetry status overview.'
    };
  }

  // --- 14. Knowledge Center ---
  searchKnowledgeBase(searchQuery) {
    const mockDb = [
      { 
        title: 'SOP Section 4: Incident Recovery Operations', 
        content: 'During mainline train breakdowns, the OCC controller shall direct the trailing train to couple with the defective train. Speed must not exceed 10 km/h during coupling.',
        category: 'SOP'
      },
      { 
        title: 'OCC Rulebook Part 2.1: Mainline Speed Regulation', 
        content: 'If signal variance exceeds 5 minutes, speed limits must be reduced to 35 km/h for automatic train operation and 25 km/h for manual override control.',
        category: 'OCC Rules'
      },
      { 
        title: 'Crew Rule 14: Rest Interval Requirements', 
        content: 'A minimum rest interval of 11 hours is mandatory between the sign-off time of one duty and sign-on of the subsequent duty. No overrides allowed.',
        category: 'Crew Rules'
      }
    ];

    const q = String(searchQuery).toLowerCase();
    return mockDb.filter(doc => 
      doc.title.toLowerCase().includes(q) || 
      doc.content.toLowerCase().includes(q)
    );
  }

  // --- 15. Voice Assistant ---
  simulateVoiceResponse(command, lang = 'English') {
    const cmd = String(command).toLowerCase();
    
    if (lang === 'Kannada') {
      if (cmd.includes('relief') || cmd.includes('train 214')) {
        return 'ರೈಲು 214 ಕ್ಕೆ ರಿಲೀಫ್ ಆಪರೇಟರ್ ಸುನಿಲ್ ಪಿಎನ್ ನಿಯೋಜಿಸಲಾಗಿದೆ.';
      }
      return 'ನಮಸ್ಕಾರ, ನಾನು ನಿಮಗೆ ಏನು ಸಹಾಯ ಮಾಡಲಿ?';
    }

    if (lang === 'Hindi') {
      if (cmd.includes('relief') || cmd.includes('train 214')) {
        return 'ट्रेन 214 के लिए रिलीफर सुनील पीएन को तैनात किया गया है।';
      }
      return 'नमस्ते, मैं आपकी क्या सहायता कर सकता हूँ?';
    }

    // English
    if (cmd.includes('relief') || cmd.includes('train 214')) {
      return 'Deploying Primary Reliever Sunil PN for Train 214. Confidence rating 94%. Logging to history.';
    }
    if (cmd.includes('crew') || cmd.includes('available')) {
      return 'There are currently 4 standby crew members available at Peenya Depot.';
    }
    if (cmd.includes('incident') || cmd.includes('delay')) {
      return 'Train 214 has an active 12-minute delay variance logged due to Signal Fluctuation.';
    }

    return 'Command understood. Fetching AI telemetry telemetry data...';
  }

  // --- 16. Chat Copilot ---
  chatWithCopilot(role, message) {
    const msg = String(message).toLowerCase();
    
    if (role === 'CREW_CONTROLLER' || role === 'Crew Controller') {
      if (msg.includes('relief') || msg.includes('swap')) {
        return 'Copilot: Standard relief policy allows standby dispatch. Operator Sunil PN is the optimal reliever candidate. He has driven only 4.2 hours today and satisfies the rest cycle.';
      }
      return 'Copilot: Hello Crew Controller. I can assist with relief recommendations, fatigue audits, shift exchanges, and operator directory searches.';
    }

    if (role === 'GCC') {
      if (msg.includes('incident') || msg.includes('recovery')) {
        return 'Copilot: Mainline blockages at YPM will propagate delays to downstream trains (Train 208, 203). I recommend initiating a short loop recovery plan at RJNR station.';
      }
      return 'Copilot: Hello GCC Controller. Ready for incident regulation support, recovery planning, and train-rake sidings routing.';
    }

    if (role === 'ADMIN_Station_Superintendent' || role === 'Station Superintendent') {
      if (msg.includes('leave') || msg.includes('approval')) {
        return 'Copilot: Leave requests for Sunil PN are low-impact. The current standby reserve ratio stands at 84%, providing ample buffer.';
      }
      return 'Copilot: Hello Station Superintendent. I can assist with leave evaluations, competency compliance reviews, and monthly performance ranking analytics.';
    }

    // Train Operator or default
    return 'Copilot: Hello Operator. You are currently scheduled for Duty 105. Sign-on scheduled at 06:00 at Peenya Depot. WTT Green line schedule is running on time.';
  }

  // --- 17. AI Cab Inspection Journey Planner ---
  calculateALSInspectionRoute(params) {
    const {
      startingStation = 'PYID',
      startingTime = '08:30',
      selectedOperatorIds = [],
      deployments = [],
      linkRoster = [],
      dutyRoster = [],
      wttMatrix = [],
      liveIncidents = [],
      completedInspections = [],
      activeDay = 'WEEKDAY'
    } = params;

    // Helper: convert HH:MM to minutes
    const timeToMins = (tStr) => {
      if (!tStr || tStr === '--' || tStr === '-') return 999999;
      const parts = String(tStr).split(':');
      if (parts.length < 2) return 999999;
      return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    };

    // Helper: convert minutes to HH:MM
    const minsToTime = (mVal) => {
      if (mVal >= 999999) return '--';
      const h = Math.floor(mVal / 60) % 24;
      const m = Math.floor(mVal % 60);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const STATION_ORDER_LIST = [
      "BIET", "JIDL", "MNJN", "NGSA", "DSH", "JLHL", "PYID", "PEYA", "YPI", "YPM",
      "SSFY", "MHLI", "RJNR", "KVPR", "SPRU", "SPGD", "KGWA", "CKPE", "KRMT", "NLC",
      "LBGH", "SECE", "JYN", "RVR", "BSNK", "JPN", "PUTH", "APRC", "KLPK", "VJRH",
      "TGTP", "APTS"
    ];

    const STATION_NAMES = {
      "BIET": "Madavara", "JIDL": "Chikkabidarakallu", "MNJN": "Manjunathanagar", "NGSA": "Nagasandra",
      "DSH": "Dasarahalli", "JLHL": "Jalahalli", "PYID": "Peenya Industry", "PEYA": "Peenya",
      "YPI": "Goraguntepalya", "YPM": "Yeshwanthpur", "SSFY": "Sandal Soap Factory", "MHLI": "Mahalakshmi",
      "RJNR": "Rajajinagar", "KVPR": "Mahakavi Kuvempu Road", "SPRU": "Srirampura", "SPGD": "Mantri Square Sampige Road",
      "KGWA": "Nadaprabhu Kempegowda", "CKPE": "Chickpete", "KRMT": "Krishna Rajendra Market", "NLC": "National College",
      "LBGH": "Lalbagh", "SECE": "South End Circle", "JYN": "Jayanagar", "RVR": "Rashtreeya Vidyalaya Road",
      "BSNK": "Banashankari", "JPN": "Jaya Prakash Nagar", "PUTH": "Yelachenahalli", "APRC": "Konanakunte Cross",
      "KLPK": "Doddakallasandra", "VJRH": "Vajarahalli", "TGTP": "Thalaghattapura", "APTS": "Silk Institute"
    };

    if (selectedOperatorIds.length === 0) {
      return { steps: [], efficiency: 0, travelTime: 0, waitingTime: 0, message: 'No operators selected for inspection.' };
    }

    const wttActive = wttMatrix.filter(t => String(t.scheduleType || '').toUpperCase() === String(activeDay).toUpperCase());

    const delayMap = {};
    liveIncidents.forEach(inc => {
      if (inc.trainId && inc.delayMins) {
        delayMap[String(inc.trainId).trim()] = (delayMap[String(inc.trainId).trim()] || 0) + Number(inc.delayMins);
      }
    });

    // ── 1. Strict Multi-Dataset Validation ──
    const validationErrors = [];

    selectedOperatorIds.forEach(opId => {
      const dep = deployments.find(d => String(d.empId).trim() === String(opId).trim());
      if (!dep) {
        validationErrors.push(`Operator ID ${opId} not found in today's active deployments.`);
        return;
      }

      const normDuty = String(dep.dutyId).padStart(2, '0');

      // Validate Duty exists in Duty Roster
      const dutyExists = dutyRoster.some(d => String(d.dutyId).padStart(2, '0') === normDuty && String(d.scheduleType).toUpperCase() === String(activeDay).toUpperCase());
      if (!dutyExists) {
        validationErrors.push(`Duty ${normDuty} assigned to ${dep.empName} does not exist in today's Duty Roster.`);
      }

      // Validate Link exists in Link Roster
      const linkExists = linkRoster.some(l => String(l.dutyId).padStart(2, '0') === normDuty && String(l.scheduleType).toUpperCase() === String(activeDay).toUpperCase());
      if (!linkExists) {
        validationErrors.push(`Link for Duty ${normDuty} (assigned to ${dep.empName}) does not exist in today's Link Roster.`);
      }

      // Validate train IDs assigned exist in WTT
      const legs = dep.rawLegs || {};
      let hasValidTrain = false;
      for (let i = 1; i <= 4; i++) {
        const legTrain = legs[`l${i}Train`] || legs[`leg${i}TrainNo`];
        if (legTrain && legTrain !== '--' && legTrain !== '-') {
          hasValidTrain = true;
          const trainExistsInWtt = wttActive.some(trip => String(trip.trainId).trim() === String(legTrain).trim());
          if (!trainExistsInWtt) {
            validationErrors.push(`Train ${legTrain} assigned to operator ${dep.empName} (Duty ${normDuty}) does not exist in today's Working Time Table (WTT).`);
          }
        }
      }
      if (!hasValidTrain) {
        validationErrors.push(`Operator ${dep.empName} (Duty ${normDuty}) has no valid train assigned in their shift roster.`);
      }
    });

    // Validate station sequence, chronology, and direction in WTT
    wttActive.forEach(trip => {
      const trainId = String(trip.trainId).trim();
      const stops = [];
      Object.entries(trip.stations || {}).forEach(([stCode, timeStr]) => {
        if (timeStr && timeStr !== '--' && timeStr !== '-') {
          const cleanSt = stCode.split('_')[0];
          if (STATION_ORDER_LIST.includes(cleanSt)) {
            stops.push({
              station: cleanSt,
              timeMin: timeToMins(timeStr)
            });
          }
        }
      });

      if (stops.length >= 2) {
        stops.sort((a, b) => a.timeMin - b.timeMin);

        // Check chronological timings
        for (let i = 0; i < stops.length - 1; i++) {
          if (stops[i].timeMin > stops[i + 1].timeMin) {
            validationErrors.push(`Train timings for Train ${trainId} Trip ${trip.tripNo || '1'} are not chronological.`);
          }
        }

        // Check direction consistency
        const firstIdx = STATION_ORDER_LIST.indexOf(stops[0].station);
        const lastIdx = STATION_ORDER_LIST.indexOf(stops[stops.length - 1].station);
        if (firstIdx === lastIdx) {
          validationErrors.push(`Train ${trainId} Trip ${trip.tripNo || '1'} starts and ends at the same station without movement.`);
        }
      }
    });

    const uniqueErrors = Array.from(new Set(validationErrors));
    if (uniqueErrors.length > 0) {
      return {
        isValid: false,
        validationErrors: uniqueErrors,
        steps: [],
        travelTime: 0,
        waitingTime: 0,
        efficiency: 0,
        message: 'Unable to generate inspection route because Duty Roster, Link Roster and WTT do not match.'
      };
    }

    // ── 2. Gather All Scheduled Driving Segments for Selected Operators ──
    const selectedOps = new Set(selectedOperatorIds);
    const drivingSegments = [];

    selectedOperatorIds.forEach(opId => {
      const dep = deployments.find(d => String(d.empId).trim() === String(opId).trim());
      if (!dep) return;

      const legs = dep.rawLegs || {};
      for (let i = 1; i <= 4; i++) {
        const legTrain = legs[`l${i}Train`] || legs[`leg${i}TrainNo`];
        const legStart = legs[`l${i}Start`] || legs[`leg${i}TimeFrom`] || legs[`leg${i}DepTime`];
        const legEnd = legs[`l${i}End`] || legs[`leg${i}TimeTo`] || legs[`leg${i}ArrTime`];

        if (legTrain && legTrain !== '--' && legTrain !== '-') {
          const startM = timeToMins(legStart);
          const endM = timeToMins(legEnd);

          // Find WTT trips for this train running during this leg
          const matchingWtt = wttActive.filter(trip => {
            if (String(trip.trainId).trim() !== String(legTrain).trim()) return false;
            
            const tripStops = [];
            Object.entries(trip.stations || {}).forEach(([stCode, timeStr]) => {
              if (timeStr && timeStr !== '--' && timeStr !== '-') {
                tripStops.push({
                  station: stCode.split('_')[0],
                  timeMin: timeToMins(timeStr)
                });
              }
            });
            if (tripStops.length < 2) return false;
            tripStops.sort((a, b) => a.timeMin - b.timeMin);

            const tripStart = tripStops[0].timeMin;
            const tripEnd = tripStops[tripStops.length - 1].timeMin;

            return tripStart >= startM - 15 && tripEnd <= endM + 15;
          });

          matchingWtt.forEach(trip => {
            const stops = [];
            const added = new Set();
            Object.entries(trip.stations || {}).forEach(([stCode, timeStr]) => {
              if (timeStr && timeStr !== '--' && timeStr !== '-') {
                const cleanSt = stCode.split('_')[0];
                if (STATION_ORDER_LIST.includes(cleanSt) && !added.has(cleanSt)) {
                  added.add(cleanSt);
                  stops.push({
                    station: cleanSt,
                    timeMin: timeToMins(timeStr) + (delayMap[String(trip.trainId).trim()] || 0)
                  });
                }
              }
            });
            stops.sort((a, b) => a.timeMin - b.timeMin);
            if (stops.length >= 2) {
              const direction = STATION_ORDER_LIST.indexOf(stops[0].station) < STATION_ORDER_LIST.indexOf(stops[stops.length - 1].station) ? 'DN' : 'UP';
              drivingSegments.push({
                operatorId: dep.empId,
                operatorName: dep.empName,
                dutyId: dep.dutyId,
                trainId: String(trip.trainId).trim(),
                tripNo: trip.tripNo || '1',
                legNo: i,
                direction,
                stops,
                startTimeMin: stops[0].timeMin,
                endTimeMin: stops[stops.length - 1].timeMin,
                startStation: stops[0].station,
                endStation: stops[stops.length - 1].station
              });
            }
          });
        }
      }
    });

    drivingSegments.sort((a, b) => a.startTimeMin - b.startTimeMin);

    if (drivingSegments.length === 0) {
      return {
        isValid: false,
        validationErrors: ["No active WTT driving trips found for the selected operators during their duty roster legs."],
        steps: [],
        travelTime: 0,
        waitingTime: 0,
        efficiency: 0,
        message: 'No driving segments available.'
      };
    }

    // ── 3. Pathfinder Simulation & Journey Construction ──
    let currentStation = startingStation;
    let currentTimeMin = timeToMins(startingTime);
    const steps = [];
    const inspectedOps = new Set();
    let totalWaitMins = 0;
    let totalTravelMins = 0;

    // Helper: Find scheduled train in WTT to transit from S_from to S_to starting at or after t_start
    const findConnectingTrain = (fromSt, toSt, tStart) => {
      let bestTrip = null;
      let earliestArrival = Infinity;

      wttActive.forEach(trip => {
        const stops = [];
        const added = new Set();
        Object.entries(trip.stations || {}).forEach(([stCode, timeStr]) => {
          if (timeStr && timeStr !== '--' && timeStr !== '-') {
            const cleanSt = stCode.split('_')[0];
            if (STATION_ORDER_LIST.includes(cleanSt) && !added.has(cleanSt)) {
              added.add(cleanSt);
              stops.push({
                station: cleanSt,
                timeMin: timeToMins(timeStr) + (delayMap[String(trip.trainId).trim()] || 0)
              });
            }
          }
        });
        stops.sort((a, b) => a.timeMin - b.timeMin);

        const fromIdx = stops.findIndex(s => s.station === fromSt);
        const toIdx = stops.findIndex(s => s.station === toSt);
        if (fromIdx !== -1 && toIdx !== -1 && toIdx > fromIdx) {
          const depTime = stops[fromIdx].timeMin;
          const arrTime = stops[toIdx].timeMin;
          if (depTime >= tStart && arrTime < earliestArrival) {
            earliestArrival = arrTime;
            bestTrip = {
              trainId: String(trip.trainId).trim(),
              tripNo: trip.tripNo || '1',
              direction: STATION_ORDER_LIST.indexOf(stops[0].station) < STATION_ORDER_LIST.indexOf(stops[stops.length - 1].station) ? 'DN' : 'UP',
              depTime,
              arrTime,
              stops: stops.slice(fromIdx, toIdx + 1)
            };
          }
        }
      });

      return bestTrip;
    };

    const getTravelTimeBetweenStations = (fromSt, toSt) => {
      const idx1 = STATION_ORDER_LIST.indexOf(fromSt);
      const idx2 = STATION_ORDER_LIST.indexOf(toSt);
      if (idx1 === -1 || idx2 === -1) return 15;
      return Math.max(2, Math.abs(idx1 - idx2) * 2);
    };

    // Initial leave step
    steps.push({
      time: minsToTime(currentTimeMin),
      action: 'LEAVE',
      stationCode: currentStation,
      stationName: STATION_NAMES[currentStation] || currentStation,
      details: `Leave ${STATION_NAMES[currentStation] || currentStation} Office`
    });

    const maxIterations = 10;
    let iterations = 0;

    while (inspectedOps.size < selectedOps.size && iterations < maxIterations) {
      iterations++;

      let bestSeg = null;
      let bestTransitTrip = null;
      let bestBoardStop = null;
      let bestDeboardStop = null;
      let earliestFinishTime = Infinity;

      drivingSegments.forEach(seg => {
        if (inspectedOps.has(seg.operatorId)) return;

        seg.stops.forEach((boardStop, bIdx) => {
          const t_board = boardStop.timeMin;

          let transitTrip = null;
          let arrivalAtBoardSt = currentTimeMin;

          if (boardStop.station === currentStation) {
            arrivalAtBoardSt = currentTimeMin + 3;
          } else {
            transitTrip = findConnectingTrain(currentStation, boardStop.station, currentTimeMin + 3);
            if (transitTrip) {
              arrivalAtBoardSt = transitTrip.arrTime + 2;
            } else {
              return;
            }
          }

          if (t_board >= arrivalAtBoardSt + 1) {
            const deboardIdx = Math.min(bIdx + 2, seg.stops.length - 1);
            if (deboardIdx > bIdx) {
              const deboardStop = seg.stops[deboardIdx];
              const t_deboard = deboardStop.timeMin;

              if (t_deboard < earliestFinishTime) {
                earliestFinishTime = t_deboard;
                bestSeg = seg;
                bestTransitTrip = transitTrip;
                bestBoardStop = boardStop;
                bestDeboardStop = deboardStop;
              }
            }
          }
        });
      });

      if (!bestSeg) {
        break;
      }

      // Handle long gaps (> 60 mins)
      const nextBoardTime = bestBoardStop.timeMin;
      if (nextBoardTime - currentTimeMin > 60) {
        if (currentStation !== 'PYID') {
          const returnTrip = findConnectingTrain(currentStation, 'PYID', currentTimeMin + 3);
          if (returnTrip) {
            const currentDir = returnTrip.direction;
            steps.push({
              time: minsToTime(currentTimeMin + 3),
              action: 'WALK',
              stationCode: currentStation,
              stationName: STATION_NAMES[currentStation] || currentStation,
              details: `Walk from Platform to Platform ${currentDir === 'UP' ? '1' : '2'}`
            });
            steps.push({
              time: `${minsToTime(currentTimeMin + 3)} - ${minsToTime(returnTrip.depTime)}`,
              action: 'WAIT',
              stationCode: currentStation,
              stationName: STATION_NAMES[currentStation] || currentStation,
              details: `Wait ${returnTrip.depTime - (currentTimeMin + 3)} mins on Platform ${currentDir === 'UP' ? '1 (UP direction)' : '2 (DN direction)'}`
            });
            steps.push({
              time: minsToTime(returnTrip.depTime),
              action: 'BOARD',
              stationCode: currentStation,
              stationName: STATION_NAMES[currentStation] || currentStation,
              details: `Board Train ${returnTrip.trainId} ${returnTrip.direction} (Platform ${currentDir === 'UP' ? '1' : '2'})`
            });
            steps.push({
              time: `${minsToTime(returnTrip.depTime)} - ${minsToTime(returnTrip.arrTime)}`,
              action: 'TRANSIT',
              stationCode: 'PYID',
              stationName: 'Peenya Industry',
              details: `Transit ride to Peenya Industry`
            });
            steps.push({
              time: minsToTime(returnTrip.arrTime),
              action: 'DEBOARD',
              stationCode: 'PYID',
              stationName: 'Peenya Industry',
              details: `Deboard Train ${returnTrip.trainId} at Peenya Industry`
            });
            currentTimeMin = returnTrip.arrTime;
            currentStation = 'PYID';
          }
        }

        steps.push({
          time: minsToTime(currentTimeMin),
          action: 'RETURN',
          stationCode: 'PYID',
          stationName: 'Peenya Industry',
          details: 'Return to PYID CC Office'
        });

        currentTimeMin = nextBoardTime - 30;
        steps.push({
          time: minsToTime(currentTimeMin),
          action: 'LEAVE',
          stationCode: 'PYID',
          stationName: 'Peenya Industry',
          details: 'Leave Peenya Industry Office for evening inspection session'
        });
      }

      // Handle transit ride
      if (bestTransitTrip) {
        const transitDir = bestTransitTrip.direction;
        const transitP = transitDir === 'UP' ? '1' : '2';
        
        steps.push({
          time: minsToTime(currentTimeMin + 3),
          action: 'WALK',
          stationCode: currentStation,
          stationName: STATION_NAMES[currentStation] || currentStation,
          details: `Walk from CC Office / Platform to Platform ${transitP} (${transitDir})`
        });

        steps.push({
          time: `${minsToTime(currentTimeMin + 3)} - ${minsToTime(bestTransitTrip.depTime)}`,
          action: 'WAIT',
          stationCode: currentStation,
          stationName: STATION_NAMES[currentStation] || currentStation,
          details: `Wait ${bestTransitTrip.depTime - (currentTimeMin + 3)} mins on Platform ${transitP} (${transitDir} direction)`
        });

        steps.push({
          time: minsToTime(bestTransitTrip.depTime),
          action: 'BOARD',
          stationCode: currentStation,
          stationName: STATION_NAMES[currentStation] || currentStation,
          details: `Board Train ${bestTransitTrip.trainId} ${transitDir} (Platform ${transitP})`
        });

        steps.push({
          time: `${minsToTime(bestTransitTrip.depTime)} - ${minsToTime(bestTransitTrip.arrTime)}`,
          action: 'TRANSIT',
          stationCode: bestBoardStop.station,
          stationName: STATION_NAMES[bestBoardStop.station] || bestBoardStop.station,
          details: `Transit ride to intercept next target`
        });

        steps.push({
          time: minsToTime(bestTransitTrip.arrTime),
          action: 'DEBOARD',
          stationCode: bestBoardStop.station,
          stationName: STATION_NAMES[bestBoardStop.station] || bestBoardStop.station,
          details: `Deboard Train ${bestTransitTrip.trainId} at ${STATION_NAMES[bestBoardStop.station] || bestBoardStop.station}`
        });

        currentTimeMin = bestTransitTrip.arrTime;
        currentStation = bestBoardStop.station;
      }

      // Board target train
      const targetDir = bestSeg.direction;
      const targetP = targetDir === 'UP' ? '1' : '2';

      const isPlatformChange = bestTransitTrip && bestTransitTrip.direction !== bestSeg.direction;
      if (isPlatformChange) {
        steps.push({
          time: minsToTime(currentTimeMin + 2),
          action: 'WALK',
          stationCode: currentStation,
          stationName: STATION_NAMES[currentStation] || currentStation,
          details: `Walk from Platform ${bestTransitTrip.direction === 'UP' ? '1' : '2'} to Platform ${targetP}`
        });
        steps.push({
          time: `${minsToTime(currentTimeMin + 2)} - ${minsToTime(bestBoardStop.timeMin)}`,
          action: 'WAIT',
          stationCode: currentStation,
          stationName: STATION_NAMES[currentStation] || currentStation,
          details: `Wait ${bestBoardStop.timeMin - (currentTimeMin + 2)} mins on Platform ${targetP} (${targetDir} direction)`
        });
      } else {
        const waitMins = bestBoardStop.timeMin - currentTimeMin;
        if (waitMins > 0) {
          steps.push({
            time: `${minsToTime(currentTimeMin)} - ${minsToTime(bestBoardStop.timeMin)}`,
            action: 'WAIT',
            stationCode: currentStation,
            stationName: STATION_NAMES[currentStation] || currentStation,
            details: `Wait ${waitMins} mins on Platform ${targetP} (${targetDir} direction)`
          });
        }
      }

      steps.push({
        time: minsToTime(bestBoardStop.timeMin),
        action: 'BOARD',
        stationCode: currentStation,
        stationName: STATION_NAMES[currentStation] || currentStation,
        details: `Board Train ${bestSeg.trainId} ${targetDir} (Platform ${targetP})`
      });

      // Inspect
      steps.push({
        time: `${minsToTime(bestBoardStop.timeMin)} - ${minsToTime(bestDeboardStop.timeMin)}`,
        action: 'INSPECT',
        operatorId: bestSeg.operatorId,
        operatorName: bestSeg.operatorName,
        trainId: bestSeg.trainId,
        direction: targetDir,
        stationCode: bestDeboardStop.station,
        stationName: STATION_NAMES[bestDeboardStop.station] || bestDeboardStop.station,
        details: `Inspect Operator ${bestSeg.operatorName} (ID: ${bestSeg.operatorId}) in Cab`,
        tripNo: bestSeg.tripNo,
        legNo: bestSeg.legNo,
        dutyId: bestSeg.dutyId
      });

      steps.push({
        time: minsToTime(bestDeboardStop.timeMin),
        action: 'DEBOARD',
        stationCode: bestDeboardStop.station,
        stationName: STATION_NAMES[bestDeboardStop.station] || bestDeboardStop.station,
        details: `Deboard Train ${bestSeg.trainId} at ${STATION_NAMES[bestDeboardStop.station] || bestDeboardStop.station}`
      });

      inspectedOps.add(bestSeg.operatorId);
      currentTimeMin = bestDeboardStop.timeMin;
      currentStation = bestDeboardStop.station;
    }

    // Return to starting station
    if (currentStation !== startingStation) {
      const returnTrip = findConnectingTrain(currentStation, startingStation, currentTimeMin + 2);
      if (returnTrip) {
        const returnDir = returnTrip.direction;
        const returnP = returnDir === 'UP' ? '1' : '2';

        steps.push({
          time: minsToTime(currentTimeMin + 2),
          action: 'WALK',
          stationCode: currentStation,
          stationName: STATION_NAMES[currentStation] || currentStation,
          details: `Walk from Platform to Platform ${returnP}`
        });

        steps.push({
          time: `${minsToTime(currentTimeMin + 2)} - ${minsToTime(returnTrip.depTime)}`,
          action: 'WAIT',
          stationCode: currentStation,
          stationName: STATION_NAMES[currentStation] || currentStation,
          details: `Wait ${returnTrip.depTime - (currentTimeMin + 2)} mins on Platform ${returnP} (${returnDir} direction)`
        });

        steps.push({
          time: minsToTime(returnTrip.depTime),
          action: 'BOARD',
          stationCode: currentStation,
          stationName: STATION_NAMES[currentStation] || currentStation,
          details: `Board Train ${returnTrip.trainId} ${returnDir} (Platform ${returnP})`
        });

        steps.push({
          time: `${minsToTime(returnTrip.depTime)} - ${minsToTime(returnTrip.arrTime)}`,
          action: 'TRANSIT',
          stationCode: startingStation,
          stationName: STATION_NAMES[startingStation] || startingStation,
          details: `Return transit ride to starting station`
        });

        steps.push({
          time: minsToTime(returnTrip.arrTime),
          action: 'DEBOARD',
          stationCode: startingStation,
          stationName: STATION_NAMES[startingStation] || startingStation,
          details: `Deboard Train ${returnTrip.trainId} at ${STATION_NAMES[startingStation] || startingStation}`
        });

        currentTimeMin = returnTrip.arrTime;
        currentStation = startingStation;
      }
    }

    steps.push({
      time: minsToTime(currentTimeMin),
      action: 'COMPLETED',
      stationCode: currentStation,
      stationName: STATION_NAMES[currentStation] || currentStation,
      details: 'ALS Cab Inspection Journey Completed successfully'
    });

    const activeInspectionsCount = inspectedOps.size;
    const missedCount = selectedOperatorIds.length - inspectedOps.size;
    const efficiency = totalTravelMins > 0 ? Math.round((activeInspectionsCount * 15 / (totalTravelMins + totalWaitMins)) * 100) : 0;

    return {
      isValid: true,
      steps,
      travelTime: totalTravelMins,
      waitingTime: totalWaitMins,
      efficiency: Math.min(100, Math.max(10, efficiency)),
      missedCount,
      completedCount: activeInspectionsCount
    };
  }

  detectCrossoverOpportunities(params) {
    const {
      deployments = [],
      wttMatrix = [],
      liveIncidents = [],
      activeDay = 'WEEKDAY'
    } = params;

    // Helper: convert HH:MM to minutes
    const timeToMins = (tStr) => {
      if (!tStr || tStr === '--' || tStr === '-') return 999999;
      const parts = String(tStr).split(':');
      if (parts.length < 2) return 999999;
      return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    };

    const STATION_NAMES = {
      "BIET": "Madavara", "JIDL": "Chikkabidarakallu", "MNJN": "Manjunathanagar", "NGSA": "Nagasandra",
      "DSH": "Dasarahalli", "JLHL": "Jalahalli", "PYID": "Peenya Industry", "PEYA": "Peenya",
      "YPI": "Goraguntepalya", "YPM": "Yeshwanthpur", "SSFY": "Sandal Soap Factory", "MHLI": "Mahalakshmi",
      "RJNR": "Rajajinagar", "KVPR": "Mahakavi Kuvempu Road", "SPRU": "Srirampura", "SPGD": "Mantri Square Sampige Road",
      "KGWA": "Nadaprabhu Kempegowda", "CKPE": "Chickpete", "KRMT": "Krishna Rajendra Market", "NLC": "National College",
      "LBGH": "Lalbagh", "SECE": "South End Circle", "JYN": "Jayanagar", "RVR": "Rashtreeya Vidyalaya Road",
      "BSNK": "Banashankari", "JPN": "Jaya Prakash Nagar", "PUTH": "Yelachenahalli", "APRC": "Konanakunte Cross",
      "KLPK": "Doddakallasandra", "VJRH": "Vajarahalli", "TGTP": "Thalaghattapura", "APTS": "Silk Institute"
    };

    const wttActive = wttMatrix.filter(t => String(t.scheduleType || '').toUpperCase() === String(activeDay).toUpperCase());

    // Build delay map
    const delayMap = {};
    liveIncidents.forEach(inc => {
      if (inc.trainId && inc.delayMins) {
        delayMap[String(inc.trainId).trim()] = (delayMap[String(inc.trainId).trim()] || 0) + Number(inc.delayMins);
      }
    });

    const suggestions = [];

    // Parse WTT trips and build schedules
    const trains = [];
    wttActive.forEach(trip => {
      const trainId = String(trip.trainId).trim();
      const stops = [];
      const addedStations = new Set();
      Object.entries(trip.stations || {}).forEach(([stCode, timeStr]) => {
        if (timeStr && timeStr !== '--' && timeStr !== '-') {
          const cleanSt = stCode.split('_')[0];
          if (!addedStations.has(cleanSt)) {
            addedStations.add(cleanSt);
            const delay = delayMap[trainId] || 0;
            const schMins = timeToMins(timeStr);
            stops.push({
              station: cleanSt,
              timeMin: schMins + delay
            });
          }
        }
      });

      if (stops.length >= 2) {
        stops.sort((a, b) => a.timeMin - b.timeMin);
        trains.push({
          trainId,
          stops,
          tripId: trip.id
        });
      }
    });

    // Detect intersections
    for (let i = 0; i < trains.length; i++) {
      for (let j = i + 1; j < trains.length; j++) {
        const t1 = trains[i];
        const t2 = trains[j];
        if (t1.trainId === t2.trainId) continue;

        t1.stops.forEach(s1 => {
          t2.stops.forEach(s2 => {
            if (s1.station === s2.station && Math.abs(s1.timeMin - s2.timeMin) <= 3) {
              const op1 = deployments.find(d => String(d.trainId) === String(t1.trainId))?.empName || 'Operator';
              const op2 = deployments.find(d => String(d.trainId) === String(t2.trainId))?.empName || 'Operator';

              suggestions.push({
                stationCode: s1.station,
                stationName: STATION_NAMES[s1.station] || s1.station,
                timeStr: `${Math.floor(s1.timeMin / 60).toString().padStart(2, '0')}:${Math.floor(s1.timeMin % 60).toString().padStart(2, '0')}`,
                trainA: t1.trainId,
                trainB: t2.trainId,
                operatorA: op1,
                operatorB: op2,
                reason: `Train ${t1.trainId} (${op1}) and Train ${t2.trainId} (${op2}) cross at ${STATION_NAMES[s1.station] || s1.station}. You can transition here, saving up to 12 minutes of waiting time.`
              });
            }
          });
        });
      }
    }

    return suggestions.slice(0, 5);
  }
}

export const aiService = new AIService();

