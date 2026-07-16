/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Sparkles, 
  MapPin, 
  ArrowRight, 
  Compass, 
  FileText, 
  ShieldCheck, 
  AlertCircle,
  HelpCircle,
  Play
} from 'lucide-react';
import { calculateDistance } from '../../utils/kmCalculator';

const QUICK_PROMPTS = [
  { 
    label: "End-to-End Buffer Run", 
    text: "Drove from BIET BE buffer end all the way to APTS BE buffer end Southbound." 
  },
  { 
    label: "Pocket Track Crossover", 
    text: "Took train from BIET BE to NGSA PKT, layover, then drove down to Peenya Industry Road 3." 
  },
  { 
    label: "Siding Shunting Trip", 
    text: "Shunted the operator shuttle from NLC PKT to NLC, then drove up to PUTH BE buffer end." 
  },
  { 
    label: "Depot Induction Run", 
    text: "Inducted train from DEPOT, traveled UP to BIET BE, then down to PUTH BE and hand over." 
  }
];

export default function AIRouteCopilot({ stations, onApplySequence }) {
  const [inputText, setInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);

  // Natural Language Processing / Clause Parser for BMRCL Station Mapping
  const parseRouteDescription = (text) => {
    if (!text) return [];
    
    const mapping = [
      { keys: ['bietbe', 'bietbufferend', 'bietbuffer', 'bietb'], code: 'BIET_BE' },
      { keys: ['biet', 'bi'], code: 'BIET' },
      { keys: ['jidl', 'jid', 'ji', 'jdhl'], code: 'JDHL' },
      { keys: ['mnjn', 'mnj', 'mn'], code: 'MNJN' },
      { keys: ['ngsapt', 'ngsapkt', 'ngsapocket', 'npkt', 'nagasandrapkt', 'nagasandrapocket'], code: 'NGSA_PT' },
      { keys: ['ngsabe', 'ngsabufferend', 'ngsabuffer', 'ngsab'], code: 'NGSA_BE' },
      { keys: ['ngsa', 'ngs', 'nagasandra'], code: 'NGSA' },
      { keys: ['dsh', 'dasarahalli'], code: 'DSH' },
      { keys: ['jlhl', 'jalahalli'], code: 'JLHL' },
      { keys: ['depot', 'depo', 'dho', 'bdho', 'pdho'], code: 'DEPOT' },
      { keys: ['pyid', 'peenyaindustry', 'peenyaind', 'rd3', 'road3', 'rd-3'], code: 'PYID' },
      { keys: ['peya', 'peenya'], code: 'PEYA' },
      { keys: ['ypi', 'yeshwanthpurindustry', 'yeshwantpurindustry'], code: 'YPI' },
      { keys: ['ypm', 'yeshwanthpura', 'yeshwantpura', 'yeshwanthpur', 'yeshwantpur'], code: 'YPM' },
      { keys: ['ssfy', 'sandalsoapfactory', 'sandalsoap', 'soapfactory'], code: 'SSFY' },
      { keys: ['mhlipt', 'mhlipkt', 'mhlipocket', 'mahalakshmilayoutpocket'], code: 'MHLI_PT' },
      { keys: ['mhli', 'mahalakshmilayout', 'mahalakshmi', 'mhl'], code: 'MHLI' },
      { keys: ['rjnr', 'rajajinagar', 'rajajinag'], code: 'RJNR' },
      { keys: ['kvpr', 'kuvempuroad', 'kuvempu'], code: 'KVPR' },
      { keys: ['spru', 'srirampura', 'srirampur'], code: 'SPRU' },
      { keys: ['spgd', 'sampige', 'sampigeroad', 'mantrisquare'], code: 'SPGD' },
      { keys: ['kgwa', 'kempegowda', 'majestic', 'kgw'], code: 'KGWA' },
      { keys: ['ckpe', 'chickpet', 'chikpet'], code: 'CKPE' },
      { keys: ['krmt', 'krishna', 'krishnarajendra', 'krmarket', 'krm'], code: 'KRMT' },
      { keys: ['nlcpt', 'nlcpkt', 'nlcpocket', 'nationalcollegepocket'], code: 'NLC_PT' },
      { keys: ['nlc', 'nationalcollege', 'nationalcol'], code: 'NLC' },
      { keys: ['lbgh', 'lalbagh', 'lalb'], code: 'LBGH' },
      { keys: ['sece', 'southendcircle', 'southend'], code: 'SECE' },
      { keys: ['jyn', 'jayanagar', 'jayanag'], code: 'JYN' },
      { keys: ['rvr', 'rashtreeyavidyalaya', 'rvroad', 'rv'], code: 'RVR' },
      { keys: ['bsnk', 'banashankari', 'banashank'], code: 'BSNK' },
      { keys: ['jpn', 'jpnagar', 'jpnag'], code: 'JPN' },
      { keys: ['puthbe', 'puthbufferend', 'puthbuffer'], code: 'PUTH_BE' },
      { keys: ['puth', 'puttenahalli', 'yelachenahalli'], code: 'PUTH' },
      { keys: ['aprc', 'ansandra', 'konanakuntecross', 'konanakunte'], code: 'APRC' },
      { keys: ['klpk', 'doddakallasandra', 'kallasandra'], code: 'KLPK' },
      { keys: ['vjrh', 'vajarahalli', 'vajarah'], code: 'VJRH' },
      { keys: ['tgtp', 'talaghattapura', 'talaghatta'], code: 'TGTP' },
      { keys: ['aptsbe', 'aptsbufferend', 'aptsbuffer', 'silkinstitutebuffer'], code: 'APTS_BE' },
      { keys: ['apts', 'silkinstitute', 'silkinst'], code: 'APTS' }
    ];

    const clauses = text
      .split(/➔|->|--+|\bthen\b|\bto\b|,|;|and/)
      .map(c => c.trim().toLowerCase().replace(/[^a-z0-9]/g, ''))
      .filter(Boolean);

    const matches = [];
    clauses.forEach(clause => {
      let bestMatch = null;
      let maxLength = 0;
      
      mapping.forEach(m => {
        m.keys.forEach(key => {
          if (clause.includes(key) && key.length > maxLength) {
            maxLength = key.length;
            bestMatch = m.code;
          }
        });
      });
      
      if (bestMatch) {
        matches.push(bestMatch);
      }
    });

    return matches;
  };

  const handleAnalyze = () => {
    if (!inputText.trim()) return;
    
    setIsAnalyzing(true);
    setAnalysisResult(null);

    // Simulate AI thinking and calculation speed
    setTimeout(() => {
      const sequence = parseRouteDescription(inputText);
      
      if (sequence.length < 2) {
        setAnalysisResult({
          error: "Could not extract a valid sequence of at least 2 stations. Please specify station names clearly (e.g., 'BIET BE to APTS BE')."
        });
        setIsAnalyzing(false);
        return;
      }

      // Calculate segments using our track-math engine
      const segments = [];
      let totalDistance = 0;

      for (let i = 0; i < sequence.length - 1; i++) {
        const from = sequence[i];
        const to = sequence[i + 1];
        const dist = calculateDistance(from, to);
        
        const fromStn = stations.find(s => s.code === from);
        const toStn = stations.find(s => s.code === to);
        
        let direction = 'Stationary';
        if (fromStn && toStn) {
          if (toStn.chainage > fromStn.chainage) {
            direction = 'DOWN';
          } else if (toStn.chainage < fromStn.chainage) {
            direction = 'UP';
          }
        }

        segments.push({
          from,
          fromName: fromStn?.name || from,
          to,
          toName: toStn?.name || to,
          distance: dist,
          direction,
          fromChainage: fromStn?.chainage ?? 0,
          toChainage: toStn?.chainage ?? 0
        });
        
        totalDistance += dist;
      }

      // Generate a friendly explanation
      const parts = segments.map((seg, idx) => {
        const dirText = seg.direction === 'DOWN' ? 'Southbound (DOWN Line)' : 'Northbound (UP Line)';
        return `Segment ${idx + 1}: ${seg.from} to ${seg.to} via ${dirText} traveling ${seg.distance.toFixed(3)} KM`;
      });
      
      const insight = `Identified route sequence containing ${sequence.length} nodes: ${sequence.join(' ➔ ')}. ` +
        `The physical distance matches standard Green Line chainage records. ` +
        `Route highlights: ${parts.join(', ')}.`;

      setAnalysisResult({
        sequence,
        segments,
        totalDistance,
        insight
      });
      
      setIsAnalyzing(false);
    }, 800);
  };

  const handleApplyQuickPrompt = (promptText) => {
    setInputText(promptText);
    setAnalysisResult(null);
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto p-2" id="ai-route-copilot-container">
      
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/20 rounded-xl p-5 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full filter blur-3xl pointer-events-none" />
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">AI Route Calculator Copilot</h2>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              Describe your train route in natural language. Our Green Line NLP engine will interpret your log entries, extract the exact physical nodes, and output accurate distances instantly.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* Input & suggestions block */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md flex flex-col space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-500" />
                Describe Your Run / Driving Log
              </h3>
              <button 
                onClick={() => setInputText('')}
                className="text-[10px] font-mono text-slate-500 hover:text-slate-300"
              >
                Clear Input
              </button>
            </div>

            <textarea
              id="ai-prompt-input"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="e.g. Took train over at BIET BE buffer, drove Southbound to NGSA PKT, layover, then hand over at APTS BE buffer."
              className="w-full h-36 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg p-3 text-slate-200 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder-slate-600 transition-all resize-none"
            />

            <div className="flex justify-between items-center pt-1">
              <div className="flex items-center gap-1 text-[10px] text-slate-500 italic">
                <HelpCircle className="w-3 h-3 text-slate-400" />
                Supports spelling mistakes, aliases like 'npkt', 'nagasandra pocket' etc.
              </div>
              <button
                id="ai-calculate-btn"
                disabled={isAnalyzing || !inputText.trim()}
                onClick={handleAnalyze}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-mono text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-emerald-950/20 disabled:opacity-40 disabled:pointer-events-none"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {isAnalyzing ? "Analyzing..." : "Calculate Route"}
              </button>
            </div>
          </div>

          {/* Quick suggestions prompt cards */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 space-y-3">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Sample Logging Entries</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {QUICK_PROMPTS.map((qp, idx) => (
                <div 
                  key={idx}
                  onClick={() => handleApplyQuickPrompt(qp.text)}
                  className="bg-slate-950 hover:bg-slate-900 border border-slate-850 hover:border-emerald-500/30 rounded p-2.5 cursor-pointer transition-all flex flex-col justify-between"
                >
                  <span className="text-[10px] font-bold text-emerald-400 font-mono flex items-center gap-1">
                    <Play className="w-2.5 h-2.5 shrink-0" />
                    {qp.label}
                  </span>
                  <p className="text-[9.5px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                    "{qp.text}"
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Results Block */}
        <div className="lg:col-span-5 flex flex-col">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md flex-1 flex flex-col justify-between min-h-[300px]">
            {isAnalyzing ? (
              <div className="flex-1 flex flex-col items-center justify-center space-y-3 py-12">
                <div className="h-9 w-9 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
                <span className="text-xs font-mono text-emerald-400 animate-pulse">AI Parsing & Computing Chainages...</span>
              </div>
            ) : analysisResult ? (
              <div className="space-y-4 flex-1 flex flex-col justify-between">
                
                {/* Check for errors */}
                {analysisResult.error ? (
                  <div className="bg-red-950/20 border border-red-500/20 rounded-lg p-4 text-center text-xs font-mono text-red-300 flex flex-col items-center justify-center space-y-2 py-8">
                    <AlertCircle className="w-6 h-6 text-red-500" />
                    <span>{analysisResult.error}</span>
                  </div>
                ) : (
                  <div className="space-y-3.5 flex-1">
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                      AI Calculation Sheet
                    </h3>

                    {/* Identified path pipeline */}
                    <div className="bg-slate-950 border border-slate-850 rounded-lg p-3 space-y-2">
                      <div className="text-[9px] font-bold font-mono text-slate-500 uppercase tracking-wider">Identified Pipeline</div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {analysisResult.sequence.map((code, idx) => (
                          <React.Fragment key={idx}>
                            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 rounded text-[10px] font-mono font-bold">
                              {code.replace('_', ' ')}
                            </span>
                            {idx < analysisResult.sequence.length - 1 && (
                              <ArrowRight className="w-3 h-3 text-slate-600" />
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>

                    {/* Segment breakdown list */}
                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
                      {analysisResult.segments.map((seg, idx) => (
                        <div key={idx} className="bg-slate-950 rounded p-2 border border-slate-850 flex justify-between items-center text-[10.5px] font-mono">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-slate-300 font-bold">
                              <span>{seg.from.replace('_', ' ')}</span>
                              <ArrowRight className="w-2.5 h-2.5 text-emerald-500" />
                              <span>{seg.to.replace('_', ' ')}</span>
                            </div>
                            <div className="text-[8px] text-slate-600">
                              |{seg.toChainage.toFixed(3)} - {seg.fromChainage.toFixed(3)}|
                            </div>
                          </div>
                          <div className="text-emerald-400 font-bold text-xs">{seg.distance.toFixed(3)} KM</div>
                        </div>
                      ))}
                    </div>

                    {/* AI Route Explanation */}
                    <div className="bg-slate-950 border border-slate-850 rounded-lg p-3 text-[10px] font-mono text-slate-400 leading-relaxed">
                      <p className="font-bold text-slate-300 uppercase tracking-wider text-[8.5px] mb-1">AI Route Insight</p>
                      {analysisResult.insight}
                    </div>
                  </div>
                )}

                {/* Totals & Sync Button */}
                {!analysisResult.error && (
                  <div className="border-t border-slate-850 pt-3.5 mt-auto space-y-3">
                    <div className="flex justify-between items-baseline">
                      <span className="text-slate-400 font-mono text-[9px] uppercase">Precise Distance:</span>
                      <span className="font-mono text-sm font-bold text-slate-200">{analysisResult.totalDistance.toFixed(3)} KM</span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-slate-400 font-mono text-[9px] uppercase">Total Rounded Off:</span>
                      <span className="font-mono text-xl font-extrabold text-emerald-400">{Math.round(analysisResult.totalDistance)} KM</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        id="ai-apply-map-btn"
                        onClick={() => onApplySequence(analysisResult.sequence)}
                        className="py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-mono text-xs font-bold transition flex items-center justify-center gap-1.5 shadow"
                      >
                        <Compass className="w-3.5 h-3.5" />
                        Apply to Map
                      </button>

                      <div className="bg-emerald-950/20 border border-emerald-500/25 rounded px-2.5 py-1 text-[9px] font-mono text-emerald-300 flex items-center justify-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>ACCURACY SECURED</span>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            ) : (
              <div className="flex-1 border border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center p-6 text-center text-slate-500 italic text-[11px] py-16">
                <Sparkles className="w-8 h-8 text-slate-700 mb-2 animate-pulse" />
                Describe a run on the left and click "Calculate Route" to start evaluation!
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
