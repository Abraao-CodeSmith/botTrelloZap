const { createClient } = require('@supabase/supabase-js');

let supabaseClient = null;

function getSupabase() {
    if (supabaseClient) return supabaseClient;
    
    // Fallback/Mock para ambiente de teste (se as credenciais não existirem e o mock não for injetado por outro caminho)
    if (process.env.NODE_ENV === 'test') {
        return {
            from: () => ({
                select: async () => ({ data: [] }),
                insert: async () => ({ error: null }),
                upsert: async () => ({ error: null }),
                delete: async () => ({ error: null })
            })
        };
    }
    
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
        throw new Error("⚠️ SUPABASE_URL ou SUPABASE_KEY não foram definidos no .env!");
    }
    
    supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    return supabaseClient;
}

module.exports = {
    getSupabase,
    // Exporta objeto direto pra facilitar se já estiver inicializado garantidamente
    get supabase() {
        return getSupabase();
    }
};
