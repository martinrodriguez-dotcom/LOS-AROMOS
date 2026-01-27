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
  Wrench, BarChart3, Package, Trash2, FileText, CreditCard, Wallet, 
  AlertTriangle, TrendingUp, TrendingDown, ClipboardList, Phone, Menu
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

// Saneamiento de appId para Firestore
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [bungalows, setBungalows] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [selectedBungalow, setSelectedBungalow] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');

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

  const [newExpense, setNewExpense] = useState({
    description: '',
    amount: 0,
    category: 'Mantenimiento',
    date: new Date().toISOString().split('T')[0]
  });

  // 1. Autenticación (Regla 3)
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) { 
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
    });

    const rRef = collection(db, 'artifacts', appId, 'public', 'data', 'reservations');
    const unsubR = onSnapshot(rRef, (snap) => {
      setReservations(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const mRef = collection(db, 'artifacts', appId, 'public', 'data', 'maintenance');
    const unsubM = onSnapshot(mRef, (snap) => {
      setMaintenance(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const eRef = collection(db, 'artifacts', appId, 'public', 'data', 'expenses');
    const unsubE = onSnapshot(eRef, (snap) => {
      setExpenses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { unsubB(); unsubR(); unsubM(); unsubE(); };
  }, [user]);

  // Lógica de Negocio
  const todayStr = new Date().toISOString().split('T')[0];
  const dailyAgenda = useMemo(() => {
    const checkins = reservations.filter(r => r.checkin === todayStr);
    const checkouts = reservations.filter(r => r.checkout === todayStr);
    return { checkins, checkouts };
  }, [reservations, todayStr]);

  const stats = useMemo(() => {
    const totalIncome = reservations.reduce((acc, r) => acc + (parseFloat(r.deposit) || 0), 0);
    const totalExpenses = expenses.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
    const occupiedCount = bungalows.filter(b => b.status === 'occupied').length;
    const occupancyRate = bungalows.length > 0 ? Math.round((occupiedCount / bungalows.length) * 100) : 0;

    return {
      occupied: occupiedCount,
      free: bungalows.filter(b => b.status === 'free').length,
      maintenanceCount: maintenance.filter(m => m.status === 'pending').length,
      totalIncome,
      totalExpenses,
      netProfit: totalIncome - totalExpenses,
      occupancyRate
    };
  }, [bungalows, reservations, maintenance, expenses]);

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
    if (!user || isProcessing) return;
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

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!user || isProcessing) return;
    setIsProcessing(true);
    try {
      const eRef = collection(db, 'artifacts', appId, 'public', 'data', 'expenses');
      await addDoc(eRef, { ...newExpense, createdAt: new Date().toISOString() });
      setShowExpenseModal(false);
      setNewExpense({ description: '', amount: 0, category: 'Mantenimiento', date: todayStr });
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

  const deleteExpense = async (id) => {
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'expenses', id));
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
    pdf.text("COMPROBANTE DE RESERVA", 20, 32);
    pdf.setFontSize(12);
    pdf.text(`Huésped: ${String(res.name)}`, 20, 50);
    pdf.text(`Unidad: Bungalow ${String(res.bungalowId)}`, 20, 60);
    pdf.text(`Periodo: ${String(res.checkin)} al ${String(res.checkout)}`, 20, 70);
    pdf.text(`Forma de Pago: ${String(res.paymentMethod)}`, 20, 80);
    pdf.setFontSize(16);
    pdf.text(`SEÑA RECIBIDA: $${String(res.deposit)}`, 20, 100);
    pdf.setFontSize(9);
    pdf.text(`Generado: ${new Date().toLocaleString()}`, 20, 120);
    pdf.save(`Recibo_LosAromos_${String(res.name).replace(/\s/g, '_')}.pdf`);
  };

  const openBungalowDetail = (b) => {
    setSelectedBungalow(b);
    setShowDetailModal(true);
  };

  if (authError || !user) return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#0F172A] text-white p-6 text-center">
      {!authError ? (
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-6"></div>
          <h2 className="text-xl font-black uppercase tracking-widest leading-none">Iniciando Los Aromos...</h2>
        </div>
      ) : (
        <div className="max-w-md bg-red-500/10 border border-red-500 p-8 rounded-[2.5rem] shadow-2xl">
          <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-black mb-2 uppercase">Error de Conexión</h2>
          <p className="text-slate-300 text-sm mb-6 leading-relaxed">{authError}</p>
          <button onClick={() => window.location.reload()} className="px-8 py-3 bg-red-500 hover:bg-red-600 rounded-2xl font-black transition-all">REINTENTAR</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-slate-900 font-sans">
      
      {/* Sidebar Desktop y Mobile Drawer */}
      <aside className={`fixed inset-y-0 left-0 w-72 bg-[#0F172A] text-white z-50 transform transition-transform duration-300 lg:relative lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
        <div className="p-8 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg">
              <Home size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tighter leading-none">LOS AROMOS</h1>
              <p className="text-[10px] text-emerald-400 font-bold uppercase mt-1 tracking-widest">Gestión Total</p>
            </div>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden p-2 text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 p-4 mt-4 space-y-1">
          <NavItem active={activeTab === 'dashboard'} icon={LayoutDashboard} label="Panel Control General" onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }} />
          <NavItem active={activeTab === 'finance'} icon={BarChart3} label="Caja y Finanzas" onClick={() => { setActiveTab('finance'); setIsMobileMenuOpen(false); }} />
          <NavItem active={activeTab === 'maintenance'} icon={Wrench} label="Mantenimiento" onClick={() => { setActiveTab('maintenance'); setIsMobileMenuOpen(false); }} badge={stats.maintenanceCount} />
          <NavItem active={activeTab === 'history'} icon={ClipboardList} label="Historial Huéspedes" onClick={() => { setActiveTab('history'); setIsMobileMenuOpen(false); }} />
        </nav>
        <div className="p-6 border-t border-slate-800">
           <div className="bg-slate-800/40 p-4 rounded-2xl">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Ocupación Actual</p>
              <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
                 <div className="bg-emerald-500 h-full transition-all duration-1000" style={{ width: `${stats.occupancyRate}%` }}></div>
              </div>
              <p className="text-right text-[10px] font-black mt-2 text-emerald-400">{stats.occupancyRate}%</p>
           </div>
        </div>
      </aside>

      {/* Overlay para cerrar menu mobile al hacer clic afuera */}
      {isMobileMenuOpen && <div onClick={() => setIsMobileMenuOpen(false)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden" />}

      {/* Área Principal */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header Responsivo */}
        <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 flex justify-between items-center z-20 shadow-sm">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsMobileMenuOpen(true)} className="lg:hidden p-2 bg-slate-50 rounded-xl text-slate-600">
              <Menu size={20} />
            </button>
            <h2 className="text-sm md:text-xl font-black text-slate-800 tracking-tight uppercase truncate max-w-[150px] md:max-w-none">
              {activeTab === 'dashboard' ? 'Panel de Control' : 
               activeTab === 'finance' ? 'Finanzas' : 
               activeTab === 'history' ? 'Historial' : 'Mantenimiento'}
            </h2>
          </div>
          <div className="flex gap-2">
            {activeTab === 'finance' && (
              <button onClick={() => setShowExpenseModal(true)} className="bg-red-50 text-red-600 p-2 md:px-4 md:py-2 rounded-xl font-black flex items-center gap-2 hover:bg-red-100 transition-all text-xs">
                <TrendingDown size={18} /> <span className="hidden md:inline">Cargar Gasto</span>
              </button>
            )}
            <button 
                onClick={() => setShowAddModal(true)}
                className="bg-emerald-600 text-white p-2 md:px-5 md:py-2.5 rounded-xl font-black flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-lg active:scale-95 text-xs"
            >
                <Plus size={18} /> <span className="hidden md:inline">Nueva Reserva</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
          {activeTab === 'dashboard' && (
            <div className="animate-in fade-in duration-500 space-y-6 md:space-y-10">
              {/* Stats Rápidas (Grid Adaptable) */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 text-slate-900">
                <StatCard label="Libres" value={stats.free} color="text-emerald-600" bg="bg-emerald-50" icon={CheckCircle2} />
                <StatCard label="Ocupados" value={stats.occupied} color="text-blue-600" bg="bg-blue-50" icon={Users} />
                <StatCard label="Tareas" value={stats.maintenanceCount} color="text-amber-600" bg="bg-amber-50" icon={Clock} />
                <StatCard label="Utilidad" value={`$${stats.netProfit}`} color="text-slate-700" bg="bg-white" icon={TrendingUp} />
              </div>

              {/* Agenda del día (Apilada en mobile) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-8">
                 <div className="bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] border border-slate-100 shadow-sm">
                    <h3 className="text-sm md:text-xl font-black mb-4 md:mb-6 uppercase flex items-center gap-2"><ChevronRight size={18} className="text-emerald-500"/> Entradas Hoy ({dailyAgenda.checkins.length})</h3>
                    <div className="space-y-2">
                       {dailyAgenda.checkins.map(r => (
                          <div key={r.id} className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex justify-between items-center">
                             <div className="max-w-[70%]"><p className="font-black text-slate-700 text-sm truncate leading-none">{r.name}</p><p className="text-[9px] font-bold text-emerald-600 mt-1 uppercase">Unidad {r.bungalowId}</p></div>
                             <button onClick={() => sendWhatsApp(r)} className="p-2 bg-white text-emerald-600 rounded-lg shadow-sm active:scale-90"><Phone size={14}/></button>
                          </div>
                       ))}
                       {dailyAgenda.checkins.length === 0 && <p className="text-slate-300 font-bold text-center py-2 text-xs">Sin entradas hoy</p>}
                    </div>
                 </div>
                 <div className="bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] border border-slate-100 shadow-sm">
                    <h3 className="text-sm md:text-xl font-black mb-4 md:mb-6 uppercase flex items-center gap-2"><ChevronRight size={18} className="text-red-500"/> Salidas Hoy ({dailyAgenda.checkouts.length})</h3>
                    <div className="space-y-2">
                       {dailyAgenda.checkouts.map(r => (
                          <div key={r.id} className="p-3 bg-red-50 border border-red-100 rounded-xl flex justify-between items-center">
                             <div className="max-w-[70%]"><p className="font-black text-slate-700 text-sm truncate leading-none">{r.name}</p><p className="text-[9px] font-bold text-red-600 mt-1 uppercase">Unidad {r.bungalowId}</p></div>
                             <button onClick={() => updateStatus(r.bungalowId, 'cleaning')} className="p-2 bg-white text-amber-600 rounded-lg shadow-sm active:scale-90" title="A Limpieza"><Clock size={14}/></button>
                          </div>
                       ))}
                       {dailyAgenda.checkouts.length === 0 && <p className="text-slate-300 font-bold text-center py-2 text-xs">Sin salidas hoy</p>}
                    </div>
                 </div>
              </div>

              {/* Grilla de Cabañas (Responsiva total) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
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

          {activeTab === 'finance' && (
            <div className="max-w-5xl space-y-6 md:space-y-8 animate-in fade-in">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                  <div className="bg-[#0F172A] p-6 md:p-10 rounded-[2rem] md:rounded-[3.5rem] text-white shadow-2xl col-span-1 md:col-span-2 flex justify-between items-center">
                     <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1">Utilidad Neta</p>
                        <h3 className="text-4xl md:text-7xl font-black tracking-tighter text-emerald-400">${stats.netProfit}</h3>
                     </div>
                     <BarChart3 size={48} className="text-slate-800 opacity-50" />
                  </div>
                  <div className="bg-red-500 p-6 md:p-10 rounded-[2rem] md:rounded-[3.5rem] text-white shadow-xl flex flex-col justify-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-red-100 opacity-80 mb-1">Total Gastos</p>
                      <h3 className="text-3xl md:text-5xl font-black tracking-tighter">${stats.totalExpenses}</h3>
                  </div>
               </div>
               
               <div className="bg-white p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] border border-slate-100 shadow-sm">
                  <h3 className="text-sm md:text-xl font-black mb-6 md:mb-8 uppercase">Detalle de Egresos</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                     {expenses.sort((a,b) => new Date(b.date) - new Date(a.date)).map(e => (
                        <div key={e.id} className="p-5 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-start hover:bg-white transition-all">
                           <div className="max-w-[70%]">
                              <p className="font-black text-slate-800 leading-none text-sm truncate">{e.description}</p>
                              <p className="text-[9px] font-black text-slate-400 mt-2 uppercase">{e.category} • {e.date}</p>
                           </div>
                           <div className="flex flex-col items-end gap-1">
                              <span className="font-black text-red-500 text-sm">-${e.amount}</span>
                              <button onClick={() => deleteExpense(e.id)} className="p-1 text-slate-300 hover:text-red-400"><Trash2 size={14}/></button>
                           </div>
                        </div>
                     ))}
                     {expenses.length === 0 && <p className="col-span-full text-center text-slate-300 py-10 font-bold uppercase text-xs">Sin gastos registrados</p>}
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="max-w-5xl space-y-6 md:space-y-8 animate-in">
               <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-[2.5rem] border border-slate-200 shadow-sm flex items-center gap-3 md:gap-4">
                  <Search className="text-slate-400" size={20}/>
                  <input 
                     type="text" 
                     placeholder="Buscar huésped..." 
                     className="flex-1 bg-transparent border-none outline-none font-bold text-sm md:text-lg"
                     value={searchTerm}
                     onChange={(e) => setSearchTerm(e.target.value)}
                  />
               </div>
               <div className="bg-white p-4 md:p-8 rounded-[2rem] md:rounded-[3rem] border border-slate-100 shadow-sm">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                     {reservations
                        .filter(r => r.name.toLowerCase().includes(searchTerm.toLowerCase()))
                        .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
                        .map(r => (
                        <div key={r.id} className="p-5 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center group hover:bg-white hover:shadow-lg transition-all duration-300">
                           <div className="max-w-[65%]">
                              <p className="font-black text-slate-800 text-sm md:text-lg leading-none truncate">{String(r.name)}</p>
                              <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">{r.checkin} • Unidad {r.bungalowId}</p>
                           </div>
                           <div className="flex gap-1 md:gap-2">
                              <button onClick={() => sendWhatsApp(r)} className="p-2 md:p-3 bg-emerald-50 text-emerald-600 rounded-xl active:scale-90 transition-all"><Phone size={16}/></button>
                              <button onClick={() => generatePDF(r)} className="p-2 md:p-3 bg-slate-100 text-slate-600 rounded-xl active:scale-90 transition-all"><FileText size={16}/></button>
                           </div>
                        </div>
                     ))}
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'maintenance' && (
             <div className="max-w-4xl mx-auto bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] border border-slate-200 shadow-sm animate-in">
                <h3 className="text-sm md:text-xl font-black mb-6 uppercase">Pendientes de Mantenimiento</h3>
                <div className="space-y-3">
                  {maintenance.filter(m => m.status === 'pending').map(m => (
                    <div key={m.id} className="p-4 bg-slate-50 rounded-xl md:rounded-2xl border flex items-center justify-between">
                      <div className="flex items-center gap-3 md:gap-4 max-w-[80%]">
                        <span className="w-8 h-8 md:w-10 md:h-10 bg-slate-200 rounded-lg md:rounded-xl flex items-center justify-center font-black text-xs md:text-sm">#{m.bungalowId}</span>
                        <p className="font-bold text-slate-700 text-xs md:text-base leading-tight truncate">{m.task}</p>
                      </div>
                      <button onClick={() => deleteMaintenance(m.id)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={16}/></button>
                    </div>
                  ))}
                  {maintenance.filter(m => m.status === 'pending').length === 0 && (
                    <div className="py-20 text-center flex flex-col items-center opacity-30">
                       <CheckCircle2 size={40} className="mb-4" />
                       <p className="font-black uppercase tracking-widest text-xs">Sin tareas por hoy</p>
                    </div>
                  )}
                </div>
             </div>
          )}
        </div>
      </main>

      {/* MODAL DETALLE BUNGALOW (REDISEÑADO RESPONSIVO) */}
      {showDetailModal && selectedBungalow && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[110] flex items-center justify-center p-0 md:p-4">
          <div className="bg-white rounded-none md:rounded-[4rem] shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col lg:flex-row h-full md:h-[85vh] animate-in zoom-in-95 duration-300">
             {/* Lado Calendario (Referencia Visual Arriba en mobile) */}
             <div className="w-full lg:w-1/2 bg-[#0F172A] p-6 md:p-10 text-white flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800">
                <div className="flex justify-between items-center mb-6 md:mb-10">
                  <h3 className="text-xl md:text-3xl font-black tracking-tight uppercase leading-none truncate pr-4">{String(selectedBungalow.name)}</h3>
                  <div className="flex gap-1 md:gap-2">
                    <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="p-2 md:p-3 bg-slate-800 text-white rounded-xl hover:bg-emerald-500 transition-all"><ChevronLeft size={18}/></button>
                    <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="p-2 md:p-3 bg-slate-800 text-white rounded-xl hover:bg-emerald-500 transition-all rotate-180"><ChevronLeft size={18}/></button>
                  </div>
                </div>
                <div className="grid grid-cols-7 mb-4 text-center">
                  {['D','L','M','M','J','V','S'].map(d => <div key={d} className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase">{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-2 md:gap-3">
                  {(() => {
                    const { firstDay, days, year, month } = getDaysInMonth(currentMonth);
                    const cells = [];
                    for (let i = 0; i < firstDay; i++) cells.push(<div key={`empty-${i}`} />);
                    for (let d = 1; d <= days; d++) {
                      const occupied = isDateOccupied(d, month, year, selectedBungalow.id);
                      cells.push(
                        <div key={d} className={`aspect-square flex items-center justify-center rounded-lg md:rounded-2xl text-[10px] md:text-xs font-bold transition-all ${occupied ? 'bg-red-500 text-white shadow-lg' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10'}`}>
                          {d}
                        </div>
                      );
                    }
                    return cells;
                  })()}
                </div>
                <div className="hidden md:flex mt-auto p-4 bg-slate-800/30 rounded-2xl gap-4 text-[9px] font-black uppercase tracking-widest text-slate-400 justify-center">
                    <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 bg-red-500 rounded-full"></div> Ocupado</div>
                    <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 bg-emerald-500/40 rounded-full"></div> Libre</div>
                </div>
             </div>
             {/* Historial con Scroll */}
             <div className="flex-1 p-6 md:p-12 bg-white relative overflow-y-auto text-slate-900">
                <button onClick={() => setShowDetailModal(false)} className="absolute top-4 right-4 md:top-8 md:right-8 p-3 bg-slate-50 rounded-full hover:bg-slate-200 transition-all z-10"><X size={18}/></button>
                <h3 className="text-xl md:text-3xl font-black mb-6 md:mb-10 tracking-tighter uppercase text-slate-800 border-b-2 border-slate-50 pb-4">Historial</h3>
                <div className="space-y-4">
                  {reservations.filter(r => r.bungalowId === selectedBungalow.id).length > 0 ? (
                    reservations.filter(r => r.bungalowId === selectedBungalow.id).sort((a,b) => new Date(b.checkin) - new Date(a.checkin)).map(r => (
                      <div key={String(r.id)} className="p-5 md:p-8 bg-slate-50 rounded-2xl md:rounded-[2.5rem] border border-slate-100 flex flex-col gap-2 shadow-sm">
                        <div className="flex justify-between items-start">
                           <span className="font-black text-base md:text-xl text-slate-700 leading-tight truncate max-w-[60%]">{String(r.name)}</span>
                           <span className="text-[9px] md:text-[10px] font-black bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full uppercase truncate">{String(r.paymentMethod || 'Efectivo')}</span>
                        </div>
                        <div className="flex justify-between text-[11px] md:text-sm text-slate-500 font-bold mt-2">
                           <span className="flex items-center gap-1 md:gap-2 truncate"><CalendarDays size={12}/> {String(r.checkin)} → {String(r.checkout)}</span>
                           <span className="font-black text-emerald-600 text-base md:text-lg">${String(r.deposit)}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-20 text-center opacity-20">
                       <Package size={40} className="mx-auto mb-4" />
                       <p className="text-[10px] font-black uppercase tracking-widest">Sin registros previos</p>
                    </div>
                  )}
                </div>
             </div>
          </div>
        </div>
      )}

      {/* MODAL NUEVA RESERVA (DISEÑO HIBRIDO: CALENDARIO FIJO + FORMULARIO SCROLL) */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[100] flex items-center justify-center p-0 md:p-4">
          <div className="bg-white rounded-none md:rounded-[4rem] shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col lg:flex-row h-full md:h-[90vh] animate-in zoom-in-95 duration-300">
            {/* Panel Izquierdo: CALENDARIO (Fijo en PC, Encabezado en Mobile) */}
            <div className="w-full lg:w-5/12 bg-[#0F172A] p-6 md:p-10 text-white flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800">
              <div className="flex justify-between items-center mb-6 md:mb-10">
                <h3 className="text-xl md:text-2xl font-black tracking-tight uppercase leading-none">Referencia de<br/><span className="text-emerald-500">Ocupación</span></h3>
                <div className="flex gap-2">
                  <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="p-2 bg-slate-800 rounded-xl hover:bg-emerald-600 transition-all text-white"><ChevronLeft size={18}/></button>
                  <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="p-2 bg-slate-800 rounded-xl hover:bg-emerald-600 transition-all rotate-180 text-white"><ChevronLeft size={18}/></button>
                </div>
              </div>
              <div className="grid grid-cols-7 mb-4 text-center opacity-60">
                {['D','L','M','M','J','V','S'].map(d => <div key={d} className="text-[8px] md:text-[10px] font-black">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-2 md:gap-3">
                {(() => {
                  const { firstDay, days, year, month } = getDaysInMonth(currentMonth);
                  const cells = [];
                  for (let i = 0; i < firstDay; i++) cells.push(<div key={`empty-${i}`} />);
                  for (let d = 1; d <= days; d++) {
                    const occupied = isDateOccupied(d, month, year, newBooking.bungalowId);
                    cells.push(
                      <div key={d} className={`aspect-square flex items-center justify-center rounded-lg md:rounded-2xl text-[10px] md:text-xs font-black transition-all ${occupied ? 'bg-red-500/30 text-red-300 border border-red-500/20 line-through' : 'bg-slate-800/60 text-slate-400'}`}>
                        {d}
                      </div>
                    );
                  }
                  return cells;
                })()}
              </div>
            </div>

            {/* Panel Derecho: FORMULARIO CON SCROLL */}
            <div className="flex-1 p-6 md:p-12 bg-white relative overflow-y-auto text-slate-900 scroll-smooth">
              <button onClick={() => setShowAddModal(false)} className="absolute top-4 right-4 md:top-8 md:right-8 p-3 bg-slate-50 rounded-full hover:bg-slate-200 transition-all z-10"><X size={18}/></button>
              <h3 className="text-2xl md:text-4xl font-black mb-6 md:mb-10 tracking-tighter uppercase text-slate-800 border-b lg:border-b-0 pb-4">Registrar Reserva</h3>
              <form onSubmit={handleAddBooking} className="space-y-6 md:space-y-8">
                {/* Unidad */}
                <div className="space-y-3">
                  <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Seleccionar Cabaña</label>
                  <div className="grid grid-cols-6 md:grid-cols-6 gap-2 md:gap-3">
                    {bungalows.map(b => (
                      <button type="button" key={b.id} onClick={() => setNewBooking({...newBooking, bungalowId: b.id})} className={`h-10 md:h-14 rounded-xl md:rounded-2xl text-[10px] md:text-xs font-black border-2 transition-all ${newBooking.bungalowId === b.id ? 'bg-[#0F172A] border-[#0F172A] text-white shadow-xl scale-105' : 'bg-slate-50 border-slate-50 text-slate-400'}`}>
                        {String(b.id)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Huésped */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                  <div className="space-y-1">
                    <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase ml-1">Huésped</label>
                    <input type="text" required placeholder="Nombre o Familia" className="w-full p-4 md:p-5 bg-slate-50 border border-slate-100 rounded-2xl md:rounded-3xl outline-none focus:ring-4 focus:ring-emerald-500/10 font-bold" value={newBooking.name} onChange={(e) => setNewBooking({...newBooking, name: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase ml-1">WhatsApp</label>
                    <input type="tel" required placeholder="+54 9..." className="w-full p-4 md:p-5 bg-slate-50 border border-slate-100 rounded-2xl md:rounded-3xl outline-none focus:ring-4 focus:ring-emerald-500/10 font-bold" value={newBooking.phone} onChange={(e) => setNewBooking({...newBooking, phone: e.target.value})} />
                  </div>
                </div>

                {/* Fechas */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                  <div className="space-y-1">
                    <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase ml-1">Entrada</label>
                    <input type="date" required className="w-full p-4 md:p-5 bg-slate-50 border border-slate-100 rounded-2xl md:rounded-3xl font-bold" value={newBooking.checkin} onChange={(e) => setNewBooking({...newBooking, checkin: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase ml-1">Salida</label>
                    <input type="date" required className="w-full p-4 md:p-5 bg-slate-50 border border-slate-100 rounded-2xl md:rounded-3xl font-bold" value={newBooking.checkout} onChange={(e) => setNewBooking({...newBooking, checkout: e.target.value})} />
                  </div>
                </div>
                
                {/* Pago */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 bg-slate-50 p-6 md:p-10 rounded-[2rem] md:rounded-[3.5rem] border border-slate-100 shadow-inner">
                    <div className="flex flex-col gap-4 md:gap-6 justify-center">
                        <label className="flex items-center gap-3 cursor-pointer group">
                           <div className="relative">
                                <input type="checkbox" className="peer sr-only" checked={newBooking.isDepositPaid} onChange={(e) => setNewBooking({...newBooking, isDepositPaid: e.target.checked})} />
                                <div className="w-7 h-7 md:w-8 md:h-8 border-2 border-slate-300 rounded-xl bg-white peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-all"></div>
                                <div className="absolute top-1.5 left-2.5 md:top-2 md:left-3 w-2 h-4 border-r-2 border-b-2 border-white rotate-45 opacity-0 peer-checked:opacity-100 transition-all"></div>
                           </div>
                           <span className="text-xs md:text-sm font-black uppercase text-slate-600">¿Paga Seña Ahora?</span>
                        </label>
                        <div className="space-y-2">
                           <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Forma de Pago</label>
                           <div className="flex gap-2">
                                <button type="button" onClick={() => setNewBooking({...newBooking, paymentMethod: 'Efectivo'})} className={`flex-1 py-3 md:py-4 rounded-xl md:rounded-2xl text-[9px] md:text-[10px] font-black flex items-center justify-center gap-2 border-2 transition-all uppercase ${newBooking.paymentMethod === 'Efectivo' ? 'bg-slate-900 border-slate-900 text-white shadow-xl' : 'bg-white border-slate-200 text-slate-400'}`}><Wallet size={14}/> Efectivo</button>
                                <button type="button" onClick={() => setNewBooking({...newBooking, paymentMethod: 'MercadoPago'})} className={`flex-1 py-3 md:py-4 rounded-xl md:rounded-2xl text-[9px] md:text-[10px] font-black flex items-center justify-center gap-2 border-2 transition-all uppercase ${newBooking.paymentMethod === 'MercadoPago' ? 'bg-[#009EE3] border-[#009EE3] text-white shadow-xl' : 'bg-white border-slate-200 text-slate-400'}`}><CreditCard size={14}/> MercadoPago</button>
                           </div>
                        </div>
                    </div>
                    <div className="bg-emerald-50 p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] border border-emerald-100 flex flex-col justify-center">
                        <label className="text-[9px] md:text-[10px] font-black text-emerald-600 uppercase mb-2 block tracking-widest ml-1 leading-none">Monto de Seña ($)</label>
                        <input type="number" required className="bg-transparent border-none outline-none font-black text-emerald-700 text-4xl md:text-6xl w-full" placeholder="0" value={newBooking.deposit} onChange={(e) => setNewBooking({...newBooking, deposit: e.target.value})} />
                    </div>
                </div>
                
                {newBooking.paymentMethod === 'MercadoPago' && (
                  <div className="flex items-center gap-4 p-5 md:p-8 bg-amber-50 border border-amber-200 rounded-[2rem] animate-pulse">
                    <div className="w-10 h-10 md:w-14 md:h-14 bg-amber-500 rounded-full flex items-center justify-center text-white shadow-lg shrink-0"><AlertTriangle size={24} /></div>
                    <p className="text-[10px] md:text-xs font-black text-amber-800 uppercase tracking-tight leading-relaxed">¡Recordatorio: Al cobrar por MercadoPago es obligatorio realizar la factura!</p>
                  </div>
                )}
                
                <button type="submit" disabled={isProcessing} className="w-full py-6 md:py-8 bg-emerald-600 text-white rounded-[2rem] md:rounded-[3rem] font-black text-lg md:text-2xl shadow-2xl active:scale-95 uppercase">{isProcessing ? 'Procesando...' : 'Confirmar Reserva'}</button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL GASTO (Responsivo) */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[120] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-xl p-8 md:p-12 text-slate-900 relative animate-in zoom-in-95 duration-300">
             <button onClick={() => setShowExpenseModal(false)} className="absolute top-6 right-6 p-3 bg-slate-50 rounded-full hover:bg-slate-200 transition-all"><X size={18}/></button>
             <h3 className="text-xl md:text-3xl font-black mb-8 tracking-tighter uppercase flex items-center gap-3"><TrendingDown className="text-red-500"/> Nuevo Egreso</h3>
             <form onSubmit={handleAddExpense} className="space-y-4 md:space-y-6">
                <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase ml-1">Descripción</label><input type="text" required className="w-full p-4 md:p-5 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none" placeholder="Ej: Pago de Luz" value={newExpense.description} onChange={(e) => setNewExpense({...newExpense, description: e.target.value})}/></div>
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase ml-1">Monto ($)</label><input type="number" required className="w-full p-4 md:p-5 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none" value={newExpense.amount} onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})}/></div>
                   <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase ml-1">Fecha</label><input type="date" required className="w-full p-4 md:p-5 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none" value={newExpense.date} onChange={(e) => setNewExpense({...newExpense, date: e.target.value})}/></div>
                </div>
                <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase ml-1">Categoría</label><select className="w-full p-4 md:p-5 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none appearance-none" value={newExpense.category} onChange={(e) => setNewExpense({...newExpense, category: e.target.value})}><option>Servicios</option><option>Mantenimiento</option><option>Limpieza</option><option>Sueldos</option><option>Otros</option></select></div>
                <button type="submit" disabled={isProcessing} className="w-full py-5 bg-red-500 text-white rounded-[2rem] font-black text-lg shadow-xl active:scale-95 uppercase">Guardar Egreso</button>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};

// --- COMPONENTES ATOMICOS ---

const NavItem = ({ icon: Icon, label, active, onClick, badge }) => (
  <button onClick={onClick} className={`w-full flex items-center justify-between px-6 py-4 rounded-xl transition-all ${active ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}>
    <div className="flex items-center gap-4">
      <Icon size={18} />
      <span className="font-bold text-sm tracking-tight">{String(label)}</span>
    </div>
    {badge > 0 && <span className="bg-amber-500 text-[#0F172A] text-[9px] font-black px-2 py-0.5 rounded-md">{String(badge)}</span>}
  </button>
);

const StatCard = ({ icon: Icon, label, value, color, bg }) => (
  <div className={`p-4 md:p-8 rounded-2xl md:rounded-[3.5rem] border border-slate-100 shadow-sm flex items-center gap-3 md:gap-6 ${bg}`}>
    <div className={`w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center ${color} bg-white shadow-sm shrink-0`}><Icon size={24} /></div>
    <div className="truncate">
      <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none truncate">{String(label)}</p>
      <p className={`text-sm md:text-3xl font-black ${color} tracking-tighter mt-1 truncate`}>{String(value)}</p>
    </div>
  </div>
);

const BungalowCard = ({ data, reservation, onStatusChange, onWhatsApp, onPDF, onClick }) => {
  const statusStyles = {
    free: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Libre', dot: 'bg-emerald-500' },
    occupied: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Ocupado', dot: 'bg-blue-500' },
    cleaning: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Limpio?', dot: 'bg-amber-500' }
  };
  const config = statusStyles[data.status] || statusStyles.free;

  return (
    <div onClick={onClick} className="bg-white rounded-[2.5rem] md:rounded-[4rem] border border-slate-100 shadow-sm hover:shadow-2xl transition-all duration-300 group flex flex-col cursor-pointer active:scale-[0.98]">
      <div className="p-6 md:p-10 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-6 md:mb-10">
          <div className={`px-4 py-1.5 rounded-full ${config.bg} ${config.text} text-[9px] font-black uppercase tracking-widest flex items-center gap-2 shadow-sm`}>
            <span className={`w-2 h-2 rounded-full ${config.dot} ${data.status === 'occupied' ? 'animate-pulse' : ''}`}></span>
            {config.label}
          </div>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
            <button onClick={(e) => { e.stopPropagation(); onStatusChange(data.id, 'cleaning'); }} className="p-2 md:p-3 bg-white hover:bg-amber-50 text-amber-600 rounded-xl shadow-sm border border-slate-50"><Clock size={14}/></button>
            <button onClick={(e) => { e.stopPropagation(); onStatusChange(data.id, 'free'); }} className="p-2 md:p-3 bg-white hover:bg-emerald-50 text-emerald-600 rounded-xl shadow-sm border border-slate-50"><CheckCircle2 size={14}/></button>
          </div>
        </div>
        <h3 className="text-2xl md:text-4xl font-black text-slate-800 tracking-tighter mb-2 uppercase leading-none truncate">{String(data.name || data.id)}</h3>
        
        {data.status === 'occupied' && reservation ? (
          <div className="space-y-4 mt-6 animate-in">
            <div className="bg-slate-50 p-4 md:p-7 rounded-2xl md:rounded-[2.5rem] border border-slate-100 shadow-inner">
              <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Huésped</p>
              <p className="text-base md:text-xl font-black text-slate-700 truncate leading-none">{String(reservation.name)}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={(e) => { e.stopPropagation(); onWhatsApp(reservation); }} className="flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-2xl text-[9px] font-black uppercase active:scale-95"><Phone size={12} /> WhatsApp</button>
              <button onClick={(e) => { e.stopPropagation(); onPDF(reservation); }} className="flex items-center justify-center gap-2 py-3 bg-slate-100 text-slate-600 rounded-2xl text-[9px] font-black uppercase active:scale-95"><Download size={12} /> PDF</button>
            </div>
            <div className="flex justify-between items-end pt-4 border-t border-slate-50 text-slate-900 mt-auto">
              <div className="flex flex-col gap-1"><p className="text-[8px] font-black text-slate-400 uppercase leading-none">Salida</p><p className="text-[11px] font-black text-red-500">{String(reservation.checkout)}</p></div>
              <div className="text-right flex flex-col gap-1"><p className="text-[8px] font-black text-slate-400 uppercase leading-none">Seña</p><p className="text-sm font-black text-emerald-600">${String(reservation.deposit)}</p></div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-2xl md:rounded-[3rem] mt-6 bg-slate-50/50 text-slate-200 py-10">
             <Package size={28} className="opacity-50" />
             <p className="text-[9px] font-black uppercase mt-3 tracking-widest opacity-50">Disponible</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
