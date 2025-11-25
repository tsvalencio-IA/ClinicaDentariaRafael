// ==================================================================
// MÓDULO PRINCIPAL - DENTISTA INTELIGENTE (ESTABILIDADE MÁXIMA)
// RESOLVE SYNTAXERROR POR MEIO DE ENCAPSULAMENTO TOTAL (IIFE)
// ==================================================================
(function() {
    
// Variáveis Globais (Definidas em config.js e Injetadas pelo ambiente)
const config = window.AppConfig;
const appId = config.APP_ID; 

let db, auth;
let currentUser = null;
let currentView = 'dashboard';
let isLoginMode = true; 
// VARIÁVEIS DE DADOS GLOBAIS DENTRO DO ESCOPO ISOLADO (CORRIGIDO PARA SINTAXE)
let allPatients = []; 
let receivables = []; 
let stockItems = []; 
let receivableMaterialsCache = {}; 
let expenses = []; 
let expensePurchasedItemsCache = {}; 


// ==================================================================
// FUNÇÕES AUXILIARES
// ==================================================================

// Caminhos do Realtime Database (RTDB)
const getAdminCollectionPath = (uid, collectionName) => `artifacts/${appId}/users/${uid}/${collectionName}`;
const getJournalCollectionPath = (patientId) => `artifacts/${appId}/patients/${patientId}/journal`;
const getStockCollectionPath = (uid) => `artifacts/${appId}/users/${uid}/stock`;
// FINANCEIRO
const getExpensePath = (uid) => `artifacts/${appId}/users/${uid}/finance/expenses`; 
const getReceivablePath = (uid) => `artifacts/${appId}/users/${uid}/finance/receivable`; 
// Caminho para materiais vinculados
const getReceivableMaterialsPath = (receivableId) => `${getReceivablePath(currentUser.uid)}/${receivableId}/materials`;
const getExpensePurchasedItemsPath = (expenseId) => `${getExpensePath(currentUser.uid)}/${expenseId}/purchasedItems`; 

// Funções de Formatação (para UI)
const formatFileName = (name) => {
    if (name.length > 20) {
        return name.substring(0, 10) + '...' + name.substring(name.length - 7);
    }
    return name;
};

const formatDateTime = (isoString) => {
    // Formato 'DD/MM/YYYY HH:MM'
    const date = new Date(isoString);
    if (isNaN(date)) return 'Data Inválida';
    
    const pad = (num) => num.toString().padStart(2, '0');

    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = date.getFullYear();
    const hour = pad(date.getHours());
    const minute = pad(date.getMinutes());

    return `${day}/${month}/${year} ${hour}:${minute}`;
};

// --- FIM DAS FUNÇÕES AUXILIARES ---

// Funções de Inicialização e Utilitários
const showNotification = (message, type = 'success') => {
    const logType = type === 'error' ? 'ERROR' : (type === 'warning' ? 'WARN' : 'INFO');
    console.log(`[NOTIFICAÇÃO ${logType}]: ${message}`);
};

const formatCurrency = (value) => `R$ ${parseFloat(value || 0).toFixed(2).replace('.', ',')}`;

// ==================================================================
// MÓDULO DE AUTENTICAÇÃO E INICIALIZAÇÃO
// ==================================================================

// Função que monitora o estado de autenticação (AGORA BUSCA O PERFIL)
const setupAuthStateListener = () => {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = { uid: user.uid, email: user.email || 'Admin Anônimo' };
            
            // 1. Busca o perfil/role do usuário no RTDB
            const profileRef = db.ref(`artifacts/${appId}/users/${user.uid}/profile`);
            const snapshot = await profileRef.once('value');
            const profile = snapshot.val();
            
            if (profile && profile.role === 'dentist') {
                currentUser.role = 'dentist';
                showUI(); // Carrega a interface completa do Dentista
            } else {
                currentUser.role = 'unknown'; // Define como desconhecido ou paciente
                showRoleRestrictedUI(); // Mostra tela de acesso negado
            }

        } else {
            // Usuário deslogado
            currentUser = null;
            showLoginScreen(); // Exibe a tela de login
        }
    });
};

const initializeFirebase = async () => {
    if (Object.keys(config.firebaseConfig).length === 0) {
        showNotification("ERRO: Configuração do Firebase está vazia. Verifique a injeção do ambiente.", "error");
        return;
    }
    
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(config.firebaseConfig);
        }
        
        db = firebase.database();
        auth = firebase.auth();
        
        setupAuthStateListener();
        
    } catch (error) {
        console.error("Erro CRÍTICO na inicialização do Firebase:", error);
        document.getElementById('auth-error-message').textContent = `Falha na inicialização: ${error.message}`;
    }
};

const showLoginScreen = () => {
    // Esconde a tela de loading/app, mostra a tela de login
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app-container').classList.add('hidden');
    
    // Força a mensagem de login
    const loginContent = document.getElementById('login-screen').querySelector('.bg-white');
    // Reinicializa a tela de login no caso de um "Acesso Negado" anterior
    if (loginContent) {
        // Verifica se a tela está na interface de "Acesso Negado" e a restaura
        if (loginContent.querySelector('#logout-restricted-btn')) {
            loginContent.innerHTML = `
                <h1 class="text-3xl font-bold text-indigo-800 mb-2">🦷 Dentista IA</h1>
                <p class="text-sm text-gray-600 mb-6" id="auth-message">Entre com suas credenciais ou registre-se.</p>
                <form id="auth-form" class="space-y-4">
                    <div>
                        <label for="auth-email" class="sr-only">Email</label>
                        <input type="email" id="auth-email" placeholder="Email" required class="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500">
                    </div>
                    <div>
                        <label for="auth-password" class="sr-only">Senha</label>
                        <input type="password" id="auth-password" placeholder="Senha" required class="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500">
                    </div>
                    <div id="loading-spinner-container" class="hidden">
                        <div class="loader-spinner mt-4"></div>
                    </div>
                    <button type="submit" id="auth-submit-btn" class="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition duration-200 shadow-md">
                        Entrar
                    </button>
                </form>
                <div class="mt-4 text-sm">
                    <button id="toggle-auth-mode" class="text-indigo-600 hover:text-indigo-800 font-medium">
                        Não tem conta? Cadastre-se
                    </button>
                </div>
                <div id="auth-error-message" class="text-red-500 mt-3 text-sm font-semibold h-4"></div>
            `;
            // Re-adiciona listeners
            document.getElementById('auth-form').addEventListener('submit', handleAuthSubmit);
            document.getElementById('toggle-auth-mode').addEventListener('click', toggleAuthMode);
        }
    }
};

// NOVO: Função para exibir tela de restrição
const showRoleRestrictedUI = () => {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app-container').classList.add('hidden');
    
    const loginContent = document.getElementById('login-screen').querySelector('.bg-white');
    if (loginContent) {
        loginContent.innerHTML = `
            <h1 class="text-3xl font-bold text-red-800 mb-2">Acesso Negado</h1>
            <p class="text-lg text-gray-600 mb-6">Sua conta não tem permissão de administrador (Dentista) para acessar esta plataforma.</p>
            <p class="text-sm text-gray-500 mb-6">UID: ${currentUser.uid.slice(0, 10)}...</p>
            <button id="logout-restricted-btn" class="w-full py-3 px-6 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition duration-200 shadow-md">
                Sair
            </button>
        `;
        document.getElementById('logout-restricted-btn').addEventListener('click', () => auth.signOut());
    }
};


const toggleAuthMode = () => {
    isLoginMode = !isLoginMode;
    const submitBtn = document.getElementById('auth-submit-btn');
    const toggleBtn = document.getElementById('toggle-auth-mode');
    const message = document.getElementById('auth-message');
    
    if (isLoginMode) {
        submitBtn.textContent = 'Entrar';
        toggleBtn.textContent = 'Não tem conta? Cadastre-se';
        message.textContent = 'Entre com suas credenciais.';
    } else {
        submitBtn.textContent = 'Cadastrar';
        toggleBtn.textContent = 'Já tem conta? Fazer Login';
        message.textContent = 'Crie sua conta de administrador (Dentista).';
    }
    document.getElementById('auth-error-message').textContent = '';
};

const handleAuthSubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const errorEl = document.getElementById('auth-error-message');
    const submitBtn = document.getElementById('auth-submit-btn');
    const loadingContainer = document.getElementById('loading-spinner-container');

    errorEl.textContent = '';
    submitBtn.disabled = true;
    loadingContainer.classList.remove('hidden');
    
    try {
        if (isLoginMode) {
            // Tenta fazer Login
            await auth.signInWithEmailAndPassword(email, password);
            // O listener fará o resto do trabalho de verificação de role.
        } else {
            // Tenta fazer Registro
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            // Marca o usuário como admin/dentista no RTDB após o registro
            await db.ref(`artifacts/${appId}/users/${user.uid}/profile`).set({
                email: user.email,
                role: 'dentist',
                registeredAt: new Date().toISOString()
            });
            showNotification(`Conta ${email} criada com sucesso!`, 'success');
        }
    } catch (error) {
        let displayMessage = 'Ocorreu um erro no acesso.';
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            displayMessage = 'Credenciais inválidas. Verifique email e senha.';
        } else if (error.code === 'auth/email-already-in-use') {
            displayMessage = 'Este email já está cadastrado. Tente fazer Login.';
        } else if (error.code === 'auth/weak-password') {
            displayMessage = 'A senha deve ter pelo menos 6 caracteres.';
        } else if (error.code === 'auth/operation-not-allowed') {
            displayMessage = 'O login por Email/Senha não está habilitado no Firebase Console.';
        }
        errorEl.textContent = displayMessage;
    } finally {
        submitBtn.disabled = false;
        loadingContainer.classList.add('hidden');
    }
};


// --- Funções de Navegação e Renderização ---
const showUI = () => {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
    renderSidebar();
    navigateTo('dashboard');
};

const navigateTo = (viewId) => {
    currentView = viewId;
    renderContent();
    highlightNavItem(viewId);
};

const highlightNavItem = (viewId) => {
    document.querySelectorAll('#nav-menu button').forEach(btn => {
        if (btn.dataset.view === viewId) {
            btn.classList.replace('text-indigo-200', 'bg-indigo-600');
            btn.classList.add('bg-indigo-600', 'text-white', 'shadow-lg');
            btn.classList.remove('hover:bg-indigo-700');
        } else {
            btn.classList.replace('bg-indigo-600', 'text-indigo-200');
            btn.classList.remove('shadow-lg');
            btn.classList.add('hover:bg-indigo-700');
        }
    });
};

