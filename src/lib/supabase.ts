import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://cmvdcacwdlzudyqpkdea.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtdmRjYWN3ZGx6dWR5cXBrZGVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NTc4NjMsImV4cCI6MjA5MTUzMzg2M30.u88iQ2fgL0nYJR3egU71yLB1aVgu8iLTjDbJEt2OrL0';

export const supabase = createClient(supabaseUrl, supabaseKey);
