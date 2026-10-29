import "server-only";

/**
 * Integraciones externas. Cada una lanza IntegrationNotConfigured si falta su
 * variable de entorno, para que la UI pueda avisar sin romperse.
 */
export class IntegrationNotConfigured extends Error {
  constructor(envVar: string) {
    super(`Falta configurar ${envVar} en las variables de entorno`);
  }
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new IntegrationNotConfigured(name);
  return v;
}

async function json<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------- Email (Resend)
export async function sendEmail(msg: { from: string; to: string; subject: string; text: string }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify(msg),
  });
  return json<{ id: string }>(res, "Resend");
}

// ---------------------------------------------------------------- Scraping (Apify)
export const APIFY_ACTORS = {
  google_maps: "compass~crawler-google-places",
  decision_makers: "code_crafter~leads-finder",
  complex: "apify~google-search-scraper",
} as const;

export async function startApifyRun(actor: string, input: unknown) {
  const res = await fetch(`https://api.apify.com/v2/acts/${actor}/runs?token=${env("APIFY_TOKEN")}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const { data } = await json<{ data: { id: string; status: string } }>(res, "Apify");
  return data;
}

export async function getApifyRun(runId: string) {
  const token = env("APIFY_TOKEN");
  const run = await json<{ data: { status: string; defaultDatasetId: string } }>(
    await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`),
    "Apify",
  );
  if (run.data.status !== "SUCCEEDED") return { status: run.data.status, items: [] as Record<string, unknown>[] };
  const items = await json<Record<string, unknown>[]>(
    await fetch(`https://api.apify.com/v2/datasets/${run.data.defaultDatasetId}/items?token=${token}&clean=true`),
    "Apify",
  );
  return { status: run.data.status, items };
}

// ---------------------------------------------------------------- Enrichment (Clay)
export async function pushToClay(rows: Record<string, unknown>[]) {
  const url = env("CLAY_WEBHOOK_URL");
  for (const row of rows) {
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(row) });
  }
}

// ---------------------------------------------------------------- Redes sociales
export async function publishSocialPost(post: {
  id: string;
  platform: string;
  content: string;
  media_url: string | null;
}) {
  const res = await fetch(env("SOCIAL_PUBLISH_WEBHOOK_URL"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(post),
  });
  if (!res.ok) throw new Error(`Webhook de publicación: HTTP ${res.status}`);
  const body = (await res.json().catch(() => ({}))) as { id?: string };
  return { externalId: body.id ?? null };
}

// ---------------------------------------------------------------- GoHighLevel
const GHL = "https://services.leadconnectorhq.com";

export async function upsertGhlContact(c: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  tags?: string[];
}) {
  const res = await fetch(`${GHL}/contacts/upsert`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env("GHL_API_KEY")}`,
      Version: "2021-07-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...c, locationId: env("GHL_LOCATION_ID") }),
  });
  const data = await json<{ contact: { id: string } }>(res, "GoHighLevel");
  return data.contact.id;
}

// ---------------------------------------------------------------- WhatsApp Cloud API
export async function sendWhatsApp(phoneNumberId: string, to: string, text: string) {
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env("WHATSAPP_TOKEN")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
  });
  return json<unknown>(res, "WhatsApp");
}

// ---------------------------------------------------------------- Voz (Vapi)
export async function startVapiCall(opts: {
  customerNumber: string;
  customerName?: string | null;
  assistantId?: string | null;
  assistant?: { firstMessage?: string | null; systemPrompt: string; voice?: string | null };
  metadata: Record<string, string>;
}) {
  const assistant = opts.assistantId
    ? { assistantId: opts.assistantId }
    : {
        assistant: {
          firstMessage: opts.assistant?.firstMessage ?? undefined,
          model: {
            provider: "anthropic",
            model: "claude-opus-5-5",
            messages: [{ role: "system", content: opts.assistant?.systemPrompt ?? "" }],
          },
          ...(opts.assistant?.voice ? { voice: { provider: "11labs", voiceId: opts.assistant.voice } } : {}),
          serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/voice`,
          serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET,
          metadata: opts.metadata,
        },
      };
  const res = await fetch("https://api.vapi.ai/call", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("VAPI_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      phoneNumberId: env("VAPI_PHONE_NUMBER_ID"),
      customer: { number: opts.customerNumber, name: opts.customerName ?? undefined },
      metadata: opts.metadata,
      ...assistant,
    }),
  });
  return json<{ id: string; status: string }>(res, "Vapi");
}
