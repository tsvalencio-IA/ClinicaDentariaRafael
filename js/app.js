// ==================================================================
// MÓDULO PRINCIPAL - DENTISTA INTELIGENTE (VERSÃO FINAL CORRIGIDA)
// ==================================================================
(function() {
    
    // 1. CONFIGURAÇÕES
    var config = window.AppConfig;
    var appId = config ? config.APP_ID : 'dentista-inteligente-app';
    
    // ESTADO (VAR para estabilidade máxima)
    var db, auth;
    var currentUser = null;
    var currentView = 'dashboard';
    var isLoginMode = true; 
    var selectedFile = null; 
    var currentChatRef = null;
    
    // CACHES DE DADOS
    var allPatients = []; 
    var receivables = []; 
    var stockItems = []; 
    var expenses = []; 
    
    // ==================================================================
    // 2. UTILITÁRIOS
    // ==================================================================
    
    function getAdminPath(uid, path) { return 'artifacts/' + appId + '/users/' + uid + '/' + path; }
    function getStockPath(uid) { return getAdminPath(uid, 'stock'); }
    function getFinancePath(uid, type) { return getAdminPath(uid, 'finance/' + type); }
    function getJournalPath(pid) { return 'artifacts/' + appId + '/patients/' + pid + '/journal'; }
    
    function getReceivableMaterialsPath(recId) { return getFinancePath(currentUser.uid, 'receivable') + '/' + recId + '/materials'; }
    function getExpensePurchasedItemsPath(expId) { return getFinancePath(currentUser.uid, 'expenses') + '/' + expId + '/purchasedItems'; }

    function formatCurrency(value) { return 'R$ ' + parseFloat(value || 0).toFixed(2).replace('.', ','); }

    function formatDateTime(iso) {
        if(!iso) return '-';
        var d = new Date(iso);
        return isNaN(d) ? '-' : d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
    }
    
    function formatFileName(name) {
        if (name && name.length > 20) return name.substring(0, 10) + '...' + name.substring(name.length - 7);
        return name || '';
    }
    
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

    function showNotification(message, type) { console.log('[' + (type || 'INFO') + '] ' + message); }

    // ==================================================================
    // 3. INICIALIZAÇÃO E LOGIN
    // ==================================================================
    
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
                userRef.once('value').then(function(snapshot) {
                    var profile = snapshot.val();
                    if ((profile && profile.role === 'dentist') || user.email === 'admin@ts.com') {
                        currentUser = { uid: user.uid, email: user.email };
                        if (!profile && user.email === 'admin@ts.com') {
                            userRef.set({ email: user.email, role: 'dentist', registeredAt: new Date().toISOString() });
                        }
                        loadInitialData(); 
                        showUI();
                    } else {
                        alert("Acesso restrito a dentistas."); auth.signOut();
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
        
        var totalRec = receivables.reduce(function(acc, r) { 
            return r.status === 'Recebido' ? acc + parseFloat(r.amount||0) : acc; 
        }, 0);
        document.getElementById('dash-rec').textContent = formatCurrency(totalRec);
        
        var totalExp = expenses.reduce(function(acc, e) { 
            return e.status === 'Pago' ? acc + parseFloat(e.amount||0) : acc; 
        }, 0);
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
        var btn = document.getElementById('auth-submit-btn');
        
        btn.disabled = true; btn.textContent = '...';
        
        try {
            if (isLoginMode) await auth.signInWithEmailAndPassword(em, pw);
            else {
                var cred = await auth.createUserWithEmailAndPassword(em, pw);
                await db.ref('artifacts/' + appId + '/users/' + cred.user.uid + '/profile').set({
                    email: em, role: 'dentist', registeredAt: new Date().toISOString()
                });
            }
        } catch (error) {
            alert("Erro: " + error.message);
            btn.disabled = false; btn.textContent = isLoginMode ? 'Entrar' : 'Cadastrar';
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

    // ==================================================================
    // 5. TELAS
    // ==================================================================

    // --- DASHBOARD ---
    function renderDashboard(container) {
        container.innerHTML = `
            <div class="p-8 bg-white shadow-2xl rounded-2xl border border-indigo-100">
                <h2 class="text-3xl font-bold text-indigo-800 mb-6"><i class='bx bxs-dashboard'></i> Visão Geral</h2>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div class="p-4 bg-indigo-100 rounded-lg"><p class="text-gray-600 text-sm uppercase font-bold">Pacientes</p><h3 class="text-2xl font-bold text-indigo-800" id="dash-pat">0</h3></div>
                    <div class="p-4 bg-green-100 rounded-lg"><p class="text-gray-600 text-sm uppercase font-bold">Estoque</p><h3 class="text-3xl font-bold text-green-800" id="dash-stk">0</h3></div>
                    <div class="p-4 bg-yellow-100 rounded-lg"><p class="text-gray-600 text-sm uppercase font-bold">Faturamento (Recebido)</p><h3 class="text-2xl font-bold text-yellow-800" id="dash-rec">R$ 0,00</h3></div>
                    <div class="p-4 bg-red-100 rounded-lg"><p class="text-gray-600 text-sm uppercase font-bold">Despesas (Pagas)</p><h3 class="text-2xl font-bold text-red-800" id="dash-exp">R$ 0,00</h3></div>
                </div>
                <div class="border p-4 rounded-xl bg-gray-50">
                    <h3 class="font-bold text-indigo-800 mb-2">Instruções da IA (Brain)</h3>
                    <textarea id="brain-input" class="w-full p-2 border rounded text-sm" rows="3" placeholder="Ex: Focar em implantes..."></textarea>
                    <button id="save-brain-btn" class="mt-2 bg-indigo-600 text-white px-4 py-1 rounded text-sm">Salvar Diretrizes</button>
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

    // --- PACIENTES ---
    function renderPatientManager(container) {
        container.innerHTML = `
            <div class="p-8 bg-white shadow-lg rounded-2xl">
                <div class="flex justify-between mb-6">
                    <h2 class="text-2xl font-bold text-indigo-800">Pacientes</h2>
                    <button onclick="openPatientModal()" class="bg-indigo-600 text-white px-4 py-2 rounded shadow hover:bg-indigo-700">Novo Paciente</button>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left">
                        <thead class="bg-gray-100 text-gray-600"><tr><th class="p-3">Nome</th><th class="p-3">Email/Tel</th><th class="p-3 text-right">Ações</th></tr></thead>
                        <tbody id="patient-list-body"></tbody>
                    </table>
                </div>
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
        } else {
             tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-gray-400">Nenhum paciente cadastrado.</td></tr>';
        }
    }

    function openPatientModal(pid = null) {
        var p = (typeof pid === 'string') ? allPatients.find(x => x.id === pid) : null;
        var isEdit = !!p;

        var html = `
            <form id="form-pat" class="grid grid-cols-2 gap-3 text-sm">
                <input type="hidden" id="p-id" value="${isEdit ? p.id : ''}">
                <div class="col-span-2"><label class="font-bold">Nome Completo</label><input id="p-name" class="w-full border p-2 rounded" value="${isEdit ? p.name : ''}" required></div>
                <div><label class="font-bold">Email (Login)</label><input id="p-email" type="email" class="w-full border p-2 rounded" value="${isEdit ? p.email : ''}"></div>
                <div><label class="font-bold">Telefone</label><input id="p-phone" class="w-full border p-2 rounded" value="${isEdit ? p.phone : ''}" placeholder="(00) 00000-0000"></div>
                <div><label class="font-bold">CPF</label><input id="p-cpf" class="w-full border p-2 rounded" value="${isEdit ? p.cpf : ''}"></div>
                <div><label class="font-bold">Tratamento</label>
                <select id="p-type" class="w-full border p-2 rounded">
                    <option ${isEdit && p.treatmentType==='Geral'?'selected':''}>Geral</option>
                    <option ${isEdit && p.treatmentType==='Ortodontia'?'selected':''}>Ortodontia</option>
                    <option ${isEdit && p.treatmentType==='Implante'?'selected':''}>Implante</option>
                    <option ${isEdit && p.treatmentType==='Estética'?'selected':''}>Estética</option>
                </select></div>
                <div class="col-span-2"><label class="font-bold">Endereço</label><input id="p-address" class="w-full border p-2 rounded" value="${isEdit ? p.address : ''}"></div>
                <div class="col-span-2"><label class="font-bold">Meta Clínica</label><textarea id="p-goal" class="w-full border p-2 rounded" rows="2">${isEdit ? p.treatmentGoal : ''}</textarea></div>
                <button class="col-span-2 bg-green-600 text-white py-2 rounded font-bold">Salvar Ficha</button>
            </form>`;
        openModal(isEdit ? 'Editar Paciente' : 'Novo Paciente', html, 'max-w-2xl');
        
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
            
            if(id) {
                db.ref(getAdminPath(currentUser.uid, 'patients/' + id)).update(data);
            } else {
                data.createdAt = new Date().toISOString();
                db.ref(getAdminPath(currentUser.uid, 'patients')).push(data);
            }
            closeModal();
        };
    }

    function deletePatient(id) {
        if(confirm("Excluir paciente?")) db.ref(getAdminPath(currentUser.uid, 'patients') + '/' + id).remove();
    }

    // --- PRONTUÁRIO (CHAT E FINANCEIRO) ---
    function openJournal(id) {
        if(currentChatRef) currentChatRef.off();
        
        var p = allPatients.find(function(x){ return x.id === id; });
        if(!p) return;
        
        var html = `
            <div class="bg-indigo-50 p-4 rounded-xl mb-4 text-sm flex justify-between">
                <div>
                    <h3 class="font-bold text-indigo-900 text-lg">${p.name}</h3>
                    <p class="text-indigo-700">${p.email || 'Sem email'} | ${p.phone || 'Sem telefone'}</p>
                    <p class="text-xs text-gray-500 mt-1">${p.address || 'Endereço não informado'}</p>
                </div>
                <div class="text-right">
                    <span class="bg-white px-2 py-1 rounded text-xs font-bold text-indigo-600 shadow-sm">${p.treatmentType}</span>
                    <div class="mt-2 text-xs text-gray-500"><b>Meta:</b> ${p.treatmentGoal}</div>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="border p-3 rounded-xl bg-white flex flex-col">
                    <h4 class="font-bold text-xs text-gray-500 mb-2 uppercase">Histórico Financeiro</h4>
                    <div id="journal-fin-list" class="text-sm h-80 overflow-y-auto space-y-2 pr-2">Carregando...</div>
                </div>
                
                <div class="border p-3 rounded-xl bg-white flex flex-col">
                    <h4 class="font-bold text-xs text-gray-500 mb-2 uppercase">Evolução Clínica & Chat</h4>
                    <div id="chat-area" class="bg-gray-50 p-2 h-64 overflow-y-auto flex flex-col gap-2 mb-2 rounded"></div>
                    <div class="flex gap-2 items-center bg-gray-100 p-2 rounded-xl mt-auto">
                         <input type="file" id="chat-file" class="hidden" accept="image/*">
                         <button onclick="document.getElementById('chat-file').click()" class="text-gray-500 hover:text-indigo-600 p-2"><i class='bx bx-paperclip text-xl'></i></button>
                         <input id="chat-msg" class="flex-grow bg-transparent outline-none text-sm" placeholder="Mensagem...">
                         <button onclick="sendChat('${id}')" class="bg-indigo-600 text-white p-2 rounded-lg"><i class='bx bxs-send'></i></button>
                         <button onclick="askAI('${id}')" class="bg-purple-600 text-white p-2 rounded-lg" title="Pedir ajuda à IA"><i class='bx bxs-magic-wand'></i></button>
                    </div>
                    <div id="file-preview" class="text-xs text-gray-500 mt-1 hidden pl-2"></div>
                </div>
            </div>`;
        openModal(`Prontuário`, html, 'max-w-6xl');

        document.getElementById('chat-file').onchange = function(e) {
            selectedFile = e.target.files[0];
            if(selectedFile) {
                document.getElementById('file-preview').textContent = "Anexo: " + selectedFile.name;
                document.getElementById('file-preview').classList.remove('hidden');
            }
        };

        loadPatientServiceHistory(id);

        currentChatRef = db.ref(getJournalPath(id));
        currentChatRef.limitToLast(50).on('value', function(snap) {
            var div = document.getElementById('chat-area');
            if(!div) return;
            div.innerHTML = '';
            if(snap.exists()) {
                snap.forEach(function(c) {
                    var m = c.val();
                    var isMe = m.author === 'Dentista';
                    var align = isMe ? 'self-end bg-indigo-600 text-white' : 'self-start bg-gray-100 border text-gray-800';
                    
                    var mediaHtml = '';
                    if(m.media && m.media.url) {
                        mediaHtml = `<br><a href="${m.media.url}" target="_blank"><img src="${m.media.url}" class="mt-1 rounded-lg max-h-32 border border-white/30"></a>`;
                    }

                    var el = document.createElement('div');
                    el.className = `p-2 rounded-xl text-sm max-w-[90%] shadow-sm ${align}`;
                    el.innerHTML = `
                        <div class="font-bold text-[10px] opacity-80 mb-1 uppercase">${m.author}</div>
                        <div>${m.text}</div>
                        ${mediaHtml}
                        <div class="text-[10px] text-right opacity-60 mt-1">${formatDateTime(m.timestamp).split(' ')[1]}</div>
                    `;
                    div.appendChild(el);
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
                    var matsHTML = '';
                    var matSnap = await db.ref(getReceivableMaterialsPath(key)).once('value');
                    if(matSnap.exists()) {
                        var arr = [];
                        matSnap.forEach(function(m) { arr.push(`${m.val().quantityUsed} ${m.val().unit} ${m.val().name}`); });
                        matsHTML = `<div class="text-xs text-gray-500 mt-1 bg-gray-100 p-1 rounded">🛠️ ${arr.join(', ')}</div>`;
                    }

                    div.innerHTML += `
                        <div class="border-b pb-2 last:border-0 mb-2 p-2 hover:bg-gray-50 rounded">
                            <div class="flex justify-between items-center">
                                <span class="font-bold text-gray-700">${item.description}</span>
                                <span class="font-bold ${item.status === 'Recebido' ? 'text-green-600' : 'text-yellow-600'} text-xs">${item.status}</span>
                            </div>
                            <div class="text-xs text-gray-400 flex justify-between mt-1">
                                <span>${formatDateTime(item.dueDate).split(' ')[0]}</span>
                                <span>${formatCurrency(item.amount)}</span>
                            </div>
                            ${matsHTML}
                        </div>`;
                }
            } else {
                div.innerHTML = '<i class="text-gray-400 text-xs">Sem procedimentos registrados.</i>';
            }
        });
    }

    window.sendChat = async function(pid, author, txt) {
        var input = document.getElementById('chat-msg');
        var msgText = txt || (input ? input.value : "");
        
        if(!msgText && !selectedFile) return;
        
        var btn = document.querySelector('button[onclick*="sendChat"]');
        if(btn) btn.disabled = true;

        var mediaData = null;
        if(selectedFile && window.uploadToCloudinary) {
            try { mediaData = await window.uploadToCloudinary(selectedFile); } catch(e){ alert("Erro upload"); if(btn) btn.disabled = false; return; }
        }
        
        var authName = author || 'Dentista';

        db.ref(getJournalPath(pid)).push({
            text: msgText || (mediaData ? "Anexo" : ""),
            author: authName,
            media: mediaData,
            timestamp: new Date().toISOString()
        });

        if(input) input.value = '';
        if(document.getElementById('chat-file')) document.getElementById('chat-file').value = '';
        if(document.getElementById('file-preview')) document.getElementById('file-preview').classList.add('hidden');
        selectedFile = null;
        if(btn) btn.disabled = false;
    };

    window.askAI = async function(pid) {
        var p = allPatients.find(x => x.id === pid);
        var btn = document.querySelector('button[title="Pedir ajuda à IA"]');
        var originalIcon = btn ? btn.innerHTML : '🤖';
        
        if(btn) {
            btn.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i>';
            btn.disabled = true;
        }

        try {
            var snaps = await db.ref(getJournalPath(pid)).limitToLast(5).once('value');
            var hist = "";
            snaps.forEach(s => hist += `${s.val().author}: ${s.val().text}\n`);

            var prompt = `Paciente: ${p.name}. Histórico Recente:\n${hist}\n\nComo dentista sênior, qual a sugestão clínica ou resposta para o paciente?`;
            var resp = await window.callGeminiAPI(prompt, "Analise.");
            
            window.sendChat(pid, 'IA (Auto)', resp);
            
        } catch (e) {
            console.error(e);
            alert("Erro IA: " + e.message);
        } finally {
            if(btn) {
                btn.innerHTML = originalIcon;
                btn.disabled = false;
            }
        }
    };

    // ==================================================================
    // 7. FINANCEIRO E ESTOQUE
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
        
        window.deleteTx = function(type, id) { if(confirm("Excluir registro?")) db.ref(getFinancePath(currentUser.uid, type) + '/' + id).remove(); };
        window.deleteStock = function(id) { if(confirm("Remover item?")) db.ref(getStockPath(currentUser.uid) + '/' + id).remove(); };
        
        window.settleTx = function(type, id) {
            if(!confirm("Confirmar baixa?")) return;
            var updates = { status: type === 'receivable' ? 'Recebido' : 'Pago' };
            if(type === 'receivable') updates.receivedDate = new Date().toISOString();
            else updates.paidDate = new Date().toISOString();
            db.ref(getFinancePath(currentUser.uid, type) + '/' + id).update(updates);
        };
        renderStockView(); 
    }

    function renderStockView() {
        var div = document.getElementById('fin-content-area');
        div.innerHTML = `<div class="flex justify-between mb-3"><h3 class="font-bold">Inventário</h3><button onclick="openStockModal()" class="bg-green-600 text-white px-3 py-1 rounded text-sm">+ Item Manual</button></div><div id="stock-view" class="overflow-x-auto"><table class="w-full text-sm text-left"><thead class="bg-gray-50 text-gray-600"><tr><th class="p-2">Item</th><th class="p-2">Qtd</th><th class="p-2">Custo</th><th class="p-2">Ação</th></tr></thead><tbody id="stock-table-body"></tbody></table></div>`;
        var tb = document.getElementById('stock-table-body');
        if(stockItems.length > 0) {
            stockItems.forEach(function(i) {
                tb.innerHTML += `<tr class="border-b"><td class="p-2 font-medium">${i.name}</td><td class="p-2">${i.quantity} ${i.unit}</td><td class="p-2">${formatCurrency(i.cost)}</td><td class="p-2"><button onclick="deleteStock('${i.id}')" class="text-red-400"><i class='bx bx-trash'></i></button></td></tr>`;
            });
        } else {
            tb.innerHTML = '<tr><td colspan="4" class="p-3 text-center italic">Estoque vazio.</td></tr>';
        }
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

                list.innerHTML += `
                    <div class="p-3 border rounded flex justify-between items-center bg-white hover:shadow-sm transition">
                        <div>
                            <div class="font-bold text-indigo-900">${r.patientName} ${getPaymentBadge(r.paymentMethod)}</div>
                            <div class="text-xs text-gray-500">${r.description} - Venc: ${formatDateTime(r.dueDate).split(' ')[0]}</div>
                        </div>
                        <div class="text-right flex items-center gap-2">
                            ${badge}
                            <div class="font-bold text-green-600 ml-2">${formatCurrency(r.amount)}</div>
                            <button onclick="manageMaterials('${k}')" class="text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded hover:bg-yellow-300" title="Baixa de Materiais Usados"><i class='bx bx-package'></i></button>
                            ${action}
                            <button onclick="deleteTx('receivable', '${k}')" class="text-red-400 hover:text-red-600"><i class='bx bx-trash'></i></button>
                        </div>
                    </div>`;
            });
        } else { list.innerHTML = '<p class="text-center text-gray-400">Nenhum serviço registrado.</p>'; }
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

                list.innerHTML += `
                    <div class="p-3 border rounded flex justify-between items-center bg-white hover:shadow-sm transition">
                        <div>
                            <div class="font-bold text-gray-800">${e.supplier} <span class="text-xs font-normal text-gray-500">(${e.ref || 'S/Ref'})</span></div>
                            <div class="text-xs text-gray-500">${e.description} - ${getPaymentBadge(e.paymentMethod)}</div>
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
    }

    // --- MODAIS ---
    window.openRecModal = function(preselectPid) {
        var opts = allPatients.map(p => `<option value="${p.id}" ${preselectPid === p.id ? 'selected' : ''}>${p.name}</option>`).join('');
        var html = `<form id="rec-form" class="grid gap-3 text-sm"><div><label class="font-bold">Paciente</label><select id="r-pat" class="w-full border p-2 rounded">${opts}</select></div><div><label class="font-bold">Serviço</label><input id="r-desc" class="w-full border p-2 rounded" required></div><div class="grid grid-cols-2 gap-2"><div><label class="font-bold">Valor</label><input id="r-val" type="number" step="0.01" class="w-full border p-2 rounded" required></div><div><label class="font-bold">Vencimento</label><input id="r-date" type="date" class="w-full border p-2 rounded" required></div></div><div><label class="font-bold">Pagamento</label><select id="r-pay" class="w-full border p-2 rounded"><option value="pix">Pix</option><option value="credit">Cartão Crédito</option><option value="debit">Cartão Débito</option><option value="cash">Dinheiro</option><option value="convenio">Convênio</option></select></div><button class="bg-indigo-600 text-white p-2 rounded font-bold w-full mt-2">Salvar</button></form>`;
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

    // CORREÇÃO: Usar maxW no lugar de maxWidth
    function openModal(title, html, maxW) {
        var m = document.getElementById('app-modal');
        // Usa maxW corretamente aqui
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
