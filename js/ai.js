// =====================================================================
// 🧠 MÓDULO DE INTELIGÊNCIA ARTIFICIAL: js/ai.js
// ENCAPSULADO EM IIFE PARA EVITAR COLISÃO DE ESCOPO GLOBAL.
// =====================================================================

(function() {
    // Desestrutura dentro do escopo local da IIFE
    const { GEMINI_MODEL, API_KEY } = window.AppConfig;

    /**
     * Envia uma requisição de prompt para a API do Google Gemini.
     * @param {string} systemPrompt - As diretrizes comportamentais para a IA (o BRAIN).
     * @param {string} userMessage - A mensagem que a IA deve processar ou responder.
     * @returns {Promise<string>} O texto da resposta gerada pelo modelo.
     */
    const callGeminiAPI = async (systemPrompt, userMessage) => {
        
        if (!API_KEY || API_KEY === "SUA_CHAVE_AQUI_GEMINI_API_KEY") {
            console.error("ERRO GEMINI: A chave API não foi configurada em js/config.js.");
            return "Erro: Chave API da Gemini não configurada.";
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${API_KEY}`;
        
        const payload = {
            systemInstruction: systemPrompt,
            contents: [
                {
                    role: "user",
                    parts: [{ text: userMessage }]
                }
            ]
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorBody = await response.json();
                throw new Error(`Falha HTTP: ${response.status} - ${errorBody.error.message}`);
            }

            const data = await response.json();

            if (data.candidates && data.candidates.length > 0) {
                const text = data.candidates[0].content.parts[0].text;
                return text || "A IA não conseguiu gerar uma resposta significativa.";
            } else {
                console.warn("Resposta da API sem conteúdo válido (Pode ser bloqueio de segurança).", data);
                return "Resposta da IA bloqueada ou vazia. Tente um prompt diferente.";
            }

        } catch (error) {
            console.error("Erro na comunicação com a API Gemini:", error);
            return `Erro de conexão com o Gemini: ${error.message}`;
        }
    };

    // Exporta APENAS a função para o escopo global
    window.callGeminiAPI = callGeminiAPI;
})();
