// ==================================================================
// MÓDULO FINANCEIRO COMPLETO (CORRIGIDO: ESCOPO GLOBAL E LISTAS)
// ==================================================================
(function() {
    const App = window.DentistaApp;

    // --- VARIÁVEIS GLOBAIS DE APOIO (Para evitar ReferenceError) ---
    window.tempRecItems = [];
    window.tempExpItems = [];

    // --- VIEW PRINCIPAL ---
    window.initFinanceView = function() {
        const container = document.getElementById('main-content');
        container.innerHTML = `
            <div class="flex flex-col h-[calc(100vh-80px)]">
                <div class="bg-white px-4 pt-4 shadow-sm border-b flex gap-6 overflow-x-auto shrink-0">
                    <button onclick="switchTab('rec')" id="tab-rec" class="pb-3 border-b-2 border-indigo-600 text-indigo-700 font-bold text-sm whitespace-nowrap transition">💰 Receitas (Serviços)</button>
                    <button onclick="switchTab('exp')" id="tab-exp" class="pb-3 border-b-2 border-transparent text-gray-500 hover:text-red-500 font-bold text-sm whitespace-nowrap transition">💸 Despesas (Compras)</button>
                    <button onclick="switchTab('stk')" id="tab-stk" class="pb-3 border-b-2 border-transparent text-gray-500 hover:text-blue-500 font-bold text-sm whitespace-nowrap transition">📦 Estoque Atual</button>
                </div>

                <div id="fin-content" class="flex-grow overflow-y-auto bg-gray-50 p-2 md:p-6"></div>
                
                <footer class="text-center py-4 text-xs text-gray-400 bg-gray-50 shrink-0">
                    Desenvolvido com 🤖 por <strong>thIAguinho Soluções</strong>
                </footer>
            </div>`;
        
        window.switchTab('rec');
    };

    window.switchTab = (tab) => {
        ['rec','exp','stk'].forEach(t => {
            const btn = document.getElementById(`tab-${t}`);
            if(t === tab) btn.className = `pb-3 border-b-2 ${t==='rec'?'border-indigo-600 text-indigo-700':t==='exp'?'border-red-500 text-red-600':'border-blue-500 text-blue-600'} font-bold text-sm whitespace-nowrap`;
            else btn.className = "pb-3 border-b-2 border-transparent text-gray-400 hover:text-gray-600 font-bold text-sm whitespace-nowrap cursor-pointer";
        });

        if(tab === 'rec') renderReceivables();
        if(tab === 'exp') renderExpenses();
        if(tab === 'stk') renderStock();
    };

    // --- FUNÇÕES AUXILIARES GLOBAIS (CORREÇÃO CRÍTICA) ---
    
    // Alterna visualização das parcelas
    window.toggleInst = (val, id) => {
        const el = document.getElementById(id);
        if(el) {
            if(['Cartão', 'Cartão Crédito', 'Boleto'].includes(val)) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        }
    };

    // Renderiza lista temporária (Genérico para Receita e Despesa)
    window.renderTempList = (type) => {
        const list = type === 'rec' ? window.tempRecItems : window.tempExpItems;
        const containerId = type === 'rec' ? 'r-stock-list' : 'e-stock-list';
        const el = document.getElementById(containerId);
        
        if(!el) return;

        if(list.length === 0) {
            el.innerHTML = '<p class="text-gray-400 italic text-center mt-4">Nenhum item adicionado.</p>';
            return;
        }

        el.innerHTML = list.map((i, idx) => `
            <div class="flex justify-between items-center bg-gray-100 p-2 rounded mb-1 text-xs">
                <span class="font-bold text-gray-700">${i.qty} ${i.unit || ''} - ${i.name}</span>
                <button type="button" onclick="removeItem('${type}', ${idx})" class="text-red-500 font-bold px-2 hover:bg-red-100 rounded">&times;</button>
            </div>`).join('');
    };

    // Adiciona Item (Receita)
    window.addRecItem = () => {
        const sel = document.getElementById('r-stock-sel');
        const qty = parseFloat(document.getElementById('r-stock-qty').value);
        if(!qty || qty <= 0) return;
        
        const opt = sel.options[sel.selectedIndex];
        window.tempRecItems.push({ id: sel.value, name: opt.dataset.name, qty: qty, unit: opt.dataset.unit });
        window.renderTempList('rec');
        document.getElementById('r-stock-qty').value = '';
    };

    // Adiciona Item (Despesa)
    window.addExpItem = () => {
        const name = document.getElementById('e-item-name').value;
        const qty = parseFloat(document.getElementById('e-item-qty').value);
        const unit = document.getElementById('e-item-unit').value || 'un';
        const cat = document.getElementById('e-item-cat').value;

        if(!name || !qty) return;
        window.tempExpItems.push({ name, qty, unit, category: cat });
        window.renderTempList('exp');
        
        document.getElementById('e-item-name').value = '';
        document.getElementById('e-item-qty').value = '';
        document.getElementById('e-item-name').focus();
    };

    // Remove Item
    window.removeItem = (type, idx) => {
        if(type === 'rec') window.tempRecItems.splice(idx, 1);
        else window.tempExpItems.splice(idx, 1);
        window.renderTempList(type);
    };

    // ==================================================================
    // 1. RECEITAS
    // ==================================================================
    function renderReceivables() {
        const div = document.getElementById('fin-content');
        div.innerHTML = `
            <div class="flex justify-between items-center mb-4">
                <p class="text-xs text-gray-500">Lançamentos de procedimentos.</p>
                <button onclick="openRecModal()" class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow hover:bg-indigo-700 flex items-center"><i class='bx bx-plus mr-1'></i> Novo Serviço</button>
            </div>
            <div id="rec-list" class="space-y-3"></div>`;
        
        const list = document.getElementById('rec-list');
        const sorted = [...App.data.receivables].sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate));
        
        if(!sorted.length) { list.innerHTML = '<p class="text-center text-gray-400 mt-10">Nenhuma receita lançada.</p>'; return; }

        sorted.forEach(r => {
            const isPaid = r.status === 'Recebido';
            let itemsHtml = '';
            if(r.itemsUsed && r.itemsUsed.length > 0) {
                itemsHtml = `<div class="mt-2 pt-2 border-t border-dashed border-gray-200 text-xs text-gray-500">
                    <span class="font-bold text-red-400">Baixa de Estoque:</span> ${r.itemsUsed.map(i => `${i.qty}x ${i.name}`).join(', ')}
                </div>`;
            }

            list.innerHTML += `
                <div class="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition">
                    <div class="flex justify-between items-start">
                        <div>
                            <div class="font-bold text-gray-800 text-base">${r.patientName}</div>
                            <div class="text-xs text-gray-500 mt-0.5">${r.description} <span class="text-indigo-500 font-medium">• ${r.paymentMethod}</span></div>
                        </div>
                        <div class="text-right">
                            <div class="font-bold text-gray-800 text-lg">${App.utils.formatCurrency(r.amount)}</div>
                            <span class="text-[10px] px-2 py-0.5 rounded uppercase font-bold ${isPaid?'bg-green-100 text-green-700':'bg-yellow-100 text-yellow-700'}">${r.status}</span>
                        </div>
                    </div>
                    ${itemsHtml}
                    <div class="mt-3 flex justify-end gap-2 border-t pt-2">
                        ${!isPaid ? `<button onclick="settleTx('receivable','${r.id}')" class="text-xs bg-green-50 text-green-600 px-3 py-1.5 rounded font-bold hover:bg-green-100">Confirmar Recebimento</button>` : ''}
                        <button onclick="delTx('finance/receivable','${r.id}')" class="text-gray-400 hover:text-red-500"><i class='bx bx-trash text-lg'></i></button>
                    </div>
                </div>`;
        });
    }

    window.openRecModal = function() {
        window.tempRecItems = []; // Reset da lista
        const patOpts = App.data.patients.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        const stockOpts = App.data.stock.map(s => `<option value="${s.id}" data-name="${s.name}" data-unit="${s.unit}">${s.name} (${s.quantity} ${s.unit})</option>`).join('');

        const html = `
            <div class="grid md:grid-cols-2 gap-6 h-full text-sm">
                <div class="space-y-3">
                    <h4 class="font-bold text-indigo-800 border-b pb-1">1. Dados do Serviço</h4>
                    <div><label class="font-bold text-gray-600">Paciente</label><select id="r-pat" class="w-full border p-2 rounded bg-gray-50">${patOpts}</select></div>
                    <div><label class="font-bold text-gray-600">Descrição</label><input id="r-desc" class="w-full border p-2 rounded" placeholder="Ex: Implante Unitário"></div>
                    <div class="grid grid-cols-2 gap-2">
                        <div><label class="font-bold text-gray-600">Valor Total (R$)</label><input id="r-val" type="number" step="0.01" class="w-full border p-2 rounded"></div>
                        <div><label class="font-bold text-gray-600">1º Vencimento</label><input id="r-date" type="date" class="w-full border p-2 rounded"></div>
                    </div>
                    <div class="grid grid-cols-2 gap-2 bg-indigo-50 p-2 rounded border border-indigo-100">
                        <div><label class="font-bold text-indigo-900">Pagamento</label><select id="r-method" class="w-full border p-2 rounded" onchange="window.toggleInst(this.value, 'rec-inst-area')"><option value="Pix">Pix</option><option value="Dinheiro">Dinheiro</option><option value="Cartão">Cartão Crédito</option><option value="Boleto">Boleto</option></select></div>
                        <div id="rec-inst-area" class="hidden">
                            <label class="font-bold text-indigo-900">Parcelas</label>
                            <select id="r-parcels" class="w-full border p-2 rounded">
                                ${Array.from({length: 24}, (_, i) => `<option value="${i+1}">${i+1}x</option>`).join('')}
                            </select>
                        </div>
                    </div>
                </div>
                <div class="bg-gray-50 p-4 rounded-lg border border-gray-200 flex flex-col">
                    <h4 class="font-bold text-blue-800 border-b pb-1 mb-2 flex justify-between items-center">
                        <span>2. Material Gasto (Baixa)</span>
                        <i class='bx bx-box'></i>
                    </h4>
                    <div class="flex gap-2 mb-2">
                        <select id="r-stock-sel" class="flex-grow border p-1 rounded text-xs">${stockOpts}</select>
                        <input id="r-stock-qty" type="number" placeholder="Qtd" class="w-16 border p-1 rounded text-xs">
                        <button type="button" onclick="window.addRecItem()" class="bg-blue-600 text-white px-2 rounded text-xs font-bold">+</button>
                    </div>
                    <div id="r-stock-list" class="flex-grow overflow-y-auto bg-white border rounded p-2 text-xs space-y-1 h-32">
                        <p class="text-gray-400 italic text-center mt-4">Nenhum item selecionado.</p>
                    </div>
                    <p class="text-[10px] text-gray-500 mt-2">* Itens listados aqui serão descontados do estoque.</p>
                </div>
            </div>
            <button onclick="saveRec()" class="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold mt-4 shadow hover:bg-indigo-700">Salvar Serviço e Baixar Estoque</button>
        `;
        App.utils.openModal("Novo Atendimento", html, "max-w-4xl");

        window.saveRec = async () => {
            const pid = document.getElementById('r-pat').value;
            const pname = document.getElementById('r-pat').options[document.getElementById('r-pat').selectedIndex].text;
            const desc = document.getElementById('r-desc').value;
            const total = parseFloat(document.getElementById('r-val').value);
            const method = document.getElementById('r-method').value;
            
            let parcels = 1;
            if(!document.getElementById('rec-inst-area').classList.contains('hidden')) {
                parcels = parseInt(document.getElementById('r-parcels').value);
            }
            const valParcela = total / parcels;
            const baseDate = new Date(document.getElementById('r-date').value);

            for(let i=0; i < parcels; i++) {
                let dueDate = new Date(baseDate);
                dueDate.setMonth(dueDate.getMonth() + i);

                const data = {
                    patientId: pid,
                    patientName: pname,
                    description: parcels > 1 ? `${desc} (${i+1}/${parcels})` : desc,
                    amount: valParcela,
                    dueDate: dueDate.toISOString(),
                    paymentMethod: method,
                    status: 'Aberto',
                    itemsUsed: (i === 0) ? window.tempRecItems : []
                };
                await App.db.ref(App.utils.getAdminPath(App.currentUser.uid, 'finance/receivable')).push(data);
            }

            if(window.tempRecItems.length > 0) {
                for(let item of window.tempRecItems) {
                    const ref = App.db.ref(App.utils.getAdminPath(App.currentUser.uid, `stock/${item.id}`));
                    const snap = await ref.once('value');
                    if(snap.exists()) {
                        const currentQty = parseFloat(snap.val().quantity) || 0;
                        await ref.update({ quantity: currentQty - item.qty });
                    }
                }
            }

            App.utils.closeModal();
            alert("Lançamento realizado com sucesso!");
        };
    };

    // ==================================================================
    // 2. DESPESAS
    // ==================================================================
    function renderExpenses() {
        const div = document.getElementById('fin-content');
        div.innerHTML = `
            <div class="flex justify-between items-center mb-4">
                <p class="text-xs text-gray-500">Contas a pagar.</p>
                <button onclick="openExpModal()" class="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow hover:bg-red-700 flex items-center"><i class='bx bx-plus mr-1'></i> Nova Despesa</button>
            </div>
            <div id="exp-list" class="space-y-3"></div>`;
        
        const list = document.getElementById('exp-list');
        const sorted = [...App.data.expenses].sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate));
        
        if(!sorted.length) { list.innerHTML = '<p class="text-center text-gray-400 mt-10">Nenhuma despesa lançada.</p>'; return; }

        sorted.forEach(e => {
            const isPaid = e.status === 'Pago';
            let itemsHtml = '';
            if(e.itemsPurchased && e.itemsPurchased.length > 0) {
                itemsHtml = `<div class="mt-2 pt-2 border-t border-dashed border-gray-200 text-xs text-gray-500">
                    <span class="font-bold text-green-700">Entrada de Estoque:</span> ${e.itemsPurchased.map(i => `${i.qty}x ${i.name}`).join(', ')}
                </div>`;
            }

            list.innerHTML += `
                <div class="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition border-l-4 border-l-red-400">
                    <div class="flex justify-between items-start">
                        <div>
                            <div class="font-bold text-gray-800 text-base">${e.supplier}</div>
                            <div class="text-xs text-gray-500 mt-0.5">${e.description} <span class="text-gray-400">(Ref: ${e.ref || 'S/N'})</span></div>
                        </div>
                        <div class="text-right">
                            <div class="font-bold text-red-600 text-lg">${App.utils.formatCurrency(e.amount)}</div>
                            <span class="text-[10px] px-2 py-0.5 rounded uppercase font-bold ${isPaid?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}">${e.status}</span>
                        </div>
                    </div>
                    ${itemsHtml}
                    <div class="mt-3 flex justify-end gap-2 border-t pt-2">
                        ${!isPaid ? `<button onclick="settleTx('expenses','${e.id}')" class="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded font-bold hover:bg-blue-100">Pagar Conta</button>` : ''}
                        <button onclick="delTx('finance/expenses','${e.id}')" class="text-gray-400 hover:text-red-500"><i class='bx bx-trash text-lg'></i></button>
                    </div>
                </div>`;
        });
    }

    window.openExpModal = function() {
        window.tempExpItems = []; // Reset da lista
        const html = `
            <div class="grid md:grid-cols-2 gap-6 h-full text-sm">
                <div class="space-y-3">
                    <h4 class="font-bold text-red-800 border-b pb-1">1. Dados da Conta</h4>
                    <div><label class="font-bold text-gray-600">Fornecedor</label><input id="e-sup" class="w-full border p-2 rounded" placeholder="Ex: Dental Cremer"></div>
                    <div><label class="font-bold text-gray-600">Descrição</label><input id="e-desc" class="w-full border p-2 rounded" placeholder="Ex: Compra de Material"></div>
                    <div class="grid grid-cols-2 gap-2">
                        <div><label class="font-bold text-gray-600">Valor Total (R$)</label><input id="e-val" type="number" step="0.01" class="w-full border p-2 rounded"></div>
                        <div><label class="font-bold text-gray-600">1º Vencimento</label><input id="e-date" type="date" class="w-full border p-2 rounded"></div>
                    </div>
                    <div><label class="font-bold text-gray-600">Ref/NF</label><input id="e-nf" class="w-full border p-2 rounded"></div>
                    <div class="grid grid-cols-2 gap-2 bg-red-50 p-2 rounded border border-red-100">
                        <div><label class="font-bold text-red-900">Pagamento</label><select id="e-method" class="w-full border p-2 rounded" onchange="window.toggleInst(this.value, 'exp-inst-area')"><option value="Boleto">Boleto</option><option value="Pix">Pix</option><option value="Cartão">Cartão</option></select></div>
                        <div id="exp-inst-area" class="hidden">
                            <label class="font-bold text-red-900">Parcelas</label>
                            <select id="e-parcels" class="w-full border p-2 rounded">
                                ${Array.from({length: 24}, (_, i) => `<option value="${i+1}">${i+1}x</option>`).join('')}
                            </select>
                        </div>
                    </div>
                </div>
                <div class="bg-gray-50 p-4 rounded-lg border border-gray-200 flex flex-col">
                    <h4 class="font-bold text-green-800 border-b pb-1 mb-2 flex justify-between items-center">
                        <span>2. Itens Comprados (Entrada)</span>
                        <i class='bx bx-cart-add'></i>
                    </h4>
                    <div class="grid grid-cols-3 gap-2 mb-2">
                        <input id="e-item-name" placeholder="Nome do Item" class="col-span-2 border p-1 rounded text-xs">
                        <input id="e-item-unit" placeholder="Un (cx)" class="border p-1 rounded text-xs">
                    </div>
                    <div class="flex gap-2 mb-2">
                        <input id="e-item-qty" type="number" placeholder="Qtd" class="flex-grow border p-1 rounded text-xs">
                        <select id="e-item-cat" class="border p-1 rounded text-xs"><option>Consumo</option><option>Venda</option></select>
                        <button type="button" onclick="window.addExpItem()" class="bg-green-600 text-white px-3 rounded text-xs font-bold">Add</button>
                    </div>
                    <div id="e-stock-list" class="flex-grow overflow-y-auto bg-white border rounded p-2 text-xs space-y-1 h-24">
                        <p class="text-gray-400 italic text-center mt-4">Nenhum item adicionado.</p>
                    </div>
                    <p class="text-[10px] text-gray-500 mt-2">* Deixe vazio se for conta de consumo (luz, água).</p>
                </div>
            </div>
            <button onclick="saveExp()" class="w-full bg-red-600 text-white py-3 rounded-lg font-bold mt-4 shadow hover:bg-red-700">Salvar Despesa e Atualizar Estoque</button>
        `;
        App.utils.openModal("Nova Despesa / Entrada", html, "max-w-4xl");

        window.saveExp = async () => {
            const supplier = document.getElementById('e-sup').value;
            const desc = document.getElementById('e-desc').value;
            const total = parseFloat(document.getElementById('e-val').value);
            const method = document.getElementById('e-method').value;
            const refDoc = document.getElementById('e-nf').value;

            let parcels = 1;
            if(!document.getElementById('exp-inst-area').classList.contains('hidden')) {
                parcels = parseInt(document.getElementById('e-parcels').value);
            }
            const valParcela = total / parcels;
            const baseDate = new Date(document.getElementById('e-date').value);

            for(let i=0; i < parcels; i++) {
                let dueDate = new Date(baseDate);
                dueDate.setMonth(dueDate.getMonth() + i);

                const data = {
                    supplier: supplier,
                    description: parcels > 1 ? `${desc} (${i+1}/${parcels})` : desc,
                    amount: valParcela,
                    dueDate: dueDate.toISOString(),
                    ref: refDoc,
                    paymentMethod: method,
                    status: 'Aberto',
                    itemsPurchased: (i === 0) ? window.tempExpItems : []
                };
                await App.db.ref(App.utils.getAdminPath(App.currentUser.uid, 'finance/expenses')).push(data);
            }

            if(window.tempExpItems.length > 0) {
                const stockRef = App.db.ref(App.utils.getAdminPath(App.currentUser.uid, 'stock'));
                const snapshot = await stockRef.once('value');
                const currentStock = [];
                if(snapshot.exists()) snapshot.forEach(c => currentStock.push({ ...c.val(), key: c.key }));

                for(let newItem of window.tempExpItems) {
                    const exist = currentStock.find(s => s.name.toLowerCase() === newItem.name.toLowerCase());
                    if(exist) {
                        await App.db.ref(App.utils.getAdminPath(App.currentUser.uid, `stock/${exist.key}`)).update({
                            quantity: parseFloat(exist.quantity) + newItem.qty
                        });
                    } else {
                        await stockRef.push({
                            name: newItem.name, quantity: newItem.qty, unit: newItem.unit, category: newItem.category
                        });
                    }
                }
            }

            App.utils.closeModal();
            alert("Despesa lançada com sucesso!");
        };
    };

    // ==================================================================
    // 3. ESTOQUE
    // ==================================================================
    function renderStock() {
        const div = document.getElementById('fin-content');
        div.innerHTML = `<div id="stk-grid" class="grid grid-cols-2 md:grid-cols-4 gap-3"></div>`;
        const grid = document.getElementById('stk-grid');
        
        if(!App.data.stock.length) { grid.innerHTML = '<p class="col-span-4 text-center text-gray-400 mt-10">Estoque vazio.</p>'; return; }

        App.data.stock.forEach(i => {
            grid.innerHTML += `
                <div class="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between">
                    <div>
                        <div class="font-bold text-gray-700 truncate" title="${i.name}">${i.name}</div>
                        <div class="text-xs text-gray-400 uppercase">${i.category}</div>
                    </div>
                    <div class="mt-2 flex justify-between items-end">
                        <span class="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold text-sm">${i.quantity} ${i.unit}</span>
                        <button onclick="delTx('stock','${i.id}')" class="text-red-300 hover:text-red-500"><i class='bx bx-trash'></i></button>
                    </div>
                </div>`;
        });
    }

    // --- UTILS ---
    window.delTx = (path, id) => { if(confirm("Excluir registro?")) App.db.ref(App.utils.getAdminPath(App.currentUser.uid, `${path}/${id}`)).remove(); };
    window.settleTx = (type, id) => {
        if(confirm("Confirmar transação?")) {
            const up = type==='receivable' ? { status:'Recebido', receivedDate: new Date().toISOString() } : { status:'Pago', paidDate: new Date().toISOString() };
            App.db.ref(App.utils.getAdminPath(App.currentUser.uid, `finance/${type}/${id}`)).update(up);
        }
    };

})();
