# A2P 10DLC Registration — Draft Submission (Tyler files)

The Comms hub's SMS channel cannot legally send until this carrier
registration clears (external lead time: brand vetting usually days, campaign
approval days-to-weeks). Per the roadmap this paperwork starts BEFORE the
pipeline is built. Everything below is drafted for filing through Twilio's
console (Messaging → Regulatory Compliance → A2P 10DLC); Tyler reviews,
corrects the legal-entity facts, and submits.

> ⚠️ Two blockers Tyler owns before the SMS channel can go live, independent
> of this filing: (1) legal sign-off on the opt-in disclosure copy (the
> onboarding checkbox ships PLACEHOLDER text — `sms-consent-v1-draft` in
> src/lib/data/creator-contacts.ts), and (2) actual opt-ins: as of 2026-07-24
> creator_contacts holds ZERO sms rows. The portal onboarding collects them
> going forward; a portal-wide "add your number" prompt would accelerate it.

## 1. Brand registration

| Field | Draft value | Notes |
|---|---|---|
| Legal business name | Creators Corner LLC (?) | Use the exact registered entity name — must match EIN records |
| EIN | (Tyler) | Sole-prop filing is possible but gets lower throughput tiers |
| Business type | Private, LLC (?) | |
| Industry | Marketing & Advertising | |
| Website | https://thecreatorscorner.io | Must be live and plausibly related to the messaging use case |
| Address | (Tyler) | Registered business address |
| Contact | (Tyler) + business email on the domain | Avoid gmail for the authorized rep if possible |
| Stock/exchange | Not publicly traded | |

## 2. Campaign registration

| Field | Draft value |
|---|---|
| Campaign use case | **Account Notification** (primary) — alternatives: Marketing if we ever send promotional content; safer to register Marketing up front if contest/prize pushes are planned, mixed use = "Mixed" |
| Campaign description | "Creators Corner is a TikTok Shop creator-management agency. We send account and campaign notifications to affiliate creators who have an existing business relationship with us and have expressly opted in: posting-schedule reminders, contest standings and results, sample-shipment updates, and payout notifications." |
| Message flow / opt-in description | "Creators opt in through their authenticated creator portal (app.tempoapp.ai): during onboarding they may add a phone number and must affirmatively check an unchecked consent box agreeing to receive texts. Consent is recorded with timestamp, IP, user agent, and the exact disclosure version in an append-only audit log. Reply STOP opts out at any time; reply HELP returns support info." |
| Opt-in message (sample) | "Creators Corner: You're opted in to campaign texts. Msg&data rates may apply. Msg frequency varies. Reply HELP for help, STOP to opt out." |
| Opt-out handling | STOP/UNSUBSCRIBE auto-handled by Twilio Advanced Opt-Out; our webhook also flips creator_contacts.consent_status to opted_out and appends a consent event |
| Help handling | HELP returns "Creators Corner: for support email (support address). Reply STOP to opt out." |

### Sample messages (carrier reviewers want 2–5 realistic ones)

1. "Creators Corner: The July contest closes Friday. You're #6 — $412 behind #5. Standings: https://app.tempoapp.ai/creator-dashboard/rankings Reply STOP to opt out"
2. "Creators Corner: Your sample for the serum launch shipped — tracking in your portal. Post window opens Monday. Reply STOP to opt out"
3. "Creators Corner: Reminder — 2 posts left on your July commitment. Your dashboard: https://app.tempoapp.ai/creator-dashboard Reply STOP to opt out"

Notes: every sample carries the brand name + STOP language; links stay on the
registered domain (carriers flag public link shorteners); no SHAFT content.

## 3. Number + throughput

- One local 10DLC number is enough at this roster size (~650 managed
  creators; even a full-roster blast is a few hundred segments).
- Register the number to the campaign AFTER campaign approval; point its
  inbound webhook at the Comms hub's reply endpoint.

## 4. What the pipeline must enforce (build side, independent of filing)

- Send ONLY to creator_contacts rows with channel='sms' AND
  consent_status='opted_in'; skip + surface everyone else, never silently.
- Append every send + delivery receipt + inbound reply to the message log.
- STOP webhook → consent_status='opted_out' + consent event BEFORE Twilio's
  own suppression, so Tempo's UI never shows an opted-out creator as
  reachable.
- Quiet hours: don't send 9pm–9am recipient-local (TCPA safe harbor);
  default to Eastern when the number's region is unknown.
