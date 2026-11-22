# Backend spec: live election endpoints (tally and voter QR)

Endpoints the admin portal calls for live elections. All three now exist in SLVP-BE: the tally and timeline in `Endpoints/ElectionTallyEndpoints.cs` (counting in `DB/schemas/election_tally.sql`, run it in the Supabase SQL editor before deploying), the voter QR in `Endpoints/VoterQrEndpoints.cs`. Against an older API the portal shows "not available yet" in their place.

| Endpoint | Used by | What it gives |
|---|---|---|
| `GET /api/admin/elections/{electionId}/tally` | Manage → Overview while voting is open | Unofficial vote counts per position and candidate |
| `GET /api/admin/elections/{electionId}/tally/timeline` | The "bar race" replay in Leading candidates | The same counts over time, from the opening of voting to now |
| `POST /api/admin/elections/{electionId}/voter-qr` | QR viewer (`/elections/{id}/qr`) | A sign-in link for one voter; the portal draws it as a QR |

Frontend code that calls them: `admin/src/services/elections/live.service.ts`.

## Common rules

- **Both endpoints always need a signed-in super admin, whatever `Auth:Enforce` says.** Map them with `.RequireAuthorization(AuthPolicies.SuperAdmin)` directly, not with the `RequireSuperAdmin()` group helper (that one does nothing while `Auth:Enforce` is off). The tally shows results before voting ends, and the QR link signs someone in as a voter, so neither can stay open like the other `/api/admin` endpoints are today.
- JSON is camelCase.
- Errors use the same shape as the voter portal: `{ "error": "Readable sentence." }`. The portal shows the `error` text as it is, so write it for an admin.
- Send `Cache-Control: no-store` on both responses.
- Unknown election: `404 { "error": "Election not found." }`.

---

## 1. `GET /api/admin/elections/{electionId}/tally`

Unofficial counts so far. The portal calls it every 30 seconds per open Manage page while the election is `Ongoing`.

### When it answers

| Election status | Response |
|---|---|
| `Ongoing`, `Completed` | `200` with the counts |
| `Draft`, `Upcoming`, `Cancelled` | `409 { "error": "There are no votes to count yet." }` |

### How to count

Ballots are rows in `votes` for the election. `votes.ballot` maps each position id to the candidate ids picked for it. `cast_vote` always stores every position, with `[]` for a position left empty.

- `ballots`: the number of `votes` rows for the election.
- For each position of the election:
  - each candidate's `votes` is the number of ballots whose list for that position contains the candidate's id. On multi-seat positions (`maxVote` > 1), one ballot can count for several candidates.
  - `abstain` is the number of ballots whose list for that position is missing or empty.
- List **every** position and **every** candidate of the election, with `0` where nobody voted. The portal needs the zeros to show "No votes yet".
- Count in the database, not by loading every ballot into the API. For example, a SQL function the API calls through `db.Rpc("election_tally", …)`:

```sql
create or replace function election_tally(p_election_id text)
returns jsonb
language sql stable as $$
  with b as (
    select ballot from votes where election_id = p_election_id
  ),
  picks as (
    select key as position_id, jsonb_array_elements_text(value) as candidate_id
    from b, jsonb_each(b.ballot)
  )
  select jsonb_build_object(
    'ballots', (select count(*) from b),
    'positions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'positionId', p.id,
        'abstain', (select count(*) from b
                    where coalesce(jsonb_array_length(b.ballot -> p.id), 0) = 0),
        'candidates', coalesce((
          select jsonb_agg(jsonb_build_object(
            'candidateId', c.id,
            'votes', (select count(*) from picks
                      where picks.position_id = p.id and picks.candidate_id = c.id)))
          from candidates c where c.position_id = p.id), '[]'::jsonb)))
      from positions p where p.election_id = p_election_id), '[]'::jsonb)
  );
$$;
```

(Check the table and column names against `DB/schemas`. This is a sketch, not tested.)

### Response `200`

```json
{
  "ballots": 777,
  "positions": [
    {
      "positionId": "POS-00014",
      "abstain": 12,
      "candidates": [
        { "candidateId": "CAND-00025", "votes": 412 },
        { "candidateId": "CAND-00031", "votes": 298 }
      ]
    }
  ]
}
```

The portal works out the leaders, leads, "close race", party shares and the leading party from this. The backend doesn't need to.

---

## 1b. `GET /api/admin/elections/{electionId}/tally/timeline`

The counts over time, for replaying the race from the opening of voting. Same access and status rules as the tally (as built: a signed-in super admin, or an admin of this election, always, even with `Auth:Enforce` off).

