import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { 
  Save, RotateCcw, AlertCircle, CheckCircle, 
  HelpCircle, Settings, Plus, Trash2, Cpu
} from 'lucide-react';
import { DEFAULT_CATEGORY_RULES } from '../utils/categoryRulesEngine';

const DESTINATION_POOLS = [
  "Standby Pool",
  "Extra Pool",
  "Reserve Pool",
  "Crew Control",
  "Weekly Off Register",
  "Leave Management Dashboard",
  "Training / Competency Board",
  "Extra Duty Tracker",
  "Restricted Registry"
];

export default function CategoryRules() {
  const [rules, setRules] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [editingCategory, setEditingCategory] = useState(null);

  // New category creation states
  const [newCatName, setNewCatName] = useState('');
  const [newCatRule, setNewCatRule] = useState({
    availableForRelief: false,
    countsAsActiveCrew: false,
    visibleInExtraPool: false,
    requiresAdminOverride: true,
    destinationPool: 'Restricted Registry'
  });

  useEffect(() => {
    fetchCategoryRules();
  }, []);

  const fetchCategoryRules = async () => {
    setLoading(true);
    try {
      const docRef = doc(db, 'system_settings', 'category_rules');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        setRules(snap.data().rules || DEFAULT_CATEGORY_RULES);
      } else {
        setRules(DEFAULT_CATEGORY_RULES);
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Failed to retrieve category behavior matrix.' });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleRule = (cat, field) => {
    setRules(prev => ({
      ...prev,
      [cat]: {
        ...prev[cat],
        [field]: !prev[cat][field]
      }
    }));
  };

  const handlePoolChange = (cat, pool) => {
    setRules(prev => ({
      ...prev,
      [cat]: {
        ...prev[cat],
        destinationPool: pool
      }
    }));
  };

  const handleAddCategory = () => {
    if (!newCatName.trim()) {
      alert("Please enter a category code.");
      return;
    }
    const code = newCatName.trim().toUpperCase();
    if (rules[code]) {
      alert("This category already exists.");
      return;
    }
    setRules(prev => ({
      ...prev,
      [code]: { ...newCatRule }
    }));
    setNewCatName('');
    setMessage({ type: 'success', text: `Category ${code} added to current grid. Remember to save changes.` });
  };

  const handleDeleteCategory = (cat) => {
    if (window.confirm(`Delete behavior rules configuration for category ${cat}?`)) {
      setRules(prev => {
        const copy = { ...prev };
        delete copy[cat];
        return copy;
      });
      setMessage({ type: 'success', text: `Removed category ${cat}. Save to persist changes.` });
    }
  };

  const handleSaveChanges = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const docRef = doc(db, 'system_settings', 'category_rules');
      await setDoc(docRef, {
        rules: rules,
        lastUpdated: new Date().toISOString(),
        version: "1.0.0"
      });
      setMessage({ type: 'success', text: 'Category behavior rules saved successfully to system_settings/category_rules.' });
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Error saving category rules: ' + err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefaults = async () => {
    if (window.confirm("Reset all category behaviors to BMRCL Depot defaults? This will overwrite your active configuration.")) {
      setRules(DEFAULT_CATEGORY_RULES);
      setMessage({ type: 'success', text: 'Reset grid to default settings. Click Save Changes to commit.' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400 gap-2">
        <RotateCcw className="animate-spin text-emerald-400" size={18} />
        <span>Loading Category Behaviors Rules Engine Database...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Settings Header Info */}
      <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <Cpu size={16} className="text-emerald-400" /> Category rules behaviors engine
          </h3>
          <p className="text-[11px] text-slate-500 leading-normal max-w-2xl">
            Configure how the system automatically handles Link Roster category columns. Route operators dynamically to their target pools (Standby, Leave, Weekly Off) and customize emergency relief dispatch permissions.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleResetToDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-bold transition border border-slate-800"
          >
            <RotateCcw size={13} /> Reset Default Matrix
          </button>
          <button
            onClick={handleSaveChanges}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 rounded-lg text-xs font-black transition"
          >
            <Save size={13} /> {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Notifications Box */}
      {message.text && (
        <div className={`p-4 rounded-xl text-xs flex items-center gap-2 border ${
          message.type === 'success' 
            ? 'bg-emerald-500/10 text-emerald-450 border-emerald-500/20' 
            : 'bg-rose-500/10 text-rose-455 border-rose-500/20'
        }`}>
          {message.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Grid Rules Display */}
      <div className="bg-slate-950/20 border border-slate-850 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[10px] font-mono">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-850 text-slate-500 font-bold uppercase select-none">
                <th className="p-3">Category Code</th>
                <th className="p-3 text-center">Available for Relief</th>
                <th className="p-3 text-center">Counts as Active Crew</th>
                <th className="p-3 text-center">Visible in Extra Pool</th>
                <th className="p-3 text-center">Requires Override</th>
                <th className="p-3">Destination Pool Routing</th>
                <th className="p-3 text-right">Delete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850">
              {Object.keys(rules).sort().map(cat => {
                const rule = rules[cat];
                return (
                  <tr key={cat} className="hover:bg-slate-950/40 transition">
                    <td className="p-3 font-bold text-slate-200 uppercase tracking-wide text-xs">{cat}</td>
                    
                    {/* Available for Relief */}
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleToggleRule(cat, 'availableForRelief')}
                        className={`px-3 py-1 rounded text-[9px] font-bold uppercase transition ${
                          rule.availableForRelief 
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                            : 'bg-slate-900 text-slate-500 border border-slate-800'
                        }`}
                      >
                        {rule.availableForRelief ? 'Yes' : 'No'}
                      </button>
                    </td>

                    {/* Counts as Active Crew */}
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleToggleRule(cat, 'countsAsActiveCrew')}
                        className={`px-3 py-1 rounded text-[9px] font-bold uppercase transition ${
                          rule.countsAsActiveCrew 
                            ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' 
                            : 'bg-slate-900 text-slate-500 border border-slate-800'
                        }`}
                      >
                        {rule.countsAsActiveCrew ? 'Yes' : 'No'}
                      </button>
                    </td>

                    {/* Visible in Extra Pool */}
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleToggleRule(cat, 'visibleInExtraPool')}
                        className={`px-3 py-1 rounded text-[9px] font-bold uppercase transition ${
                          rule.visibleInExtraPool 
                            ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' 
                            : 'bg-slate-900 text-slate-500 border border-slate-800'
                        }`}
                      >
                        {rule.visibleInExtraPool ? 'Yes' : 'No'}
                      </button>
                    </td>

                    {/* Requires Override */}
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleToggleRule(cat, 'requiresAdminOverride')}
                        className={`px-3 py-1 rounded text-[9px] font-bold uppercase transition ${
                          rule.requiresAdminOverride 
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse' 
                            : 'bg-slate-900 text-slate-500 border border-slate-800'
                        }`}
                      >
                        {rule.requiresAdminOverride ? 'Yes' : 'No'}
                      </button>
                    </td>

                    {/* Destination Pool Routing */}
                    <td className="p-3">
                      <select
                        value={rule.destinationPool}
                        onChange={(e) => handlePoolChange(cat, e.target.value)}
                        className="bg-slate-950 border border-slate-850 rounded px-2 py-1 text-slate-300 text-[10px] focus:outline-none focus:border-emerald-500/50"
                      >
                        {DESTINATION_POOLS.map(pool => (
                          <option key={pool} value={pool}>{pool}</option>
                        ))}
                      </select>
                    </td>

                    {/* Delete Custom Category */}
                    <td className="p-3 text-right">
                      {!DEFAULT_CATEGORY_RULES[cat] ? (
                        <button
                          onClick={() => handleDeleteCategory(cat)}
                          className="p-1 hover:bg-rose-500/15 text-slate-500 hover:text-rose-400 rounded transition"
                          title="Remove custom category behavior rule"
                        >
                          <Trash2 size={13} />
                        </button>
                      ) : (
                        <span className="text-[8px] text-slate-650 font-bold tracking-wider uppercase select-none p-1">Core</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Custom Rule Configuration Block */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <Plus size={14} className="text-emerald-400" /> Create Custom Category Behavior Configuration
        </h4>
        
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4 items-end">
          
          <div className="space-y-1">
            <label className="text-[9px] font-bold text-slate-450 uppercase tracking-wide">Category Name/Code</label>
            <input
              type="text"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="e.g. SPL_DUTY"
              className="w-full bg-slate-950 border border-slate-850 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50 uppercase"
            />
          </div>

          <div className="space-y-1 text-center">
            <label className="text-[9px] font-bold text-slate-450 uppercase tracking-wide block mb-1">Available for Relief</label>
            <button
              onClick={() => setNewCatRule(p => ({ ...p, availableForRelief: !p.availableForRelief }))}
              className={`w-full py-1.5 rounded text-[10px] font-bold uppercase transition ${
                newCatRule.availableForRelief 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                  : 'bg-slate-950 border border-slate-850 text-slate-500'
              }`}
            >
              {newCatRule.availableForRelief ? 'Yes' : 'No'}
            </button>
          </div>

          <div className="space-y-1 text-center">
            <label className="text-[9px] font-bold text-slate-450 uppercase tracking-wide block mb-1">Counts as Active Crew</label>
            <button
              onClick={() => setNewCatRule(p => ({ ...p, countsAsActiveCrew: !p.countsAsActiveCrew }))}
              className={`w-full py-1.5 rounded text-[10px] font-bold uppercase transition ${
                newCatRule.countsAsActiveCrew 
                  ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' 
                  : 'bg-slate-950 border border-slate-850 text-slate-500'
              }`}
            >
              {newCatRule.countsAsActiveCrew ? 'Yes' : 'No'}
            </button>
          </div>

          <div className="space-y-1 text-center">
            <label className="text-[9px] font-bold text-slate-450 uppercase tracking-wide block mb-1">Visible in Extra Pool</label>
            <button
              onClick={() => setNewCatRule(p => ({ ...p, visibleInExtraPool: !p.visibleInExtraPool }))}
              className={`w-full py-1.5 rounded text-[10px] font-bold uppercase transition ${
                newCatRule.visibleInExtraPool 
                  ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' 
                  : 'bg-slate-950 border border-slate-850 text-slate-500'
              }`}
            >
              {newCatRule.visibleInExtraPool ? 'Yes' : 'No'}
            </button>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] font-bold text-slate-450 uppercase tracking-wide">Destination Pool</label>
            <select
              value={newCatRule.destinationPool}
              onChange={(e) => setNewCatRule(p => ({ ...p, destinationPool: e.target.value }))}
              className="w-full bg-slate-950 border border-slate-850 rounded px-2 py-1.5 text-xs text-slate-350 focus:outline-none focus:border-emerald-500/50"
            >
              {DESTINATION_POOLS.map(pool => (
                <option key={pool} value={pool}>{pool}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleAddCategory}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black py-1.5 rounded text-xs uppercase tracking-wider transition shadow-lg shadow-emerald-500/5"
          >
            Add Rule
          </button>
        </div>
      </div>

    </div>
  );
}
