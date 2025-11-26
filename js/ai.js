// =====================================================================
// 🧠 MÓDULO DE INTELIGÊNCIA ARTIFICIAL: js/ai.js
// Responsável pela comunicação com o Google Gemini
// =====================================================================
(function() {
    
    // Recupera as configurações do escopo global
    // Usamos 'var' para segurança de escopo em recarregamentos
    var config = window.AppConfig;
    var GEMINI_MODEL = config ? config.GEMINI_MODEL : "gemini-2.5-flash-preview-09-2025";
    var API_KEY = config ? config.API_KEY : "";

    /**
     * Envia uma mensagem para o Google Gemini.
     * @param {string} systemPrompt - As regras/cérebro da IA.
     * @param {string} userMessage - A pergunta ou mensagem do usuário.
     */
    async function callGeminiAPI(systemPrompt, userMessage) {
        
        // 1. Validação de Segurança da Chave
        if (!API_KEY || API_KEY.includes("SUA_CHAVE") || API_KEY.length < 10) {
            console.error("ERRO GEMINI: Chave de API inválida ou não configurada em js/config.js");
            return "Erro de Configuração: A chave da API da Inteligência Artificial não foi configurada corretamente no sistema.";
        }

        // 2. Endpoint da API
        var url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${API_KEY}`;
        
        // 3. Construção do Payload (Corpo da Mensagem)
        // Estratégia Sênior: Combinamos o Prompt de Sistema e o Usuário em um único bloco de texto.
        // Isso evita erros de 'system_instruction' que variam entre versões da API e garante compatibilidade total.
        var combinedPrompt = `
CONTEXTO E DIRETRIZES DO SISTEMA:
${systemPrompt}

-----------------------------------

MENSAGEM DO USUÁRIO:
${userMessage}
        `.trim();

        var payload = {
            contents: [
                {
                    role: "user",
                    parts: [
                        { text: combinedPrompt }
                    ]
                }
            ],
            // Configurações de segurança para evitar bloqueios desnecessários em contextos médicos
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
            ]
        };

        try {
            // 4. Envio da Requisição (Fetch)
            var response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            // 5. Tratamento de Erros da API
            if (!response.ok) {
                var errorData = await response.json();
                var errorMsg = errorData.error ? errorData.error.message : response.statusText;
                console.error("Erro detalhado da API Gemini:", errorData);
                throw new Error(`Falha na API Gemini (${response.status}): ${errorMsg}`);
            }

            // 6. Processamento do Sucesso
            var data = await response.json();
            
            if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
                var responseText = data.candidates[0].content.parts[0].text;
                return responseText;
            } else {
                console.warn("A IA não retornou texto. Resposta crua:", data);
                return "A IA processou a solicitação mas não gerou uma resposta de texto válida. Tente reformular.";
            }

        } catch (error) {
            console.error("Erro Crítico no Módulo IA:", error);
            return `Erro de conexão com a IA: ${error.message}. Verifique sua internet ou a chave API.`;
        }
    }

    // 7. Exportação Global
    // Torna a função acessível para app.js e portal.js
    window.callGeminiAPI = callGeminiAPI;

})();
