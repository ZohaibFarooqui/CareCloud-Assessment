# Voice patient registration

A phone number you can call that puts you through to a voice agent named Riley, who takes your
demographic details the way a front desk coordinator would and writes them to Postgres. There's
a REST API over the same data, plus a small dashboard for looking at what came in.

I had about three hours. The goal was one working path all the way through rather than a
polished version of any single piece.

## Live demo

| | |
| --- | --- |
| **Phone number** | **+1 (504) 738-8188** |
| **API base URL** | https://care-cloud-assessment.vercel.app |
| **Overview page** | https://care-cloud-assessment.vercel.app |
| **Dashboard** | https://care-cloud-assessment.vercel.app/dashboard |
| **Repository** | https://github.com/ZohaibFarooqui/CareCloud-Assessment |
| **Built by** | Muhammad Zohaib Farooqui ([LinkedIn](https://www.linkedin.com/in/zohaib-farooqui-75613a231/), [GitHub](https://github.com/ZohaibFarooqui)) |

Nothing is behind a login. The database has two fictional demo records in it (Maria Alvarez and
Desmond O'Neill) so there's something to look at before you call.

Quick check that it's up:

```bash
curl https://care-cloud-assessment.vercel.app/patients
```

## What happens on a call

You call the number. Vapi picks up, transcribes you, and runs the conversation through Gemini
using the prompt in [agent/system-prompt.md](agent/system-prompt.md). Riley asks for a callback
number first, and as soon as there are ten digits it quietly checks whether we already have you
on file. If we do, it offers to update that record instead of making a second one. Otherwise it
collects the rest, offers the optional fields once, reads everything back, and saves only after
you confirm.

The save doesn't happen inside Vapi. The assistant calls a tool, which is an HTTP POST to
`/vapi/tool` on this Express app, and that handler calls the same service module the public
`POST /patients` route uses. One code path for writes, no matter where they come from.

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

The whole thing is one Express app running as a single Vercel serverless function. `vercel.json`
rewrites every path into `api/index.js`, which just exports the app. That keeps routing inside
Express instead of scattering it across a folder of separate function files.

The layering is boring on purpose:

- `src/routes` holds URL shapes and nothing else
- `src/controllers` handles HTTP concerns, status codes and logging
- `src/services/patients.js` does all reads and writes, throwing `ApiError` with a status on it
- `src/lib/validation.js` has every field rule and returns `{field, message}` pairs
- `src/views` renders the pages to HTML strings (`shared.js` for layout and styles, `home.js`
  for the overview, `dashboard.js` for the patient list and detail)

Validation returns errors per field rather than one lumped message because the voice agent needs
to know which field to ask about again. If someone's date of birth doesn't parse, Riley should
ask about the year, not start over on the address.

## Tech choices

**Vapi rather than Twilio plus separate STT and TTS.** This was the biggest call I made. Going
the Twilio route would have meant media streams, a transcription service, a voice service, and
writing my own turn taking and barge in handling. That's most of three hours right there, and
the FAQ says building STT or TTS isn't the point of the exercise. Vapi covers phone
provisioning, transcription, voice, interruptions and function calling in one config object,
and it supports Gemini as a native provider so there was no proxy to write.

**Gemini 2.5 Flash.** I'd planned on `gemini-1.5-flash` but it's no longer in Vapi's supported
list for the `google` provider. Current options there are 2.5 Flash, 2.5 Pro, 2.5 Flash Lite
and the 3.x models. 2.5 Flash is on the free tier and it's quick, which matters more here than
raw reasoning ability. Latency between turns is what makes a voice agent feel robotic. I set
temperature to 0.4 rather than 0 because at 0 the model opened every single turn with the exact
same acknowledgement.

**Postgres instead of SQLite.** Vercel functions have no persistent disk, so a SQLite file gets
wiped between invocations. That fails the "must survive restarts" requirement outright. I set
this up for Vercel Postgres, which is Neon underneath, so any Neon or Supabase connection string
drops straight in.

**Prisma.** Mainly for the migration workflow, and because the schema ends up documenting the
data model for free. The generated client caught a couple of my own typos on field names.

**No frontend framework.** All three pages are server rendered from template strings with one
stylesheet inlined into the layout. One round trip, no build step, no client state, and nothing
for Vercel's static asset handling to trip over. The counts on the overview page are queried per
request rather than hardcoded, so the page can't end up claiming something the database doesn't
actually contain.

**No validation library.** `src/lib/validation.js` is hand written. Zod would have been shorter,
but I wanted exact control over the wording of each error, since those messages are what decide
the agent's next question.

## About the system prompt

It lives in [agent/system-prompt.md](agent/system-prompt.md). A few notes on why it's shaped the
way it is.

The voice and manner section comes before anything about data, because the most common way an
LLM fails on a phone call is by sounding like a form. Everything it produces gets spoken aloud,
so the prompt bans markdown outright and tells it to say "March third, nineteen ninety" to the
caller while sending `1990-03-03` to the tool. Natural speech to the human, strict formats to
the API. That split is the single thing most worth being explicit about.

Asking for the phone number first is structural, not stylistic. It's what makes the duplicate
check worth anything. Discovering someone is already on file after you've taken their full
address wastes their time and yours.

Corrections get their own section with worked examples, because a model's instinct when told it
got something wrong is to start again from the top. The prompt repeats that a correction is one
change, not a restart. Invalid input gets a section for the same reason, with the rule that it
asks again only about the fields the tool named, using phrasings that don't leak the technical reason.
A caller should hear "could you give me those five digits again", never "ZIP code failed
validation".

There's a point where it gives up, too. Three failures on the same field usually means the line is bad, and
asking a fourth time is worse than taking a message. The boundaries section is there because an
intake agent that starts fielding insurance coverage questions is a liability.

## Running it locally

You'll need Node 18 or newer and a Postgres connection string.

```bash
npm install
cp .env.example .env      # then fill it in
npm run db:deploy         # applies prisma/migrations to your database
npm run db:seed           # optional, adds two demo records
npm run dev               # http://localhost:3000
```

To check the stack without making a phone call:

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
| `DATABASE_URL` | Pooled Postgres connection string, used by the running app. |
| `DIRECT_URL` | Unpooled string, used only by `prisma migrate`. Same value as `DATABASE_URL` if your provider doesn't distinguish. |
| `GEMINI_API_KEY` | Google AI Studio key. Also paste it into Vapi's Google integration so calls bill against your own free tier. |
| `VAPI_API_KEY` | Vapi private API key, used by `npm run agent:deploy`. |
| `VAPI_PHONE_NUMBER_ID` | The Vapi id of your number. It's a UUID, not the number itself. |
| `VAPI_ASSISTANT_ID` | Set after the first deploy so later runs update the same assistant. |
| `PUBLIC_BASE_URL` | Public https URL of the deployment. Vapi calls back into it for tool calls. |
| `PORT` | Local dev only, defaults to 3000. |

## Deploying

Push to a repo, import it in Vercel, set the environment variables in project settings. The
build runs `prisma generate` through the `vercel-build` script. Migrations aren't part of the
build, since a build shouldn't fail just because a database is briefly unreachable, so run
`npm run db:deploy` once yourself against the production database.

Then point Vapi at the deployment:

```bash
PUBLIC_BASE_URL=https://your-app.vercel.app npm run agent:deploy
```

That reads `system-prompt.md` and `tools.json`, creates the assistant with its tool webhook
aimed at your deployment, attaches your phone number and prints the assistant id.

## API

Responses all use the same envelope. Success is `{"data": ..., "error": null}`, failure is
`{"data": null, "error": "..."}`, and validation failures add a `details` array of
`{field, message}` objects.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/patients` | Filters: `last_name` (case insensitive partial), `date_of_birth`, `phone_number`, `limit` |
| `GET` | `/patients/:id` | 400 on a malformed UUID, 404 if missing or soft deleted |
| `POST` | `/patients` | 201 with the created record |
| `PUT` | `/patients/:id` | Partial update. `PATCH` works too |
| `DELETE` | `/patients/:id` | Soft delete. Sets `deleted_at`, the row stays in the table |
| `GET` | `/` | HTML overview page |
| `GET` | `/dashboard` | HTML list. `?q=` searches last name, or phone when the input is ten digits |
| `GET` | `/dashboard/:id` | HTML detail view for one patient |
| `POST` | `/vapi/tool` | Vapi webhook |
| `GET` | `/health` | Liveness |

Status codes: 400 for a malformed request, 422 when the request is well formed but fails
validation, 404 for a missing record, 500 for anything unexpected.

Soft deleted rows are excluded from every read, the duplicate check included. So if a record is
deleted and that person calls back, they come through as new.

## Validation

Field rules live in `src/lib/validation.js`, and the migration adds CHECK constraints behind
them, so a bad row can't get in even through a direct SQL client. Dates of birth can't be in the
future or before 1900. Phone numbers need ten digits with a plausible area and exchange code.
State has to be a real two letter code. ZIP is five digits or ZIP+4.

Names are capped at 50 characters and limited to letters plus hyphens and apostrophes. I allowed
spaces as well, since Van Der Berg is a real surname, and matched on Unicode letters rather than
`A-Z` so that Muñoz and O'Neill both pass. The JS regex and the Postgres CHECK were written to
agree with each other, and I tested the same list of names against both.

Input gets normalised before storage. `(415) 555-0132`, `+1 415 555 0132` and `415.555.0132`
all become `4155550132`, and `tx` becomes `TX`. Dates are stored at UTC midnight so that a
timezone can't shift somebody's birthday by a day. That one bites more often than you'd think.

## Known limitations

There are no automated tests in the repo. I did write throwaway harnesses while building, one
that ran the Express layer against an in memory Prisma stub (45 assertions covering the CRUD
routes, envelopes, status codes, the dashboard and the Vapi webhook) and one that ran
`migration.sql` against a real Postgres engine to confirm the CHECK constraints actually reject
bad rows. Both passed. They were scratch files though, and I didn't spend the time to turn them
into a proper suite. First thing I'd add.

The rest:

- **A dropped call loses the record.** Nothing is written until the caller confirms the read
  back, so if the line dies at minute four there's no partial row to recover. That's a trade I
  made on purpose, since writing partials means half filled records failing NOT NULL plus a
  resume path I didn't have time for, but it's the sharpest edge in the system. The fix is a
  separate `call_sessions` table holding in progress state keyed by call id, so someone who
  rings back picks up where they stopped. Vapi does post an `end-of-call-report` to
  `/vapi/tool` whenever a call ends, and that gets logged, so an abandoned call is at least
  visible in the function logs.
- No auth anywhere. The API and dashboard are open, and the Vapi webhook doesn't check a shared
  secret. That's intentional given the FAQ rules out production hardening, but it's the first
  thing that would have to change.
- The dashboard is read only and unpaginated, capped at 100 rows. There's a detail view per
  patient but no way to edit from the browser. Corrections go through `PUT` or a second call.
- The duplicate check matches on phone number alone, so a family sharing a landline reads as one
  returning patient.
- `migration.sql` is hand written rather than generated, because I had no database to point
  `prisma migrate dev` at while building. It applies cleanly with `migrate deploy` and I checked
  it against a real Postgres engine, but the CHECK constraints can't be expressed in
  `schema.prisma`, so a future `migrate dev` may flag drift and offer to drop them. Keep them.
- Gemini's free tier allows 10 requests a minute. Fine for one caller, not for two.
- Call transcripts aren't stored. Just the final record, plus a line on stdout.

## What I'd do next

Tests first. The harnesses I threw away should be real, with the Vapi webhook cases at the top
of the list, since that's the path with the least visibility when it breaks.

Then a shared secret on the webhook, then storing transcripts and recordings next to the record
so a human can audit what the agent actually heard. A street name the agent heard wrong is invisible
once the call ends, which bothers me more than anything else on this list.

The duplicate check should match on phone plus date of birth rather than phone by itself. The
dashboard needs pagination once there are more than a hundred records, and editing in the
browser would save a phone call whenever someone spots a typo.

Skipped on purpose as out of scope: appointment scheduling, multi language support (the field
gets captured, nothing reads it yet), and anything to do with HIPAA or encryption.

Built by Muhammad Zohaib Farooqui as a take home technical assessment for CareCloud.
[LinkedIn](https://www.linkedin.com/in/zohaib-farooqui-75613a231/) ·
[GitHub](https://github.com/ZohaibFarooqui)
