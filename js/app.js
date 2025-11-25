// ==================================================================
// MÓDULO PRINCIPAL - DENTISTA INTELIGENTE (VERSÃO SÊNIOR CORRIGIDA)
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
        return isNaN(d) ? '-' : d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
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
                var userRef = db.ref('artifacts/' + appId + '/users/' + user.uid + '/profile');
                userRef.once('value').then(function(snapshot) {
                    var profile = snapshot.val();
                    
                    // Libera acesso para dentista ou admin master
                    if ((profile && profile.role === 'dentist') || user.email === 'admin@ts.com') {
                        currentUser = { uid: user.uid, email: user.email };
                        
                        // Auto-correção do perfil admin
                        if (!profile && user.email === 'admin@ts.com') {
                            userRef.set({ email: user.email, role: 'dentist', registeredAt: new Date().toISOString() });
                        }
                        
                        // Carregamento Inicial de Dados para Cache
                        loadInitialData();
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
    
    function loadInitialData() {
        // Carrega pacientes para cache
        db.ref(getAdminPath(currentUser.uid, 'patients')).on('value', function(s) {
            allPatients = [];
            if(s.exists()) s.forEach(function(c) { var p = c.val(); p.id = c.key; allPatients.push(p); });
            // Atualiza UI se estiver na tela de pacientes
            if(currentView === 'patients') renderPatientManager(document.getElementById('main-content'));
            // Atualiza Dashboard KPI
             if(document.getElementById('dash-pat')) document.getElementById('dash-pat').textContent = allPatients.length;
        });

        // Carrega estoque para cache
        db.ref(getStockPath(currentUser.uid)).on('value', function(s) {
            stockItems = [];
            if(s.exists()) s.forEach(function(c) { var i = c.val(); i.id = c.key; stockItems.push(i); });
            if(currentView === 'financials') renderStockView(); // Re-renderiza se estiver na aba
             // Atualiza Dashboard KPI
            if(document.getElementById('dash-stk')) document.getElementById('dash-stk').textContent = stockItems.length;
        });
    }
    
    function showLoginScreen() {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('app-container').classList.add('hidden');
        
        // Reset de listeners
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
    // 4. NAVEGAÇÃO
    // ==================================================================
    
    function navigateTo(view) {
        if(!currentUser) return;
        currentView = view;
        var content = document.getElementById('main-content');
        content.innerHTML = '';
        
        if (view === 'dashboard') renderDashboard(content);
        else if (view === 'patients') renderPatientManager(content);
        else if (view === 'financials') renderFinancialManager(content);
        
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
    // 5. TELAS: DASHBOARD
    // ==================================================================
    
    function renderDashboard(container) {
        container.innerHTML = `
            <div class="p-8 bg-white shadow-2xl rounded-2xl border border-indigo-100">
                <h2 class="text-3xl font-bold text-indigo-800 mb-6"><i class='bx bxs-dashboard'></i> Visão Geral</h2>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div class="p-4 bg-indigo-100 rounded-lg"><p class="text-gray-600">Pacientes</p><h3 class="text-2xl font-bold text-indigo-800" id="dash-pat">${allPatients.length}</h3></div>
                    <div class="p-4 bg-green-100 rounded-lg"><p class="text-gray-600">Estoque</p><h3 class="text-2xl font-bold text-green-800" id="dash-stk">${stockItems.length}</h3></div>
                    <div class="p-4 bg-yellow-100 rounded-lg"><p class="text-gray-600">A Receber</p><h3 class="text-2xl font-bold text-yellow-800" id="dash-rec">R$ 0,00</h3></div>
                    <div class="p-4 bg-red-100 rounded-lg"><p class="text-gray-600">A Pagar</p><h3 class="text-2xl font-bold text-red-800" id="dash-exp">R$ 0,00</h3></div>
                </div>
                <div class="border p-4 rounded-xl bg-gray-50">
                    <h3 class="font-bold text-indigo-800 mb-2">Instruções da IA</h3>
                    <textarea id="brain-input" class="w-full p-2 border rounded" rows="2"></textarea>
                    <button id="save-brain-btn" class="mt-2 bg-indigo-600 text-white px-4 py-1 rounded text-sm">Salvar</button>
                </div>
            </div>`;
            
        // Listeners de Finanças para KPIs
        db.ref(getFinancePath(currentUser.uid, 'receivable')).on('value', s => {
            let total = 0; s.forEach(x => { if(x.val().status !== 'Recebido') total += parseFloat(x.val().amount || 0); });
            if(document.getElementById('dash-rec')) document.getElementById('dash-rec').textContent = formatCurrency(total);
        });
        
        db.ref(getFinancePath(currentUser.uid, 'expenses')).on('value', s => {
            let total = 0; s.forEach(x => { if(x.val().status !== 'Pago') total += parseFloat(x.val().amount || 0); });
            if(document.getElementById('dash-exp')) document.getElementById('dash-exp').textContent = formatCurrency(total);
        });
        
        // Carregar IA
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
        
        // Renderiza tabela com dados do cache
        var tbody = document.getElementById('patient-list-body');
        if(allPatients.length > 0) {
            allPatients.forEach(function(p) {
                tbody.innerHTML += `
                    <tr class="border-b hover:bg-gray-50">
                        <td class="p-3 font-medium">${p.name}</td>
                        <td class="p-3">${p.treatmentType || '-'}</td>
                        <td class="p-3 text-right">
                            <button onclick="openJournal('${p.id}')" class="text-cyan-600 mr-3" title="Prontuário"><i class='bx bx-book-heart text-xl'></i></button>
                            <button onclick="deletePatient('${p.id}')" class="text-red-500" title="Excluir"><i class='bx bx-trash text-xl'></i></button>
                        </td>
                    </tr>`;
            });
        } else {
             tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-gray-400">Nenhum paciente.</td></tr>';
        }
    }

    // Expondo funções globais para onclick
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
        if(confirm("Tem certeza?")) db.ref(getAdminPath(currentUser.uid, 'patients') + '/' + id).remove();
    };

    // --- DIÁRIO DO PACIENTE (INTEGRAÇÃO FINANCEIRA) ---
    window.openJournal = function(id) {
        var p = allPatients.find(function(x){ return x.id === id; });
        if(!p) return;
        
        var html = `
            <div class="bg-blue-50 p-3 rounded mb-3 text-sm">
                <b>Meta:</b> ${p.treatmentGoal || 'Não definido'}
            </div>
            <div class="mb-4 border p-2 rounded max-h-40 overflow-y-auto">
                <h5 class="font-bold text-xs text-gray-500 mb-1">PROCEDIMENTOS E MATERIAIS</h5>
                <div id="journal-fin-list" class="text-sm">Carregando histórico...</div>
            </div>
            <div id="chat-area" class="bg-gray-100 p-2 h-48 overflow-y-auto flex flex-col gap-2 mb-2 rounded"></div>
            <div class="flex gap-2">
                <input id="chat-msg" class="flex-grow border p-2 rounded" placeholder="Evolução...">
                <button onclick="sendChat('${id}', 'Dentista')" class="bg-indigo-600 text-white px-3 rounded">Enviar</button>
                <button onclick="askAI('${id}')" class="bg-purple-600 text-white px-3 rounded" title="IA"><i class='bx bxs-magic-wand'></i></button>
            </div>
        `;
        openModal(`Prontuário: ${p.name}`, html, 'max-w-3xl');

        // Carrega Financeiro no Diário
        db.ref(getFinancePath(currentUser.uid, 'receivable')).orderByChild('patientId').equalTo(id).once('value', async function(s) {
            var div = document.getElementById('journal-fin-list');
            if(!div) return;
            div.innerHTML = '';
            
            if(s.exists()) {
                s.forEach(function(snap) {
                    var item = snap.val();
                    div.innerHTML += `<div class="border-b py-1 flex justify-between"><span>${item.description}</span> <span class="font-bold">${formatCurrency(item.amount)}</span></div>`;
                    // Busca materiais (simplificado para não aninhar demais)
                    db.ref(getAdminPath(currentUser.uid, `finance/receivable/${snap.key}/materials`)).once('value', function(mSnap) {
                        if(mSnap.exists()) {
                            var mats = [];
                            mSnap.forEach(function(m) { mats.push(`${m.val().quantityUsed} ${m.val().name}`); });
                            div.innerHTML += `<div class="text-xs text-gray-500 ml-2">Materiais: ${mats.join(', ')}</div>`;
                        }
                    });
                });
            } else {
                div.innerHTML = '<i class="text-gray-400">Sem procedimentos.</i>';
            }
        });

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
        
        // Usa o cache local de stockItems para renderizar rápido
        var tb = document.getElementById('stock-table-body');
        if(stockItems.length > 0) {
            stockItems.forEach(function(i) {
                tb.innerHTML += `
                    <tr class="border-b">
                        <td class="p-2 font-medium">${i.name}</td>
                        <td class="p-2">${i.quantity} ${i.unit}</td>
                        <td class="p-2">${formatCurrency(i.cost)}</td>
                        <td class="p-2"><button onclick="deleteStock('${i.id}')" class="text-red-400"><i class='bx bx-trash'></i></button></td>
                    </tr>`;
            });
        } else {
            tb.innerHTML = '<tr><td colspan="4" class="p-3 text-center italic">Estoque vazio.</td></tr>';
        }
    }

    // --- RECEITAS (COM BAIXA AUTOMÁTICA E FORMA DE PAGAMENTO) ---
    function renderReceivablesView() {
        var div = document.getElementById('fin-content-area');
        div.innerHTML = `
            <div class="flex justify-between mb-3">
                <h3 class="font-bold text-gray-700">Serviços (Receitas)</h3>
                <button onclick="openRecModal()" class="bg-indigo-600 text-white px-3 py-1 rounded text-sm">+ Novo Serviço</button>
            </div>
            <div id="rec-list" class="space-y-2"></div>`;
        
        db.ref(getFinancePath(currentUser.uid, 'receivable')).on('value', function(s) {
            var list = document.getElementById('rec-list');
            if(!list) return;
            list.innerHTML = '';
            if(s.exists()) {
                s.forEach(function(snap) {
                    var r = snap.val();
                    var k = snap.key;
                    var isPaid = r.status === 'Recebido';
                    var badge = isPaid ? `<span class="bg-green-100 text-green-800 text-xs px-2 rounded">Recebido</span>` : `<span class="bg-yellow-100 text-yellow-800 text-xs px-2 rounded">Aberto</span>`;
                    var action = isPaid ? '' : `<button onclick="settleTx('receivable', '${k}')" class="text-xs bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600 ml-2" title="Receber"><i class='bx bx-check'></i></button>`;

                    list.innerHTML += `
                        <div class="p-3 border rounded flex justify-between items-center bg-white hover:shadow-sm transition">
                            <div>
                                <div class="font-bold text-indigo-900">${r.patientName} <span class="text-xs font-normal text-gray-500">(${r.paymentMethod || '-'})</span></div>
                                <div class="text-xs text-gray-500">${r.description} - Venc: ${formatDateTime(r.dueDate)}</div>
                            </div>
                            <div class="text-right flex items-center gap-2">
                                ${badge}
                                <div class="font-bold text-green-600 ml-2">${formatCurrency(r.amount)}</div>
                                <button onclick="manageMaterials('${k}')" class="text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded hover:bg-yellow-300" title="Baixa de Materiais"><i class='bx bx-package'></i></button>
                                ${action}
                                <button onclick="deleteTx('receivable', '${k}')" class="text-red-400 hover:text-red-600"><i class='bx bx-trash'></i></button>
                            </div>
                        </div>`;
                });
            } else { list.innerHTML = '<p class="text-center text-gray-400">Nenhum serviço registrado.</p>'; }
        });
    }

    // --- DESPESAS ---
    function renderExpensesView() {
        var div = document.getElementById('fin-content-area');
        div.innerHTML = `
            <div class="flex justify-between mb-3">
                <h3 class="font-bold text-gray-700">Contas a Pagar</h3>
                <button onclick="openExpModal()" class="bg-red-600 text-white px-3 py-1 rounded text-sm">+ Nova Despesa</button>
            </div>
            <div id="exp-list" class="space-y-2"></div>`;
        
        db.ref(getFinancePath(currentUser.uid, 'expenses')).on('value', function(s) {
            var list = document.getElementById('exp-list');
            if(!list) return;
            list.innerHTML = '';
            if(s.exists()) {
                s.forEach(function(snap) {
                    var e = snap.val();
                    var k = snap.key;
                    var isPaid = e.status === 'Pago';
                    var badge = isPaid ? `<span class="bg-green-100 text-green-800 text-xs px-2 rounded">Pago</span>` : `<span class="bg-red-100 text-red-800 text-xs px-2 rounded">Aberto</span>`;
                    var action = isPaid ? '' : `<button onclick="settleTx('expenses', '${k}')" class="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600 ml-2" title="Pagar"><i class='bx bx-check'></i></button>`;

                    list.innerHTML += `
                        <div class="p-3 border rounded flex justify-between items-center bg-white hover:shadow-sm transition">
                            <div>
                                <div class="font-bold text-gray-800">${e.supplier} <span class="text-xs font-normal text-gray-500">(${e.ref || 'S/Ref'})</span></div>
                                <div class="text-xs text-gray-500">${e.description}</div>
                            </div>
                            <div class="text-right flex items-center gap-2">
                                ${badge}
                                <div class="font-bold text-red-600 ml-2">${formatCurrency(e.amount)}</div>
                                <button onclick="managePurchaseItems('${k}')" class="text-xs bg-green-200 text-green-800 px-2 py-1 rounded hover:bg-green-300" title="Entrada de Produtos"><i class='bx bx-cart-add'></i></button>
                                ${action}
                                <button onclick="deleteTx('expenses', '${k}')" class="text-red-400 hover:text-red-600"><i class='bx bx-trash'></i></button>
                            </div>
                        </div>`;
                });
            } else { list.innerHTML = '<p class="text-center text-gray-400">Nenhuma despesa registrada.</p>'; }
        });
    }

    // --- AÇÕES GLOBAIS ---
    window.deleteTx = function(type, id) {
        if(confirm("Excluir registro?")) db.ref(getFinancePath(currentUser.uid, type) + '/' + id).remove();
    };
    
    window.settleTx = function(type, id) {
        if(!confirm("Confirmar baixa?")) return;
        var updates = { status: type === 'receivable' ? 'Recebido' : 'Pago' };
        if(type === 'receivable') updates.receivedDate = new Date().toISOString();
        else updates.paidDate = new Date().toISOString();
        db.ref(getFinancePath(currentUser.uid, type) + '/' + id).update(updates);
    };
    
    window.deleteStock = function(id) {
        if(confirm("Remover item?")) db.ref(getStockPath(currentUser.uid) + '/' + id).remove();
    };

    // --- MODAIS DE CRIAÇÃO ---
    window.openRecModal = function(preselectPid) {
        var opts = allPatients.map(function(p){ return `<option value="${p.id}" ${preselectPid === p.id ? 'selected' : ''}>${p.name}</option>`; }).join('');
        var html = `
            <form id="rec-form" class="grid gap-3">
                <div><label class="text-xs font-bold text-gray-600">Paciente</label><select id="r-pat" class="w-full border p-2 rounded bg-white">${opts}</select></div>
                <div><label class="text-xs font-bold text-gray-600">Descrição do Serviço</label><input id="r-desc" placeholder="Ex: Clareamento" class="w-full border p-2 rounded" required></div>
                <div class="grid grid-cols-2 gap-2">
                    <div><label class="text-xs font-bold text-gray-600">Valor (R$)</label><input id="r-val" type="number" step="0.01" class="w-full border p-2 rounded" required></div>
                    <div><label class="text-xs font-bold text-gray-600">Vencimento</label><input id="r-date" type="date" class="w-full border p-2 rounded" required></div>
                </div>
                <div><label class="text-xs font-bold text-gray-600">Forma de Pagamento</label>
                <select id="r-pay" class="w-full border p-2 rounded bg-white">
                    <option value="pix">Pix</option><option value="credit">Cartão Crédito</option><option value="debit">Cartão Débito</option><option value="cash">Dinheiro</option><option value="convenio">Convênio</option>
                </select></div>
                <button class="bg-indigo-600 text-white p-2 rounded font-bold mt-2">Salvar e Adicionar Materiais</button>
            </form>`;
        openModal("Novo Serviço", html);
        
        document.getElementById('rec-form').onsubmit = function(e) {
            e.preventDefault();
            var pid = document.getElementById('r-pat').value;
            var p = allPatients.find(function(x){ return x.id === pid; });
            
            var newRef = db.ref(getFinancePath(currentUser.uid, 'receivable')).push();
            newRef.set({
                patientId: pid, patientName: p.name,
                description: document.getElementById('r-desc').value,
                amount: parseFloat(document.getElementById('r-val').value),
                dueDate: document.getElementById('r-date').value,
                paymentMethod: document.getElementById('r-pay').value,
                status: 'Aberto', registeredAt: new Date().toISOString()
            }).then(function() {
                closeModal();
                // AUTO-OPEN: Já abre a gestão de materiais
                setTimeout(function() { window.manageMaterials(newRef.key); }, 300);
            });
        };
    };

    window.openExpModal = function() {
        var html = `
            <form id="exp-form" class="grid gap-3">
                <div><label class="text-xs font-bold text-gray-600">Fornecedor</label><input id="e-sup" class="w-full border p-2 rounded" required></div>
                <div><label class="text-xs font-bold text-gray-600">Descrição</label><input id="e-desc" class="w-full border p-2 rounded" required></div>
                <div class="grid grid-cols-2 gap-2">
                    <div><label class="text-xs font-bold text-gray-600">Valor (R$)</label><input id="e-val" type="number" step="0.01" class="w-full border p-2 rounded" required></div>
                    <div><label class="text-xs font-bold text-gray-600">Nota Fiscal (Ref)</label><input id="e-ref" class="w-full border p-2 rounded"></div>
                </div>
                <div><label class="text-xs font-bold text-gray-600">Pagamento</label>
                <select id="e-pay" class="w-full border p-2 rounded bg-white">
                    <option value="pix">Pix</option><option value="transfer">Transferência</option><option value="boleto">Boleto</option><option value="credit">Cartão Crédito</option>
                </select></div>
                <button class="bg-red-600 text-white p-2 rounded font-bold mt-2">Salvar e Lançar Itens</button>
            </form>`;
        openModal("Nova Despesa", html);
        
        document.getElementById('exp-form').onsubmit = function(e) {
            e.preventDefault();
            var newRef = db.ref(getFinancePath(currentUser.uid, 'expenses')).push();
            newRef.set({
                supplier: document.getElementById('e-sup').value,
                description: document.getElementById('e-desc').value,
                amount: parseFloat(document.getElementById('e-val').value),
                ref: document.getElementById('e-ref').value,
                paymentMethod: document.getElementById('e-pay').value,
                status: 'Aberto', registeredAt: new Date().toISOString()
            }).then(function() {
                closeModal();
                setTimeout(function() { window.managePurchaseItems(newRef.key); }, 300);
            });
        };
    };
    
    window.openStockModal = function() {
        var html = `<form id="st-form" class="grid gap-2"><input id="s-name" placeholder="Nome do Material" class="border p-2" required><input id="s-qty" type="number" placeholder="Qtd Inicial" class="border p-2" required><input id="s-unit" placeholder="Unidade (ex: cx, un)" class="border p-2" required><button class="bg-green-600 text-white p-2 rounded">Salvar</button></form>`;
        openModal("Novo Material", html);
        document.getElementById('st-form').onsubmit = function(e) {
            e.preventDefault();
            db.ref(getStockPath(currentUser.uid)).push({
                name: document.getElementById('s-name').value,
                quantity: parseFloat(document.getElementById('s-qty').value),
                unit: document.getElementById('s-unit').value,
                cost: 0, supplier: 'Cadastro Manual'
            });
            closeModal();
        };
    };

    // --- GESTÃO DE ITENS (CORREÇÃO DA TELA PRETA) ---
    
    // BAIXA (Receita)
    window.manageMaterials = function(recId) {
        // Popula o select com os itens do cache (stockItems)
        var opts = stockItems.map(function(i){ return `<option value="${i.id}">${i.name} (${i.quantity} ${i.unit})</option>`; }).join('');
        
        var html = `
            <div class="bg-yellow-50 p-3 rounded text-sm mb-4 border-l-4 border-yellow-500 text-yellow-900">
                <i class='bx bx-info-circle'></i> Registre o que foi gasto. O estoque será atualizado.
            </div>
            <div id="used-list" class="mb-4 text-sm border border-gray-200 rounded p-2 bg-gray-50 min-h-[50px]">Carregando...</div>
            <div class="flex gap-2 items-end">
                <div class="flex-grow"><label class="text-xs font-bold text-gray-500">Material</label><select id="m-sel" class="w-full border p-2 rounded bg-white">${opts}</select></div>
                <div class="w-20"><label class="text-xs font-bold text-gray-500">Qtd</label><input id="m-q" type="number" class="w-full border p-2 rounded"></div>
                <button id="m-add" class="bg-red-500 text-white px-4 py-2 rounded font-bold h-[42px]">Baixar</button>
            </div>
        `;
        openModal("Materiais Gastos", html);
        
        var ref = db.ref(getAdminPath(currentUser.uid, `finance/receivable/${recId}/materials`));
        
        ref.on('value', function(s) {
            var d = document.getElementById('used-list');
            if(d) {
                d.innerHTML = '';
                if(s.exists()) s.forEach(function(x){ d.innerHTML += `<div class="flex justify-between border-b py-1"><span>${x.val().name}</span> <b class="text-red-600">-${x.val().quantityUsed} ${x.val().unit}</b></div>`; });
                else d.innerHTML = '<span class="text-gray-400 italic">Nada registrado.</span>';
            }
        });

        document.getElementById('m-add').onclick = async function() {
            var id = document.getElementById('m-sel').value; var q = parseFloat(document.getElementById('m-q').value);
            var item = stockItems.find(function(x){ return x.id === id; });
            if(item && q > 0) {
                await ref.push({ name: item.name, quantityUsed: q, unit: item.unit });
                await db.ref(getStockPath(currentUser.uid) + '/' + id).update({ quantity: item.quantity - q });
                document.getElementById('m-q').value = '';
            }
        };
    };

    // ENTRADA (Despesa)
    window.managePurchaseItems = function(expId) {
        var html = `
            <div class="bg-green-50 p-3 rounded text-sm mb-4 border-l-4 border-green-500 text-green-900">
                <i class='bx bx-cart-alt'></i> Adicione os itens da Nota. Eles entrarão no estoque.
            </div>
            <div id="pur-list" class="mb-4 text-sm border border-gray-200 rounded p-2 bg-gray-50 min-h-[50px]">Carregando...</div>
            <div class="grid grid-cols-4 gap-2 items-end">
                <div class="col-span-2"><label class="text-xs font-bold">Produto</label><input id="p-n" class="w-full border p-2 rounded"></div>
                <div><label class="text-xs font-bold">Qtd</label><input id="p-q" type="number" class="w-full border p-2 rounded"></div>
                <div><label class="text-xs font-bold">Un</label><input id="p-u" class="w-full border p-2 rounded"></div>
                <div class="col-span-4"><button id="p-ok" class="w-full bg-green-600 text-white py-2 rounded font-bold mt-1">Confirmar Entrada</button></div>
            </div>
        `;
        openModal("Itens da Nota Fiscal", html);
        
        var ref = db.ref(getAdminPath(currentUser.uid, `finance/expenses/${expId}/purchasedItems`));
        ref.on('value', function(s) {
            var d = document.getElementById('pur-list');
            if(d) {
                d.innerHTML = '';
                if(s.exists()) s.forEach(function(x){ d.innerHTML += `<div class="flex justify-between border-b py-1"><span>${x.val().name}</span> <b class="text-green-600">+${x.val().quantityPurchased} ${x.val().unit}</b></div>`; });
                else d.innerHTML = '<span class="text-gray-400 italic">Nada lançado.</span>';
            }
        });

        document.getElementById('p-ok').onclick = async function() {
            var n = document.getElementById('p-n').value; var q = parseFloat(document.getElementById('p-q').value); var u = document.getElementById('p-u').value;
            if(n && q > 0) {
                await ref.push({ name: n, quantityPurchased: q, unit: u });
                var exist = stockItems.find(function(x){ return x.name.toLowerCase() === n.toLowerCase(); });
                if(exist) await db.ref(getStockPath(currentUser.uid) + '/' + exist.id).update({ quantity: parseFloat(exist.quantity) + q });
                else await db.ref(getStockPath(currentUser.uid)).push({ name: n, quantity: q, unit: u, cost: 0 });
                document.getElementById('p-n').value = ''; document.getElementById('p-q').value = '';
            }
        };
    };

    // --- UTILS DE MODAL ---
    function openModal(title, html, maxWidth) {
        var m = document.getElementById('app-modal');
        m.querySelector('.modal-content').className = 'modal-content w-full ' + (maxWidth || 'max-w-md');
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
