# Voice patient registration

A phone number you can call that puts you through to a voice agent named Riley, who takes
your demographic details the way a front-desk coordinator would, and writes them to Postgres.
There's a REST API over the same data and a small dashboard to look at what came in.

I had roughly three hours, so the goal was one working path all the way through rather than
a polished version of any single piece.

## What happens on a call

You call the number. Vapi picks up, transcribes you, and runs the conversation through Gemini
using the prompt in [agent/system-prompt.md](agent/system-prompt.md). Riley asks for a callback
number first, and the moment there are ten digits it quietly checks whether we already have you
— if so it offers to update the existing record instead of making a second one. Otherwise it
collects the rest, offers the optional fields once, reads everything back, and only saves after
you confirm.

The save isn't done inside Vapi. The assistant calls a tool, which is an HTTP POST to
`/vapi/tool` on this Express app, and that handler calls the same service module the public
`POST /patients` route uses. There's one code path for writes no matter where they come from.

## Architecture

```
Caller ─── phone ──▶ Vapi ─── STT ──▶ Gemini 2.5 Flash ─── tool call ──┐
                      ▲                                                 │
                      └────────────── TTS ◀── result ───────────────────┤
                                                                        ▼
                                                          POST /vapi/tool  (Express)
                                                                        │
                          ┌─── GET/POST/PUT/DELETE /patients ───────────┤
                          │                                             ▼
                     REST clients                            src/services/patients.js
                          │                                             │
                     GET /dashboard ──────────────────────────▶  Prisma ──▶ Postgres
```

Everything is one Express app running as a single Vercel serverless function. `vercel.json`
rewrites every path into `api/index.js`, which just exports the app — so routing stays in
Express instead of being split across a folder of separate function files.

The layering is deliberately boring:

- `src/routes` — URL shapes only
- `src/controllers` — HTTP concerns, status codes, logging
- `src/services/patients.js` — all reads and writes, throws `ApiError` with a status
- `src/lib/validation.js` — every field rule, returns `{field, message}` pairs
- `src/views/dashboard.js` — the dashboard, rendered to an HTML string

The reason validation returns field-level errors rather than one message is that the voice
agent needs to know *which* field to re-ask for. If a caller's date of birth doesn't parse,
Riley should ask about the year again and not re-collect the address.

## Tech choices

**Vapi instead of Twilio plus separate STT/TTS.** This was the biggest call. Twilio would have
meant wiring up media streams, a transcription service, a TTS service, and my own turn-taking
and barge-in logic. That's most of three hours by itself, and the assessment FAQ says building
STT/TTS is out of scope. Vapi does phone provisioning, transcription, voice, interruption
handling and function calling in one config object, and it takes Gemini as a native provider
so I didn't need a proxy.

**Gemini 2.5 Flash.** The brief mentioned `gemini-1.5-flash`, but that model is no longer in
Vapi's supported list for the `google` provider — the current options are 2.5 Flash, 2.5 Pro,
2.5 Flash Lite and the 3.x models. 2.5 Flash is on Google's free tier and it's fast, which
matters more than raw reasoning here: latency between turns is what makes a voice agent feel
robotic. Temperature is 0.4 rather than 0, because at 0 the model opens literally every turn
with the same acknowledgement.

**Postgres over SQLite.** Vercel functions have no persistent disk. A SQLite file gets wiped
between invocations, which fails the "must survive restarts" requirement outright. I set this
up for Vercel Postgres, which is Neon underneath, so any Neon or Supabase connection string
works — it's all the same `DATABASE_URL`.

**Prisma.** Mostly for the migration workflow and because the schema doubles as documentation
of the data model. The generated client also gives type-safe field names, which caught a couple
of my own typos.

**No frontend framework for the dashboard.** It's server-rendered from a template string. One
round trip, no build step, no client state, and nothing for Vercel's static asset handling to
get wrong. It's plain, and that's intentional.

**No validation library.** I hand-rolled `src/lib/validation.js`. Zod would have been fewer
lines, but I wanted exact control over the error text since those messages drive what the voice
agent says next.

## About the system prompt

It's in [agent/system-prompt.md](agent/system-prompt.md), and it's structured the way it is for
a few specific reasons.

The voice-and-manner section comes before anything about data because the most common failure
mode for an LLM on a phone call is sounding like a form. Everything it writes gets spoken, so
the prompt bans markdown outright and tells it to say "March third, nineteen ninety" out loud
while sending `1990-03-03` to the tool. That split — natural speech to the human, strict
formats to the API — is the thing most worth being explicit about.

Asking for the phone number first is a structural decision, not a stylistic one. It's what
makes the duplicate check useful: finding out someone is already on file after you've collected
their full address wastes the caller's time.

Corrections get their own section with concrete examples, because the instinct a model has when
told something was wrong is to start over. The prompt says repeatedly that a correction is one
change, not a restart. Invalid input gets its own section for the same reason, with the rule
that it re-asks only for the fields the tool named, plus phrasings that don't leak the technical
reason — a caller should hear "could you give me those five digits again", not "ZIP code failed
validation".

There's also a give-up path. Three failures on the same field means the line is probably bad,
and continuing to ask is worse than taking a message. And the boundaries section exists because
an intake agent that starts answering insurance-coverage questions is a liability.

## Running it locally

You'll need Node 18+ and a Postgres connection string.

```bash
npm install
cp .env.example .env      # then fill it in
npm run db:deploy         # applies prisma/migrations to your database
npm run dev               # http://localhost:3000
```

`http://localhost:3000/dashboard` will be empty until something gets written. To check the
whole stack without making a phone call:

