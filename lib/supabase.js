import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'PEGA_AQUI_TU_PROJECT_URL';
const supabaseKey = 'PEGA_AQUI_TU_PUBLISHABLE_KEY';

export const supabase = createClient(supabaseUrl, supabaseKey);
