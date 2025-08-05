import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, query } from 'firebase/firestore';
import { Plus, Edit, Trash2, Filter, XCircle, DollarSign, CalendarDays } from 'lucide-react';

// Configuração do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDdcmVVE3QbiqWb8iWnh9yQLQGLGUxbS5E",
  authDomain: "pautas-883a2.firebaseapp.com",
  databaseURL: "https://pautas-883a2-default-rtdb.firebaseio.com",
  projectId: "pautas-883a2",
  storageBucket: "pautas-883a2.firebasestorage.app",
  messagingSenderId: "1094585523363",
  appId: "1:1094585523363:web:dc839245de3d314fb13316",
  measurementId: "G-BPHTTN0GV9"
};

// Inicialização dos serviços do Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = firebaseConfig.appId;

// Função para calcular a previsão de pagamento baseada em uma data.
const calcularPrevisaoPagamento = (dataString) => {
    if (!dataString) return '';
    
    const data = new Date(dataString + 'T00:00:00');
    const ano = data.getFullYear();
    const mes = data.getMonth(); // Mês é 0-11
    const dia = data.getDate();

    let dataFechamento;

    if (dia <= 15) {
        // 1ª Quinzena: o fechamento é no dia 15
        dataFechamento = new Date(ano, mes, 15);
    } else {
        // 2ª Quinzena: o fechamento é no último dia do mês.
        dataFechamento = new Date(ano, mes + 1, 0);
    }

    // Adiciona 20 dias à data de fechamento
    dataFechamento.setDate(dataFechamento.getDate() + 20);

    // Retorna a data no formato YYYY-MM-DD para salvar no banco
    return dataFechamento.toISOString().split('T')[0];
};

const showConfirmation = (message) => {
    return window.confirm(message);
};

