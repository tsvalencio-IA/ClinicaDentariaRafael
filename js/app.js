// ==================================================================
// MÓDULO PRINCIPAL - DENTISTA INTELIGENTE
// ==================================================================

// Variáveis Globais (Definidas em config.js e Injetadas pelo ambiente)
const { firebaseConfig, initialAuthToken, CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET, NAV_ITEMS, GEMINI_MODEL, API_KEY } = window.AppConfig; 
const appId = 'dentista-inteligente-app'; // App ID Fixo

let db, auth;
let currentUser = null;
let currentView = 'dashboard';

// ==================================================================
// FUNÇÕES AUXILIARES
// ==================================================================

// Caminhos do Firestore (para segurança multi-tenant por Dentista)
const getAdminCollectionPath = (uid, collectionName) => `artifacts/${appId}/users/${uid}/${collectionName}`;
const getJournalCollectionPath = (patientId) => `artifacts/${appId}/patients/${patientId}/journal`;

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
    // Implementação de notificação na UI (simplificada para console)
    const logType = type === 'error' ? 'ERROR' : (type === 'warning' ? 'WARN' : 'INFO');
    console.log(`[NOTIFICAÇÃO ${logType}]: ${message}`);
    // No futuro, adicionaríamos a lógica visual de notificação que você tinha no Chevron
};

const formatCurrency = (value) => `R$ ${parseFloat(value || 0).toFixed(2).replace('.', ',')}`;

