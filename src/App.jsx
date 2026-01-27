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
  Wrench, BarChart3, Package, Trash2, FileText, CreditCard, Wallet, AlertTriangle
} from 'lucide-react';

// --- CONFIGURACIÓN FIREBASE SEGURA ---
const getFirebaseConfig = () => {
  try {
    return (typeof __firebase_config !== 'undefined' && __firebase_config) 
      ? JSON.parse(__firebase_config) 
      : {
          apiKey: "AIzaSyDOeC0me_E0rtDx56ljnihrY8U5JxkCleg",
          authDomain: "los-aromos-4b29b.firebaseapp.com",
          projectId: "los-aromos-4b29b",
          storageBucket: "los-aromos-4b29b.firebasestorage.app",
          messagingSenderId: "969960941827",
          appId: "1:969960941827:web:d2b1863bcd2ee02c026136"
        };
  } catch (e) { return null; }
};

const firebaseConfig = getFirebaseConfig();
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// REGLA 1: Saneamiento estricto del appId (Evita errores de segmentos pares/impares)
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'los-aromos-admin-total';
const appId = rawAppId.replace(/[^a-zA-Z0-9]/g, '_'); 

// --- UTILIDAD PDF ---
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
  const [authError, setAuthError] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [bungalows, setBungalows] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedBungalow, setSelectedBungalow] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const [newBooking, setNewBooking] = useState({
    bungalowId: "1", 
    name: '', 
    phone: '', 
    guests: 1, 
    checkin: '', 
    checkout: '', 
    deposit: 0,
    isDepositPaid: false,
    paymentMethod: 'Efectivo'
  });

  // 1. Autenticación con manejo de errores para evitar carga infinita
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) { 
        console.error("Error de Auth:", err);
        setAuthError(err.message);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        setAuthError(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Sincronización Firestore
  useEffect(() => {
    if (!user) return;
    
    const bRef = collection(db, 'artifacts', appId, 'public', 'data', 'bungalows');
    const unsubB = onSnapshot(bRef, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (data.length === 0) {
        for(let i=1; i<=12; i++) {
          setDoc(doc(bRef, i.toString()), { name: `Bungalow ${i.toString().padStart(2, '0')}`, status: 'free' });
        }
      }
      setBungalows(data.sort((a, b) => parseInt(a.id) - parseInt(b.id)));
    }, (err) => setAuthError("Error Firestore Bungalows: " + err.message));

    const rRef = collection(db, 'artifacts', appId, 'public', 'data', 'reservations');
    const unsubR = onSnapshot(rRef, (snap) => {
      setReservations(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => setAuthError("Error Firestore Reservas: " + err.message));

    const mRef = collection(db, 'artifacts', appId, 'public', 'data', 'maintenance');
    const unsubM = onSnapshot(mRef, (snap) => {
      setMaintenance(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => setAuthError("Error Firestore Mantenimiento: " + err.message));

    return () => { unsubB(); unsubR(); unsubM(); };
  }, [user]);

  // Lógica de disponibilidad
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
    if (!user) return;
    setIsProcessing(true);
    try {
      const rRef = collection(db, 'artifacts', appId, 'public', 'data', 'reservations');
      await addDoc(rRef, { ...newBooking, createdAt: new Date().toISOString() });
      const bDoc = doc(db, 'artifacts', appId, 'public', 'data', 'bungalows', newBooking.bungalowId.toString());
      await updateDoc(bDoc, { status: 'occupied' });
      setShowAddModal(false);
      setNewBooking({ 
        bungalowId: "1", name: '', phone: '', guests: 1, checkin: '', checkout: '', deposit: 0, 
        isDepositPaid: false, paymentMethod: 'Efectivo' 
      });
    } catch (err) { console.error(err); }
    setIsProcessing(false);
  };

  const updateStatus = async (id, newStatus) => {
    if (!user) return;
    const bDoc = doc(db, 'artifacts', appId, 'public', 'data', 'bungalows', id.toString());
    await updateDoc(bDoc, { status: newStatus });
  };

  const deleteMaintenance = async (id) => {
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'maintenance', id));
  };

  const sendWhatsApp = (res) => {
    if (!res) return;
    const bungalowName = bungalows.find(b => b.id === res.bungalowId?.toString())?.name || res.bungalowId;
    const message = `Hola ${res.name}! 👋 Confirmamos tu reserva en *Los Aromos* 🌿%0A%0A📍 *Unidad:* ${bungalowName}%0A📅 *Entrada:* ${res.checkin}%0A📅 *Salida:* ${res.checkout}%0A💰 *Seña:* $${res.deposit} (${res.paymentMethod})`;
    const cleanPhone = String(res.phone || '').replace(/\D/g, '');
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  const generatePDF = async (res) => {
    if (!res) return;
    const { jsPDF } = await loadJsPDF();
    const pdf = new jsPDF();
    pdf.setFontSize(22);
    pdf.text("LOS AROMOS", 20, 25);
    pdf.setFontSize(10);
    pdf.text("COMPROBANTE DE PAGO DE RESERVA", 20, 32);
    
    pdf.setFontSize(12);
    pdf.text(`Huésped: ${String(res.name)}`, 20, 50);
    pdf.text(`Unidad: Bungalow ${String(res.bungalowId)}`, 20, 60);
    pdf.text(`Periodo: ${String(res.checkin)} al ${String(res.checkout)}`, 20, 70);
    pdf.text(`Forma de Pago: ${String(res.paymentMethod)}`, 20, 80);
    pdf.setFontSize(16);
    pdf.text(`SEÑA RECIBIDA: $${String(res.deposit)}`, 20, 100);
    
    pdf.setFontSize(9);
    pdf.text(`Generado el: ${new Date().toLocaleString()}`, 20, 120);
    pdf.save(`Recibo_LosAromos_${String(res.name).replace(/\s/g, '_')}.pdf`);
  };

  const stats = useMemo(() => ({
    occupied: bungalows.filter(b => b.status === 'occupied').length,
    free: bungalows.filter(b => b.status === 'free').length,
    maintenanceCount: maintenance.filter(m => m.status === 'pending').length,
    totalIncome: reservations.reduce((acc, r) => acc + (parseFloat(r.deposit) || 0), 0)
  }), [bungalows, reservations, maintenance]);

  const openBungalowDetail = (b) => {
    setSelectedBungalow(b);
    setShowDetailModal(true);
  };

  // Renderizado de Pantalla de Carga o Error
  if (authError || !user) return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center font-sans">
      {!authError ? (
        <>
          <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-6"></div>
          <h2 className="text-xl font-black uppercase tracking-widest">Iniciando Los Aromos...</h2>
          <p className="text-slate-400 mt-2 text-sm">Sincronizando con base de datos real</p>
        </>
      ) : (
        <div className="max-w-md bg-red-500/10 border border-red-500 p-8 rounded-[2.5rem] shadow-2xl">
          <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-black mb-2 uppercase">Error de Conexión</h2>
          <p className="text-slate-300 text-sm mb-6 leading-relaxed">{authError}</p>
          <button onClick={() => window.location.reload()} className="px-8 py-3 bg-red-500 hover:bg-red-600 rounded-2xl font-black transition-all">REINTENTAR CONEXIÓN</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-slate-900 font-sans">
      
      {/* Sidebar de Navegación */}
      <aside className="w-72 bg-[#0F172A] text-white hidden lg:flex flex-col shadow-2xl z-30">
        <div className="p-8 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20 text-white">
              <Home size={24} />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tighter uppercase">Los Aromos</h1>
              <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Administración</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-4 mt-6 space-y-2">
          <NavItem active={activeTab === 'dashboard'} icon={LayoutDashboard} label="Panel de Control General" onClick={() => setActiveTab('dashboard')} />
          <NavItem active={activeTab === 'maintenance'} icon={Wrench} label="Mantenimiento" onClick={() => setActiveTab('maintenance')} badge={stats.maintenanceCount} />
          <NavItem active={activeTab === 'reports'} icon={BarChart3} label="Balance y Caja" onClick={() => setActiveTab('reports')} />
        </nav>
      </aside>

      {/* Área Principal */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-white border-b border-slate-200 px-8 py-5 flex justify-between items-center z-20 shadow-sm">
          <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase">
            {activeTab === 'dashboard' && 'Panel de Control General'}
            {activeTab === 'maintenance' && 'Tareas Pendientes'}
            {activeTab === 'reports' && 'Estadísticas de Negocio'}
          </h2>
          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-[#0F172A] text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 hover:bg-emerald-600 transition-all shadow-xl active:scale-95"
          >
            <Plus size={20} /> Nueva Reserva
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          {activeTab === 'dashboard' && (
            <div className="animate-in fade-in duration-500">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10 text-slate-900">
                <StatCard label="Libres" value={stats.free} color="text-emerald-600" bg="bg-emerald-50" icon={CheckCircle2} />
                <StatCard label="Ocupados" value={stats.occupied} color="text-blue-600" bg="bg-blue-50" icon={Users} />
                <StatCard label="Mantenimiento" value={stats.maintenanceCount} color="text-amber-600" bg="bg-amber-50" icon={Wrench} />
                <StatCard label="Recaudación" value={`$${stats.totalIncome}`} color="text-slate-700" bg="bg-white" icon={DollarSign} />
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
                    onClick={() => openBungalowDetail(b)}
                  />
                ))}
              </div>
            </div>
          )}

          {activeTab === 'maintenance' && (
            <div className="max-w-4xl bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm animate-in slide-in-from-bottom-4">
              <h3 className="text-xl font-black mb-6 uppercase">Tareas de Mantenimiento</h3>
              <div className="space-y-4">
                {maintenance.length > 0 ? maintenance.filter(m => m.status === 'pending').map(m => (
                  <div key={m.id} className="p-5 bg-slate-50 rounded-2xl border flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="w-10 h-10 bg-slate-200 rounded-xl flex items-center justify-center font-black">#{m.bungalowId}</span>
                      <p className="font-bold text-slate-700">{m.task}</p>
                    </div>
                    <button onClick={() => deleteMaintenance(m.id)} className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-all"><Trash2 size={18}/></button>
                  </div>
                )) : <div className="py-10 text-center text-slate-300 font-bold uppercase">No hay tareas pendientes</div>}
              </div>
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="max-w-5xl space-y-8 animate-in fade-in duration-500">
               <div className="bg-[#0F172A] p-10 rounded-[3rem] text-white flex justify-between items-center shadow-2xl">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-emerald-400 mb-2">Total Recaudado por Señas</p>
                    <h3 className="text-6xl font-black tracking-tighter">${stats.totalIncome}</h3>
                  </div>
                  <BarChart3 size={64} className="text-slate-800" />
               </div>
               <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100">
                  <h3 className="text-xl font-black mb-6 uppercase">Historial de Cobros</h3>
                  <div className="space-y-3">
                    {reservations.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).map(r => (
                      <div key={r.id} className="flex justify-between items-center p-5 bg-slate-50 rounded-2xl border">
                        <div>
                          <p className="font-black text-slate-800">{String(r.name)}</p>
                          <p className="text-xs text-slate-400">Bungalow {r.bungalowId} • {r.paymentMethod}</p>
                        </div>
                        <p className="text-lg font-black text-emerald-600">+ ${r.deposit}</p>
                      </div>
                    ))}
                  </div>
               </div>
            </div>
          )}
        </div>
      </main>

      {/* MODAL DE DETALLE DE BUNGALOW (Visualización de Reservas y Disponibilidad) */}
      {showDetailModal && selectedBungalow && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3.5rem] shadow-2xl w-full max-w-5xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col md:flex-row h-[85vh]">
             {/* Calendario de Disponibilidad Visual */}
             <div className="md:w-1/2 bg-[#0F172A] p-10 text-white flex flex-col border-r border-slate-800 overflow-y-auto">
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-2xl font-black tracking-tight uppercase">Disponibilidad: {String(selectedBungalow.name)}</h3>
                  <div className="flex gap-2">
                    <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="p-3 bg-slate-100 text-slate-900 rounded-2xl hover:bg-emerald-500 hover:text-white transition-all"><ChevronLeft size={20}/></button>
                    <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="p-3 bg-slate-100 text-slate-900 rounded-2xl hover:bg-emerald-500 hover:text-white transition-all rotate-180"><ChevronLeft size={20}/></button>
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
                      const occupied = isDateOccupied(d, month, year, selectedBungalow.id);
                      cells.push(
                        <div key={d} className={`aspect-square flex items-center justify-center rounded-2xl text-xs font-bold transition-all ${occupied ? 'bg-red-500 text-white shadow-lg' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'}`}>
                          {d}
                        </div>
                      );
                    }
                    return cells;
                  })()}
                </div>
                <div className="mt-8 flex gap-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    <div className="flex items-center gap-2"><div className="w-3 h-3 bg-red-500 rounded-full"></div> Ocupado</div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 bg-emerald-500/40 rounded-full border border-emerald-500/40"></div> Disponible</div>
                </div>
             </div>
             {/* Listado de Reservas Hechas */}
             <div className="md:w-1/2 p-12 bg-white relative overflow-y-auto text-slate-900">
                <button onClick={() => setShowDetailModal(false)} className="absolute top-8 right-8 p-3 bg-slate-50 rounded-full hover:bg-slate-200 transition-all"><X/></button>
                <h3 className="text-3xl font-black mb-8 tracking-tighter uppercase text-slate-800">Historial de Reservas</h3>
                <div className="space-y-4">
                  {reservations.filter(r => r.bungalowId === selectedBungalow.id).length > 0 ? (
                    reservations.filter(r => r.bungalowId === selectedBungalow.id).sort((a,b) => new Date(b.checkin) - new Date(a.checkin)).map(r => (
                      <div key={String(r.id)} className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 flex flex-col gap-2 shadow-sm">
                        <div className="flex justify-between items-center">
                           <span className="font-black text-lg text-slate-700">{String(r.name)}</span>
                           <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full uppercase">{String(r.paymentMethod || 'Efectivo')}</span>
                        </div>
                        <div className="flex justify-between text-sm text-slate-500 font-bold">
                           <span>{String(r.checkin)} ➔ {String(r.checkout)}</span>
                           <span className="font-black text-slate-900">${String(r.deposit)}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-20 text-center text-slate-300 font-bold uppercase">Sin historial en esta unidad</div>
                  )}
                </div>
             </div>
          </div>
        </div>
      )}

      {/* MODAL DE NUEVA RESERVA CON PAGOS */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[4rem] shadow-2xl w-full max-w-6xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col md:flex-row h-[90vh]">
            <div className="md:w-5/12 bg-[#0F172A] p-10 text-white flex flex-col border-r border-slate-800 overflow-y-auto">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-2xl font-black tracking-tight uppercase">Ocupación Global</h3>
                <div className="flex gap-2">
                  <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="p-3 bg-slate-800 rounded-2xl hover:bg-emerald-600 transition-all text-white"><ChevronLeft size={20}/></button>
                  <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="p-3 bg-slate-800 rounded-2xl hover:bg-emerald-600 transition-all rotate-180 text-white"><ChevronLeft size={20}/></button>
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
                      <div key={d} className={`aspect-square flex items-center justify-center rounded-2xl text-xs font-bold transition-all ${occupied ? 'bg-red-500/20 text-red-400 border border-red-500/30 line-through' : 'bg-slate-800/40 text-slate-400'}`}>
                        {d}
                      </div>
                    );
                  }
                  return cells;
                })()}
              </div>
            </div>

            <div className="md:w-7/12 p-12 bg-white relative overflow-y-auto text-slate-900">
              <button onClick={() => setShowAddModal(false)} className="absolute top-8 right-8 p-3 bg-slate-50 rounded-full hover:bg-slate-200 transition-all"><X/></button>
              <h3 className="text-4xl font-black mb-10 tracking-tighter uppercase text-slate-800">Nueva Reserva</h3>
              <form onSubmit={handleAddBooking} className="space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Seleccionar Unidad</label>
                  <div className="grid grid-cols-6 gap-2">
                    {bungalows.map(b => (
                      <button type="button" key={b.id} onClick={() => setNewBooking({...newBooking, bungalowId: b.id})} className={`h-12 rounded-xl text-xs font-black border-2 transition-all ${newBooking.bungalowId === b.id ? 'bg-[#0F172A] border-[#0F172A] text-white shadow-xl' : 'bg-slate-50 border-slate-50 text-slate-400'}`}>
                        {String(b.id)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Huésped</label>
                    <input type="text" required placeholder="Nombre o Familia" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold" value={newBooking.name} onChange={(e) => setNewBooking({...newBooking, name: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">WhatsApp</label>
                    <input type="tel" required placeholder="+54 9..." className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold" value={newBooking.phone} onChange={(e) => setNewBooking({...newBooking, phone: e.target.value})} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1 font-bold">Fecha Entrada</label>
                    <input type="date" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold" value={newBooking.checkin} onChange={(e) => setNewBooking({...newBooking, checkin: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1 font-bold">Fecha Salida</label>
                    <input type="date" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold" value={newBooking.checkout} onChange={(e) => setNewBooking({...newBooking, checkout: e.target.value})} />
                  </div>
                </div>
                
                {/* Nuevas Casillas: Seña y Forma de Pago */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-8 rounded-[3rem] border border-slate-100 shadow-inner">
                    <div className="flex flex-col gap-5 justify-center">
                        <label className="flex items-center gap-3 cursor-pointer group">
                           <div className="relative">
                                <input 
                                    type="checkbox" 
                                    className="peer sr-only" 
                                    checked={newBooking.isDepositPaid} 
                                    onChange={(e) => setNewBooking({...newBooking, isDepositPaid: e.target.checked})} 
                                />
                                <div className="w-7 h-7 border-2 border-slate-300 rounded-xl bg-white peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-all shadow-sm"></div>
                                <div className="absolute top-1.5 left-2.5 w-2 h-4 border-r-2 border-b-2 border-white rotate-45 opacity-0 peer-checked:opacity-100 transition-all"></div>
                           </div>
                           <span className="text-xs font-black uppercase text-slate-600 group-hover:text-slate-900 transition-colors tracking-tight">¿Paga Seña Ahora?</span>
                        </label>

                        <div className="space-y-2">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Forma de Pago</label>
                           <div className="flex gap-2">
                                <button 
                                    type="button" 
                                    onClick={() => setNewBooking({...newBooking, paymentMethod: 'Efectivo'})}
                                    className={`flex-1 py-4 px-4 rounded-2xl text-[10px] font-black flex items-center justify-center gap-2 border-2 transition-all uppercase ${newBooking.paymentMethod === 'Efectivo' ? 'bg-slate-900 border-slate-900 text-white shadow-xl' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}
                                >
                                    <Wallet size={16}/> Efectivo
                                </button>
                                <button 
                                    type="button" 
                                    onClick={() => setNewBooking({...newBooking, paymentMethod: 'MercadoPago'})}
                                    className={`flex-1 py-4 px-4 rounded-2xl text-[10px] font-black flex items-center justify-center gap-2 border-2 transition-all uppercase ${newBooking.paymentMethod === 'MercadoPago' ? 'bg-[#009EE3] border-[#009EE3] text-white shadow-xl' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}
                                >
                                    <CreditCard size={16}/> MercadoPago
                                </button>
                           </div>
                        </div>
                    </div>
                    <div className="bg-emerald-50 p-6 rounded-[2.5rem] border border-emerald-100 flex flex-col justify-center">
                        <label className="text-[10px] font-black text-emerald-600 uppercase mb-2 block tracking-widest ml-1">Monto de Seña ($)</label>
                        <input type="number" required className="bg-transparent border-none outline-none font-black text-emerald-700 text-5xl w-full" value={newBooking.deposit} onChange={(e) => setNewBooking({...newBooking, deposit: e.target.value})} />
                    </div>
                </div>

                {/* Recordatorio MercadoPago */}
                {newBooking.paymentMethod === 'MercadoPago' && (
                  <div className="flex items-center gap-4 p-6 bg-amber-50 border border-amber-200 rounded-[2.5rem] animate-pulse">
                    <div className="w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center text-white shadow-lg">
                      <AlertTriangle size={24} />
                    </div>
                    <p className="text-xs font-black text-amber-800 uppercase tracking-tight leading-relaxed">
                      ¡Recordatorio: No olvides realizar la factura correspondiente a esta reserva en el sistema de facturación!
                    </p>
                  </div>
                )}

                <button type="submit" disabled={isProcessing} className="w-full py-6 bg-[#0F172A] text-white rounded-[2.5rem] font-black text-xl hover:bg-emerald-600 transition-all shadow-2xl active:scale-95">
                  {isProcessing ? 'Procesando...' : 'Confirmar Registro de Reserva'}
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
  <button onClick={onClick} className={`w-full flex items-center justify-between px-6 py-4 rounded-2xl transition-all ${active ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}>
    <div className="flex items-center gap-4">
      <Icon size={20} />
      <span className="font-bold text-sm tracking-tight">{String(label)}</span>
    </div>
    {badge > 0 && <span className="bg-amber-500 text-[#0F172A] text-[10px] font-black px-2 py-1 rounded-lg">{String(badge)}</span>}
  </button>
);

const StatCard = ({ icon: Icon, label, value, color, bg }) => (
  <div className={`p-8 rounded-[3rem] border border-slate-100 shadow-sm flex items-center gap-6 ${bg}`}>
    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${color} bg-white shadow-sm`}><Icon size={28} /></div>
    <div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{String(label)}</p>
      <p className={`text-3xl font-black ${color} tracking-tighter`}>{String(value)}</p>
    </div>
  </div>
);

const BungalowCard = ({ data, reservation, onStatusChange, onWhatsApp, onPDF, onClick }) => {
  const statusStyles = {
    free: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Disponible', dot: 'bg-emerald-500' },
    occupied: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Ocupado', dot: 'bg-blue-500' },
    cleaning: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Limpieza', dot: 'bg-amber-500' }
  };
  const config = statusStyles[data.status] || statusStyles.free;

  return (
    <div 
        onClick={onClick}
        className="bg-white rounded-[3.5rem] border border-slate-100 shadow-sm hover:shadow-2xl transition-all duration-500 overflow-hidden group flex flex-col cursor-pointer active:scale-[0.98]"
    >
      <div className="p-8 flex-1 text-slate-900">
        <div className="flex justify-between items-start mb-8">
          <div className={`px-4 py-1.5 rounded-full ${config.bg} ${config.text} text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-sm`}>
            <span className={`w-2 h-2 rounded-full ${config.dot} ${data.status === 'occupied' ? 'animate-pulse' : ''}`}></span>
            {config.label}
          </div>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
            <button onClick={(e) => { e.stopPropagation(); onStatusChange(data.id, 'cleaning'); }} className="p-2 hover:bg-amber-50 text-amber-600 rounded-xl shadow-sm bg-white" title="Limpieza"><Clock size={16}/></button>
            <button onClick={(e) => { e.stopPropagation(); onStatusChange(data.id, 'free'); }} className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-xl shadow-sm bg-white" title="Liberar"><CheckCircle2 size={16}/></button>
          </div>
        </div>

        <h3 className="text-3xl font-black text-slate-800 tracking-tighter mb-1 uppercase leading-none">{String(data.name || data.id)}</h3>
        
        {data.status === 'occupied' && reservation ? (
          <div className="space-y-4 mt-6 animate-in text-slate-900">
            <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 shadow-inner">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Huésped</p>
              <p className="text-lg font-black text-slate-700 truncate">{String(reservation.name)}</p>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <button onClick={(e) => { e.stopPropagation(); onWhatsApp(reservation); }} className="flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase shadow-lg shadow-emerald-100 active:scale-95">
                <Send size={14} /> WhatsApp
              </button>
              <button onClick={(e) => { e.stopPropagation(); onPDF(reservation); }} className="flex items-center justify-center gap-2 py-3 bg-slate-100 text-slate-600 rounded-2xl text-[10px] font-black uppercase active:scale-95 shadow-sm">
                <Download size={14} /> PDF
              </button>
            </div>

            <div className="flex justify-between items-end pt-4 border-t border-slate-50 text-slate-900">
              <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-bold">Salida</p><p className="text-sm font-black text-red-500">{String(reservation.checkout)}</p></div>
              <div className="text-right"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-bold">Seña</p><p className="text-sm font-black text-emerald-600">${String(reservation.deposit)}</p></div>
            </div>
          </div>
        ) : (
          <div className="h-44 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-[3rem] mt-6 bg-slate-50/50 text-slate-200 shadow-inner">
             <Package size={28} />
             <p className="text-[10px] font-black uppercase mt-3 tracking-widest">Sin reservas activas</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