const renderSidebar = () => {
    const navMenu = document.getElementById('nav-menu');
    navMenu.innerHTML = config.NAV_ITEMS.map(item => `
        <button data-view="${item.id}" class="flex items-center p-3 rounded-xl transition-all duration-200 w-full text-left text-indigo-200 hover:bg-indigo-700 hover:text-white">
            <i class='bx ${item.icon} text-xl mr-3'></i>
            <span class="font-semibold">${item.label}</span>
        </button>
    `).join('');

    // Adiciona listener para a navegação na sidebar
    navMenu.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => navigateTo(btn.dataset.view));
    });
};

const renderContent = () => {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = ''; 
    
    switch (currentView) {
        case 'dashboard':
            renderDashboard(mainContent);
            break;
        case 'patients':
            renderPatientManager(mainContent);
            break;
        case 'financials':
            renderFinancialManager(mainContent);
            break;
        default:
            renderDashboard(mainContent);
    }
};

// ==================================================================
// MÓDULOS DE RENDERIZAÇÃO
// ==================================================================

// --- 1. DASHBOARD E BRAIN ---
const renderDashboard = (container) => {
    container.innerHTML = `
        <div class="p-8 bg-white shadow-2xl rounded-2xl border border-indigo-100 max-w-4xl mx-auto">
            <h2 class="text-3xl font-extrabold text-indigo-800 mb-8 flex items-center">
                <i class='bx bxs-dashboard text-3xl mr-3 text-indigo-600'></i> Dashboard & Visão Geral
            </h2>

            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
                <div class="p-4 bg-indigo-100 rounded-lg shadow-md"><p class="text-sm text-gray-600">Pacientes</p><p class="text-2xl font-bold text-indigo-800"><span id="dashboard-patients-count">0</span></p></div>
                <div class="p-4 bg-cyan-100 rounded-lg shadow-md"><p class="text-sm text-gray-600">Itens Estoque</p><p class="text-2xl font-bold text-cyan-800"><span id="dashboard-stock-count">0</span></p></div>
                <div class="p-4 bg-green-100 rounded-lg shadow-md"><p class="text-sm text-gray-600">Lucro Est.</p><p class="text-2xl font-bold text-green-800">${formatCurrency(0)}</p></div>
                <div class="p-4 bg-red-100 rounded-lg shadow-md"><p class="text-sm text-gray-600">Alertas Est.</p><p class="text-2xl font-bold text-red-800">0</p></div>
            </div>

            <div class="border border-indigo-300 p-6 rounded-xl bg-indigo-50">
                <h3 class="text-2xl font-semibold text-indigo-800 mb-4 flex items-center">
                    <i class='bx bxs-brain text-xl mr-2'></i> Alimentar o BRAIN (Diretrizes da IA)
                </h3>
                <p class="text-gray-600 mb-4 text-sm">Defina as regras. Use: <code>Variável de Tratamento: [TIPO]</code> e <code>Meta: [META]</code>.</p>
                <textarea id="brain-input" rows="5" class="w-full p-3 border border-indigo-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 shadow-inner resize-none" placeholder="Ex: 'Atuar como assistente de ortodontia. Focar em higiene e uso de elásticos. Variável de Tratamento: [TIPO]. Meta: [META].'"></textarea>
                <div class="flex justify-between items-center mt-4">
                    <button id="save-brain-btn" class="py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition duration-200 shadow-md">
                        <i class='bx bxs-save text-xl mr-2'></i> Salvar Diretrizes
                    </button>
                    <p id="brain-message" class="text-sm font-medium text-indigo-700 h-4"></p>
                </div>
            </div>

            <p class="mt-8 text-sm text-gray-500 text-center">
                ID Dentista: <span class="font-mono text-xs p-1 bg-gray-100 rounded">${currentUser ? currentUser.uid.slice(0, 8) : 'N/A'}...</span>
            </p>
        </div>
    `;

    // Adicionar Lógica para o BRAIN (RTDB ADAPTADO)
    loadBrainConfig();
    document.getElementById('save-brain-btn').addEventListener('click', saveBrainConfig);
    loadDashboardKPIs(); 
};

const loadDashboardKPIs = () => {
    if (!currentUser) return;

    // Conta Pacientes
    const patientRef = db.ref(getAdminCollectionPath(currentUser.uid, 'patients'));
    patientRef.once('value', snapshot => {
        const patientCount = snapshot.val() ? Object.keys(snapshot.val()).length : 0;
        document.getElementById('dashboard-patients-count').textContent = patientCount;
    });

    // Conta Itens de Estoque
    const stockRef = db.ref(getStockCollectionPath(currentUser.uid));
    stockRef.once('value', snapshot => {
        const stockCount = snapshot.val() ? Object.keys(snapshot.val()).length : 0;
        document.getElementById('dashboard-stock-count').textContent = stockCount;
    });
}

const loadBrainConfig = () => {
    if (!currentUser) return;
    
    // RTDB ADAPTADO: Usando .once('value') para carregar dados
    const brainRef = db.ref(getAdminCollectionPath(currentUser.uid, 'aiConfig') + '/directives');
    brainRef.once('value').then(snapshot => {
        const brainInput = document.getElementById('brain-input');
        if (!brainInput) return;
        
        if (snapshot.exists()) {
            brainInput.value = snapshot.val().promptDirectives;
        } else {
            brainInput.value = "Atuar como assistente. Variável de Tratamento: [TIPO]. Meta: [META]. Focar em higiene e progresso.";
        }
    }).catch(e => console.error("Erro ao carregar BRAIN (RTDB):", e));
};

const saveBrainConfig = () => {
    if (!currentUser) return;
    
    const prompt = document.getElementById('brain-input').value;
    const msgEl = document.getElementById('brain-message');
    if (!prompt.trim()) {
        msgEl.textContent = 'O BRAIN não pode estar vazio!';
        msgEl.classList.replace('text-indigo-700', 'text-red-600');
        return;
    }
    
    // RTDB ADAPTADO: Usando .set() para salvar dados
    const brainRef = db.ref(getAdminCollectionPath(currentUser.uid, 'aiConfig') + '/directives');
    brainRef.set({
        promptDirectives: prompt,
        lastUpdated: new Date().toISOString(), // Não há serverTimestamp nativo, usamos ISO String
        status: 'Online'
    }).then(() => {
        msgEl.textContent = 'BRAIN alimentado! Sucesso.';
        msgEl.classList.replace('text-red-600', 'text-indigo-700');
        setTimeout(() => msgEl.textContent = '', 3000);
    }).catch(e => {
        msgEl.textContent = 'Erro ao salvar (RTDB): ' + e.message;
        msgEl.classList.replace('text-indigo-700', 'text-red-600');
        console.error("Erro ao salvar BRAIN (RTDB):", e);
    });
};

