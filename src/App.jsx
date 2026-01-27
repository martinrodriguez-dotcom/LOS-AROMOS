import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged, 
  signInWithCustomToken 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query 
} from 'firebase/firestore';
import { 
  LayoutDashboard, 
  CalendarDays, 
  Users, 
  Home, 
  Search, 
  CheckCircle2, 
  Clock, 
  Plus, 
  DollarSign, 
  Send, 
  ChevronLeft, 
  X,
  Wrench, 
  BarChart3, 
  Package, 
  Trash2, 
  FileText, 
  ChevronRight, 
  Download 
} from 'lucide-react';

// --- CONFIGURACIÓN DE FIREBASE ---
const getFirebaseConfig = () => {
  // Prioridad a la configuración del entorno para el funcionamiento del Preview
  if (typeof __firebase_config !== 'undefined' && __firebase_config) {
    return JSON.parse(__firebase_config);
  }
  // Configuración de respaldo para el despliegue final (Netlify)
  return {
    apiKey: "AIzaSyDOeC0me_E0rtDx56ljnihrY8U5JxkCleg",
    authDomain: "los-aromos-4b29b.firebaseapp.com",
    projectId: "los-aromos-4b29b",
    storageBucket: "los-aromos-4b29b.firebasestorage.app",
    messagingSenderId: "969960941827",
    appId: "1:969960941827:web:d2b1863bcd2ee02c026136"
  };
};