// --- Conexão Firebase ---
const initializeFirebase = async () => {
    if (Object.keys(firebaseConfig).length === 0) {
        showNotification("ERRO: Configuração do Firebase está vazia. Verifique a injeção do ambiente.", "error");
        return;
    }
    
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        
        // Usando Firestore (melhor para dados estruturados e segurança)
        db = firebase.firestore();
        auth = firebase.auth();
        
        // Tenta autenticar o usuário Dentista/Admin
        let user;
        if (initialAuthToken) {
             const userCredential = await auth.signInWithCustomToken(initialAuthToken);
             user = userCredential.user;
        } else {
             // Fallback para login anônimo se não houver token (para testes)
             const userCredential = await auth.signInAnonymously();
             user = userCredential.user;
        }

        currentUser = { uid: user.uid, email: user.email || 'Admin Anônimo' };
        
        document.getElementById('loading-message').textContent = 'Sucesso! Carregando UI...';
        showUI();
        
    } catch (error) {
        console.error("Erro CRÍTICO na autenticação ou inicialização:", error);
        document.getElementById('loading-message').textContent = `Falha no Login: ${error.message}`;
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
    navMenu.innerHTML = NAV_ITEMS.map(item => `
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
    
    // Simulação da Lógica do Componente React (Renderização da View)
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
// MÓDULOS DE RENDERIZAÇÃO (Implementação dos Módulos do Projeto)
// ==================================================================

// --- 1. DASHBOARD E BRAIN ---
const renderDashboard = (container) => {
    container.innerHTML = `
        <div class="p-8 bg-white shadow-2xl rounded-2xl border border-indigo-100 max-w-4xl mx-auto">
            <h2 class="text-3xl font-extrabold text-indigo-800 mb-8 flex items-center">
                <i class='bx bxs-dashboard text-3xl mr-3 text-indigo-600'></i> Dashboard & Visão Geral
            </h2>

            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
                <div class="p-4 bg-indigo-100 rounded-lg shadow-md"><p class="text-sm text-gray-600">Pacientes</p><p class="text-2xl font-bold text-indigo-800">0</p></div>
                <div class="p-4 bg-cyan-100 rounded-lg shadow-md"><p class="text-sm text-gray-600">Ativos IA</p><p class="text-2xl font-bold text-cyan-800">0</p></div>
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
                ID Dentista: <span class="font-mono text-xs p-1 bg-gray-100 rounded">${currentUser.uid.slice(0, 8)}...</span>
            </p>
        </div>
    `;

    // Adicionar Lógica para o BRAIN
    loadBrainConfig();
    document.getElementById('save-brain-btn').addEventListener('click', saveBrainConfig);
};

const loadBrainConfig = () => {
    const docRef = db.collection(`artifacts/${appId}/users/${currentUser.uid}/aiConfig`).doc('directives');
    docRef.get().then(doc => {
        const brainInput = document.getElementById('brain-input');
        if (doc.exists) {
            brainInput.value = doc.data().promptDirectives;
        } else {
            brainInput.value = "Atuar como assistente. Variável de Tratamento: [TIPO]. Meta: [META]. Focar em higiene e progresso.";
        }
    }).catch(e => console.error("Erro ao carregar BRAIN:", e));
};

const saveBrainConfig = () => {
    const prompt = document.getElementById('brain-input').value;
    const msgEl = document.getElementById('brain-message');
    if (!prompt.trim()) {
        msgEl.textContent = 'O BRAIN não pode estar vazio!';
        msgEl.classList.replace('text-indigo-700', 'text-red-600');
        return;
    }
    
    const docRef = db.collection(`artifacts/${appId}/users/${currentUser.uid}/aiConfig`).doc('directives');
    docRef.set({
        promptDirectives: prompt,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'Online'
    }).then(() => {
        msgEl.textContent = 'BRAIN alimentado! Sucesso.';
        msgEl.classList.replace('text-red-600', 'text-indigo-700');
        setTimeout(() => msgEl.textContent = '', 3000);
    }).catch(e => {
        msgEl.textContent = 'Erro ao salvar: ' + e.message;
        msgEl.classList.replace('text-indigo-700', 'text-red-600');
        console.error("Erro ao salvar BRAIN:", e);
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
    
    // Renderiza o formulário dentro do modal
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
                <textarea id="patient-treatment-goal" rows="2" placeholder="Ex: Fechar diastema central em 6 meses. Instrução essencial para a IA." required class="w-full p-3 border border-gray-300 rounded-lg resize-none">${isEdit ? patient.treatmentGoal : ''}</textarea>
            </div>
            
            <div class="flex justify-end space-x-3 pt-4">
                <button type="button" id="form-cancel-btn" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg">Cancelar</button>
                <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">${isEdit ? 'Atualizar' : 'Cadastrar'}</button>
            </div>
        </form>
    `;
    
    // Pré-seleciona valores existentes
    if (isEdit) {
        document.getElementById('patient-treatment-type').value = patient.treatmentType || 'Geral';
        document.getElementById('patient-status').value = patient.status || 'Novo Cadastro';
    }

    // Adiciona listeners para o formulário
    document.getElementById('patient-form').addEventListener('submit', savePatient);
    document.getElementById('form-cancel-btn').addEventListener('click', closeModal);
    
    openModal(modalTitle, 'max-w-2xl');
};

const savePatient = async (e) => {
    e.preventDefault();
    const isEdit = !!document.getElementById('patient-id').value;
    const patientId = document.getElementById('patient-id').value || db.collection('dummy').doc().id; // Gera um ID único se for novo
    
    const patientData = { 
        id: patientId,
        name: document.getElementById('patient-name').value,
        email: document.getElementById('patient-email').value,
        treatmentType: document.getElementById('patient-treatment-type').value,
        treatmentGoal: document.getElementById('patient-treatment-goal').value,
        status: document.getElementById('patient-status').value,
        createdAt: isEdit ? allPatients.find(p => p.id === patientId).createdAt : new Date().toISOString()
    };
    
    try {
        const docRef = db.collection(getAdminCollectionPath(currentUser.uid, 'patients')).doc(patientId);
        await docRef.set(patientData, { merge: true });
        
        closeModal();
        showNotification(`Paciente ${patientData.name} salvo com sucesso!`, 'success');
    } catch (e) {
        showNotification(`Erro ao salvar paciente: ${e.message}`, 'error');
        console.error("Erro ao salvar paciente:", e);
    }
};

let allPatients = [];

const loadPatients = () => {
    const qRef = db.collection(getAdminCollectionPath(currentUser.uid, 'patients'));
    
    qRef.onSnapshot(snapshot => {
        const patientsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allPatients = patientsList;
        renderPatientsTable(patientsList);
    }, e => showNotification(`Erro ao carregar lista de pacientes: ${e.message}`, 'error'));
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
                    <button data-action="journal" data-id="${p.id}" class="p-2 text-cyan-600 hover:bg-cyan-100 rounded-full" title="Abrir Diário (IA)">
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

    // Adicionar listeners de ação à tabela
    tbody.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const patientId = btn.dataset.id;
        const patient = patients.find(p => p.id === patientId);
        if (!patient) return;

        switch (btn.dataset.action) {
            case 'journal': openJournalModal(patient); break;
            case 'edit': openPatientFormModal(patient); break;
            case 'delete': deletePatient(patientId, patient.name); break;
        }
    });
};

