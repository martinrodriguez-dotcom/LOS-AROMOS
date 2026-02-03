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
  Receipt, CheckSquare, Square, Pencil, UserCircle, PieChart, Star, 
  ArrowUpCircle, ArrowDownCircle
} from 'lucide-react';

// --- LOGO SVG CORPORATIVO ---
const LosAromosLogo = ({ className = "w-10 h-10" }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="100" height="100" rx="24" fill="#10B981" />
    <path d="M30 55V75H45V65H55V75H70V55L50 35L30 55Z" fill="white" />
    <path d="M50 25C55 15 65 15 70 20C75 25 70 35 50 45C30 35 25 25 30 20C35 15 45 15 50 25Z" fill="#064E3B" opacity="0.6" />
    <path d="M50 28C53 22 58 22 61 25C64 28 61 34 50 40C39 34 36 28 39 25C42 22 47 22 50 28Z" fill="white" />
  </svg>
);

// --- CONFIGURACIÓN FIREBASE ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Sanitización para evitar errores de segmentos en rutas de Firestore
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'los-aromos-admin-total';
const appId = rawAppId.replace(/[^a-zA-Z0-9]/g, '_'); 

// --- UTILIDADES ---
const loadJsPDF = () => {
  return new Promise((resolve) => {
    if (window.jspdf) return resolve(window.jspdf);
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.onload = () => resolve(window.jspdf);
    document.head.appendChild(script);
  });
};

