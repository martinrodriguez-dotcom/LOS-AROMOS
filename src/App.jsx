import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { 
  getFirestore, collection, doc, onSnapshot, setDoc, addDoc, updateDoc, deleteDoc, query 
} from 'firebase/firestore';
import { 
  LayoutDashboard, CalendarDays, Users, Home, Search, 
  CheckCircle2, Clock, AlertCircle, MoreVertical, ChevronRight, 
  Plus, DollarSign, Info, Send, Download, ChevronLeft, X,
  Wrench, BarChart3, Package, Trash2, FileText, CreditCard, Wallet, 
  AlertTriangle, TrendingUp, TrendingDown, ClipboardList, Phone, Menu, 
  Receipt, CheckSquare, Square, Pencil, UserCircle
} from 'lucide-react';

// --- CONFIGURACIÓN FIREBASE ---
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

// Saneamiento de appId
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
  
  // Datos
  const [bungalows, setBungalows] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [expenses, setExpenses] = useState([]);
  
  // UI Modales
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showDeleteReasonModal, setShowDeleteReasonModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  
  // Selección
  const [selectedBungalow, setSelectedBungalow] = useState(null);
  const [resToDelete, setResToDelete] = useState(null);
  const [resToEdit, setResToEdit] = useState(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedBillingDate, setExpandedBillingDate] = useState(null);

  const [newBooking, setNewBooking] = useState({
    bungalowId: "1", name: '', phone: '', dni: '', guests: 1, checkin: '', checkout: '', deposit: 0, 
    isDepositPaid: false, paymentMethod: 'Efectivo', isInvoiced: false
  });

  const [newExpense, setNewExpense] = useState({
    description: '', amount: 0, category: 'Mantenimiento', date: new Date().toISOString().split('T')[0]
  });

  // 1. Autenticación
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) { setAuthError(err.message); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) { setUser(u); setAuthError(null); }
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

    const unsubR = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'reservations'), (snap) => {
      setReservations(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubM = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'maintenance'), (snap) => {
      setMaintenance(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubE = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'expenses'), (snap) => {
      setExpenses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { unsubB(); unsubR(); unsubM(); unsubE(); };
  }, [user]);

  // Lógica de Negocio
  const todayStr = new Date().toISOString().split('T')[0];
  
  const dailyAgenda = useMemo(() => ({
    checkins: reservations.filter(r => r.checkin === todayStr),
    checkouts: reservations.filter(r => r.checkout === todayStr)
  }), [reservations, todayStr]);

  const mpReservationsByDay = useMemo(() => {
    const filtered = reservations.filter(r => r.paymentMethod === 'MercadoPago');
    const groups = {};
    filtered.forEach(r => {
      const date = r.createdAt?.split('T')[0] || r.checkin;
      if (!groups[date]) groups[date] = [];
      groups[date].push(r);
    });
    return Object.entries(groups).sort((a, b) => new Date(b[0]) - new Date(a[0]));
  }, [reservations]);

  const stats = useMemo(() => {
    const totalIncome = reservations.reduce((acc, r) => acc + (parseFloat(r.deposit) || 0), 0);
    const totalExpenses = expenses.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
    const occupiedCount = bungalows.filter(b => b.status === 'occupied').length;
    return {
      occupied: occupiedCount,
      free: bungalows.filter(b => b.status === 'free').length,
      maintenanceCount: maintenance.filter(m => m.status === 'pending').length,
      totalIncome,
      totalExpenses,
      netProfit: totalIncome - totalExpenses,
      occupancyRate: bungalows.length > 0 ? Math.round((occupiedCount / bungalows.length) * 100) : 0
    };
  }, [bungalows, reservations, maintenance, expenses]);

  const billingStats = useMemo(() => {
    const mpReservations = reservations.filter(r => r.paymentMethod === 'MercadoPago');
    const totalToInvoice = mpReservations.reduce((acc, r) => acc + (parseFloat(r.deposit) || 0), 0);
    const totalInvoiced = mpReservations.filter(r => r.isInvoiced).reduce((acc, r) => acc + (parseFloat(r.deposit) || 0), 0);
    return { totalToInvoice, totalInvoiced, pendingCount: mpReservations.filter(r => !r.isInvoiced).length };
  }, [reservations]);

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

  // Acciones Firebase
  const handleAddBooking = async (e) => {
    e.preventDefault();
    if (!user || isProcessing) return;
    setIsProcessing(true);
    try {
      const rRef = collection(db, 'artifacts', appId, 'public', 'data', 'reservations');
      await addDoc(rRef, { ...newBooking, createdAt: new Date().toISOString() });
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bungalows', newBooking.bungalowId.toString()), { status: 'occupied' });
      setShowAddModal(false);
      setNewBooking({ bungalowId: "1", name: '', phone: '', dni: '', guests: 1, checkin: '', checkout: '', deposit: 0, isDepositPaid: false, paymentMethod: 'Efectivo', isInvoiced: false });
    } catch (err) { console.error(err); }
    setIsProcessing(false);
  };

  const handleEditBooking = async (e) => {
    e.preventDefault();
    if (!user || isProcessing || !resToEdit) return;
    setIsProcessing(true);
    try {
      const rDoc = doc(db, 'artifacts', appId, 'public', 'data', 'reservations', resToEdit.id);
      await updateDoc(rDoc, { ...resToEdit });
      setShowEditModal(false);
      setResToEdit(null);
    } catch (err) { console.error(err); }
    setIsProcessing(false);
  };

  const confirmDeleteReservation = async (reason) => {
    if (!user || !resToDelete) return;
    setIsProcessing(true);
    try {
      // Guardar en estadísticas de cancelación
      const cRef = collection(db, 'artifacts', appId, 'public', 'data', 'stats_cancellations');
      await addDoc(cRef, {
        originalReservation: resToDelete,
        reason: reason, // "Cancelación" o "Cambio de fechas"
        canceledAt: new Date().toISOString()
      });

      // Borrar reserva
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'reservations', resToDelete.id));
      
      // Si la reserva estaba activa hoy, liberar el bungalow (opcional, dependiendo de tu lógica)
      // Por ahora solo borramos el registro.
      
      setShowDeleteReasonModal(false);
      setResToDelete(null);
    } catch (err) { console.error(err); }
    setIsProcessing(false);
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!user || isProcessing) return;
    setIsProcessing(true);
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'expenses'), { ...newExpense, createdAt: new Date().toISOString() });
      setShowExpenseModal(false);
      setNewExpense({ description: '', amount: 0, category: 'Mantenimiento', date: todayStr });
    } catch (err) { console.error(err); }
    setIsProcessing(false);
  };

  const updateStatus = async (id, newStatus) => {
    if (!user) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bungalows', id.toString()), { status: newStatus });
  };

  const deleteMaintenance = async (id) => {
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'maintenance', id));
  };

  const deleteExpense = async (id) => {
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'expenses', id));
  };

  const toggleInvoiced = async (res) => {
    const rDoc = doc(db, 'artifacts', appId, 'public', 'data', 'reservations', res.id);
    await updateDoc(rDoc, { isInvoiced: !res.isInvoiced });
  };

  // Comunicaciones y PDF
  const sendWhatsApp = (res) => {
    if (!res) return;
    const bungalowName = bungalows.find(b => b.id === res.bungalowId?.toString())?.name || res.bungalowId;
    const message = `Hola ${res.name}! 👋 Confirmamos tu reserva en *Los Aromos* 🌿%0A%0A📍 *Unidad:* ${bungalowName}%0A📅 *Entrada:* ${res.checkin}%0A📅 *Salida:* ${res.checkout}%0A💰 *Seña:* $${res.deposit} (${res.paymentMethod})`;
    window.open(`https://wa.me/${String(res.phone || '').replace(/\D/g, '')}?text=${message}`, '_blank');
  };

  const generatePDF = async (res) => {
    if (!res) return;
    const { jsPDF } = await loadJsPDF();
    const pdf = new jsPDF();
    const bungalow = bungalows.find(b => b.id === res.bungalowId?.toString());
    pdf.setTextColor(245, 245, 245);
    pdf.setFontSize(60);
    pdf.text("LOS AROMOS", 40, 210, { angle: 45 });
    pdf.setTextColor(40, 40, 40);
    pdf.setFontSize(22);
    pdf.text("LOS AROMOS", 105, 30, { align: 'center' });
    pdf.setFontSize(9);
    pdf.text("GUALÉGUAYCHÚ, ENTRE RÍOS", 105, 36, { align: 'center' });
    pdf.text("COMPROBANTE DE RESERVA VÁLIDO", 105, 41, { align: 'center' });
    pdf.setDrawColor(220, 220, 220);
    pdf.line(20, 48, 190, 48);
    pdf.setFontSize(10);
    pdf.setTextColor(100, 100, 100);
    pdf.text("INFORMACIÓN DEL HUÉSPED:", 20, 60);
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(12);
    pdf.text(`Nombre: ${String(res.name)}`, 20, 67);
    pdf.text(`DNI: ${String(res.dni || 'N/A')}`, 20, 74);
    pdf.text(`Teléfono: ${String(res.phone)}`, 20, 81);
    pdf.setFontSize(10);
    pdf.setTextColor(100, 100, 100);
    pdf.text("DETALLE DE LA ESTADÍA:", 20, 99);
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(12);
    pdf.text(`Unidad Reservada: ${bungalow?.name || res.bungalowId}`, 20, 106);
    pdf.text(`Check-in: ${String(res.checkin)}`, 20, 113);
    pdf.text(`Check-out: ${String(res.checkout)}`, 20, 120);
    pdf.setFillColor(249, 250, 251);
    pdf.rect(20, 132, 170, 35, 'F');
    pdf.setFontSize(11);
    pdf.text(`Forma de Pago Registrada: ${String(res.paymentMethod)}`, 30, 145);
    pdf.setFontSize(15);
    pdf.text(`MONTO SEÑA RECIBIDA: $${String(res.deposit)}`, 30, 156);
    pdf.setFontSize(10);
    pdf.setTextColor(60, 60, 60);
    pdf.text("¡Muchas gracias por elegir Los Aromos para su descanso!", 105, 192, { align: 'center' });
    pdf.setFontSize(8);
    pdf.setTextColor(140, 140, 140);
    pdf.text("Por favor, conserve este comprobante en su dispositivo móvil como respaldo de su reserva.", 105, 207, { align: 'center' });
    pdf.text("Este documento es válido como garantía oficial de disponibilidad para las fechas seleccionadas.", 105, 212, { align: 'center' });
    pdf.text(`Comprobante generado el: ${new Date().toLocaleString()}`, 105, 232, { align: 'center' });
    pdf.save(`Reserva_Aromos_${String(res.name).replace(/\s/g, '_')}.pdf`);
  };

  const openBungalowDetail = (b) => { setSelectedBungalow(b); setShowDetailModal(true); };

  if (authError || !user) return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#0F172A] text-white p-6 text-center">
      <div className="animate-pulse flex flex-col items-center">
        <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-6"></div>
        <h2 className="text-xl font-black uppercase tracking-widest">Iniciando Los Aromos...</h2>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-slate-900 font-sans">
      
      {/* Sidebar Navigation */}
      <aside className={`fixed inset-y-0 left-0 w-72 bg-[#0F172A] text-white z-50 transform transition-transform duration-300 lg:relative lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
        <div className="p-8 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg"><Home size={20} className="text-white" /></div>
            <div><h1 className="text-lg font-black tracking-tighter leading-none">LOS AROMOS</h1><p className="text-[10px] text-emerald-400 font-bold uppercase mt-1">Gestión Total</p></div>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden p-2 text-slate-400 hover:text-white"><X size={20} /></button>
        </div>
        <nav className="flex-1 p-4 mt-4 space-y-1">
          <NavItem active={activeTab === 'dashboard'} icon={LayoutDashboard} label="Panel Control General" onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }} />
          <NavItem active={activeTab === 'billing'} icon={Receipt} label="Facturación (MP)" onClick={() => { setActiveTab('billing'); setIsMobileMenuOpen(false); }} badge={billingStats.pendingCount > 0 ? billingStats.pendingCount : null} />
          <NavItem active={activeTab === 'finance'} icon={BarChart3} label="Caja y Utilidad" onClick={() => { setActiveTab('finance'); setIsMobileMenuOpen(false); }} />
          <NavItem active={activeTab === 'maintenance'} icon={Wrench} label="Mantenimiento" onClick={() => { setActiveTab('maintenance'); setIsMobileMenuOpen(false); }} badge={stats.maintenanceCount} />
          <NavItem active={activeTab === 'history'} icon={ClipboardList} label="Buscador Huéspedes" onClick={() => { setActiveTab('history'); setIsMobileMenuOpen(false); }} />
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

      {isMobileMenuOpen && <div onClick={() => setIsMobileMenuOpen(false)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden" />}

      {/* Main Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 flex justify-between items-center z-20 shadow-sm">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsMobileMenuOpen(true)} className="lg:hidden p-2 bg-slate-50 rounded-xl text-slate-600"><Menu size={20} /></button>
            <h2 className="text-sm md:text-xl font-black text-slate-800 tracking-tight uppercase truncate">
              {activeTab === 'dashboard' ? 'Panel de Control' : 
               activeTab === 'billing' ? 'Facturación MercadoPago' :
               activeTab === 'finance' ? 'Finanzas' : 
               activeTab === 'history' ? 'Historial' : 'Mantenimiento'}
            </h2>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowAddModal(true)} className="bg-[#0F172A] text-white p-2 md:px-5 md:py-2.5 rounded-xl font-black flex items-center gap-2 hover:bg-emerald-700 shadow-lg text-xs transition-all"><Plus size={18} /><span className="hidden md:inline">Nueva Reserva</span></button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth text-slate-900">
          {activeTab === 'dashboard' && (
            <div className="animate-in fade-in duration-500 space-y-6 md:space-y-10">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
                <StatCard label="Libres" value={stats.free} color="text-emerald-600" bg="bg-emerald-50" icon={CheckCircle2} />
                <StatCard label="Ocupados" value={stats.occupied} color="text-blue-600" bg="bg-blue-50" icon={Users} />
                <StatCard label="Tareas" value={stats.maintenanceCount} color="text-amber-600" bg="bg-amber-50" icon={Clock} />
                <StatCard label="Utilidad Neta" value={`$${stats.netProfit}`} color="text-slate-700" bg="bg-white" icon={TrendingUp} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-8">
                 <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm">
                    <h3 className="text-sm md:text-xl font-black mb-4 uppercase flex items-center gap-2 text-slate-800"><ChevronRight size={18} className="text-emerald-500"/> Entradas Hoy ({dailyAgenda.checkins.length})</h3>
                    <div className="space-y-2">
                       {dailyAgenda.checkins.map(r => (
                          <div key={r.id} className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex justify-between items-center text-slate-900">
                             <div className="truncate"><p className="font-black text-slate-700 text-sm leading-none truncate">{r.name}</p><p className="text-[9px] font-bold text-emerald-600 mt-1 uppercase">Bungalow {r.bungalowId}</p></div>
                             <button onClick={() => sendWhatsApp(r)} className="p-2 bg-white text-emerald-600 rounded-lg shadow-sm"><Phone size={14}/></button>
                          </div>
                       ))}
                       {dailyAgenda.checkins.length === 0 && <p className="text-slate-300 font-bold text-center py-2 text-xs">Sin entradas hoy</p>}
                    </div>
                 </div>
                 <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm">
                    <h3 className="text-sm md:text-xl font-black mb-4 uppercase flex items-center gap-2 text-slate-800"><ChevronRight size={18} className="text-red-500"/> Salidas Hoy ({dailyAgenda.checkouts.length})</h3>
                    <div className="space-y-2">
                       {dailyAgenda.checkouts.map(r => (
                          <div key={r.id} className="p-3 bg-red-50 border border-red-100 rounded-xl flex justify-between items-center text-slate-900">
                             <div className="truncate"><p className="font-black text-slate-700 text-sm leading-none truncate">{r.name}</p><p className="text-[9px] font-bold text-red-600 mt-1 uppercase">Bungalow {r.bungalowId}</p></div>
                             <button onClick={() => updateStatus(r.bungalowId, 'cleaning')} className="p-2 bg-white text-amber-600 rounded-lg shadow-sm" title="A Limpieza"><Clock size={14}/></button>
                          </div>
                       ))}
                       {dailyAgenda.checkouts.length === 0 && <p className="text-slate-300 font-bold text-center py-2 text-xs">Sin salidas hoy</p>}
                    </div>
                 </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                {bungalows.map((b) => (
                  <BungalowCard 
                    key={b.id} data={b} 
                    reservation={reservations.find(r => r.bungalowId?.toString() === b.id && b.status === 'occupied')} 
                    onStatusChange={updateStatus} onWhatsApp={sendWhatsApp} onPDF={generatePDF} onClick={() => openBungalowDetail(b)}
                  />
                ))}
              </div>
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="max-w-5xl space-y-6 md:space-y-8 animate-in text-slate-900">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-[#009EE3] p-6 md:p-10 rounded-[2.5rem] text-white shadow-xl col-span-1 md:col-span-2 flex justify-between items-center">
                     <div><p className="text-[10px] font-black uppercase tracking-widest text-blue-100 mb-1">A Facturar (MP)</p><h3 className="text-4xl md:text-6xl font-black tracking-tighter mt-1">${billingStats.totalToInvoice}</h3></div>
                     <CreditCard size={56} className="text-white opacity-20" />
                  </div>
                  <div className="bg-emerald-500 p-6 md:p-10 rounded-[2.5rem] text-white shadow-xl flex flex-col justify-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-100 mb-1">Ya Facturado</p><h3 className="text-3xl md:text-5xl font-black tracking-tighter mt-1">${billingStats.totalInvoiced}</h3>
                  </div>
               </div>

               <div className="space-y-4">
                  {mpReservationsByDay.map(([date, items]) => (
                    <div key={date} className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden text-slate-900">
                       <button onClick={() => setExpandedBillingDate(expandedBillingDate === date ? null : date)} className="w-full p-6 flex justify-between items-center hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-4">
                             <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600"><CalendarDays size={20}/></div>
                             <div className="text-left"><p className="font-black text-slate-800 text-lg uppercase leading-none">{date}</p><p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">{items.length} reserva(s) • Total: ${items.reduce((acc, r) => acc + parseFloat(r.deposit), 0)}</p></div>
                          </div>
                          <ChevronRight size={24} className={`text-slate-300 transition-transform ${expandedBillingDate === date ? 'rotate-90' : ''}`} />
                       </button>
                       {expandedBillingDate === date && (
                         <div className="p-6 pt-0 border-t border-slate-50 space-y-3">
                            {items.map(r => (
                              <div key={r.id} className={`p-4 rounded-2xl border flex items-center justify-between ${r.isInvoiced ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50'}`}>
                                 <div className="flex items-center gap-4">
                                    <button onClick={() => toggleInvoiced(r)} className={r.isInvoiced ? 'text-emerald-600' : 'text-slate-300'}><CheckSquare size={24}/></button>
                                    <div><p className={`font-black text-sm ${r.isInvoiced ? 'line-through opacity-50' : ''}`}>{r.name}</p><p className="text-[9px] font-bold text-slate-400 uppercase">Unidad {r.bungalowId} • DNI: {r.dni || 'Sin registrar'}</p></div>
                                 </div>
                                 <button onClick={() => generatePDF(r)} className="p-2 bg-white rounded-xl shadow-sm border border-slate-100"><Download size={14}/></button>
                              </div>
                            ))}
                         </div>
                       )}
                    </div>
                  ))}
               </div>
            </div>
          )}

          {activeTab === 'finance' && (
            <div className="max-w-5xl space-y-6 animate-in text-slate-900">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-[#0F172A] p-10 rounded-[2.5rem] text-white shadow-2xl col-span-2 flex justify-between items-center">
                     <div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1 leading-none">Utilidad Neta</p><h3 className="text-4xl md:text-7xl font-black tracking-tighter text-emerald-400 mt-1">${stats.netProfit}</h3></div>
                     <BarChart3 size={48} className="text-slate-800 opacity-50" />
                  </div>
                  <div className="bg-red-500 p-10 rounded-[2.5rem] text-white shadow-xl flex flex-col justify-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-red-100 opacity-80 mb-1 leading-none">Gastos</p><h3 className="text-3xl md:text-5xl font-black tracking-tighter text-white mt-1">${stats.totalExpenses}</h3>
                  </div>
               </div>
               <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm text-slate-900">
                  <h3 className="text-sm md:text-xl font-black mb-6 uppercase">Egresos</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                     {expenses.sort((a,b) => new Date(b.date) - new Date(a.date)).map(e => (
                        <div key={e.id} className="p-5 bg-slate-50 rounded-2xl border flex justify-between items-start text-slate-900">
                           <div className="truncate"><p className="font-black text-slate-800 text-sm truncate leading-none">{e.description}</p><p className="text-[9px] font-black text-slate-400 mt-2 uppercase">{e.category} • {e.date}</p></div>
                           <div className="flex flex-col items-end gap-1"><span className="font-black text-red-500 text-sm">-${e.amount}</span><button onClick={() => deleteExpense(e.id)} className="p-1 text-slate-300 hover:text-red-400"><Trash2 size={14}/></button></div>
                        </div>
                     ))}
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="max-w-5xl space-y-6 animate-in text-slate-900">
               <div className="bg-white p-6 rounded-[1.5rem] border border-slate-200 shadow-sm flex items-center gap-4 text-slate-900">
                  <Search className="text-slate-400" size={20}/><input type="text" placeholder="Buscar por nombre de huésped o DNI..." className="flex-1 bg-transparent border-none outline-none font-bold text-sm md:text-lg text-slate-800" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}/>
               </div>
               <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm text-slate-900">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {reservations.filter(r => r.name.toLowerCase().includes(searchTerm.toLowerCase()) || (r.dni && r.dni.includes(searchTerm))).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).map(r => (
                        <div key={r.id} className="p-5 bg-slate-50 rounded-2xl border flex justify-between items-center group hover:bg-white hover:shadow-lg transition-all duration-300">
                           <div className="max-w-[65%] text-slate-900"><p className="font-black text-slate-800 text-sm md:text-lg leading-none truncate">{String(r.name)}</p><p className="text-[9px] font-black text-slate-400 uppercase mt-2">{r.checkin} • Unidad {r.bungalowId}</p></div>
                           <div className="flex gap-1"><button onClick={() => sendWhatsApp(r)} className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><Phone size={16}/></button><button onClick={() => generatePDF(r)} className="p-2 bg-slate-100 text-slate-600 rounded-xl"><FileText size={16}/></button></div>
                        </div>
                     ))}
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'maintenance' && (
             <div className="max-w-4xl mx-auto bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm animate-in text-slate-900">
                <h3 className="text-sm md:text-xl font-black mb-6 uppercase text-slate-800">Tareas Pendientes</h3>
                <div className="space-y-3">
                  {maintenance.filter(m => m.status === 'pending').map(m => (
                    <div key={m.id} className="p-4 bg-slate-50 rounded-xl border flex items-center justify-between text-slate-900">
                      <div className="flex items-center gap-3"><span className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center font-black text-xs text-slate-600">#{m.bungalowId}</span><p className="font-bold text-slate-700 text-xs md:text-base leading-tight">{m.task}</p></div>
                      <button onClick={() => deleteMaintenance(m.id)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg"><Trash2 size={16}/></button>
                    </div>
                  ))}
                </div>
             </div>
          )}
        </div>
      </main>

      {/* MODAL DETALLE BUNGALOW (REDUCIDO Y ACCIONABLE) */}
      {showDetailModal && selectedBungalow && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[110] flex items-center justify-center p-4 text-slate-900">
          <div className="bg-white rounded-[2rem] md:rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col md:flex-row h-auto md:h-[65vh] animate-in zoom-in-95 duration-300">
             <div className="w-full md:w-5/12 bg-[#0F172A] p-6 text-white flex flex-col border-b md:border-b-0 md:border-r border-slate-800 shrink-0">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg md:text-xl font-black tracking-tight uppercase leading-none truncate pr-2 text-white">{String(selectedBungalow.name)}</h3>
                  <div className="flex gap-1 text-white">
                    <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="p-1.5 bg-slate-800 text-white rounded hover:bg-emerald-500 transition-all"><ChevronLeft size={14}/></button>
                    <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="p-1.5 bg-slate-800 text-white rounded hover:bg-emerald-500 transition-all rotate-180"><ChevronLeft size={14}/></button>
                  </div>
                </div>
                <div className="grid grid-cols-7 mb-2 text-center opacity-40 uppercase">
                  {['D','L','M','M','J','V','S'].map(d => <div key={d} className="text-[7px] font-black">{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {(() => {
                    const { firstDay, days, year, month } = getDaysInMonth(currentMonth);
                    const cells = [];
                    for (let i = 0; i < firstDay; i++) cells.push(<div key={`empty-${i}`} />);
                    for (let d = 1; d <= days; d++) {
                      const occupied = isDateOccupied(d, month, year, selectedBungalow.id);
                      cells.push(<div key={d} className={`aspect-square flex items-center justify-center rounded text-[9px] font-bold transition-all ${occupied ? 'bg-red-500 text-white shadow-sm' : 'bg-emerald-500/10 text-emerald-400'}`}>{d}</div>);
                    }
                    return cells;
                  })()}
                </div>
             </div>
             <div className="flex-1 p-6 md:p-8 bg-white relative overflow-y-auto text-slate-900">
                <button onClick={() => setShowDetailModal(false)} className="absolute top-4 right-4 p-2 bg-slate-50 rounded-full hover:bg-slate-200 z-10 text-slate-400"><X size={18}/></button>
                <h3 className="text-sm md:text-base font-black mb-4 uppercase border-b border-slate-100 pb-2 text-slate-800">Historial de Reservas</h3>
                <div className="space-y-3">
                  {reservations.filter(r => r.bungalowId === selectedBungalow.id).length > 0 ? (
                    reservations.filter(r => r.bungalowId === selectedBungalow.id).sort((a,b) => new Date(b.checkin) - new Date(a.checkin)).map(r => (
                      <div key={String(r.id)} className="p-4 bg-slate-50 rounded-2xl border flex items-center justify-between text-slate-900 shadow-sm hover:shadow-md transition-all">
                        <div className="truncate max-w-[60%]">
                           <span className="font-black text-xs text-slate-700 truncate block leading-none">{String(r.name)}</span>
                           <span className="text-[8px] font-bold text-slate-400 block mt-1">{String(r.checkin)} → {String(r.checkout)}</span>
                        </div>
                        <div className="flex gap-1">
                           <button onClick={() => { setResToEdit(r); setShowEditModal(true); }} className="p-2 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 rounded-lg transition-all"><Pencil size={14}/></button>
                           <button onClick={() => { setResToDelete(r); setShowDeleteReasonModal(true); }} className="p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all"><Trash2 size={14}/></button>
                        </div>
                      </div>
                    ))
                  ) : (<div className="py-8 text-center opacity-30 font-black uppercase text-[9px] text-slate-400">Sin movimientos</div>)}
                </div>
             </div>
          </div>
        </div>
      )}

      {/* MODAL NUEVA RESERVA (CON DNI) */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[100] flex items-center justify-center p-0 md:p-4 text-slate-900">
          <div className="bg-white rounded-none md:rounded-[4rem] shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col lg:flex-row h-full md:h-[90vh] animate-in zoom-in-95 duration-300">
            <div className="w-full lg:w-5/12 bg-[#0F172A] p-6 md:p-10 text-white flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800 shrink-0">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl md:text-2xl font-black uppercase leading-none">Mapa de<br/><span className="text-emerald-500 text-base md:text-xl leading-none">Disponibilidad</span></h3>
                <div className="flex gap-2">
                  <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="p-2 bg-slate-800 rounded-xl hover:bg-emerald-600 transition-all"><ChevronLeft size={18}/></button>
                  <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="p-2 bg-slate-800 rounded-xl hover:bg-emerald-600 transition-all rotate-180"><ChevronLeft size={18}/></button>
                </div>
              </div>
              <div className="grid grid-cols-7 mb-4 text-center opacity-40 uppercase">
                {['D','L','M','M','J','V','S'].map(d => <div key={d} className="text-[8px] md:text-[10px] font-black">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1.5 md:gap-3">
                {(() => {
                  const { firstDay, days, year, month } = getDaysInMonth(currentMonth);
                  const cells = [];
                  for (let i = 0; i < firstDay; i++) cells.push(<div key={`empty-${i}`} />);
                  for (let d = 1; d <= days; d++) {
                    const occupied = isDateOccupied(d, month, year, newBooking.bungalowId);
                    cells.push(<div key={d} className={`aspect-square flex items-center justify-center rounded-lg md:rounded-2xl text-[10px] md:text-xs font-black transition-all ${occupied ? 'bg-red-500/30 text-red-300 border border-red-500/20 line-through' : 'bg-slate-800/60 text-slate-400'}`}>{d}</div>);
                  }
                  return cells;
                })()}
              </div>
            </div>
            <div className="flex-1 p-6 md:p-12 bg-white relative overflow-y-auto">
              <button onClick={() => setShowAddModal(false)} className="absolute top-4 right-4 p-3 bg-slate-50 rounded-full hover:bg-slate-200 z-10 text-slate-400"><X size={18}/></button>
              <h3 className="text-2xl md:text-4xl font-black mb-8 uppercase text-slate-800">Nueva Reserva</h3>
              <form onSubmit={handleAddBooking} className="space-y-6">
                <div className="space-y-3"><label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Unidad</label>
                  <div className="grid grid-cols-6 gap-2">
                    {bungalows.map(b => (
                      <button type="button" key={b.id} onClick={() => setNewBooking({...newBooking, bungalowId: b.id})} className={`h-10 md:h-12 rounded-xl text-[10px] font-black border-2 transition-all ${newBooking.bungalowId === b.id ? 'bg-[#0F172A] border-[#0F172A] text-white shadow-xl scale-105' : 'bg-slate-50 border-slate-50 text-slate-400'}`}>{String(b.id)}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase leading-none ml-1 mb-1">Nombre Huésped</label><input type="text" required placeholder="Ej: Familia González" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-slate-800" value={newBooking.name} onChange={(e) => setNewBooking({...newBooking, name: e.target.value})} /></div>
                  <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase leading-none ml-1 mb-1">DNI / Pasaporte</label><input type="text" placeholder="Para registro legal" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-slate-800" value={newBooking.dni} onChange={(e) => setNewBooking({...newBooking, dni: e.target.value})} /></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase leading-none ml-1 mb-1">WhatsApp</label><input type="tel" required placeholder="+54 9..." className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-slate-800" value={newBooking.phone} onChange={(e) => setNewBooking({...newBooking, phone: e.target.value})} /></div>
                  <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase leading-none ml-1 mb-1">Huéspedes</label><input type="number" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-slate-800" value={newBooking.guests} onChange={(e) => setNewBooking({...newBooking, guests: e.target.value})} /></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase font-bold">Check-In</label><input type="date" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800" value={newBooking.checkin} onChange={(e) => setNewBooking({...newBooking, checkin: e.target.value})} /></div>
                  <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase font-bold">Check-Out</label><input type="date" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800" value={newBooking.checkout} onChange={(e) => setNewBooking({...newBooking, checkout: e.target.value})} /></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-6 md:p-8 rounded-[2.5rem] border border-slate-100 text-slate-900">
                    <div className="flex flex-col gap-4 justify-center">
                        <label className="flex items-center gap-3 cursor-pointer group text-slate-900"><div className="relative"><input type="checkbox" className="peer sr-only" checked={newBooking.isDepositPaid} onChange={(e) => setNewBooking({...newBooking, isDepositPaid: e.target.checked})} /><div className="w-7 h-7 border-2 border-slate-300 rounded-xl bg-white peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-all"></div><div className="absolute top-1.5 left-2.5 w-2 h-4 border-r-2 border-b-2 border-white rotate-45 opacity-0 peer-checked:opacity-100 transition-all"></div></div><span className="text-xs md:text-sm font-black uppercase text-slate-600">Seña paga ahora</span></label>
                        <div className="space-y-2 text-slate-900"><label className="text-[9px] font-black text-slate-400 uppercase leading-none">Forma de Pago</label>
                           <div className="flex gap-2">
                                <button type="button" onClick={() => setNewBooking({...newBooking, paymentMethod: 'Efectivo'})} className={`flex-1 py-3 rounded-xl text-[10px] font-black border-2 transition-all ${newBooking.paymentMethod === 'Efectivo' ? 'bg-slate-900 border-slate-900 text-white shadow-xl' : 'bg-white border-slate-200 text-slate-400'}`}>Efectivo</button>
                                <button type="button" onClick={() => setNewBooking({...newBooking, paymentMethod: 'MercadoPago'})} className={`flex-1 py-3 rounded-xl text-[10px] font-black border-2 transition-all ${newBooking.paymentMethod === 'MercadoPago' ? 'bg-[#009EE3] border-[#009EE3] text-white shadow-xl' : 'bg-white border-slate-200 text-slate-400'}`}>MP</button>
                           </div>
                        </div>
                    </div>
                    <div className="bg-emerald-50 p-6 rounded-[2rem] border border-emerald-100 flex flex-col justify-center text-slate-900">
                        <label className="text-[9px] font-black text-emerald-600 uppercase mb-2 block tracking-widest leading-none">Monto ($)</label>
                        <input type="number" required className="bg-transparent border-none outline-none font-black text-emerald-700 text-4xl md:text-5xl w-full" placeholder="0" value={newBooking.deposit} onChange={(e) => setNewBooking({...newBooking, deposit: e.target.value})} />
                    </div>
                </div>
                <button type="submit" disabled={isProcessing} className="w-full py-6 md:py-8 bg-emerald-600 text-white rounded-[2rem] md:rounded-[3rem] font-black text-lg md:text-2xl shadow-2xl active:scale-95 uppercase">{isProcessing ? 'Guardando...' : 'Confirmar Reserva'}</button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDITAR RESERVA */}
      {showEditModal && resToEdit && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[150] flex items-center justify-center p-4 text-slate-900">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl p-8 md:p-12 relative animate-in zoom-in-95 duration-300 overflow-y-auto max-h-[90vh]">
             <button onClick={() => setShowEditModal(false)} className="absolute top-6 right-6 p-3 bg-slate-50 rounded-full hover:bg-slate-200 transition-all text-slate-400"><X size={18}/></button>
             <h3 className="text-2xl font-black mb-10 tracking-tighter uppercase flex items-center gap-3 text-slate-800"><Pencil className="text-emerald-500"/> Editar Reserva</h3>
             <form onSubmit={handleEditBooking} className="space-y-6">
                <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">Huésped</label><input type="text" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold" value={resToEdit.name} onChange={(e) => setResToEdit({...resToEdit, name: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">DNI</label><input type="text" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold" value={resToEdit.dni} onChange={(e) => setResToEdit({...resToEdit, dni: e.target.value})} /></div>
                   <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">WhatsApp</label><input type="tel" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold" value={resToEdit.phone} onChange={(e) => setResToEdit({...resToEdit, phone: e.target.value})} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">Entrada</label><input type="date" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold" value={resToEdit.checkin} onChange={(e) => setResToEdit({...resToEdit, checkin: e.target.value})} /></div>
                   <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">Salida</label><input type="date" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold" value={resToEdit.checkout} onChange={(e) => setResToEdit({...resToEdit, checkout: e.target.value})} /></div>
                </div>
                <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">Monto Seña ($)</label><input type="number" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold" value={resToEdit.deposit} onChange={(e) => setResToEdit({...resToEdit, deposit: e.target.value})} /></div>
                <button type="submit" disabled={isProcessing} className="w-full py-5 bg-[#0F172A] text-white rounded-[2rem] font-black text-lg shadow-xl uppercase">Guardar Cambios</button>
             </form>
          </div>
        </div>
      )}

      {/* MODAL MOTIVO ELIMINACIÓN (ESTADÍSTICAS) */}
      {showDeleteReasonModal && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[150] flex items-center justify-center p-4 text-slate-900">
           <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-md p-10 text-center animate-in zoom-in-95">
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6"><Trash2 size={32}/></div>
              <h3 className="text-xl font-black mb-2 uppercase text-slate-800">Eliminar Reserva</h3>
              <p className="text-slate-500 text-sm mb-8 leading-relaxed">Indique el motivo para nuestras estadísticas antes de borrar a <span className="font-bold text-slate-700">{resToDelete?.name}</span>.</p>
              <div className="space-y-3">
                 <button onClick={() => confirmDeleteReservation("Cancelación")} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black hover:bg-red-600 transition-all uppercase text-xs">Es una Cancelación Definitiva</button>
                 <button onClick={() => confirmDeleteReservation("Cambio de fechas")} className="w-full py-4 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl font-black hover:border-emerald-500 hover:text-emerald-600 transition-all uppercase text-xs">Es por Cambio de Fechas</button>
                 <button onClick={() => setShowDeleteReasonModal(false)} className="w-full py-2 text-slate-400 font-bold hover:text-slate-600 transition-all text-xs">Cancelar Acción</button>
              </div>
           </div>
        </div>
      )}

      {/* MODAL GASTO */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[120] flex items-center justify-center p-4 text-slate-900">
          <div className="bg-white rounded-[2rem] md:rounded-[3rem] shadow-2xl w-full max-w-xl p-8 text-slate-900 relative animate-in zoom-in-95 duration-300">
             <button onClick={() => setShowExpenseModal(false)} className="absolute top-6 right-6 p-3 bg-slate-50 rounded-full hover:bg-slate-200 transition-all text-slate-400"><X size={18}/></button>
             <h3 className="text-xl font-black mb-8 uppercase flex items-center gap-3 text-slate-800"><TrendingDown className="text-red-500"/> Nuevo Gasto</h3>
             <form onSubmit={handleAddExpense} className="space-y-4">
                <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">Descripción</label><input type="text" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800" placeholder="Ej: Pago de Luz" value={newExpense.description} onChange={(e) => setNewExpense({...newExpense, description: e.target.value})}/></div>
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">Monto ($)</label><input type="number" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800" value={newExpense.amount} onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})}/></div>
                   <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">Fecha</label><input type="date" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800" value={newExpense.date} onChange={(e) => setNewExpense({...newExpense, date: e.target.value})}/></div>
                </div>
                <button type="submit" disabled={isProcessing} className="w-full py-5 bg-red-500 text-white rounded-[2rem] font-black text-lg shadow-xl uppercase">Guardar Egreso</button>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};

// --- COMPONENTES ATOMICOS ---

const NavItem = ({ icon: Icon, label, active, onClick, badge }) => (
  <button onClick={onClick} className={`w-full flex items-center justify-between px-6 py-4 rounded-xl transition-all ${active ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}>
    <div className="flex items-center gap-4"><Icon size={18} /><span className="font-bold text-sm tracking-tight">{String(label)}</span></div>
    {badge && <span className="bg-amber-500 text-[#0F172A] text-[9px] font-black px-2 py-0.5 rounded-md leading-none">{String(badge)}</span>}
  </button>
);

const StatCard = ({ icon: Icon, label, value, color, bg }) => (
  <div className={`p-4 md:p-8 rounded-2xl md:rounded-[3.5rem] border border-slate-100 shadow-sm flex items-center gap-3 md:gap-6 ${bg} shadow-sm shrink-0`}>
    <div className={`w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center ${color} bg-white shadow-sm shrink-0`}><Icon size={24} /></div>
    <div className="truncate"><p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none truncate">{String(label)}</p><p className={`text-sm md:text-3xl font-black ${color} tracking-tighter mt-1 truncate`}>{String(value)}</p></div>
  </div>
);

const BungalowCard = ({ data, reservation, onStatusChange, onWhatsApp, onPDF, onClick }) => {
  const statusStyles = {
    free: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Libre', dot: 'bg-emerald-500' },
    occupied: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Ocupado', dot: 'bg-blue-500' },
    cleaning: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Limpiar', dot: 'bg-amber-500' }
  };
  const config = statusStyles[data.status] || statusStyles.free;
  return (
    <div onClick={onClick} className="bg-white rounded-[2.5rem] md:rounded-[3.5rem] border border-slate-100 shadow-sm hover:shadow-2xl transition-all duration-300 group flex flex-col cursor-pointer active:scale-[0.98] text-slate-900">
      <div className="p-6 md:p-8 flex-1 flex flex-col text-slate-900">
        <div className="flex justify-between items-start mb-6 text-slate-900">
          <div className={`px-4 py-1.5 rounded-full ${config.bg} ${config.text} text-[9px] font-black uppercase flex items-center gap-2 shadow-sm text-slate-900`}><span className={`w-2 h-2 rounded-full ${config.dot} ${data.status === 'occupied' ? 'animate-pulse' : ''}`}></span>{config.label}</div>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2"><button onClick={(e) => { e.stopPropagation(); onStatusChange(data.id, 'cleaning'); }} className="p-2 bg-white hover:bg-amber-50 text-amber-600 rounded-xl shadow-sm border border-slate-50 transition-all"><Clock size={14}/></button><button onClick={(e) => { e.stopPropagation(); onStatusChange(data.id, 'free'); }} className="p-2 bg-white hover:bg-emerald-50 text-emerald-600 rounded-xl shadow-sm border border-slate-50 transition-all"><CheckCircle2 size={14}/></button></div>
        </div>
        <div className="mb-4">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none mb-1">BUNGALOW</p>
          <h3 className="text-4xl md:text-5xl font-black text-slate-800 tracking-tighter leading-none">{String(data.id)}</h3>
        </div>
        {data.status === 'occupied' && reservation ? (
          <div className="space-y-3 mt-4 animate-in text-slate-900">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 shadow-inner"><p className="text-[8px] font-black text-slate-400 uppercase mb-1 leading-none">Huésped</p><p className="text-sm md:text-base font-black text-slate-700 truncate leading-none">{String(reservation.name)}</p></div>
            <div className="grid grid-cols-2 gap-2"><button onClick={(e) => { e.stopPropagation(); onWhatsApp(reservation); }} className="flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 text-white rounded-2xl text-[8px] font-black uppercase shadow-lg active:scale-95 transition-all"><Phone size={10} /> WhatsApp</button><button onClick={(e) => { e.stopPropagation(); onPDF(reservation); }} className="flex items-center justify-center gap-1.5 py-2.5 bg-slate-100 text-slate-600 rounded-2xl text-[8px] font-black uppercase active:scale-95 shadow-sm transition-all"><Download size={10} /> PDF</button></div>
            <div className="flex justify-between items-end pt-3 border-t border-slate-50 text-slate-900 mt-2"><div className="flex flex-col gap-0.5 text-slate-900"><p className="text-[7px] font-black text-slate-400 uppercase leading-none">Salida</p><p className="text-[10px] font-black text-red-500 leading-none">{String(reservation.checkout)}</p></div><div className="text-right flex flex-col gap-0.5 text-slate-900"><p className="text-[7px] font-black text-slate-400 uppercase leading-none">Seña</p><p className="text-xs font-black text-emerald-600 leading-none">${String(reservation.deposit)}</p></div></div>
          </div>
        ) : (<div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-2xl mt-4 bg-slate-50/50 text-slate-200 py-10 shadow-inner"><Package size={24} className="opacity-50" /><p className="text-[8px] font-black uppercase mt-2 tracking-widest opacity-50 text-slate-400 text-center px-4">Disponible para reservar</p></div>)}
      </div>
    </div>
  );
};

export default App;
