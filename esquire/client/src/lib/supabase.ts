import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'https://eombkfyeymqqjanlunal.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvbWJrZnlleW1xcWphbmx1bmFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5ODE5MzAsImV4cCI6MjA5MjU1NzkzMH0.wtZkf1Un3vXRRTkPLULYY0Uew-K_Q9Nc5bS3euOjT8A';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
