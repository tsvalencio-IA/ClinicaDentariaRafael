// ==================================================================
// MÓDULO PRINCIPAL - DENTISTA INTELIGENTE
// VERSÃO FINAL CORRIGIDA: VAR para estabilidade + Funcionalidades Completas
// ==================================================================
(function() {
    
    // CONFIGURAÇÕES GLOBAIS
    // Usamos VAR para impedir erro de redeclaração se o script recarregar
    var config = window.AppConfig;
    var appId = config ? config.APP_ID : 'dentista-inteligente-app';
    
    // VARIÁVEIS DE ESTADO (VAR = Blindagem contra travamento)
    var db, auth;
    var currentUser = null;
    var currentView = 'dashboard';
    var isLoginMode = true; 
    
    // LISTAS DE DADOS (VAR)
    var allPatients = []; 
    var receivables = []; 
    var stockItems = []; 
    var expenses = []; 
    var receivableMaterialsCache = {}; 
    var expensePurchasedItemsCache = {}; 
    
    // ==================================================================
    // 1. FUNÇÕES AUXILIARES
    // ==================================================================
    
    function getAdminPath(uid, path) { return 'artifacts/' + appId + '/users/' + uid + '/' + path; }
    function getStockPath(uid) { return getAdminPath(uid, 'stock'); }
    function getFinancePath(uid, type) { return getAdminPath(uid, 'finance/' + type); }
    function getReceivableMaterialsPath(recId) { return getFinancePath(currentUser.uid, 'receivable') + '/' + recId + '/materials'; }
    function getExpensePurchasedItemsPath(expId) { return getFinancePath(currentUser.uid, 'expenses') + '/' + expId + '/purchasedItems'; }

    function formatCurrency(value) {
        return 'R$ ' + parseFloat(value || 0).toFixed(2).replace('.', ',');
    }

    function formatDateTime(iso) {
        if(!iso) return '-';
        var d = new Date(iso);
        return isNaN(d) ? '-' : d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
    }
    
    function formatFileName(name) {
        if (name && name.length > 20) return name.substring(0, 10) + '...' + name.substring(name.length - 7);
        return name || '';
    }

    function showNotification(message, type) {
        console.log('[' + (type || 'INFO') + '] ' + message);
    }

    // ==================================================================
    // 2. INICIALIZAÇÃO E LOGIN
    // ==================================================================
    
    function initializeFirebase() {
        if (!firebase.apps.length) {
            firebase.initializeApp(config.firebaseConfig);
        }
        db = firebase.database();
        auth = firebase.auth();
        setupAuthStateListener();
    }

    function setupAuthStateListener() {
        auth.onAuthStateChanged(function(user) {
            if (user) {
                var userRef = db.ref('artifacts/' + appId + '/users/' + user.uid + '/profile');
                userRef.once('value').then(function(snapshot) {
                    var profile = snapshot.val();
                    
                    // Lógica de Login: Admin Hardcoded OU Perfil Dentista
                    if ((profile && profile.role === 'dentist') || user.email === 'admin@ts.com') {
                        currentUser = { uid: user.uid, email: user.email };
                        
                        // Auto-correção: Cria perfil se não existir para o admin
                        if (!profile && user.email === 'admin@ts.com') {
                            userRef.set({ email: user.email, role: 'dentist', registeredAt: new Date().toISOString() });
                        }
                        showUI();
                    } else {
                        alert("Acesso restrito a dentistas.");
                        auth.signOut();
                    }
                });
            } else {
                currentUser = null;
                showLoginScreen();
            }
        });
    }
    
    function showLoginScreen() {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('app-container').classList.add('hidden');
        
        // Reset de listeners para evitar duplicação
        var oldForm = document.getElementById('auth-form');
        var newForm = oldForm.cloneNode(true);
        oldForm.parentNode.replaceChild(newForm, oldForm);
        newForm.addEventListener('submit', handleAuthSubmit);
        
        var toggleBtn = document.getElementById('toggle-auth-mode');
        var newToggle = toggleBtn.cloneNode(true);
        toggleBtn.parentNode.replaceChild(newToggle, toggleBtn);
        
        newToggle.addEventListener('click', function() {
            isLoginMode = !isLoginMode;
            document.getElementById('auth-submit-btn').textContent = isLoginMode ? 'Entrar' : 'Cadastrar';
            newToggle.textContent = isLoginMode ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Entrar';
        });
    }
    
    function showUI() {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
        renderSidebar();
        navigateTo('dashboard');
    }

    async function handleAuthSubmit(e) {
        e.preventDefault();
        var email = document.getElementById('auth-email').value;
        var password = document.getElementById('auth-password').value;
        var btn = document.getElementById('auth-submit-btn');
        var errorEl = document.getElementById('auth-error-message');
        
        btn.disabled = true;
        btn.textContent = 'Processando...';
        errorEl.textContent = '';
        
        try {
            if (isLoginMode) {
                await auth.signInWithEmailAndPassword(email, password);
            } else {
                var cred = await auth.createUserWithEmailAndPassword(email, password);
                await db.ref('artifacts/' + appId + '/users/' + cred.user.uid + '/profile').set({
                    email: email, role: 'dentist', registeredAt: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error(error);
            errorEl.textContent = "Erro: " + error.message;
            btn.disabled = false;
            btn.textContent = isLoginMode ? 'Entrar' : 'Cadastrar';
        }
    }

    // ==================================================================
    // 3. NAVEGAÇÃO
    // ==================================================================
    
    function navigateTo(view) {
        if(!currentUser) return;
        currentView = view;
        var content = document.getElementById('main-content');
        content.innerHTML = '';
        
        if (view === 'dashboard') renderDashboard(content);
        else if (view === 'patients') renderPatientManager(content);
        else if (view === 'financials') renderFinancialManager(content);
        
        // Atualiza menu
        document.querySelectorAll('#nav-menu button').forEach(function(btn) {
            if (btn.dataset.view === view) {
                btn.className = 'flex items-center p-3 rounded-xl w-full text-left bg-indigo-600 text-white shadow-lg';
            } else {
                btn.className = 'flex items-center p-3 rounded-xl w-full text-left text-indigo-200 hover:bg-indigo-700 hover:text-white';
            }
        });
    }
    
    function renderSidebar() {
        var menu = document.getElementById('nav-menu');
        menu.innerHTML = '';
        config.NAV_ITEMS.forEach(function(item) {
            var btn = document.createElement('button');
            btn.dataset.view = item.id;
            btn.className = 'flex items-center p-3 rounded-xl w-full text-left text-indigo-200 hover:bg-indigo-700 hover:text-white';
            btn.innerHTML = "<i class='bx " + item.icon + " text-xl mr-3'></i><span class='font-semibold'>" + item.label + "</span>";
            btn.onclick = function() { navigateTo(item.id); };
            menu.appendChild(btn);
        });
    }

    // ==================================================================
    // 4. DASHBOARD
    // ==================================================================
    
    function renderDashboard(container) {
        container.innerHTML = `
            <div class="p-8 bg-white shadow-2xl rounded-2xl border border-indigo-100">
                <h2 class="text-3xl font-bold text-indigo-800 mb-6"><i class='bx bxs-dashboard'></i> Dashboard</h2>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div class="p-4 bg-indigo-100 rounded-lg"><p class="text-gray-600">Pacientes</p><h3 class="text-2xl font-bold text-indigo-800" id="dash-pat">0</h3></div>
                    <div class="p-4 bg-green-100 rounded-lg"><p class="text-gray-600">Estoque</p><h3 class="text-2xl font-bold text-green-800" id="dash-stk">0</h3></div>
                    <div class="p-4 bg-yellow-100 rounded-lg"><p class="text-gray-600">Receitas</p><h3 class="text-2xl font-bold text-yellow-800" id="dash-rec">R$ 0,00</h3></div>
                    <div class="p-4 bg-red-100 rounded-lg"><p class="text-gray-600">Despesas</p><h3 class="text-2xl font-bold text-red-800" id="dash-exp">R$ 0,00</h3></div>
                </div>
                <div class="border p-4 rounded-xl bg-gray-50">
                    <h3 class="font-bold text-indigo-800 mb-2">Instruções da IA</h3>
                    <textarea id="brain-input" class="w-full p-2 border rounded" rows="2"></textarea>
                    <button id="save-brain-btn" class="mt-2 bg-indigo-600 text-white px-4 py-1 rounded text-sm">Salvar</button>
                </div>
            </div>`;
            
        // Carregamento de Dados
        db.ref(getAdminPath(currentUser.uid, 'patients')).on('value', function(s) { if(document.getElementById('dash-pat')) document.getElementById('dash-pat').textContent = s.numChildren(); });
        db.ref(getStockPath(currentUser.uid)).on('value', function(s) { if(document.getElementById('dash-stk')) document.getElementById('dash-stk').textContent = s.numChildren(); });
        
        // Carregar IA
        var brainRef = db.ref(getAdminPath(currentUser.uid, 'aiConfig/directives'));
        brainRef.once('value', function(s) { if(s.exists()) document.getElementById('brain-input').value = s.val().promptDirectives; });
        document.getElementById('save-brain-btn').onclick = function() {
            brainRef.update({ promptDirectives: document.getElementById('brain-input').value });
            alert("IA Atualizada!");
        };
    }

    // ==================================================================
    // 5. GESTÃO DE PACIENTES (COM DIÁRIO RESTAURADO)
    // ==================================================================
    
    function renderPatientManager(container) {
        container.innerHTML = `
            <div class="p-8 bg-white shadow-lg rounded-2xl">
                <div class="flex justify-between mb-6">
                    <h2 class="text-2xl font-bold text-indigo-800">Pacientes</h2>
                    <button onclick="openPatientModal()" class="bg-indigo-600 text-white px-4 py-2 rounded shadow">Novo Paciente</button>
                </div>
                <table class="w-full text-left">
                    <thead class="bg-gray-100 text-gray-600"><tr><th class="p-3">Nome</th><th class="p-3">Tratamento</th><th class="p-3 text-right">Ações</th></tr></thead>
                    <tbody id="patient-list-body"></tbody>
                </table>
            </div>`;
        
        // Expondo globalmente para onclick
        window.openPatientModal = openPatientModal;

        db.ref(getAdminPath(currentUser.uid, 'patients')).on('value', function(snap) {
            var tbody = document.getElementById('patient-list-body');
            if(!tbody) return;
            tbody.innerHTML = '';
            allPatients = [];
            
            var data = snap.val();
            if(data) {
                Object.keys(data).forEach(function(k) {
                    var p = data[k];
                    p.id = k;
                    allPatients.push(p);
                    tbody.innerHTML += `
                        <tr class="border-b hover:bg-gray-50">
                            <td class="p-3 font-medium">${p.name}</td>
                            <td class="p-3">${p.treatmentType || '-'}</td>
                            <td class="p-3 text-right">
                                <button onclick="openJournal('${k}')" class="text-cyan-600 mr-3" title="Prontuário"><i class='bx bx-book-heart text-xl'></i></button>
                                <button onclick="deletePatient('${k}')" class="text-red-500" title="Excluir"><i class='bx bx-trash text-xl'></i></button>
                            </td>
                        </tr>`;
                });
            } else {
                tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-gray-400">Nenhum paciente cadastrado.</td></tr>';
            }
        });
    }

    window.openPatientModal = function() {
        var html = `
            <form id="form-pat" class="space-y-3">
                <input id="p-name" placeholder="Nome Completo" class="w-full border p-2 rounded" required>
                <input id="p-email" placeholder="Email" class="w-full border p-2 rounded">
                <select id="p-type" class="w-full border p-2 rounded"><option>Geral</option><option>Ortodontia</option><option>Implante</option><option>Estética</option></select>
                <textarea id="p-goal" placeholder="Meta do Tratamento" class="w-full border p-2 rounded"></textarea>
                <button class="w-full bg-green-600 text-white py-2 rounded font-bold">Salvar</button>
            </form>`;
        openModal('Novo Paciente', html);
        document.getElementById('form-pat').onsubmit = function(e) {
            e.preventDefault();
            db.ref(getAdminPath(currentUser.uid, 'patients')).push({
                name: document.getElementById('p-name').value,
                email: document.getElementById('p-email').value,
                treatmentType: document.getElementById('p-type').value,
                treatmentGoal: document.getElementById('p-goal').value,
                createdAt: new Date().toISOString()
            });
            closeModal();
        };
    };

    window.deletePatient = function(id) {
        if(confirm("Tem certeza? Isso apagará o histórico.")) {
            db.ref(getAdminPath(currentUser.uid, 'patients') + '/' + id).remove();
        }
    };

    // --- DIÁRIO DO PACIENTE (INTEGRAÇÃO FINANCEIRA) ---
    window.openJournal = function(id) {
        var p = allPatients.find(function(x){ return x.id === id; });
        if(!p) return;
        
        var html = `
            <div class="bg-blue-50 p-3 rounded mb-3 text-sm">
                <b>Meta do Tratamento:</b> ${p.treatmentGoal || 'Não definido'}
            </div>
            
            <div class="mb-4 border p-2 rounded max-h-40 overflow-y-auto">
                <h5 class="font-bold text-xs text-gray-500 mb-1">PROCEDIMENTOS E MATERIAIS</h5>
                <div id="journal-fin-list" class="text-sm">Carregando histórico...</div>
            </div>
            
            <div id="chat-area" class="bg-gray-100 p-2 h-48 overflow-y-auto flex flex-col gap-2 mb-2 rounded"></div>
            <div class="flex gap-2">
                <input id="chat-msg" class="flex-grow border p-2 rounded" placeholder="Evolução clínica...">
                <button onclick="sendChat('${id}', 'Dentista')" class="bg-indigo-600 text-white px-3 rounded">Enviar</button>
                <button onclick="askAI('${id}')" class="bg-purple-600 text-white px-3 rounded" title="IA"><i class='bx bxs-magic-wand'></i></button>
            </div>
        `;
        openModal(`Prontuário: ${p.name}`, html, 'max-w-3xl');

        // Carrega Financeiro no Diário
        loadPatientServiceHistory(id);

        // Carrega Chat
        var chatRef = db.ref('artifacts/' + appId + '/patients/' + id + '/journal');
        chatRef.on('child_added', function(s) {
            var m = s.val();
            var div = document.createElement('div');
            div.className = `p-2 rounded text-sm max-w-[85%] ${m.author === 'IA' ? 'bg-purple-100 self-start' : 'bg-white border self-end'}`;
            div.innerHTML = `<b>${m.author}:</b> ${m.text}`;
            var area = document.getElementById('chat-area');
            if(area) { area.appendChild(div); area.scrollTop = area.scrollHeight; }
        });
    };

    // Função auxiliar para carregar histórico financeiro dentro do modal
    function loadPatientServiceHistory(patientId) {
        db.ref(getFinancePath(currentUser.uid, 'receivable')).orderByChild('patientId').equalTo(patientId).once('value', async function(s) {
            var div = document.getElementById('journal-fin-list');
            if(!div) return;
            div.innerHTML = '';
            
            if(s.exists()) {
                var data = s.val();
                // Itera sobre as chaves
                for(var key in data) {
                    var item = data[key];
                    // Busca materiais assincronamente
                    var matsHTML = '';
                    var matSnap = await db.ref(getFinancePath(currentUser.uid, 'receivable') + '/' + key + '/materials').once('value');
                    if(matSnap.exists()) {
                        matsHTML = '<div class="text-xs text-gray-500 ml-4">Materiais: ';
                        matSnap.forEach(function(m) { matsHTML += m.val().quantityUsed + m.val().unit + ' ' + m.val().name + ', '; });
                        matsHTML += '</div>';
                    }

                    div.innerHTML += `
                        <div class="border-b py-1">
                            <div class="flex justify-between">
                                <span>${item.description}</span>
                                <span class="font-bold ${item.status === 'Recebido' ? 'text-green-600' : 'text-yellow-600'}">${formatCurrency(item.amount)}</span>
                            </div>
                            ${matsHTML}
                        </div>`;
                }
            } else {
                div.innerHTML = '<i class="text-gray-400">Sem procedimentos registrados.</i>';
            }
        });
    }

    window.sendChat = function(pid, author, txt) {
        var msg = txt || document.getElementById('chat-msg').value;
        if(!msg) return;
        db.ref('artifacts/' + appId + '/patients/' + pid + '/journal').push({
            text: msg, author: author, timestamp: new Date().toISOString()
        });
        if(!txt) document.getElementById('chat-msg').value = '';
    };

    window.askAI = async function(pid) {
        var p = allPatients.find(function(x){ return x.id === pid; });
        var prompt = `Paciente: ${p.name}. Meta: ${p.treatmentGoal}. Sugira a próxima etapa.`;
        var resp = await window.callGeminiAPI(prompt, "Gere sugestão clínica.");
        window.sendChat(pid, 'IA', resp);
    };

    // ==================================================================
    // 6. FINANCEIRO E ESTOQUE
    // ==================================================================

    function renderFinancialManager(container) {
        container.innerHTML = `
            <div class="p-8 bg-white shadow-lg rounded-2xl">
                <h2 class="text-2xl font-bold text-indigo-800 mb-4">Financeiro & Estoque</h2>
                <div class="flex border-b mb-4 overflow-x-auto">
                    <button class="p-3 border-b-2 border-indigo-600 text-indigo-700 font-bold whitespace-nowrap" onclick="renderStockView()">📦 Estoque</button>
                    <button class="p-3 text-gray-500 hover:text-indigo-600 whitespace-nowrap" onclick="renderReceivablesView()">💰 Receitas</button>
                    <button class="p-3 text-gray-500 hover:text-indigo-600 whitespace-nowrap" onclick="renderExpensesView()">💸 Despesas</button>
                </div>
                <div id="fin-content-area"></div>
            </div>`;
        
        // Expor globalmente
        window.renderStockView = renderStockView;
        window.renderReceivablesView = renderReceivablesView;
        window.renderExpensesView = renderExpensesView;
        
        renderStockView(); 
    }

    // --- ESTOQUE ---
    function renderStockView() {
        var div = document.getElementById('fin-content-area');
        div.innerHTML = `
            <div class="flex justify-between mb-3">
                <h3 class="font-bold text-gray-700">Inventário</h3>
                <button onclick="openStockModal()" class="bg-green-600 text-white px-3 py-1 rounded text-sm">+ Item Manual</button>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm text-left">
                    <thead class="bg-gray-50 text-gray-600"><tr><th class="p-2">Item</th><th class="p-2">Qtd</th><th class="p-2">Custo</th><th class="p-2">Ação</th></tr></thead>
                    <tbody id="stock-table-body"></tbody>
                </table>
            </div>`;
        
        db.ref(getStockPath(currentUser.uid)).on('value', function(s) {
            var tb = document.getElementById('stock-table-body');
            if(!tb) return;
            tb.innerHTML = '';
            stockItems = [];
            if(s.exists()) {
                var data = s.val();
                Object.keys(data).forEach(function(k) {
                    var i = data[k];
                    i.id = k;
                    stockItems.push(i);
                    tb.innerHTML += `
                        <tr class="border-b">
                            <td class="p-2 font-medium">${i.name}</td>
                            <td class="p-2">${i.quantity} ${i.unit}</td>
                            <td class="p-2">${formatCurrency(i.cost)}</td>
                            <td class="p-2"><button onclick="deleteStock('${k}')" class="text-red-400"><i class='bx bx-trash'></i></button></td>
                        </tr>`;
                });
            }
        });
    }

    // --- RECEITAS (SERVIÇOS) ---
    function renderReceivablesView() {
        var div = document.getElementById('fin-content-area');
        div.innerHTML = `
            <div class="flex justify-between mb-3">
                <h3 class="font-bold text-gray-700">Contas a Receber</h3>
                <button onclick="openRecModal()" class="bg-indigo-600 text-white px-3 py-1 rounded text-sm">+ Serviço</button>
            </div>
            <div id="rec-list" class="space-y-2"></div>`;
        
        db.ref(getFinancePath(currentUser.uid, 'receivable')).on('value', function(s) {
            var list = document.getElementById('rec-list');
            if(!list) return;
            list.innerHTML = '';
            if(s.exists()) {
                var data = s.val();
                Object.keys(data).forEach(function(k) {
                    var r = data[k];
                    list.innerHTML += `
                        <div class="p-3 border rounded flex justify-between items-center bg-gray-50">
                            <div>
                                <div class="font-bold text-indigo-900">${r.patientName}</div>
                                <div class="text-xs text-gray-500">${r.description}</div>
                            </div>
                            <div class="text-right">
                                <div class="font-bold text-green-600">${formatCurrency(r.amount)}</div>
                                <button onclick="manageMaterials('${k}')" class="text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded mt-1">Baixa Estoque</button>
                            </div>
                        </div>`;
                });
            }
        });
    }

    // --- DESPESAS (COMPRAS) ---
    function renderExpensesView() {
        var div = document.getElementById('fin-content-area');
        div.innerHTML = `
            <div class="flex justify-between mb-3">
                <h3 class="font-bold text-gray-700">Contas a Pagar</h3>
                <button onclick="openExpModal()" class="bg-red-600 text-white px-3 py-1 rounded text-sm">+ Despesa</button>
            </div>
            <div id="exp-list" class="space-y-2"></div>`;
        
        db.ref(getFinancePath(currentUser.uid, 'expenses')).on('value', function(s) {
            var list = document.getElementById('exp-list');
            if(!list) return;
            list.innerHTML = '';
            if(s.exists()) {
                var data = s.val();
                Object.keys(data).forEach(function(k) {
                    var e = data[k];
                    list.innerHTML += `
                        <div class="p-3 border rounded flex justify-between items-center bg-gray-50">
                            <div>
                                <div class="font-bold text-gray-800">${e.supplier}</div>
                                <div class="text-xs text-gray-500">${e.description}</div>
                            </div>
                            <div class="text-right">
                                <div class="font-bold text-red-600">${formatCurrency(e.amount)}</div>
                                <button onclick="managePurchaseItems('${k}')" class="text-xs bg-green-200 text-green-800 px-2 py-1 rounded mt-1">Entrada Estoque</button>
                            </div>
                        </div>`;
                });
            }
        });
    }

    // --- MODAIS DE AÇÃO RÁPIDA ---
    window.openStockModal = function() {
        var html = `<form id="st-form" class="grid gap-2"><input id="s-name" placeholder="Nome" class="border p-2" required><input id="s-qty" type="number" placeholder="Qtd" class="border p-2" required><input id="s-unit" placeholder="Un" class="border p-2" required><button class="bg-green-600 text-white p-2 rounded">Salvar</button></form>`;
        openModal("Novo Item", html);
        document.getElementById('st-form').onsubmit = function(e) {
            e.preventDefault();
            db.ref(getStockPath(currentUser.uid)).push({
                name: document.getElementById('s-name').value,
                quantity: parseFloat(document.getElementById('s-qty').value),
                unit: document.getElementById('s-unit').value,
                cost: 0
            });
            closeModal();
        };
    };

    window.deleteStock = function(id) { if(confirm("Remover?")) db.ref(getStockPath(currentUser.uid) + '/' + id).remove(); };

    window.openRecModal = function() {
        var opts = allPatients.map(function(p){ return `<option value="${p.id}">${p.name}</option>`; }).join('');
        var html = `<form id="rec-form" class="grid gap-2"><label>Paciente</label><select id="r-pat" class="border p-2">${opts}</select><input id="r-desc" placeholder="Descrição" class="border p-2" required><input id="r-val" type="number" placeholder="Valor" class="border p-2" required><button class="bg-indigo-600 text-white p-2 rounded">Salvar</button></form>`;
        openModal("Nova Receita", html);
        document.getElementById('rec-form').onsubmit = function(e) {
            e.preventDefault();
            var pid = document.getElementById('r-pat').value;
            var p = allPatients.find(function(x){ return x.id === pid; });
            db.ref(getFinancePath(currentUser.uid, 'receivable')).push({
                patientId: pid, patientName: p.name,
                description: document.getElementById('r-desc').value,
                amount: parseFloat(document.getElementById('r-val').value),
                status: 'Aberto', registeredAt: new Date().toISOString()
            });
            closeModal();
        };
    };

    window.openExpModal = function() {
        var html = `<form id="xp-form" class="grid gap-2"><input id="e-sup" placeholder="Fornecedor" class="border p-2" required><input id="e-desc" placeholder="Descrição" class="border p-2" required><input id="e-val" type="number" placeholder="Valor" class="border p-2" required><button class="bg-red-600 text-white p-2 rounded">Salvar</button></form>`;
        openModal("Nova Despesa", html);
        document.getElementById('xp-form').onsubmit = function(e) {
            e.preventDefault();
            db.ref(getFinancePath(currentUser.uid, 'expenses')).push({
                supplier: document.getElementById('e-sup').value,
                description: document.getElementById('e-desc').value,
                amount: parseFloat(document.getElementById('e-val').value),
                status: 'Aberto', registeredAt: new Date().toISOString()
            });
            closeModal();
        };
    };

    // --- GESTÃO DE ITENS (Baixa e Entrada) ---
    window.manageMaterials = function(recId) {
        var opts = stockItems.map(function(i){ return `<option value="${i.id}">${i.name} (${i.quantity})</option>`; }).join('');
        var html = `<div class="text-sm mb-2">Baixa de estoque:</div><div class="flex gap-2"><select id="m-sel" class="border p-1 flex-grow">${opts}</select><input id="m-q" type="number" placeholder="Qtd" class="border w-16"><button id="m-ok" class="bg-red-500 text-white px-2">Baixar</button></div><div id="m-list" class="text-xs mt-2"></div>`;
        openModal("Materiais Usados", html);
        
        var ref = db.ref(getReceivableMaterialsPath(recId));
        ref.on('value', function(s) {
            var d = document.getElementById('m-list');
            if(d) { d.innerHTML = ''; if(s.exists()) s.forEach(function(x){ d.innerHTML += `<div>- ${x.val().quantityUsed} ${x.val().unit} ${x.val().name}</div>`; }); }
        });

        document.getElementById('m-ok').onclick = async function() {
            var id = document.getElementById('m-sel').value; var q = parseFloat(document.getElementById('m-q').value);
            var item = stockItems.find(function(x){ return x.id === id; });
            if(item && q) {
                await ref.push({ name: item.name, quantityUsed: q, unit: item.unit });
                await db.ref(getStockPath(currentUser.uid) + '/' + id).update({ quantity: item.quantity - q });
            }
        };
    };

    window.managePurchaseItems = function(expId) {
        var html = `<div class="text-sm mb-2">Entrada de estoque:</div><div class="grid grid-cols-2 gap-1"><input id="p-n" placeholder="Item"><input id="p-q" type="number" placeholder="Qtd"><input id="p-u" placeholder="Un"><input id="p-c" type="number" placeholder="Custo"><button id="p-ok" class="bg-green-600 text-white">Entrar</button></div><div id="p-list" class="text-xs mt-2"></div>`;
        openModal("Itens da Nota", html);
        
        var ref = db.ref(getExpensePurchasedItemsPath(expId));
        ref.on('value', function(s) {
            var d = document.getElementById('p-list');
            if(d) { d.innerHTML = ''; if(s.exists()) s.forEach(function(x){ d.innerHTML += `<div>+ ${x.val().quantityPurchased} ${x.val().unit} ${x.val().name}</div>`; }); }
        });

        document.getElementById('p-ok').onclick = async function() {
            var n = document.getElementById('p-n').value; var q = parseFloat(document.getElementById('p-q').value);
            var u = document.getElementById('p-u').value; var c = parseFloat(document.getElementById('p-c').value);
            if(n && q) {
                await ref.push({ name: n, quantityPurchased: q, unit: u, cost: c });
                // Lógica simples: procura ou cria
                var exist = stockItems.find(function(x){ return x.name.toLowerCase() === n.toLowerCase(); });
                if(exist) await db.ref(getStockPath(currentUser.uid) + '/' + exist.id).update({ quantity: parseFloat(exist.quantity) + q });
                else await db.ref(getStockPath(currentUser.uid)).push({ name: n, quantity: q, unit: u, cost: c });
            }
        };
    };

    // --- UTILS DE MODAL ---
    function openModal(title, html, maxW) {
        var m = document.getElementById('app-modal');
        m.querySelector('.modal-content').className = 'modal-content w-full ' + (maxW || 'max-w-md');
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = html;
        m.classList.remove('hidden');
        m.classList.add('flex');
    }
    
    function closeModal() {
        document.getElementById('app-modal').classList.add('hidden');
        document.getElementById('app-modal').classList.remove('flex');
    }

    // ==================================================================
    // INICIALIZAÇÃO
    // ==================================================================
    document.addEventListener('DOMContentLoaded', function() {
        initializeFirebase();
        document.getElementById('close-modal').addEventListener('click', closeModal);
        document.getElementById('logout-button').addEventListener('click', function() { auth.signOut().then(function(){ window.location.reload(); }); });
    });

})();
