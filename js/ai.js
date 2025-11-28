// =====================================================================
// 🧠 MÓDULO IA: js/ai.js (COM VISÃO COMPUTACIONAL GEMINI)
// =====================================================================
(function() {
    const config = window.AppConfig || {};
    const API_KEY = config.API_KEY;
    const MODEL_NAME = config.GEMINI_MODEL; // Usa o 2.5 definido no config

    // Converte URL de imagem para Base64 (Para a IA conseguir "ver")
    async function urlToBase64(url) {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    // O result vem como "data:image/jpeg;base64,....."
                    // Precisamos remover o cabeçalho para enviar ao Gemini
                    const base64String = reader.result.split(',')[1]; 
                    resolve({
                        inline_data: {
                            mime_type: blob.type,
                            data: base64String
                        }
                    });
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error("Erro ao processar imagem para IA:", e);
            return null;
        }
    }

    // Função Principal (Agora aceita 3º parâmetro: imageUrl)
    async function callGeminiAPI(systemPrompt, userMessage, imageUrl = null) {
        if (!API_KEY || API_KEY.length < 10) {
            return "Erro: Chave API inválida.";
        }

        console.log(`🤖 IA: Analisando com ${MODEL_NAME}... Imagem: ${imageUrl ? 'SIM' : 'NÃO'}`);

        // URL Oficial v1beta (Necessária para modelos preview/vision)
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;
        
        // Monta o conteúdo (Texto + Imagem se houver)
        const parts = [{ text: `CONTEXTO DO SISTEMA:\n${systemPrompt}\n\n---\nDADOS DO CASO:\n${userMessage}` }];

        if (imageUrl) {
            const imagePart = await urlToBase64(imageUrl);
            if (imagePart) {
                parts.push(imagePart); // Adiciona a imagem ao pacote de envio
            }
        }

        const payload = {
            contents: [{ role: "user", parts: parts }]
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const err = await response.json();
                console.error("Erro API:", err);
                throw new Error(err.error?.message || response.statusText);
            }

            const data = await response.json();
            
            if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
                return data.candidates[0].content.parts[0].text;
            } else {
                throw new Error("Resposta vazia da IA.");
            }

        } catch (error) {
            return `Erro na IA: ${error.message}`;
        }
    }

    window.callGeminiAPI = callGeminiAPI;
})();
