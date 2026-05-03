#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixPolicy() {
  try {
    console.log('Fetching automation policies...');
    const { data: policies, error: fetchError } = await supabase
      .from('harwick_ai_automation_policies')
      .select('*');

    if (fetchError) {
      console.error('Fetch error:', fetchError);
      process.exit(1);
    }

    console.log('Found policies:', JSON.stringify(policies, null, 2));

    if (policies && policies.length > 0) {
      for (const policy of policies) {
        console.log(`\nUpdating policy ${policy.id}...`);
        const { error: updateError } = await supabase
          .from('harwick_ai_automation_policies')
          .update({
            allowed_auto_tools: ['send_meta_dm', 'send_meta_reply'],
          })
          .eq('id', policy.id);

        if (updateError) {
          console.error('Update error:', updateError);
        } else {
          console.log('✓ Updated successfully');
        }
      }
    }

    console.log('\nFetching updated policies...');
    const { data: updated } = await supabase
      .from('harwick_ai_automation_policies')
      .select('*');

    console.log('Updated policies:', JSON.stringify(updated, null, 2));
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixPolicy();