export default function App() {
    const [pautas, setPautas] = useState([]);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [userId, setUserId] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentPauta, setCurrentPauta] = useState(null);
    const [filters, setFilters] = useState({
        startDate: '',
        endDate: '',
        station: '',
        status: '',
        solicitante: '',
    });

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setUserId(user.uid);
                setIsAuthReady(true);
            } else {
                try {
                    const userCredential = await signInAnonymously(auth);
                    setUserId(userCredential.user.uid);
                    setIsAuthReady(true);
                } catch (error) {
                    console.error("Erro na autenticação anônima:", error);
                }
            }
        });
        return () => unsubscribeAuth();
    }, []);

    useEffect(() => {
        if (!isAuthReady || !userId) return;
        const pautasCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/pautas`);
        const q = query(pautasCollectionRef);
        const unsubscribePautas = onSnapshot(q, (querySnapshot) => {
            const pautasData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            pautasData.sort((a, b) => {
                const dateA = a.date ? new Date(a.date) : 0;
                const dateB = b.date ? new Date(b.date) : 0;
                return dateB - dateA;
            });
            setPautas(pautasData);
        }, (error) => {
            console.error("Erro ao buscar pautas: ", error);
        });
        return () => unsubscribePautas();
    }, [isAuthReady, userId]);

    const handleSavePauta = async (pautaData) => {
        if (!userId) return;

        const pautaParaSalvar = {
            ...pautaData,
            value: parseFloat(pautaData.value) || 0,
            prevPagamento: calcularPrevisaoPagamento(pautaData.date)
        };
        
        const pautasCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/pautas`);
        if (pautaData.id) {
            const pautaDocRef = doc(db, `artifacts/${appId}/users/${userId}/pautas`, pautaData.id);
            await updateDoc(pautaDocRef, pautaParaSalvar);
        } else {
            await addDoc(pautasCollectionRef, pautaParaSalvar);
        }
        setIsModalOpen(false);
        setCurrentPauta(null);
    };

    const handleDeletePauta = async (pautaId) => {
        const confirmation = await showConfirmation("Tem certeza que deseja excluir esta pauta?");
        if (confirmation) {
            const pautaDocRef = doc(db, `artifacts/${appId}/users/${userId}/pautas`, pautaId);
            await deleteDoc(pautaDocRef);
        }
    };

    const openModalToAdd = () => {
        setCurrentPauta(null);
        setIsModalOpen(true);
    };

    const openModalToEdit = (pauta) => {
        setCurrentPauta(pauta);
        setIsModalOpen(true);
    };

    const filteredPautas = useMemo(() => {
        return pautas.filter(pauta => {
            if (!pauta.date) return false;
            const pautaDate = new Date(pauta.date + 'T00:00:00');
            const startDate = filters.startDate ? new Date(filters.startDate + 'T00:00:00') : null;
            const endDate = filters.endDate ? new Date(filters.endDate + 'T23:59:59') : null;
            
            if (startDate && pautaDate < startDate) return false;
            if (endDate && pautaDate > endDate) return false;
            if (filters.station && pauta.station !== filters.station) return false;
            if (filters.status && pauta.status !== filters.status) return false;
            if (filters.solicitante && !pauta.solicitante?.toLowerCase().includes(filters.solicitante.toLowerCase())) return false;
            
            return true;
        });
    }, [pautas, filters]);

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const clearFilters = () => {
        setFilters({ startDate: '', endDate: '', station: '', status: '', solicitante: '' });
    };

    if (!isAuthReady) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-100">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-blue-500 mx-auto"></div>
                    <p className="mt-4 text-gray-600">A carregar o seu gestor de pautas...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gray-50 min-h-screen font-sans text-gray-800">
            <div className="container mx-auto p-4 sm:p-6 lg:p-8">
                <header className="mb-8">
                    <h1 className="text-4xl font-bold text-gray-800">Gestor de Pautas</h1>
                    <p className="text-gray-500 mt-1">O seu painel central para organizar e faturar os seus trabalhos.</p>
                </header>
                <main>
                    <div className="bg-white p-4 rounded-xl shadow-md mb-6 border border-gray-200">
                        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
                            <FilterInput label="Data Início" type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} />
                            <FilterInput label="Data Fim" type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} />
                            <FilterInput label="Solicitante" type="text" name="solicitante" value={filters.solicitante} onChange={handleFilterChange} placeholder="Nome do solicitante..." />
                            <FilterSelect label="Emissora" name="station" value={filters.station} onChange={handleFilterChange}>
                                <option value="">Todas</option>
                                <option value="Record">Record</option>
                                <option value="Band">Band</option>
                                <option value="CNN">CNN</option>
                                <option value="My Hood">My Hood</option>
                                <option value="Sbt">SBT</option>
                                <option value="Outra">Outra</option>
                            </FilterSelect>
                            <FilterSelect label="Status" name="status" value={filters.status} onChange={handleFilterChange}>
                                <option value="">Todos</option>
                                <option value="Pendente">Pendente</option>
                                <option value="Pago">Pago</option>
                            </FilterSelect>
                            <div className="flex space-x-2">
                                <button onClick={clearFilters} className="w-full flex items-center justify-center bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200">
                                    <XCircle size={18} className="mr-2"/> Limpar
                                </button>
                            </div>
                        </div>
                    </div>
                    <ReportsSection pautas={filteredPautas} />
                    <div className="bg-white rounded-xl shadow-md border border-gray-200">
                        <div className="p-4 flex flex-wrap gap-4 justify-between items-center border-b">
                            <h2 className="text-xl font-bold">As minhas Pautas</h2>
                            <button onClick={openModalToAdd} className="flex items-center bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200 shadow-sm">
                                <Plus size={18} className="mr-2" /> Adicionar Pauta
                            </button>
                        </div>
                        <PautasList pautas={filteredPautas} onEdit={openModalToEdit} onDelete={handleDeletePauta} />
                    </div>
                </main>
                {isModalOpen && (
                    <PautaModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSavePauta} pauta={currentPauta} />
                )}
                <footer className="text-center mt-8 text-sm text-gray-400">
                    <p>Gestor de Pautas v1.8 (com cálculo de pagamento)</p>
                    <p>ID de Utilizador (para suporte): <span className="font-mono bg-gray-200 px-1 rounded">{userId}</span></p>
                </footer>
            </div>
        </div>
    );
}

const FilterInput = ({ label, ...props }) => (
    <div>
        <label className="block text-sm font-medium text-gray-600 mb-1">{label}</label>
        <input {...props} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" />
    </div>
);

const FilterSelect = ({ label, children, ...props }) => (
    <div>
        <label className="block text-sm font-medium text-gray-600 mb-1">{label}</label>
        <select {...props} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow bg-white">
            {children}
        </select>
    </div>
);

