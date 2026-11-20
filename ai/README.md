# slvp-ai

The AI behind SLVP, as one Cloudflare Worker: the prompts, the model choice and the provider keys live here.

| Caller | Uses | How it connects |
| --- | --- | --- |
| Backend (`POST /api/chatbot/ask`) | `POST /chat` (STI Vote Buddy) | HTTPS to `https://slvp-ai.<subdomain>.workers.dev` |
| Admin app (`/api/students/convert`) | `POST /import/spec`, `POST /import/names` | `SLVP_AI` service binding |

Callers check who the signed-in user is and what they may see. This worker only checks that the caller is one of ours: every request except `GET /health` needs `Authorization: Bearer <AI_API_TOKEN>`.

## Endpoints

All errors are JSON `{ "message": "..." }`.

- `GET /health` → `{ "ok": true }` (no token)
- `GET /status` → `{ "chat": { "model", "ready" }, "import": { "model", "ready" } }`
- `POST /chat`
  - body: `{ "question": "...", "context": "<election data the user may see>", "history": [{ "role": "user" | "assistant", "content": "..." }] }` (`context` and `history` are optional)
  - → `{ "answer": "...", "model": "..." }`
  - `context` is plain text. Put only the elections this user may see in it (e.g. one line per election with title, status, voting window, positions and candidate counts). The model is told to answer only from it.
- `POST /import/spec`: the file summary from the Students page → `{ "answer": <conversion rules JSON>, "model" }`
- `POST /import/names`: `{ "names": ["ANGELINA KATE MILLENA", ...] }` (up to 100) → `{ "answer": { "splits": [...] }, "model" }`

## Models

Set in `wrangler.jsonc` (`vars`):

- `CHAT_MODEL`: default `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
- `IMPORT_MODEL`: default `openai/gpt-oss-120b`

A model id starting with `@cf/` runs on Workers AI (no key needed; list them with `npx wrangler ai models`). Any other id is a Groq model and needs `GROQ_API_KEY`. For example, `@cf/openai/gpt-oss-120b` runs the import on Workers AI without Groq.

## Setup

Secrets, once per worker (kept across deploys):

```sh
cd ai
npx wrangler secret put AI_API_TOKEN    # a long random value
npx wrangler secret put GROQ_API_KEY    # only for Groq models
cd ../admin
npx wrangler secret put AI_API_TOKEN    # the same value
```

The backend needs the same token and the worker's URL in its own settings.

Deploy `slvp-ai` before the admin app: the admin worker's `SLVP_AI` binding needs it to exist. `.github/workflows/deploy-ai.yml` deploys it on pushes to `main` that touch `ai/`; run that workflow by hand for the first deploy.

## Local development

```sh
cd ai
npm install
npm run dev          # http://localhost:8788
```

`.dev.vars` (gitignored) holds `AI_API_TOKEN` and `GROQ_API_KEY`; `admin/.dev.vars` needs the same `AI_API_TOKEN`. With `npm run dev` running here, the admin app's `next dev` reaches this worker through wrangler's local dev registry. Workers AI models run on Cloudflare even locally, so run `npx wrangler login` once.

## Calling it from the backend (C#)

```csharp
// appsettings: "SlvpAi": { "BaseUrl": "https://slvp-ai.<subdomain>.workers.dev/", "Token": "<AI_API_TOKEN>" }
public sealed class SlvpAiClient(HttpClient http)
{
    public async Task<string> AskAsync(string question, string context, CancellationToken ct = default)
    {
        using var response = await http.PostAsJsonAsync("chat", new { question, context }, ct);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException(body.TryGetProperty("message", out var m) ? m.GetString() : $"slvp-ai: HTTP {(int)response.StatusCode}");
        return body.GetProperty("answer").GetString() ?? "";
    }
}

// Program.cs
builder.Services.AddHttpClient<SlvpAiClient>(c =>
{
    c.BaseAddress = new Uri(builder.Configuration["SlvpAi:BaseUrl"]!);
    c.DefaultRequestHeaders.Authorization = new("Bearer", builder.Configuration["SlvpAi:Token"]);
    c.Timeout = TimeSpan.FromSeconds(90);
});
```

`ChatbotService.AskAsync(question, scope)` can then build `context` from the elections in `scope` and return `SlvpAiClient.AskAsync(question, context)`.