```bash
curl -X POST http://localhost:3000/patients \
  -H 'content-type: application/json' \
  -d '{"first_name":"Jane","last_name":"Doe","date_of_birth":"1990-03-03","sex":"Female",
       "phone_number":"(415) 555-0132","address_line_1":"12 Main St","city":"Austin",
       "state":"TX","zip_code":"78701"}'
```

### Environment variables

| Variable | What it's for |
| --- | --- |
| `DATABASE_URL` | Pooled Postgres connection string. Used by the running app. |
| `DIRECT_URL` | Unpooled string, used only by `prisma migrate`. Set it to the same value as `DATABASE_URL` if your provider doesn't distinguish. |
| `GEMINI_API_KEY` | Your Google AI Studio key. Paste it into Vapi's Google integration so calls bill against your free tier. |
| `VAPI_API_KEY` | Vapi private API key. Used by `npm run agent:deploy`. |
| `VAPI_PHONE_NUMBER_ID` | The Vapi id of your number (a UUID, not the number itself). |
| `VAPI_ASSISTANT_ID` | Set after the first deploy so re-runs update instead of creating duplicates. |
| `PUBLIC_BASE_URL` | Public https URL of the deployment. Vapi calls back into it for tool calls. |
| `PORT` | Local dev only, defaults to 3000. |

## Deploying

Push to a repo, import it in Vercel, and set the environment variables in the project settings.
The build runs `prisma generate` via the `vercel-build` script. Migrations aren't part of the
build on purpose — a build shouldn't fail because a database is briefly unreachable — so run
`npm run db:deploy` yourself once against the production database.

Then point Vapi at the deployment:

```bash
PUBLIC_BASE_URL=https://your-app.vercel.app npm run agent:deploy
```

That reads `system-prompt.md` and `tools.json`, creates the assistant with the tool webhook
pointing at your deployment, attaches your phone number, and prints the assistant id.

## API

Every response uses the same envelope. Success is `{"data": ..., "error": null}` and failure is
`{"data": null, "error": "..."}`, with an extra `details` array of `{field, message}` on
validation failures.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/patients` | Filters: `last_name` (case-insensitive partial), `date_of_birth`, `phone_number`, `limit` |
| `GET` | `/patients/:id` | 400 on a malformed UUID, 404 if missing or soft-deleted |
| `POST` | `/patients` | 201 with the created record |
| `PUT` | `/patients/:id` | Partial update. `PATCH` works too |
| `DELETE` | `/patients/:id` | Soft delete — sets `deleted_at`, row stays in the table |
| `GET` | `/dashboard` | HTML. `?q=` searches last name, or phone if the input is ten digits |
| `POST` | `/vapi/tool` | Vapi webhook |
| `GET` | `/health` | Liveness |

Status codes are 400 for a malformed request, 422 for a well-formed request that fails
validation, 404 for a missing record, and 500 for anything unexpected.

Soft-deleted rows are excluded from every read, including the duplicate check — so if a record
is deleted and the same person calls back, they're treated as new.

## Validation

Field rules live in `src/lib/validation.js` and are enforced again by CHECK constraints in the
migration, so a bad row can't get in even through a direct SQL client. Dates of birth can't be
in the future or before 1900, phone numbers must be ten digits with a valid area and exchange
code, state must be a real two-letter code, ZIP must be five digits or ZIP+4.

Inputs get normalized before they're stored. `(415) 555-0132`, `+1 415 555 0132` and
`415.555.0132` all become `4155550132`, and `tx` becomes `TX`. Dates are stored at UTC midnight
so a timezone can't shift someone's birthday by a day — that one bites more often than you'd
expect.

## Known limitations

There are no automated tests in the repo. I did write throwaway harnesses while building —
one that ran the Express layer against an in-memory Prisma stub (45 assertions across the CRUD
routes, envelopes, status codes, the dashboard and the Vapi webhook) and one that executed
`migration.sql` against PGlite to confirm the CHECK constraints actually reject bad rows. Both
passed, but they were scratch files and I didn't spend the time to turn them into a proper
suite. That's the first thing I'd add.

I also haven't been able to place a real phone call to it — that needs the Vapi account and
number, which are yours to create. The API and webhook are exercised; the voice path itself is
configured but unverified end to end.

The rest:

- No auth on anything. The API and dashboard are wide open, and the Vapi webhook doesn't verify
  a shared secret. Deliberate — the FAQ says no production hardening — but it's the first thing
  that would have to change.
- The dashboard is read-only and unpaginated, capped at 100 rows.
- The duplicate check matches on phone number alone, so a family sharing a landline looks like
  one returning patient.
- `migration.sql` is hand-written rather than generated, because I had no database to run
  `prisma migrate dev` against while building. It applies cleanly with `migrate deploy` and I
  verified it against a real Postgres engine, but the CHECK constraints aren't expressible in
  `schema.prisma`, so a future `migrate dev` may report drift and want to drop them. Keep them.
- Gemini's free tier is 10 requests/minute, which is fine for one caller and not for two.
- Call transcripts aren't stored. Only the final record is, plus a stdout log line.

## What I'd do next

Tests first — the harnesses I threw away should be real, with the Vapi webhook cases as the
priority since that's the path with the least visibility when it breaks.

After that, a shared-secret check on the webhook, then persisting transcripts and recordings
alongside the record so a human can audit what the agent actually heard. Right now a
mis-transcribed street name is invisible after the call ends.

The duplicate check should really match on phone plus date of birth rather than phone alone.
And the dashboard needs pagination and a detail view before anyone could use it for real —
listing is fine, but you can't see the optional fields anywhere.

Things I skipped on purpose as out of scope: appointment scheduling, multi-language support
(the field is captured, nothing reads it), and any kind of HIPAA or encryption work.