const firebaseConfig = getFirebaseConfig();
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// REGLA 1: El appId debe ser un único segmento para que la ruta tenga 5 niveles
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'los-aromos-4b29b';
const appId = rawAppId.replace(/\//g, '_'); 

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
  const [errorStatus, setErrorStatus] = useState(null);

  const [newBooking, setNewBooking] = useState({
    bungalowId: "1", name: '', phone: '', guests: 1, checkin: '', checkout: '', deposit: 0
  });

  // REGLA 3: Autenticación obligatoria antes de cualquier consulta
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) { 
        console.error("Error en Firebase Auth:", err);
        setErrorStatus("Error de autenticación. Asegúrate de habilitar el acceso anónimo en Firebase.");
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // REGLA 1 y 2: Rutas estandarizadas y consultas simples
  useEffect(() => {
    if (!user) return;

    // Ruta de 5 segmentos: artifacts / {appId} / public / data / {coleccion}
    const bRef = collection(db, 'artifacts', appId, 'public', 'data', 'bungalows');
    const unsubB = onSnapshot(bRef, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (data.length === 0) {
        for(let i = 1; i <= 12; i++) {
          setDoc(doc(bRef, i.toString()), { 
            name: `Bungalow ${i.toString().padStart(2, '0')}`, 
            status: 'free' 
          });
        }
      }
      setBungalows(data.sort((a, b) => parseInt(a.id) - parseInt(b.id)));
    }, (err) => {
      console.error("Error Firestore (Bungalows):", err);
      if (err.code === 'permission-denied') setErrorStatus("Permisos de Firestore insuficientes.");
    });

    const rRef = collection(db, 'artifacts', appId, 'public', 'data', 'reservations');
    const unsubR = onSnapshot(rRef, (snap) => {
      setReservations(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error("Error Firestore (Reservas):", err));

    const mRef = collection(db, 'artifacts', appId, 'public', 'data', 'maintenance');
    const unsubM = onSnapshot(mRef, (snap) => {
      setMaintenance(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error("Error Firestore (Mantenimiento):", err));

    return () => { unsubB(); unsubR(); unsubM(); };
  }, [user]);

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
      setNewBooking({ bungalowId: "1", name: '', phone: '', guests: 1, checkin: '', checkout: '', deposit: 0 });
    } catch (err) { 
      console.error("Error guardando reserva:", err);
    }
    setIsProcessing(false);
  };

  const updateStatus = async (id, newStatus) => {
    if (!user) return;
    const bDoc = doc(db, 'artifacts', appId, 'public', 'data', 'bungalows', id.toString());
    await updateDoc(bDoc, { status: newStatus });
  };

  const sendWhatsApp = (res) => {
    const bungalow = bungalows.find(b => b.id === res.bungalowId?.toString());
    const message = `Hola ${res.name}! 👋 Confirmamos tu reserva en *Los Aromos* 🌿%0A%0A🏠 *${bungalow?.name || 'Cabaña'}*%0A📅 *Entrada:* ${res.checkin}%0A📅 *Salida:* ${res.checkout}%0A💰 *Seña:* $${res.deposit}`;
    window.open(`https://wa.me/${res.phone?.replace(/\D/g, '')}?text=${message}`, '_blank');
  };

  const generatePDF = async (res) => {
    const { jsPDF } = await loadJsPDF();
    const pdf = new jsPDF();
    pdf.setFontSize(22);
    pdf.text("LOS AROMOS", 20, 25);
    pdf.setFontSize(10);
    pdf.text("COMPROBANTE DE PAGO DE RESERVA", 20, 32);
    pdf.setFontSize(12);
    pdf.text(`Huesped: ${res.name}`, 20, 50);
    pdf.text(`Unidad: Bungalow ${res.bungalowId}`, 20, 60);
    pdf.text(`Periodo: ${res.checkin} al ${res.checkout}`, 20, 70);
    pdf.setFontSize(16);
    pdf.text(`SENA RECIBIDA: $${res.deposit}`, 20, 90);
    pdf.save(`Recibo_Aromos_${res.name.replace(/\s/g, '_')}.pdf`);
  };

  const stats = useMemo(() => ({
    occupied: bungalows.filter(b => b.status === 'occupied').length,
    free: bungalows.filter(b => b.status === 'free').length,
    mCount: maintenance.filter(m => m.status === 'pending').length,
    income: reservations.reduce((acc, r) => acc + (parseFloat(r.deposit) || 0), 0)
  }), [bungalows, reservations, maintenance]);

  if (errorStatus) return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center">
      <div className="bg-red-500/20 border border-red-500 p-10 rounded-[3rem] max-w-lg shadow-2xl">
        <h2 className="text-3xl font-black mb-4">Problema detectado</h2>
        <p className="text-slate-300 mb-6 font-medium">{errorStatus}</p>
        <div className="text-left bg-slate-900/50 p-6 rounded-2xl text-xs space-y-3 font-mono border border-white/10">
          <p>Para solucionar esto en tu proyecto:</p>
          <ol className="list-decimal list-inside space-y-2 text-slate-400">
            <li>Habilita el inicio de sesión anónimo en Firebase Auth.</li>
            <li>Asegúrate de que las reglas de Firestore permitan acceso a la ruta:</li>
            <li className="text-emerald-400 font-bold">match /artifacts/{"{appId}"}/public/data/{"{col}"}/{"{doc}"}</li>
          </ol>
        </div>
      </div>
    </div>
  );

  if (!user) return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#0F172A] text-white font-black animate-pulse">
      <div className="w-20 h-20 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-8"></div>
      <p className="tracking-widest uppercase text-sm">Sincronizando Gestión Los Aromos...</p>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-slate-900 font-sans">
      <aside className="w-72 bg-[#0F172A] text-white hidden lg:flex flex-col shadow-2xl z-30">
        <div className="p-8 border-b border-slate-800 flex items-center gap-3">
          <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg">
            <Home size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tighter uppercase">Los Aromos</h1>
            <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Admin Panel</p>
          </div>
        </div>
        <nav className="flex-1 p-4 mt-6 space-y-2">
          <NavItem active={activeTab === 'dashboard'} icon={LayoutDashboard} label="Dashboard" onClick={() => setActiveTab('dashboard')} />
          <NavItem active={activeTab === 'maintenance'} icon={Wrench} label="Mantenimiento" onClick={() => setActiveTab('maintenance')} badge={stats.mCount} />
          <NavItem active={activeTab === 'reports'} icon={BarChart3} label="Balance y Caja" onClick={() => setActiveTab('reports')} />
        </nav>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-white border-b border-slate-200 px-8 py-5 flex justify-between items-center z-20 shadow-sm">
          <h2 className="text-2xl font-black uppercase text-slate-800 tracking-tight">
            {activeTab === 'dashboard' ? 'Control de Cabañas' : activeTab === 'maintenance' ? 'Tareas de Servicio' : 'Resumen Financiero'}
          </h2>
          <button onClick={() => setShowAddModal(true)} className="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-xl active:scale-95">
            <Plus size={20} /> Nueva Reserva
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          {activeTab === 'dashboard' && (
            <div className="animate-in fade-in duration-500">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10 text-slate-900">
                <StatCard label="Libres" value={stats.free} color="text-emerald-600" bg="bg-emerald-50" icon={CheckCircle2} />
                <StatCard label="Ocupados" value={stats.occupied} color="text-blue-600" bg="bg-blue-50" icon={Users} />
                <StatCard label="Limpieza" value={stats.mCount} color="text-amber-600" bg="bg-amber-50" icon={Clock} />
                <StatCard label="Caja" value={`$${stats.income}`} color="text-slate-700" bg="bg-white" icon={DollarSign} />
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
          
          {activeTab === 'reports' && (
            <div className="max-w-4xl space-y-8 animate-in">
              <div className="bg-[#0F172A] p-12 rounded-[3.5rem] text-white flex justify-between items-center shadow-2xl">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-emerald-400 mb-2">Recaudación Total Señas</p>
                  <h3 className="text-6xl font-black tracking-tighter">${stats.income}</h3>
                </div>
                <BarChart3 size={72} className="text-slate-800" />
              </div>
            </div>
          )}
        </div>
      </main>

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[4rem] shadow-2xl w-full max-w-6xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col md:flex-row h-[90vh]">
            <div className="md:w-5/12 bg-[#0F172A] p-10 text-white flex flex-col border-r border-slate-800 overflow-y-auto">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-2xl font-black tracking-tight">Ocupación</h3>
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
              <button onClick={() => setShowAddModal(false)} className="absolute top-8 right-8 p-3 bg-slate-50 rounded-full hover:bg-slate-200"><X/></button>
              <h3 className="text-4xl font-black mb-10 tracking-tighter">Nueva Reserva</h3>
              <form onSubmit={handleAddBooking} className="space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Unidad</label>
                  <div className="grid grid-cols-6 gap-2">
                    {bungalows.map(b => (
                      <button type="button" key={b.id} onClick={() => setNewBooking({...newBooking, bungalowId: b.id})} className={`h-12 rounded-xl text-xs font-black border-2 transition-all ${newBooking.bungalowId === b.id ? 'bg-[#0F172A] border-[#0F172A] text-white shadow-xl' : 'bg-slate-50 border-slate-50 text-slate-400'}`}>
                        {String(b.id)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <input type="text" required placeholder="Huesped" className="p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-900" value={newBooking.name} onChange={(e) => setNewBooking({...newBooking, name: e.target.value})} />
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
                <div className="bg-emerald-50 p-10 rounded-[3rem] border border-emerald-100 shadow-inner">
                  <label className="text-[10px] font-black text-emerald-600 uppercase mb-2 block">Seña Cobrada ($)</label>
                  <input type="number" required className="bg-transparent border-none outline-none font-black text-emerald-700 text-6xl w-full" value={newBooking.deposit} onChange={(e) => setNewBooking({...newBooking, deposit: e.target.value})} />
                </div>
                <button type="submit" disabled={isProcessing} className="w-full py-6 bg-[#0F172A] text-white rounded-[2rem] font-black text-xl hover:bg-emerald-600 shadow-2xl transition-all active:scale-95">
                  {isProcessing ? 'Procesando...' : 'Confirmar Reserva'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const NavItem = ({ icon: Icon, label, active, onClick, badge }) => (
  <button onClick={onClick} className={`w-full flex items-center justify-between px-6 py-4 rounded-2xl transition-all ${active ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}>
    <div className="flex items-center gap-4">
      <Icon size={20} />
      <span className="font-bold text-sm">{label}</span>
    </div>
    {badge > 0 && <span className="bg-amber-500 text-[#0F172A] text-[10px] font-black px-2 py-1 rounded-lg">{badge}</span>}
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

const BungalowCard = ({ data, reservation, onStatusChange, onWhatsApp, onPDF }) => {
  const statusStyles = {
    free: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Disponible', dot: 'bg-emerald-500' },
    occupied: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Ocupado', dot: 'bg-blue-500' },
    cleaning: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Limpieza', dot: 'bg-amber-500' }
  };
  const config = statusStyles[data.status] || statusStyles.free;

  return (
    <div className="bg-white rounded-[3.5rem] border border-slate-100 shadow-sm hover:shadow-2xl transition-all duration-500 overflow-hidden group flex flex-col">
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
            <div className="bg-slate-50 p-6 rounded-[2.5rem] border border-slate-100 shadow-inner">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Huesped</p>
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
              <div><p className="text-[10px] font-black text-slate-400 uppercase">Salida</p><p className="text-sm font-black text-red-500">{String(reservation.checkout)}</p></div>
              <div className="text-right"><p className="text-[10px] font-black text-slate-400 uppercase">Seña</p><p className="text-sm font-black text-emerald-600">${String(reservation.deposit)}</p></div>
            </div>
          </div>
        ) : (
          <div className="h-44 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-[3rem] mt-6 bg-slate-50/50 text-slate-200 shadow-inner"><Package size={28} /></div>
        )}
      </div>
    </div>
  );
};

export default App;
