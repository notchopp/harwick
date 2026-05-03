#!/usr/bin/env node
/**
 * Test the Generate Action endpoint
 * Usage: node test-generate-action.js <workspaceId> <leadId>
 */

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '.env') });

const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const workspaceId = process.argv[2];
const leadId = process.argv[3];

if (!workspaceId || !leadId) {
  console.error('Usage: node test-generate-action.js <workspaceId> <leadId>');
  console.error('Example: node test-generate-action.js 550e8400-e29b-41d4-a716-446655440000 550e8400-e29b-41d4-a716-446655440001');
  process.exit(1);
}

async function testGenerateAction() {
  try {
    console.log(`Testing Generate Action endpoint...`);
    console.log(`Workspace: ${workspaceId}`);
    console.log(`Lead: ${leadId}`);
    console.log();

    const response = await fetch(
      `${baseUrl}/api/workspaces/${workspaceId}/harwick-ai/generate-action`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ leadId }),
      }
    );

    const data = await response.json();

    console.log(`Response Status: ${response.status}`);
    console.log(`Response:`, JSON.stringify(data, null, 2));

    if (response.ok) {
      console.log();
      console.log('✓ Generate Action endpoint is working!');
      console.log(`Generated turn ID: ${data.turnId}`);
      console.log(`Reply: ${data.reply}`);
      if (data.sent) {
        console.log(`Auto-sent: Yes (status ${data.sentStatus})`);
      } else {
        console.log('Auto-sent: No (awaiting manual send or automation trigger)');
      }
    } else {
      console.log();
      console.log('✗ Generate Action endpoint returned an error');
    }
  } catch (error) {
    console.error('Error testing endpoint:', error);
    process.exit(1);
  }
}

testGenerateAction();