// --- 2. GESTÃO DE PACIENTES ---
const renderPatientManager = (container) => {
    container.innerHTML = `
        <div class="p-8 bg-white shadow-2xl rounded-2xl border border-indigo-100">
            <h2 class="text-3xl font-extrabold text-indigo-800 mb-8 flex items-center">
                <i class='bx bxs-group text-3xl mr-3 text-indigo-600'></i> Gestão de Pacientes
            </h2>
            
            <div class="flex justify-end mb-6">
                <button id="add-patient-btn" class="py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition duration-200 shadow-md flex items-center justify-center transform hover:scale-[1.01]">
                    <i class='bx bx-plus-circle text-xl mr-2'></i> Novo Paciente
                </button>
            </div>

            <div class="overflow-x-auto bg-gray-50 rounded-xl shadow-inner border border-gray-200">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-200">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Nome</th>
                            <th class="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Tratamento</th>
                            <th class="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Status</th>
                            <th class="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Meta</th>
                            <th class="px-6 py-3 text-right text-xs font-bold text-gray-600 uppercase">Ações</th>
                        </tr>
                    </thead>
                    <tbody id="patients-table-body" class="bg-white divide-y divide-gray-200">
                        <tr><td colspan="5" class="px-6 py-4 text-center text-gray-500 italic">Carregando pacientes...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    document.getElementById('add-patient-btn').addEventListener('click', openPatientFormModal);
    loadPatients();
};

const openPatientFormModal = (patient = null) => {
    const isEdit = !!patient;
    const modalTitle = isEdit ? `Editar Paciente: ${patient.name}` : 'Novo Paciente';
    
    document.getElementById('modal-title').textContent = modalTitle;
    document.getElementById('modal-body').innerHTML = `
        <form id="patient-form" class="space-y-4">
            <input type="hidden" id="patient-id" value="${isEdit ? patient.id : ''}">
            
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                    <input type="text" id="patient-name" value="${isEdit ? patient.name : ''}" required class="w-full p-3 border border-gray-300 rounded-lg">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Email (Login Futuro)</label>
                    <input type="email" id="patient-email" value="${isEdit ? patient.email : ''}" required class="w-full p-3 border border-gray-300 rounded-lg">
                </div>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Tipo de Tratamento</label>
                    <select id="patient-treatment-type" required class="w-full p-3 border border-gray-300 rounded-lg">
                        <option value="Ortodontia">Ortodontia</option>
                        <option value="Estética Dental">Estética Dental</option>
                        <option value="Implantes">Implantes</option>
                        <option value="Clareamento">Clareamento</option>
                        <option value="Odontopediatria">Odontopediatria</option>
                        <option value="Geral">Geral</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select id="patient-status" required class="w-full p-3 border border-gray-300 rounded-lg">
                        <option value="Novo Cadastro">Novo Cadastro</option>
                        <option value="Em Tratamento">Em Tratamento</option>
                        <option value="Tratamento Concluído">Tratamento Concluído</option>
                        <option value="Inativo">Inativo</option>
                    </select>
                </div>
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Meta Principal do Tratamento</label>
                <textarea id="patient-treatment-goal" rows="2" required class="w-full p-3 border border-gray-300 rounded-lg resize-none">${isEdit ? patient.treatmentGoal : ''}</textarea>
            </div>
            
            <div class="flex justify-end space-x-3 pt-4">
                <button type="button" id="form-cancel-btn" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg">Cancelar</button>
                <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">${isEdit ? 'Atualizar' : 'Cadastrar'}</button>
            </div>
        </form>
    `;
    
    if (isEdit) {
        document.getElementById('patient-treatment-type').value = patient.treatmentType || 'Geral';
        document.getElementById('patient-status').value = patient.status || 'Novo Cadastro';
    }

    document.getElementById('patient-form').addEventListener('submit', savePatient);
    document.getElementById('form-cancel-btn').addEventListener('click', closeModal);
    
    openModal(modalTitle, 'max-w-2xl');
};

const savePatient = async (e) => {
    e.preventDefault();
    const isEdit = !!document.getElementById('patient-id').value;
    const patientId = document.getElementById('patient-id').value; 
    
    // CORREÇÃO DO ERRO: Encontra o paciente original para pegar o 'createdAt'
    const originalPatient = isEdit ? allPatients.find(p => p.id === patientId) : null;
    
    const patientData = { 
        id: patientId || null, 
        name: document.getElementById('patient-name').value,
        email: document.getElementById('patient-email').value,
        treatmentType: document.getElementById('patient-treatment-type').value,
        treatmentGoal: document.getElementById('patient-treatment-goal').value,
        status: document.getElementById('patient-status').value,
        // CORREÇÃO: Usa a data original SE o paciente for encontrado, senão usa a data atual
        createdAt: originalPatient ? originalPatient.createdAt : new Date().toISOString()
    };
    
    try {
        const patientsRef = db.ref(getAdminCollectionPath(currentUser.uid, 'patients'));

        if (isEdit) {
            await patientsRef.child(patientId).update(patientData);
        } else {
            const newRef = patientsRef.push();
            patientData.id = newRef.key;
            await newRef.set(patientData);
        }
        
        closeModal();
        showNotification(`Paciente ${patientData.name} salvo com sucesso!`, 'success');
    } catch (e) {
        showNotification(`Erro ao salvar paciente (RTDB): ${e.message}`, 'error');
        console.error("Erro ao salvar paciente (RTDB):", e);
    }
};

let allPatients = [];

const loadPatients = () => {
    if (!currentUser) return;
    
    // RTDB ADAPTADO: Usando .on('value') para real-time listener
    const patientsRef = db.ref(getAdminCollectionPath(currentUser.uid, 'patients'));
    
    patientsRef.on('value', snapshot => {
        const patientsObject = snapshot.val();
        const patientsList = [];
        
        if (patientsObject) {
            // Transforma o objeto de nós em uma lista de objetos
            Object.keys(patientsObject).forEach(key => {
                patientsList.push({ id: key, ...patientsObject[key] });
            });
        }
        
        allPatients = patientsList;
        renderPatientsTable(patientsList);
    }, e => showNotification(`Erro ao carregar lista de pacientes (RTDB): ${e.message}`, 'error'));
};

const renderPatientsTable = (patients) => {
    const tbody = document.getElementById('patients-table-body');
    if (!tbody) return;

    if (patients.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500 italic">Nenhum paciente cadastrado.</td></tr>`;
        return;
    }

    tbody.innerHTML = patients.map(p => `
        <tr class="hover:bg-indigo-50 transition-colors">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${p.name}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${p.treatmentType || 'N/A'}</td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${p.status === 'Em Tratamento' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">
                    ${p.status}
                </span>
            </td>
            <td class="px-6 py-4 text-sm text-gray-500 truncate max-w-xs" title="${p.treatmentGoal}">${p.treatmentGoal || 'Não definida'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <div class="flex justify-end space-x-2">
                    <button data-action="journal" data-id="${p.id}" data-patient-name="${p.name}" class="p-2 text-cyan-600 hover:bg-cyan-100 rounded-full" title="Abrir Diário (IA)">
                        <i class='bx bx-message-square-dots text-xl'></i>
                    </button>
                    <button data-action="edit" data-id="${p.id}" class="p-2 text-indigo-600 hover:bg-indigo-100 rounded-full" title="Editar">
                        <i class='bx bxs-edit-alt text-xl'></i>
                    </button>
                    <button data-action="delete" data-id="${p.id}" class="p-2 text-red-600 hover:bg-red-100 rounded-full" title="Excluir">
                        <i class='bx bxs-trash-alt text-xl'></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    tbody.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const patientId = btn.dataset.id;
        // Encontra o paciente na lista 'allPatients' que já está em memória
        const patient = allPatients.find(p => p.id === patientId); 
        if (!patient) return;

        switch (btn.dataset.action) {
            case 'journal': openJournalModal(patient); break;
            // Passa o objeto paciente diretamente para o modal de edição
            case 'edit': openPatientFormModal(patient); break; 
            case 'delete': deletePatient(patientId, patient.name); break;
        }
    });
};

const deletePatient = async (patientId, patientName) => {
    if (!confirm(`Tem certeza que deseja excluir o paciente ${patientName} e todo o seu histórico de diário?`)) return;

    try {
        // RTDB ADAPTADO: Remoção usando .remove()
        const patientRef = db.ref(getAdminCollectionPath(currentUser.uid, 'patients') + '/' + patientId);
        await patientRef.remove();
        
        // Simulação de exclusão em cascata do diário
        await db.ref(getJournalCollectionPath(patientId)).remove();

        showNotification(`Paciente ${patientName} excluído com sucesso!`, 'success');
    } catch (e) {
        showNotification(`Erro ao excluir (RTDB): ${e.message}`, 'error');
        console.error("Erro ao excluir paciente (RTDB):", e);
    }
};

// --- MODAL DE DETALHES (Diário) ---
const openJournalModal = (patient) => {
    document.getElementById('modal-title').textContent = `Diário: ${patient.name} (${patient.treatmentType})`;
    document.getElementById('modal-body').innerHTML = `
        <div class="bg-yellow-50 p-3 rounded-lg mb-4 border border-yellow-200 text-xs text-gray-700">
            <p class="font-semibold mb-1">Tipo: <span class="text-indigo-600">${patient.treatmentType}</span> | Meta: ${patient.treatmentGoal}</p>
        </div>
        
        <div id="service-history-container" class="mb-4">
            <h4 class="text-lg font-bold text-indigo-700 mb-2">Histórico de Serviços & Custos</h4>
            <div id="patient-service-history" class="bg-white p-3 rounded-lg border border-gray-200 max-h-40 overflow-y-auto">
                <p class="italic text-gray-500">Carregando histórico...</p>
            </div>
        </div>

        <div id="journal-timeline" class="content-scroll flex flex-col-reverse overflow-y-auto h-96 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <p class="text-center text-gray-500 italic">Carregando interações...</p>
        </div>

        <div class="p-4 bg-white border border-indigo-300 rounded-lg shadow-md mt-4">
            <textarea id="dentist-response-input" rows="3" class="w-full p-3 border border-gray-300 rounded-lg resize-none mb-3" placeholder="Digite sua resposta ou orientação..."></textarea>
            
            <div class="flex justify-between items-center">
                <div>
                    <button id="attach-media-btn" class="p-2 text-indigo-600 hover:bg-indigo-100 rounded-full transition" title="Anexar Foto ou Documento">
                        <i class='bx bx-paperclip text-xl'></i>
                    </button>
                    <input type="file" id="media-input" class="hidden" accept="image/*, application/pdf" />
                    <span id="file-name-display" class="text-xs text-gray-600 ml-2"></span>
                </div>

                <div class="flex space-x-3">
                    <button id="ask-ai-btn" data-patient-id="${patient.id}" class="py-2 px-4 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-lg text-sm">
                        <i class='bx bxs-brain text-xl mr-2'></i> Pedir Ajuda à IA
                    </button>
                    <button id="send-response-btn" data-patient-id="${patient.id}" class="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-sm">
                        <i class='bx bxs-send text-xl mr-2'></i> Enviar
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // NOVO: Carregar histórico de serviços
    loadPatientServiceHistory(patient.id);
    setupJournalListeners(patient);
    openModal(`Diário: ${patient.name}`, 'max-w-4xl');
};

// NOVO: Função para carregar histórico de serviços no Diário
const loadPatientServiceHistory = (patientId) => {
    const historyContainer = document.getElementById('patient-service-history');
    if (!historyContainer) return;
    
    // Filtra as contas a receber pelo patientId
    const receivableRef = db.ref(getReceivablePath(currentUser.uid)).orderByChild('patientId').equalTo(patientId);

    receivableRef.once('value', async (snapshot) => {
        const servicesObject = snapshot.val();
        let serviceHistoryHTML = '';

        if (servicesObject) {
            const servicesList = Object.keys(servicesObject).map(key => ({ id: key, ...servicesObject[key] }));
            
            for (const service of servicesList) {
                // Carregar materiais consumidos para cada serviço
                const materialsRef = db.ref(getReceivableMaterialsPath(service.id));
                const materialsSnapshot = await materialsRef.once('value');
                const materialsObject = materialsSnapshot.val();
                let materialsHTML = '';
                let serviceCost = 0; // Custo de materiais para este serviço

                if (materialsObject) {
                    const materialsList = Object.keys(materialsObject).map(key => materialsObject[key]);
                    
                    materialsHTML = materialsList.map(m => {
                        // Usamos o cache de estoque em memória para obter o custo
                        const stockItem = stockItems.find(i => i.id === m.materialId);
                        const costPerUnit = stockItem ? stockItem.cost : 0;
                        const totalItemCost = costPerUnit * m.quantityUsed;
                        serviceCost += totalItemCost;
                        
                        return `<li class="ml-4 text-xs text-gray-600">
                            - ${m.quantityUsed} ${m.unit} de ${m.name} (Custo: ${formatCurrency(totalItemCost)})
                        </li>`;
                    }).join('');
                }
                
                const statusColor = service.status === 'Recebido' ? 'text-green-600' : (service.status === 'Atrasado' ? 'text-red-600' : 'text-yellow-600');
                
                serviceHistoryHTML += `
                    <div class="mb-4 p-3 border rounded-lg shadow-sm ${service.status === 'Recebido' ? 'bg-green-50' : 'bg-gray-50'}">
                        <div class="flex justify-between items-center">
                            <span class="font-semibold text-sm text-gray-800">Serviço: ${service.description} (${formatCurrency(service.amount)})</span>
                            <span class="text-xs ${statusColor} font-bold">${service.status}</span>
                        </div>
                        <p class="text-xs text-gray-500 mb-2">Vencimento: ${service.dueDate}</p>
                        
                        <h5 class="text-xs font-semibold mt-2 text-indigo-700">Materiais (Custo total: ${formatCurrency(serviceCost)}):</h5>
                        <ul class="list-disc list-inside">
                            ${materialsHTML || '<li class="ml-4 italic text-gray-500 text-xs">Nenhum material registrado.</li>'}
                        </ul>
                    </div>
                `;
            }
        }
        
        historyContainer.innerHTML = serviceHistoryHTML || '<p class="text-center text-gray-500 italic">Nenhum serviço financeiro registrado para este paciente.</p>';
        
    }).catch(e => {
        historyContainer.innerHTML = `<p class="text-red-500">Erro ao carregar histórico: ${e.message}</p>`;
        console.error("Erro ao carregar histórico financeiro do paciente:", e);
    });
};


