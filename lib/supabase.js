import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zbkvheepzzripzyjleym.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpia3ZoZWVwenpyaXB6eWpsZXltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NjAwNjIsImV4cCI6MjEwNDAzNjA2Mn0.6153vWd2Bg2VHozMpi1vdTbBLosXxJC2vU_LJiU1jgM';

export const supabase = createClient(supabaseUrl, supabaseKey);
