const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
  const { data } = await supabase.from('razinflix_films').select('title, poster');
  console.log(data.find(d => d.title.includes('Gaia')));
  console.log(data.find(d => d.title.includes('Hamdardi')));
  console.log(data.find(d => d.title.includes('Escaflowne')));
}
run();
