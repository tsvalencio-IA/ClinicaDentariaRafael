// ==================================================================
// MÓDULO PACIENTES: Prontuário, Chat e IA (Versão Mobile + Visão)
// ==================================================================
(function() {
    const App = window.DentistaApp;
    let selectedFile = null;
    let currentChatRef = null;

    // --- LISTA DE PACIENTES ---
    window.renderPatientManager = function() {
        const container = document.getElementById('main-content');
        container.innerHTML = `
            <div class="flex flex-col h-[calc(100vh-80px)] md:h-[calc(100vh-60px)]">
                <div class="bg-white p-4 shadow-sm border-b flex justify-between items-center shrink-0">
                    <h2 class="text-xl font-bold text-indigo-800 flex items-center"><i class='bx bxs-group mr-2'></i> Pacientes</h2>
                    <button onclick="openPatientModal()" class="bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm font-bold shadow hover:bg-indigo-700 flex items-center">
                        <i class='bx bx-plus text-lg mr-1'></i> <span class="hidden md:inline">Novo</span>
                    </button>
                </div>
                
                <div class="flex-grow overflow-y-auto p-2 md:p-4 space-y-3">
                    <div id="pat-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"></div>
                    
                    <footer class="text-center py-6 text-xs text-gray-400 mt-8 col-span-full">
                        Desenvolvido com 🤖 por <strong>thIAguinho Soluções</strong>
                    </footer>
                </div>
            </div>`;
        
        const list = document.getElementById('pat-list');
        if(!App.data.patients || App.data.patients.length === 0) {
            list.innerHTML = '<p class="text-gray-400 text-center col-span-full mt-10">Nenhum paciente cadastrado.</p>';
        } else {
            App.data.patients.forEach(p => {
                list.innerHTML += `
                    <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-md transition">
                        <div class="flex justify-between items-start mb-2">
                            <div>
                                <div class="font-bold text-gray-800 text-lg leading-tight">${p.name}</div>
                                <span class="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide border border-indigo-100">${p.treatmentType}</span>
                            </div>
                            <button onclick="openJournal('${p.id}')" class="bg-indigo-600 text-white p-2 rounded-full shadow hover:bg-indigo-700" title="Abrir Prontuário"><i class='bx bx-folder-open'></i></button>
                        </div>
                        <div class="text-gray-500 text-sm space-y-1 mb-3">
                            <div class="flex items-center gap-2"><i class='bx bx-phone text-gray-400'></i> ${p.phone || '-'}</div>
                            <div class="flex items-center gap-2 truncate"><i class='bx bx-envelope text-gray-400'></i> ${p.email || '-'}</div>
                        </div>
                        <div class="pt-3 border-t flex justify-end gap-2">
                            <button onclick="openPatientModal('${p.id}')" class="text-blue-500 hover:bg-blue-50 p-1 rounded"><i class='bx bx-edit text-xl'></i></button>
                            <button onclick="delPat('${p.id}')" class="text-red-400 hover:bg-red-50 p-1 rounded"><i class='bx bx-trash text-xl'></i></button>
                        </div>
                    </div>`;
            });
        }
    };

    // --- CRUD PACIENTE ---
    window.openPatientModal = function(pid) {
        const p = pid ? App.data.patients.find(x => x.id === pid) : {};
        const isEdit = !!pid;
        const html = `
            <form id="pat-form" class="grid gap-4 text-sm">
                <input id="p-id" type="hidden" value="${pid||''}">
                <div><label class="font-bold text-gray-700">Nome Completo</label><input id="p-n" class="w-full border p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" value="${p.name||''}" required></div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><label class="font-bold text-gray-700">Email</label><input id="p-e" type="email" class="w-full border p-3 rounded-lg" value="${p.email||''}"></div>
                    <div><label class="font-bold text-gray-700">Telefone</label><input id="p-p" class="w-full border p-3 rounded-lg" value="${p.phone||''}"></div>
                </div>
                <div>
                    <label class="font-bold text-gray-700">Tratamento</label>
                    <select id="p-t" class="w-full border p-3 rounded-lg bg-white">
                        <option>Geral</option><option>Ortodontia</option><option>Implante</option><option>Estética</option><option>Harmonização</option>
                    </select>
                </div>
                <div><label class="font-bold text-gray-700">Meta Clínica</label><textarea id="p-g" class="w-full border p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" rows="3">${p.treatmentGoal||''}</textarea></div>
                <button class="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 shadow-md transition transform active:scale-95">${isEdit?'Salvar Alterações':'Cadastrar'}</button>
            </form>`;
        App.utils.openModal(isEdit?"Editar Paciente":"Novo Paciente", html);
        
        if(isEdit && p.treatmentType) setTimeout(() => document.getElementById('p-t').value = p.treatmentType, 50);

        document.getElementById('pat-form').onsubmit = (e) => {
            e.preventDefault();
            const data = {
                name: document.getElementById('p-n').value, email: document.getElementById('p-e').value,
                phone: document.getElementById('p-p').value, treatmentType: document.getElementById('p-t').value,
                treatmentGoal: document.getElementById('p-g').value
            };
            const id = document.getElementById('p-id').value;
            if(id) App.db.ref(App.utils.getAdminPath(App.currentUser.uid, `patients/${id}`)).update(data);
            else { data.createdAt = new Date().toISOString(); App.db.ref(App.utils.getAdminPath(App.currentUser.uid, 'patients')).push(data); }
            App.utils.closeModal();
        };
    };

    window.delPat = (id) => { if(confirm("Tem certeza? Isso apagará todo o histórico financeiro e clínico.")) App.db.ref(App.utils.getAdminPath(App.currentUser.uid, `patients/${id}`)).remove(); };

    // --- PRONTUÁRIO DIGITAL ---
    window.openJournal = function(pid) {
        if(currentChatRef) currentChatRef.off();
        const p = App.data.patients.find(x => x.id === pid);
        
        const html = `
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center bg-indigo-50 p-4 rounded-lg mb-4 border border-indigo-100">
                <div>
                    <h3 class="font-bold text-xl text-indigo-900">${p.name}</h3>
                    <div class="text-xs text-indigo-600 mt-1 flex gap-2">
                        <span class="bg-white px-2 rounded border border-indigo-200">${p.treatmentType}</span>
                        <span>${p.phone || ''}</span>
                    </div>
                </div>
                <div class="mt-2 md:mt-0 text-right w-full md:w-auto">
                    <div class="text-[10px] text-gray-500 uppercase font-bold">Meta Clínica</div>
                    <div class="text-xs text-gray-700 italic max-w-xs ml-auto">${p.treatmentGoal || 'Não definida'}</div>
                </div>
            </div>

            <div class="flex flex-col md:flex-row gap-4 h-[70vh] md:h-[500px] overflow-hidden">
                
                <div class="flex-grow flex flex-col border rounded-xl bg-white shadow-sm overflow-hidden relative h-2/3 md:h-full">
                    <div class="bg-gray-50 p-2 border-b text-center font-bold text-gray-600 text-xs uppercase tracking-widest">Evolução Clínica</div>
                    
                    <div id="chat-box" class="flex-grow overflow-y-auto p-4 space-y-3 bg-slate-50">
                        <div class="flex justify-center"><div class="loader-spinner border-t-indigo-500 w-6 h-6"></div></div>
                    </div>

                    <div id="file-prev" class="hidden px-4 py-2 bg-indigo-50 border-t border-indigo-100 flex justify-between items-center">
                        <span class="text-xs text-indigo-700 font-medium flex items-center"><i class='bx bx-paperclip mr-1'></i> Arquivo pronto</span>
                        <button onclick="clearFile()" class="text-red-500"><i class='bx bx-x'></i></button>
                    </div>

                    <div class="p-2 border-t bg-white flex flex-wrap md:flex-nowrap items-center gap-2">
                        <div class="flex gap-1 shrink-0">
                            <button onclick="document.getElementById('c-file').click()" class="text-gray-400 hover:text-indigo-600 p-2 rounded-full hover:bg-gray-100 transition"><i class='bx bx-camera text-xl'></i></button>
                            <input id="c-file" type="file" class="hidden" accept="image/*" onchange="window.selFile(this)">
                        </div>
                        
                        <input id="c-msg" class="w-full md:flex-grow order-last md:order-none bg-gray-100 border-0 rounded-full px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition" placeholder="Evolução...">
                        
                        <div class="flex gap-2 shrink-0">
                             <button onclick="sendMsg('${pid}')" class="bg-indigo-600 text-white rounded-full p-2.5 shadow-md hover:bg-indigo-700 transition flex items-center justify-center">
                                <i class='bx bxs-send'></i>
                            </button>
                            
                            <button onclick="callAI('${pid}')" class="bg-purple-600 text-white rounded-full p-2.5 shadow-md hover:bg-purple-700 transition flex items-center justify-center" title="Gerar Parecer IA">
                                <i class='bx bxs-magic-wand'></i>
                            </button>
                        </div>
                    </div>
                </div>

                <div class="flex flex-col w-full md:w-1/3 border rounded-xl bg-white shadow-sm overflow-hidden h-1/3 md:h-full min-w-[300px]">
                    <div class="bg-gray-50 p-2 border-b text-center font-bold text-gray-600 text-xs uppercase tracking-widest">Financeiro Recente</div>
                    <div id="p-fin-hist" class="flex-grow overflow-y-auto p-2 space-y-2">Carregando...</div>
                </div>
            </div>`;
        
        App.utils.openModal("Prontuário Digital", html, "max-w-6xl");

        // Carrega Financeiro
        const finDiv = document.getElementById('p-fin-hist');
        if(finDiv) {
            const recs = App.data.receivables.filter(r => r.patientId === pid).sort((a,b) => new Date(b.dueDate) - new Date(a.dueDate));
            finDiv.innerHTML = recs.length ? recs.map(r => `
                <div class="p-2 border rounded-lg bg-white text-xs hover:shadow-sm transition">
                    <div class="flex justify-between font-bold text-gray-700 mb-1">
                        <span>${r.description.substring(0,20)}...</span>
                        <span class="${r.status==='Recebido'?'text-green-600':'text-yellow-600'}">${r.status}</span>
                    </div>
                    <div class="flex justify-between text-gray-400">
                        <span>${App.utils.formatDate(r.dueDate)}</span>
                        <span>${App.utils.formatCurrency(r.amount)}</span>
                    </div>
                </div>`).join('') : '<p class="text-center text-gray-400 text-xs mt-4">Sem histórico.</p>';
        }

        // Carrega Chat
        currentChatRef = App.db.ref(`artifacts/${window.AppConfig.APP_ID}/patients/${pid}/journal`);
        currentChatRef.limitToLast(30).on('value', s => {
            const box = document.getElementById('chat-box');
            if(!box) return;
            box.innerHTML = '';
            if(s.exists()) {
                s.forEach(c => {
                    const m = c.val();
                    const isMe = m.author === 'Dentista';
                    const isInternal = m.author === 'Nota Interna';
                    
                    let bgClass = isMe ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white border text-gray-800 rounded-bl-none';
                    let label = m.author;

                    if(isInternal) {
                        bgClass = 'bg-yellow-50 border border-yellow-200 text-gray-800 italic rounded-2xl';
                        label = '🔒 Nota Interna';
                    }

                    const img = m.media ? `<br><a href="${m.media.url}" target="_blank"><img src="${m.media.url}" class="h-32 rounded-lg mt-2 border border-black/10"></a>` : '';
                    
                    box.innerHTML += `
                    <div class="flex w-full ${isMe ? 'justify-end' : 'justify-start'}">
                        <div class="max-w-[85%] p-3 rounded-2xl text-sm shadow-sm ${bgClass}">
                            <div class="text-[9px] uppercase font-bold opacity-70 mb-1 flex justify-between items-center w-full gap-4">
                                <span>${label}</span>
                                <span>${App.utils.formatDateTime(m.timestamp).split(' ')[1]}</span>
                            </div>
                            <div class="leading-relaxed select-text cursor-text">${m.text}</div>
                            ${img}
                        </div>
                    </div>`;
                });
                box.scrollTop = box.scrollHeight;
            } else {
                box.innerHTML = '<div class="h-full flex flex-col items-center justify-center text-gray-400 text-sm opacity-50"><i class="bx bx-message-dots text-4xl mb-2"></i><p>Inicie a evolução...</p></div>';
            }
        });
    };

    window.selFile = (input) => {
        if(input.files[0]) {
            selectedFile = input.files[0];
            document.getElementById('file-prev').classList.remove('hidden');
        }
    };
    window.clearFile = () => { selectedFile = null; document.getElementById('c-file').value = ''; document.getElementById('file-prev').classList.add('hidden'); };

    window.sendMsg = async (pid) => {
        const txt = document.getElementById('c-msg').value;
        if(!txt && !selectedFile) return;
        
        const btn = document.querySelector('button[onclick*="sendMsg"]');
        const oldIcon = btn.innerHTML;
        btn.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i>'; btn.disabled = true;

        let media = null;
        if(selectedFile) {
            try { media = await window.uploadToCloudinary(selectedFile); }
            catch(e) { alert("Erro ao enviar imagem."); btn.innerHTML = oldIcon; btn.disabled = false; return; }
        }

        App.db.ref(`artifacts/${window.AppConfig.APP_ID}/patients/${pid}/journal`).push({
            text: txt || (media?"[Imagem Enviada]":""), author: 'Dentista', media, timestamp: new Date().toISOString()
        });
        
        document.getElementById('c-msg').value = '';
        window.clearFile();
        btn.innerHTML = oldIcon; btn.disabled = false;
        setTimeout(() => document.getElementById('c-msg').focus(), 100);
    };

    // --- NOVA IA COM VISÃO (MODO 2) ---
    window.callAI = async (pid) => {
        const p = App.data.patients.find(x => x.id === pid);
        const btn = document.querySelector('button[title="Gerar Parecer IA"]');
        const oldHtml = btn.innerHTML;
        
        btn.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i>';
        btn.disabled = true;

        try {
            // 1. Busca Histórico Recente (Últimas 5 msgs)
            const snaps = await App.db.ref(`artifacts/${window.AppConfig.APP_ID}/patients/${pid}/journal`).limitToLast(5).once('value');
            let hist = "";
            let lastImageUrl = null; // Vamos caçar a última imagem enviada

            if(snaps.exists()) {
                snaps.forEach(s => {
                    const m = s.val();
                    hist += `[${m.author}]: ${m.text}\n`;
                    if (m.media && m.media.url) lastImageUrl = m.media.url; // Pega a URL da imagem
                });
            }

            // 2. Busca o Cérebro
            const brainSnap = await App.db.ref(App.utils.getAdminPath(App.currentUser.uid, 'aiConfig/directives')).once('value');
            const customBrain = brainSnap.exists() ? brainSnap.val().promptDirectives : null;

            let systemPrompt = customBrain ? 
                `${customBrain}\n--- ORDEM DE COMANDO ---\nATIVE O MODO 2 (TÉCNICO). Se houver imagem anexa, faça a análise radiográfica/clínica detalhada.` : 
                "ATUE COMO: Dentista Especialista. Analise o caso.";

            // 3. Chama a IA (Passando a imagem se existir)
            const userMsg = `PACIENTE: ${p.name}, ${p.treatmentType}.\nHISTÓRICO RECENTE:\n${hist}\n${lastImageUrl ? "[O SISTEMA ANEXOU A ÚLTIMA IMAGEM DO CHAT PARA ANÁLISE]" : ""}`;
            
            const response = await window.callGeminiAPI(systemPrompt, userMsg, lastImageUrl);

            // 4. Modal
            const overlay = document.createElement('div');
            overlay.className = "fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in";
            overlay.id = "ai-overlay";
            
            overlay.innerHTML = `
                <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
                    <div class="bg-purple-600 text-white p-4 flex justify-between items-center">
                        <h3 class="font-bold flex items-center gap-2"><i class='bx bxs-brain'></i> Parecer Técnico (IA)</h3>
                        <button onclick="document.getElementById('ai-overlay').remove()" class="hover:bg-purple-700 p-1 rounded"><i class='bx bx-x text-2xl'></i></button>
                    </div>
                    <div class="p-4 overflow-y-auto bg-gray-50">
                        <textarea id="ai-result-text" class="w-full h-64 p-3 border rounded-lg text-sm text-gray-700 leading-relaxed focus:ring-2 focus:ring-purple-500 outline-none shadow-inner">${response}</textarea>
                    </div>
                    <div class="p-4 border-t bg-white flex justify-end gap-3">
                        <button onclick="confirmAI('${pid}')" class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 shadow-lg text-sm font-bold">Salvar na Ficha</button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);

            window.confirmAI = (id) => {
                const finalTxt = document.getElementById('ai-result-text').value;
                App.db.ref(`artifacts/${window.AppConfig.APP_ID}/patients/${id}/journal`).push({
                    text: finalTxt, author: 'Nota Interna', timestamp: new Date().toISOString()
                });
                document.getElementById('ai-overlay').remove();
            };

        } catch(e) { alert("Erro na IA: " + e.message); } 
        finally { btn.innerHTML = oldHtml; btn.disabled = false; }
    };

})();