const deletePatient = async (patientId, patientName) => {
    if (!confirm(`Tem certeza que deseja excluir o paciente ${patientName} e todo o seu histórico de diário?`)) return;

    try {
        // Exclui o documento principal do paciente
        await db.collection(getAdminCollectionPath(currentUser.uid, 'patients')).doc(patientId).delete();
        
        // Exclui as entradas do diário (simulação de exclusão em cascata)
        const journalRef = db.collection(getJournalCollectionPath(patientId));
        const snapshot = await journalRef.get();
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        showNotification(`Paciente ${patientName} excluído com sucesso!`, 'success');
    } catch (e) {
        showNotification(`Erro ao excluir: ${e.message}`, 'error');
        console.error("Erro ao excluir paciente:", e);
    }
};

// --- MODAL DE DETALHES (Diário) ---
const openJournalModal = (patient) => {
    document.getElementById('modal-title').textContent = `Diário: ${patient.name} (${patient.treatmentType})`;
    document.getElementById('modal-body').innerHTML = `
        <div class="bg-yellow-50 p-3 rounded-lg mb-4 border border-yellow-200 text-xs text-gray-700">
            <p class="font-semibold mb-1">Tipo: <span class="text-indigo-600">${patient.treatmentType}</span> | Meta: ${patient.treatmentGoal}</p>
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
    
    // Adicionar Lógica do Diário
    setupJournalListeners(patient);
    openModal(`Diário: ${patient.name}`, 'max-w-4xl');
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

    // Listener para o input de arquivo
    mediaInput.addEventListener('change', (e) => {
        currentFile = e.target.files[0] || null;
        fileNameDisplay.textContent = currentFile ? formatFileName(currentFile.name) : '';
    });
    mediaBtn.addEventListener('click', () => mediaInput.click());

    // Listener para o botão de Envio (Dentista)
    sendBtn.addEventListener('click', () => {
        sendJournalEntry(patient, responseInput.value, 'Dentista', currentFile);
        responseInput.value = '';
        currentFile = null;
        fileNameDisplay.textContent = '';
    });
    
    // Listener para o botão de Ajuda da IA
    askAiBtn.addEventListener('click', () => handleAIRequest(patient));

    // Listener Firestore para o Diário
    const journalRef = db.collection(getJournalCollectionPath(patient.id));
    journalRef.orderBy('timestamp', 'desc').onSnapshot(snapshot => {
        const entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderJournalEntries(timeline, entries);
    }, e => showNotification(`Erro ao carregar diário: ${e.message}`, 'error'));
};

const sendJournalEntry = async (patient, text, author, file) => {
    if (!text.trim() && !file) return;

    let mediaData = null;
    let uploadPromise = Promise.resolve(null);
    
    if (file) {
        // UPLOAD REAL: Chama a função Cloudinary
        uploadPromise = window.uploadToCloudinary(file).then(res => {
            showNotification(`Arquivo ${file.name} enviado para Cloudinary!`, 'success');
            return res;
        }).catch(error => {
            showNotification(`Falha ao carregar arquivo: ${error.message}`, 'error');
            return null; // Não envia a entrada se o upload falhar
        });
    }

    // Aguarda o upload do arquivo (se houver)
    mediaData = await uploadPromise;

    // Se houver texto ou o upload foi bem-sucedido, prossegue com o envio da entrada.
    if (!text.trim() && !mediaData) return;
    
    const entryData = {
        text: text.trim(),
        author: author,
        isAI: author.includes('IA'),
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        media: mediaData
    };

    try {
        await db.collection(getJournalCollectionPath(patient.id)).add(entryData);
    } catch (e) {
        showNotification(`Erro ao enviar entrada: ${e.message}`, 'error');
    }
};

const handleAIRequest = async (patient) => {
    const askAiBtn = document.getElementById('ask-ai-btn');
    askAiBtn.disabled = true;
    askAiBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin text-xl mr-2'></i> IA Pensando...";
    
    try {
        // 1. Obter as diretrizes do BRAIN
        const brainDocRef = db.collection(`artifacts/${appId}/users/${currentUser.uid}/aiConfig`).doc('directives');
        const brainSnap = await brainDocRef.get();
        const directives = brainSnap.exists ? brainSnap.data().promptDirectives : 'Atuar como assistente padrão de clínica odontológica.';
        
        // 2. Personalizar o Prompt de Sistema
        const systemPrompt = directives
            .replace(/Variável de Tratamento: \[TIPO\]/, `Variável de Tratamento: ${patient.treatmentType || 'Geral'}`)
            .replace(/Meta: \[META\]/, `Meta: ${patient.treatmentGoal || 'N/A'}`);
        
        // 3. Montar a Mensagem do Usuário (Contexto)
        const userMessage = `Você é o assistente do Dr(a). ${currentUser.email}. O paciente ${patient.name} com tratamento "${patient.treatmentType}" e meta "${patient.treatmentGoal}" acaba de solicitar uma orientação/status. Responda-o com base nas diretrizes. Use um tom encorajador e profissional.`;

        // 4. CHAMA A FUNÇÃO REAL DA API (Implementada em js/ai.js)
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
                        ${entry.timestamp ? formatDateTime(entry.timestamp.toDate().toISOString()) : 'Carregando...'}
                    </span>
                </div>
                <p class="text-gray-800 text-sm whitespace-pre-wrap">${entry.text}</p>
                ${mediaHtml}
            </div>
        `;
    }).join('');
};


