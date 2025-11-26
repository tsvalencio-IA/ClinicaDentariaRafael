// ==================================================================
// MÓDULO PRINCIPAL - DENTISTA INTELIGENTE (CORREÇÃO DE CHAT MISTURADO)
// ==================================================================
(function() {
    
    var config = window.AppConfig;
    var appId = config ? config.APP_ID : 'dentista-inteligente-app';
    
    var db, auth;
    var currentUser = null;
    var currentView = 'dashboard';
    var isLoginMode = true; 
    var selectedFile = null;
    var currentChatRef = null; // Variável para guardar a referência do chat aberto
    
    // CACHES
    var allPatients = []; 
    var receivables = []; 
    var stockItems = []; 
    var expenses = []; 
    
    // --- UTILS ---
    function getAdminPath(uid, path) { return 'artifacts/' + appId + '/users/' + uid + '/' + path; }
    function getStockPath(uid) { return getAdminPath(uid, 'stock'); }
    function getFinancePath(uid, type) { return getAdminPath(uid, 'finance/' + type); }
    function getJournalPath(pid) { return 'artifacts/' + appId + '/patients/' + pid + '/journal'; }
    function getRecMatPath(recId) { return getFinancePath(currentUser.uid, 'receivable') + '/' + recId + '/materials'; }
    function getExpItemsPath(expId) { return getFinancePath(currentUser.uid, 'expenses') + '/' + expId + '/purchasedItems'; }

    function formatCurrency(value) { return 'R$ ' + parseFloat(value || 0).toFixed(2).replace('.', ','); }
    function formatDateTime(iso) {
        if(!iso) return '-';
        var d = new Date(iso);
        return isNaN(d) ? '-' : d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
    }
    function formatFileName(name) { return name.length > 20 ? name.substring(0, 10) + '...' : name || ''; }
    
    function getPaymentBadge(method) {
        var icons = {
            'pix': '<span class="text-teal-600 bg-teal-100 px-2 py-1 rounded text-xs flex items-center w-fit"><i class="bx bx-qr mr-1"></i> Pix</span>',
            'credit': '<span class="text-blue-600 bg-blue-100 px-2 py-1 rounded text-xs flex items-center w-fit"><i class="bx bx-credit-card mr-1"></i> Crédito</span>',
            'debit': '<span class="text-cyan-600 bg-cyan-100 px-2 py-1 rounded text-xs flex items-center w-fit"><i class="bx bx-credit-card-front mr-1"></i> Débito</span>',
            'cash': '<span class="text-green-600 bg-green-100 px-2 py-1 rounded text-xs flex items-center w-fit"><i class="bx bx-money mr-1"></i> Dinheiro</span>',
            'convenio': '<span class="text-purple-600 bg-purple-100 px-2 py-1 rounded text-xs flex items-center w-fit"><i class="bx bx-id-card mr-1"></i> Convênio</span>',
            'transfer': '<span class="text-gray-600 bg-gray-100 px-2 py-1 rounded text-xs flex items-center w-fit"><i class="bx bxs-bank mr-1"></i> Transf.</span>'
        };
        return icons[method] || '<span class="text-gray-500 text-xs">-</span>';
    }

    // --- CORE ---
    function initializeFirebase() {
        if (!firebase.apps.length) firebase.initializeApp(config.firebaseConfig);
        db = firebase.database();
        auth = firebase.auth();
        setupAuth();
    }

    function setupAuth() {
        auth.onAuthStateChanged(function(user) {
            if (user) {
                var userRef = db.ref('artifacts/' + appId + '/users/' + user.uid + '/profile');
                userRef.once('value').then(function(s) {
                    var p = s.val();
                    if ((p && p.role === 'dentist') || user.email === 'admin@ts.com') {
                        currentUser = { uid: user.uid, email: user.email };
                        if (!p && user.email === 'admin@ts.com') {
                            s.ref.set({ email: user.email, role: 'dentist', registeredAt: new Date().toISOString() });
                        }
                        loadInitialData(); showUI();
                    } else {
                        alert("Acesso restrito."); auth.signOut();
                    }
                });
            } else {
                currentUser = null; showLoginScreen();
            }
        });
    }
    
    function loadInitialData() {
        db.ref(getAdminPath(currentUser.uid, 'patients')).on('value', function(s) {
            allPatients = [];
            if(s.exists()) s.forEach(function(c) { var p = c.val(); p.id = c.key; allPatients.push(p); });
            updateKPIs();
            if(currentView === 'patients') renderPatientManager(document.getElementById('main-content'));
        });
        db.ref(getStockPath(currentUser.uid)).on('value', function(s) {
            stockItems = [];
            if(s.exists()) s.forEach(function(c) { var i = c.val(); i.id = c.key; stockItems.push(i); });
            updateKPIs();
            if(currentView === 'financials' && document.getElementById('stock-view')) renderStockView();
        });
        db.ref(getFinancePath(currentUser.uid, 'receivable')).on('value', function(s) {
            receivables = [];
            if(s.exists()) s.forEach(function(c) { var r = c.val(); r.id = c.key; receivables.push(r); });
            updateKPIs();
            if(currentView === 'financials' && document.getElementById('receivables-view')) renderReceivablesView();
        });
        db.ref(getFinancePath(currentUser.uid, 'expenses')).on('value', function(s) {
            expenses = [];
            if(s.exists()) s.forEach(function(c) { var e = c.val(); e.id = c.key; expenses.push(e); });
            updateKPIs();
            if(currentView === 'financials' && document.getElementById('expenses-view')) renderExpensesView();
        });
    }

    function updateKPIs() {
        if(!document.getElementById('dash-pat')) return;
        document.getElementById('dash-pat').textContent = allPatients.length;
        document.getElementById('dash-stk').textContent = stockItems.length;
        var totalRec = receivables.reduce(function(acc, r) { return r.status === 'Recebido' ? acc + parseFloat(r.amount||0) : acc; }, 0);
        document.getElementById('dash-rec').textContent = formatCurrency(totalRec);
        var totalExp = expenses.reduce(function(acc, e) { return e.status === 'Pago' ? acc + parseFloat(e.amount||0) : acc; }, 0);
        document.getElementById('dash-exp').textContent = formatCurrency(totalExp);
    }
    
    function showLoginScreen() {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('app-container').classList.add('hidden');
        var form = document.getElementById('auth-form');
        var newForm = form.cloneNode(true);
        form.parentNode.replaceChild(newForm, form);
        newForm.addEventListener('submit', handleAuth);
        var toggle = document.getElementById('toggle-auth-mode');
        var newToggle = toggle.cloneNode(true);
        toggle.parentNode.replaceChild(newToggle, toggle);
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

    async function handleAuth(e) {
        e.preventDefault();
        var em = document.getElementById('auth-email').value;
        var pw = document.getElementById('auth-password').value;
        try {
            if (isLoginMode) await auth.signInWithEmailAndPassword(em, pw);
            else {
                var cred = await auth.createUserWithEmailAndPassword(em, pw);
                await db.ref('artifacts/' + appId + '/users/' + cred.user.uid + '/profile').set({
                    email: em, role: 'dentist', registeredAt: new Date().toISOString()
                });
            }
        } catch (error) { alert("Erro: " + error.message); }
    }

    // --- NAV ---
    function navigateTo(view) {
        if(!currentUser) return;
        currentView = view;
        var content = document.getElementById('main-content');
        content.innerHTML = '';
        if (view === 'dashboard') renderDashboard(content);
        else if (view === 'patients') renderPatientManager(content);
        else if (view === 'financials') renderFinancialManager(content);
        document.querySelectorAll('#nav-menu button').forEach(function(btn) {
            var active = btn.dataset.view === view;
            btn.className = active ? 'flex items-center p-3 rounded-xl w-full text-left bg-indigo-600 text-white shadow-lg' : 'flex items-center p-3 rounded-xl w-full text-left text-indigo-200 hover:bg-indigo-700 hover:text-white';
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

    // --- TELAS ---
    function renderDashboard(container) {
        container.innerHTML = `
            <div class="p-8 bg-white shadow-2xl rounded-2xl border border-indigo-100">
                <h2 class="text-3xl font-bold text-indigo-800 mb-6"><i class='bx bxs-dashboard'></i> Visão Geral</h2>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div class="p-4 bg-indigo-100 rounded-lg"><p class="text-gray-600 text-sm uppercase font-bold">Pacientes</p><h3 class="text-2xl font-bold text-indigo-800" id="dash-pat">0</h3></div>
                    <div class="p-4 bg-green-100 rounded-lg"><p class="text-gray-600 text-sm uppercase font-bold">Estoque</p><h3 class="text-3xl font-bold text-green-800" id="dash-stk">0</h3></div>
                    <div class="p-4 bg-yellow-100 rounded-lg"><p class="text-gray-600 text-sm uppercase font-bold">Recebido</p><h3 class="text-2xl font-bold text-yellow-800" id="dash-rec">R$ 0,00</h3></div>
                    <div class="p-4 bg-red-100 rounded-lg"><p class="text-gray-600 text-sm uppercase font-bold">Pago</p><h3 class="text-2xl font-bold text-red-800" id="dash-exp">R$ 0,00</h3></div>
                </div>
                <div class="border p-4 rounded-xl bg-gray-50">
                    <h3 class="font-bold text-indigo-800 mb-2">Instruções da IA</h3>
                    <textarea id="brain-input" class="w-full p-2 border rounded text-sm" rows="3"></textarea>
                    <button id="save-brain-btn" class="mt-2 bg-indigo-600 text-white px-4 py-1 rounded text-sm">Salvar</button>
                </div>
            </div>`;
        updateKPIs();
        var brainRef = db.ref(getAdminPath(currentUser.uid, 'aiConfig/directives'));
        brainRef.once('value', function(s) { if(s.exists()) document.getElementById('brain-input').value = s.val().promptDirectives; });
        document.getElementById('save-brain-btn').onclick = function() {
            brainRef.update({ promptDirectives: document.getElementById('brain-input').value });
            alert("IA Atualizada!");
        };
    }

    function renderPatientManager(container) {
        container.innerHTML = `
            <div class="p-8 bg-white shadow-lg rounded-2xl">
                <div class="flex justify-between mb-6">
                    <h2 class="text-2xl font-bold text-indigo-800">Pacientes</h2>
                    <button onclick="openPatientModal()" class="bg-indigo-600 text-white px-4 py-2 rounded shadow hover:bg-indigo-700">Novo Paciente</button>
                </div>
                <div class="overflow-x-auto"><table class="w-full text-left"><thead class="bg-gray-100 text-gray-600"><tr><th class="p-3">Nome</th><th class="p-3">Email/Tel</th><th class="p-3 text-right">Ações</th></tr></thead><tbody id="patient-list-body"></tbody></table></div>
            </div>`;
        
        window.openPatientModal = openPatientModal;
        window.deletePatient = deletePatient;
        window.openJournal = openJournal;
        window.openRecModal = openRecModal;
        window.editPatient = openPatientModal;

        var tbody = document.getElementById('patient-list-body');
        if(allPatients.length > 0) {
            allPatients.forEach(function(p) {
                tbody.innerHTML += `
                    <tr class="border-b hover:bg-gray-50">
                        <td class="p-3 font-medium">${p.name}<br><span class="text-xs text-gray-400">${p.treatmentType}</span></td>
                        <td class="p-3 text-sm">${p.email || '-'}<br>${p.phone || '-'}</td>
                        <td class="p-3 text-right flex justify-end gap-2">
                            <button onclick="openRecModal('${p.id}')" class="text-green-600 hover:bg-green-100 p-2 rounded" title="Cobrar"><i class='bx bx-money text-xl'></i></button>
                            <button onclick="openJournal('${p.id}')" class="text-cyan-600 hover:bg-cyan-100 p-2 rounded" title="Prontuário"><i class='bx bx-file text-xl'></i></button>
                            <button onclick="editPatient('${p.id}')" class="text-blue-600 hover:bg-blue-100 p-2 rounded" title="Editar"><i class='bx bx-edit text-xl'></i></button>
                            <button onclick="deletePatient('${p.id}')" class="text-red-500 hover:bg-red-100 p-2 rounded" title="Excluir"><i class='bx bx-trash text-xl'></i></button>
                        </td>
                    </tr>`;
            });
        } else { tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-gray-400">Nenhum paciente.</td></tr>'; }
    }

    function openPatientModal(pid = null) {
        var p = (typeof pid === 'string') ? allPatients.find(x => x.id === pid) : null;
        var isEdit = !!p;
        var html = `
            <form id="form-pat" class="grid grid-cols-2 gap-3 text-sm">
                <input type="hidden" id="p-id" value="${isEdit ? p.id : ''}">
                <div class="col-span-2"><label class="font-bold">Nome</label><input id="p-name" class="w-full border p-2 rounded" value="${isEdit ? p.name : ''}" required></div>
                <div><label class="font-bold">Email</label><input id="p-email" class="w-full border p-2 rounded" value="${isEdit ? p.email : ''}"></div>
                <div><label class="font-bold">Telefone</label><input id="p-phone" class="w-full border p-2 rounded" value="${isEdit ? p.phone : ''}"></div>
                <div><label class="font-bold">CPF</label><input id="p-cpf" class="w-full border p-2 rounded" value="${isEdit ? p.cpf : ''}"></div>
                <div><label class="font-bold">Tratamento</label><select id="p-type" class="w-full border p-2 rounded"><option ${isEdit && p.treatmentType==='Geral'?'selected':''}>Geral</option><option ${isEdit && p.treatmentType==='Ortodontia'?'selected':''}>Ortodontia</option><option ${isEdit && p.treatmentType==='Implante'?'selected':''}>Implante</option></select></div>
                <div class="col-span-2"><label class="font-bold">Endereço</label><input id="p-address" class="w-full border p-2 rounded" value="${isEdit ? p.address : ''}"></div>
                <div class="col-span-2"><label class="font-bold">Meta</label><textarea id="p-goal" class="w-full border p-2 rounded" rows="2">${isEdit ? p.treatmentGoal : ''}</textarea></div>
                <button class="col-span-2 bg-green-600 text-white py-2 rounded font-bold">Salvar</button>
            </form>`;
        openModal(isEdit ? 'Editar' : 'Novo', html, 'max-w-2xl');
        document.getElementById('form-pat').onsubmit = function(e) {
            e.preventDefault();
            var data = {
                name: document.getElementById('p-name').value,
                email: document.getElementById('p-email').value,
                phone: document.getElementById('p-phone').value,
                cpf: document.getElementById('p-cpf').value,
                address: document.getElementById('p-address').value,
                treatmentType: document.getElementById('p-type').value,
                treatmentGoal: document.getElementById('p-goal').value
            };
            var id = document.getElementById('p-id').value;
            if(id) db.ref(getAdminPath(currentUser.uid, 'patients/' + id)).update(data);
            else { data.createdAt = new Date().toISOString(); db.ref(getAdminPath(currentUser.uid, 'patients')).push(data); }
            closeModal();
        };
    }

    function deletePatient(id) { if(confirm("Excluir?")) db.ref(getAdminPath(currentUser.uid, 'patients') + '/' + id).remove(); }

    // --- PRONTUÁRIO (CORRIGIDO: CHAT ISOLADO) ---
    function openJournal(id) {
        // 1. Limpa o listener anterior para não misturar conversas
        if(currentChatRef) {
            currentChatRef.off();
        }

        var p = allPatients.find(function(x){ return x.id === id; });
        if(!p) return;
        
        var html = `
            <div class="bg-indigo-50 p-4 rounded-xl mb-4 text-sm flex justify-between">
                <div><h3 class="font-bold text-indigo-900">${p.name}</h3><p>${p.email}</p></div>
                <span class="bg-white px-2 py-1 rounded text-xs font-bold text-indigo-600">${p.treatmentType}</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="border p-3 rounded-xl bg-white"><h4 class="font-bold text-xs text-gray-500 mb-2">FINANCEIRO</h4><div id="journal-fin-list" class="text-sm h-80 overflow-y-auto space-y-2 pr-2">Carregando...</div></div>
                <div class="border p-3 rounded-xl bg-white flex flex-col"><h4 class="font-bold text-xs text-gray-500 mb-2">CHAT</h4><div id="chat-area" class="bg-gray-50 p-2 h-64 overflow-y-auto flex flex-col gap-2 mb-2 rounded"></div>
                    <div class="flex gap-2 items-center bg-gray-100 p-2 rounded-xl mt-auto">
                         <input type="file" id="chat-file" class="hidden" accept="image/*">
                         <button onclick="document.getElementById('chat-file').click()" class="text-gray-500"><i class='bx bx-paperclip text-xl'></i></button>
                         <input id="chat-msg" class="flex-grow bg-transparent outline-none text-sm" placeholder="Mensagem...">
                         <button onclick="sendChat('${id}')" class="bg-indigo-600 text-white p-2 rounded-lg"><i class='bx bxs-send'></i></button>
                         <button onclick="askAI('${id}')" class="bg-purple-600 text-white p-2 rounded-lg"><i class='bx bxs-magic-wand'></i></button>
                    </div>
                    <div id="file-preview" class="text-xs text-gray-500 mt-1 hidden pl-2"></div>
                </div>
            </div>`;
        openModal("Prontuário", html, 'max-w-6xl');

        document.getElementById('chat-file').onchange = function(e) {
            selectedFile = e.target.files[0];
            if(selectedFile) { document.getElementById('file-preview').textContent = "Anexo: " + selectedFile.name; document.getElementById('file-preview').classList.remove('hidden'); }
        };

        loadPatientServiceHistory(id);

        // Carrega Chat e Salva Referência para desligar depois
        currentChatRef = db.ref(getJournalPath(id));
        currentChatRef.limitToLast(50).on('value', function(snap) {
            var div = document.getElementById('chat-area');
            if(!div) return;
            div.innerHTML = '';
            if(snap.exists()) {
                snap.forEach(function(c) {
                    var m = c.val();
                    var isMe = m.author === 'Dentista';
                    var align = isMe ? 'self-end bg-indigo-600 text-white' : 'self-start bg-gray-100 border';
                    var img = m.media ? `<br><a href="${m.media.url}" target="_blank"><img src="${m.media.url}" class="mt-1 rounded max-h-32"></a>` : '';
                    div.innerHTML += `<div class="p-2 rounded-xl text-sm max-w-[90%] shadow-sm ${align}"><div class="font-bold text-[10px] opacity-80 uppercase">${m.author}</div><div>${m.text}</div>${img}</div>`;
                });
                div.scrollTop = div.scrollHeight;
            }
        });
    }
    
    function loadPatientServiceHistory(patientId) {
        db.ref(getFinancePath(currentUser.uid, 'receivable')).orderByChild('patientId').equalTo(patientId).once('value', async function(s) {
            var div = document.getElementById('journal-fin-list');
            if(!div) return;
            div.innerHTML = '';
            if(s.exists()) {
                var data = s.val();
                for(var key in data) {
                    var item = data[key];
                    div.innerHTML += `<div class="border-b pb-2 mb-2 p-2 hover:bg-gray-50 rounded"><div class="flex justify-between"><span class="font-bold text-gray-700">${item.description}</span><span class="font-bold text-xs">${item.status}</span></div><div class="text-xs text-gray-400 flex justify-between"><span>${formatDateTime(item.dueDate).split(' ')[0]}</span><span>${formatCurrency(item.amount)}</span></div></div>`;
                }
            } else { div.innerHTML = '<i class="text-gray-400 text-xs">Vazio.</i>'; }
        });
    }

    window.sendChat = async function(pid) {
        var txt = document.getElementById('chat-msg').value;
        if(!txt && !selectedFile) return;
        var btn = document.querySelector('button[onclick*="sendChat"]');
        btn.disabled = true;
        var mediaData = null;
        if(selectedFile && window.uploadToCloudinary) {
            try { mediaData = await window.uploadToCloudinary(selectedFile); } catch(e){ alert("Erro upload"); btn.disabled = false; return; }
        }
        db.ref(getJournalPath(pid)).push({ text: txt || (mediaData?"Anexo":""), author: 'Dentista', media: mediaData, timestamp: new Date().toISOString() });
        document.getElementById('chat-msg').value = '';
        document.getElementById('chat-file').value = '';
        document.getElementById('file-preview').classList.add('hidden');
        selectedFile = null;
        btn.disabled = false;
    };

    window.askAI = async function(pid) {
        var p = allPatients.find(x => x.id === pid);
        var prompt = `Paciente: ${p.name}. Histórico: ${p.treatmentGoal}. Resuma a evolução.`;
        var resp = await window.callGeminiAPI(prompt, "Analise.");
        window.sendChat(pid, 'IA', resp);
    };

    // --- FINANCEIRO ---
    function renderFinancialManager(container) {
        container.innerHTML = `
            <div class="p-8 bg-white shadow-lg rounded-2xl">
                <h2 class="text-2xl font-bold text-indigo-800 mb-4">Financeiro & Estoque</h2>
                <div class="flex border-b mb-4 overflow-x-auto">
                    <button class="p-3 border-b-2 border-indigo-600 text-indigo-700 font-bold" onclick="renderStockView()">📦 Estoque</button>
                    <button class="p-3 text-gray-500 hover:text-indigo-600" onclick="renderReceivablesView()">💰 Receitas</button>
                    <button class="p-3 text-gray-500 hover:text-indigo-600" onclick="renderExpensesView()">💸 Despesas</button>
                </div>
                <div id="fin-content-area"></div>
            </div>`;
        
        window.renderStockView = renderStockView;
        window.renderReceivablesView = renderReceivablesView;
        window.renderExpensesView = renderExpensesView;
        
        window.deleteTx = function(type, id) { if(confirm("Excluir?")) db.ref(getFinancePath(currentUser.uid, type) + '/' + id).remove(); };
        window.deleteStock = function(id) { if(confirm("Remover?")) db.ref(getStockPath(currentUser.uid) + '/' + id).remove(); };
        window.settleTx = function(type, id) {
            if(!confirm("Baixar?")) return;
            var updates = { status: type === 'receivable' ? 'Recebido' : 'Pago' };
            if(type === 'receivable') updates.receivedDate = new Date().toISOString(); else updates.paidDate = new Date().toISOString();
            db.ref(getFinancePath(currentUser.uid, type) + '/' + id).update(updates);
        };
        renderStockView(); 
    }

    function renderStockView() {
        var div = document.getElementById('fin-content-area');
        div.innerHTML = `<div class="flex justify-between mb-3"><h3 class="font-bold">Inventário</h3><button onclick="openStockModal()" class="bg-green-600 text-white px-3 py-1 rounded text-sm">+ Item</button></div><div id="stock-view" class="overflow-x-auto"><table class="w-full text-sm text-left"><thead class="bg-gray-50 text-gray-600"><tr><th class="p-2">Item</th><th class="p-2">Qtd</th><th class="p-2">Custo</th><th class="p-2">Ação</th></tr></thead><tbody id="stock-table-body"></tbody></table></div>`;
        var tb = document.getElementById('stock-table-body');
        if(stockItems.length > 0) {
            stockItems.forEach(function(i) {
                tb.innerHTML += `<tr class="border-b"><td class="p-2 font-medium">${i.name}</td><td class="p-2">${i.quantity} ${i.unit}</td><td class="p-2">${formatCurrency(i.cost)}</td><td class="p-2"><button onclick="deleteStock('${i.id}')" class="text-red-400"><i class='bx bx-trash'></i></button></td></tr>`;
            });
        } else { tb.innerHTML = '<tr><td colspan="4" class="p-3 text-center italic">Vazio.</td></tr>'; }
    }

    function renderReceivablesView() {
        var div = document.getElementById('fin-content-area');
        div.innerHTML = `<div class="flex justify-between mb-3"><h3 class="font-bold">Serviços</h3><button onclick="openRecModal()" class="bg-indigo-600 text-white px-3 py-1 rounded text-sm">+ Novo</button></div><div id="receivables-view" class="space-y-2"></div>`;
        var list = document.getElementById('receivables-view');
        if(receivables.length > 0) {
            receivables.forEach(function(r) {
                var k = r.id;
                var isPaid = r.status === 'Recebido';
                var badge = isPaid ? `<span class="bg-green-100 text-green-800 text-xs px-2 rounded">Recebido</span>` : `<span class="bg-yellow-100 text-yellow-800 text-xs px-2 rounded">Aberto</span>`;
                var action = isPaid ? '' : `<button onclick="settleTx('receivable', '${k}')" class="text-xs bg-green-500 text-white px-2 py-1 rounded ml-2"><i class='bx bx-check'></i></button>`;
                list.innerHTML += `<div class="p-3 border rounded flex justify-between items-center bg-white hover:shadow-sm"><div><div class="font-bold text-indigo-900">${r.patientName} ${getPaymentBadge(r.paymentMethod)}</div><div class="text-xs text-gray-500">${r.description}</div></div><div class="text-right flex items-center gap-2">${badge}<div class="font-bold text-green-600 ml-2">${formatCurrency(r.amount)}</div><button onclick="manageMaterials('${k}')" class="text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded" title="Materiais"><i class='bx bx-package'></i></button>${action}<button onclick="deleteTx('receivable', '${k}')" class="text-red-400"><i class='bx bx-trash'></i></button></div></div>`;
            });
        } else { list.innerHTML = '<p class="text-center text-gray-400">Vazio.</p>'; }
    }

    function renderExpensesView() {
        var div = document.getElementById('fin-content-area');
        div.innerHTML = `<div class="flex justify-between mb-3"><h3 class="font-bold">Despesas</h3><button onclick="openExpModal()" class="bg-red-600 text-white px-3 py-1 rounded text-sm">+ Nova</button></div><div id="expenses-view" class="space-y-2"></div>`;
        var list = document.getElementById('expenses-view');
        if(expenses.length > 0) {
            expenses.forEach(function(e) {
                var k = e.id;
                var isPaid = e.status === 'Pago';
                var badge = isPaid ? `<span class="bg-green-100 text-green-800 text-xs px-2 rounded">Pago</span>` : `<span class="bg-red-100 text-red-800 text-xs px-2 rounded">Aberto</span>`;
                var action = isPaid ? '' : `<button onclick="settleTx('expenses', '${k}')" class="text-xs bg-blue-500 text-white px-2 py-1 rounded ml-2"><i class='bx bx-check'></i></button>`;
                list.innerHTML += `<div class="p-3 border rounded flex justify-between items-center bg-white hover:shadow-sm"><div><div class="font-bold text-gray-800">${e.supplier}</div><div class="text-xs text-gray-500">${e.description} - ${getPaymentBadge(e.paymentMethod)}</div></div><div class="text-right flex items-center gap-2">${badge}<div class="font-bold text-red-600 ml-2">${formatCurrency(e.amount)}</div><button onclick="managePurchaseItems('${k}')" class="text-xs bg-green-200 text-green-800 px-2 py-1 rounded" title="Itens"><i class='bx bx-cart-add'></i></button>${action}<button onclick="deleteTx('expenses', '${k}')" class="text-red-400"><i class='bx bx-trash'></i></button></div></div>`;
            });
        } else { list.innerHTML = '<p class="text-center text-gray-400">Vazio.</p>'; }
    }

    // --- MODAIS ---
    window.openRecModal = function(preselectPid) {
        var opts = allPatients.map(p => `<option value="${p.id}" ${preselectPid === p.id ? 'selected' : ''}>${p.name}</option>`).join('');
        var html = `<form id="rec-form" class="grid gap-3 text-sm"><div><label class="font-bold">Paciente</label><select id="r-pat" class="w-full border p-2 rounded">${opts}</select></div><div><label class="font-bold">Serviço</label><input id="r-desc" class="w-full border p-2 rounded" required></div><div class="grid grid-cols-2 gap-2"><div><label class="font-bold">Valor</label><input id="r-val" type="number" step="0.01" class="w-full border p-2 rounded" required></div><div><label class="font-bold">Vencimento</label><input id="r-date" type="date" class="w-full border p-2 rounded" required></div></div><div><label class="font-bold">Pagamento</label><select id="r-pay" class="w-full border p-2 rounded"><option value="pix">Pix</option><option value="credit">Cartão Crédito</option><option value="cash">Dinheiro</option></select></div><button class="bg-indigo-600 text-white p-2 rounded font-bold w-full mt-2">Salvar</button></form>`;
        openModal("Novo Serviço", html);
        document.getElementById('rec-form').onsubmit = function(e) {
            e.preventDefault();
            var pid = document.getElementById('r-pat').value;
            var p = allPatients.find(x => x.id === pid);
            var ref = db.ref(getFinancePath(currentUser.uid, 'receivable')).push();
            ref.set({ patientId: pid, patientName: p.name, description: document.getElementById('r-desc').value, amount: parseFloat(document.getElementById('r-val').value), dueDate: document.getElementById('r-date').value, paymentMethod: document.getElementById('r-pay').value, status: 'Aberto', registeredAt: new Date().toISOString() }).then(() => { closeModal(); setTimeout(() => window.manageMaterials(ref.key), 300); });
        };
    };

    window.openExpModal = function() {
        var html = `<form id="exp-form" class="grid gap-3 text-sm"><div><label class="font-bold">Fornecedor</label><input id="e-sup" class="w-full border p-2 rounded" required></div><div><label class="font-bold">Descrição</label><input id="e-desc" class="w-full border p-2 rounded" required></div><div class="grid grid-cols-2 gap-2"><div><label class="font-bold">Valor</label><input id="e-val" type="number" step="0.01" class="w-full border p-2 rounded" required></div><div><label class="font-bold">Ref</label><input id="e-ref" class="w-full border p-2 rounded"></div></div><div><label class="font-bold">Pagamento</label><select id="e-pay" class="w-full border p-2 rounded"><option value="pix">Pix</option><option value="boleto">Boleto</option></select></div><button class="bg-red-600 text-white p-2 rounded font-bold w-full mt-2">Salvar</button></form>`;
        openModal("Nova Despesa", html);
        document.getElementById('exp-form').onsubmit = function(e) {
            e.preventDefault();
            var ref = db.ref(getFinancePath(currentUser.uid, 'expenses')).push();
            ref.set({ supplier: document.getElementById('e-sup').value, description: document.getElementById('e-desc').value, amount: parseFloat(document.getElementById('e-val').value), ref: document.getElementById('e-ref').value, paymentMethod: document.getElementById('e-pay').value, status: 'Aberto', registeredAt: new Date().toISOString() }).then(() => { closeModal(); setTimeout(() => window.managePurchaseItems(ref.key), 300); });
        };
    };
    
    window.openStockModal = function() {
        var html = `<form id="st-form" class="grid gap-2"><input id="s-name" placeholder="Nome" class="border p-2" required><input id="s-qty" type="number" placeholder="Qtd" class="border p-2" required><input id="s-unit" placeholder="Un" class="border p-2" required><button class="bg-green-600 text-white p-2 rounded">Salvar</button></form>`;
        openModal("Novo Material", html);
        document.getElementById('st-form').onsubmit = function(e) {
            e.preventDefault();
            db.ref(getStockPath(currentUser.uid)).push({ name: document.getElementById('s-name').value, quantity: parseFloat(document.getElementById('s-qty').value), unit: document.getElementById('s-unit').value, cost: 0, supplier: 'Manual' });
            closeModal();
        };
    };

    window.manageMaterials = function(recId) {
        var opts = stockItems.map(i => `<option value="${i.id}">${i.name} (${i.quantity})</option>`).join('');
        var html = `<div class="text-sm mb-2">Baixa:</div><div class="flex gap-2"><select id="m-sel" class="border p-1 flex-grow text-sm">${opts}</select><input id="m-q" type="number" placeholder="Qtd" class="border w-16 text-sm"><button id="m-add" class="bg-red-500 text-white px-4 rounded">OK</button></div><div id="used-list" class="text-xs mt-2 border-t pt-2"></div>`;
        openModal("Materiais Gastos", html);
        var ref = db.ref(getAdminPath(currentUser.uid, `finance/receivable/${recId}/materials`));
        ref.on('value', s => { var d = document.getElementById('used-list'); if(d){ d.innerHTML=''; if(s.exists()) s.forEach(x => d.innerHTML += `<div>- ${x.val().quantityUsed} ${x.val().unit} ${x.val().name}</div>`); }});
        document.getElementById('m-add').onclick = async function() {
            var id = document.getElementById('m-sel').value; var q = parseFloat(document.getElementById('m-q').value);
            var item = stockItems.find(x => x.id === id);
            if(item && q > 0) {
                await ref.push({ name: item.name, quantityUsed: q, unit: item.unit });
                await db.ref(getStockPath(currentUser.uid) + '/' + id).update({ quantity: item.quantity - q });
            }
        };
    };

    window.managePurchaseItems = function(expId) {
        var html = `<div class="text-sm mb-2">Entrada:</div><div class="grid grid-cols-3 gap-1"><input id="p-n" placeholder="Item" class="col-span-2 border p-1 text-sm"><input id="p-q" type="number" placeholder="Qtd" class="border p-1 text-sm"><input id="p-u" placeholder="Un" class="border p-1 text-sm"><button id="p-ok" class="bg-green-600 text-white col-span-3 text-sm py-1 rounded">Add</button></div><div id="pur-list" class="text-xs mt-2 border-t pt-2"></div>`;
        openModal("Itens", html);
        var ref = db.ref(getAdminPath(currentUser.uid, `finance/expenses/${expId}/purchasedItems`));
        ref.on('value', s => { var d = document.getElementById('pur-list'); if(d){ d.innerHTML=''; if(s.exists()) s.forEach(x => d.innerHTML += `<div>+ ${x.val().quantityPurchased} ${x.val().unit} ${x.val().name}</div>`); }});
        document.getElementById('p-ok').onclick = async function() {
            var n = document.getElementById('p-n').value; var q = parseFloat(document.getElementById('p-q').value); var u = document.getElementById('p-u').value;
            if(n && q > 0) {
                await ref.push({ name: n, quantityPurchased: q, unit: u });
                var exist = stockItems.find(x => x.name.toLowerCase() === n.toLowerCase());
                if(exist) await db.ref(getStockPath(currentUser.uid) + '/' + exist.id).update({ quantity: parseFloat(exist.quantity) + q });
                else await db.ref(getStockPath(currentUser.uid)).push({ name: n, quantity: q, unit: u, cost: 0 });
            }
        };
    };

    function openModal(title, html, maxW) {
        var m = document.getElementById('app-modal');
        m.querySelector('.modal-content').className = 'modal-content w-full ' + (maxW || 'max-w-md');
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = html;
        m.classList.remove('hidden'); m.classList.add('flex');
    }
    
    function closeModal() {
        document.getElementById('app-modal').classList.add('hidden');
        document.getElementById('app-modal').classList.remove('flex');
    }

    document.addEventListener('DOMContentLoaded', function() {
        initializeFirebase();
        document.getElementById('close-modal').addEventListener('click', closeModal);
        document.getElementById('logout-button').addEventListener('click', function() { auth.signOut().then(() => window.location.reload()); });
    });

})();
