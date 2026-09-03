import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zbkvheepzzripzyjleym.supabase.co/rest/v1/';
const supabaseKey = 'sb_publishable_YIV7ccN-LBWsbWBjF63RWQ_2-NqsctR';

export const supabase = createClient(supabaseUrl, supabaseKey);