const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// Formateador de fechas para visualización DD/MM/AAAA
const formatDateDisplay = (dateStr) => {
  if (!dateStr || typeof dateStr !== 'string') return 'S/D';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Datos
  const [bungalows, setBungalows] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [manualIncomes, setManualIncomes] = useState([]);
  const [cancellations, setCancellations] = useState([]);
  
  // Modales
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showDeleteReasonModal, setShowDeleteReasonModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showStatusListModal, setShowStatusListModal] = useState(null); 
  
  // Selección
  const [selectedBungalow, setSelectedBungalow] = useState(null);
  const [resToDelete, setResToDelete] = useState(null);
  const [resToEdit, setResToEdit] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedBillingDate, setExpandedBillingDate] = useState(null);

  const [newBooking, setNewBooking] = useState({
    bungalowId: "1", name: '', phone: '', dni: '', guests: 1, checkin: '', checkout: '', 
    totalAmount: 0, deposit: 0, isDepositPaid: false, paymentMethod: 'Efectivo', isInvoiced: false
  });

  const [newExpense, setNewExpense] = useState({
    description: '', amount: 0, category: 'Servicios', date: new Date().toISOString().split('T')[0]
  });

  const [newIncome, setNewIncome] = useState({
    description: '', amount: 0, source: 'Efectivo', date: new Date().toISOString().split('T')[0]
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
      } catch (err) { console.error("Auth error", err); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. Sincronización Firestore (Regla 1)
  useEffect(() => {
    if (!user) return;
    
    const unsubB = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'bungalows'), (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (data.length === 0) {
        for(let i=1; i<=12; i++) {
          setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bungalows', i.toString()), { name: `Bungalow ${i.toString().padStart(2, '0')}`, status: 'free' });
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

    const unsubI = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'manual_incomes'), (snap) => {
      setManualIncomes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubC = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'stats_cancellations'), (snap) => {
      setCancellations(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { unsubB(); unsubR(); unsubM(); unsubE(); unsubI(); unsubC(); };
  }, [user]);

  // --- LÓGICA DE NEGOCIO ---

  const stats = useMemo(() => {
    const incomeFromRes = reservations.reduce((acc, r) => acc + (parseFloat(r.deposit) || 0), 0);
    const incomeManual = manualIncomes.reduce((acc, i) => acc + (parseFloat(i.amount) || 0), 0);
    const totalIncome = incomeFromRes + incomeManual;
    const totalExp = expenses.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
    const occupiedCount = bungalows.filter(b => b.status === 'occupied').length;
    
    return {
      occupied: occupiedCount,
      free: bungalows.filter(b => b.status === 'free').length,
      maintenanceCount: maintenance.filter(m => m.status === 'pending').length,
      totalIncome,
      totalExpenses: totalExp,
      netProfit: totalIncome - totalExp,
      occupancyRate: bungalows.length > 0 ? Math.round((occupiedCount / bungalows.length) * 100) : 0,
      incomeFromRes,
      incomeManual
    };
  }, [bungalows, reservations, maintenance, expenses, manualIncomes]);

  const advancedStats = useMemo(() => {
    const bungalowRanking = bungalows.map(b => ({ id: b.id, count: reservations.filter(r => r.bungalowId === b.id).length }))
      .sort((a, b) => b.count - a.count);
    
    const clientMap = {};
    reservations.forEach(r => {
      const key = r.dni || r.name;
      if (!clientMap[key]) clientMap[key] = { name: r.name, dni: r.dni, count: 0 };
      clientMap[key].count += 1;
    });
    const topClients = Object.values(clientMap).sort((a, b) => b.count - a.count).slice(0, 5);
    
    const demandByMonth = new Array(12).fill(0);
    reservations.forEach(r => {
        const d = new Date(r.checkin);
        if(!isNaN(d.getTime())) demandByMonth[d.getMonth()] += 1;
    });
    
    const expenseCategories = {};
    expenses.forEach(e => {
      if (!expenseCategories[e.category]) expenseCategories[e.category] = 0;
      expenseCategories[e.category] += parseFloat(e.amount);
    });

    const bestMonthIdx = demandByMonth.indexOf(Math.max(...demandByMonth));

    return { bungalowRanking, topClients, demandByMonth, bestMonth: monthNames[bestMonthIdx] || "---", expenseCategories };
  }, [bungalows, reservations, expenses]);

  const dailyAgenda = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return {
      checkins: reservations.filter(r => r.checkin === today),
      checkouts: reservations.filter(r => r.checkout === today)
    };
  }, [reservations]);

  const mpBilling = useMemo(() => {
    const filtered = reservations.filter(r => r.paymentMethod === 'MercadoPago');
    const groups = {};
    filtered.forEach(r => {
      const date = r.createdAt?.split('T')[0] || r.checkin;
      if (!groups[date]) groups[date] = [];
      groups[date].push(r);
    });
    
    const totalToInvoice = filtered.reduce((acc, r) => acc + (parseFloat(r.deposit) || 0), 0);
    const totalInvoiced = filtered.filter(r => r.isInvoiced).reduce((acc, r) => acc + (parseFloat(r.deposit) || 0), 0);
    
    return { 
      totalToInvoice, 
      totalInvoiced, 
      pendingCount: filtered.filter(r => !r.isInvoiced).length,
      mpByDay: Object.entries(groups).sort((a, b) => new Date(b[0]) - new Date(a[0]))
    };
  }, [reservations]);

  // --- HANDLERS ACCIONES ---

  const openBungalowDetail = (b) => { 
    setSelectedBungalow(b); 
    setCurrentMonth(new Date()); 
    setShowDetailModal(true); 
  };

  const openAddReservation = () => {
    setCurrentMonth(new Date());
    setShowAddModal(true);
  };

  const handleAddBooking = async (e) => {
    e.preventDefault();
    if (!user || isProcessing) return;
    setIsProcessing(true);
    try {
      const coll = collection(db, 'artifacts', appId, 'public', 'data', 'reservations');
      await addDoc(coll, { ...newBooking, createdAt: new Date().toISOString() });
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bungalows', newBooking.bungalowId.toString()), { status: 'occupied' });
      setShowAddModal(false);
      setNewBooking({ bungalowId: "1", name: '', phone: '', dni: '', guests: 1, checkin: '', checkout: '', totalAmount: 0, deposit: 0, isDepositPaid: false, paymentMethod: 'Efectivo', isInvoiced: false });
    } catch (err) { console.error(err); }
    setIsProcessing(false);
  };

  const handleEditBooking = async (e) => {
    e.preventDefault();
    if (!user || isProcessing || !resToEdit) return;
    setIsProcessing(true);
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'reservations', resToEdit.id), { ...resToEdit });
      setShowEditModal(false);
      setResToEdit(null);
    } catch (err) { console.error(err); }
    setIsProcessing(false);
  };

  const confirmDeleteReservation = async (reason) => {
    if (!user || !resToDelete) return;
    setIsProcessing(true);
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'stats_cancellations'), {
        originalReservation: resToDelete, reason, canceledAt: new Date().toISOString()
      });
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'reservations', resToDelete.id));
      setShowDeleteReasonModal(false);
      setResToDelete(null);
    } catch (err) { console.error(err); }
    setIsProcessing(false);
  };

  const handleAddManualIncome = async (e) => {
    e.preventDefault();
    if (!user || isProcessing) return;
    setIsProcessing(true);
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'manual_incomes'), { 
        ...newIncome, createdAt: new Date().toISOString() 
      });
      setShowIncomeModal(false);
      setNewIncome({ description: '', amount: 0, source: 'Efectivo', date: new Date().toISOString().split('T')[0] });
    } catch (err) { console.error(err); }
    setIsProcessing(false);
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!user || isProcessing) return;
    setIsProcessing(true);
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'expenses'), { 
        ...newExpense, createdAt: new Date().toISOString() 
      });
      setShowExpenseModal(false);
      setNewExpense({ description: '', amount: 0, category: 'Servicios', date: new Date().toISOString().split('T')[0] });
    } catch (err) { console.error(err); }
    setIsProcessing(false);
  };

  const deleteExpense = (id) => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'expenses', id));
  const deleteManualIncome = (id) => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'manual_incomes', id));
  const deleteMaintenance = (id) => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'maintenance', id));
  
  const toggleInvoiced = async (res) => {
    if (!user) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'reservations', res.id), { isInvoiced: !res.isInvoiced });
  };

  const updateBungalowStatus = async (id, status) => {
    if (!user) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bungalows', id.toString()), { status });
  };

  // --- CALENDARIO HELPERS ---
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

  // --- PDF ---
  const generatePDF = async (res) => {
    if (!res) return;
    const { jsPDF } = await loadJsPDF();
    const pdf = new jsPDF();
    const bungalow = bungalows.find(b => b.id === res.bungalowId?.toString());
    
    pdf.setTextColor(245, 245, 245); pdf.setFontSize(60); pdf.text("LOS AROMOS", 40, 210, { angle: 45 });
    pdf.setTextColor(40, 40, 40); pdf.setFontSize(22); pdf.text("LOS AROMOS", 105, 30, { align: 'center' });
    pdf.setFontSize(9); pdf.text("COMPROBANTE DE RESERVA", 105, 38, { align: 'center' });
    pdf.line(20, 45, 190, 45);
    
    pdf.setFontSize(10); pdf.setTextColor(100, 100, 100); pdf.text("HUÉSPED:", 20, 55);
    pdf.setTextColor(0, 0, 0); pdf.setFontSize(12);
    pdf.text(`${res.name} (DNI: ${res.dni || 'S/D'})`, 20, 62);
    
    pdf.setFontSize(10); pdf.setTextColor(100, 100, 100); pdf.text("ESTADÍA (In/Out 11 AM):", 20, 75);
    pdf.setTextColor(0, 0, 0); pdf.setFontSize(12);
    pdf.text(`Bungalow ${bungalow?.id || res.bungalowId}`, 20, 82);
    pdf.text(`Del ${formatDateDisplay(res.checkin)} al ${formatDateDisplay(res.checkout)}`, 20, 89);
    
    pdf.setFillColor(248, 250, 252); pdf.rect(20, 100, 170, 35, 'F');
    pdf.text(`Total Reserva: $${res.totalAmount}`, 30, 112);
    pdf.setFontSize(14); pdf.setTextColor(16, 185, 129);
    pdf.text(`SEÑA RECIBIDA: $${res.deposit}`, 30, 125);
    
    pdf.setFontSize(8); pdf.setTextColor(185, 28, 28);
    pdf.text("IMPORTANTE: IN/OUT 11 AM. DE LO CONTRARIO SE COBRARÁ LA DIFERENCIA.", 105, 150, { align: 'center' });
    
    pdf.save(`Reserva_${res.name}.pdf`);
  };

  const sendWA = (res) => {
    const msg = `Hola ${res.name}! 👋 Confirmamos tu reserva en *Los Aromos* 🌿%0A%0A📍 *Check-in:* ${formatDateDisplay(res.checkin)} (11 AM)%0A📅 *Check-out:* ${formatDateDisplay(res.checkout)} (11 AM)%0A💰 *Seña:* $${res.deposit}`;
    window.open(`https://wa.me/${res.phone.replace(/\D/g,'')}?text=${msg}`, '_blank');
  };

  // --- RENDER UI ---

  if (!user) return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#0F172A] text-white">
      <div className="animate-pulse flex flex-col items-center">
        <LosAromosLogo className="w-20 h-20 mb-8" />
        <h2 className="text-xl font-black uppercase tracking-widest">Los Aromos...</h2>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 w-72 bg-[#0F172A] text-white z-50 transition-transform lg:relative lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
        <div className="p-8 border-b border-slate-800 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <LosAromosLogo className="w-10 h-10 shadow-lg" />
            <div><h1 className="text-lg font-black leading-none text-white">LOS AROMOS</h1><p className="text-[10px] text-emerald-400 font-bold uppercase mt-1">Gestión Total</p></div>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden text-slate-400"><X size={24} /></button>
        </div>
        <nav className="p-4 space-y-1">
          <NavItem active={activeTab === 'dashboard'} icon={LayoutDashboard} label="Cabañas" onClick={() => setActiveTab('dashboard')} />
          <NavItem active={activeTab === 'billing'} icon={Receipt} label="Facturar MP" onClick={() => setActiveTab('billing')} badge={mpBilling.pendingCount} />
          <NavItem active={activeTab === 'finance'} icon={BarChart3} label="Caja y Utilidad" onClick={() => setActiveTab('finance')} />
          <NavItem active={activeTab === 'stats'} icon={PieChart} label="Estadísticas" onClick={() => setActiveTab('stats')} />
          <NavItem active={activeTab === 'maintenance'} icon={Wrench} label="Mantenimiento" onClick={() => setActiveTab('maintenance')} badge={stats.maintenanceCount} />
          <NavItem active={activeTab === 'history'} icon={ClipboardList} label="Buscador" onClick={() => setActiveTab('history')} />
        </nav>
      </aside>

      {/* Main Container */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-white border-b px-6 py-4 flex justify-between items-center z-20 shadow-sm">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsMobileMenuOpen(true)} className="lg:hidden p-2 bg-slate-50 rounded-xl"><Menu size={20}/></button>
            <h2 className="text-sm md:text-xl font-black text-slate-800 uppercase tracking-tight truncate">
                {activeTab === 'dashboard' ? 'Control de Unidades' : 
                 activeTab === 'finance' ? 'Gestión de Caja' : activeTab}
            </h2>
          </div>
          <div className="flex gap-2">
            {(activeTab === 'finance' || activeTab === 'stats') && (
              <>
                <button onClick={() => setShowIncomeModal(true)} className="bg-emerald-50 text-emerald-600 px-3 md:px-4 py-2 rounded-xl font-black flex items-center gap-2 hover:bg-emerald-100 transition-all text-[10px] md:text-xs">
                  <ArrowUpCircle size={16}/> <span className="hidden sm:inline">Ingreso</span>
                </button>
                <button onClick={() => setShowExpenseModal(true)} className="bg-red-50 text-red-600 px-3 md:px-4 py-2 rounded-xl font-black flex items-center gap-2 hover:bg-red-100 transition-all text-[10px] md:text-xs">
                  <ArrowDownCircle size={16}/> <span className="hidden sm:inline">Gasto</span>
                </button>
              </>
            )}
            <button onClick={openAddReservation} className="bg-[#0F172A] text-white px-4 md:px-5 py-2.5 rounded-xl font-black flex items-center gap-2 hover:bg-emerald-700 shadow-lg transition-all text-[10px] md:text-xs">
              <Plus size={18}/> <span>Nueva Reserva</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth text-slate-900">
          
          {/* DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="space-y-10 animate-in">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 text-slate-900">
                <StatCard label="Libres" value={stats.free} color="text-emerald-600" bg="bg-emerald-50" icon={CheckCircle2} onClick={() => setShowStatusListModal('free')} />
                <StatCard label="Ocupados" value={stats.occupied} color="text-blue-600" bg="bg-blue-50" icon={Users} onClick={() => setShowStatusListModal('occupied')} />
                <StatCard label="Mantenimiento" value={stats.maintenanceCount} color="text-amber-600" bg="bg-amber-50" icon={Wrench} />
                <StatCard label="Caja Total" value={`$${stats.netProfit}`} color="text-slate-700" bg="bg-white" icon={Wallet} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 text-slate-900">
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm text-slate-900">
                  <h3 className="text-sm md:text-lg font-black mb-4 uppercase flex items-center gap-2"><ChevronRight size={18} className="text-emerald-500"/> Entradas Hoy</h3>
                  <div className="space-y-2">
                    {dailyAgenda.checkins.map(r => (
                      <div key={r.id} className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex justify-between items-center shadow-sm">
                        <div className="truncate"><p className="font-black text-slate-700 text-sm leading-none">{r.name}</p><p className="text-[9px] font-bold text-emerald-600 uppercase mt-1">Unidad {r.bungalowId}</p></div>
                        <button onClick={() => sendWA(r)} className="p-2 bg-white text-emerald-600 rounded-lg shadow-sm"><Phone size={14}/></button>
                      </div>
                    ))}
                    {dailyAgenda.checkins.length === 0 && <p className="text-slate-300 text-center py-4 text-xs font-bold uppercase">Sin ingresos hoy</p>}
                  </div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm text-slate-900">
                  <h3 className="text-sm md:text-lg font-black mb-4 uppercase flex items-center gap-2"><ChevronRight size={18} className="text-red-500"/> Salidas Hoy</h3>
                  <div className="space-y-2 text-slate-900">
                    {dailyAgenda.checkouts.map(r => (
                      <div key={r.id} className="p-3 bg-red-50 border border-red-100 rounded-xl flex justify-between items-center shadow-sm">
                        <div className="truncate"><p className="font-black text-slate-700 text-sm leading-none">{r.name}</p><p className="text-[9px] font-bold text-red-600 uppercase mt-1">Unidad {r.bungalowId}</p></div>
                        <button onClick={() => updateBungalowStatus(r.bungalowId, 'cleaning')} className="p-2 bg-white text-amber-600 rounded-lg shadow-sm" title="A Limpieza"><Clock size={14}/></button>
                      </div>
                    ))}
                    {dailyAgenda.checkouts.length === 0 && <p className="text-slate-300 text-center py-4 text-xs font-bold uppercase">Sin salidas hoy</p>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {bungalows.map(b => (
                  <BungalowCard 
                    key={b.id} data={b} 
                    reservation={reservations.find(r => r.bungalowId === b.id && b.status === 'occupied')} 
                    onStatusChange={updateBungalowStatus} onWhatsApp={sendWA} onPDF={generatePDF} onClick={() => openBungalowDetail(b)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* CAJA Y UTILIDAD */}
          {activeTab === 'finance' && (
            <div className="max-w-6xl mx-auto space-y-8 animate-in text-slate-900">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[#0F172A] p-10 rounded-[3rem] text-white shadow-2xl col-span-1 md:col-span-2 relative overflow-hidden flex flex-col justify-center">
                  <div className="z-10">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1 leading-none">Utilidad Neta de Caja</p>
                    <h3 className="text-5xl md:text-7xl font-black tracking-tighter text-emerald-400 leading-none">${stats.netProfit}</h3>
                    <p className="mt-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Ingresos ($ {stats.totalIncome}) - Egresos ($ {stats.totalExpenses})</p>
                  </div>
                  <BarChart3 size={120} className="absolute -right-6 -bottom-6 text-slate-800 opacity-20" />
                </div>
                <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col justify-center text-slate-900">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest leading-none text-center">Desglose Ingresos</p>
                  <div className="space-y-4">
                    <div className="flex justify-between border-b border-slate-50 pb-2"><span className="text-xs font-bold text-slate-500">Señas Reservas</span><span className="font-black text-emerald-600 text-sm">${stats.incomeFromRes}</span></div>
                    <div className="flex justify-between border-b border-slate-50 pb-2"><span className="text-xs font-bold text-slate-500">Ingresos Manuales</span><span className="font-black text-emerald-600 text-sm">${stats.incomeManual}</span></div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 text-slate-900">
                <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm text-slate-900">
                  <h3 className="text-lg font-black mb-6 uppercase flex items-center gap-2 text-emerald-600 leading-none"><ArrowUpCircle size={20}/> Ingresos Manuales</h3>
                  <div className="space-y-3">
                    {manualIncomes.sort((a,b) => new Date(b.date) - new Date(a.date)).map(i => (
                      <div key={i.id} className="p-5 bg-emerald-50/40 rounded-2xl border border-emerald-100 flex justify-between items-center shadow-sm">
                        <div className="truncate"><p className="font-black text-slate-800 text-sm leading-none truncate">{i.description}</p><p className="text-[9px] font-bold text-slate-400 uppercase mt-2">{formatDateDisplay(i.date)} • {i.source}</p></div>
                        <div className="flex items-center gap-4">
                           <span className="font-black text-emerald-600 text-lg leading-none">+${i.amount}</span>
                           <button onClick={() => deleteManualIncome(i.id)} className="text-slate-300 hover:text-red-500 transition-all"><Trash2 size={16}/></button>
                        </div>
                      </div>
                    ))}
                    {manualIncomes.length === 0 && <p className="text-center py-10 text-slate-300 font-black uppercase text-xs">Sin registros</p>}
                  </div>
                </div>
                <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm text-slate-900">
                  <h3 className="text-lg font-black mb-6 uppercase flex items-center gap-2 text-red-500 leading-none"><ArrowDownCircle size={20}/> Egresos (Gastos)</h3>
                  <div className="space-y-3">
                    {expenses.sort((a,b) => new Date(b.date) - new Date(a.date)).map(e => (
                      <div key={e.id} className="p-5 bg-red-50/40 rounded-2xl border border-red-100 flex justify-between items-center shadow-sm">
                        <div className="truncate"><p className="font-black text-slate-800 text-sm leading-none truncate">{e.description}</p><p className="text-[9px] font-bold text-slate-400 uppercase mt-2">{formatDateDisplay(e.date)} • {e.category}</p></div>
                        <div className="flex items-center gap-4">
                           <span className="font-black text-red-500 text-lg leading-none">-${e.amount}</span>
                           <button onClick={() => deleteExpense(e.id)} className="text-slate-300 hover:text-red-500 transition-all"><Trash2 size={16}/></button>
                        </div>
                      </div>
                    ))}
                    {expenses.length === 0 && <p className="text-center py-10 text-slate-300 font-black uppercase text-xs">Sin registros</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* RESTO DE SECCIONES (STATS, BILLING, HISTORY, MAINTENANCE) */}
          {activeTab === 'stats' && (
            <div className="max-w-6xl mx-auto space-y-8 animate-in text-slate-900 pb-10">
               <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm col-span-2 text-slate-900">
                     <h3 className="text-xl font-black mb-8 uppercase flex items-center gap-3 text-slate-800 leading-none"><Star className="text-amber-500"/> Bungalows más reservados</h3>
                     <div className="space-y-6">
                        {advancedStats.bungalowRanking.map((item, idx) => (
                           <div key={item.id}>
                              <div className="flex justify-between items-center mb-2 text-slate-900">
                                 <span className="font-black text-slate-700 text-sm uppercase">Cabaña {item.id}</span>
                                 <span className="font-black text-emerald-600 text-sm">{item.count} Reservas</span>
                              </div>
                              <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                                 <div className={`h-full rounded-full transition-all duration-1000 ${idx === 0 ? 'bg-emerald-500' : 'bg-emerald-300'}`} style={{ width: `${(item.count / (advancedStats.bungalowRanking[0].count || 1)) * 100}%` }}></div>
                              </div>
                           </div>
                        ))}
                     </div>
                  </div>
                  <div className="bg-emerald-600 p-8 rounded-[3rem] text-white flex flex-col items-center justify-center text-center shadow-xl">
                     <CalendarDays size={48} className="mb-4 opacity-50" />
                     <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1 leading-none text-white">Mejor Época / Mayor Demanda</p>
                     <h3 className="text-5xl font-black tracking-tighter uppercase mb-4 text-white">{advancedStats.bestMonth}</h3>
                  </div>
               </div>
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-[#0F172A] p-8 rounded-[3rem] text-white shadow-2xl">
                     <h3 className="text-xl font-black mb-6 uppercase flex items-center gap-3 text-white leading-none"><Users className="text-blue-400"/> Top 5 Huéspedes VIP</h3>
                     <div className="space-y-4">
                        {advancedStats.topClients.map((client, idx) => (
                           <div key={idx} className="flex justify-between items-center p-4 bg-slate-800/40 rounded-2xl border border-slate-700/50">
                              <div className="flex items-center gap-4 text-white">
                                 <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center font-black text-white text-lg">#{idx+1}</div>
                                 <div className="text-white text-left"><p className="font-black text-sm uppercase leading-none">{client.name}</p><p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">DNI: {client.dni || 'S/D'}</p></div>
                              </div>
                              <p className="font-black text-blue-400 text-lg leading-none">{client.count} <span className="text-[8px] uppercase text-slate-500">visitas</span></p>
                           </div>
                        ))}
                     </div>
                  </div>
                  <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm text-slate-900">
                     <h3 className="text-xl font-black mb-6 uppercase flex items-center gap-3 text-slate-800 leading-none"><TrendingDown className="text-red-500"/> Gastos por Categoría</h3>
                     <div className="space-y-5">
                        {Object.entries(advancedStats.expenseCategories).sort((a,b) => b[1] - a[1]).map(([cat, amount]) => (
                           <div key={cat} className="p-5 bg-slate-50 rounded-2xl border flex justify-between items-center text-slate-900 shadow-sm">
                              <div><p className="font-black text-slate-800 text-xs uppercase leading-none">{cat}</p><p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest leading-none">Distribución mensual</p></div>
                              <p className="font-black text-red-500 text-lg leading-none">${amount}</p>
                           </div>
                        ))}
                     </div>
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="max-w-5xl mx-auto space-y-8 animate-in text-slate-900">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-[#009EE3] p-10 rounded-[3rem] text-white shadow-xl col-span-2 flex justify-between items-center">
                     <div><p className="text-[10px] font-black uppercase tracking-widest text-blue-100 mb-1 leading-none text-white">A Facturar (MP)</p><h3 className="text-6xl font-black tracking-tighter text-white leading-none">${mpBilling.totalToInvoice}</h3></div>
                     <CreditCard size={64} className="text-white opacity-20" />
                  </div>
                  <div className="bg-emerald-500 p-10 rounded-[3rem] text-white shadow-xl flex flex-col justify-center text-white">
                      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-100 mb-1 leading-none text-white">Ya Facturado</p><h3 className="text-3xl md:text-5xl font-black tracking-tighter text-white leading-none">${mpBilling.totalInvoiced}</h3>
                  </div>
               </div>
               <div className="space-y-4">
                  {mpBilling.mpByDay.map(([date, items]) => (
                    <div key={date} className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden text-slate-900">
                       <button onClick={() => setExpandedBillingDate(expandedBillingDate === date ? null : date)} className="w-full p-6 flex justify-between items-center hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-4 text-slate-900">
                             <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600 leading-none"><CalendarDays size={20}/></div>
                             <div className="text-left text-slate-900"><p className="font-black text-slate-800 text-lg uppercase leading-none leading-none">{formatDateDisplay(date)}</p><p className="text-[10px] font-bold text-slate-400 mt-1 uppercase leading-none">{items.length} reserva(s) • Total: ${items.reduce((acc, r) => acc + parseFloat(r.deposit), 0)}</p></div>
                          </div>
                          <ChevronRight size={24} className={`text-slate-300 transition-transform ${expandedBillingDate === date ? 'rotate-90' : ''}`} />
                       </button>
                       {expandedBillingDate === date && (
                         <div className="p-6 pt-0 border-t border-slate-50 space-y-3">
                            {items.map(r => (
                              <div key={r.id} className={`p-4 rounded-2xl border flex items-center justify-between ${r.isInvoiced ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                                 <div className="flex items-center gap-4">
                                    <button onClick={() => toggleInvoiced(r)} className={r.isInvoiced ? 'text-emerald-600' : 'text-slate-300'}><CheckSquare size={24}/></button>
                                    <div className="text-slate-900 text-left"><p className={`font-black text-sm ${r.isInvoiced ? 'line-through opacity-50' : ''}`}>{r.name}</p><p className="text-[9px] font-bold text-slate-400 uppercase leading-none mt-1">DNI: {r.dni || 'S/D'} • Seña: ${r.deposit}</p></div>
                                 </div>
                                 <button onClick={() => generatePDF(r)} className="p-2 bg-white rounded-xl shadow-sm border border-slate-100 text-slate-400 hover:text-slate-600 leading-none"><Download size={14}/></button>
                              </div>
                            ))}
                         </div>
                       )}
                    </div>
                  ))}
               </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="max-w-5xl mx-auto space-y-6 animate-in text-slate-900">
               <div className="bg-white p-6 rounded-[1.5rem] border border-slate-200 shadow-sm flex items-center gap-4 text-slate-900">
                  <Search className="text-slate-400" size={20}/><input type="text" placeholder="DNI o Nombre..." className="flex-1 bg-transparent border-none outline-none font-bold text-sm md:text-lg text-slate-800" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}/>
               </div>
               <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm text-slate-900">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-slate-900">
                     {reservations.filter(r => r.name.toLowerCase().includes(searchTerm.toLowerCase()) || (r.dni && r.dni.includes(searchTerm))).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).map(r => (
                        <div key={r.id} className="p-5 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center group hover:bg-white hover:shadow-lg transition-all duration-300 text-slate-900 shadow-sm">
                           <div className="max-w-[65%] text-slate-900 text-left"><p className="font-black text-slate-800 text-sm md:text-lg leading-none truncate">{String(r.name)}</p><p className="text-[9px] font-black text-slate-400 uppercase mt-2 leading-none">DNI: {r.dni || 'S/D'} • In: {formatDateDisplay(r.checkin)} • Unidad {r.bungalowId}</p></div>
                           <div className="flex gap-1 text-slate-900"><button onClick={() => sendWA(r)} className="p-2 bg-emerald-50 text-emerald-600 rounded-xl leading-none"><Phone size={16}/></button><button onClick={() => generatePDF(r)} className="p-2 bg-slate-100 text-slate-600 rounded-xl leading-none"><FileText size={16}/></button></div>
                        </div>
                     ))}
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'maintenance' && (
             <div className="max-w-4xl mx-auto bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm animate-in text-slate-900">
                <h3 className="text-sm md:text-xl font-black mb-6 uppercase text-slate-800 leading-none">Mantenimiento Pendiente</h3>
                <div className="space-y-3">
                  {maintenance.filter(m => m.status === 'pending').map(m => (
                    <div key={m.id} className="p-4 bg-slate-50 rounded-xl border flex items-center justify-between text-slate-900 shadow-sm border-slate-100">
                      <div className="flex items-center gap-3 text-slate-900"><span className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center font-black text-xs text-slate-600 leading-none">#{m.bungalowId}</span><p className="font-bold text-slate-700 text-xs md:text-base leading-tight">#{m.task}</p></div>
                      <button onClick={() => deleteMaintenance(m.id)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg leading-none"><Trash2 size={16}/></button>
                    </div>
                  ))}
                </div>
             </div>
          )}

        </div>
      </main>

      {/* --- MODALES --- */}

      {showIncomeModal && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[150] flex items-center justify-center p-4">
           <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-lg p-10 animate-in zoom-in-95 text-slate-900">
              <div className="flex justify-between items-center mb-8">
                 <h3 className="text-2xl font-black uppercase text-slate-800 flex items-center gap-3 leading-none"><ArrowUpCircle className="text-emerald-500"/> Nuevo Ingreso</h3>
                 <button onClick={() => setShowIncomeModal(false)}><X size={24}/></button>
              </div>
              <form onSubmit={handleAddManualIncome} className="space-y-6">
                 <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase leading-none">Concepto</label><input type="text" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold leading-none text-slate-800" value={newIncome.description} onChange={e => setNewIncome({...newIncome, description: e.target.value})} /></div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase leading-none">Monto ($)</label><input type="number" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold leading-none text-slate-800" value={newIncome.amount} onChange={e => setNewIncome({...newIncome, amount: e.target.value})} /></div>
                    <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase leading-none">Fecha</label><input type="date" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold leading-none text-slate-800" value={newIncome.date} onChange={e => setNewIncome({...newIncome, date: e.target.value})} /></div>
                 </div>
                 <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase leading-none">Medio</label>
                    <select className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold leading-none appearance-none text-slate-800" value={newIncome.source} onChange={e => setNewIncome({...newIncome, source: e.target.value})}>
                      <option>Efectivo</option><option>MercadoPago</option><option>Transferencia</option>
                    </select>
                 </div>
                 <button type="submit" className="w-full py-5 bg-emerald-600 text-white rounded-[2rem] font-black text-lg shadow-xl uppercase leading-none">Guardar en Caja</button>
              </form>
           </div>
        </div>
      )}

      {showExpenseModal && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[150] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] md:rounded-[3rem] shadow-2xl w-full max-w-xl p-8 md:p-10 text-slate-900 relative animate-in zoom-in-95 duration-300">
             <button onClick={() => setShowExpenseModal(false)} className="absolute top-6 right-6 p-3 bg-slate-50 rounded-full hover:bg-slate-200 transition-all text-slate-400 leading-none"><X size={18}/></button>
             <h3 className="text-xl font-black mb-8 uppercase flex items-center gap-3 text-red-500 leading-none"><TrendingDown className="text-red-500"/> Nuevo Egreso</h3>
             <form onSubmit={handleAddExpense} className="space-y-4">
                <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase leading-none">Descripción</label><input type="text" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800 leading-none" placeholder="Ej: Pago de Luz" value={newExpense.description} onChange={(e) => setNewExpense({...newExpense, description: e.target.value})}/></div>
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase leading-none">Monto ($)</label><input type="number" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800 leading-none" value={newExpense.amount} onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})}/></div>
                   <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase leading-none">Fecha</label><input type="date" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800 leading-none" value={newExpense.date} onChange={(e) => setNewExpense({...newExpense, date: e.target.value})}/></div>
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-black text-slate-400 uppercase leading-none">Categoría</label>
                   <select className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800 appearance-none leading-none" value={newExpense.category} onChange={(e) => setNewExpense({...newExpense, category: e.target.value})}>
                      <option>Servicios</option><option>Mantenimiento</option><option>Limpieza</option><option>Sueldos</option><option>Otros</option>
                   </select>
                </div>
                <button type="submit" disabled={isProcessing} className="w-full py-5 bg-red-500 text-white rounded-[2rem] font-black text-lg shadow-xl uppercase leading-none">Guardar Egreso</button>
             </form>
          </div>
        </div>
      )}

      {showStatusListModal && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[120] flex items-center justify-center p-4 text-slate-900">
           <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 text-slate-900">
              <div className="p-8 border-b border-slate-100 flex justify-between items-center text-slate-900">
                 <h3 className="text-xl font-black uppercase text-slate-800 leading-none">Bungalows {showStatusListModal === 'free' ? 'Libres' : 'Ocupados'}</h3>
                 <button onClick={() => setShowStatusListModal(null)} className="p-2 bg-slate-50 rounded-full text-slate-400 leading-none"><X size={20}/></button>
              </div>
              <div className="p-8 space-y-2 max-h-[60vh] overflow-y-auto text-slate-900">
                 {bungalows.filter(b => b.status === (showStatusListModal === 'free' ? 'free' : 'occupied')).map(b => (
                   <div key={b.id} onClick={() => { openBungalowDetail(b); setShowStatusListModal(null); }} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between cursor-pointer hover:border-emerald-500 transition-all text-slate-900 shadow-sm">
                      <span className="font-black text-slate-700 uppercase leading-none">Bungalow {b.id}</span>
                      <ChevronRight size={18} className="text-slate-300 leading-none" />
                   </div>
                 ))}
                 {bungalows.filter(b => b.status === (showStatusListModal === 'free' ? 'free' : 'occupied')).length === 0 && <p className="text-center py-10 opacity-30 uppercase font-black text-xs leading-none">Sin unidades en este estado</p>}
              </div>
           </div>
        </div>
      )}

      {showDetailModal && selectedBungalow && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[110] flex items-center justify-center p-4 text-slate-900">
          <div className="bg-white rounded-[2rem] md:rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col md:flex-row h-auto md:h-[65vh] animate-in zoom-in-95 duration-300 text-slate-900">
             <div className="w-full md:w-5/12 bg-[#0F172A] p-6 text-white flex flex-col border-b md:border-b-0 md:border-r border-slate-800 shrink-0 text-white">
                <div className="flex justify-between items-center mb-4 text-white">
                  <h3 className="text-base md:text-xl font-black tracking-tight uppercase leading-none truncate pr-2 text-white">{String(selectedBungalow.name)}</h3>
                  <div className="flex gap-1">
                    <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} className="p-1.5 bg-slate-800 text-white rounded hover:bg-emerald-50 transition-all leading-none"><ChevronLeft size={14}/></button>
                    <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} className="p-1.5 bg-slate-800 text-white rounded hover:bg-emerald-50 transition-all rotate-180"><ChevronLeft size={14}/></button>
                  </div>
                </div>
                <div className="text-center mb-6">
                   <p className="text-xs font-black text-emerald-400 uppercase tracking-widest">{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</p>
                </div>
                <div className="grid grid-cols-7 mb-2 text-center opacity-40 uppercase text-[7px] text-white">
                  {['D','L','M','M','J','V','S'].map(d => <div key={d} className="font-black leading-none">{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {(() => {
                    const { firstDay, days, year, month } = getDaysInMonth(currentMonth);
                    const cells = [];
                    for (let i = 0; i < firstDay; i++) cells.push(<div key={`empty-${i}`} />);
                    for (let d = 1; d <= days; d++) {
                      const occupied = isDateOccupied(d, month, year, selectedBungalow.id);
                      cells.push(<div key={d} className={`aspect-square flex items-center justify-center rounded text-[9px] font-bold transition-all ${occupied ? 'bg-red-500 text-white shadow-sm' : 'bg-emerald-500/10 text-emerald-400'} leading-none`}>{d}</div>);
                    }
                    return cells;
                  })()}
                </div>
             </div>
             <div className="flex-1 p-6 md:p-8 bg-white relative overflow-y-auto text-slate-900">
                <button onClick={() => setShowDetailModal(false)} className="absolute top-4 right-4 p-2 bg-slate-50 rounded-full hover:bg-slate-200 z-10 text-slate-400 leading-none"><X size={18}/></button>
                <h3 className="text-sm md:text-base font-black mb-4 uppercase border-b border-slate-100 pb-2 text-slate-800 leading-none">Historial de Reservas</h3>
                <div className="space-y-3">
                  {reservations.filter(r => r.bungalowId === selectedBungalow.id).length > 0 ? (
                    reservations.filter(r => r.bungalowId === selectedBungalow.id).sort((a,b) => new Date(b.checkin) - new Date(a.checkin)).map(r => (
                      <div key={String(r.id)} className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-slate-900 shadow-sm transition-all text-slate-900">
                        <div className="truncate max-w-[60%] text-left">
                           <span className="font-black text-xs text-slate-700 truncate block leading-none">{String(r.name)}</span>
                           <span className="text-[8px] font-bold text-slate-400 block mt-1">{formatDateDisplay(r.checkin)} → {formatDateDisplay(r.checkout)}</span>
                        </div>
                        <div className="flex gap-1">
                           <button onClick={() => { setResToEdit(r); setShowEditModal(true); }} className="p-2 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 rounded-lg transition-all leading-none"><Pencil size={14}/></button>
                           <button onClick={() => { setResToDelete(r); setShowDeleteReasonModal(true); }} className="p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all leading-none"><Trash2 size={14}/></button>
                        </div>
                      </div>
                    ))
                  ) : (<div className="py-8 text-center opacity-30 font-black uppercase text-[9px] text-slate-400 leading-none">Sin movimientos</div>)}
                </div>
             </div>
          </div>
        </div>
      )}

      {/* MODAL EDITAR RESERVA */}
      {showEditModal && resToEdit && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[150] flex items-center justify-center p-4 text-slate-900">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl p-8 md:p-12 relative animate-in zoom-in-95 duration-300 overflow-y-auto max-h-[90vh] text-slate-900">
             <button onClick={() => setShowEditModal(false)} className="absolute top-6 right-6 p-3 bg-slate-50 rounded-full hover:bg-slate-200 transition-all text-slate-400 leading-none"><X size={18}/></button>
             <h3 className="text-2xl font-black mb-10 tracking-tighter uppercase flex items-center gap-3 text-slate-800 font-black border-b pb-4 leading-none"><Pencil className="text-emerald-500 leading-none"/> Editar Reserva</h3>
             <form onSubmit={handleEditBooking} className="space-y-6">
                <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase leading-none ml-1">Huésped</label><input type="text" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800 leading-none" value={resToEdit.name} onChange={(e) => setResToEdit({...resToEdit, name: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-4 text-slate-800">
                   <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase leading-none ml-1">DNI</label><input type="text" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800 leading-none" value={resToEdit.dni} onChange={(e) => setResToEdit({...resToEdit, dni: e.target.value})} /></div>
                   <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase leading-none ml-1">Total Estadía ($)</label><input type="number" required className="w-full p-4 bg-emerald-50 border border-emerald-100 rounded-2xl font-black text-emerald-800 leading-none" value={resToEdit.totalAmount} onChange={(e) => setResToEdit({...resToEdit, totalAmount: e.target.value})} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase leading-none ml-1 font-bold text-slate-900 leading-none">Check-In</label><input type="date" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800 leading-none" value={resToEdit.checkin} onChange={(e) => setResToEdit({...resToEdit, checkin: e.target.value})} /></div>
                   <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase leading-none ml-1 font-bold text-slate-900 leading-none">Check-Out</label><input type="date" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800 leading-none" value={resToEdit.checkout} onChange={(e) => setResToEdit({...resToEdit, checkout: e.target.value})} /></div>
                </div>
                <div className="space-y-1 text-slate-900"><label className="text-[9px] font-black text-slate-400 uppercase leading-none ml-1 leading-none text-slate-900">Monto Seña entregado ($)</label><input type="number" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800 leading-none" value={resToEdit.deposit} onChange={(e) => setResToEdit({...resToEdit, deposit: e.target.value})} /></div>
                <button type="submit" disabled={isProcessing} className="w-full py-5 bg-[#0F172A] text-white rounded-[2rem] font-black text-lg shadow-xl uppercase mt-4 leading-none">Guardar Cambios</button>
             </form>
          </div>
        </div>
      )}

      {/* MODAL MOTIVO ELIMINACIÓN */}
      {showDeleteReasonModal && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[150] flex items-center justify-center p-4 text-slate-900 text-slate-900">
           <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-md p-10 text-center animate-in zoom-in-95 text-slate-900">
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500 leading-none"><Trash2 size={32}/></div>
              <h3 className="text-xl font-black mb-2 uppercase text-slate-800 leading-none leading-none">Eliminar Reserva</h3>
              <p className="text-slate-500 text-sm mb-8 leading-relaxed leading-none">Indique el motivo antes de borrar a <span className="font-bold text-slate-700 leading-none">{resToDelete?.name}</span>.</p>
              <div className="space-y-3">
                 <button onClick={() => confirmDeleteReservation("Cancelación")} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black hover:bg-red-600 transition-all uppercase text-xs leading-none">Cancelación Definitiva</button>
                 <button onClick={() => confirmDeleteReservation("Cambio de fechas")} className="w-full py-4 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl font-black hover:border-emerald-500 hover:text-emerald-600 transition-all uppercase text-xs leading-none">Cambio de Fechas</button>
                 <button onClick={() => setShowDeleteReasonModal(false)} className="w-full py-2 text-slate-400 font-bold hover:text-slate-600 transition-all text-xs leading-none">Cancelar</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}

// --- ATOMIC COMPONENTS ---

function NavItem({ icon: Icon, label, active, onClick, badge }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center justify-between px-6 py-4 rounded-xl transition-all ${active ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}>
      <div className="flex items-center gap-4 text-left leading-none text-white"><Icon size={18} /><span className="font-bold text-sm tracking-tight leading-none text-white">{label}</span></div>
      {badge > 0 && <span className="bg-amber-500 text-[#0F172A] text-[9px] font-black px-2 py-0.5 rounded-md leading-none">{badge}</span>}
    </button>
  );
}

function StatCard({ label, value, color, bg, icon: Icon, onClick }) {
  return (
    <div onClick={onClick} className={`p-4 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4 ${bg} cursor-pointer active:scale-95 transition-all leading-none`}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color} bg-white shadow-sm shrink-0 leading-none`}><Icon size={24} /></div>
      <div className="truncate text-slate-900 leading-none"><p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none truncate leading-none mb-1">{label}</p><p className={`text-2xl font-black ${color} tracking-tighter truncate leading-none`}>{value}</p></div>
    </div>
  );
}

function BungalowCard({ data, reservation, onStatusChange, onWhatsApp, onPDF, onClick }) {
  const statusStyles = {
    free: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Libre', dot: 'bg-emerald-500' },
    occupied: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Ocupado', dot: 'bg-blue-500' },
    cleaning: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Limpiar', dot: 'bg-amber-500' }
  };
  const config = statusStyles[data.status] || statusStyles.free;
  return (
    <div onClick={onClick} className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-2xl transition-all duration-300 group flex flex-col cursor-pointer active:scale-[0.98] text-slate-900 text-slate-900 leading-none">
      <div className="p-8 flex-1 flex flex-col leading-none">
        <div className="flex justify-between items-start mb-6 text-slate-900 leading-none">
          <div className={`px-4 py-1.5 rounded-full ${config.bg} ${config.text} text-[9px] font-black uppercase flex items-center gap-2 shadow-sm text-slate-900 leading-none`}><span className={`w-2 h-2 rounded-full ${config.dot} ${data.status === 'occupied' ? 'animate-pulse' : ''} leading-none`}></span>{config.label}</div>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 text-slate-900 leading-none"><button onClick={(e) => { e.stopPropagation(); onStatusChange(data.id, 'cleaning'); }} className="p-2 bg-white hover:bg-amber-50 text-amber-600 rounded-xl shadow-sm border border-slate-50 leading-none leading-none"><Clock size={14}/></button><button onClick={(e) => { e.stopPropagation(); onStatusChange(data.id, 'free'); }} className="p-2 bg-white hover:bg-emerald-50 text-emerald-600 rounded-xl shadow-sm border border-slate-50 leading-none leading-none"><CheckCircle2 size={14}/></button></div>
        </div>
        <div className="mb-4 text-slate-900 leading-none">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none mb-1 leading-none">BUNGALOW</p>
          <h3 className="text-4xl font-black text-slate-800 tracking-tighter leading-none leading-none">{String(data.id)}</h3>
        </div>
        {data.status === 'occupied' && reservation ? (
          <div className="mt-4 space-y-3 animate-in text-slate-900 leading-none leading-none">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 shadow-inner text-slate-900 leading-none"><p className="text-[8px] font-black text-slate-400 uppercase mb-1 leading-none leading-none">Huésped</p><p className="text-sm font-black text-slate-700 truncate leading-none leading-none">{String(reservation.name)}</p></div>
            <div className="grid grid-cols-2 gap-2 text-slate-900 leading-none"><button onClick={(e) => { e.stopPropagation(); onWhatsApp(reservation); }} className="flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 text-white rounded-2xl text-[8px] font-black uppercase shadow-lg active:scale-95 transition-all leading-none leading-none leading-none"><Phone size={10} /> WA</button><button onClick={(e) => { e.stopPropagation(); onPDF(reservation); }} className="flex items-center justify-center gap-1.5 py-2.5 bg-slate-100 text-slate-600 rounded-2xl text-[8px] font-black uppercase active:scale-95 shadow-sm transition-all leading-none leading-none leading-none"><Download size={10} /> PDF</button></div>
            <div className="flex justify-between items-end pt-3 border-t border-slate-50 text-slate-900 mt-2 text-slate-900 leading-none"><div className="flex flex-col text-slate-900 leading-none"><p className="text-[7px] font-black text-slate-400 uppercase leading-none leading-none">Salida</p><p className="text-[10px] font-black text-red-500 leading-none leading-none">{formatDateDisplay(reservation.checkout)}</p></div><div className="text-right text-slate-900 leading-none"><p className="text-[7px] font-black text-slate-400 uppercase leading-none leading-none">Seña</p><p className="text-xs font-black text-emerald-600 leading-none leading-none">${String(reservation.deposit)}</p></div></div>
          </div>
        ) : (<div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-2xl mt-4 bg-slate-50/50 text-slate-200 py-10 shadow-inner leading-none leading-none text-slate-900 leading-none"><Package size={24} className="opacity-50" /><p className="text-[8px] font-black uppercase mt-2 tracking-widest opacity-50 text-slate-400 text-center px-4 leading-none leading-none">Disponible</p></div>)}
      </div>
    </div>
  );
}
