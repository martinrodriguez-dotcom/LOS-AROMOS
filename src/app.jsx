import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { 
  getFirestore, collection, doc, onSnapshot, setDoc, addDoc, updateDoc, deleteDoc 
} from 'firebase/firestore';
import { 
  LayoutDashboard, CalendarDays, Users, Home, Search, 
  CheckCircle2, Clock, Plus, DollarSign, Send, ChevronLeft, X,
  Wrench, BarChart3, Package, Trash2, FileText, ChevronRight, Download, Phone
} from 'lucide-react';

// --- CONFIGURACIÓN DE FIREBASE (REGLA 3: AUTH ANTES QUE CONSULTAS) ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Saneamiento del App ID para evitar errores de segmentos en Firestore (REGLA 1)
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'los-aromos-admin-final';
const appId = rawAppId.replace(/\//g, '_');

// --- UTILIDADES EXTERNAS ---

/**
 * Carga dinámica de jsPDF para la generación de comprobantes.
 */
const loadJsPDF = () => {
  return new Promise((resolve) => {
    if (window.jspdf) return resolve(window.jspdf);
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.onload = () => resolve(window.jspdf);
    document.head.appendChild(script);
  });
};

// --- COMPONENTE PRINCIPAL ---

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

  // 1. Manejo de Autenticación (Prioridad REGLA 3)
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Error de Autenticación:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. Sincronización de Datos con Firestore (REGLA 1: RUTAS ESTRICTAS)
  useEffect(() => {
    if (!user) return;

    // Ruta de colección: artifacts/{appId}/public/data/bungalows (5 segmentos)
    const bRef = collection(db, 'artifacts', appId, 'public', 'data', 'bungalows');
    const unsubB = onSnapshot(bRef, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (data.length === 0) {
        // Inicializar las 12 unidades por defecto si no existen
        for(let i=1; i<=12; i++) {
          setDoc(doc(bRef, i.toString()), { 
            name: `Bungalow ${i.toString().padStart(2, '0')}`, 
            status: 'free' 
          });
        }
      }
      setBungalows(data.sort((a, b) => parseInt(a.id) - parseInt(b.id)));
    }, (error) => console.error("Error cargando cabañas:", error));

    const rRef = collection(db, 'artifacts', appId, 'public', 'data', 'reservations');
    const unsubR = onSnapshot(rRef, (snap) => {
      setReservations(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => console.error("Error cargando reservas:", error));

    const mRef = collection(db, 'artifacts', appId, 'public', 'data', 'maintenance');
    const unsubM = onSnapshot(mRef, (snap) => {
      setMaintenance(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => console.error("Error cargando mantenimiento:", error));

    return () => { unsubB(); unsubR(); unsubM(); };
  }, [user]);

  // --- LÓGICA DE CALENDARIO Y DISPONIBILIDAD ---

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysCount = new Date(year, month + 1, 0).getDate();
    return { firstDay, daysCount, year, month };
  };

  const isDateOccupied = (day, month, year, bungalowId) => {
    const checkDate = new Date(year, month, day);
    checkDate.setHours(0, 0, 0, 0);
    return reservations.some(res => {
      if (res.bungalowId?.toString() !== bungalowId?.toString()) return false;
      const start = new Date(res.checkin + 'T00:00:00');
      const end = new Date(res.checkout + 'T00:00:00');
      return checkDate >= start && checkDate <= end;
    });
  };

  // --- ACCIONES ADMINISTRATIVAS ---

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
      setNewBooking({ bungalowId: "1", name: '', phone: '', guests: 1, checkin: '', checkout: '', deposit: 0 });
    } catch (err) {
      console.error(err);
    }
    setIsProcessing(false);
  };

  const updateBungalowStatus = async (id, newStatus) => {
    if (!user) return;
    const bDoc = doc(db, 'artifacts', appId, 'public', 'data', 'bungalows', id.toString());
    await updateDoc(bDoc, { status: newStatus });
  };

  const handleWhatsApp = (res) => {
    const bungalow = bungalows.find(b => b.id === res.bungalowId?.toString());
    const message = `Hola ${res.name}! 👋 Confirmamos tu reserva en *Los Aromos* 🌿%0A%0A🏠 *${bungalow?.name || 'Cabaña'}*%0A📅 *Entrada:* ${res.checkin}%0A📅 *Salida:* ${res.checkout}%0A💰 *Seña:* $${res.deposit}`;
    const cleanPhone = String(res.phone || '').replace(/\D/g, '');
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  const downloadReceipt = async (res) => {
    const { jsPDF } = await loadJsPDF();
    const pdf = new jsPDF();
    const bungalow = bungalows.find(b => b.id === res.bungalowId?.toString());
    
    pdf.setFontSize(22);
    pdf.text("LOS AROMOS", 20, 20);
    pdf.setFontSize(10);
    pdf.text("RECIBO DE RESERVA", 20, 28);
    
    pdf.setFontSize(12);
    pdf.text(`Huésped: ${String(res.name)}`, 20, 45);
    pdf.text(`Unidad: ${bungalow?.name || res.bungalowId}`, 20, 52);
    pdf.text(`Periodo: ${res.checkin} al ${res.checkout}`, 20, 59);
    pdf.setFontSize(14);
    pdf.text(`SEÑA RECIBIDA: $${res.deposit}`, 20, 75);
    
    pdf.save(`Recibo_LosAromos_${String(res.name).replace(/\s/g, '_')}.pdf`);
  };

  const stats = useMemo(() => ({
    free: bungalows.filter(b => b.status === 'free').length,
    occupied: bungalows.filter(b => b.status === 'occupied').length,
    cleaning: bungalows.filter(b => b.status === 'cleaning').length,
    income: reservations.reduce((acc, r) => acc + (parseFloat(r.deposit) || 0), 0)
  }), [bungalows, reservations]);

  if (!user) return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#0F172A] text-white">
      <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
      <p className="font-black uppercase tracking-widest text-sm">Iniciando Los Aromos...</p>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-slate-900 font-sans">
      
      {/* Sidebar de Navegación */}
      <aside className="w-64 bg-[#0F172A] text-white hidden lg:flex flex-col shadow-2xl z-30">
        <div className="p-8 border-b border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg">
            <Home size={20} />
          </div>
          <h1 className="text-lg font-black tracking-tighter uppercase">Los Aromos</h1>
        </div>
        <nav className="flex-1 p-4 space-y-2 mt-4">
          <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`}>
            <LayoutDashboard size={20} /> <span className="font-bold text-sm text-white">Dashboard</span>
          </button>
          <button onClick={() => setActiveTab('reports')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'reports' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`}>
            <BarChart3 size={20} /> <span className="font-bold text-sm text-white">Caja y Reportes</span>
          </button>
        </nav>
      </aside>

      {/* Área Principal */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-white border-b border-slate-200 px-8 py-5 flex justify-between items-center z-20 shadow-sm">
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">
            {activeTab === 'dashboard' ? 'Control de Cabañas' : 'Análisis de Gestión'}
          </h2>
          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-600/20 active:scale-95"
          >
            <Plus size={20} /> Nueva Reserva
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          {activeTab === 'dashboard' && (
            <div className="animate-in">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
                <StatCard label="Disponibles" value={stats.free} color="text-emerald-600" bg="bg-emerald-50" icon={CheckCircle2} />
                <StatCard label="Ocupados" value={stats.occupied} color="text-blue-600" bg="bg-blue-50" icon={Users} />
                <StatCard label="Limpieza" value={stats.cleaning} color="text-amber-600" bg="bg-amber-50" icon={Clock} />
                <StatCard label="Caja Total" value={`$${stats.income}`} color="text-slate-700" bg="bg-white" icon={DollarSign} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {bungalows.map((b) => (
                  <BungalowCard 
                    key={b.id} 
                    data={b} 
                    reservation={reservations.find(r => r.bungalowId?.toString() === b.id && b.status === 'occupied')} 
                    onStatusChange={updateBungalowStatus}
                    onWhatsApp={sendWhatsApp}
                    onPDF={downloadReceipt}
                  />
                ))}
              </div>
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="max-w-4xl space-y-8 animate-in">
              <div className="bg-[#0F172A] p-10 rounded-[3rem] text-white flex justify-between items-center shadow-2xl">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-emerald-400 mb-2">Total Recaudado por Señas</p>
                  <h3 className="text-6xl font-black tracking-tighter">${stats.income}</h3>
                </div>
                <BarChart3 size={64} className="text-slate-800" />
              </div>
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200">
                <h3 className="font-black text-xl mb-6">Últimos Movimientos</h3>
                <div className="space-y-3">
                  {reservations.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10).map(r => (
                    <div key={r.id} className="flex justify-between items-center p-5 bg-slate-50 rounded-2xl border border-slate-100">
                      <div>
                        <p className="font-bold text-slate-800">{String(r.name)}</p>
                        <p className="text-xs text-slate-400">Bungalow {r.bungalowId} • {r.checkin}</p>
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

      {/* MODAL DE REGISTRO CON CALENDARIO INTELIGENTE */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3.5rem] shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col md:flex-row h-[90vh]">
            
            {/* Lado Calendario */}
            <div className="md:w-5/12 bg-[#0F172A] p-10 text-white flex flex-col border-r border-slate-800 overflow-y-auto">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-2xl font-black tracking-tight">Ocupación</h3>
                <div className="flex gap-2">
                  <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="p-3 bg-slate-800 rounded-2xl hover:bg-emerald-600 transition-all"><ChevronLeft size={20}/></button>
                  <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="p-3 bg-slate-800 rounded-2xl hover:bg-emerald-600 transition-all rotate-180"><ChevronLeft size={20}/></button>
                </div>
              </div>
              <div className="grid grid-cols-7 mb-4 text-center">
                {['D','L','M','M','J','V','S'].map(d => <div key={d} className="text-[10px] font-black text-slate-500 uppercase">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {(() => {
                  const { firstDay, daysCount, year, month } = getDaysInMonth(currentMonth);
                  const cells = [];
                  for (let i = 0; i < firstDay; i++) cells.push(<div key={`empty-${i}`} />);
                  for (let d = 1; d <= daysCount; d++) {
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
              <div className="mt-auto p-6 bg-slate-800/30 rounded-3xl flex gap-4 text-[10px] font-bold uppercase tracking-widest justify-center">
                  <div className="flex items-center gap-2"><div className="w-2 h-2 bg-red-500 rounded-full"></div> Reservado</div>
                  <div className="flex items-center gap-2"><div className="w-2 h-2 bg-slate-700 rounded-full"></div> Libre</div>
              </div>
            </div>

            {/* Lado Formulario */}
            <div className="md:w-7/12 p-12 bg-white relative overflow-y-auto">
              <button onClick={() => setShowAddModal(false)} className="absolute top-8 right-8 p-3 bg-slate-50 rounded-full hover:bg-slate-100 transition-colors"><X/></button>
              <h3 className="text-4xl font-black mb-10 tracking-tighter text-slate-900">Nueva Reserva</h3>
              <form onSubmit={handleAddBooking} className="space-y-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Elegir Unidad</label>
                  <div className="grid grid-cols-6 gap-2">
                    {bungalows.map(b => (
                      <button 
                        type="button" 
                        key={b.id} 
                        onClick={() => setNewBooking({...newBooking, bungalowId: b.id})} 
                        className={`h-12 rounded-xl text-xs font-black border-2 transition-all ${newBooking.bungalowId === b.id ? 'bg-[#0F172A] border-[#0F172A] text-white shadow-xl' : 'bg-slate-50 border-slate-50 text-slate-400'}`}
                      >
                        {String(b.id)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <input type="text" required placeholder="Nombre del Huésped" className="p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-900" value={newBooking.name} onChange={(e) => setNewBooking({...newBooking, name: e.target.value})} />
                  <input type="tel" required placeholder="WhatsApp" className="p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-900" value={newBooking.phone} onChange={(e) => setNewBooking({...newBooking, phone: e.target.value})} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">Entrada</label>
                    <input type="date" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900" value={newBooking.checkin} onChange={(e) => setNewBooking({...newBooking, checkin: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 ml-1 uppercase">Salida</label>
                    <input type="date" required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900" value={newBooking.checkout} onChange={(e) => setNewBooking({...newBooking, checkout: e.target.value})} />
                  </div>
                </div>
                <div className="bg-emerald-50 p-8 rounded-[2.5rem] border border-emerald-100">
                  <label className="text-[10px] font-black text-emerald-600 uppercase mb-2 block">Monto Seña Cobrada ($)</label>
                  <input type="number" required className="bg-transparent border-none outline-none font-black text-emerald-700 text-5xl w-full" value={newBooking.deposit} onChange={(e) => setNewBooking({...newBooking, deposit: e.target.value})} />
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

const StatCard = ({ icon: Icon, label, value, color, bg }) => (
  <div className={`p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex items-center gap-6 ${bg}`}>
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
        <div className="flex justify-between items-start mb-8 text-slate-900">
          <div className={`px-4 py-1.5 rounded-full ${config.bg} ${config.text} text-[10px] font-black uppercase tracking-widest flex items-center gap-2`}>
            <span className={`w-2 h-2 rounded-full ${config.dot} ${data.status === 'occupied' ? 'animate-pulse' : ''}`}></span>
            {config.label}
          </div>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
            <button onClick={() => onStatusChange(data.id, 'cleaning')} className="p-2 hover:bg-amber-50 text-amber-600 rounded-xl shadow-sm bg-white" title="Limpieza"><Clock size={16}/></button>
            <button onClick={() => onStatusChange(data.id, 'free')} className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-xl shadow-sm bg-white" title="Liberar"><CheckCircle2 size={16}/></button>
          </div>
        </div>

        <h3 className="text-3xl font-black text-slate-800 tracking-tighter mb-1 uppercase">{String(data.name || data.id)}</h3>
        
        {data.status === 'occupied' && reservation ? (
          <div className="space-y-4 mt-6 animate-in">
            <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 shadow-inner">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Responsable</p>
              <p className="text-lg font-black text-slate-700 truncate">{String(reservation.name)}</p>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => onWhatsApp(reservation)} className="flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-emerald-700 shadow-lg active:scale-95">
                <Send size={14} /> WhatsApp
              </button>
              <button onClick={() => onPDF(reservation)} className="flex items-center justify-center gap-2 py-3 bg-slate-100 text-slate-600 rounded-2xl text-[10px] font-black uppercase hover:bg-slate-200 active:scale-95">
                <FileText size={14} /> PDF
              </button>
            </div>

            <div className="flex justify-between items-end pt-4 border-t border-slate-50 text-slate-900">
              <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Salida</p><p className="text-sm font-black text-red-500">{String(reservation.checkout)}</p></div>
              <div className="text-right"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Seña</p><p className="text-sm font-black text-emerald-600">${String(reservation.deposit)}</p></div>
            </div>
          </div>
        ) : (
          <div className="h-40 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-[2.5rem] mt-6 bg-slate-50/50 text-slate-200 shadow-inner"><Package size={24} /></div>
        )}
      </div>
    </div>
  );
};

export default App;
