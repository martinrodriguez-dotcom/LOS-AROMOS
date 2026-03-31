import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { 
  getFirestore, collection, doc, onSnapshot, setDoc, addDoc, updateDoc, deleteDoc
} from 'firebase/firestore';
import { 
  LayoutDashboard, CalendarDays, Users, Search, 
  CheckCircle2, Clock, AlertCircle, ChevronRight, 
  Plus, DollarSign, Download, ChevronLeft, X,
  Wrench, BarChart3, Package, Trash2, FileText, CreditCard, Wallet, 
  TrendingUp, TrendingDown, ClipboardList, Phone, Menu, 
  Receipt, CheckSquare, Pencil, PieChart, Star, 
  ArrowUpCircle, ArrowDownCircle, Sparkles, Hammer, AlertTriangle
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

// --- CONFIGURACIÓN FIREBASE (Segura con Fallback) ---
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
  } catch (e) {
    return {
      apiKey: "AIzaSyDOeC0me_E0rtDx56ljnihrY8U5JxkCleg",
      authDomain: "los-aromos-4b29b.firebaseapp.com",
      projectId: "los-aromos-4b29b",
      storageBucket: "los-aromos-4b29b.firebasestorage.app",
      messagingSenderId: "969960941827",
      appId: "1:969960941827:web:d2b1863bcd2ee02c026136"
    };
  }
};

const firebaseConfig = getFirebaseConfig();
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Sanitización de ID para evitar errores de segmentos en rutas de Firestore
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

