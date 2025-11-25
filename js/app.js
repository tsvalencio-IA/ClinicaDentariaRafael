// ==================================================================
// MÓDULO PRINCIPAL - DENTISTA INTELIGENTE (VERSÃO FINAL BLINDADA)
// ==================================================================
(function() {
    
    // 1. Variáveis Globais (Usando VAR para evitar travamento por duplicidade)
    var config = window.AppConfig;
    var appId = config.APP_ID; 
    
    var db, auth;
    var currentUser = null;
    var currentView = 'dashboard';
    var isLoginMode = true; 

    // Listas de Dados (VAR impede o erro 'Identifier has already been declared')
    var allPatients = []; 
    var receivables = []; 
    var stockItems = []; 
    var expenses = []; 
    var receivableMaterialsCache = {}; 
    var expensePurchasedItemsCache = {}; 
    
    
    // ==================================================================
    // 2. FUNÇÕES AUXILIARES
    // ==================================================================
    
    const getAdminCollectionPath = (uid, collectionName) => `artifacts/${appId}/users/${uid}/${collectionName}`;
    const getJournalCollectionPath = (patientId) => `artifacts/${appId}/patients/${patientId}/journal`;
    const getStockCollectionPath = (uid) => `artifacts/${appId}/users/${uid}/stock`;
    const getExpensePath = (uid) => `artifacts/${appId}/users/${uid}/finance/expenses`; 
    const getReceivablePath = (uid) => `artifacts/${appId}/users/${uid}/finance/receivable`; 
    const getReceivableMaterialsPath = (receivableId) => `${getReceivablePath(currentUser.uid)}/${receivableId}/materials`;
    const getExpensePurchasedItemsPath = (expenseId) => `${getExpensePath(currentUser.uid)}/${expenseId}/purchasedItems`; 
    
    const formatFileName = (name) => {
        if (name.length > 20) return name.substring(0, 10) + '...' + name.substring(name.length - 7);
        return name;
    };
    
    const formatDateTime = (isoString) => {
        const date = new Date(isoString);
        if (isNaN(date)) return 'Data Inválida';
        const pad = (num) => num.toString().padStart(2, '0');
        return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    };
    
    const formatCurrency = (value) => `R$ ${parseFloat(value || 0).toFixed(2).replace('.', ',')}`;
    
    const showNotification = (message, type = 'success') => {
        console.log(`[${type.toUpperCase()}] ${message}`);
    };
    
    // ==================================================================
    // 3. AUTENTICAÇÃO E INICIALIZAÇÃO
    // ==================================================================
    
    const setupAuthStateListener = () => {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                console.log("Usuário detectado:", user.email);
                // 1. Tenta ler o perfil
                try {
                    const profileRef = db.ref(`artifacts/${appId}/users/${user.uid}/profile`);
                    const snapshot = await profileRef.once('value');
                    const profile = snapshot.val();
    
                    // 2. Se for o Admin Master ou tiver perfil dentista, libera
                    if ((profile && profile.role === 'dentist') || user.email === 'admin@ts.com') {
                        
                        // Se for admin@ts.com e não tiver perfil, cria agora (Auto-fix)
                        if (user.email === 'admin@ts.com' && (!profile || profile.role !== 'dentist')) {
                            await profileRef.set({
                                email: user.email,
                                role: 'dentist',
                                registeredAt: new Date().toISOString()
                            });
                        }

                        currentUser = { uid: user.uid, email: user.email };
                        showUI(); 
                    } else {
                        currentUser = { uid: user.uid, email: user.email, role: 'unknown' };
                        showRoleRestrictedUI(); 
                    }
                } catch (e) {
                    console.error("Erro ao validar perfil:", e);
                    showLoginScreen();
                }
            } else {
                currentUser = null;
                showLoginScreen(); 
            }
        });
    };
    
    const initializeFirebase = async () => {
        if (!firebase.apps.length) {
            firebase.initializeApp(config.firebaseConfig);
        }
        db = firebase.database();
        auth = firebase.auth();
        setupAuthStateListener();
    };
    
    const showLoginScreen = () => {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('app-container').classList.add('hidden');
        
        // Reinicializa o HTML do form para garantir limpeza de eventos
        const container = document.querySelector('#login-screen .bg-white');
        if (container && container.innerHTML.includes("Acesso Negado")) {
             window.location.reload(); // Força reload se estava na tela de erro
        }
    };
    
    const showRoleRestrictedUI = () => {
        const container = document.querySelector('#login-screen .bg-white');
        if (container) {
            container.innerHTML = `
                <h1 class="text-3xl font-bold text-red-800 mb-2">Acesso Negado</h1>
                <p class="text-gray-600 mb-4">Usuário ${currentUser.email} não autorizado.</p>
                <button onclick="location.reload()" class="w-full py-2 bg-red-600 text-white rounded">Voltar</button>
            `;
            auth.signOut();
        }
    };
    
    const toggleAuthMode = () => {
        isLoginMode = !isLoginMode;
        const btn = document.getElementById('auth-submit-btn');
        const toggle = document.getElementById('toggle-auth-mode');
        const msg = document.getElementById('auth-message');
        
        if (isLoginMode) {
            btn.textContent = 'Entrar';
            toggle.textContent = 'Não tem conta? Cadastre-se';
            msg.textContent = 'Entre com suas credenciais.';
        } else {
            btn.textContent = 'Cadastrar';
            toggle.textContent = 'Já tem conta? Fazer Login';
            msg.textContent = 'Crie sua conta de administrador.';
        }
    };
    
    const handleAuthSubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        const errorEl = document.getElementById('auth-error-message');
        const btn = document.getElementById('auth-submit-btn');
    
        errorEl.textContent = '';
        btn.disabled = true;
        btn.textContent = 'Processando...';
        
        try {
            if (isLoginMode) {
                await auth.signInWithEmailAndPassword(email, password);
            } else {
                const userCredential = await auth.createUserWithEmailAndPassword(email, password);
                // Cria perfil imediatamente
                await db.ref(`artifacts/${appId}/users/${userCredential.user.uid}/profile`).set({
                    email: email,
                    role: 'dentist',
                    registeredAt: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error(error);
            let msg = 'Erro no acesso.';
            if (error.code === 'auth/wrong-password') msg = 'Senha incorreta.';
            if (error.code === 'auth/user-not-found') msg = 'Usuário não encontrado.';
            if (error.code === 'auth/email-already-in-use') msg = 'Email já cadastrado.';
            errorEl.textContent = msg;
            btn.disabled = false;
            btn.textContent = isLoginMode ? 'Entrar' : 'Cadastrar';
        }
    };
    
    // --- NAVEGAÇÃO ---
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
                btn.className = "flex items-center p-3 rounded-xl transition-all duration-200 w-full text-left bg-indigo-600 text-white shadow-lg";
            } else {
                btn.className = "flex items-center p-3 rounded-xl transition-all duration-200 w-full text-left text-indigo-200 hover:bg-indigo-700 hover:text-white";
            }
        });
    };
    
    const renderSidebar = () => {
        const navMenu = document.getElementById('nav-menu');
        navMenu.innerHTML = config.NAV_ITEMS.map(item => `
            <button data-view="${item.id}" class="flex items-center p-3 rounded-xl w-full text-left text-indigo-200">
                <i class='bx ${item.icon} text-xl mr-3'></i>
                <span class="font-semibold">${item.label}</span>
            </button>
        `).join('');
    
        navMenu.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => navigateTo(btn.dataset.view));
        });
    };
    
    const renderContent = () => {
        const main = document.getElementById('main-content');
        main.innerHTML = ''; 
        
        if (currentView === 'dashboard') renderDashboard(main);
        else if (currentView === 'patients') renderPatientManager(main);
        else if (currentView === 'financials') renderFinancialManager(main);
    };
    
    // ==================================================================
    // 4. RENDERIZAÇÃO E LÓGICA DE NEGÓCIOS
    // ==================================================================
    
    // --- DASHBOARD ---
    const renderDashboard = (container) => {
        container.innerHTML = `
            <div class="p-8 bg-white shadow-2xl rounded-2xl border border-indigo-100 max-w-4xl mx-auto">
                <h2 class="text-3xl font-extrabold text-indigo-800 mb-8 flex items-center"><i class='bx bxs-dashboard mr-3'></i> Dashboard</h2>
                <div class="grid grid-cols-2 gap-4 mb-8">
                    <div class="p-4 bg-indigo-100 rounded-lg"><p class="text-gray-600">Pacientes</p><p class="text-2xl font-bold text-indigo-800" id="dash-patients">...</p></div>
                    <div class="p-4 bg-cyan-100 rounded-lg"><p class="text-gray-600">Estoque</p><p class="text-2xl font-bold text-cyan-800" id="dash-stock">...</p></div>
                </div>
                <div class="border p-4 rounded-xl bg-gray-50">
                    <h3 class="font-bold text-indigo-800 mb-2">Diretrizes da IA</h3>
                    <textarea id="brain-input" class="w-full p-2 border rounded" rows="3"></textarea>
                    <button id="save-brain-btn" class="mt-2 bg-indigo-600 text-white px-4 py-2 rounded">Salvar</button>
                </div>
            </div>
        `;
        
        // Load KPIs
        db.ref(getAdminCollectionPath(currentUser.uid, 'patients')).once('value', s => document.getElementById('dash-patients').textContent = s.numChildren());
        db.ref(getStockCollectionPath(currentUser.uid)).once('value', s => document.getElementById('dash-stock').textContent = s.numChildren());
        
        // Brain Logic
        const brainRef = db.ref(getAdminCollectionPath(currentUser.uid, 'aiConfig') + '/directives');
        brainRef.once('value').then(s => { if(s.exists()) document.getElementById('brain-input').value = s.val().promptDirectives; });
        document.getElementById('save-brain-btn').onclick = () => {
            brainRef.set({ promptDirectives: document.getElementById('brain-input').value, status: 'Online' });
            alert("Diretrizes salvas!");
        };
    };
    
    // --- PACIENTES ---
    const renderPatientManager = (container) => {
        container.innerHTML = `
            <div class="p-8 bg-white shadow-lg rounded-2xl">
                <div class="flex justify-between mb-6">
                    <h2 class="text-2xl font-bold text-indigo-800">Pacientes</h2>
                    <button id="new-patient-btn" class="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700">Novo Paciente</button>
                </div>
                <table class="w-full">
                    <thead class="bg-gray-100"><tr><th class="p-3 text-left">Nome</th><th class="p-3 text-left">Tratamento</th><th class="p-3 text-right">Ações</th></tr></thead>
                    <tbody id="patients-list"></tbody>
                </table>
            </div>
        `;
        
        document.getElementById('new-patient-btn').onclick = () => openPatientModal();
        
        db.ref(getAdminCollectionPath(currentUser.uid, 'patients')).on('value', snap => {
            const list = document.getElementById('patients-list');
            if(!list) return;
            list.innerHTML = '';
            allPatients = [];
            
            const data = snap.val();
            if(data) {
                Object.keys(data).forEach(k => {
                    const p = {id: k, ...data[k]};
                    allPatients.push(p);
                    list.innerHTML += `
                        <tr class="border-b hover:bg-gray-50">
                            <td class="p-3">${p.name}</td>
                            <td class="p-3">${p.treatmentType}</td>
                            <td class="p-3 text-right">
                                <button class="text-cyan-600 mr-2 btn-journal" data-id="${k}"><i class='bx bx-book'></i></button>
                                <button class="text-indigo-600 btn-edit" data-id="${k}"><i class='bx bx-edit'></i></button>
                                <button class="text-red-600 btn-del" data-id="${k}"><i class='bx bx-trash'></i></button>
                            </td>
                        </tr>
                    `;
                });
                
                // Re-attach listeners
                list.querySelectorAll('.btn-journal').forEach(b => b.onclick = () => openJournalModal(allPatients.find(p => p.id === b.dataset.id)));
                list.querySelectorAll('.btn-edit').forEach(b => b.onclick = () => openPatientModal(allPatients.find(p => p.id === b.dataset.id)));
                list.querySelectorAll('.btn-del').forEach(b => b.onclick = () => {
                    if(confirm('Excluir?')) db.ref(getAdminCollectionPath(currentUser.uid, 'patients') + '/' + b.dataset.id).remove();
                });
            }
        });
    };
    
    const openPatientModal = (p = null) => {
        const isEdit = !!p;
        const html = `
            <form id="p-form" class="space-y-3">
                <input type="hidden" id="pid" value="${isEdit ? p.id : ''}">
                <input type="text" id="pname" placeholder="Nome" class="w-full border p-2 rounded" value="${isEdit ? p.name : ''}" required>
                <input type="email" id="pemail" placeholder="Email" class="w-full border p-2 rounded" value="${isEdit ? p.email : ''}">
                <select id="ptype" class="w-full border p-2 rounded">
                    <option value="Geral">Geral</option>
                    <option value="Ortodontia" ${isEdit && p.treatmentType === 'Ortodontia' ? 'selected' : ''}>Ortodontia</option>
                    <option value="Implante" ${isEdit && p.treatmentType === 'Implante' ? 'selected' : ''}>Implante</option>
                </select>
                <textarea id="pgoal" placeholder="Meta do Tratamento" class="w-full border p-2 rounded">${isEdit ? p.treatmentGoal : ''}</textarea>
                <button type="submit" class="w-full bg-green-600 text-white py-2 rounded">Salvar</button>
            </form>
        `;
        openModal(isEdit ? 'Editar Paciente' : 'Novo Paciente', html);
        
        document.getElementById('p-form').onsubmit = async (e) => {
            e.preventDefault();
            const data = {
                name: document.getElementById('pname').value,
                email: document.getElementById('pemail').value,
                treatmentType: document.getElementById('ptype').value,
                treatmentGoal: document.getElementById('pgoal').value,
                status: 'Ativo'
            };
            const id = document.getElementById('pid').value;
            const ref = db.ref(getAdminCollectionPath(currentUser.uid, 'patients'));
            
            if(id) await ref.child(id).update(data);
            else {
                data.createdAt = new Date().toISOString();
                await ref.push(data);
            }
            closeModal();
        };
    };
    
    // --- DIÁRIO (Com Histórico Financeiro) ---
    const openJournalModal = (patient) => {
        // Carrega histórico financeiro
        let finHistory = '<p class="text-gray-500 italic">Nenhum registro financeiro.</p>';
        
        // Busca as contas desse paciente
        db.ref(getReceivablePath(currentUser.uid)).orderByChild('patientId').equalTo(patient.id).once('value', async (snap) => {
            if(snap.exists()) {
                finHistory = '<ul class="space-y-2">';
                const val = snap.val();
                for (let key in val) {
                    const item = val[key];
                    // Busca materiais usados neste serviço
                    let matHtml = '';
                    const matSnap = await db.ref(`${getReceivablePath(currentUser.uid)}/${key}/materials`).once('value');
                    if (matSnap.exists()) {
                        matHtml = '<br><span class="text-xs text-gray-500">Materiais: ';
                        matSnap.forEach(m => matHtml += `${m.val().quantityUsed}${m.val().unit} ${m.val().name}, `);
                        matHtml += '</span>';
                    }
                    
                    finHistory += `
                        <li class="p-2 bg-gray-50 rounded border border-gray-200 text-sm">
                            <b>${item.description}</b> - ${formatCurrency(item.amount)} 
                            <span class="text-xs px-2 rounded ${item.status === 'Recebido' ? 'bg-green-100 text-green-800' : 'bg-yellow-100'}">${item.status}</span>
                            ${matHtml}
                        </li>`;
                }
                finHistory += '</ul>';
            }
            
            // Renderiza o Modal
            const html = `
                <div class="bg-indigo-50 p-3 rounded mb-4">
                    <p class="font-bold text-indigo-900">Meta: ${patient.treatmentGoal}</p>
                </div>
                <div class="mb-4">
                    <h4 class="font-bold text-gray-700 border-b pb-1 mb-2">Histórico Clínico & Financeiro</h4>
                    <div class="max-h-32 overflow-y-auto bg-white border p-2 rounded">${finHistory}</div>
                </div>
                <div id="chat-history" class="h-64 overflow-y-auto bg-gray-100 p-3 rounded mb-3 flex flex-col-reverse gap-2">
                    </div>
                <div class="flex gap-2">
                    <input type="text" id="chat-input" class="flex-grow border p-2 rounded" placeholder="Evolução clínica...">
                    <button id="btn-send" class="bg-indigo-600 text-white px-4 rounded"><i class='bx bxs-send'></i></button>
                    <button id="btn-ai" class="bg-cyan-600 text-white px-4 rounded"><i class='bx bxs-brain'></i></button>
                </div>
            `;
            openModal(`Prontuário: ${patient.name}`, html, 'max-w-4xl');
            
            // Listener do Chat
            const chatRef = db.ref(getJournalCollectionPath(patient.id));
            chatRef.on('child_added', (s) => {
                const msg = s.val();
                const div = document.createElement('div');
                div.className = `p-2 rounded max-w-[80%] text-sm ${msg.author === 'IA' ? 'bg-cyan-100 self-start' : 'bg-indigo-100 self-end'}`;
                div.innerHTML = `<b>${msg.author}:</b> ${msg.text}`;
                document.getElementById('chat-history').prepend(div);
            });
            
            document.getElementById('btn-send').onclick = () => {
                const txt = document.getElementById('chat-input').value;
                if(!txt) return;
                chatRef.push({ author: 'Dentista', text: txt, timestamp: new Date().toISOString() });
                document.getElementById('chat-input').value = '';
            };
            
            // Botão IA (Simples chamada à API já configurada em ai.js)
            document.getElementById('btn-ai').onclick = async () => {
                const btn = document.getElementById('btn-ai');
                btn.disabled = true; 
                const prompt = `Paciente: ${patient.name}. Tratamento: ${patient.treatmentType}. Meta: ${patient.treatmentGoal}. O dentista precisa de uma sugestão clínica.`;
                const reply = await window.callGeminiAPI(prompt, "Gere uma sugestão de evolução clínica curta.");
                chatRef.push({ author: 'IA', text: reply, timestamp: new Date().toISOString() });
                btn.disabled = false;
            };
        });
    };
    
    // --- 3. FINANCEIRO ---
    const renderFinancialManager = (container) => {
        container.innerHTML = `
            <div class="p-8 bg-white shadow-2xl rounded-2xl border border-indigo-100">
                <h2 class="text-3xl font-extrabold text-indigo-800 mb-6"><i class='bx bxs-wallet'></i> Financeiro</h2>
                <div class="flex border-b mb-4">
                    <button class="p-3 border-b-2 border-indigo-600 font-bold text-indigo-700" onclick="renderStockTab()">Estoque</button>
                    <button class="p-3 text-gray-500 hover:text-indigo-600" onclick="renderReceivablesTab()">Receitas</button>
                    <button class="p-3 text-gray-500 hover:text-indigo-600" onclick="renderExpensesTab()">Despesas</button>
                </div>
                <div id="fin-body"></div>
            </div>
        `;
        
        // Tornar acessível globalmente para os onlick acima (hack rápido para IIFE)
        window.renderStockTab = () => {
            const body = document.getElementById('fin-body');
            body.innerHTML = `
                <div class="flex justify-between mb-4"><h3 class="font-bold">Estoque</h3><button id="new-item" class="bg-green-600 text-white px-3 py-1 rounded">Novo Item</button></div>
                <table class="w-full text-sm text-left"><tbody id="stock-list"></tbody></table>
            `;
            document.getElementById('new-item').onclick = () => openStockModal();
            
            db.ref(getStockCollectionPath(currentUser.uid)).on('value', s => {
                const list = document.getElementById('stock-list');
                if(!list) return;
                list.innerHTML = '';
                stockItems = [];
                const data = s.val();
                if(data) Object.keys(data).forEach(k => {
                    const i = {id: k, ...data[k]};
                    stockItems.push(i);
                    list.innerHTML += `<tr class="border-b"><td class="p-2">${i.name}</td><td class="p-2">${i.quantity} ${i.unit}</td><td class="p-2 text-right"><button class="text-red-500" onclick="deleteStock('${k}')"><i class='bx bx-trash'></i></button></td></tr>`;
                });
            });
        };
        
        window.renderReceivablesTab = () => {
            const body = document.getElementById('fin-body');
            body.innerHTML = `
                 <div class="flex justify-between mb-4"><h3 class="font-bold">Contas a Receber</h3><button id="new-rec" class="bg-indigo-600 text-white px-3 py-1 rounded">Novo Serviço</button></div>
                 <div id="rec-list" class="space-y-2"></div>
            `;
            document.getElementById('new-rec').onclick = () => openReceivableModal();
            
            db.ref(getReceivablePath(currentUser.uid)).on('value', s => {
                const list = document.getElementById('rec-list');
                if(!list) return;
                list.innerHTML = '';
                const data = s.val();
                if(data) Object.keys(data).forEach(k => {
                    const r = data[k];
                    list.innerHTML += `
                        <div class="p-3 border rounded flex justify-between items-center">
                            <div><b>${r.patientName}</b><br><span class="text-xs text-gray-500">${r.description}</span></div>
                            <div class="text-right">
                                <div class="font-bold text-green-600">${formatCurrency(r.amount)}</div>
                                <button class="text-xs bg-yellow-200 px-2 rounded mt-1" onclick="manageMaterials('${k}')">Materiais</button>
                            </div>
                        </div>`;
                });
            });
        };
        
        window.renderExpensesTab = () => {
            const body = document.getElementById('fin-body');
            body.innerHTML = `
                 <div class="flex justify-between mb-4"><h3 class="font-bold">Despesas (Compras)</h3><button id="new-exp" class="bg-red-600 text-white px-3 py-1 rounded">Nova Despesa</button></div>
                 <div id="exp-list" class="space-y-2"></div>
            `;
            document.getElementById('new-exp').onclick = () => openExpenseModal();
            
            db.ref(getExpensePath(currentUser.uid)).on('value', s => {
                const list = document.getElementById('exp-list');
                if(!list) return;
                list.innerHTML = '';
                const data = s.val();
                if(data) Object.keys(data).forEach(k => {
                    const e = data[k];
                    list.innerHTML += `
                        <div class="p-3 border rounded flex justify-between items-center">
                            <div><b>${e.supplier}</b><br><span class="text-xs text-gray-500">${e.description}</span></div>
                            <div class="text-right">
                                <div class="font-bold text-red-600">${formatCurrency(e.amount)}</div>
                                <button class="text-xs bg-orange-200 px-2 rounded mt-1" onclick="managePurchase('${k}')">Itens</button>
                            </div>
                        </div>`;
                });
            });
        };
        
        window.renderStockTab(); // Init
    };
    
    // --- MODALS FINANCEIROS SIMPLIFICADOS ---
    const openStockModal = () => {
        const html = `<form id="st-form" class="grid gap-2"><input id="s-name" placeholder="Nome" class="border p-2"><input id="s-qty" placeholder="Qtd" type="number" class="border p-2"><input id="s-unit" placeholder="Unidade" class="border p-2"><button class="bg-green-600 text-white p-2">Salvar</button></form>`;
        openModal("Novo Item", html);
        document.getElementById('st-form').onsubmit = (e) => {
            e.preventDefault();
            db.ref(getStockCollectionPath(currentUser.uid)).push({
                name: document.getElementById('s-name').value,
                quantity: parseFloat(document.getElementById('s-qty').value),
                unit: document.getElementById('s-unit').value,
                cost: 0
            });
            closeModal();
        };
    };
    
    const openReceivableModal = () => {
        // Select de pacientes
        let opts = allPatients.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        const html = `
            <form id="rec-form" class="grid gap-2">
                <select id="r-pat" class="border p-2">${opts}</select>
                <input id="r-desc" placeholder="Descrição" class="border p-2">
                <input id="r-val" placeholder="Valor" type="number" class="border p-2">
                <button class="bg-indigo-600 text-white p-2">Salvar</button>
            </form>`;
        openModal("Novo Serviço", html);
        document.getElementById('rec-form').onsubmit = (e) => {
            e.preventDefault();
            const pid = document.getElementById('r-pat').value;
            const pname = allPatients.find(p => p.id === pid).name;
            db.ref(getReceivablePath(currentUser.uid)).push({
                patientId: pid,
                patientName: pname,
                description: document.getElementById('r-desc').value,
                amount: parseFloat(document.getElementById('r-val').value),
                status: 'Aberto'
            });
            closeModal();
        };
    };
    
    const openExpenseModal = () => {
        const html = `
            <form id="ex-form" class="grid gap-2">
                <input id="e-sup" placeholder="Fornecedor" class="border p-2">
                <input id="e-desc" placeholder="Descrição" class="border p-2">
                <input id="e-val" placeholder="Valor" type="number" class="border p-2">
                <button class="bg-red-600 text-white p-2">Salvar</button>
            </form>`;
        openModal("Nova Despesa", html);
        document.getElementById('ex-form').onsubmit = (e) => {
            e.preventDefault();
            db.ref(getExpensePath(currentUser.uid)).push({
                supplier: document.getElementById('e-sup').value,
                description: document.getElementById('e-desc').value,
                amount: parseFloat(document.getElementById('e-val').value)
            });
            closeModal();
        };
    };
    
    // --- GESTÃO DE ITENS (Compra e Baixa) ---
    window.manageMaterials = (recId) => { // Baixa de estoque
        const html = `
            <div id="mat-list" class="mb-2 text-sm"></div>
            <div class="flex gap-1">
                <select id="m-sel" class="border p-1 flex-grow">${stockItems.map(i => `<option value="${i.id}">${i.name}</option>`).join('')}</select>
                <input id="m-qty" type="number" placeholder="Qtd" class="border p-1 w-20">
                <button id="m-add" class="bg-indigo-600 text-white px-2 rounded">+</button>
            </div>`;
        openModal("Materiais Usados", html);
        
        const ref = db.ref(`${getReceivablePath(currentUser.uid)}/${recId}/materials`);
        
        // Add logic
        document.getElementById('m-add').onclick = async () => {
            const itemId = document.getElementById('m-sel').value;
            const qty = parseFloat(document.getElementById('m-qty').value);
            const item = stockItems.find(i => i.id === itemId);
            
            // Registra uso
            await ref.push({ name: item.name, quantityUsed: qty, unit: item.unit });
            
            // Baixa no estoque
            const newQty = item.quantity - qty;
            await db.ref(`${getStockCollectionPath(currentUser.uid)}/${itemId}`).update({ quantity: newQty });
            
            document.getElementById('m-qty').value = '';
            showNotification("Estoque atualizado (Baixa).");
        };
        
        // List logic
        ref.on('value', s => {
            const d = document.getElementById('mat-list');
            if(d && s.exists()) {
                d.innerHTML = '';
                s.forEach(c => d.innerHTML += `<div>- ${c.val().quantityUsed} ${c.val().unit} ${c.val().name}</div>`);
            }
        });
    };
    
    window.managePurchase = (expId) => { // Entrada de estoque
         const html = `
            <div id="pur-list" class="mb-2 text-sm"></div>
            <div class="grid grid-cols-2 gap-1">
                <input id="p-name" placeholder="Item" class="border p-1">
                <input id="p-qty" type="number" placeholder="Qtd" class="border p-1">
                <input id="p-unit" placeholder="Un" class="border p-1">
                <button id="p-add" class="bg-green-600 text-white px-2 rounded">Entrada</button>
            </div>`;
        openModal("Itens Comprados", html);
        
        const ref = db.ref(`${getExpensePath(currentUser.uid)}/${expId}/purchasedItems`);
        
        document.getElementById('p-add').onclick = async () => {
            const name = document.getElementById('p-name').value;
            const qty = parseFloat(document.getElementById('p-qty').value);
            const unit = document.getElementById('p-unit').value;
            
            // Registra na despesa
            await ref.push({ name, quantityPurchased: qty, unit });
            
            // Aumenta estoque (Lógica simplificada: acha por nome ou cria)
            const exist = stockItems.find(i => i.name.toLowerCase() === name.toLowerCase());
            if(exist) {
                 await db.ref(`${getStockCollectionPath(currentUser.uid)}/${exist.id}`).update({ quantity: exist.quantity + qty });
            } else {
                 await db.ref(getStockCollectionPath(currentUser.uid)).push({ name, quantity: qty, unit, cost: 0 });
            }
            
            document.getElementById('p-name').value = '';
            showNotification("Estoque atualizado (Entrada).");
        };
        
        ref.on('value', s => {
            const d = document.getElementById('pur-list');
            if(d && s.exists()) {
                d.innerHTML = '';
                s.forEach(c => d.innerHTML += `<div>+ ${c.val().quantityPurchased} ${c.val().unit} ${c.val().name}</div>`);
            }
        });
    };
    
    // --- HELPERS DE UI ---
    window.deleteStock = (id) => {
        if(confirm("Apagar item?")) db.ref(getStockCollectionPath(currentUser.uid) + '/' + id).remove();
    };

    const openModal = (title, html, maxW = 'max-w-md') => {
        const m = document.getElementById('app-modal');
        m.querySelector('.modal-content').className = `modal-content w-full ${maxW}`;
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = html;
        m.classList.remove('hidden');
        m.classList.add('flex');
    };
    
    const closeModal = () => {
        document.getElementById('app-modal').classList.add('hidden');
        document.getElementById('app-modal').classList.remove('flex');
    };
    
    // INICIALIZAÇÃO
    document.addEventListener('DOMContentLoaded', () => {
        initializeFirebase();
        document.getElementById('close-modal').addEventListener('click', closeModal);
        document.getElementById('auth-form').addEventListener('submit', handleAuthSubmit);
        document.getElementById('toggle-auth-mode').addEventListener('click', toggleAuthMode);
        document.getElementById('logout-button').addEventListener('click', () => { auth.signOut(); window.location.reload(); });
    });
    
})();