- Time runs from the election's `start_date` to now (to `end_date` once it's `Completed`). Each ballot is placed by `votes.created_at`.
- The database counts it in 240 equal steps (`election_vote_buckets`); the API merges them into at most 60 frames.
- **Every frame adds at least `minBallotsPerStep` (5) ballots to the one before.** Admins also see when each voter voted (`voters.voted_at`, stamped in the same transaction as `votes.created_at`), so a frame that adds one ballot would show how that person voted. A tail of fewer than 5 ballots is folded into the final frame.
- The first frame is everyone at zero; the last is the totals now. No ballots yet: only the first frame.

```json
{
  "from": "2026-11-23T00:00:00Z",
  "to": "2026-11-23T05:12:40Z",
  "minBallotsPerStep": 5,
  "frames": [
    { "at": "2026-11-23T00:00:00Z", "ballots": 0, "votes": {} },
    { "at": "2026-11-23T00:08:00Z", "ballots": 37, "votes": { "CAND-00025": 21, "CAND-00031": 14 } },
    { "at": "2026-11-23T05:12:40Z", "ballots": 777, "votes": { "CAND-00025": 412, "CAND-00031": 298 } }
  ]
}
```

`votes` lists running totals by candidate id; a missing candidate has 0. The portal fetches it when the page opens and again whenever the tally's `ballots` changes.

---

## 2. `POST /api/admin/elections/{electionId}/voter-qr`

Makes a **new passcode** for one voter and returns their sign-in link. The QR viewer turns the link into a QR, and the voter scans it to sign in without typing.

Passcodes are stored only as hashes, so the passcode a voter got by email can't be shown again. A new one has to be made, and **it replaces the emailed one**. The portal's page says so.

### Request

```http
POST /api/admin/elections/ELC-00001/voter-qr
Authorization: Bearer <super admin access token>
Content-Type: application/json

{ "studentId": "02000404138" }
```

### Steps

1. Load the election. Not found → `404 { "error": "Election not found." }`.
2. The election must be `Ongoing`. Otherwise → `409 { "error": "Voting isn't open, so there's nothing to sign in to." }`.
3. Find the voter row with this `election_id` and `student_id`. None → `404 { "error": "No voter with student ID 02000404138 in this election." }`.
   - The `error` field matters. The portal reads a 404 **without** an `error` body as "this endpoint doesn't exist yet".
4. Voter already voted (`status = completed` or `vote_id` set) → `409 { "error": "Already voted. There's nothing left to sign in for." }`.
5. Voter deactivated (`is_active = false`) → `409 { "error": "This voter is deactivated, so they can't sign in." }`.
6. `var passcode = Passcodes.Generate();` then save `Passcodes.Hash(passcode)` to `voters.passcode_hash`.
7. Build the link exactly like the login email does (`VoterEmailSender`):
   `$"{LoginUrl}#id={Uri.EscapeDataString(studentId)}&code={Uri.EscapeDataString(passcode)}"`, with `LoginUrl` from `VoterEmails:LoginUrl` (default `https://slvp-voter.kape-dev.space/login`).
8. Return the link.

### Response `200`

```json
{ "loginUrl": "https://slvp-voter.kape-dev.space/login#id=02000404138&code=HP8T-TMWG" }
```

- Include `https://`. The portal adds it if it's missing, but phone cameras only open full URLs.
- The portal also accepts the link as plain text, or under `loginLink`, `link` or `url`. `{ "loginUrl": … }` is preferred.
- Don't return the passcode in any other field, and don't write it to the logs. The `[dry run]` log line in `VoterEmailSender` is a test-mode exception and shouldn't be copied here.

### Security

- **Super admin only, always.** See [Common rules](#common-rules).
- **Rate limit** per admin, e.g. 30 requests a minute, like `voter-login`.
- **Audit log (recommended):** who made a QR for which voter, and when. Every QR invalidates that voter's previous passcode, so this explains "my emailed code stopped working".
- Optional: if the voter portal keeps a wrong-passcode counter for this student number, reset it here, since the admin is handing them a fresh code.

---

## Testing

```bash
API=https://slvp-api.kape-dev.workers.dev
TOKEN=<super admin access token>

# Tally
curl -s -H "Authorization: Bearer $TOKEN" "$API/api/admin/elections/ELC-00029/tally"

# Voter QR
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"studentId":"02000404138"}' "$API/api/admin/elections/ELC-00029/voter-qr"
```

Check that:

- [ ] Both endpoints return `401` without a token and `403` with a non-super-admin token, **even with `Auth:Enforce` off**.
- [ ] The tally lists every position and candidate, zeros included, and `ballots` equals the number of `votes` rows.
- [ ] A position left empty on a ballot counts once in `abstain`.
- [ ] The QR link signs the voter in on the voter site, and the passcode from their email stops working.
- [ ] Voted, deactivated and unknown voters, and elections that aren't `Ongoing`, get the errors above with an `error` body.
