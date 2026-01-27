import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { 
  getFirestore, collection, doc, onSnapshot, setDoc, addDoc, updateDoc, deleteDoc, query 
} from 'firebase/firestore';
import { 
  LayoutDashboard, CalendarDays, Users, Home, Search, 
  CheckCircle2, Clock, AlertCircle, MoreVertical, ChevronRight, 
  LogOut, Plus, DollarSign, Info, Send, Download, ChevronLeft, X,
  Wrench, BarChart3, Package, Trash2, FileText
} from 'lucide-react';

// --- CONFIGURACIÓN FIREBASE SEGURA ---
const getFirebaseConfig = () => {
  try {
    return (typeof __firebase_config !== 'undefined' && __firebase_config) 
      ? JSON.parse(__firebase_config) 
      : null;
  } catch (e) {
    return null;
  }
};

const firebaseConfig = getFirebaseConfig();
const app = firebaseConfig ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

// Saneamos el appId para evitar errores de segmentos en Firestore (Regla 1)
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'los-aromos-admin-total';
const appId = rawAppId.replace(/\//g, '_');

// --- INTEGRACIÓN JSPDF ---
const loadJsPDF = () => {
  return new Promise((resolve) => {
    if (window.jspdf) return resolve(window.jspdf);
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.onload = () => resolve(window.jspdf);
    document.head.appendChild(script);
  });
};

const App = () => {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [bungalows, setBungalows] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const [newBooking, setNewBooking] = useState({
    bungalowId: "1", name: '', phone: '', guests: 1, checkin: '', checkout: '', deposit: 0
  });

  // Autenticación (Siguiendo Regla 3)
  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) { console.error("Error de Auth:", err); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Carga de Datos en Tiempo Real (Siguiendo Regla 1 y 2)
  useEffect(() => {
    if (!user || !db) return;
    
    // Bungalows - Ruta pública (5 segmentos: artifacts / appId / public / data / bungalows)
    const bRef = collection(db, 'artifacts', appId, 'public', 'data', 'bungalows');
    const unsubB = onSnapshot(bRef, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (data.length === 0) {
        for(let i=1; i<=12; i++) {
          setDoc(doc(bRef, i.toString()), { name: `Bungalow ${i.toString().padStart(2, '0')}`, status: 'free' });
        }
      }
      setBungalows(data.sort((a, b) => parseInt(a.id) - parseInt(b.id)));
    }, (err) => console.error("Error Firestore Bungalows:", err));

    const rRef = collection(db, 'artifacts', appId, 'public', 'data', 'reservations');
    const unsubR = onSnapshot(rRef, (snap) => {
      setReservations(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error("Error Firestore Reservas:", err));

    const mRef = collection(db, 'artifacts', appId, 'public', 'data', 'maintenance');
    const unsubM = onSnapshot(mRef, (snap) => {
      setMaintenance(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error("Error Firestore Mantenimiento:", err));

    return () => { unsubB(); unsubR(); unsubM(); };
  }, [user]);

  // Funciones de Negocio
  const handleAddMaintenance = async (bungalowId, task) => {
    if (!task.trim() || !db || !user) return;
    const mRef = collection(db, 'artifacts', appId, 'public', 'data', 'maintenance');
    await addDoc(mRef, { bungalowId, task, status: 'pending', createdAt: new Date().toISOString() });
  };

  const toggleMaintenance = async (id, currentStatus) => {
    if (!db || !user) return;
    const mDoc = doc(db, 'artifacts', appId, 'public', 'data', 'maintenance', id);
    await updateDoc(mDoc, { status: currentStatus === 'pending' ? 'done' : 'pending' });
  };

  const deleteMaintenance = async (id) => {
    if (!db || !user) return;
    const mDoc = doc(db, 'artifacts', appId, 'public', 'data', 'maintenance', id);
    await deleteDoc(mDoc);
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    return { firstDay, days, year, month };
  };

  const isDateOccupied = (day, month, year, bungalowId) => {
    const checkDate = new Date(year, month, day);
    checkDate.setHours(0, 0, 0, 0);
    return reservations.some(res => {
      if (!res.bungalowId || res.bungalowId.toString() !== bungalowId?.toString()) return false;
      const start = new Date(res.checkin + 'T00:00:00');
      const end = new Date(res.checkout + 'T00:00:00');
      return checkDate >= start && checkDate <= end;
    });
  };

  const handleAddBooking = async (e) => {
    e.preventDefault();
    if (!user || !db) return;
    setIsProcessing(true);
    try {
      const rRef = collection(db, 'artifacts', appId, 'public', 'data', 'reservations');
      await addDoc(rRef, { ...newBooking, createdAt: new Date().toISOString() });
      const bDoc = doc(db, 'artifacts', appId, 'public', 'data', 'bungalows', newBooking.bungalowId.toString());
      await updateDoc(bDoc, { status: 'occupied' });
      setShowAddModal(false);
      setNewBooking({ bungalowId: "1", name: '', phone: '', guests: 1, checkin: '', checkout: '', deposit: 0 });
    } catch (err) { console.error(err); }
    setIsProcessing(false);
  };

  const updateStatus = async (id, newStatus) => {
    if (!db || !user) return;
    const bDoc = doc(db, 'artifacts', appId, 'public', 'data', 'bungalows', id.toString());
    await updateDoc(bDoc, { status: newStatus });
  };

  const sendWhatsApp = (res) => {
    if (!res) return;
    const bungalowName = bungalows.find(b => b.id === res.bungalowId?.toString())?.name || res.bungalowId;
    const message = `Hola ${res.name}! 👋 Confirmamos tu reserva en *Los Aromos* 🌿%0A%0A📍 *Unidad:* ${bungalowName}%0A📅 *Entrada:* ${res.checkin}%0A📅 *Salida:* ${res.checkout}%0A💰 *Seña:* $${res.deposit}`;
    const cleanPhone = String(res.phone || '').replace(/\D/g, '');
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  const generatePDF = async (res) => {
    if (!res) return;
    const { jsPDF } = await loadJsPDF();
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text("LOS AROMOS - COMPROBANTE", 20, 20);
    doc.setFontSize(12);
    doc.text(`Huésped: ${String(res.name || 'Huésped')}`, 20, 40);
    doc.text(`Unidad: Bungalow ${String(res.bungalowId || '-')}`, 20, 50);
    doc.text(`Periodo: ${String(res.checkin || '-')} al ${String(res.checkout || '-')}`, 20, 60);
    doc.text(`Seña Recibida: $${String(res.deposit || 0)}`, 20, 70);
    doc.save(`Recibo_Aromos_${String(res.name || 'reserva').replace(/\s/g, '_')}.pdf`);
  };

  const stats = useMemo(() => ({
    occupied: bungalows.filter(b => b.status === 'occupied').length,
    free: bungalows.filter(b => b.status === 'free').length,
    maintenanceCount: maintenance.filter(m => m.status === 'pending').length,
    totalIncome: reservations.reduce((acc, r) => acc + (parseFloat(r.deposit) || 0), 0)
  }), [bungalows, reservations, maintenance]);

  if (!firebaseConfig) return <div className="h-screen flex items-center justify-center p-8 text-center bg-slate-900 text-white">Error: Configuración de base de datos no disponible.</div>;
  if (!user) return <div className="h-screen flex items-center justify-center font-black animate-pulse bg-slate-900 text-white uppercase tracking-widest">Sincronizando Los Aromos...</div>;

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-slate-900 font-sans">
      
      {/* Sidebar */}
      <aside className="w-72 bg-[#0F172A] text-white hidden lg:flex flex-col shadow-2xl z-30">
        <div className="p-8 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Home size={24} />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tighter text-white">LOS AROMOS</h1>
              <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Panel Administrativo</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-4 mt-6 space-y-2">
          <NavItem active={activeTab === 'dashboard'} icon={LayoutDashboard} label="Dashboard" onClick={() => setActiveTab('dashboard')} />
          <NavItem active={activeTab === 'maintenance'} icon={Wrench} label="Mantenimiento" onClick={() => setActiveTab('maintenance')} badge={stats.maintenanceCount} />
          <NavItem active={activeTab === 'reports'} icon={BarChart3} label="Reportes y Caja" onClick={() => setActiveTab('reports')} />
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-white border-b border-slate-200 px-8 py-5 flex justify-between items-center z-20">
          <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase">
            {activeTab === 'dashboard' && 'Control de Cabañas'}
            {activeTab === 'maintenance' && 'Tareas de Mantenimiento'}
            {activeTab === 'reports' && 'Balance y Reportes'}
          </h2>
          <div className="flex gap-4">
            <button 
              onClick={() => setShowAddModal(true)}
              className="bg-[#0F172A] text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 hover:bg-emerald-600 transition-all shadow-xl active:scale-95"
            >
              <Plus size={20} /> Nueva Reserva
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          {activeTab === 'dashboard' && (
            <div className="animate-in fade-in duration-500">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
                <StatCard label="Disponibles" value={stats.free} color="text-emerald-600" bg="bg-emerald-50" icon={CheckCircle2} />
                <StatCard label="Ocupados" value={stats.occupied} color="text-blue-600" bg="bg-blue-50" icon={Users} />
                <StatCard label="Mantenimiento" value={stats.maintenanceCount} color="text-amber-600" bg="bg-amber-50" icon={Wrench} />
                <StatCard label="Ingresos" value={`$${stats.totalIncome}`} color="text-slate-700" bg="bg-white" icon={DollarSign} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {bungalows.map((b) => (
                  <BungalowCard 
                    key={b.id} 
                    data={b} 
                    reservation={reservations.find(r => r.bungalowId?.toString() === b.id && b.status === 'occupied')} 
                    onStatusChange={updateStatus}
                    onWhatsApp={sendWhatsApp}
                    onPDF={generatePDF}
                  />
                ))}
              </div>
            </div>
          )}

          {activeTab === 'maintenance' && (
            <div className="max-w-5xl mx-auto space-y-8 animate-in slide-in-from-bottom-4">
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <h3 className="text-xl font-black mb-6">Añadir Tarea</h3>
                <div className="flex gap-4">
                  <select id="maintBungalow" className="p-4 bg-slate-100 rounded-2xl border-none font-bold outline-none focus:ring-2 focus:ring-emerald-500">
                    {bungalows.map(b => <option key={b.id} value={b.id}>{String(b.name || b.id)}</option>)}
                  </select>
                  <input id="maintTask" type="text" placeholder="¿Qué hay que hacer?" className="flex-1 p-4 bg-slate-100 rounded-2xl border-none font-bold outline-none" />
                  <button 
                    onClick={() => {
                      const input = document.getElementById('maintTask');
                      handleAddMaintenance(document.getElementById('maintBungalow').value, input.value);
                      input.value = '';
                    }}
                    className="bg-emerald-600 text-white px-8 rounded-2xl font-black hover:bg-emerald-700 transition-all"
                  >
                    Añadir
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-black mb-6 flex items-center gap-2">
                    <Clock className="text-amber-500" size={20} /> Pendientes
                  </h3>
                  <div className="space-y-3">
                    {maintenance.filter(m => m.status === 'pending').map(m => (
                      <div key={m.id} className="p-4 bg-slate-50 rounded-2xl border flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <span className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center text-[10px] font-black">{String(m.bungalowId || '-')}</span>
                          <p className="text-sm font-bold text-slate-700">{String(m.task || 'Sin tarea')}</p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => toggleMaintenance(m.id, m.status)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all shadow-sm"><CheckCircle2 size={18}/></button>
                          <button onClick={() => deleteMaintenance(m.id)} className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-all shadow-sm"><Trash2 size={18}/></button>
                        </div>
                      </div>
                    ))}
                    {maintenance.filter(m => m.status === 'pending').length === 0 && <p className="text-center py-8 text-slate-400 text-sm italic">No hay tareas pendientes.</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Ocupación Actual</p>
                  <h4 className="text-4xl font-black text-blue-600">{Math.round((stats.occupied / 12) * 100)}%</h4>
                  <div className="mt-4 w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-blue-600 h-full" style={{ width: `${(stats.occupied / 12) * 100}%` }}></div>
                  </div>
                </div>
                <div className="bg-[#0F172A] p-8 rounded-[2.5rem] text-white shadow-xl">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Recaudación Señas</p>
                  <h4 className="text-4xl font-black text-emerald-400">${stats.totalIncome}</h4>
                  <p className="text-[10px] text-slate-500 mt-2 italic">Basado en reservas confirmadas.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* MODAL DE RESERVA CON CALENDARIO */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-6xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col md:flex-row h-[90vh]">
            <div className="md:w-5/12 bg-[#0F172A] p-10 text-white flex flex-col border-r border-slate-800">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-2xl font-black tracking-tight">Disponibilidad</h3>
                <div className="flex gap-2">
                  <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="p-3 bg-slate-800 hover:bg-emerald-600 rounded-2xl transition-all"><ChevronLeft size={20}/></button>
                  <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="p-3 bg-slate-800 hover:bg-emerald-600 rounded-2xl transition-all rotate-180"><ChevronLeft size={20}/></button>
                </div>
              </div>
              <div className="grid grid-cols-7 mb-4 text-center">
                {['D','L','M','M','J','V','S'].map(d => <div key={d} className="text-[10px] font-black text-slate-500 uppercase">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {(() => {
                  const { firstDay, days, year, month } = getDaysInMonth(currentMonth);
                  const cells = [];
                  for (let i = 0; i < firstDay; i++) cells.push(<div key={`empty-${i}`} />);
                  for (let d = 1; d <= days; d++) {
                    const occupied = isDateOccupied(d, month, year, newBooking.bungalowId);
                    cells.push(
                      <div key={d} className={`aspect-square flex items-center justify-center rounded-2xl text-xs font-bold transition-all ${occupied ? 'bg-red-500/20 text-red-400 border border-red-500/30 line-through' : 'bg-slate-800/40 text-slate-400 hover:bg-emerald-500 hover:text-white'}`}>
                        {d}
                      </div>
                    );
                  }
                  return cells;
                })()}
              </div>
            </div>

            <div className="md:w-7/12 p-12 bg-white relative overflow-y-auto">
              <button onClick={() => setShowAddModal(false)} className="absolute top-8 right-8 p-3 bg-slate-50 rounded-full hover:bg-slate-200 transition-all"><X/></button>
              <h3 className="text-4xl font-black mb-10 tracking-tighter text-slate-900">Nueva Reserva</h3>
              <form onSubmit={handleAddBooking} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Unidad</label>
                  <div className="grid grid-cols-6 gap-2">
                    {bungalows.map(b => (
                      <button type="button" key={b.id} onClick={() => setNewBooking({...newBooking, bungalowId: b.id})} className={`h-12 rounded-xl text-xs font-black border-2 transition-all ${newBooking.bungalowId === b.id ? 'bg-[#0F172A] border-[#0F172A] text-white shadow-xl' : 'bg-slate-50 border-slate-50 text-slate-400 hover:border-slate-300'}`}>
                        {String(b.id)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <input type="text" required placeholder="Huésped" className="p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold" value={newBooking.name} onChange={(e) => setNewBooking({...newBooking, name: e.target.value})} />
                  <input type="tel" required placeholder="WhatsApp" className="p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold" value={newBooking.phone} onChange={(e) => setNewBooking({...newBooking, phone: e.target.value})} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400 ml-1">Entrada</label>
                    <input type="date" required className="p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold" value={newBooking.checkin} onChange={(e) => setNewBooking({...newBooking, checkin: e.target.value})} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400 ml-1">Salida</label>
                    <input type="date" required className="p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold" value={newBooking.checkout} onChange={(e) => setNewBooking({...newBooking, checkout: e.target.value})} />
                  </div>
                </div>
                <div className="bg-emerald-50 p-6 rounded-[2rem] border border-emerald-100 shadow-inner">
                  <label className="text-[10px] font-black text-emerald-600 uppercase mb-2 block">Seña Cobrada ($)</label>
                  <input type="number" required className="bg-transparent border-none outline-none font-black text-emerald-700 text-4xl w-full" value={newBooking.deposit} onChange={(e) => setNewBooking({...newBooking, deposit: e.target.value})} />
                </div>
                <button type="submit" disabled={isProcessing} className="w-full py-6 bg-[#0F172A] text-white rounded-[2rem] font-black text-xl hover:bg-emerald-600 transition-all shadow-2xl active:scale-95">
                  {isProcessing ? 'Guardando...' : 'Confirmar Reserva'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- COMPONENTES AUXILIARES ---
const NavItem = ({ icon: Icon, label, active, onClick, badge }) => (
  <button onClick={onClick} className={`w-full flex items-center justify-between px-6 py-4 rounded-2xl transition-all group ${active ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}>
    <div className="flex items-center gap-4">
      <Icon size={20} className={active ? 'text-white' : 'group-hover:scale-110 transition-transform'} />
      <span className="font-bold text-sm tracking-tight">{String(label)}</span>
    </div>
    {typeof badge === 'number' && badge > 0 && (
      <span className="bg-amber-500 text-[#0F172A] text-[10px] font-black px-2 py-1 rounded-lg shadow-sm">{badge}</span>
    )}
  </button>
);

const StatCard = ({ icon: Icon, label, value, color, bg }) => (
  <div className={`p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex items-center gap-6 ${bg} hover:shadow-md transition-shadow`}>
    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${color} bg-white shadow-sm`}><Icon size={28} /></div>
    <div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{String(label)}</p>
      <p className={`text-3xl font-black ${color} tracking-tighter`}>{String(value)}</p>
    </div>
  </div>
);

const BungalowCard = ({ data, reservation, onStatusChange, onWhatsApp, onPDF }) => {
  const statusStyles = {
    free: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Disponible', dot: 'bg-emerald-500' },
    occupied: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Ocupado', dot: 'bg-blue-500' },
    cleaning: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Limpieza', dot: 'bg-amber-500' }
  };
  const config = statusStyles[data.status] || statusStyles.free;

  return (
    <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm hover:shadow-2xl transition-all duration-500 overflow-hidden group flex flex-col">
      <div className="p-8 flex-1">
        <div className="flex justify-between items-start mb-8">
          <div className={`px-4 py-1.5 rounded-full ${config.bg} ${config.text} text-[10px] font-black uppercase tracking-widest flex items-center gap-2`}>
            <span className={`w-2 h-2 rounded-full ${config.dot} ${data.status === 'occupied' ? 'animate-pulse' : ''}`}></span>
            {config.label}
          </div>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
            <button onClick={() => onStatusChange(data.id, 'cleaning')} className="p-2 hover:bg-amber-50 text-amber-600 rounded-xl transition-colors shadow-sm bg-white border border-slate-100" title="Limpieza"><Clock size={16}/></button>
            <button onClick={() => onStatusChange(data.id, 'free')} className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-xl transition-colors shadow-sm bg-white border border-slate-100" title="Liberar"><CheckCircle2 size={16}/></button>
          </div>
        </div>

        <h3 className="text-3xl font-black text-slate-800 tracking-tighter mb-1">{String(data.name || data.id)}</h3>
        
        {data.status === 'occupied' && reservation ? (
          <div className="space-y-4 mt-6 animate-in fade-in zoom-in-95">
            <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 shadow-inner">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Huésped</p>
              <p className="text-lg font-black text-slate-700 truncate">{String(reservation.name || 'Invitado')}</p>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => onWhatsApp(reservation)} className="flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 active:scale-95">
                <Send size={14} /> WhatsApp
              </button>
              <button onClick={() => onPDF(reservation)} className="flex items-center justify-center gap-2 py-3 bg-slate-100 text-slate-600 rounded-2xl text-[10px] font-black uppercase hover:bg-slate-200 transition-colors active:scale-95">
                <FileText size={14} /> PDF
              </button>
            </div>

            <div className="flex justify-between items-end pt-4 border-t border-slate-100">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Salida</p>
                <p className="text-sm font-black text-red-500">{String(reservation.checkout || '-')}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Seña</p>
                <p className="text-sm font-black text-emerald-600">${String(reservation.deposit || 0)}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-40 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-[2.5rem] mt-6 bg-slate-50/50 text-slate-200 shadow-inner">
            <Package size={24} />
            <p className="text-[10px] uppercase font-bold tracking-widest mt-2">Sin Ocupación</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
