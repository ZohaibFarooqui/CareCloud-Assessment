#!/usr/bin/env node
// Creates (or updates) the Vapi assistant from system-prompt.md + tools.json,
// then points the phone number at it.
//
//   npm run agent:deploy
//
// Re-running is safe: set VAPI_ASSISTANT_ID in .env to update in place instead
// of creating a duplicate. The script prints the id to paste back.

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const VAPI_BASE = 'https://api.vapi.ai';

const {
  VAPI_API_KEY,
  VAPI_PHONE_NUMBER_ID,
  VAPI_ASSISTANT_ID,
  PUBLIC_BASE_URL,
} = process.env;

function die(msg) {
  console.error('\n  ' + msg + '\n');
  process.exit(1);
}

if (!VAPI_API_KEY) die('VAPI_API_KEY is not set. Add it to .env (Vapi dashboard -> API Keys -> private key).');
if (!PUBLIC_BASE_URL) die('PUBLIC_BASE_URL is not set. Add your deployed URL to .env, e.g. https://your-app.vercel.app');

const baseUrl = PUBLIC_BASE_URL.replace(/\/+$/, '');
if (!/^https:\/\//.test(baseUrl)) {
  die('PUBLIC_BASE_URL must be an https URL that Vapi can reach. localhost will not work -- deploy first, or use a tunnel.');
}

const systemPrompt = fs.readFileSync(path.join(__dirname, 'system-prompt.md'), 'utf8');
const toolDefs = JSON.parse(fs.readFileSync(path.join(__dirname, 'tools.json'), 'utf8'));

// Every function tool posts to the same webhook; the handler dispatches on name.
const tools = toolDefs.map((t) => ({ ...t, server: { url: baseUrl + '/vapi/tool' } }));

// Lets the model hang up itself once it has signed off.
tools.push({ type: 'endCall' });

const assistant = {
  name: 'Lakeside Patient Intake',

  model: {
    provider: 'google',
    model: 'gemini-2.5-flash',
    // Low but not zero: the prompt asks for varied acknowledgements, and a
    // completely deterministic model repeats "Got it." on every single turn.
    temperature: 0.4,
    messages: [{ role: 'system', content: systemPrompt }],
    tools,
  },

  voice: { provider: 'vapi', voiceId: 'Elliot' },

  transcriber: {
    provider: 'deepgram',
    model: 'nova-3',
    language: 'en',
    // Callers spell names and read digits; these are the words that matter most.
    keywords: ['ZIP:2', 'apartment:1', 'insurance:1'],
  },

  firstMessage:
    "Thanks for calling Lakeside Family Medicine, this is Riley. I can get you registered as a new patient " +
    "-- it only takes a few minutes. Could I start with a good callback number for you?",

  // Where non-tool events (including end-of-call-report) are delivered.
  server: { url: baseUrl + '/vapi/tool' },
  serverMessages: ['tool-calls', 'end-of-call-report'],

  // Intake is mostly the caller talking in bursts; give them room to finish.
  startSpeakingPlan: { waitSeconds: 0.6 },
  silenceTimeoutSeconds: 30,
  maxDurationSeconds: 900,
  endCallMessage: 'Thanks again, and take care.',
};

async function vapi(method, endpoint, body) {
  const res = await fetch(VAPI_BASE + endpoint, {
    method,
    headers: {
      Authorization: 'Bearer ' + VAPI_API_KEY,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep raw text */
  }

  if (!res.ok) {
    console.error('\n  Vapi ' + method + ' ' + endpoint + ' failed (' + res.status + '):');
    console.error('  ' + (text || '(empty response)').slice(0, 1200) + '\n');
    process.exit(1);
  }
  return json;
}

async function main() {
  const updating = Boolean(VAPI_ASSISTANT_ID);

  console.log((updating ? 'Updating' : 'Creating') + ' Vapi assistant...');
  console.log('  tool webhook -> ' + baseUrl + '/vapi/tool');

  const result = updating
    ? await vapi('PATCH', '/assistant/' + VAPI_ASSISTANT_ID, assistant)
    : await vapi('POST', '/assistant', assistant);

  console.log('\nAssistant ' + (updating ? 'updated' : 'created') + ': ' + result.id);

  if (VAPI_PHONE_NUMBER_ID) {
    const phone = await vapi('PATCH', '/phone-number/' + VAPI_PHONE_NUMBER_ID, {
      assistantId: result.id,
    });
    console.log('Phone number ' + (phone.number || VAPI_PHONE_NUMBER_ID) + ' now answers with this assistant.');
    console.log('\nCall ' + (phone.number || 'your Vapi number') + ' to test it.');
  } else {
    console.log('\nVAPI_PHONE_NUMBER_ID is not set, so no number was attached.');
    console.log('Buy a number in the Vapi dashboard, then either set that env var and re-run,');
    console.log('or attach assistant ' + result.id + ' to the number in the dashboard.');
  }

  if (!updating) {
    console.log('\nAdd this to .env so future runs update instead of creating a duplicate:');
    console.log('  VAPI_ASSISTANT_ID=' + result.id);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
