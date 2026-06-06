import React, { useState, useEffect } from 'react';
import { Phone, Mail, UserPlus, Trash2, AlertCircle, Search, Users, Edit2, Save, X, Loader } from 'lucide-react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

export default function CrewDirectory({ crewData = [], isAdmin = false }) {
  const [crews, setCrews] = useState(crewData);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newEmployee, setNewEmployee] = useState({
    id: '',
    name: '',
    designation: 'Station Controller / Train Operator',
    contact: '',
    email: ''
  });

  useEffect(() => {
    loadCrewFromFirebase();
  }, []);

  const loadCrewFromFirebase = async () => {
    try {
      setLoading(true);
      const crewCollection = collection(db, 'employees');
      const snapshot = await getDocs(crewCollection);
      
      if (snapshot.empty) {
        console.log('No employees found in database');
        setCrews([]);
        return;
      }
      
      const crewList = snapshot.docs
        .map(doc => ({
          ...doc.data(),
          firebaseId: doc.id
        }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
      
      setCrews(crewList);
    } catch (error) {
      console.error('Error loading crew data:', error);
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        stack: error.stack
      });
      alert(`Error loading employee data: ${error.message}`);
      setCrews([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredCrew = crews.filter(staff => 
    staff.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    staff.id?.includes(searchTerm)
  );

  const handleEdit = (staff) => {
    setEditingId(staff.id);
    setEditData({ ...staff });
  };

  const handleSave = async () => {
    if (!editData.id || !editData.name || !editData.contact) {
      alert('Please fill in required fields: ID, Name, Contact');
      return;
    }
    try {
      setLoading(true);
      const docRef = doc(db, 'employees', editData.firebaseId);
      await updateDoc(docRef, {
        id: editData.id,
        name: editData.name,
        contact: editData.contact,
        email: editData.email,
        designation: editData.designation,
        updatedAt: new Date()
      });
      
      const updatedCrews = crews.map(c => c.firebaseId === editData.firebaseId ? editData : c);
      setCrews(updatedCrews);
      setEditingId(null);
      setEditData({});
      alert('Employee updated successfully!');
    } catch (error) {
      console.error('Error updating employee:', error);
      alert('Error updating employee');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditData({});
  };

  const handleDelete = async (staffId, firebaseId) => {
    if (window.confirm(`Delete employee ${staffId}? This action is permanent.`)) {
      try {
        setLoading(true);
        const docRef = doc(db, 'employees', firebaseId);
        await deleteDoc(docRef);
        setCrews(crews.filter(c => c.firebaseId !== firebaseId));
        alert('Employee deleted successfully!');
      } catch (error) {
        console.error('Error deleting employee:', error);
        alert('Error deleting employee');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleAddEmployee = async () => {
    if (!newEmployee.id || !newEmployee.name || !newEmployee.contact) {
      alert('Please fill in required fields: ID, Name, Contact');
      return;
    }
    if (crews.some(c => c.id === newEmployee.id)) {
      alert('Employee ID already exists!');
      return;
    }
    try {
      setLoading(true);
      const crewCollection = collection(db, 'employees');
      const docRef = await addDoc(crewCollection, {
        id: newEmployee.id,
        name: newEmployee.name,
        contact: newEmployee.contact,
        email: newEmployee.email,
        designation: newEmployee.designation,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      const newCrew = {
        ...newEmployee,
        firebaseId: docRef.id
      };
      setCrews([...crews, newCrew]);
      setNewEmployee({
        id: '',
        name: '',
        designation: 'Station Controller / Train Operator',
        contact: '',
        email: ''
      });
      setShowAddForm(false);
      alert('Employee added successfully!');
    } catch (error) {
      console.error('Error adding employee:', error);
      alert('Error adding employee');
    } finally {
      setLoading(false);
    }
  };

  const handleCall = (contact) => {
    window.location.href = `tel:${contact}`;
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-2xl overflow-hidden font-mono">
      {/* Header Area */}
      <div className="p-4 bg-slate-950 border-b border-slate-800 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <h2 className="text-emerald-400 font-black text-sm uppercase tracking-wider flex items-center gap-2">
          <Users size={16} /> CREW DIRECTORY ({filteredCrew.length}/{crews.length} Records)
          {loading && <Loader size={16} className="animate-spin" />}
        </h2>
        
        <div className="flex gap-3 w-full lg:w-auto">
          <div className="relative flex-1 lg:flex-none lg:w-64">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
            <input 
              type="text" 
              placeholder="Filter by Name or ID..." 
              value={searchTerm}
              disabled={loading}
              className="w-full bg-slate-900 border border-slate-800 rounded pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {isAdmin && !showAddForm && (
            <button 
              onClick={() => setShowAddForm(true)} 
              disabled={loading}
              className="flex items-center gap-2 bg-blue-600/20 border border-blue-500/30 text-blue-400 px-3 py-1.5 rounded text-xs hover:bg-blue-600/30 transition whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <UserPlus size={14} /> ADD EMPLOYEE
            </button>
          )}
        </div>
      </div>

      {/* Add New Employee Form */}
      {showAddForm && isAdmin && (
        <div className="bg-slate-950/80 border-b border-slate-700 p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <input 
              type="text" 
              placeholder="Emp ID" 
              value={newEmployee.id}
              disabled={loading}
              onChange={(e) => setNewEmployee({...newEmployee, id: e.target.value})}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />
            <input 
              type="text" 
              placeholder="Name" 
              value={newEmployee.name}
              disabled={loading}
              onChange={(e) => setNewEmployee({...newEmployee, name: e.target.value})}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />
            <input 
              type="tel" 
              placeholder="Contact" 
              value={newEmployee.contact}
              disabled={loading}
              onChange={(e) => setNewEmployee({...newEmployee, contact: e.target.value})}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />
            <input 
              type="email" 
              placeholder="Email" 
              value={newEmployee.email}
              disabled={loading}
              onChange={(e) => setNewEmployee({...newEmployee, email: e.target.value})}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />
            <select 
              value={newEmployee.designation}
              disabled={loading}
              onChange={(e) => setNewEmployee({...newEmployee, designation: e.target.value})}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            >
              <option>Station Superintendent</option>
              <option>Station Controller / Train Operator</option>
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button 
              onClick={handleAddEmployee} 
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-bold uppercase transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading && <Loader size={12} className="animate-spin" />}
              Create
            </button>
            <button 
              onClick={() => setShowAddForm(false)} 
              disabled={loading}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded text-xs font-bold uppercase transition disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Directory Table */}
      <div className="max-h-[650px] overflow-y-auto">
        <table className="w-full text-left border-collapse text-[11px] text-slate-300">
          <thead className="bg-slate-900/50 sticky top-0 z-10 border-b border-slate-800">
            <tr>
              <th className="p-3 text-slate-400 w-20">EMP ID</th>
              <th className="p-3 text-slate-400 w-40">NAME</th>
              <th className="p-3 text-slate-400 w-32">CONTACT</th>
              <th className="p-3 text-slate-400 w-40">EMAIL</th>
              <th className="p-3 text-slate-400 w-32">DESIGNATION</th>
              <th className="p-3 text-slate-400 text-center w-32">ACTIONS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filteredCrew.length > 0 ? filteredCrew.map((staff) => (
              <tr key={staff.firebaseId} className="hover:bg-slate-800/40 transition-colors">
                {editingId === staff.id ? (
                  <>
                    <td className="p-3">
                      <input 
                        type="text" 
                        value={editData.id}
                        disabled={loading}
                        onChange={(e) => setEditData({...editData, id: e.target.value})}
                        className="w-full bg-slate-950 border border-emerald-500 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none disabled:opacity-50"
                      />
                    </td>
                    <td className="p-3">
                      <input 
                        type="text" 
                        value={editData.name}
                        disabled={loading}
                        onChange={(e) => setEditData({...editData, name: e.target.value})}
                        className="w-full bg-slate-950 border border-emerald-500 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none disabled:opacity-50"
                      />
                    </td>
                    <td className="p-3">
                      <input 
                        type="tel" 
                        value={editData.contact}
                        disabled={loading}
                        onChange={(e) => setEditData({...editData, contact: e.target.value})}
                        className="w-full bg-slate-950 border border-emerald-500 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none disabled:opacity-50"
                      />
                    </td>
                    <td className="p-3">
                      <input 
                        type="email" 
                        value={editData.email}
                        disabled={loading}
                        onChange={(e) => setEditData({...editData, email: e.target.value})}
                        className="w-full bg-slate-950 border border-emerald-500 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none disabled:opacity-50"
                      />
                    </td>
                    <td className="p-3">
                      <select 
                        value={editData.designation}
                        disabled={loading}
                        onChange={(e) => setEditData({...editData, designation: e.target.value})}
                        className="w-full bg-slate-950 border border-emerald-500 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none disabled:opacity-50"
                      >
                        <option>Station Superintendent</option>
                        <option>Station Controller / Train Operator</option>
                      </select>
                    </td>
                    <td className="p-3 flex justify-center gap-2">
                      <button 
                        onClick={handleSave} 
                        disabled={loading}
                        className="text-emerald-400 hover:text-emerald-300 transition disabled:opacity-50" 
                        title="Save"
                      >
                        {loading ? <Loader size={16} className="animate-spin" /> : <Save size={16} />}
                      </button>
                      <button 
                        onClick={handleCancel} 
                        disabled={loading}
                        className="text-slate-400 hover:text-slate-300 transition disabled:opacity-50" 
                        title="Cancel"
                      >
                        <X size={16} />
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="p-3 font-bold text-cyan-400">{staff.id}</td>
                    <td className="p-3 font-bold text-slate-100">{staff.name}</td>
                    <td className="p-3 text-amber-400 font-semibold">{staff.contact}</td>
                    <td className="p-3 text-slate-400 truncate">{staff.email}</td>
                    <td className="p-3 text-slate-400 text-xs">{staff.designation}</td>
                    <td className="p-3 flex justify-center gap-3">
                      <button 
                        onClick={() => handleCall(staff.contact)} 
                        className="text-emerald-400 hover:text-emerald-300 transition" 
                        title={`Call: ${staff.contact}`}
                      >
                        <Phone size={16} />
                      </button>
                      {staff.email && (
                        <a href={`mailto:${staff.email}`} className="text-blue-400 hover:text-blue-300 transition" title={`Email: ${staff.email}`}>
                          <Mail size={16} />
                        </a>
                      )}
                      {isAdmin && (
                        <>
                          <button 
                            onClick={() => handleEdit(staff)} 
                            disabled={loading}
                            className="text-slate-400 hover:text-slate-300 transition disabled:opacity-50" 
                            title="Edit"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => handleDelete(staff.id, staff.firebaseId)} 
                            disabled={loading}
                            className="text-rose-500 hover:text-rose-400 transition disabled:opacity-50" 
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </td>
                  </>
                )}
              </tr>
            )) : (
              <tr>
                <td colSpan="6" className="py-12 text-center text-slate-600 italic">
                  <AlertCircle size={20} className="mx-auto mb-2" />
                  {loading ? 'Loading employee data...' : 'No crew members found matching filter.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}