const setupJournalListeners = (patient) => {
    const timeline = document.getElementById('journal-timeline');
    const responseInput = document.getElementById('dentist-response-input');
    const sendBtn = document.getElementById('send-response-btn');
    const askAiBtn = document.getElementById('ask-ai-btn');
    const mediaBtn = document.getElementById('attach-media-btn');
    const mediaInput = document.getElementById('media-input');
    const fileNameDisplay = document.getElementById('file-name-display');
    
    let currentFile = null;

    mediaInput.addEventListener('change', (e) => {
        currentFile = e.target.files[0] || null;
        fileNameDisplay.textContent = currentFile ? formatFileName(currentFile.name) : '';
    });
    mediaBtn.addEventListener('click', () => mediaInput.click());

    sendBtn.addEventListener('click', () => {
        sendJournalEntry(patient, responseInput.value, 'Dentista', currentFile);
        responseInput.value = '';
        currentFile = null;
        fileNameDisplay.textContent = '';
    });
    
    askAiBtn.addEventListener('click', () => handleAIRequest(patient));

    // RTDB ADAPTADO: Listener para o Diário
    const journalRef = db.ref(getJournalCollectionPath(patient.id));
    journalRef.orderByChild('timestamp').on('value', snapshot => {
        const entriesObject = snapshot.val();
        const entries = [];
        if (entriesObject) {
            Object.keys(entriesObject).forEach(key => {
                 // RTDB não tem um objeto Date, então usamos o new Date(ISO String)
                entries.push({ id: key, ...entriesObject[key], timestamp: new Date(entriesObject[key].timestamp) });
            });
        }
        // O RTDB ordena do mais antigo para o mais novo, precisamos inverter para mostrar o mais recente em cima.
        entries.reverse();
        renderJournalEntries(timeline, entries);
    }, e => showNotification(`Erro ao carregar diário (RTDB): ${e.message}`, 'error'));
};

const sendJournalEntry = async (patient, text, author, file) => {
    if (!text.trim() && !file) return;

    let mediaData = null;
    let uploadPromise = Promise.resolve(null);
    
    if (file) {
        uploadPromise = window.uploadToCloudinary(file).then(res => {
            showNotification(`Arquivo ${file.name} enviado para Cloudinary!`, 'success');
            return res;
        }).catch(error => {
            showNotification(`Falha ao carregar arquivo: ${error.message}`, 'error');
            return null;
        });
    }

    mediaData = await uploadPromise;

    if (!text.trim() && !mediaData) return;
    
    const entryData = {
        text: text.trim(),
        author: author,
        isAI: author.includes('IA'),
        timestamp: new Date().toISOString(), // Usamos ISO String para o RTDB
        media: mediaData
    };

    try {
        // RTDB ADAPTADO: Usando .push() para criar um novo nó de entrada
        await db.ref(getJournalCollectionPath(patient.id)).push(entryData);
    } catch (e) {
        showNotification(`Erro ao enviar entrada (RTDB): ${e.message}`, 'error');
    }
};

const handleAIRequest = async (patient) => {
    const askAiBtn = document.getElementById('ask-ai-btn');
    askAiBtn.disabled = true;
    askAiBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin text-xl mr-2'></i> IA Pensando...";
    
    try {
        // 1. Obter as diretrizes do BRAIN (RTDB ADAPTADO)
        const brainRef = db.ref(getAdminCollectionPath(currentUser.uid, 'aiConfig') + '/directives');
        const brainSnap = await brainRef.once('value');
        const directives = brainSnap.exists() ? brainSnap.val().promptDirectives : 'Atuar como assistente padrão de clínica odontológica.';
        
        // 2. Personalizar o Prompt de Sistema
        const systemPrompt = directives
            .replace(/Variável de Tratamento: \[TIPO\]/, `Variável de Tratamento: ${patient.treatmentType || 'Geral'}`)
            .replace(/Meta: \[META\]/, `Meta: ${patient.treatmentGoal || 'N/A'}`);
        
        // 3. Montar a Mensagem do Usuário (Contexto)
        const userMessage = `Você é o assistente do Dr(a). ${currentUser.email}. O paciente ${patient.name} com tratamento "${patient.treatmentType}" e meta "${patient.treatmentGoal}" acaba de solicitar uma orientação/status. Responda-o com base nas diretrizes. Use um tom encorajador e profissional.`;

        // 4. CHAMA A FUNÇÃO REAL DA API
        const geminiResponseText = await window.callGeminiAPI(systemPrompt, userMessage);
        
        // 5. Enviar a resposta da IA para o Diário
        sendJournalEntry(patient, geminiResponseText, 'Assistente IA', null);

    } catch (e) {
        showNotification(`Erro na solicitação de IA: ${e.message}`, 'error');
        console.error("Erro na solicitação de IA:", e);
    } finally {
        askAiBtn.disabled = false;
        askAiBtn.innerHTML = "<i class='bx bxs-brain text-xl mr-2'></i> Pedir Ajuda à IA";
    }
};


const renderJournalEntries = (container, entries) => {
    container.innerHTML = entries.map(entry => {
        const isDentist = entry.author === 'Dentista';
        const isAI = entry.isAI;
        const entryClass = isDentist ? 'entry-dentist' : (isAI ? 'entry-ai' : 'entry-patient');
        
        const mediaHtml = entry.media ? `
            <div class="mt-2 p-1 bg-white rounded border border-gray-300 text-xs flex items-center justify-between">
                <i class='bx bx-image text-base mr-1 text-indigo-600'></i>
                <span>${formatFileName(entry.media.name)}</span>
                <a href="${entry.media.url}" target="_blank" class="text-indigo-600 hover:underline ml-2">Ver</a>
            </div>
        ` : '';

        return `
            <div class="journal-entry ${entryClass}">
                <div class="flex justify-between items-center mb-1">
                    <span class="text-xs font-semibold ${isDentist ? 'text-indigo-700' : (isAI ? 'text-cyan-700' : 'text-gray-700')}">
                        ${entry.author}
                    </span>
                    <span class="text-xs text-gray-500">
                        ${entry.timestamp ? formatDateTime(entry.timestamp.toISOString()) : 'Carregando...'}
                    </span>
                </div>
                <p class="text-gray-800 text-sm whitespace-pre-wrap">${entry.text}</p>
                ${mediaHtml}
            </div>
        `;
    }).join('');
};


// --- 3. GESTÃO FINANCEIRA (INCLUINDO ESTOQUE/MATERIAIS) ---
const renderFinancialManager = (container) => {
    container.innerHTML = `
        <div class="p-8 bg-white shadow-2xl rounded-2xl border border-indigo-100">
            <h2 class="text-3xl font-extrabold text-indigo-800 mb-8 flex items-center">
                <i class='bx bxs-wallet text-3xl mr-3 text-indigo-600'></i> Gestão Financeira e Estoque
            </h2>
            
            <div class="flex border-b border-gray-200 mb-6">
                <button data-tab="stock" class="p-3 text-sm font-medium border-b-2 border-indigo-600 text-indigo-700">Inventário de Materiais</button>
                <button data-tab="receivable" class="p-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700">Contas a Receber</button>
                <button data-tab="expense" class="p-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700">Despesas</button>
            </div>

            <div id="financial-tab-content">
                </div>
        </div>
    `;

    const tabContentContainer = document.getElementById('financial-tab-content');
    
    // Configura listeners para troca de abas
    document.querySelectorAll('[data-tab]').forEach(tabBtn => {
        tabBtn.addEventListener('click', () => {
            document.querySelectorAll('[data-tab]').forEach(btn => {
                btn.classList.remove('border-indigo-600', 'text-indigo-700');
                btn.classList.add('border-transparent', 'text-gray-500', 'hover:border-gray-300', 'hover:text-gray-700');
            });
            tabBtn.classList.add('border-indigo-600', 'text-indigo-700');
            tabBtn.classList.remove('border-transparent', 'text-gray-500', 'hover:border-gray-300', 'hover:text-gray-700');

            renderFinancialTab(tabBtn.dataset.tab, tabContentContainer);
        });
    });

    // Renderiza a aba de estoque por padrão
    renderFinancialTab('stock', tabContentContainer);
};

// Nova função para gerenciar a renderização interna da aba Financeiro
const renderFinancialTab = (tab, container) => {
    container.innerHTML = ''; // Limpa o container antes de carregar

    if (tab === 'stock') {
        container.innerHTML = `
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-xl font-semibold text-gray-700">Inventário de Materiais</h3>
                <button id="add-stock-btn" class="py-2 px-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition duration-200 shadow-md flex items-center justify-center">
                    <i class='bx bx-plus-circle text-xl mr-2'></i> Novo Item
                </button>
            </div>
            <div class="overflow-x-auto bg-gray-50 rounded-xl shadow-inner border border-gray-200">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-200">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Material</th>
                            <th class="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Qtde</th>
                            <th class="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Custo Médio</th>
                            <th class="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Fornecedor</th>
                            <th class="px-6 py-3 text-right text-xs font-bold text-gray-600 uppercase">Ações</th>
                        </tr>
                    </thead>
                    <tbody id="stock-table-body" class="bg-white divide-y divide-gray-200">
                        <tr><td colspan="5" class="px-6 py-4 text-center text-gray-500 italic">Carregando estoque...</td></tr>
                    </tbody>
                </table>
            </div>
        `;
        document.getElementById('add-stock-btn').addEventListener('click', () => openStockFormModal());
        loadStock();

    } else if (tab === 'receivable') {
        container.innerHTML = `
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-xl font-semibold text-gray-700">Contas a Receber</h3>
                <button id="add-receivable-btn" class="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition duration-200 shadow-md flex items-center justify-center">
                    <i class='bx bx-plus-circle text-xl mr-2'></i> Registrar Serviço
                </button>
            </div>

            <div class="grid grid-cols-3 gap-4 mb-6">
                <div class="p-4 bg-green-100 rounded-lg shadow-md"><p class="text-sm text-gray-600">Total a Receber</p><p class="text-2xl font-bold text-green-800" id="total-receivable">${formatCurrency(0)}</p></div>
                <div class="p-4 bg-yellow-100 rounded-lg shadow-md"><p class="text-sm text-gray-600">Recebido no Mês</p><p class="text-2xl font-bold text-yellow-800" id="received-this-month">${formatCurrency(0)}</p></div>
                <div class="p-4 bg-gray-100 rounded-lg shadow-md"><p class="text-sm text-gray-600">Contas Abertas</p><p class="text-2xl font-bold text-gray-800" id="open-receivable-count">0</p></div>
            </div>

            <div class="overflow-x-auto bg-gray-50 rounded-xl shadow-inner border border-gray-200">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-200">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Paciente</th>
                            <th class="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Vencimento</th>
                            <th class="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Descrição</th>
                            <th class="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Valor</th>
                            <th class="px-6 py-3 text-right text-xs font-bold text-gray-600 uppercase">Status/Ações</th>
                        </tr>
                    </thead>
                    <tbody id="receivable-table-body" class="bg-white divide-y divide-gray-200">
                        <tr><td colspan="5" class="px-6 py-4 text-center text-gray-500 italic">Carregando contas a receber...</td></tr>
                    </tbody>
                </table>
            </div>
        `;
        document.getElementById('add-receivable-btn').addEventListener('click', () => openReceivableFormModal());
        loadReceivable();

    } else if (tab === 'expense') {
        container.innerHTML = `
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-xl font-semibold text-gray-700">Registro de Despesas (Contas a Pagar)</h3>
                <button id="add-expense-btn" class="py-2 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition duration-200 shadow-md flex items-center justify-center">
                    <i class='bx bx-minus-circle text-xl mr-2'></i> Registrar Despesa
                </button>
            </div>

            <div class="grid grid-cols-3 gap-4 mb-6">
                <div class="p-4 bg-red-100 rounded-lg shadow-md"><p class="text-sm text-gray-600">Total Despesas Abertas</p><p class="text-2xl font-bold text-red-800" id="total-expense-open">${formatCurrency(0)}</p></div>
                <div class="p-4 bg-green-100 rounded-lg shadow-md"><p class="text-sm text-gray-600">Próximo Vencimento</p><p class="text-2xl font-bold text-green-800" id="next-due-date">N/A</p></div>
                <div class="p-4 bg-gray-100 rounded-lg shadow-md"><p class="text-sm text-gray-600">Total Pago no Mês</p><p class="text-2xl font-bold text-gray-800" id="paid-this-month">${formatCurrency(0)}</p></div>
            </div>

            <div class="overflow-x-auto bg-gray-50 rounded-xl shadow-inner border border-gray-200">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-200">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Vencimento</th>
                            <th class="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Fornecedor</th>
                            <th class="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Nota/Ref</th>
                            <th class="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Valor</th>
                            <th class="px-6 py-3 text-right text-xs font-bold text-gray-600 uppercase">Status/Ações</th>
                        </tr>
                    </thead>
                    <tbody id="expense-table-body" class="bg-white divide-y divide-gray-200">
                        <tr><td colspan="5" class="px-6 py-4 text-center text-gray-500 italic">Carregando despesas...</td></tr>
                    </tbody>
                </table>
            </div>
        `;
        document.getElementById('add-expense-btn').addEventListener('click', () => openExpenseFormModal());
        loadExpenses();
    }
};

