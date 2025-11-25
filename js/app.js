// ==================================================================
// MÓDULO PRINCIPAL - DENTISTA INTELIGENTE (VERSÃO FINAL - FLUXO REAL)
// ==================================================================
(function() {
    
    // 1. CONFIGURAÇÕES GLOBAIS
    var config = window.AppConfig;
    var appId = config ? config.APP_ID : 'dentista-inteligente-app';
    
    // Variáveis de Estado (VAR para estabilidade máxima)
    var db, auth;
    var currentUser = null;
    var currentView = 'dashboard';
    var isLoginMode = true; 
    
    // Listas de Dados (Caches Locais)
    var allPatients = []; 
    var receivables = []; 
    var stockItems = []; 
    var expenses = []; 
    
    // ==================================================================
    // 2. FUNÇÕES AUXILIARES
    // ==================================================================
    
    function getAdminPath(uid, path) { return 'artifacts/' + appId + '/users/' + uid + '/' + path; }
    function getStockPath(uid) { return getAdminPath(uid, 'stock'); }
    function getFinancePath(uid, type) { return getAdminPath(uid, 'finance/' + type); }
    
    function formatCurrency(value) {
        return 'R$ ' + parseFloat(value || 0).toFixed(2).replace('.', ',');
    }

    function formatDateTime(iso) {
        if(!iso) return '-';
        var d = new Date(iso);
        return isNaN(d) ? '-' : d.toLocaleDateString('pt-BR');
    }

    // ==================================================================
    // 3. AUTENTICAÇÃO E INICIALIZAÇÃO
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
                // Garante que só carrega a UI se tiver usuário
                var userRef = db.ref('artifacts/' + appId + '/users/' + user.uid + '/profile');
                userRef.once('value').then(function(snapshot) {
                    var profile = snapshot.val();
                    
                    // Libera acesso para dentista ou admin master
                    if ((profile && profile.role === 'dentist') || user.email === 'admin@ts.com') {
                        currentUser = { uid: user.uid, email: user.email };
                        
                        // Auto-correção do perfil admin se não existir
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
        navigateTo('dashboard'); // Carrega o dashboard inicial
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
    // 4. NAVEGAÇÃO
    // ==================================================================
    
    function navigateTo(view) {
        if(!currentUser) return; // Proteção extra
        currentView = view;
        var content = document.getElementById('main-content');
        content.innerHTML = '';
        
        if (view === 'dashboard') renderDashboard(content);
        else if (view === 'patients') renderPatientManager(content);
        else if (view === 'financials') renderFinancialManager(content);
        
        // Atualiza classe ativa do menu
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
    // 5. TELAS DO SISTEMA
    // ==================================================================

    // --- DASHBOARD ---
    function renderDashboard(container) {
        container.innerHTML = `
            <div class="p-8 bg-white shadow-2xl rounded-2xl border border-indigo-100">
                <h2 class="text-3xl font-bold text-indigo-800 mb-6"><i class='bx bxs-dashboard'></i> Visão Geral</h2>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div class="p-4 bg-indigo-100 rounded-lg"><p class="text-gray-600">Pacientes</p><h3 class="text-2xl font-bold text-indigo-800" id="dash-pat">0</h3></div>
                    <div class="p-4 bg-green-100 rounded-lg"><p class="text-gray-600">Estoque (Itens)</p><h3 class="text-2xl font-bold text-green-800" id="dash-stk">0</h3></div>
                    <div class="p-4 bg-yellow-100 rounded-lg"><p class="text-gray-600">A Receber</p><h3 class="text-2xl font-bold text-yellow-800" id="dash-rec">R$ 0,00</h3></div>
                    <div class="p-4 bg-red-100 rounded-lg"><p class="text-gray-600">A Pagar</p><h3 class="text-2xl font-bold text-red-800" id="dash-exp">R$ 0,00</h3></div>
                </div>
                <div class="border p-4 rounded-xl bg-gray-50">
                    <h3 class="font-bold text-indigo-800 mb-2">Cérebro da Clínica (Instruções IA)</h3>
                    <textarea id="brain-input" class="w-full p-2 border rounded" rows="2" placeholder="Ex: Focar em tratamentos estéticos..."></textarea>
                    <button id="save-brain-btn" class="mt-2 bg-indigo-600 text-white px-4 py-1 rounded text-sm">Salvar Diretrizes</button>
                </div>
            </div>`;
            
        // Carregamento seguro dos dados
        db.ref(getAdminPath(currentUser.uid, 'patients')).on('value', function(s) { 
            if(document.getElementById('dash-pat')) document.getElementById('dash-pat').textContent = s.numChildren(); 
        });
        db.ref(getStockPath(currentUser.uid)).on('value', function(s) { 
            if(document.getElementById('dash-stk')) document.getElementById('dash-stk').textContent = s.numChildren(); 
        });
        
        // Carregar IA Config
        var brainRef = db.ref(getAdminPath(currentUser.uid, 'aiConfig/directives'));
        brainRef.once('value', function(s) { if(s.exists()) document.getElementById('brain-input').value = s.val().promptDirectives; });
        document.getElementById('save-brain-btn').onclick = function() {
            brainRef.update({ promptDirectives: document.getElementById('brain-input').value });
            alert("IA Atualizada!");
        };
    }

    // --- GESTÃO DE PACIENTES ---
    function renderPatientManager(container) {
        container.innerHTML = `
            <div class="p-8 bg-white shadow-lg rounded-2xl">
                <div class="flex justify-between mb-6">
                    <h2 class="text-2xl font-bold text-indigo-800">Pacientes</h2>
                    <button onclick="openPatientModal()" class="bg-indigo-600 text-white px-4 py-2 rounded shadow">Novo Paciente</button>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left">
                        <thead class="bg-gray-100 text-gray-600"><tr><th class="p-3">Nome</th><th class="p-3">Tratamento</th><th class="p-3 text-right">Ações</th></tr></thead>
                        <tbody id="patient-list-body"></tbody>
                    </table>
                </div>
            </div>`;
        
        // Listener de Pacientes
        db.ref(getAdminPath(currentUser.uid, 'patients')).on('value', function(snap) {
            var tbody = document.getElementById('patient-list-body');
            if(!tbody) return;
            tbody.innerHTML = '';
            allPatients = []; // Cache local
            
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

    // --- GESTÃO FINANCEIRA & ESTOQUE (O CORAÇÃO DO NEGÓCIO) ---
    function renderFinancialManager(container) {
        container.innerHTML = `
            <div class="p-8 bg-white shadow-lg rounded-2xl">
                <h2 class="text-2xl font-bold text-indigo-800 mb-4">Financeiro & Estoque</h2>
                
                <div class="flex border-b mb-4">
                    <button class="p-3 border-b-2 border-indigo-600 text-indigo-700 font-bold" onclick="renderStockView()">📦 Estoque</button>
                    <button class="p-3 text-gray-500 hover:text-indigo-600" onclick="renderReceivablesView()">💰 Receitas (Serviços)</button>
                    <button class="p-3 text-gray-500 hover:text-indigo-600" onclick="renderExpensesView()">💸 Despesas (Compras)</button>
                </div>
                
                <div id="fin-content-area"></div>
            </div>`;
            
        // Expor funções globais para os botões
        window.renderStockView = renderStockView;
        window.renderReceivablesView = renderReceivablesView;
        window.renderExpensesView = renderExpensesView;
        
        renderStockView(); // Inicia na aba Estoque
    }

    // === LÓGICA DE ESTOQUE ===
    function renderStockView() {
        var div = document.getElementById('fin-content-area');
        div.innerHTML = `
            <div class="flex justify-between mb-3">
                <h3 class="font-bold text-gray-700">Inventário Atual</h3>
                <button onclick="openStockModal()" class="bg-green-600 text-white px-3 py-1 rounded text-sm">+ Item Manual</button>
            </div>
            <table class="w-full text-sm text-left">
                <thead class="bg-gray-50 text-gray-600"><tr><th class="p-2">Item</th><th class="p-2">Qtd</th><th class="p-2">Custo Médio</th><th class="p-2">Ação</th></tr></thead>
                <tbody id="stock-table-body"></tbody>
            </table>
        `;
        
        db.ref(getStockPath(currentUser.uid)).on('value', function(s) {
            var tb = document.getElementById('stock-table-body');
            if(!tb) return;
            tb.innerHTML = '';
            stockItems = []; // Atualiza cache
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
            } else { tb.innerHTML = '<tr><td colspan="4" class="p-3 text-center italic">Estoque vazio. Compre materiais na aba Despesas.</td></tr>'; }
        });
    }

    // === LÓGICA DE RECEITAS (SERVIÇOS E BAIXA DE ESTOQUE) ===
    function renderReceivablesView() {
        var div = document.getElementById('fin-content-area');
        div.innerHTML = `
            <div class="flex justify-between mb-3">
                <h3 class="font-bold text-gray-700">Serviços Realizados</h3>
                <button onclick="openRecModal()" class="bg-indigo-600 text-white px-3 py-1 rounded text-sm">+ Novo Serviço</button>
            </div>
            <div id="rec-list" class="space-y-2"></div>
        `;
        
        db.ref(getReceivablePath(currentUser.uid)).on('value', function(s) {
            var list = document.getElementById('rec-list');
            if(!list) return;
            list.innerHTML = '';
            if(s.exists()) {
                var data = s.val();
                Object.keys(data).forEach(function(k) {
                    var r = data[k];
                    var statusColor = r.status === 'Recebido' ? 'text-green-600' : 'text-yellow-600';
                    
                    list.innerHTML += `
                        <div class="p-3 border rounded flex justify-between items-center bg-gray-50">
                            <div>
                                <div class="font-bold text-indigo-900">${r.patientName}</div>
                                <div class="text-xs text-gray-500">${r.description} - ${formatDateTime(r.dueDate)}</div>
                            </div>
                            <div class="text-right">
                                <div class="font-bold ${statusColor}">${formatCurrency(r.amount)}</div>
                                <button onclick="manageMaterials('${k}')" class="text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded mt-1 hover:bg-yellow-300">
                                    <i class='bx bx-package'></i> Materiais (Baixa)
                                </button>
                            </div>
                        </div>`;
                });
            } else { list.innerHTML = '<p class="text-center text-gray-400">Nenhum serviço registrado.</p>'; }
        });
    }

    // === LÓGICA DE DESPESAS (COMPRAS E ENTRADA DE ESTOQUE) ===
    function renderExpensesView() {
        var div = document.getElementById('fin-content-area');
        div.innerHTML = `
            <div class="flex justify-between mb-3">
                <h3 class="font-bold text-gray-700">Despesas & Compras</h3>
                <button onclick="openExpModal()" class="bg-red-600 text-white px-3 py-1 rounded text-sm">+ Nova Despesa</button>
            </div>
            <div id="exp-list" class="space-y-2"></div>
        `;
        
        db.ref(getExpensePath(currentUser.uid)).on('value', function(s) {
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
                                <div class="font-bold text-gray-800">${e.supplier} <span class="text-xs font-normal text-gray-500">(${e.ref || 'S/Ref'})</span></div>
                                <div class="text-xs text-gray-500">${e.description}</div>
                            </div>
                            <div class="text-right">
                                <div class="font-bold text-red-600">${formatCurrency(e.amount)}</div>
                                <button onclick="managePurchaseItems('${k}')" class="text-xs bg-green-200 text-green-800 px-2 py-1 rounded mt-1 hover:bg-green-300">
                                    <i class='bx bx-cart-add'></i> Itens (Entrada)
                                </button>
                            </div>
                        </div>`;
                });
            } else { list.innerHTML = '<p class="text-center text-gray-400">Nenhuma despesa registrada.</p>'; }
        });
    }

    // ==================================================================
    // 6. MODAIS E LÓGICA DE NEGÓCIO (FUNÇÕES GLOBAIS PARA ONCLICK)
    // ==================================================================

    // --- PACIENTES E DIÁRIO ---
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

    window.openJournal = function(id) {
        var p = allPatients.find(function(x){ return x.id === id; });
        if(!p) return;
        
        // Monta a view do prontuário
        var html = `
            <div class="bg-blue-50 p-3 rounded mb-3 text-sm">
                <b>Objetivo:</b> ${p.treatmentGoal || 'Não definido'}
            </div>
            
            <div class="mb-4 border p-2 rounded max-h-40 overflow-y-auto">
                <h5 class="font-bold text-xs text-gray-500 mb-1">PROCEDIMENTOS REALIZADOS</h5>
                <div id="journal-fin-list" class="text-sm">Carregando...</div>
            </div>
            
            <div id="chat-area" class="bg-gray-100 p-2 h-48 overflow-y-auto flex flex-col gap-2 mb-2 rounded"></div>
            
            <div class="flex gap-2">
                <input id="chat-msg" class="flex-grow border p-2 rounded" placeholder="Evolução clínica...">
                <button onclick="sendChat('${id}', 'Dentista')" class="bg-indigo-600 text-white px-3 rounded"><i class='bx bxs-send'></i></button>
                <button onclick="askAI('${id}')" class="bg-purple-600 text-white px-3 rounded" title="Pedir sugestão à IA"><i class='bx bxs-magic-wand'></i></button>
            </div>
        `;
        openModal(p.name, html, 'max-w-3xl');

        // Carrega Financeiro
        db.ref(getReceivablePath(currentUser.uid)).orderByChild('patientId').equalTo(id).once('value', function(s) {
            var d = document.getElementById('journal-fin-list');
            if(d) {
                d.innerHTML = '';
                if(s.exists()) {
                    s.forEach(function(c) {
                        var v = c.val();
                        d.innerHTML += `<div class="border-b py-1 flex justify-between"><span>${v.description}</span> <span class="font-bold">${formatCurrency(v.amount)}</span></div>`;
                    });
                } else { d.innerHTML = '<i>Sem procedimentos registrados.</i>'; }
            }
        });

        // Carrega Chat
        var chatRef = db.ref(getJournalCollectionPath(id));
        chatRef.on('child_added', function(s) {
            var m = s.val();
            var div = document.createElement('div');
            div.className = `p-2 rounded text-sm max-w-[80%] ${m.author === 'IA' ? 'bg-purple-100 self-start' : 'bg-white border self-end'}`;
            div.innerHTML = `<b>${m.author}:</b> ${m.text}`;
            var area = document.getElementById('chat-area');
            if(area) { area.appendChild(div); area.scrollTop = area.scrollHeight; }
        });
    };

    window.sendChat = function(pid, author, text) {
        var msg = text || document.getElementById('chat-msg').value;
        if(!msg) return;
        db.ref(getJournalCollectionPath(pid)).push({ text: msg, author: author, timestamp: new Date().toISOString() });
        if(!text) document.getElementById('chat-msg').value = '';
    };

    window.askAI = async function(pid) {
        var p = allPatients.find(function(x){ return x.id === pid; });
        var prompt = `Paciente: ${p.name}. Tratamento: ${p.treatmentType}. Meta: ${p.treatmentGoal}. O dentista precisa de uma sugestão técnica curta para a evolução.`;
        
        var btn = document.querySelector('button[title="Pedir sugestão à IA"]');
        if(btn) btn.disabled = true;
        
        var response = await window.callGeminiAPI(prompt, "Gere sugestão clínica.");
        window.sendChat(pid, 'IA', response);
        
        if(btn) btn.disabled = false;
    };

    // --- FINANCEIRO: FUNÇÕES DE MODAL ---
    
    window.openStockModal = function() {
        var html = `<form id="st-form" class="grid gap-2"><input id="s-name" placeholder="Nome do Material" class="border p-2" required><input id="s-qty" type="number" placeholder="Qtd Inicial" class="border p-2" required><input id="s-unit" placeholder="Unidade (ex: cx, un)" class="border p-2" required><button class="bg-green-600 text-white p-2 rounded">Salvar</button></form>`;
        openModal("Novo Material", html);
        document.getElementById('st-form').onsubmit = function(e) {
            e.preventDefault();
            db.ref(getStockPath(currentUser.uid)).push({
                name: document.getElementById('s-name').value,
                quantity: parseFloat(document.getElementById('s-qty').value),
                unit: document.getElementById('s-unit').value,
                cost: 0,
                supplier: 'Cadastro Manual'
            });
            closeModal();
        };
    };

    window.deleteStock = function(id) {
        if(confirm("Remover item do estoque?")) db.ref(getStockPath(currentUser.uid) + '/' + id).remove();
    };

    window.openRecModal = function() {
        var opts = allPatients.map(function(p){ return `<option value="${p.id}">${p.name}</option>`; }).join('');
        var html = `
            <form id="rec-form" class="grid gap-2">
                <label class="text-xs text-gray-500">Paciente</label>
                <select id="r-pat" class="border p-2 rounded">${opts}</select>
                <input id="r-desc" placeholder="Descrição do Serviço" class="border p-2 rounded" required>
                <input id="r-val" type="number" placeholder="Valor (R$)" class="border p-2 rounded" required>
                <input id="r-date" type="date" class="border p-2 rounded" required>
                <button class="bg-indigo-600 text-white p-2 rounded">Registrar</button>
            </form>`;
        openModal("Novo Serviço", html);
        document.getElementById('rec-form').onsubmit = function(e) {
            e.preventDefault();
            var pid = document.getElementById('r-pat').value;
            var p = allPatients.find(function(x){ return x.id === pid; });
            db.ref(getReceivablePath(currentUser.uid)).push({
                patientId: pid,
                patientName: p.name,
                description: document.getElementById('r-desc').value,
                amount: parseFloat(document.getElementById('r-val').value),
                dueDate: document.getElementById('r-date').value,
                status: 'Aberto',
                registeredAt: new Date().toISOString()
            });
            closeModal();
        };
    };

    window.openExpModal = function() {
        var html = `
            <form id="exp-form" class="grid gap-2">
                <input id="e-sup" placeholder="Fornecedor" class="border p-2 rounded" required>
                <input id="e-ref" placeholder="Nota Fiscal / Ref" class="border p-2 rounded">
                <input id="e-desc" placeholder="Descrição da Compra" class="border p-2 rounded" required>
                <input id="e-val" type="number" placeholder="Valor Total (R$)" class="border p-2 rounded" required>
                <button class="bg-red-600 text-white p-2 rounded">Registrar Despesa</button>
            </form>`;
        openModal("Nova Despesa", html);
        document.getElementById('exp-form').onsubmit = function(e) {
            e.preventDefault();
            db.ref(getExpensePath(currentUser.uid)).push({
                supplier: document.getElementById('e-sup').value,
                ref: document.getElementById('e-ref').value,
                description: document.getElementById('e-desc').value,
                amount: parseFloat(document.getElementById('e-val').value),
                status: 'Aberto',
                registeredAt: new Date().toISOString()
            });
            closeModal();
        };
    };

    // --- LÓGICA AVANÇADA: BAIXA E ENTRADA DE ESTOQUE ---

    // 1. BAIXA (Consumo no Serviço)
    window.manageMaterials = function(recId) {
        var opts = stockItems.map(function(i){ return `<option value="${i.id}">${i.name} (${i.quantity} ${i.unit})</option>`; }).join('');
        var html = `
            <div class="bg-yellow-50 p-2 rounded text-xs mb-2 text-yellow-800">Adicione materiais gastos neste serviço para baixar do estoque.</div>
            <div id="used-list" class="mb-2 text-sm border-b pb-2">Carregando...</div>
            <div class="flex gap-2 items-center">
                <select id="mat-sel" class="border p-1 flex-grow text-sm">${opts}</select>
                <input id="mat-qtd" type="number" placeholder="Qtd" class="border p-1 w-16 text-sm">
                <button id="mat-add" class="bg-red-500 text-white px-3 rounded">-</button>
            </div>
        `;
        openModal("Baixa de Materiais", html);

        var usedRef = db.ref(`${getReceivablePath(currentUser.uid)}/${recId}/materials`);
        
        // Lista itens já usados
        usedRef.on('value', function(s) {
            var d = document.getElementById('used-list');
            if(d) {
                d.innerHTML = '';
                if(s.exists()) {
                    s.forEach(function(snap) {
                        var u = snap.val();
                        d.innerHTML += `<div class="flex justify-between"><span>${u.name}</span> <b>-${u.quantityUsed} ${u.unit}</b></div>`;
                    });
                } else { d.innerHTML = '<span class="text-gray-400">Nenhum material lançado.</span>'; }
            }
        });

        // Ação de Baixar
        document.getElementById('mat-add').onclick = async function() {
            var itemId = document.getElementById('mat-sel').value;
            var qty = parseFloat(document.getElementById('mat-qtd').value);
            var item = stockItems.find(function(x){ return x.id === itemId; });
            
            if(!item || !qty) return;

            // 1. Registra o consumo no serviço
            await usedRef.push({ materialId: itemId, name: item.name, quantityUsed: qty, unit: item.unit });
            
            // 2. Abate do estoque principal
            var newQty = parseFloat(item.quantity) - qty;
            await db.ref(`${getStockPath(currentUser.uid)}/${itemId}`).update({ quantity: newQty });
            
            showNotification("Estoque atualizado: -" + qty + " " + item.unit);
            document.getElementById('mat-qtd').value = '';
        };
    };

    // 2. ENTRADA (Itens da Nota Fiscal)
    window.managePurchaseItems = function(expId) {
        var html = `
            <div class="bg-green-50 p-2 rounded text-xs mb-2 text-green-800">Adicione os itens desta nota para entrarem no estoque.</div>
            <div id="bought-list" class="mb-2 text-sm border-b pb-2">Carregando...</div>
            <div class="grid grid-cols-3 gap-2 mb-2">
                <input id="buy-name" placeholder="Nome Produto" class="border p-1 text-sm col-span-2">
                <input id="buy-unit" placeholder="Un (cx, un)" class="border p-1 text-sm">
                <input id="buy-qty" type="number" placeholder="Qtd" class="border p-1 text-sm">
                <input id="buy-cost" type="number" placeholder="Custo Un." class="border p-1 text-sm">
                <button id="buy-add" class="bg-green-600 text-white rounded text-sm">Adicionar</button>
            </div>
        `;
        openModal("Entrada de Nota Fiscal", html);

        var itemsRef = db.ref(`${getExpensePath(currentUser.uid)}/${expId}/purchasedItems`);

        // Lista itens comprados
        itemsRef.on('value', function(s) {
            var d = document.getElementById('bought-list');
            if(d) {
                d.innerHTML = '';
                if(s.exists()) {
                    s.forEach(function(snap) {
                        var i = snap.val();
                        d.innerHTML += `<div class="flex justify-between"><span>${i.name}</span> <b>+${i.quantityPurchased} ${i.unit}</b></div>`;
                    });
                } else { d.innerHTML = '<span class="text-gray-400">Nenhum item lançado na nota.</span>'; }
            }
        });

        // Ação de Entrada
        document.getElementById('buy-add').onclick = async function() {
            var name = document.getElementById('buy-name').value;
            var qty = parseFloat(document.getElementById('buy-qty').value);
            var unit = document.getElementById('buy-unit').value;
            var cost = parseFloat(document.getElementById('buy-cost').value);

            if(!name || !qty) return;

            // 1. Registra na nota
            await itemsRef.push({ name: name, quantityPurchased: qty, unit: unit, cost: cost });

            // 2. Atualiza ou Cria no Estoque
            // Tenta achar pelo nome (simples match)
            var existing = stockItems.find(function(x){ return x.name.toLowerCase() === name.toLowerCase(); });
            
            if(existing) {
                var newQty = parseFloat(existing.quantity) + qty;
                await db.ref(`${getStockPath(currentUser.uid)}/${existing.id}`).update({ 
                    quantity: newQty, 
                    cost: cost, // Atualiza custo para o mais recente
                    lastUpdated: new Date().toISOString()
                });
            } else {
                await db.ref(getStockPath(currentUser.uid)).push({
                    name: name, quantity: qty, unit: unit, cost: cost, supplier: 'Via Nota', lastUpdated: new Date().toISOString()
                });
            }

            showNotification("Estoque atualizado: +" + qty + " " + unit);
            // Limpa inputs
            document.getElementById('buy-name').value = '';
            document.getElementById('buy-qty').value = '';
        };
    };

    // --- UTILS DE MODAL ---
    function openModal(title, html, maxWidth) {
        var m = document.getElementById('app-modal');
        var c = m.querySelector('.modal-content');
        c.className = 'modal-content w-full ' + (maxWidth || 'max-w-md');
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
        document.getElementById('logout-button').addEventListener('click', function() { auth.signOut().then(() => window.location.reload()); });
    });

})();
