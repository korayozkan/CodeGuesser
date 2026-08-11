/**
 * _shared/cors.ts
 * Tüm Edge Function'ların kullandığı ortak CORS header'ları.
 */
export const corsHeaders = {
    'Access-Control-Allow-Origin' : '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
