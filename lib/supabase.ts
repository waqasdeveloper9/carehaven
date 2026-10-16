import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { config } from './config';
export async function supabase() {
 if (!config.supabaseUrl || !config.supabaseKey) throw new Error('Supabase configuration is missing.');
 const jar = await cookies();
 return createServerClient(config.supabaseUrl, config.supabaseKey, { cookies: { getAll: () => jar.getAll(), setAll: values => { for (const {name,value,options} of values) jar.set(name,value,options); } } });
}
