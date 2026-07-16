import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, X, Send, Bot, AlertTriangle, UserCheck, ShieldAlert, FileClock, Gauge, Compass } from 'lucide-react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { BMRCL_CREW_REGISTRY } from '../data/bmrclCrewRegistry';

const MODEL_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

const QUICK_ACTIONS = [
  { id: 'relief', label: 'Emergency Relief Plan', icon: ShieldAlert, prompt: 'Analyze active delays/incidents and suggest stand-by crew relief assignments. Map crew IDs and suggest specific handover stations.' },
  { id: 'allocation', label: 'Crew Allocation Suggestions', icon: UserCheck, prompt: 'Inspect the daily crew deployment and recommend optimization or filler crew assignments for unallocated slots.' },
  { id: 'recovery', label: 'Incident Recovery Plan', icon: AlertTriangle, prompt: 'Review current delayed trains and estimate downstream timing variances. Suggest speed-up or buffer strategies for Green Line stations.' },
  { id: 'kpis', label: 'Kilometer & KPI Audit', icon: Gauge, prompt: 'Examine crew utilisation and suggest ways to distribute mileage more evenly to prevent operator fatigue.' }
];

export default function AiAssistantSidebar({
  isOpen = false,
  onClose = () => {},
  liveIncidents = [],
  deployments = [],
  liveTrainTrackingMap = {}
}) {
  const [queryText, setQueryText] = useState('');
  const [messages, setMessages] = useState([
    { role: 'bot', text: 'Salutations. I am the Metro Operations AI Assistant. Select a quick action template below or ask any operational query.' }
  ]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const chatEndRef = useRef(null);

  const effectiveKey = (localStorage.getItem('custom_gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY || '').trim();

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  const callGemini = async (userPrompt) => {
    if (!effectiveKey) {
      return 'API Key Error: No Gemini API key detected. Please configure VITE_GEMINI_API_KEY in your env file or upload it in the GCC dispatch page.';
    }

    // Assemble rich system context for Gemini
    const systemContext = `
You are the BMRCL Line 2 (Green Line) Metro Operations AI Assistant. 
Peenya Industry Depot (PYID) is the operations hub.

Line 2 Station List (32 stations, ordered):
BIET -> JIDL -> MNJN -> NGSA -> DSH -> JLHL -> PYID -> PEYA -> YPI -> YPM -> SSFY -> MHLI -> RJNR -> KVPR -> SPRU -> SPGD -> KGWA -> CKPE -> KRMT -> NLC -> LBGH -> SECE -> JYN -> RVR -> BSNK -> JPN -> PUTH -> APRC -> KLPK -> VJRH -> TGTP -> APTS.

--- CURRENT REAL-TIME SYSTEM STATE ---
1. ACTIVE INCIDENTS:
${JSON.stringify(liveIncidents.filter(inc => inc.status !== 'RESOLVED'), null, 2)}

2. ACTIVE CREW DEPLOYMENTS:
${JSON.stringify(deployments.map(d => ({ dutyId: d.dutyId, empId: d.empId, name: d.empName, trainId: d.trainId, status: d.status, signOnTime: d.signOnTime })), null, 2)}

3. LIVE TRAIN TRACKING:
${JSON.stringify(liveTrainTrackingMap, null, 2)}

4. BMRCL CREW REGISTRY SAMPLE:
${JSON.stringify(BMRCL_CREW_REGISTRY.slice(0, 40), null, 2)}
(We have ${BMRCL_CREW_REGISTRY.length} registered operators in total).

Guidelines:
- Analyze details rigorously.
- Check for operator fatigue (shift length > 8.5 hours).
- Suggest relief plans using actual standby crew names and employee IDs.
- For emergency relief, map the closest handover station based on the train route.
- Structure your response beautifully with bold subheadings and clear bullet points.
`;

    let lastError = null;

    for (let mIdx = 0; mIdx < MODEL_CHAIN.length; mIdx++) {
      const modelName = MODEL_CHAIN[mIdx];
      try {
        setStatusMsg(`Consulting AI (${modelName})…`);
        const genAI = new GoogleGenerativeAI(effectiveKey);
        const model = genAI.getGenerativeModel({ model: modelName });
        
        const contents = [
          { role: 'user', parts: [{ text: `${systemContext}\n\nUser Query: ${userPrompt}` }] }
        ];

        const result = await model.generateContent({ contents });
        const text = result.response.text();
        if (text) return text;
      } catch (err) {
        console.error(`Gemini model ${modelName} failed:`, err);
        lastError = err.message || String(err);
      }
    }

    return `System error contacting Gemini models. Details: ${lastError || 'Unknown'}`;
  };

  const handleSend = async (textToSend) => {
    const query = (textToSend || queryText).trim();
    if (!query) return;

    setMessages(prev => [...prev, { role: 'user', text: query }]);
    setQueryText('');
    setLoading(true);

    try {
      const response = await callGemini(query);
      setMessages(prev => [...prev, { role: 'bot', text: response }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'bot', text: `Failed to fetch suggestion: ${err.message}` }]);
    } finally {
      setLoading(false);
      setStatusMsg('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[450px] bg-slate-900 border-l border-slate-800 shadow-2xl z-50 flex flex-col font-mono animate-slide-in">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950 flex justify-between items-center sticky top-0">
        <div className="flex items-center gap-2 text-cyan-400">
          <Sparkles className="h-5 w-5 animate-pulse" />
          <span className="font-black text-sm tracking-wider uppercase">Metro AI Assistant</span>
        </div>
        <button 
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role !== 'user' && (
              <div className="h-7 w-7 rounded-full bg-cyan-900/50 border border-cyan-500/30 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-cyan-400" />
              </div>
            )}
            <div className={`p-3.5 rounded-xl text-xs max-w-[85%] leading-relaxed ${
              msg.role === 'user' 
                ? 'bg-cyan-600 text-slate-950 font-bold shadow-md rounded-tr-none' 
                : 'bg-slate-950/70 border border-slate-800 text-slate-200 rounded-tl-none whitespace-pre-wrap'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3 justify-start">
            <div className="h-7 w-7 rounded-full bg-cyan-900/50 border border-cyan-500/30 flex items-center justify-center shrink-0 animate-spin">
              <Bot className="h-4 w-4 text-cyan-400" />
            </div>
            <div className="p-3 bg-slate-950/40 border border-slate-850 rounded-xl text-xs text-slate-500 italic animate-pulse">
              {statusMsg || 'Analyzing system telemetry...'}
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Quick Action Templates */}
      <div className="p-4 border-t border-slate-850 bg-slate-950/40 grid grid-cols-2 gap-2">
        {QUICK_ACTIONS.map(action => (
          <button
            key={action.id}
            onClick={() => handleSend(action.prompt)}
            disabled={loading}
            className="flex items-center gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-500/50 text-left hover:bg-slate-900 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <action.icon className="h-4 w-4 text-cyan-400 shrink-0 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-bold text-slate-300 group-hover:text-slate-100 transition-colors truncate">
              {action.label}
            </span>
          </button>
        ))}
      </div>

      {/* Input Tray */}
      <div className="p-4 border-t border-slate-800 bg-slate-950 flex gap-2">
        <input
          type="text"
          placeholder="Ask AI for operations suggestions..."
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          className="flex-1 bg-slate-900 border border-slate-800 hover:border-slate-750 focus:border-cyan-500 outline-none rounded-lg px-3 py-2 text-xs text-slate-200 transition"
          disabled={loading}
        />
        <button
          onClick={() => handleSend()}
          disabled={loading || !queryText.trim()}
          className="bg-cyan-600 hover:bg-cyan-500 text-slate-950 p-2.5 rounded-lg font-black transition disabled:bg-slate-850 disabled:text-slate-600 disabled:cursor-not-allowed shadow-md shadow-cyan-900/10"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
