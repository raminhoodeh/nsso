import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function clearKnowledge() {
    console.log('🗑️ Clearing existing knowledge base in agent_knowledge table...');
    // Delete where content is not null (which is everything since content is NOT NULL)
    const { error } = await supabase
        .from('agent_knowledge')
        .delete()
        .not('content', 'is', null);
    
    if (error) {
        console.error('❌ Failed to clear database:', error.message);
    } else {
        console.log('✅ Database cleared successfully.');
    }
}
clearKnowledge();
