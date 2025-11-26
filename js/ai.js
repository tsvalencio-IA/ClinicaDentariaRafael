// =====================================================================
// 🧠 MÓDULO IA: js/ai.js (VERSÃO FINAL COMPATÍVEL)
// =====================================================================
(function() {
    var config = window.AppConfig || {};
    var GEMINI_MODEL = config.GEMINI_MODEL || "gemini-1.5-flash"; 
    var API_KEY = config.API_KEY;

    async function callGeminiAPI(systemPrompt, userMessage) {
        if (!API_KEY || API_KEY.includes("SUA_CHAVE") || API_KEY.length < 10) {
            console.error("ERRO GEMINI: API Key inválida.");
            return "Erro de Configuração: Chave API não encontrada.";
        }

        var url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${API_KEY}`;
        
        // TRUQUE: Unifica System Prompt + User Message
        var finalPrompt = `CONTEXTO DO SISTEMA:\n${systemPrompt}\n\n---\nMENSAGEM DO USUÁRIO:\n${userMessage}`.trim();

        var payload = {
            contents: [{ role: "user", parts: [{ text: finalPrompt }] }]
        };

        try {
            var response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                var err = await response.json();
                throw new Error(err.error ? err.error.message : "Erro desconhecido na API");
            }

            var data = await response.json();
            
            if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
                return data.candidates[0].content.parts[0].text;
            } else {
                return "A IA não conseguiu gerar uma resposta válida.";
            }

        } catch (error) {
            console.error("Erro IA:", error);
            return `Erro técnico na IA: ${error.message}`;
        }
    }

    window.callGeminiAPI = callGeminiAPI;
})();