const monthNames = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", 
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

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
  
  // Modales
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
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
  const [blockReason, setBlockReason] = useState(null);

  const [newBooking, setNewBooking] = useState({
    bungalowId: "1", 
    name: '', 
    phone: '', 
    dni: '', 
    guests: 1, 
    checkin: '', 
    checkout: '', 
    totalAmount: 0, 
    deposit: 0, 
    isDepositPaid: false, 
    paymentMethod: 'Efectivo', 
    isInvoiced: false
  });

  const [newMaintenance, setNewMaintenance] = useState({
    bungalowId: "", 
    task: "", 
    type: "Limpieza"
  });

  const [newExpense, setNewExpense] = useState({
    description: '', 
    amount: 0, 
    category: 'Servicios', 
    date: new Date().toISOString().split('T')[0]
  });

  const [newIncome, setNewIncome] = useState({
    description: '', 
    amount: 0, 
    source: 'Efectivo', 
    date: new Date().toISOString().split('T')[0]
  });

  // Autenticación
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Sincronización
  useEffect(() => {
    if (!user) return;
    
    const unsubB = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'bungalows'), (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (data.length === 0) {
        for(let i = 1; i <= 12; i++) {
          setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bungalows', i.toString()), { 
            name: `Bungalow ${i.toString().padStart(2, '0')}`, 
            status: 'free' 
          });
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

    return () => { 
      unsubB(); 
      unsubR(); 
      unsubM(); 
      unsubE(); 
      unsubI(); 
    };
  }, [user]);

  // Lógica Financiera y Stats
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
    const bungalowRanking = bungalows.map(b => ({ 
      id: b.id, 
      count: reservations.filter(r => r.bungalowId === b.id).length 
    })).sort((a, b) => b.count - a.count);
    
    const clientMap = {};
    reservations.forEach(r => {
      const key = r.dni || r.name;
      if (!clientMap[key]) {
        clientMap[key] = { name: r.name, dni: r.dni, count: 0 };
      }
      clientMap[key].count += 1;
    });
    const topClients = Object.values(clientMap).sort((a, b) => b.count - a.count).slice(0, 5);
    
    const demandByMonth = new Array(12).fill(0);
    reservations.forEach(r => {
        const d = new Date(r.checkin);
        if (!isNaN(d.getTime())) {
          demandByMonth[d.getMonth()] += 1;
        }
    });
    const bestMonthIdx = demandByMonth.indexOf(Math.max(...demandByMonth));
    
    const expenseCategories = {};
    expenses.forEach(e => {
      if (!expenseCategories[e.category]) {
        expenseCategories[e.category] = 0;
      }
      expenseCategories[e.category] += parseFloat(e.amount);
    });

    return { 
      bungalowRanking, 
      topClients, 
      demandByMonth, 
      bestMonth: monthNames[bestMonthIdx] || "---", 
      expenseCategories 
    };
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
      if (!groups[date]) {
        groups[date] = [];
      }
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

  // Handlers
  const openBungalowDetail = (b) => { 
    setSelectedBungalow(b); 
    setCurrentMonth(new Date()); 
    setShowDetailModal(true); 
  };

  const openAddReservation = () => { 
    setCurrentMonth(new Date()); 
    setBlockReason(null); 
    setShowAddModal(true); 
  };

  const openMaintenanceForm = (b) => { 
    setNewMaintenance({ bungalowId: b.id, task: "", type: "Limpieza" }); 
    setShowMaintenanceModal(true); 
  };

  const handleAddBooking = async (e) => {
    e.preventDefault();
    if (!user || isProcessing) return;

    // Validación de bloqueo por reparación
    const hasRepair = maintenance.some(m => m.bungalowId === newBooking.bungalowId && m.type === 'Reparación' && m.status === 'pending');
    if (hasRepair) {
        setBlockReason("Bloqueado: La unidad tiene reparaciones pendientes.");
        return;
    }

    setIsProcessing(true);
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'reservations'), { 
        ...newBooking, 
        createdAt: new Date().toISOString() 
      });
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bungalows', newBooking.bungalowId.toString()), { 
        status: 'occupied' 
      });
      setShowAddModal(false);
      setNewBooking({ 
        bungalowId: "1", 
        name: '', 
        phone: '', 
        dni: '', 
        guests: 1, 
        checkin: '', 
        checkout: '', 
        totalAmount: 0, 
        deposit: 0, 
        isDepositPaid: false, 
        paymentMethod: 'Efectivo', 
        isInvoiced: false 
      });
    } catch (err) { 
      console.error(err); 
    }
    setIsProcessing(false);
  };

  const handleAddMaintenance = async (e) => {
    e.preventDefault();
    if (!user || isProcessing) return;
    setIsProcessing(true);
    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'maintenance'), { 
          ...newMaintenance, 
          status: 'pending', 
          createdAt: new Date().toISOString() 
        });
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bungalows', newMaintenance.bungalowId.toString()), { 
          status: 'cleaning' 
        });
        setShowMaintenanceModal(false);
    } catch (err) { 
      console.error(err); 
    }
    setIsProcessing(false);
  };

  const deleteMaintenance = async (id, bId) => {
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'maintenance', id));
    const remaining = maintenance.filter(m => m.bungalowId === bId && m.id !== id);
    if (remaining.length === 0) {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bungalows', bId.toString()), { 
        status: 'free' 
      });
    }
  };

  const handleAddManualIncome = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'manual_incomes'), { 
      ...newIncome, 
      createdAt: new Date().toISOString() 
    });
    setShowIncomeModal(false);
    setNewIncome({ 
      description: '', 
      amount: 0, 
      source: 'Efectivo', 
      date: new Date().toISOString().split('T')[0] 
    });
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'expenses'), { 
      ...newExpense, 
      createdAt: new Date().toISOString() 
    });
    setShowExpenseModal(false);
    setNewExpense({ 
      description: '', 
      amount: 0, 
      category: 'Servicios', 
      date: new Date().toISOString().split('T')[0] 
    });
  };

  const deleteExpense = (id) => {
    deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'expenses', id));
  };

  const deleteManualIncome = (id) => {
    deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'manual_incomes', id));
  };

  const toggleInvoiced = (res) => {
    updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'reservations', res.id), { 
      isInvoiced: !res.isInvoiced 
    });
  };

  const updateBungalowStatus = (id, status) => {
    updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bungalows', id.toString()), { 
      status 
    });
  };

  const handleEditBooking = async (e) => {
    e.preventDefault();
    if (!user || isProcessing || !resToEdit) return;
    setIsProcessing(true);
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'reservations', resToEdit.id), { 
        ...resToEdit 
      });
      setShowEditModal(false);
      setResToEdit(null);
    } catch (err) { 
      console.error(err); 
    }
    setIsProcessing(false);
  };

  const confirmDeleteReservation = async (reason) => {
    if (!user || !resToDelete) return;
    setIsProcessing(true);
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'stats_cancellations'), {
        originalReservation: resToDelete, 
        reason, 
        canceledAt: new Date().toISOString()
      });
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'reservations', resToDelete.id));
      setShowDeleteReasonModal(false);
      setResToDelete(null);
    } catch (err) { 
      console.error(err); 
    }
    setIsProcessing(false);
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
    
    // Marca de Agua
    pdf.setTextColor(245, 245, 245); 
    pdf.setFontSize(60); 
    pdf.text("LOS AROMOS", 40, 210, { angle: 45 });
    
    // Cabecera
    pdf.setTextColor(40, 40, 40); 
    pdf.setFontSize(22); 
    pdf.text("LOS AROMOS", 105, 30, { align: 'center' });
    pdf.setFontSize(9); 
    pdf.text("COMPROBANTE DE RESERVA", 105, 38, { align: 'center' });
    pdf.line(20, 45, 190, 45);
    
    // Info del Huésped
    pdf.setFontSize(10); 
    pdf.setTextColor(100, 100, 100); 
    pdf.text("HUÉSPED:", 20, 55);
    pdf.setTextColor(0, 0, 0); 
    pdf.setFontSize(12);
    pdf.text(`${res.name} (DNI: ${res.dni || 'S/D'})`, 20, 62);
    
    // Detalle Estadía
    pdf.setFontSize(10); 
    pdf.setTextColor(100, 100, 100); 
    pdf.text("ESTADÍA (In/Out 11 AM):", 20, 75);
    pdf.setTextColor(0, 0, 0); 
    pdf.setFontSize(12);
    pdf.text(`Bungalow ${bungalow?.id || res.bungalowId}`, 20, 82);
    pdf.text(`Del ${formatDateDisplay(res.checkin)} al ${formatDateDisplay(res.checkout)}`, 20, 89);
    
    // Pago
    pdf.setFillColor(248, 250, 252); 
    pdf.rect(20, 100, 170, 35, 'F');
    pdf.text(`Total Reserva: $${res.totalAmount}`, 30, 112);
    pdf.setFontSize(14); 
    pdf.setTextColor(16, 185, 129);
    pdf.text(`SEÑA RECIBIDA: $${res.deposit}`, 30, 125);
    
    // Pie de página
    pdf.setFontSize(8); 
    pdf.setTextColor(185, 28, 28);
    pdf.text("IMPORTANTE: IN/OUT 11 AM. DE LO CONTRARIO SE COBRARÁ LA DIFERENCIA.", 105, 150, { align: 'center' });
    
    pdf.save(`Reserva_${res.name}.pdf`);
  };

  const sendWA = (res) => {
    const msg = `Hola ${res.name}! 👋 Confirmamos tu reserva en *Los Aromos* 🌿%0A%0A📍 *Check-in:* ${formatDateDisplay(res.checkin)} (11 AM)%0A📅 *Check-out:* ${formatDateDisplay(res.checkout)} (11 AM)%0A💰 *Seña:* $${res.deposit}`;
    window.open(`https://wa.me/${res.phone.replace(/\D/g,'')}?text=${msg}`, '_blank');
  };

  // Render Loading
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
      
      {/* --- SIDEBAR --- */}
      <aside className={`fixed inset-y-0 left-0 w-72 bg-[#0F172A] text-white z-50 transition-transform lg:relative lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
        <div className="p-8 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LosAromosLogo className="w-10 h-10 shadow-lg" />
            <div>
              <h1 className="text-lg font-black leading-none">LOS AROMOS</h1>
              <p className="text-[10px] text-emerald-400 font-bold uppercase mt-1">Gestión Total</p>
            </div>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden text-slate-400">
            <X size={24} />
          </button>
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

      {/* --- MAIN CONTAINER --- */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        
        {/* HEADER */}
        <header className="bg-white border-b px-6 py-4 flex justify-between items-center z-20 shadow-sm">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsMobileMenuOpen(true)} className="lg:hidden p-2 bg-slate-50 rounded-xl">
              <Menu size={20} />
            </button>
            <h2 className="text-sm md:text-xl font-black text-slate-800 uppercase tracking-tight truncate">
                {activeTab === 'dashboard' ? 'Control de Cabañas' : 
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

        {/* CONTENT AREA */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
          
          {/* TAB: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="space-y-10 animate-in">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                <StatCard label="Libres" value={stats.free} color="text-emerald-600" bg="bg-emerald-50" icon={CheckCircle2} onClick={() => setShowStatusListModal('free')} />
                <StatCard label="Ocupados" value={stats.occupied} color="text-blue-600" bg="bg-blue-50" icon={Users} onClick={() => setShowStatusListModal('occupied')} />
                <StatCard label="Tareas" value={stats.maintenanceCount} color="text-amber-600" bg="bg-amber-50" icon={Wrench} onClick={() => setActiveTab('maintenance')} />
                <StatCard label="Caja Total" value={`$${stats.netProfit}`} color="text-slate-700" bg="bg-white" icon={Wallet} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                  <h3 className="text-sm md:text-lg font-black mb-4 uppercase flex items-center gap-2">
                    <ChevronRight size={18} className="text-emerald-500"/> Entradas Hoy
                  </h3>
                  <div className="space-y-2">
                    {dailyAgenda.checkins.map(r => (
                      <div key={r.id} className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex justify-between items-center shadow-sm">
                        <div className="truncate text-left">
                          <p className="font-black text-slate-700 text-sm leading-none">{r.name}</p>
                          <p className="text-[9px] font-bold text-emerald-600 uppercase mt-1">Unidad {r.bungalowId}</p>
                        </div>
                        <button onClick={() => sendWA(r)} className="p-2 bg-white text-emerald-600 rounded-lg shadow-sm">
                          <Phone size={14}/>
                        </button>
                      </div>
                    ))}
                    {dailyAgenda.checkins.length === 0 && <p className="text-slate-300 text-center py-4 text-xs font-bold uppercase">Sin ingresos hoy</p>}
                  </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                  <h3 className="text-sm md:text-lg font-black mb-4 uppercase flex items-center gap-2">
                    <ChevronRight size={18} className="text-red-500"/> Salidas Hoy
                  </h3>
                  <div className="space-y-2">
                    {dailyAgenda.checkouts.map(r => (
                      <div key={r.id} className="p-3 bg-red-50 border border-red-100 rounded-xl flex justify-between items-center shadow-sm">
                        <div className="truncate text-left">
                          <p className="font-black text-slate-700 text-sm leading-none">{r.name}</p>
                          <p className="text-[9px] font-bold text-red-600 uppercase mt-1">Unidad {r.bungalowId}</p>
                        </div>
                        <button onClick={() => openMaintenanceForm({ id: r.bungalowId })} className="p-2 bg-white text-amber-600 rounded-lg shadow-sm" title="A Mantenimiento">
                          <Wrench size={14}/>
                        </button>
                      </div>
                    ))}
                    {dailyAgenda.checkouts.length === 0 && <p className="text-slate-300 text-center py-4 text-xs font-bold uppercase">Sin salidas hoy</p>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {bungalows.map(b => (
                  <BungalowCard 
                    key={b.id} 
                    data={b} 
                    res={reservations.find(r => r.bungalowId === b.id && b.status === 'occupied')} 
                    onStatusChange={() => openMaintenanceForm(b)} 
                    onWhatsApp={sendWA} 
                    onPDF={generatePDF} 
                    onClick={() => openBungalowDetail(b)} 
                  />
                ))}
              </div>
            </div>
          )}

          {/* TAB: FINANCE */}
          {activeTab === 'finance' && (
            <div className="max-w-6xl mx-auto space-y-8 animate-in">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[#0F172A] p-10 rounded-[3rem] text-white shadow-2xl col-span-1 md:col-span-2 relative overflow-hidden flex flex-col justify-center">
                  <div className="z-10">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1 leading-none">Utilidad Neta de Caja</p>
                    <h3 className="text-5xl md:text-7xl font-black tracking-tighter text-emerald-400 leading-none">${stats.netProfit}</h3>
                    <p className="mt-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                      Ingresos ($ {stats.totalIncome}) - Egresos ($ {stats.totalExpenses})
                    </p>
                  </div>
                  <BarChart3 size={120} className="absolute -right-6 -bottom-6 text-slate-800 opacity-20" />
                </div>
                <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col justify-center">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest leading-none text-center">Desglose Ingresos</p>
                  <div className="space-y-4">
                    <div className="flex justify-between border-b border-slate-50 pb-2">
                      <span className="text-xs font-bold text-slate-500">Señas Reservas</span>
                      <span className="font-black text-emerald-600 text-sm">${stats.incomeFromRes}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-50 pb-2">
                      <span className="text-xs font-bold text-slate-500">Ingresos Manuales</span>
                      <span className="font-black text-emerald-600 text-sm">${stats.incomeManual}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm">
                  <h3 className="text-lg font-black mb-6 uppercase flex items-center gap-2 text-emerald-600 leading-none">
                    <ArrowUpCircle size={20}/> Ingresos Manuales
                  </h3>
                  <div className="space-y-3">
                    {manualIncomes.sort((a,b) => new Date(b.date) - new Date(a.date)).map(i => (
                      <div key={i.id} className="p-5 bg-emerald-50/40 rounded-2xl border border-emerald-100 flex justify-between items-center shadow-sm">
                        <div className="truncate text-left">
                          <p className="font-black text-slate-800 text-sm leading-none truncate">{i.description}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase mt-2">{formatDateDisplay(i.date)} • {i.source}</p>
                        </div>
                        <div className="flex items-center gap-4">
                           <span className="font-black text-emerald-600 text-lg leading-none">+${i.amount}</span>
                           <button onClick={() => deleteManualIncome(i.id)} className="text-slate-300 hover:text-red-500 transition-all">
                             <Trash2 size={16}/>
                           </button>
                        </div>
                      </div>
                    ))}
                    {manualIncomes.length === 0 && <p className="text-center py-10 text-slate-300 font-black uppercase text-xs">Sin registros</p>}
                  </div>
                </div>

                <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm">
                  <h3 className="text-lg font-black mb-6 uppercase flex items-center gap-2 text-red-500 leading-none">
                    <ArrowDownCircle size={20}/> Egresos (Gastos)
                  </h3>
                  <div className="space-y-3">
                    {expenses.sort((a,b) => new Date(b.date) - new Date(a.date)).map(e => (
                      <div key={e.id} className="p-5 bg-red-50/40 rounded-2xl border border-red-100 flex justify-between items-center shadow-sm">
                        <div className="truncate text-left">
                          <p className="font-black text-slate-800 text-sm leading-none truncate">{e.description}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase mt-2">{formatDateDisplay(e.date)} • {e.category}</p>
                        </div>
                        <div className="flex items-center gap-4">
                           <span className="font-black text-red-500 text-lg leading-none">-${e.amount}</span>
                           <button onClick={() => deleteExpense(e.id)} className="text-slate-300 hover:text-red-500 transition-all">
                             <Trash2 size={16}/>
                           </button>
                        </div>
                      </div>
                    ))}
                    {expenses.length === 0 && <p className="text-center py-10 text-slate-300 font-black uppercase text-xs">Sin registros</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: STATS */}
          {activeTab === 'stats' && (
            <div className="max-w-6xl mx-auto space-y-8 animate-in pb-10">
               <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm col-span-2">
                     <h3 className="text-xl font-black mb-8 uppercase flex items-center gap-3 text-slate-800 leading-none">
                       <Star className="text-amber-500"/> Bungalows más reservados
                     </h3>
                     <div className="space-y-6">
                        {advancedStats.bungalowRanking.map((item, idx) => (
                           <div key={item.id}>
                              <div className="flex justify-between items-center mb-2">
                                 <span className="font-black text-slate-700 text-sm uppercase">Cabaña {item.id}</span>
                                 <span className="font-black text-emerald-600 text-sm">{item.count} Reservas</span>
                              </div>
                              <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                                 <div 
                                   className={`h-full rounded-full transition-all duration-1000 ${idx === 0 ? 'bg-emerald-500' : 'bg-emerald-300'}`} 
                                   style={{ width: `${(item.count / (advancedStats.bungalowRanking[0].count || 1)) * 100}%` }}>
                                 </div>
                              </div>
                           </div>
                        ))}
                     </div>
                  </div>
                  <div className="bg-emerald-600 p-8 rounded-[3rem] text-white flex flex-col items-center justify-center text-center shadow-xl">
                     <CalendarDays size={48} className="mb-4 opacity-50" />
                     <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1 leading-none">Mejor Época / Mayor Demanda</p>
                     <h3 className="text-5xl font-black tracking-tighter uppercase mb-4">{advancedStats.bestMonth}</h3>
                  </div>
               </div>

               <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-[#0F172A] p-8 rounded-[3rem] text-white shadow-2xl text-left">
                     <h3 className="text-xl font-black mb-6 uppercase flex items-center gap-3 leading-none">
                       <Users className="text-blue-400"/> Top 5 Huéspedes VIP
                     </h3>
                     <div className="space-y-4">
                        {advancedStats.topClients.map((client, idx) => (
                           <div key={idx} className="flex justify-between items-center p-4 bg-slate-800/40 rounded-2xl border border-slate-700/50">
                              <div className="flex items-center gap-4">
                                 <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center font-black text-lg leading-none">#{idx+1}</div>
                                 <div className="text-left">
                                   <p className="font-black text-sm uppercase leading-none">{client.name}</p>
                                   <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase leading-none">DNI: {client.dni || 'S/D'}</p>
                                 </div>
                              </div>
                              <p className="font-black text-blue-400 text-lg leading-none">
                                {client.count} <span className="text-[8px] uppercase text-slate-500">visitas</span>
                              </p>
                           </div>
                        ))}
                     </div>
                  </div>
                  
                  <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm text-left">
                     <h3 className="text-xl font-black mb-6 uppercase flex items-center gap-3 text-slate-800 leading-none">
                       <TrendingDown className="text-red-500"/> Gastos por Categoría
                     </h3>
                     <div className="space-y-5">
                        {Object.entries(advancedStats.expenseCategories).sort((a,b) => b[1] - a[1]).map(([cat, amount]) => (
                           <div key={cat} className="p-5 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center shadow-sm">
                              <div>
                                <p className="font-black text-slate-800 text-xs uppercase leading-none">{cat}</p>
                                <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest leading-none">Distribución mensual</p>
                              </div>
                              <p className="font-black text-red-500 text-lg leading-none">${amount}</p>
                           </div>
                        ))}
                     </div>
                  </div>
               </div>
            </div>
          )}

          {/* TAB: BILLING */}
          {activeTab === 'billing' && (
            <div className="max-w-5xl mx-auto space-y-8 animate-in text-left">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-[#009EE3] p-10 rounded-[3rem] text-white shadow-xl col-span-2 flex justify-between items-center">
                     <div>
                       <p className="text-[10px] font-black uppercase tracking-widest text-blue-100 mb-1 leading-none">A Facturar (MP)</p>
                       <h3 className="text-6xl font-black tracking-tighter leading-none">${mpBilling.totalToInvoice}</h3>
                     </div>
                     <CreditCard size={64} className="opacity-20" />
                  </div>
                  <div className="bg-emerald-500 p-10 rounded-[3rem] text-white shadow-xl flex flex-col justify-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-100 mb-1 leading-none">Ya Facturado</p>
                      <h3 className="text-3xl md:text-5xl font-black tracking-tighter leading-none">${mpBilling.totalInvoiced}</h3>
                  </div>
               </div>
               <div className="space-y-4">
                  {mpBilling.mpByDay.map(([date, items]) => (
                    <div key={date} className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
                       <button onClick={() => setExpandedBillingDate(expandedBillingDate === date ? null : date)} className="w-full p-6 flex justify-between items-center hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-4">
                             <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600 leading-none">
                               <CalendarDays size={20}/>
                             </div>
                             <div className="text-left">
                               <p className="font-black text-slate-800 text-lg uppercase leading-none">{formatDateDisplay(date)}</p>
                               <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase leading-none">
                                 {items.length} reserva(s) • Total: ${items.reduce((acc, r) => acc + parseFloat(r.deposit), 0)}
                               </p>
                             </div>
                          </div>
                          <ChevronRight size={24} className={`text-slate-300 transition-transform ${expandedBillingDate === date ? 'rotate-90' : ''}`} />
                       </button>
                       {expandedBillingDate === date && (
                         <div className="p-6 pt-0 border-t border-slate-50 space-y-3">
                            {items.map(r => (
                              <div key={r.id} className={`p-4 rounded-2xl border flex items-center justify-between ${r.isInvoiced ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                                 <div className="flex items-center gap-4">
                                    <button onClick={() => toggleInvoiced(r)} className={r.isInvoiced ? 'text-emerald-600' : 'text-slate-300'}>
                                      <CheckSquare size={24}/>
                                    </button>
                                    <div className="text-left">
                                      <p className={`font-black text-sm ${r.isInvoiced ? 'line-through opacity-50' : ''}`}>{r.name}</p>
                                      <p className="text-[9px] font-bold text-slate-400 uppercase leading-none mt-1">DNI: {r.dni || 'S/D'} • Seña: ${r.deposit}</p>
                                    </div>
                                 </div>
                                 <button onClick={() => generatePDF(r)} className="p-2 bg-white rounded-xl shadow-sm border border-slate-100 text-slate-400 hover:text-slate-600 leading-none">
                                   <Download size={14}/>
                                 </button>
                              </div>
                            ))}
                         </div>
                       )}
                    </div>
                  ))}
               </div>
            </div>
          )}

          {/* TAB: HISTORY */}
          {activeTab === 'history' && (
            <div className="max-w-5xl mx-auto space-y-6 animate-in text-left">
               <div className="bg-white p-6 rounded-[1.5rem] border border-slate-200 shadow-sm flex items-center gap-4">
                  <Search className="text-slate-400" size={20}/>
                  <input 
                    type="text" 
                    placeholder="DNI o Nombre..." 
                    className="flex-1 bg-transparent border-none outline-none font-bold text-sm md:text-lg text-slate-800" 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
               </div>
               <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {reservations.filter(r => r.name.toLowerCase().includes(searchTerm.toLowerCase()) || (r.dni && r.dni.includes(searchTerm))).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).map(r => (
                        <div key={r.id} className="p-5 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center group hover:bg-white hover:shadow-lg transition-all duration-300 shadow-sm text-left">
                           <div className="max-w-[65%] text-left">
                             <p className="font-black text-slate-800 text-sm md:text-lg leading-none truncate">{String(r.name)}</p>
                             <p className="text-[9px] font-black text-slate-400 uppercase mt-2 leading-none">DNI: {r.dni || 'S/D'} • In: {formatDateDisplay(r.checkin)} • Unidad {r.bungalowId}</p>
                           </div>
                           <div className="flex gap-1">
                             <button onClick={() => sendWA(r)} className="p-2 bg-emerald-50 text-emerald-600 rounded-xl leading-none">
                               <Phone size={16}/>
                             </button>
                             <button onClick={() => generatePDF(r)} className="p-2 bg-slate-100 text-slate-600 rounded-xl leading-none">
                               <FileText size={16}/>
                             </button>
                           </div>
                        </div>
                     ))}
                  </div>
               </div>
            </div>
          )}

          {/* TAB: MAINTENANCE */}
          {activeTab === 'maintenance' && (
             <div className="max-w-5xl mx-auto space-y-6 animate-in">
                <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm text-left">
                    <h3 className="text-xl font-black mb-8 uppercase text-slate-800 leading-none">Mantenimientos Pendientes</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {bungalows.filter(b => maintenance.some(m => m.bungalowId === b.id && m.status === 'pending')).map(b => (
                            <div key={b.id} className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                                <div className="flex justify-between items-start mb-4">
                                    <h4 className="font-black text-slate-800 text-lg uppercase">Bungalow {b.id}</h4>
                                    <span className="bg-amber-100 text-amber-700 text-[10px] font-black px-2 py-1 rounded-lg uppercase">Pendiente</span>
                                </div>
                                <div className="space-y-2 mb-6">
                                    {maintenance.filter(m => m.bungalowId === b.id && m.status === 'pending').map(task => (
                                        <div key={task.id} className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-100">
                                            {task.type === 'Reparación' ? <Hammer size={16} className="text-red-500 mt-1" /> : <Sparkles size={16} className="text-blue-500 mt-1" />}
                                            <div className="flex-1">
                                                <p className="font-bold text-slate-700 text-sm leading-tight">{task.task}</p>
                                                <p className={`text-[8px] font-black uppercase mt-1 ${task.type === 'Reparación' ? 'text-red-500' : 'text-blue-500'}`}>{task.type}</p>
                                            </div>
                                            <button onClick={() => deleteMaintenance(task.id, b.id)} className="p-1.5 text-slate-300 hover:text-emerald-500 transition-all">
                                              <CheckSquare size={18}/>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <button onClick={() => openMaintenanceForm(b)} className="w-full py-3 bg-[#0F172A] text-white rounded-xl text-xs font-black uppercase hover:bg-slate-800 transition-all">
                                  Agregar Tarea
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
             </div>
          )}

        </div>
      </main>

      {/* --- MODALES --- */}

      {/* MODAL MANTENIMIENTO (CUADRANTE FLOTANTE) */}
      {showMaintenanceModal && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[200] flex items-center justify-center p-4">
            <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-lg p-10 animate-in zoom-in-95">
                <div className="flex justify-between items-center mb-8">
                    <h3 className="text-2xl font-black uppercase text-slate-800 flex items-center gap-3 leading-none">
                      <Wrench className="text-amber-500"/> Mantenimiento
                    </h3>
                    <button onClick={() => setShowMaintenanceModal(false)}><X size={24}/></button>
                </div>
                <form onSubmit={handleAddMaintenance} className="space-y-6">
                    <div className="space-y-2 text-left">
                        <label className="text-[10px] font-black text-slate-400 uppercase leading-none">Tipo de Acción</label>
                        <div className="flex gap-2">
                            <button 
                              type="button" 
                              onClick={() => setNewMaintenance({...newMaintenance, type: 'Limpieza'})} 
                              className={`flex-1 py-4 rounded-2xl flex items-center justify-center gap-2 font-black text-xs uppercase border-2 transition-all ${newMaintenance.type === 'Limpieza' ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-white border-slate-100 text-slate-400'}`}
                            >
                              <Sparkles size={16}/> Limpieza
                            </button>
                            <button 
                              type="button" 
                              onClick={() => setNewMaintenance({...newMaintenance, type: 'Reparación'})} 
                              className={`flex-1 py-4 rounded-2xl flex items-center justify-center gap-2 font-black text-xs uppercase border-2 transition-all ${newMaintenance.type === 'Reparación' ? 'bg-red-600 border-red-600 text-white shadow-lg' : 'bg-white border-slate-100 text-slate-400'}`}
                            >
                              <Hammer size={16}/> Reparar
                            </button>
                        </div>
                    </div>
                    <div className="space-y-1 text-left">
                        <label className="text-[10px] font-black text-slate-400 uppercase leading-none">¿Qué hay que hacer?</label>
                        <textarea 
                          required 
                          className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800 min-h-[120px] outline-none focus:ring-2 focus:ring-amber-500 transition-all" 
                          placeholder="Ej: Cambiar canilla baño, limpiar vidrios, reparar persiana..." 
                          value={newMaintenance.task} 
                          onChange={e => setNewMaintenance({...newMaintenance, task: e.target.value})}
                        />
                    </div>
                    {newMaintenance.type === 'Reparación' && (
                        <div className="p-4 bg-red-50 rounded-2xl border border-red-100 flex items-center gap-3 text-left">
                            <AlertTriangle className="text-red-600 shrink-0" size={20} />
                            <p className="text-[10px] font-black text-red-700 uppercase leading-tight">
                              Nota: Las reparaciones bloquean nuevas reservas de esta unidad.
                            </p>
                        </div>
                    )}
                    <button type="submit" className="w-full py-5 bg-amber-500 text-white rounded-[2rem] font-black text-lg shadow-xl uppercase leading-none hover:bg-amber-600 transition-all">
                      Registrar Pendiente
                    </button>
                </form>
            </div>
        </div>
      )}

      {/* MODAL NUEVA RESERVA */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[120] flex items-center justify-center p-0 md:p-4">
          <div className="bg-white rounded-none md:rounded-[4rem] shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col lg:flex-row h-full md:h-[90vh] animate-in zoom-in-95 duration-300">
            
            {/* Lado Izquierdo: Calendario */}
            <div className="w-full lg:w-5/12 bg-[#0F172A] p-6 md:p-10 text-white flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800 shrink-0">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl md:text-2xl font-black uppercase leading-none">
                  Disponibilidad<br/><span className="text-emerald-500">de Unidades</span>
                </h3>
                <div className="flex gap-2">
                  <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} className="p-2 bg-slate-800 rounded-xl hover:bg-emerald-600 transition-all">
                    <ChevronLeft size={18}/>
                  </button>
                  <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} className="p-2 bg-slate-800 rounded-xl hover:bg-emerald-600 transition-all rotate-180">
                    <ChevronLeft size={18}/>
                  </button>
                </div>
              </div>
              <div className="text-center mb-6">
                   <p className="text-xs font-black text-emerald-400 uppercase tracking-widest">{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</p>
              </div>
              <div className="grid grid-cols-7 mb-4 text-center opacity-40 uppercase leading-none">
                {['D','L','M','M','J','V','S'].map(d => <div key={d} className="text-[8px] md:text-[10px] font-black">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1.5 md:gap-3">
                {(() => {
                  const { firstDay, days, year, month } = getDaysInMonth(currentMonth);
                  const cells = [];
                  for (let i = 0; i < firstDay; i++) cells.push(<div key={`empty-${i}`} />);
                  for (let d = 1; d <= days; d++) {
                    const occupied = isDateOccupied(d, month, year, newBooking.bungalowId);
                    cells.push(
                      <div 
                        key={d} 
                        className={`aspect-square flex items-center justify-center rounded-lg md:rounded-2xl text-[10px] md:text-xs font-black transition-all ${occupied ? 'bg-red-500/30 text-red-300 border border-red-500/20 line-through' : 'bg-slate-800/60 text-slate-400'}`}
                      >
                        {d}
                      </div>
                    );
                  }
                  return cells;
                })()}
              </div>
            </div>

            {/* Lado Derecho: Formulario */}
            <div className="flex-1 p-6 md:p-12 bg-white relative overflow-y-auto scroll-smooth">
              <button onClick={() => setShowAddModal(false)} className="absolute top-4 right-4 p-3 bg-slate-50 rounded-full hover:bg-slate-200 z-10 text-slate-400">
                <X size={18}/>
              </button>
              <h3 className="text-2xl md:text-4xl font-black mb-8 uppercase text-slate-800 text-left">Nueva Reserva</h3>
              
              {blockReason && (
                <div className="mb-8 p-6 bg-red-50 border border-red-200 rounded-[2rem] flex items-start gap-4 text-left animate-bounce">
                    <AlertCircle className="text-red-600 shrink-0" size={24} />
                    <p className="text-sm font-black text-red-700 uppercase leading-relaxed text-left">{blockReason}</p>
                </div>
              )}

              <form onSubmit={handleAddBooking} className="space-y-6">
                <div className="space-y-3 text-left">
                  <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Unidad</label>
                  <div className="grid grid-cols-6 gap-2">
                    {bungalows.map(b => (
                      <button 
                        type="button" 
                        key={b.id} 
                        onClick={() => { setNewBooking({...newBooking, bungalowId: b.id}); setBlockReason(null); }} 
                        className={`h-10 md:h-12 rounded-xl text-[10px] font-black border-2 transition-all ${newBooking.bungalowId === b.id ? 'bg-[#0F172A] border-[#0F172A] text-white shadow-xl scale-105' : 'bg-slate-50 border-slate-50 text-slate-400'}`}
                      >
                        {String(b.id)}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1 mb-1">Huésped</label>
                    <input type="text" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-slate-800" value={newBooking.name} onChange={(e) => setNewBooking({...newBooking, name: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1 mb-1">DNI / Pasaporte</label>
                    <input type="text" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-slate-800" value={newBooking.dni} onChange={(e) => setNewBooking({...newBooking, dni: e.target.value})} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1 mb-1">WhatsApp</label>
                    <input type="tel" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-slate-800" value={newBooking.phone} onChange={(e) => setNewBooking({...newBooking, phone: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1 mb-1 text-slate-900">Total Estadía ($)</label>
                    <input type="number" required className="w-full p-4 bg-emerald-50 border border-emerald-100 rounded-2xl outline-none font-black text-emerald-800" value={newBooking.totalAmount} onChange={(e) => setNewBooking({...newBooking, totalAmount: e.target.value})} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase font-bold">Check-In</label>
                    <input type="date" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800" value={newBooking.checkin} onChange={(e) => setNewBooking({...newBooking, checkin: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase font-bold">Check-Out</label>
                    <input type="date" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800" value={newBooking.checkout} onChange={(e) => setNewBooking({...newBooking, checkout: e.target.value})} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-6 md:p-10 rounded-[2.5rem] border border-slate-100">
                    <div className="flex flex-col gap-4 justify-center text-left">
                        <label className="flex items-center gap-3 cursor-pointer group">
                          <div className="relative">
                            <input type="checkbox" className="peer sr-only" checked={newBooking.isDepositPaid} onChange={(e) => setNewBooking({...newBooking, isDepositPaid: e.target.checked})} />
                            <div className="w-7 h-7 border-2 border-slate-300 rounded-xl bg-white peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-all"></div>
                            <div className="absolute top-1.5 left-2.5 w-2 h-4 border-r-2 border-b-2 border-white rotate-45 opacity-0 peer-checked:opacity-100 transition-all"></div>
                          </div>
                          <span className="text-xs md:text-sm font-black uppercase text-slate-600 group-hover:text-slate-900">Seña paga ahora</span>
                        </label>
                        <div className="space-y-2">
                           <label className="text-[9px] font-black text-slate-400 uppercase">Medio</label>
                           <div className="flex gap-2">
                                <button type="button" onClick={() => setNewBooking({...newBooking, paymentMethod: 'Efectivo'})} className={`flex-1 py-3 rounded-xl text-[10px] font-black border-2 transition-all ${newBooking.paymentMethod === 'Efectivo' ? 'bg-slate-900 border-slate-900 text-white shadow-xl' : 'bg-white border-slate-200 text-slate-400'}`}>Efectivo</button>
                                <button type="button" onClick={() => setNewBooking({...newBooking, paymentMethod: 'MercadoPago'})} className={`flex-1 py-3 rounded-xl text-[10px] font-black border-2 transition-all ${newBooking.paymentMethod === 'MercadoPago' ? 'bg-[#009EE3] border-[#009EE3] text-white shadow-xl' : 'bg-white border-slate-200 text-slate-400'}`}>MP</button>
                           </div>
                        </div>
                    </div>
                    {newBooking.isDepositPaid && (
                      <div className="bg-emerald-50 p-6 rounded-[2rem] border border-emerald-100 flex flex-col justify-center animate-in fade-in slide-in-from-right-4 text-left">
                          <label className="text-[9px] font-black text-emerald-600 uppercase mb-2 block tracking-widest">Monto ($)</label>
                          <input type="number" required className="bg-transparent border-none outline-none font-black text-emerald-700 text-4xl md:text-5xl w-full" placeholder="0" value={newBooking.deposit} onChange={(e) => setNewBooking({...newBooking, deposit: e.target.value})} />
                      </div>
                    )}
                </div>
                <button type="submit" disabled={isProcessing || blockReason !== null} className="w-full py-6 md:py-8 bg-emerald-600 text-white rounded-[2rem] md:rounded-[3rem] font-black text-lg md:text-2xl shadow-2xl active:scale-95 uppercase disabled:opacity-50 disabled:cursor-not-allowed">
                  {isProcessing ? 'Guardando...' : 'Confirmar Reserva'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETALLE BUNGALOW */}
      {showDetailModal && selectedBungalow && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] md:rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col md:flex-row h-auto md:h-[65vh] animate-in zoom-in-95 duration-300">
             <div className="w-full md:w-5/12 bg-[#0F172A] p-6 text-white flex flex-col border-b md:border-b-0 md:border-r border-slate-800 shrink-0">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-base md:text-xl font-black tracking-tight uppercase truncate pr-2">{String(selectedBungalow.name)}</h3>
                  <div className="flex gap-1">
                    <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} className="p-1.5 bg-slate-800 rounded hover:bg-emerald-50 transition-all">
                      <ChevronLeft size={14}/>
                    </button>
                    <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} className="p-1.5 bg-slate-800 rounded hover:bg-emerald-50 transition-all rotate-180">
                      <ChevronLeft size={14}/>
                    </button>
                  </div>
                </div>
                <div className="text-center mb-6">
                   <p className="text-xs font-black text-emerald-400 uppercase tracking-widest">{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</p>
                </div>
                <div className="grid grid-cols-7 mb-2 text-center opacity-40 uppercase text-[7px]">
                  {['D','L','M','M','J','V','S'].map(d => <div key={d} className="font-black">{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {(() => {
                    const { firstDay, days, year, month } = getDaysInMonth(currentMonth);
                    const cells = [];
                    for (let i = 0; i < firstDay; i++) cells.push(<div key={`empty-${i}`} />);
                    for (let d = 1; d <= days; d++) {
                      const occupied = isDateOccupied(d, month, year, selectedBungalow.id);
                      cells.push(
                        <div key={d} className={`aspect-square flex items-center justify-center rounded text-[9px] font-bold transition-all ${occupied ? 'bg-red-500 text-white shadow-sm' : 'bg-emerald-500/10 text-emerald-400'}`}>
                          {d}
                        </div>
                      );
                    }
                    return cells;
                  })()}
                </div>
             </div>
             <div className="flex-1 p-6 md:p-8 bg-white relative overflow-y-auto">
                <button onClick={() => setShowDetailModal(false)} className="absolute top-4 right-4 p-2 bg-slate-50 rounded-full hover:bg-slate-200 z-10 text-slate-400">
                  <X size={18}/>
                </button>
                <h3 className="text-sm md:text-base font-black mb-4 uppercase border-b border-slate-100 pb-2 text-slate-800 text-left">Historial de Reservas</h3>
                <div className="space-y-3">
                  {reservations.filter(r => r.bungalowId === selectedBungalow.id).length > 0 ? (
                    reservations.filter(r => r.bungalowId === selectedBungalow.id).sort((a,b) => new Date(b.checkin) - new Date(a.checkin)).map(r => (
                      <div key={String(r.id)} className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between shadow-sm transition-all text-slate-900">
                        <div className="truncate max-w-[60%] text-left">
                           <span className="font-black text-xs text-slate-700 truncate block">{String(r.name)}</span>
                           <span className="text-[8px] font-bold text-slate-400 block mt-1">{formatDateDisplay(r.checkin)} → {formatDateDisplay(r.checkout)}</span>
                        </div>
                        <div className="flex gap-1">
                           <button onClick={() => { setResToEdit(r); setShowEditModal(true); }} className="p-2 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 rounded-lg transition-all">
                             <Pencil size={14}/>
                           </button>
                           <button onClick={() => { setResToDelete(r); setShowDeleteReasonModal(true); }} className="p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all">
                             <Trash2 size={14}/>
                           </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-8 text-center opacity-30 font-black uppercase text-[9px] text-slate-400">Sin movimientos</div>
                  )}
                </div>
             </div>
          </div>
        </div>
      )}

      {/* MODAL INGRESO MANUAL */}
      {showIncomeModal && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[150] flex items-center justify-center p-4">
           <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-lg p-10 animate-in zoom-in-95">
              <div className="flex justify-between items-center mb-8">
                 <h3 className="text-2xl font-black uppercase text-slate-800 flex items-center gap-3">
                   <ArrowUpCircle className="text-emerald-500"/> Nuevo Ingreso
                 </h3>
                 <button onClick={() => setShowIncomeModal(false)}><X size={24}/></button>
              </div>
              <form onSubmit={handleAddManualIncome} className="space-y-6 text-left">
                 <div className="space-y-1">
                   <label className="text-[10px] font-black text-slate-400 uppercase">Concepto</label>
                   <input type="text" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800" value={newIncome.description} onChange={e => setNewIncome({...newIncome, description: e.target.value})} />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase">Monto ($)</label>
                      <input type="number" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800" value={newIncome.amount} onChange={e => setNewIncome({...newIncome, amount: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase">Fecha</label>
                      <input type="date" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800" value={newIncome.date} onChange={e => setNewIncome({...newIncome, date: e.target.value})} />
                    </div>
                 </div>
                 <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase">Medio</label>
                    <select className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold appearance-none text-slate-800" value={newIncome.source} onChange={e => setNewIncome({...newIncome, source: e.target.value})}>
                      <option>Efectivo</option>
                      <option>MercadoPago</option>
                      <option>Transferencia</option>
                    </select>
                 </div>
                 <button type="submit" className="w-full py-5 bg-emerald-600 text-white rounded-[2rem] font-black text-lg shadow-xl uppercase">Guardar en Caja</button>
              </form>
           </div>
        </div>
      )}

      {/* MODAL GASTO */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[150] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] md:rounded-[3rem] shadow-2xl w-full max-w-xl p-8 md:p-10 relative animate-in zoom-in-95 duration-300">
             <button onClick={() => setShowExpenseModal(false)} className="absolute top-6 right-6 p-3 bg-slate-50 rounded-full hover:bg-slate-200 transition-all text-slate-400">
               <X size={18}/>
             </button>
             <h3 className="text-xl font-black mb-8 uppercase flex items-center gap-3 text-red-500">
               <TrendingDown className="text-red-500"/> Nuevo Egreso
             </h3>
             <form onSubmit={handleAddExpense} className="space-y-4 text-left">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase">Descripción</label>
                  <input type="text" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800" placeholder="Ej: Pago de Luz" value={newExpense.description} onChange={(e) => setNewExpense({...newExpense, description: e.target.value})}/>
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1">
                     <label className="text-[10px] font-black text-slate-400 uppercase">Monto ($)</label>
                     <input type="number" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800" value={newExpense.amount} onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})}/>
                   </div>
                   <div className="space-y-1">
                     <label className="text-[10px] font-black text-slate-400 uppercase">Fecha</label>
                     <input type="date" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800" value={newExpense.date} onChange={(e) => setNewExpense({...newExpense, date: e.target.value})}/>
                   </div>
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-black text-slate-400 uppercase">Categoría</label>
                   <select className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800 appearance-none" value={newExpense.category} onChange={(e) => setNewExpense({...newExpense, category: e.target.value})}>
                      <option>Servicios</option>
                      <option>Mantenimiento</option>
                      <option>Limpieza</option>
                      <option>Sueldos</option>
                      <option>Otros</option>
                   </select>
                </div>
                <button type="submit" disabled={isProcessing} className="w-full py-5 bg-red-500 text-white rounded-[2rem] font-black text-lg shadow-xl uppercase">Guardar Egreso</button>
             </form>
          </div>
        </div>
      )}

      {/* MODAL LISTADO RÁPIDO (LIBRES/OCUPADOS) */}
      {showStatusListModal && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[120] flex items-center justify-center p-4">
           <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
              <div className="p-8 border-b border-slate-100 flex justify-between items-center text-slate-900">
                 <h3 className="text-xl font-black uppercase">Bungalows {showStatusListModal === 'free' ? 'Libres' : 'Ocupados'}</h3>
                 <button onClick={() => setShowStatusListModal(null)} className="p-2 bg-slate-50 rounded-full text-slate-400"><X size={20}/></button>
              </div>
              <div className="p-8 space-y-2 max-h-[60vh] overflow-y-auto">
                 {bungalows.filter(b => b.status === (showStatusListModal === 'free' ? 'free' : 'occupied')).map(b => (
                   <div key={b.id} onClick={() => { openBungalowDetail(b); setShowStatusListModal(null); }} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between cursor-pointer hover:border-emerald-500 transition-all text-slate-900 shadow-sm">
                      <span className="font-black uppercase">Bungalow {b.id}</span>
                      <ChevronRight size={18} className="text-slate-300" />
                   </div>
                 ))}
                 {bungalows.filter(b => b.status === (showStatusListModal === 'free' ? 'free' : 'occupied')).length === 0 && (
                   <p className="text-center py-10 opacity-30 uppercase font-black text-xs text-slate-900">Sin unidades en este estado</p>
                 )}
              </div>
           </div>
        </div>
      )}

      {/* MODAL EDITAR RESERVA */}
      {showEditModal && resToEdit && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[150] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl p-8 md:p-12 relative animate-in zoom-in-95 duration-300 overflow-y-auto max-h-[90vh]">
             <button onClick={() => setShowEditModal(false)} className="absolute top-6 right-6 p-3 bg-slate-50 rounded-full hover:bg-slate-200 transition-all text-slate-400">
               <X size={18}/>
             </button>
             <h3 className="text-2xl font-black mb-10 tracking-tighter uppercase flex items-center gap-3 text-slate-800 border-b pb-4">
               <Pencil className="text-emerald-500"/> Editar Reserva
             </h3>
             <form onSubmit={handleEditBooking} className="space-y-6 text-left">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Huésped</label>
                  <input type="text" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800" value={resToEdit.name} onChange={(e) => setResToEdit({...resToEdit, name: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1">
                     <label className="text-[9px] font-black text-slate-400 uppercase ml-1">DNI</label>
                     <input type="text" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800" value={resToEdit.dni} onChange={(e) => setResToEdit({...resToEdit, dni: e.target.value})} />
                   </div>
                   <div className="space-y-1">
                     <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Total Estadía ($)</label>
                     <input type="number" required className="w-full p-4 bg-emerald-50 border border-emerald-100 rounded-2xl font-black text-emerald-800" value={resToEdit.totalAmount} onChange={(e) => setResToEdit({...resToEdit, totalAmount: e.target.value})} />
                   </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1">
                     <label className="text-[9px] font-black text-slate-400 uppercase ml-1 font-bold">Check-In</label>
                     <input type="date" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800" value={resToEdit.checkin} onChange={(e) => setResToEdit({...resToEdit, checkin: e.target.value})} />
                   </div>
                   <div className="space-y-1">
                     <label className="text-[9px] font-black text-slate-400 uppercase ml-1 font-bold">Check-Out</label>
                     <input type="date" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800" value={resToEdit.checkout} onChange={(e) => setResToEdit({...resToEdit, checkout: e.target.value})} />
                   </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Monto Seña entregado ($)</label>
                  <input type="number" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800" value={resToEdit.deposit} onChange={(e) => setResToEdit({...resToEdit, deposit: e.target.value})} />
                </div>
                <button type="submit" disabled={isProcessing} className="w-full py-5 bg-[#0F172A] text-white rounded-[2rem] font-black text-lg shadow-xl uppercase mt-4">Guardar Cambios</button>
             </form>
          </div>
        </div>
      )}

      {/* MODAL MOTIVO ELIMINACIÓN */}
      {showDeleteReasonModal && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[150] flex items-center justify-center p-4">
           <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-md p-10 text-center animate-in zoom-in-95">
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 size={32}/>
              </div>
              <h3 className="text-xl font-black mb-2 uppercase text-slate-800">Eliminar Reserva</h3>
              <p className="text-slate-500 text-sm mb-8 leading-relaxed">
                Indique el motivo antes de borrar a <span className="font-bold text-slate-700">{resToDelete?.name}</span>.
              </p>
              <div className="space-y-3">
                 <button onClick={() => confirmDeleteReservation("Cancelación")} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black hover:bg-red-600 transition-all uppercase text-xs">
                   Cancelación Definitiva
                 </button>
                 <button onClick={() => confirmDeleteReservation("Cambio de fechas")} className="w-full py-4 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl font-black hover:border-emerald-500 hover:text-emerald-600 transition-all uppercase text-xs">
                   Cambio de Fechas
                 </button>
                 <button onClick={() => setShowDeleteReasonModal(false)} className="w-full py-2 text-slate-400 font-bold hover:text-slate-600 transition-all text-xs">
                   Cancelar
                 </button>
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
      <div className="flex items-center gap-4 text-left">
        <Icon size={18} />
        <span className="font-bold text-sm tracking-tight text-white">{label}</span>
      </div>
      {badge > 0 && <span className="bg-amber-500 text-[#0F172A] text-[9px] font-black px-2 py-0.5 rounded-md">{badge}</span>}
    </button>
  );
}

function StatCard({ label, value, color, bg, icon: Icon, onClick }) {
  return (
    <div onClick={onClick} className={`p-4 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4 ${bg} cursor-pointer active:scale-95 transition-all`}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color} bg-white shadow-sm shrink-0`}>
        <Icon size={24} />
      </div>
      <div className="truncate text-slate-900 text-left">
        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest truncate mb-1">{label}</p>
        <p className={`text-2xl font-black ${color} tracking-tighter truncate`}>{value}</p>
      </div>
    </div>
  );
}

function BungalowCard({ data, res, onStatusChange, onWhatsApp, onPDF, onClick }) {
  const statusStyles = {
    free: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Libre', dot: 'bg-emerald-500' },
    occupied: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Ocupado', dot: 'bg-blue-500' },
    cleaning: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Mantenimiento', dot: 'bg-amber-500' }
  };
  const config = statusStyles[data.status] || statusStyles.free;
  
  return (
    <div onClick={onClick} className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-2xl transition-all duration-300 group flex flex-col cursor-pointer active:scale-[0.98] text-slate-900">
      <div className="p-8 flex-1 flex flex-col">
        
        <div className="flex justify-between items-start mb-6">
          <div className={`px-4 py-1.5 rounded-full ${config.bg} ${config.text} text-[9px] font-black uppercase flex items-center gap-2 shadow-sm`}>
            <span className={`w-2 h-2 rounded-full ${config.dot} ${data.status === 'occupied' ? 'animate-pulse' : ''}`}></span>
            {config.label}
          </div>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
            <button onClick={(e) => { e.stopPropagation(); onStatusChange(); }} className="p-2 bg-white hover:bg-amber-50 text-amber-600 rounded-xl shadow-sm border border-slate-50">
              <Wrench size={14}/>
            </button>
          </div>
        </div>

        <div className="mb-4 text-left">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">BUNGALOW</p>
          <h3 className="text-4xl font-black text-slate-800 tracking-tighter">{String(data.id)}</h3>
        </div>

        {data.status === 'occupied' && res ? (
          <div className="mt-4 space-y-3 animate-in">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-50 text-slate-900 text-left">
              <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Huésped</p>
              <p className="text-sm font-black text-slate-700 truncate">{String(res.name)}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={(e) => { e.stopPropagation(); onWhatsApp(res); }} className="flex items-center justify-center gap-1 py-2 bg-emerald-600 text-white rounded-xl text-[9px] font-black">
                <Phone size={10} /> WA
              </button>
              <button onClick={(e) => { e.stopPropagation(); onPDF(res); }} className="flex items-center justify-center gap-1 py-2 bg-slate-100 text-slate-600 rounded-xl text-[9px] font-black">
                <Download size={10} /> PDF
              </button>
            </div>
            <div className="flex justify-between border-t border-slate-50 pt-3 text-left">
              <div className="flex flex-col">
                <p className="text-[7px] font-black text-slate-400 uppercase">Salida</p>
                <p className="text-[10px] font-black text-red-500">{formatDateDisplay(res.checkout)}</p>
              </div>
              <div className="text-right">
                <p className="text-[7px] font-black text-slate-400 uppercase">Seña</p>
                <p className="text-xs font-black text-emerald-600">${String(res.deposit)}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-50 rounded-2xl mt-4 bg-slate-50/50 py-10 opacity-30 text-slate-400">
            <Package size={24}/>
            <p className="text-[8px] font-black uppercase mt-2">Disponible</p>
          </div>
        )}

      </div>
    </div>
  );
}