// --- 3. GESTÃO FINANCEIRA ---
const renderFinancialManager = (container) => {
    container.innerHTML = `
        <div class="p-8 bg-white shadow-2xl rounded-2xl border border-indigo-100">
            <h2 class="text-3xl font-extrabold text-indigo-800 mb-8 flex items-center">
                <i class='bx bxs-wallet text-3xl mr-3 text-indigo-600'></i> Gestão Financeira e Estoque
            </h2>
            
            <p class="text-gray-600">Módulo em desenvolvimento. Aqui faremos o CRUD completo de Materiais, Equipamentos, Despesas e Procedimentos, adaptando a lógica do Techmess ERP.</p>
            
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                 <div class="p-4 bg-yellow-100 rounded-lg shadow-md"><p class="text-sm text-gray-600">Contas a Pagar</p><p class="text-2xl font-bold text-yellow-800">${formatCurrency(1250)}</p></div>
                 <div class="p-4 bg-green-100 rounded-lg shadow-md"><p class="text-sm text-gray-600">Próxima Receita</p><p class="text-2xl font-bold text-green-800">${formatCurrency(3400)}</p></div>
            </div>
        </div>
    `;
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
    // Se o modal foi fechado, garantimos que a lista de pacientes é recarregada para sincronizar o estado
    if (currentView === 'patients') {
        loadPatients();
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
                window.location.reload();
            });
        }
    });

    // 4. Listener geral para navegação no corpo principal (após o DOM estar pronto)
    // Opcional, mas útil para botões dinâmicos.
    document.getElementById('main-content').addEventListener('click', (e) => {
        // Exemplo: if (e.target.closest('#some-button')) { ... }
    });
});