// --- Funções CRUD Estoque ---

const loadStock = () => {
    if (!currentUser) return;

    const stockRef = db.ref(getStockCollectionPath(currentUser.uid));
    
    stockRef.on('value', snapshot => {
        const itemsObject = snapshot.val();
        const itemsList = [];
        
        if (itemsObject) {
            Object.keys(itemsObject).forEach(key => {
                itemsList.push({ id: key, ...itemsObject[key] });
            });
        }
        
        stockItems = itemsList;
        renderStockTable(itemsList);
    }, e => showNotification(`Erro ao carregar estoque (RTDB): ${e.message}`, 'error'));
};

const renderStockTable = (items) => {
    const tbody = document.getElementById('stock-table-body');
    if (!tbody) return;

    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500 italic">Nenhum item de estoque cadastrado.</td></tr>`;
        return;
    }

    tbody.innerHTML = items.map(item => `
        <tr class="hover:bg-gray-50 transition-colors">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${item.name}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${item.quantity} ${item.unit}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatCurrency(item.cost)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${item.supplier || 'N/A'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <div class="flex justify-end space-x-2">
                    <button data-action="edit" data-id="${item.id}" class="p-2 text-indigo-600 hover:bg-indigo-100 rounded-full" title="Editar">
                        <i class='bx bxs-edit-alt text-xl'></i>
                    </button>
                    <button data-action="delete" data-id="${item.id}" class="p-2 text-red-600 hover:bg-red-100 rounded-full" title="Excluir">
                        <i class='bx bxs-trash-alt text-xl'></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    tbody.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const itemId = btn.dataset.id;
        const item = items.find(i => i.id === itemId);

        switch (btn.dataset.action) {
            case 'edit': openStockFormModal(item); break;
            case 'delete': deleteStockItem(itemId, item.name); break;
        }
    });
};

const openStockFormModal = (item = null) => {
    const isEdit = !!item;
    const modalTitle = isEdit ? `Editar Material: ${item.name}` : 'Novo Item de Estoque';
    
    document.getElementById('modal-title').textContent = modalTitle;
    document.getElementById('modal-body').innerHTML = `
        <form id="stock-form" class="space-y-4">
            <input type="hidden" id="item-id" value="${isEdit ? item.id : ''}">
            
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Nome do Material</label>
                    <input type="text" id="item-name" value="${isEdit ? item.name : ''}" required class="w-full p-3 border border-gray-300 rounded-lg">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Fornecedor</label>
                    <input type="text" id="item-supplier" value="${isEdit ? item.supplier : ''}" class="w-full p-3 border border-gray-300 rounded-lg">
                </div>
            </div>
            
            <div class="grid grid-cols-3 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Quantidade</label>
                    <input type="number" id="item-quantity" value="${isEdit ? item.quantity : 1}" min="0" required class="w-full p-3 border border-gray-300 rounded-lg">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Unidade</label>
                    <select id="item-unit" required class="w-full p-3 border border-gray-300 rounded-lg">
                        <option value="un">Unidade (un)</option>
                        <option value="ml">Mililitros (ml)</option>
                        <option value="g">Gramas (g)</option>
                        <option value="cx">Caixa (cx)</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Custo Médio (R$)</label>
                    <input type="number" step="0.01" id="item-cost" value="${isEdit ? item.cost : ''}" required class="w-full p-3 border border-gray-300 rounded-lg">
                </div>
            </div>
            
            <div class="flex justify-end space-x-3 pt-4">
                <button type="button" id="form-cancel-btn" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg">Cancelar</button>
                <button type="submit" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">${isEdit ? 'Atualizar' : 'Cadastrar'}</button>
            </div>
        </form>
    `;
    
    if (isEdit) {
        document.getElementById('item-unit').value = item.unit || 'un';
    }

    document.getElementById('stock-form').addEventListener('submit', saveStockItem);
    document.getElementById('form-cancel-btn').addEventListener('click', closeModal);
    
    openModal(modalTitle, 'max-w-xl');
};

const saveStockItem = async (e) => {
    e.preventDefault();
    const isEdit = !!document.getElementById('item-id').value;
    const itemId = document.getElementById('item-id').value;
    
    const itemData = {
        id: itemId || null,
        name: document.getElementById('item-name').value,
        supplier: document.getElementById('item-supplier').value,
        quantity: parseFloat(document.getElementById('item-quantity').value),
        unit: document.getElementById('item-unit').value,
        cost: parseFloat(document.getElementById('item-cost').value),
        lastUpdated: new Date().toISOString()
    };
    
    try {
        const stockRef = db.ref(getStockCollectionPath(currentUser.uid));

        if (isEdit) {
            // RTDB CRUD: Update (usando .update())
            await stockRef.child(itemId).update(itemData);
        } else {
            // RTDB CRUD: Create (usando .push())
            const newRef = stockRef.push();
            itemData.id = newRef.key;
            await newRef.set(itemData);
        }
        
        closeModal();
        showNotification(`Item ${itemData.name} salvo com sucesso!`, 'success');
    } catch (e) {
        showNotification(`Erro ao salvar item (RTDB): ${e.message}`, 'error');
        console.error("Erro ao salvar item (RTDB):", e);
    }
};

const deleteStockItem = async (itemId, itemName) => {
    if (!confirm(`Tem certeza que deseja excluir o item de estoque ${itemName}?`)) return;

    try {
        // RTDB CRUD: Delete (usando .remove())
        const itemRef = db.ref(getStockCollectionPath(currentUser.uid) + '/' + itemId);
        await itemRef.remove();
        
        showNotification(`Item ${itemName} excluído com sucesso!`, 'success');
    } catch (e) {
        showNotification(`Erro ao excluir item (RTDB): ${e.message}`, 'error');
        console.error("Erro ao excluir item (RTDB):", e);
    }
};

// --- Funções CRUD Contas a Receber (Receivable) ---
const openMaterialConsumptionModal = (receivable) => {
    const modalTitle = `Materiais Utilizados: ${receivable.patientName}`;
    
    // Tenta carregar os materiais consumidos para este serviço
    const materialsUsed = receivableMaterialsCache[receivable.id] || [];
    
    const materialsListHTML = materialsUsed.length > 0 ? materialsUsed.map(m => `
        <li class="flex justify-between items-center py-2 border-b">
            <span>${m.name}</span>
            <span class="font-semibold">${m.quantityUsed} ${m.unit}</span>
        </li>
    `).join('') : '<p class="italic text-gray-500">Nenhum material registrado. Adicione um abaixo.</p>';
    
    // Opções de estoque para adicionar
    const stockOptions = stockItems.map(item => 
        `<option value="${item.id}" data-unit="${item.unit}">
            ${item.name} (${item.quantity} ${item.unit} em estoque)
        </option>`
    ).join('');

    document.getElementById('modal-title').textContent = modalTitle;
    document.getElementById('modal-body').innerHTML = `
        <div class="space-y-4">
            <h4 class="text-lg font-bold text-indigo-700">Materiais Registrados:</h4>
            <ul class="bg-gray-50 p-4 rounded-lg list-none divide-y" id="materials-used-list">
                ${materialsListHTML}
            </ul>

            <h4 class="text-lg font-bold text-indigo-700 mt-6">Adicionar Novo Material:</h4>
            <form id="add-material-form" class="space-y-3 p-4 border rounded-lg bg-white">
                <input type="hidden" id="consumption-receivable-id" value="${receivable.id}">
                <div class="grid grid-cols-3 gap-3">
                    <div class="col-span-2">
                        <label class="block text-sm font-medium text-gray-700 mb-1">Material</label>
                        <select id="consumption-material-id" required class="w-full p-3 border border-gray-300 rounded-lg">
                            <option value="">Selecione o Material...</option>
                            ${stockOptions}
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Qtde Consumida</label>
                        <input type="number" step="any" min="0" id="consumption-quantity" required class="w-full p-3 border border-gray-300 rounded-lg" placeholder="Qtde">
                    </div>
                </div>
                <button type="submit" class="w-full py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition duration-200">
                    Registrar Consumo
                </button>
            </form>
        </div>
        <div class="flex justify-end pt-4">
            <button type="button" id="close-consumption-modal" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg">Fechar</button>
        </div>
    `;

    // Carregar o cache inicial e adicionar listeners
    loadReceivableMaterials(receivable.id);
    document.getElementById('add-material-form').addEventListener('submit', saveReceivableMaterial);
    document.getElementById('close-consumption-modal').addEventListener('click', closeModal);
    
    openModal(modalTitle, 'max-w-xl');
};

const loadReceivableMaterials = (receivableId) => {
    // Listener para carregar e atualizar a lista de materiais em tempo real
    const materialsRef = db.ref(getReceivableMaterialsPath(receivableId));
    
    materialsRef.on('value', snapshot => {
        const materialsObject = snapshot.val();
        let materialsList = [];
        
        if (materialsObject) {
            Object.keys(materialsObject).forEach(key => {
                materialsList.push({ id: key, ...materialsObject[key] });
            });
        }
        
        receivableMaterialsCache[receivableId] = materialsList;
        
        // Atualiza a UI do modal se ele estiver aberto
        const listContainer = document.getElementById('materials-used-list');
        if (listContainer) {
            listContainer.innerHTML = materialsList.length > 0 ? materialsList.map(m => `
                <li class="flex justify-between items-center py-2 border-b">
                    <span>${m.name}</span>
                    <span class="font-semibold">${m.quantityUsed} ${m.unit}</span>
                </li>
            `).join('') : '<p class="italic text-gray-500">Nenhum material registrado. Adicione um abaixo.</p>';
        }
    });
};

const saveReceivableMaterial = async (e) => {
    e.preventDefault();
    const receivableId = document.getElementById('consumption-receivable-id').value;
    const materialSelect = document.getElementById('consumption-material-id');
    const materialId = materialSelect.value;
    const quantityUsed = parseFloat(document.getElementById('consumption-quantity').value);
    
    if (!materialId || quantityUsed <= 0) return;
    
    const selectedItem = stockItems.find(i => i.id === materialId);
    if (!selectedItem) {
        showNotification("Material não encontrado no estoque.", "error");
        return;
    }
    
    const consumptionData = {
        materialId: materialId,
        name: selectedItem.name,
        unit: selectedItem.unit,
        quantityUsed: quantityUsed,
        registeredAt: new Date().toISOString()
    };
    
    try {
        // Salva o consumo no nó da Conta a Receber
        await db.ref(getReceivableMaterialsPath(receivableId)).push(consumptionData);
        
        showNotification(`Consumo de ${quantityUsed} ${selectedItem.unit} de ${selectedItem.name} registrado!`, 'success');
        
        // Limpa o formulário de consumo
        document.getElementById('consumption-quantity').value = '';
        materialSelect.value = '';
        
    } catch (e) {
        showNotification(`Erro ao registrar consumo (RTDB): ${e.message}`, 'error');
        console.error("Erro ao salvar consumo (RTDB):", e);
    }
};

const openReceivableFormModal = (item = null) => {
    const isEdit = !!item;
    const modalTitle = isEdit ? `Editar Conta a Receber` : 'Registrar Serviço (Contas a Receber)';
    
    // Gerar a lista de pacientes para o SELECT
    const patientOptions = allPatients.map(p => 
        `<option value="${p.id}" ${item && item.patientId === p.id ? 'selected' : ''}>${p.name} (${p.treatmentType})</option>`
    ).join('');
    
    // Botão de materiais só aparece na edição ou após o cadastro inicial
    const materialsButton = isEdit ? `
        <button type="button" id="manage-materials-btn" data-receivable-id="${item.id}" class="py-2 px-4 bg-yellow-500 hover:bg-yellow-600 text-white font-bold rounded-lg transition duration-200 shadow-md">
            <i class='bx bx-sitemap mr-2'></i> Gerenciar Materiais
        </button>
    ` : '';

    document.getElementById('modal-title').textContent = modalTitle;
    document.getElementById('modal-body').innerHTML = `
        <form id="receivable-form" class="space-y-4">
            <input type="hidden" id="receivable-id" value="${isEdit ? item.id : ''}">
            
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Paciente</label>
                    <select id="receivable-patient-id" required class="w-full p-3 border border-gray-300 rounded-lg">
                        <option value="">Selecione o Paciente...</option>
                        ${patientOptions}
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Valor do Serviço (R$)</label>
                    <input type="number" step="0.01" id="receivable-amount" value="${isEdit ? item.amount : ''}" required class="w-full p-3 border border-gray-300 rounded-lg">
                </div>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Vencimento</label>
                    <input type="date" id="receivable-due-date" value="${isEdit ? item.dueDate : new Date().toISOString().substring(0, 10)}" required class="w-full p-3 border border-gray-300 rounded-lg">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select id="receivable-status" required class="w-full p-3 border border-gray-300 rounded-lg">
                        <option value="Aberto">Aberto</option>
                        <option value="Recebido" ${isEdit && item.status === 'Recebido' ? 'selected' : ''}>Recebido</option>
                        <option value="Atrasado" ${isEdit && item.status === 'Atrasado' ? 'selected' : ''}>Atrasado</option>
                    </select>
                </div>
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Descrição Detalhada do Serviço</label>
                <textarea id="receivable-description" rows="2" required class="w-full p-3 border border-gray-300 rounded-lg resize-none">${isEdit ? item.description : ''}</textarea>
            </div>
            
            <div class="flex justify-between items-center pt-4">
                ${materialsButton}
                <div class="flex space-x-3">
                    <button type="button" id="form-cancel-btn" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg">Cancelar</button>
                    <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">${isEdit ? 'Atualizar' : 'Registrar Serviço'}</button>
                </div>
            </div>
        </form>
    `;

    document.getElementById('receivable-form').addEventListener('submit', saveReceivable);
    document.getElementById('form-cancel-btn').addEventListener('click', closeModal);
    
    if (isEdit) {
        document.getElementById('manage-materials-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openMaterialConsumptionModal(item);
        });
    }
    
    openModal(modalTitle, 'max-w-2xl');
};

const saveReceivable = async (e) => {
    e.preventDefault();
    const isEdit = !!document.getElementById('receivable-id').value;
    const receivableId = document.getElementById('receivable-id').value;
    const patientId = document.getElementById('receivable-patient-id').value;
    
    // Busca o nome do paciente no array em memória
    const patientName = allPatients.find(p => p.id === patientId)?.name || "Paciente Removido"; 

    const itemData = {
        id: receivableId || null,
        patientId: patientId,
        patientName: patientName,
        amount: parseFloat(document.getElementById('receivable-amount').value),
        dueDate: document.getElementById('receivable-due-date').value,
        description: document.getElementById('receivable-description').value,
        status: document.getElementById('receivable-status').value,
        registeredAt: new Date().toISOString()
    };
    
    try {
        const receivableRef = db.ref(getReceivablePath(currentUser.uid));

        if (isEdit) {
            await receivableRef.child(receivableId).update(itemData);
        } else {
            const newRef = receivableRef.push();
            itemData.id = newRef.key;
            await newRef.set(itemData);
            // Se for um novo registro, reabre o modal no modo edição para gerenciar materiais
            closeModal();
            openReceivableFormModal(itemData);
        }
        
        if (isEdit) closeModal();
        showNotification(`Conta a Receber (${patientName}) registrada com sucesso!`, 'success');
    } catch (e) {
        showNotification(`Erro ao salvar Conta a Receber (RTDB): ${e.message}`, 'error');
        console.error("Erro ao salvar Conta a Receber (RTDB):", e);
    }
};

const loadReceivable = () => {
    if (!currentUser) return;
    
    const receivableRef = db.ref(getReceivablePath(currentUser.uid));

    receivableRef.on('value', snapshot => {
        const itemsObject = snapshot.val();
        let itemsList = [];
        let totalReceivable = 0;
        let receivedThisMonth = 0;
        let openCount = 0;

        if (itemsObject) {
            Object.keys(itemsObject).forEach(key => {
                const item = { id: key, ...itemsObject[key] };
                
                if (item.status === 'Aberto' || item.status === 'Atrasado') {
                    totalReceivable += item.amount;
                    openCount++;
                }

                const today = new Date();
                // A data de recebimento é implicitamente a data de registro/update
                const itemDate = new Date(item.registeredAt); 
                
                if (item.status === 'Recebido' && itemDate.getMonth() === today.getMonth() && itemDate.getFullYear() === today.getFullYear()) {
                    receivedThisMonth += item.amount;
                }
                
                itemsList.push(item);
            });
        }
        
        receivables = itemsList;
        renderReceivableTable(itemsList, totalReceivable, receivedThisMonth, openCount);
    }, e => showNotification(`Erro ao carregar Contas a Receber (RTDB): ${e.message}`, 'error'));
};

const renderReceivableTable = (items, totalReceivable, receivedThisMonth, openCount) => {
    const tbody = document.getElementById('receivable-table-body');
    if (!tbody) return;

    // Atualiza KPIs
    document.getElementById('total-receivable').textContent = formatCurrency(totalReceivable);
    document.getElementById('received-this-month').textContent = formatCurrency(receivedThisMonth);
    document.getElementById('open-receivable-count').textContent = openCount;
    
    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500 italic">Nenhuma conta a receber registrada.</td></tr>`;
        return;
    }
    
    items.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)); // Ordena por data de vencimento

    tbody.innerHTML = items.map(t => {
        const isReceived = t.status === 'Recebido';
        let statusClass = 'bg-yellow-100 text-yellow-800';
        if (isReceived) statusClass = 'bg-green-100 text-green-800';
        if (t.status === 'Atrasado') statusClass = 'bg-red-100 text-red-800';
        
        const actionButton = isReceived ? 
            `<button data-action="unreceive" data-id="${t.id}" class="p-2 text-gray-400 hover:text-gray-600" title="Marcar como Aberta">
                <i class='bx bx-undo text-xl'></i>
            </button>` :
            `<button data-action="receive" data-id="${t.id}" class="p-2 text-green-600 hover:bg-green-100 rounded-full" title="Marcar como Recebido">
                <i class='bx bx-check-square text-xl'></i>
            </button>`;

        return `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${t.patientName}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${t.dueDate}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${t.description}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-600">${formatCurrency(t.amount)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass} mr-2">${t.status}</span>
                    <div class="inline-flex space-x-2">
                        <button data-action="manage-materials-table" data-id="${t.id}" class="p-2 text-yellow-500 hover:bg-yellow-100 rounded-full" title="Gerenciar Materiais">
                            <i class='bx bx-sitemap text-xl'></i>
                        </button>
                        ${actionButton}
                        <button data-action="edit-receivable" data-id="${t.id}" class="p-2 text-indigo-600 hover:bg-indigo-100 rounded-full" title="Editar">
                            <i class='bx bxs-edit-alt text-xl'></i>
                        </button>
                        <button data-action="delete-receivable" data-id="${t.id}" class="p-2 text-red-600 hover:bg-red-100 rounded-full" title="Excluir">
                            <i class='bx bxs-trash-alt text-xl'></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    tbody.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const receivableId = btn.dataset.id;
        const item = receivables.find(t => t.id === receivableId);

        switch (btn.dataset.action) {
            case 'edit-receivable': openReceivableFormModal(item); break;
            case 'delete-receivable': deleteReceivable(receivableId, item.patientName); break;
            case 'receive': updateReceivableStatus(receivableId, 'Recebido'); break;
            case 'unreceive': updateReceivableStatus(receivableId, 'Aberto'); break;
            case 'manage-materials-table': openMaterialConsumptionModal(item); break;
        }
    });
};

const deleteReceivable = async (receivableId, patientName) => {
    if (!confirm(`Tem certeza que deseja excluir a conta a receber do paciente ${patientName}?`)) return;

    try {
        await db.ref(getReceivablePath(currentUser.uid) + '/' + receivableId).remove();
        
        // Opcional: Limpar os materiais consumidos (remoção em cascata)
        await db.ref(getReceivableMaterialsPath(receivableId)).remove();
        
        showNotification(`Conta a Receber excluída com sucesso!`, 'success');
    } catch (e) {
        showNotification(`Erro ao excluir Conta a Receber (RTDB): ${e.message}`, 'error');
        console.error("Erro ao excluir Conta a Receber (RTDB):", e);
    }
};

const updateReceivableStatus = async (receivableId, newStatus) => {
    const item = receivables.find(r => r.id === receivableId);
    if (!item) return;

    try {
        if (newStatus === 'Recebido' && item.status !== 'Recebido') {
            // LÓGICA CRÍTICA DE NEGÓCIO: DAR BAIXA NO ESTOQUE
            const materialsToConsume = receivableMaterialsCache[receivableId] || [];
            
            if (materialsToConsume.length > 0) {
                for (const consumption of materialsToConsume) {
                    const stockRef = db.ref(getStockCollectionPath(currentUser.uid) + '/' + consumption.materialId);
                    const snapshot = await stockRef.once('value');
                    const stockItem = snapshot.val();
                    
                    if (stockItem) {
                        const newQuantity = stockItem.quantity - consumption.quantityUsed;
                        if (newQuantity < 0) {
                            throw new Error(`Estoque insuficiente de ${stockItem.name}. Qtde disponível: ${stockItem.quantity}`);
                        }
                        
                        // Atualiza o estoque no RTDB
                        await stockRef.update({ quantity: newQuantity });
                    }
                }
                showNotification(`Baixa de estoque aplicada para ${materialsToConsume.length} materiais.`, 'warning');
            }
        }
        
        // Atualiza o status da Conta a Receber
        await db.ref(getReceivablePath(currentUser.uid) + '/' + receivableId).update({
            status: newStatus,
            receivedDate: newStatus === 'Recebido' ? new Date().toISOString() : null
        });
        showNotification(`Conta marcada como ${newStatus}!`, 'success');
    } catch (e) {
        showNotification(`Falha na Baixa/Recebimento: ${e.message}`, 'error');
        console.error("Erro na baixa de estoque:", e);
    }
};

// --- Funções CRUD Despesas (Expense) ---
let expenses = [];
let expensePurchasedItemsCache = {}; // NOVO: Cache para itens comprados por despesa

// NOVO MODAL: Para gerenciar os itens comprados (compra de estoque)
const openItemsPurchaseModal = (expense) => {
    const modalTitle = `Itens Comprados: ${expense.ref || 'Despesa Sem Ref'}`;
    
    // Tenta carregar os itens comprados para esta despesa
    const itemsPurchased = expensePurchasedItemsCache[expense.id] || [];
    
    const itemsListHTML = itemsPurchased.length > 0 ? itemsPurchased.map(i => `
        <li class="flex justify-between items-center py-2 border-b">
            <span>${i.name}</span>
            <span class="font-semibold">${i.quantityPurchased} ${i.unit} (Custo: ${formatCurrency(i.cost * i.quantityPurchased)})</span>
        </li>
    `).join('') : '<p class="italic text-gray-500">Nenhum item comprado registrado. Adicione um abaixo.</p>';
    
    // Opções de estoque para adicionar (apenas o nome e a unidade do item de estoque existente)
    const stockOptions = stockItems.map(item => 
        `<option value="${item.id}" data-unit="${item.unit}" data-cost="${item.cost}">
            ${item.name} (${item.unit})
        </option>`
    ).join('');

    document.getElementById('modal-title').textContent = modalTitle;
    document.getElementById('modal-body').innerHTML = `
        <div class="space-y-4">
            <h4 class="text-lg font-bold text-red-700">Itens Registrados nesta Despesa:</h4>
            <ul class="bg-gray-50 p-4 rounded-lg list-none divide-y" id="purchased-items-list">
                ${itemsListHTML}
            </ul>

            <h4 class="text-lg font-bold text-red-700 mt-6">Registrar Compra (Atualiza Estoque):</h4>
            <form id="add-purchase-form" class="space-y-3 p-4 border rounded-lg bg-white">
                <input type="hidden" id="purchase-expense-id" value="${expense.id}">
                <div class="grid grid-cols-4 gap-3">
                    <div class="col-span-2">
                        <label class="block text-sm font-medium text-gray-700 mb-1">Material</label>
                        <select id="purchase-material-id" required class="w-full p-3 border border-gray-300 rounded-lg">
                            <option value="">Selecione o Material...</option>
                            ${stockOptions}
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Qtde Comprada</label>
                        <input type="number" step="any" min="0" id="purchase-quantity" required class="w-full p-3 border border-gray-300 rounded-lg" placeholder="Qtde">
                    </div>
                     <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Custo Un (R$)</label>
                        <input type="number" step="0.01" id="purchase-cost" required class="w-full p-3 border border-gray-300 rounded-lg" placeholder="R$">
                    </div>
                </div>
                <button type="submit" class="w-full py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition duration-200">
                    Registrar Compra e Atualizar Estoque
                </button>
            </form>
        </div>
        <div class="flex justify-end pt-4">
            <button type="button" id="close-purchase-modal" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg">Fechar</button>
        </div>
    `;

    // Carregar o cache inicial e adicionar listeners
    loadExpensePurchasedItems(expense.id);
    document.getElementById('add-purchase-form').addEventListener('submit', savePurchasedItem);
    document.getElementById('close-purchase-modal').addEventListener('click', closeModal);
    
    openModal(modalTitle, 'max-w-3xl');
};

const loadExpensePurchasedItems = (expenseId) => {
    // Listener para carregar e atualizar a lista de itens comprados em tempo real
    const itemsRef = db.ref(getExpensePurchasedItemsPath(expenseId));
    
    itemsRef.on('value', snapshot => {
        const itemsObject = snapshot.val();
        let itemsList = [];
        
        if (itemsObject) {
            Object.keys(itemsObject).forEach(key => {
                itemsList.push({ id: key, ...itemsObject[key] });
            });
        }
        
        expensePurchasedItemsCache[expenseId] = itemsList;
        
        // Atualiza a UI do modal se ele estiver aberto
        const listContainer = document.getElementById('purchased-items-list');
        if (listContainer) {
            listContainer.innerHTML = itemsList.length > 0 ? itemsList.map(i => `
                <li class="flex justify-between items-center py-2 border-b">
                    <span>${i.name}</span>
                    <span class="font-semibold">${i.quantityPurchased} ${i.unit} (Custo Total: ${formatCurrency(i.cost * i.quantityPurchased)})</span>
                </li>
            `).join('') : '<p class="italic text-gray-500">Nenhum item comprado registrado. Adicione um abaixo.</p>';
        }
    });
};

const savePurchasedItem = async (e) => {
    e.preventDefault();
    const expenseId = document.getElementById('purchase-expense-id').value;
    const materialSelect = document.getElementById('purchase-material-id');
    const materialId = materialSelect.value;
    const quantityPurchased = parseFloat(document.getElementById('purchase-quantity').value);
    const unitCost = parseFloat(document.getElementById('purchase-cost').value);
    
    if (!materialId || quantityPurchased <= 0 || unitCost <= 0) {
        showNotification("Preencha todos os campos de compra corretamente.", "error");
        return;
    }
    
    const selectedItem = stockItems.find(i => i.id === materialId);
    if (!selectedItem) {
        showNotification("Material não encontrado no estoque.", "error");
        return;
    }
    
    const purchaseData = {
        materialId: materialId,
        name: selectedItem.name,
        unit: selectedItem.unit,
        quantityPurchased: quantityPurchased,
        cost: unitCost,
        registeredAt: new Date().toISOString()
    };
    
    try {
        // 1. Salva o item comprado no nó da Despesa
        await db.ref(getExpensePurchasedItemsPath(expenseId)).push(purchaseData);
        
        // 2. ATUALIZA O ESTOQUE (Adiciona a quantidade)
        const stockRef = db.ref(getStockCollectionPath(currentUser.uid) + '/' + materialId);
        const currentStock = await stockRef.once('value');
        const currentData = currentStock.val();
        
        if (currentData) {
            const newQuantity = currentData.quantity + quantityPurchased;
            // Cálculo do novo Custo Médio Ponderado (simplificado: apenas atualiza a quantidade)
            await stockRef.update({ 
                quantity: newQuantity,
                lastUpdated: new Date().toISOString()
            });
        }
        
        showNotification(`Compra de ${quantityPurchased} ${selectedItem.unit} de ${selectedItem.name} registrada e estoque atualizado!`, 'success');
        
        // Limpa o formulário de consumo
        document.getElementById('purchase-quantity').value = '';
        document.getElementById('purchase-cost').value = '';
        materialSelect.value = '';
        
    } catch (e) {
        showNotification(`Erro ao registrar compra e atualizar estoque (RTDB): ${e.message}`, 'error');
        console.error("Erro ao salvar compra (RTDB):", e);
    }
};

const openExpenseFormModal = (item = null) => {
    const isEdit = !!item;
    const modalTitle = isEdit ? `Editar Despesa` : 'Registrar Despesa';

    // Botão de itens comprados só aparece na edição ou após o cadastro inicial
    const purchasedItemsButton = isEdit ? `
        <button type="button" id="manage-purchase-btn" data-expense-id="${item.id}" class="py-2 px-4 bg-yellow-500 hover:bg-yellow-600 text-white font-bold rounded-lg transition duration-200 shadow-md">
            <i class='bx bx-cart mr-2'></i> Gerenciar Itens Comprados
        </button>
    ` : '';
    
    document.getElementById('modal-title').textContent = modalTitle;
    document.getElementById('modal-body').innerHTML = `
        <form id="expense-form" class="space-y-4">
            <input type="hidden" id="expense-id" value="${isEdit ? item.id : ''}">
            
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Nota Fiscal/Referência</label>
                    <input type="text" id="expense-ref" value="${isEdit ? item.ref : ''}" class="w-full p-3 border border-gray-300 rounded-lg" placeholder="Ex: NF 1234, Aluguel Setembro">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Valor Total (R$)</label>
                    <input type="number" step="0.01" id="expense-amount" value="${isEdit ? item.amount : ''}" required class="w-full p-3 border border-gray-300 rounded-lg">
                </div>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Vencimento</label>
                    <input type="date" id="expense-due-date" value="${isEdit ? item.dueDate : new Date().toISOString().substring(0, 10)}" required class="w-full p-3 border border-gray-300 rounded-lg">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Fornecedor/Categoria</label>
                    <input type="text" id="expense-supplier" value="${isEdit ? item.supplier : ''}" class="w-full p-3 border border-gray-300 rounded-lg" placeholder="Ex: Contabilidade, Imobiliária">
                </div>
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <textarea id="expense-description" rows="2" required class="w-full p-3 border border-gray-300 rounded-lg resize-none">${isEdit ? item.description : ''}</textarea>
            </div>
            
            <div class="flex justify-between items-center pt-4">
                ${purchasedItemsButton}
                <div class="flex space-x-3">
                    <button type="button" id="form-cancel-btn" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg">Cancelar</button>
                    <button type="submit" class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">${isEdit ? 'Atualizar' : 'Registrar Despesa'}</button>
                </div>
            </div>
        </form>
    `;

    document.getElementById('expense-form').addEventListener('submit', saveExpense);
    document.getElementById('form-cancel-btn').addEventListener('click', closeModal);
    
    if (isEdit) {
         document.getElementById('manage-purchase-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openItemsPurchaseModal(item);
        });
    }

    openModal(modalTitle, 'max-w-xl');
};

const saveExpense = async (e) => {
    e.preventDefault();
    const isEdit = !!document.getElementById('expense-id').value;
    const expenseId = document.getElementById('expense-id').value;

    const itemData = {
        id: expenseId || null,
        ref: document.getElementById('expense-ref').value,
        supplier: document.getElementById('expense-supplier').value,
        amount: parseFloat(document.getElementById('expense-amount').value),
        dueDate: document.getElementById('expense-due-date').value,
        description: document.getElementById('expense-description').value,
        registeredAt: new Date().toISOString(),
        // NOVO STATUS: Facilita controle de Contas a Pagar
        status: 'Aberto' 
    };

    try {
        const expenseRef = db.ref(getExpensePath(currentUser.uid));

        if (isEdit) {
            await expenseRef.child(expenseId).update(itemData);
        } else {
            const newRef = expenseRef.push();
            itemData.id = newRef.key;
            await newRef.set(itemData);
            // Se for um novo registro, reabre o modal no modo edição para gerenciar a compra
            closeModal();
            openExpenseFormModal(itemData);
        }

        if (isEdit) closeModal();
        showNotification(`Despesa registrada com sucesso!`, 'success');
    } catch (e) {
        showNotification(`Erro ao salvar Despesa (RTDB): ${e.message}`, 'error');
        console.error("Erro ao salvar Despesa (RTDB):", e);
    }
};

const loadExpenses = () => {
    if (!currentUser) return;

    const expenseRef = db.ref(getExpensePath(currentUser.uid));

    expenseRef.on('value', snapshot => {
        const itemsObject = snapshot.val();
        let itemsList = [];
        let totalExpenseOpen = 0;
        let totalPaidThisMonth = 0;
        let nextDueDate = "N/A";
        
        const today = new Date().toISOString().substring(0, 10);
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();

        if (itemsObject) {
            Object.keys(itemsObject).forEach(key => {
                const item = { id: key, ...itemsObject[key] };
                
                if (item.status === 'Aberto') {
                    totalExpenseOpen += item.amount;
                }
                
                if (item.status === 'Pago') {
                     const paidDate = new Date(item.paidDate);
                     if (paidDate.getMonth() === currentMonth && paidDate.getFullYear() === currentYear) {
                         totalPaidThisMonth += item.amount;
                     }
                }
                
                // Próximo Vencimento (apenas abertas)
                if (item.status === 'Aberto' && item.dueDate >= today && (nextDueDate === "N/A" || item.dueDate < nextDueDate)) {
                    nextDueDate = item.dueDate;
                }
                
                itemsList.push(item);
            });
        }
        
        expenses = itemsList;
        renderExpenseTable(itemsList, totalExpenseOpen, totalPaidThisMonth, nextDueDate);
    }, e => showNotification(`Erro ao carregar Despesas (RTDB): ${e.message}`, 'error'));
};

const renderExpenseTable = (items, totalExpenseOpen, totalPaidThisMonth, nextDueDate) => {
    const tbody = document.getElementById('expense-table-body');
    if (!tbody) return;

    // Atualiza KPIs
    document.getElementById('total-expense-open').textContent = formatCurrency(totalExpenseOpen);
    document.getElementById('paid-this-month').textContent = formatCurrency(totalPaidThisMonth);
    document.getElementById('next-due-date').textContent = nextDueDate;

    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500 italic">Nenhuma despesa registrada.</td></tr>`;
        return;
    }
    
    items.sort((a, b) => new Date(b.dueDate) - new Date(a.dueDate)); // Ordena por data de vencimento (reversa)

    tbody.innerHTML = items.map(t => {
        const isPaid = t.status === 'Pago';
        let statusClass = 'bg-red-100 text-red-800';
        if (isPaid) statusClass = 'bg-green-100 text-green-800';
        
        const actionButton = isPaid ? 
             `<button data-action="unpay" data-id="${t.id}" class="p-2 text-gray-400 hover:text-gray-600" title="Marcar como Aberta">
                <i class='bx bx-undo text-xl'></i>
            </button>` :
            `<button data-action="pay" data-id="${t.id}" class="p-2 text-green-600 hover:bg-green-100 rounded-full" title="Marcar como Paga">
                <i class='bx bx-check-square text-xl'></i>
            </button>`;

        return `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${t.dueDate}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${t.supplier || 'N/A'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${t.ref || 'N/A'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-red-600">${formatCurrency(t.amount)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass} mr-2">${t.status}</span>
                    <div class="inline-flex space-x-2">
                         <button data-action="manage-purchase-table" data-id="${t.id}" class="p-2 text-yellow-500 hover:bg-yellow-100 rounded-full" title="Gerenciar Itens Comprados">
                            <i class='bx bx-cart text-xl'></i>
                        </button>
                        ${actionButton}
                        <button data-action="edit-expense" data-id="${t.id}" class="p-2 text-indigo-600 hover:bg-indigo-100 rounded-full" title="Editar">
                            <i class='bx bxs-edit-alt text-xl'></i>
                        </button>
                        <button data-action="delete-expense" data-id="${t.id}" class="p-2 text-red-600 hover:bg-red-100 rounded-full" title="Excluir">
                            <i class='bx bxs-trash-alt text-xl'></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    tbody.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const expenseId = btn.dataset.id;
        const item = expenses.find(t => t.id === expenseId);

        switch (btn.dataset.action) {
            case 'edit-expense': openExpenseFormModal(item); break;
            case 'delete-expense': deleteExpense(expenseId, item.description); break;
            case 'pay': updateExpenseStatus(expenseId, 'Pago'); break;
            case 'unpay': updateExpenseStatus(expenseId, 'Aberto'); break;
            case 'manage-purchase-table': openItemsPurchaseModal(item); break;
        }
    });
};

const deleteExpense = async (expenseId, description) => {
    if (!confirm(`Tem certeza que deseja excluir a despesa: "${description}"?`)) return;

    try {
        await db.ref(getExpensePath(currentUser.uid) + '/' + expenseId).remove();
        showNotification(`Despesa excluída com sucesso!`, 'success');
    } catch (e) {
        showNotification(`Erro ao excluir Despesa (RTDB): ${e.message}`, 'error');
        console.error("Erro ao excluir Despesa (RTDB):", e);
    }
};

const updateExpenseStatus = async (expenseId, newStatus) => {
    try {
        await db.ref(getExpensePath(currentUser.uid) + '/' + expenseId).update({
            status: newStatus,
            paidDate: newStatus === 'Pago' ? new Date().toISOString() : null
        });
        showNotification(`Despesa marcada como ${newStatus}!`, 'success');
    } catch (e) {
        showNotification(`Erro ao atualizar status (RTDB): ${e.message}`, 'error');
    }
};

// --- Funções de Modal ---
const openModal = (title, maxWidth = 'max-w-xl') => {
    const modal = document.getElementById('app-modal');
    const content = modal.querySelector('.modal-content');
    modal.querySelector('#modal-title').textContent = title;
    content.className = `modal-content w-full ${maxWidth}`;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

const closeModal = () => {
    document.getElementById('app-modal').classList.add('hidden');
    document.getElementById('app-modal').classList.remove('flex');
    document.getElementById('modal-body').innerHTML = ''; // Limpa o corpo
    
    // Recarregar os dados necessários ao fechar um modal
    if (currentView === 'patients') {
        loadPatients();
    }
    // Forçamos a recarga do conteúdo financeiro (incluindo abas) ao fechar o modal
    if (currentView === 'financials') {
        renderContent(); 
    }
    // Recarregar KPIs no Dashboard
    if (document.getElementById('dashboard-patients-count')) {
        loadDashboardKPIs();
    }
};

// ==================================================================
// INICIALIZAÇÃO DA APLICAÇÃO E LISTENERS GERAIS
// ==================================================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. Inicia a Conexão e Autenticação
    initializeFirebase();
    
    // 2. Listener para fechar o modal
    document.getElementById('close-modal').addEventListener('click', closeModal);
    
    // 3. Listener de Logout
    document.getElementById('logout-button').addEventListener('click', () => {
        if (auth) {
            auth.signOut().then(() => {
                showNotification("Logout realizado com sucesso. Recarregando.", "success");
                // Força o onAuthStateChanged a recarregar a tela de login
            });
        }
    });
    
    // 4. Listener do formulário de Login/Registro
    const authForm = document.getElementById('auth-form');
    if (authForm) authForm.addEventListener('submit', handleAuthSubmit);
    const toggleBtn = document.getElementById('toggle-auth-mode');
    if (toggleBtn) toggleBtn.addEventListener('click', toggleAuthMode);

    // 5. Listener geral para navegação no corpo principal (após o DOM estar pronto)
    // Opcional, mas útil para botões dinâmicos.
    document.getElementById('main-content').addEventListener('click', (e) => {
        // Exemplo: if (e.target.closest('#some-button')) { ... }
    });
});

})(); // FIM DO ENCAPSULAMENTO IIFE
