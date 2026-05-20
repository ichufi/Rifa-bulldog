import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithCustomToken, 
  signInAnonymously, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  collection, 
  onSnapshot, 
  updateDoc, 
  writeBatch 
} from 'firebase/firestore';

// --- GLOBALS ---
declare var __firebase_config: any;
declare var __app_id: any;
declare var __initial_auth_token: any;

// --- CONFIGURAÇÃO E INICIALIZAÇÃO DO FIREBASE ---
const hasFirebaseConfig = typeof __firebase_config !== 'undefined';
const firebaseConfig = hasFirebaseConfig ? JSON.parse(__firebase_config) : null;
const app = firebaseConfig ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

export default function App() {
  // --- ESTADOS ---
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [numbers, setNumbers] = useState<Record<number, any>>({});
  const [filter, setFilter] = useState('all'); 
  const [selectedNumber, setSelectedNumber] = useState(null); 
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [pinInput, setPinInput] = useState('');

  // Configurações Gerais da Rifa (salvas e sincronizadas na nuvem)
  const [pixKey, setPixKey] = useState('453.499.178-97');
  const [pixName, setPixName] = useState('Diogo Pereira de Farias');
  const [pixBank, setPixBank] = useState('C6 Bank');
  const [ticketPrice, setTicketPrice] = useState(30.00);
  const [adminPin, setAdminPin] = useState('1234');

  // Formulário do Comprador Comum
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');

  // Formulário de Edição Direta do Admin (Preenchido ao clicar no número)
  const [adminEditName, setAdminEditName] = useState('');
  const [adminEditPhone, setAdminEditPhone] = useState('');
  const [adminEditStatus, setAdminEditStatus] = useState('available');
  
  // Lançador rápido do Admin (Bulk)
  const [adminBulkNumbers, setAdminBulkNumbers] = useState('');
  const [adminBulkName, setAdminBulkName] = useState('');
  const [adminBulkPhone, setAdminBulkPhone] = useState('');
  const [adminBulkStatus, setAdminBulkStatus] = useState('approved');

  // Notificações em Toast
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // Exibir mensagens rápidas
  const showNotification = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000);
  };

  // --- EFEITO 1: AUTENTICAÇÃO SEGURA ANÔNIMA ---
  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Erro ao autenticar com o banco:", err);
        showNotification("Erro de conexão. Tente atualizar a página.", "error");
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (usr) => {
      setUser(usr);
    });
    return () => unsubscribe();
  }, []);

  // --- EFEITO 2: SINCRONIZAÇÃO DAS CONFIGURAÇÕES DA RIFA ---
  useEffect(() => {
    if (!user || !db) return;

    const configRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'settings');
    const unsubscribe = onSnapshot(configRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.pixKey) setPixKey(data.pixKey);
        if (data.pixName) setPixName(data.pixName);
        if (data.pixBank) setPixBank(data.pixBank);
        if (data.ticketPrice) setTicketPrice(parseFloat(data.ticketPrice));
        if (data.adminPin) setAdminPin(data.adminPin);
      } else {
        // Criação inicial das configurações com base no cartaz do Chico
        setDoc(configRef, {
          pixKey: '453.499.178-97',
          pixName: 'Diogo Pereira de Farias',
          pixBank: 'C6 Bank',
          ticketPrice: 30.00,
          adminPin: '1234'
        }).catch(err => console.error("Falha ao salvar config padrão:", err));
      }
    }, (error) => {
      console.error("Erro na leitura de configurações:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // --- EFEITO 3: SINCRONIZAÇÃO EM TEMPO REAL DOS 200 NÚMEROS ---
  useEffect(() => {
    if (!user || !db) return;

    const ticketsCol = collection(db, 'artifacts', appId, 'public', 'data', 'tickets');
    const unsubscribe = onSnapshot(ticketsCol, (snapshot) => {
      const serverData = {};
      snapshot.forEach((doc) => {
        serverData[doc.id] = doc.data();
      });

      // Reconstrói a lista garantindo todos os 200 slots preenchidos
      const completeList = {};
      for (let i = 1; i <= 200; i++) {
        completeList[i] = serverData[i] || {
          number: i,
          status: 'available',
          name: '',
          phone: '',
          createdAt: null
        };
      }

      setNumbers(completeList);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao ler números do servidor:", error);
      showNotification("Erro ao obter atualizações da rifa.", "error");
    });

    return () => unsubscribe();
  }, [user]);

  // --- EFEITO 4: INICIALIZAÇÃO LOCAL (SEM FIREBASE) ---
  useEffect(() => {
    if (db) return; // Se tem Firebase, não executa isso
    const completeList = {};
    for (let i = 1; i <= 200; i++) {
      completeList[i] = {
        number: i,
        status: 'available',
        name: '',
        phone: '',
        createdAt: null
      };
    }
    setNumbers(completeList);
  }, []);

  // --- PREENCHE OS CAMPOS DE EDIÇÃO QUANDO O ADM CLICA ---
  useEffect(() => {
    if (selectedNumber && numbers[selectedNumber]) {
      const item = numbers[selectedNumber];
      setAdminEditName(item.name || '');
      setAdminEditPhone(item.phone || '');
      setAdminEditStatus(item.status || 'available');
    }
  }, [selectedNumber, numbers]);

  // --- ATUALIZAR CONFIGURAÇÕES ---
  const saveRemoteConfig = async (newKey, newName, newBank, newPrice, newPin) => {
    if (!user) return;
    try {
      const configRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'settings');
      await setDoc(configRef, {
        pixKey: newKey,
        pixName: newName,
        pixBank: newBank,
        ticketPrice: parseFloat(newPrice),
        adminPin: newPin
      }, { merge: true });
      showNotification("Configurações atualizadas com sucesso!");
    } catch (err) {
      console.error(err);
      showNotification("Erro ao salvar configurações.", "error");
    }
  };

  // --- AUXILIAR DE COPIAR PIX ---
  const handleCopyPix = () => {
    const tempInput = document.createElement('textarea');
    tempInput.value = pixKey;
    document.body.appendChild(tempInput);
    tempInput.select();
    try {
      document.execCommand('copy');
      showNotification('PIX copiado! Cole no app do seu banco para pagar.');
    } catch (err) {
      showNotification('Não foi possível copiar automaticamente.', 'error');
    }
    document.body.removeChild(tempInput);
  };

  // --- COMPARTILHAR LINK DO APP ---
  const handleShareLink = () => {
    const shareUrl = window.location.href;
    const tempInput = document.createElement('textarea');
    tempInput.value = shareUrl;
    document.body.appendChild(tempInput);
    tempInput.select();
    try {
      document.execCommand('copy');
      showNotification('Link da Rifa copiado!');
    } catch (err) {
      showNotification('Erro ao copiar link.', 'error');
    }
    document.body.removeChild(tempInput);
  };

  // --- RESERVA DO COMPRADOR COMUM ---
  const handleReserve = async (e) => {
    e.preventDefault();
    if (!buyerName.trim()) {
      showNotification('Preencha seu nome completo para a reserva.', 'error');
      return;
    }
    if (!user) return;

    try {
      const ticketRef = doc(db, 'artifacts', appId, 'public', 'data', 'tickets', String(selectedNumber));
      
      // Proteção de concorrência local rápida
      if (numbers[selectedNumber] && numbers[selectedNumber].status !== 'available') {
        showNotification('Esse número já foi escolhido por outra pessoa!', 'error');
        setSelectedNumber(null);
        return;
      }

      await setDoc(ticketRef, {
        number: selectedNumber,
        status: 'pending', // Deixa em pendente de aprovação
        name: buyerName,
        phone: buyerPhone,
        createdAt: new Date().toISOString()
      });

      showNotification(`Número ${selectedNumber} reservado! Aguardando validação.`);
      setSelectedNumber(null);
      setBuyerName('');
      setBuyerPhone('');
    } catch (err) {
      console.error(err);
      showNotification("Erro ao enviar a reserva.", "error");
    }
  };

  // --- SALVAR EDIÇÃO DIRETA DO ADM (CLICOU NO NÚMERO) ---
  const handleAdminSaveSingle = async (e) => {
    e.preventDefault();
    if (!user || !selectedNumber) return;

    try {
      const ticketRef = doc(db, 'artifacts', appId, 'public', 'data', 'tickets', String(selectedNumber));
      
      if (adminEditStatus === 'available') {
        await setDoc(ticketRef, {
          number: selectedNumber,
          status: 'available',
          name: '',
          phone: '',
          createdAt: null
        });
      } else {
        await setDoc(ticketRef, {
          number: selectedNumber,
          status: adminEditStatus,
          name: adminEditName,
          phone: adminEditPhone,
          createdAt: new Date().toISOString()
        });
      }

      showNotification(`Número ${selectedNumber} atualizado pelo administrador!`);
      setSelectedNumber(null);
    } catch (err) {
      console.error(err);
      showNotification("Erro ao atualizar número.", "error");
    }
  };

  // --- REMOVER/LIBERAR NÚMERO COM UM TOQUE (ADMIN) ---
  const handleAdminQuickRelease = async () => {
    if (!user || !selectedNumber) return;
    try {
      const ticketRef = doc(db, 'artifacts', appId, 'public', 'data', 'tickets', String(selectedNumber));
      await setDoc(ticketRef, {
        number: selectedNumber,
        status: 'available',
        name: '',
        phone: '',
        createdAt: null
      });
      showNotification(`Número ${selectedNumber} foi limpo e liberado!`, 'info');
      setSelectedNumber(null);
    } catch (err) {
      console.error(err);
      showNotification("Erro ao limpar dados.", "error");
    }
  };

  // --- LOGIN DO ADMINISTRADOR ---
  const handleAdminLogin = (e) => {
    e.preventDefault();
    if (pinInput === adminPin) {
      setIsAdmin(true);
      setShowAdminLogin(false);
      setPinInput('');
      showNotification('Painel de Administrador ativado!');
    } else {
      showNotification('PIN incorreto.', 'error');
    }
  };

  // --- REGISTRO MANUAL DE VÁRIOS NÚMEROS DE UMA VEZ (LOTE) ---
  const handleBulkAdd = async (e) => {
    e.preventDefault();
    if (!adminBulkNumbers.trim() || !adminBulkName.trim()) {
      showNotification('Informe os números e o nome do comprador.', 'error');
      return;
    }
    if (!user) return;

    const parts = adminBulkNumbers.split(',');
    const parsedNumbers = [];

    parts.forEach(part => {
      const cleanPart = part.trim();
      if (cleanPart.includes('-')) {
        const range = cleanPart.split('-');
        if (range.length === 2) {
          const start = parseInt(range[0].trim(), 10);
          const end = parseInt(range[1].trim(), 10);
          if (!isNaN(start) && !isNaN(end) && start <= end) {
            for (let i = start; i <= end; i++) parsedNumbers.push(i);
          }
        }
      } else {
        const num = parseInt(cleanPart, 10);
        if (!isNaN(num)) parsedNumbers.push(num);
      }
    });

    const validNumbers = [...new Set(parsedNumbers)].filter(n => n >= 1 && n <= 200);

    if (validNumbers.length === 0) {
      showNotification('Informe números válidos no intervalo de 1 a 200.', 'error');
      return;
    }

    try {
      const batch = writeBatch(db);
      validNumbers.forEach(n => {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'tickets', String(n));
        batch.set(docRef, {
          number: n,
          status: adminBulkStatus,
          name: adminBulkName,
          phone: adminBulkPhone,
          createdAt: new Date().toISOString()
        });
      });

      await batch.commit();
      showNotification(`${validNumbers.length} número(s) registrados simultaneamente!`);
      setAdminBulkNumbers('');
      setAdminBulkName('');
      setAdminBulkPhone('');
    } catch (err) {
      console.error(err);
      showNotification("Erro ao salvar números em lote.", "error");
    }
  };

  // --- RESETAR TODA A RIFA DO CHICO ---
  const handleResetAll = async () => {
    if (!user) return;
    const confirmReset = window.confirm('🚨 ALERTA: Você tem certeza que quer APAGAR todos os compradores e limpar a Rifa do Chico por completo?');
    if (!confirmReset) return;

    try {
      const batch = writeBatch(db);
      for (let i = 1; i <= 200; i++) {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'tickets', String(i));
        batch.set(docRef, {
          number: i,
          status: 'available',
          name: '',
          phone: '',
          createdAt: null
        });
      }
      await batch.commit();
      showNotification('Rifa redefinida para o estado inicial.', 'info');
    } catch (err) {
      console.error(err);
      showNotification("Erro ao reiniciar rifa.", "error");
    }
  };

  // --- CÁLCULO DE ESTATÍSTICAS ---
  const stats: any = Object.values(numbers).reduce((acc: any, curr: any) => {
    acc[curr.status] += 1;
    return acc;
  }, { available: 0, pending: 0, approved: 0 });

  const progressPercent = Math.round(((stats.approved + stats.pending) / 200) * 100);
  const totalArrecadado = stats.approved * ticketPrice;
  const totalPendente = stats.pending * ticketPrice;

  // --- TELA DE CARREGAMENTO ---
  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f2eb] flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 border-4 border-[#4a2e1b] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-[#4a2e1b] font-bold text-sm tracking-wider animate-pulse">Sincronizando com a Nuvem...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f2eb] text-[#3d2314] font-sans antialiased select-none flex flex-col">
      
      {/* ALERTA FLUTUANTE (TOAST) */}
      {toast.show && (
        <div className="fixed top-5 right-5 z-50 flex items-center p-4 rounded-xl shadow-xl transition-all border text-white bg-[#54341f] border-[#70482e] max-w-xs sm:max-w-md">
          <span className="text-xs sm:text-sm font-semibold">{toast.message}</span>
        </div>
      )}

      {/* CABEÇALHO */}
      <header className="bg-[#4a2e1b] text-[#f7f2eb] py-4 px-4 sm:px-8 shadow-lg border-b-4 border-[#bfa36f] flex flex-col sm:flex-row justify-between items-center shrink-0 z-10 gap-3 sm:gap-0">
        <div className="flex flex-col text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
            <span className="bg-[#bfa36f] text-[#4a2e1b] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter">
              🐾 Campanha do Chico
            </span>
            <span className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter">
              ● Live
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-[#fcedc0] leading-none mb-1">
            RIFA DO CHICO
          </h1>
          <p className="text-xs font-medium text-[#d9c49c] italic opacity-80">
            Ajudando o nosso guerreiro no tratamento de saúde
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3 text-right">
          <div className="hidden sm:flex flex-col justify-center">
            <span className="text-[10px] uppercase font-bold text-[#bfa36f] opacity-70">Arrecadado</span>
            <span className="text-xl font-black text-white">R$ {totalArrecadado.toFixed(2)}</span>
          </div>
          <div className="hidden sm:block w-px h-10 bg-white/10 mx-2"></div>
          <div className="flex gap-2">
            <button 
              onClick={handleShareLink}
              className="bg-[#bfa36f] hover:bg-[#d4b987] text-[#4a2e1b] text-xs font-black px-4 py-2 rounded-lg transition flex items-center gap-1.5 shadow-md"
            >
              <span>🔗</span> <span className="hidden sm:inline-block leading-none">COMPARTILHAR</span>
            </button>
            <button 
              onClick={() => (isAdmin ? setIsAdmin(false) : setShowAdminLogin(true))}
              className="bg-transparent hover:bg-white/5 border border-white/20 text-[#d9c49c] text-xs font-bold px-3 py-2 rounded-lg transition"
              title={isAdmin ? "Sair" : "Admin"}
            >
              {isAdmin ? "🔒 SAIR" : "🔐"}
            </button>
          </div>
        </div>
      </header>

      {/* BODY PRINCIPAL DIVIDIDO */}
      <main className="flex flex-col flex-1 p-4 sm:p-6 gap-6 sm:gap-8 bg-gradient-to-b from-white/10 to-transparent max-w-5xl mx-auto w-full">
        
        {/* 1. CAUSA EM CIMA (Meta Solidária) */}
        <div className="bg-white rounded-[24px] p-5 sm:p-8 border border-[#e6dcce] shadow-sm flex flex-col md:flex-row gap-6 items-center shrink-0">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-[#fcede0] rounded-2xl flex items-center justify-center text-3xl sm:text-4xl shrink-0">🐕</div>
          <div className="flex-1 space-y-3 w-full">
            <div>
              <h3 className="text-lg sm:text-xl font-black text-[#4a2e1b] leading-tight flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                Nosso Guerreiro Chico precisa de nós!
                <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-md inline-block w-max">Meta Solidária</span>
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">O Chico perdeu 12kg e está enfrentando uma batalha pesada de saúde. Todo o valor desta rifa é para a sua cirurgia e exames.</p>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] sm:text-xs font-bold text-[#4a2e1b]">
                <span>Progresso da Arrecadação</span>
                <span>{progressPercent}% Reservado</span>
              </div>
              <div className="w-full h-3 bg-[#f5f0e8] rounded-full overflow-hidden border border-[#e6dcce]">
                <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-700 transition-all duration-700" style={{ width: `${progressPercent}%` }}></div>
              </div>
            </div>
            <div className="bg-[#fcf9f5] border border-[#f0e6d7] p-3 rounded-xl text-[10px] sm:text-xs text-[#6e5648] leading-relaxed">
              <strong className="text-[#4a2e1b] uppercase">🎁 Premiação:</strong> BOLA OFICIAL DA COPA 2026 ou CAMISA OFICIAL DA SELEÇÃO + ÁLBUM PET PERSONALIZADO.
            </div>
          </div>
        </div>

        {/* 2. PREÇO E PIX NO MEIO */}
        <div className="bg-[#fcede0] border border-[#e8d2bd] p-5 sm:p-8 rounded-[24px] shadow-sm flex flex-col md:flex-row gap-6 md:gap-10 items-center shrink-0">
          <div className="flex-1 grid grid-cols-2 gap-3 w-full text-center">
            <div className="bg-white/60 rounded-xl p-3 sm:p-4 border border-[#d9c49c]">
              <span className="text-[10px] sm:text-xs uppercase font-bold text-[#8a5d3b] block mb-1">Preço do Número</span>
              <span className="text-xl sm:text-3xl font-black text-[#4a2e1b]">R$ {ticketPrice.toFixed(2)}</span>
            </div>
            <div className="bg-white/60 rounded-xl p-3 sm:p-4 border border-[#d9c49c]">
              <span className="text-[10px] sm:text-xs uppercase font-bold text-[#8a5d3b] block mb-1">Total Confirmado</span>
              <span className="text-xl sm:text-3xl font-black text-emerald-700">R$ {totalArrecadado.toFixed(2)}</span>
            </div>
          </div>
          
          <div className="flex-1 w-full bg-white border border-[#d9c49c] rounded-2xl p-4 sm:p-5 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-[#8a5d3b]"></div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] sm:text-xs uppercase font-bold text-slate-400">Chave PIX Oficial</span>
              <button 
                onClick={handleCopyPix} 
                className="text-[10px] sm:text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-md uppercase hover:bg-emerald-100 transition border border-emerald-100 flex items-center gap-1 active:scale-95"
              >
                <span>📋</span> Copiar
              </button>
            </div>
            <p className="font-mono text-sm sm:text-base font-black text-[#4a2e1b] truncate mb-3 select-all" title={pixKey}>{pixKey}</p>
            <div className="pt-3 border-t border-slate-100 text-[10px] sm:text-xs text-[#6e5648] flex flex-col gap-1">
              <p>Beneficiário: <strong className="text-[#4a2e1b]">{pixName}</strong></p>
              <p>Banco: <strong className="text-[#4a2e1b]">{pixBank}</strong></p>
            </div>
          </div>
        </div>

        {/* AJUSTES ADMIN (SE ATIVO) */}
        {isAdmin && (
          <section className="bg-[#ebdcc5] border-2 border-[#b59469] rounded-[24px] p-5 shadow-inner shrink-0">
            <div className="flex items-center justify-between border-b border-[#c9b7a1] pb-3 mb-4">
              <h2 className="text-sm sm:text-base font-bold text-[#4a2e1b] flex items-center gap-1.5">
                <span>🛠️</span> Painel Administrativo
              </h2>
              <button 
                onClick={handleResetAll}
                className="bg-red-800 hover:bg-red-700 text-white text-[10px] sm:text-xs font-bold px-3 py-1.5 rounded-lg transition"
              >
                Reset Rifa
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white/45 p-3 rounded-xl border border-[#d6c7b3] mb-4">
              <div>
                <label className="block text-[9px] sm:text-[10px] font-bold uppercase text-[#543c2c] mb-1">Chave Pix</label>
                <input type="text" value={pixKey} onChange={(e) => setPixKey(e.target.value)} className="w-full border border-[#c4b39b] rounded-lg px-2 py-1.5 text-xs text-[#4a2e1b]" />
              </div>
              <div>
                <label className="block text-[9px] sm:text-[10px] font-bold uppercase text-[#543c2c] mb-1">Titular Pix</label>
                <input type="text" value={pixName} onChange={(e) => setPixName(e.target.value)} className="w-full border border-[#c4b39b] rounded-lg px-2 py-1.5 text-xs text-[#4a2e1b]" />
              </div>
              <div>
                <label className="block text-[9px] sm:text-[10px] font-bold uppercase text-[#543c2c] mb-1">Banco</label>
                <input type="text" value={pixBank} onChange={(e) => setPixBank(e.target.value)} className="w-full border border-[#c4b39b] rounded-lg px-2 py-1.5 text-xs text-[#4a2e1b]" />
              </div>
              <div className="flex items-end">
                <button onClick={() => saveRemoteConfig(pixKey, pixName, pixBank, ticketPrice, adminPin)} className="w-full bg-emerald-700 hover:bg-emerald-600 transition text-white text-[10px] sm:text-xs font-bold py-2 rounded-lg">
                  Confirmar Pix
                </button>
              </div>
            </div>

            <form onSubmit={handleBulkAdd} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end bg-white/45 p-3 rounded-xl border border-[#d6c7b3]">
              <div className="md:col-span-4">
                <label className="block text-[9px] sm:text-[10px] font-bold uppercase text-[#543c2c] mb-1">Lote (Ex: 10, 24, 40-45)</label>
                <input type="text" value={adminBulkNumbers} onChange={(e) => setAdminBulkNumbers(e.target.value)} placeholder="Ex: 5, 20-25" className="w-full border border-[#c4b39b] rounded-lg px-2 py-1.5 text-xs text-[#4a2e1b]" />
              </div>
              <div className="md:col-span-3">
                <label className="block text-[9px] sm:text-[10px] font-bold uppercase text-[#543c2c] mb-1">Nome</label>
                <input type="text" value={adminBulkName} onChange={(e) => setAdminBulkName(e.target.value)} placeholder="Comprador" className="w-full border border-[#c4b39b] rounded-lg px-2 py-1.5 text-xs focus:outline-none text-[#4a2e1b]" />
              </div>
              <div className="md:col-span-3">
                <label className="block text-[9px] sm:text-[10px] font-bold uppercase text-[#543c2c] mb-1">Status Lote</label>
                <select value={adminBulkStatus} onChange={(e) => setAdminBulkStatus(e.target.value)} className="w-full border border-[#c4b39b] rounded-lg px-2 py-1.5 text-xs focus:outline-none text-[#4a2e1b]">
                  <option value="approved">Pago</option>
                  <option value="pending">Pendente</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <button type="submit" className="w-full bg-[#4a2e1b] hover:bg-[#5c3a22] transition text-white text-[10px] sm:text-xs font-bold py-2 rounded-lg">Salvar Lote</button>
              </div>
            </form>
          </section>
        )}

        {/* 3. NÚMEROS (FILTROS E GRID) EMBAIXO */}
        <section className="flex flex-col gap-4">
          
          <div className="text-center sm:text-left mb-1 px-2">
            <h2 className="text-[#4a2e1b] font-black text-xl sm:text-2xl">Escolha seus números da sorte abaixo 👇</h2>
            <p className="text-xs text-slate-500 mt-1">Toque no número desejado para reservar.</p>
          </div>

          {/* FILTROS */}
          <div className="flex flex-col sm:flex-row items-center justify-between bg-white/50 p-2 sm:p-3 rounded-2xl border border-[#e6dcce] gap-3">
            <div className="flex gap-2 sm:gap-4 text-xs font-bold overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-hide">
              <button 
                onClick={() => setFilter('all')} 
                className={`pb-1 px-1 border-b-2 transition whitespace-nowrap ${filter === 'all' ? 'text-[#4a2e1b] border-[#4a2e1b]' : 'text-slate-400 border-transparent hover:text-[#4a2e1b]'}`}
              >
                Todos (200)
              </button>
              <button 
                onClick={() => setFilter('available')} 
                className={`pb-1 px-1 border-b-2 transition whitespace-nowrap ${filter === 'available' ? 'text-[#4a2e1b] border-[#4a2e1b]' : 'text-slate-400 border-transparent hover:text-[#4a2e1b]'}`}
              >
                Livres ({stats.available})
              </button>
              <button 
                onClick={() => setFilter('pending')} 
                className={`pb-1 px-1 border-b-2 transition whitespace-nowrap ${filter === 'pending' ? 'text-amber-600 border-amber-600' : 'text-slate-400 border-transparent hover:text-amber-600'}`}
              >
                Pendentes ({stats.pending})
              </button>
              <button 
                onClick={() => setFilter('approved')} 
                className={`pb-1 px-1 border-b-2 transition whitespace-nowrap ${filter === 'approved' ? 'text-emerald-700 border-emerald-700' : 'text-slate-400 border-transparent hover:text-emerald-700'}`}
              >
                Pagos ({stats.approved})
              </button>
            </div>
            
            <div className="hidden md:flex items-center gap-4 text-[10px] font-bold opacity-60 uppercase shrink-0">
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#fcfbf9] border border-slate-300"></span> Livre</div>
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-500"></span> Pendente</div>
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#4a2e1b]"></span> Pago</div>
            </div>
          </div>

          {/* GRID */}
          <div className="bg-white rounded-[24px] shadow-sm border border-[#e6dcce] p-4 sm:p-6 mb-8">
            <div className="grid grid-cols-5 sm:grid-cols-10 lg:grid-cols-20 gap-1.5 sm:gap-2">
              {(Object.values(numbers) as any[])
                .filter((item: any) => filter === 'all' ? true : item.status === filter)
                .map((item: any) => {
                  let cardStyle = "bg-[#fcfbf9] text-[#4a2e1b] border border-[#e3dacd] hover:border-[#4a2e1b]";
                  if (item.status === 'pending') {
                    cardStyle = "bg-amber-500 text-white border border-amber-600 animate-pulse";
                  } else if (item.status === 'approved') {
                    cardStyle = "bg-[#4a2e1b] text-[#f4ebd9] border border-black/10";
                  }
                  return (
                    <button
                      key={item.number}
                      onClick={() => setSelectedNumber(item.number)}
                      className={`aspect-square rounded-md flex items-center justify-center text-[10px] sm:text-xs font-black transition transform active:scale-95 ${cardStyle}`}
                    >
                      {item.number}
                    </button>
                  );
                })}
            </div>
          </div>
        </section>

      </main>

      {/* RODAPÉ */}
      <footer className="bg-[#4a2e1b]/5 py-3 px-4 sm:px-8 flex flex-col sm:flex-row justify-between items-center text-[10px] text-[#8c7466] border-t border-[#e6dcce] shrink-0 gap-2 sm:gap-0">
        <div className="flex gap-2 sm:gap-4 font-medium">
          <span>Sorteio via Loteria Federal</span>
          <span>•</span>
          <span>Prestação de contas transparente</span>
        </div>
        <div className="font-bold text-[#4a2e1b]">
          🐾 POR ELE, POR AMOR! 🐾
        </div>
      </footer>

      {/* MODAL RESERVA E EDIÇÃO (SLEEK) */}
      {selectedNumber !== null && (() => {
        const item = numbers[selectedNumber];
        return (
          <div className="fixed inset-0 bg-[#29170e]/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#fcfbf9] w-full max-w-sm rounded-[24px] overflow-hidden shadow-2xl border border-[#e6dcce] animate-in zoom-in-95 duration-150">
              
              <div className="px-5 py-4 border-b border-[#e6dcce] flex items-center justify-between bg-white text-[#4a2e1b]">
                <div className="flex items-center gap-3">
                  <span className="bg-[#4a2e1b] text-white text-xs w-8 h-8 rounded-lg flex items-center justify-center font-black">
                    {selectedNumber}
                  </span>
                  <span className="font-bold text-sm">{isAdmin ? "Admin (Editar)" : "Reserva"}</span>
                </div>
                <button onClick={() => setSelectedNumber(null)} className="text-slate-400 hover:text-[#4a2e1b] font-bold text-lg transition">✕</button>
              </div>

              <div className="p-5">
                {isAdmin ? (
                  <form onSubmit={handleAdminSaveSingle} className="space-y-4">
                    <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-2 text-center text-[10px] font-semibold">
                      ✍️ Digite o nome da pessoa abaixo
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#8a5d3b] uppercase mb-1">Nome do Comprador</label>
                      <input type="text" value={adminEditName} onChange={(e) => setAdminEditName(e.target.value)} placeholder="Ex: Maria" className="w-full bg-white border border-[#d6cbbe] rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#bfa36f] text-[#4a2e1b] font-bold" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#8a5d3b] uppercase mb-1">Contato (Opcional)</label>
                      <input type="text" value={adminEditPhone} onChange={(e) => setAdminEditPhone(e.target.value)} placeholder="(00) 00000-0000" className="w-full bg-white border border-[#d6cbbe] rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#bfa36f] text-[#4a2e1b]" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#8a5d3b] uppercase mb-1">Status Interno</label>
                      <div className="grid grid-cols-3 gap-2">
                        <button type="button" onClick={() => setAdminEditStatus('available')} className={`py-1.5 rounded-xl text-[10px] font-bold border transition ${adminEditStatus === 'available' ? 'bg-[#fcfbf9] text-slate-700 border-slate-400 shadow-sm' : 'bg-white text-gray-400 border-transparent'}`}>Livre</button>
                        <button type="button" onClick={() => setAdminEditStatus('pending')} className={`py-1.5 rounded-xl text-[10px] font-bold border transition ${adminEditStatus === 'pending' ? 'bg-amber-500 text-white border-amber-600 shadow-sm' : 'bg-white text-gray-400 border-transparent'}`}>Pendente</button>
                        <button type="button" onClick={() => setAdminEditStatus('approved')} className={`py-1.5 rounded-xl text-[10px] font-bold border transition ${adminEditStatus === 'approved' ? 'bg-[#4a2e1b] text-white border-[#382213] shadow-sm' : 'bg-white text-gray-400 border-transparent'}`}>Pago</button>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button type="button" onClick={handleAdminQuickRelease} className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold text-[10px] px-3 py-2 rounded-xl transition">Zerar</button>
                      <button type="submit" className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-[10px] py-2 rounded-xl shadow transition">Salvar</button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-4">
                    {item.status === 'available' && (
                      <div className="space-y-4">
                        <div className="bg-[#fcede0] border border-[#e8d2bd] rounded-xl p-4 text-[10px] text-[#594439] space-y-2">
                          <p className="font-bold text-[#8a5d3b] uppercase tracking-wider mb-2 text-center text-[10px]">Já copiou a chave PIX? 👇</p>
                          <div className="bg-white border border-[#d9c49c] rounded-lg p-2.5 flex justify-between items-center w-full">
                            <span className="font-mono text-[11px] text-[#4a2e1b] font-black truncate max-w-[150px]">{pixKey}</span>
                            <button onClick={handleCopyPix} className="bg-[#4a2e1b] hover:bg-[#593923] text-white text-[9px] font-bold px-2 py-1 rounded transition uppercase">Copiar</button>
                          </div>
                        </div>

                        <form onSubmit={handleReserve} className="space-y-3 pt-1">
                          <p className="text-[10px] font-bold text-[#8a5d3b] uppercase text-center">Informe seu nome e confirme</p>
                          <div>
                            <input type="text" required value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Seu Nome Completo" className="w-full bg-white border border-[#d6cbbe] rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#bfa36f] text-center font-bold" />
                          </div>
                          <div>
                            <input type="text" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="WhatsApp ou Telefone (Opcional)" className="w-full bg-white border border-[#d6cbbe] rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#bfa36f] text-center" />
                          </div>
                          <button type="submit" className="w-full bg-[#4a2e1b] hover:bg-[#593923] text-white font-black text-[11px] py-3 rounded-xl shadow-md transition mt-2">
                            RESERVAR AGORA O {selectedNumber}
                          </button>
                        </form>
                      </div>
                    )}

                    {item.status === 'pending' && (
                      <div className="space-y-3 text-center py-5">
                        <div className="text-3xl mb-2">⏳</div>
                        <h4 className="text-sm font-bold text-amber-800 uppercase tracking-tight">Em Análise</h4>
                        <p className="text-[11px] text-[#6e5648] px-2 leading-relaxed">
                          Reservado para <strong>{item.name ? item.name : 'Alguém'}</strong>.<br/>Aguardando validação do PIX da organização.
                        </p>
                      </div>
                    )}

                    {item.status === 'approved' && (
                      <div className="space-y-3 text-center py-5">
                        <div className="text-3xl mb-2">🎉</div>
                        <h4 className="text-sm font-bold text-emerald-800 uppercase tracking-tight">Ponto Confirmado!</h4>
                        <p className="text-[11px] text-[#6e5648] px-2 leading-relaxed">
                          Este número pertence a <strong>{item.name ? item.name : 'Alguém'}</strong>.<br/>Boa sorte e obrigado por ajudar o Chico!
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL ADMIN LOGIN */}
      {showAdminLogin && (
        <div className="fixed inset-0 bg-[#29170e]/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-xs rounded-[24px] p-6 shadow-2xl border border-[#ebdcc5] animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-4 border-b pb-3 border-slate-100">
              <h3 className="font-bold text-[#4a2e1b] text-sm">Organizador</h3>
              <button onClick={() => { setShowAdminLogin(false); setPinInput(''); }} className="text-slate-400 font-bold hover:text-[#4a2e1b]">✕</button>
            </div>
            <form onSubmit={handleAdminLogin} className="space-y-3">
              <input type="password" required value={pinInput} onChange={(e) => setPinInput(e.target.value)} placeholder="Digite o PIN (1234)" className="w-full bg-[#fcf9f5] border border-[#d6cbbe] rounded-xl px-3 py-2.5 text-center text-sm font-bold tracking-widest focus:outline-none" />
              <button type="submit" className="w-full bg-[#4a2e1b] text-white font-bold text-xs py-2.5 rounded-xl transition hover:bg-[#5a3b25]">
                ENTRAR
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