const ReportsSection = ({ pautas }) => {
    const reports = useMemo(() => {
        const byStation = pautas.reduce((acc, pauta) => {
            if (pauta.station && pauta.value) {
                acc[pauta.station] = (acc[pauta.station] || 0) + parseFloat(pauta.value);
            }
            return acc;
        }, {});

        const byQuinzena = pautas.reduce((acc, pauta) => {
            if (pauta.date && pauta.value) {
                const pautaDate = new Date(pauta.date + 'T00:00:00');
                const year = pautaDate.getFullYear();
                const month = pautaDate.getMonth() + 1;
                const day = pautaDate.getDate();
                const quinzenaLabel = (day <= 15) ? '1ª Quinzena' : '2ª Quinzena';
                const key = `${year}/${String(month).padStart(2, '0')} - ${quinzenaLabel}`;
                
                if (!acc[key]) {
                    acc[key] = { total: 0, dataFechamento: '' };
                }
                acc[key].total += parseFloat(pauta.value);
                
                const ultimoDiaMes = new Date(year, month, 0).getDate();
                const diaFechamento = (day <= 15) ? 15 : ultimoDiaMes;
                acc[key].dataFechamento = `${year}-${String(month).padStart(2, '0')}-${String(diaFechamento).padStart(2, '0')}`;
            }
            return acc;
        }, {});
        
        const total = pautas.reduce((sum, pauta) => sum + (parseFloat(pauta.value) || 0), 0);
        
        return { byStation, byQuinzena, total };
    }, [pautas]);

    let stationReportContent;
    if (Object.keys(reports.byStation).length > 0) {
        stationReportContent = Object.entries(reports.byStation).map(([station, total]) => (
            <div key={station} className="flex justify-between">
                <span className="text-gray-600">{station}</span>
                <span className="font-semibold">{total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
            </div>
        ));
    } else {
        stationReportContent = <p className="text-gray-400">Nenhum dado para exibir.</p>;
    }

    let quinzenaReportContent;
    if (Object.keys(reports.byQuinzena).length > 0) {
        quinzenaReportContent = Object.entries(reports.byQuinzena).sort((a, b) => b[0].localeCompare(a[0])).map(([quinzena, data]) => {
            const previsaoPagamento = calcularPrevisaoPagamento(data.dataFechamento);
            const dataFormatada = new Date(previsaoPagamento + 'T00:00:00').toLocaleDateString('pt-BR');

            return (
                <div key={quinzena} className="flex flex-col sm:flex-row justify-between sm:items-center p-2 rounded-md hover:bg-gray-100">
                    <div>
                        <span className="text-gray-600 font-medium">{quinzena}</span>
                        <div className="text-blue-500 text-xs flex items-center">
                           <CalendarDays size={12} className="mr-1"/> Prev. Pagamento: {dataFormatada}
                        </div>
                    </div>
                    <span className="font-semibold mt-1 sm:mt-0">{data.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
            );
        });
    } else {
        quinzenaReportContent = <p className="text-gray-400">Nenhum dado para exibir.</p>;
    }

    return (
        <div className="mb-6">
            <h2 className="text-xl font-bold mb-4">Relatórios e Totais</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <ReportCard title="Total Geral (Filtro)" icon={<DollarSign />} value={reports.total} isCurrency />
                
                <div className="bg-white p-4 rounded-xl shadow-md border border-gray-200">
                    <h3 className="font-bold text-gray-700 mb-2">Total por Emissora</h3>
                    <div className="space-y-2 text-sm">{stationReportContent}</div>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-md border border-gray-200">
                    <h3 className="font-bold text-gray-700 mb-2">Total por Quinzena</h3>
                    <div className="space-y-1 text-sm max-h-48 overflow-y-auto">{quinzenaReportContent}</div>
                </div>
            </div>
        </div>
    );
};

const ReportCard = ({ title, icon, value, isCurrency = false }) => (
    <div className="bg-white p-4 rounded-xl shadow-md border border-gray-200 flex items-center">
        <div className="p-3 rounded-full bg-blue-100 text-blue-500 mr-4">{icon}</div>
        <div>
            <p className="text-sm text-gray-500">{title}</p>
            <p className="text-2xl font-bold">{isCurrency ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : value}</p>
        </div>
    </div>
);

const PautasList = ({ pautas, onEdit, onDelete }) => {
    if (pautas.length === 0) {
        return <p className="text-center text-gray-500 p-10">Nenhuma pauta encontrada. Que tal adicionar uma nova?</p>;
    }
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-500">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                    <tr>
                        <th scope="col" className="px-6 py-3">Pauta</th>
                        <th scope="col" className="px-6 py-3">Emissora</th>
                        <th scope="col" className="px-6 py-3">Solicitante</th>
                        <th scope="col" className="px-6 py-3">Data</th>
                        <th scope="col" className="px-6 py-3">Valor</th>
                        <th scope="col" className="px-6 py-3">Prev. Pagamento</th>
                        <th scope="col" className="px-6 py-3">Status</th>
                        <th scope="col" className="px-6 py-3 text-center">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    {pautas.map(pauta => (
                        <tr key={pauta.id} className="bg-white border-b hover:bg-gray-50">
                            <td className="px-6 py-4 font-medium text-gray-900">{pauta.title}</td>
                            <td className="px-6 py-4">{pauta.station}</td>
                            <td className="px-6 py-4">{pauta.solicitante}</td>
                            <td className="px-6 py-4">{pauta.date ? new Date(pauta.date + 'T00:00:00').toLocaleDateString('pt-BR') : ''}</td>
                            <td className="px-6 py-4">{pauta.value ? parseFloat(pauta.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : ''}</td>
                            <td className="px-6 py-4 font-medium text-blue-600">{pauta.prevPagamento ? new Date(pauta.prevPagamento + 'T00:00:00').toLocaleDateString('pt-BR') : 'N/A'}</td>
                            <td className="px-6 py-4"><StatusBadge status={pauta.status} /></td>
                            <td className="px-6 py-4 text-center">
                                <button onClick={() => onEdit(pauta)} className="text-blue-600 hover:text-blue-900 mr-4"><Edit size={18} /></button>
                                <button onClick={() => onDelete(pauta.id)} className="text-red-600 hover:text-red-900"><Trash2 size={18} /></button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const StatusBadge = ({ status }) => {
    const baseClasses = "px-2 py-1 text-xs font-semibold rounded-full";
    if (status === 'Pago') {
        return <span className={`${baseClasses} bg-green-100 text-green-800`}>Pago</span>;
    }
    return <span className={`${baseClasses} bg-yellow-100 text-yellow-800`}>Pendente</span>;
};

const PautaModal = ({ isOpen, onClose, onSave, pauta }) => {
    const [formData, setFormData] = useState({});

    useEffect(() => {
        if (pauta) {
            setFormData(pauta);
        } else {
            setFormData({
                title: '',
                station: 'Record',
                solicitante: '',
                date: new Date().toISOString().split('T')[0],
                value: 0,
                status: 'Pendente'
            });
        }
    }, [pauta]);

    if (!isOpen) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white p-8 rounded-lg shadow-2xl w-full max-w-md">
                <h2 className="text-2xl font-bold mb-6">{pauta ? 'Editar Pauta' : 'Adicionar Nova Pauta'}</h2>
                <form onSubmit={handleSubmit}>
                    <div className="grid grid-cols-1 gap-4">
                        <ModalInput label="Pauta" name="title" value={formData.title || ''} onChange={handleChange} required />
                        <ModalSelect label="Emissora" name="station" value={formData.station || ''} onChange={handleChange}>
                            <option value="Record">Record</option>
                            <option value="Band">Band</option>
                            <option value="CNN">CNN</option>
                            <option value="My Hood">My Hood</option>
                            <option value="Sbt">SBT</option>
                            <option value="Outra">Outra</option>
                        </ModalSelect>
                        <ModalInput label="Solicitante" name="solicitante" value={formData.solicitante || ''} onChange={handleChange} />
                        <ModalInput label="Data da Pauta" name="date" type="date" value={formData.date || ''} onChange={handleChange} required />
                        <ModalInput label="Valor" name="value" type="number" step="0.01" value={formData.value || ''} onChange={handleChange} required />
                        <ModalSelect label="Status" name="status" value={formData.status || ''} onChange={handleChange}>
                            <option value="Pendente">Pendente</option>
                            <option value="Pago">Pago</option>
                        </ModalSelect>
                    </div>
                    <div className="mt-8 flex justify-end gap-4">
                        <button type="button" onClick={onClose} className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded">Cancelar</button>
                        <button type="submit" className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">Salvar</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const ModalInput = ({ label, ...props }) => (
    <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <input {...props} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
    </div>
);

const ModalSelect = ({ label, children, ...props }) => (
    <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <select {...props} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white">
            {children}
        </select>
    </div>
);