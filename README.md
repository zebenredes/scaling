# Scaling · Plataforma de Agencia de IA

Panel para operar los 7 servicios de una agencia de IA, construido con **Next.js 15 + Supabase + Claude (Anthropic)**.

| # | Servicio | Ruta | Qué hace |
|---|----------|------|----------|
| 1 | Captación de clientes | `/captacion` | ICP (manual o con IA), listas de leads, scraping (Google Maps, decisores, avatares complejos vía Apify; enrichment con Clay), importación CSV, limpieza (normaliza, deduplica, valida emails) y envío al CRM |
| 2 | Cold Email Marketing IA | `/cold-email` | Campañas, secuencias de 3 pasos escritas por IA, icebreaker personalizado por lead, envío automático con límite diario (Resend) |
| 3 | ADS IA Automatizados | `/ads` | Campañas Meta/Google/TikTok/LinkedIn, creatividades por ángulo con IA, métricas (CTR, CPA) y recomendaciones de optimización |
| 4 | Automatización de Redes Sociales | `/social` | Calendario de contenido generado por IA, programación y publicación automática (webhook a n8n / Make / Zapier) |
| 5 | CRM Inteligente | `/crm` | Pipeline kanban, contactos, historial unificado (chats, llamadas, notas), scoring con IA, sincronización con GoHighLevel |
| 6 | Agente IA de Texto | `/agentes-texto` | Chatbots con base de conocimiento, playground, widget web embebible, WhatsApp Cloud API; captura leads al CRM |
| 7 | Agente IA de Voz | `/agentes-voz` | Agentes telefónicos (Vapi), guion con IA, llamadas salientes, transcripción, resumen y resultado clasificado |

Además: `/clientes` (clientes de la agencia y MRR) y `/dashboard`.

## Puesta en marcha

1. **Base de datos.** En Supabase → SQL Editor, ejecuta
   [`supabase/migrations/20261029000000_init.sql`](supabase/migrations/20261029000000_init.sql).
   (O con la CLI: `supabase link --project-ref ictkunvxphlfxrdtxifc && supabase db push`.)
2. **Variables.** Copia `.env.example` a `.env.local` y rellena al menos
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` y `ANTHROPIC_API_KEY`.
   El resto de integraciones son opcionales: si falta su clave, la UI lo indica sin romperse.
3. **Arrancar.**
   ```bash
   npm install
   npm run dev
   ```
   Abre http://localhost:3000, crea una cuenta y se generará tu workspace con un pipeline por defecto.

## Arquitectura

- **Multi-tenant por workspace.** Cada usuario recibe un workspace al registrarse (trigger `handle_new_user`).
  Todas las tablas llevan `workspace_id` y RLS `is_member(workspace_id)`.
- **Server Actions** para todo el CRUD desde el panel (cliente Supabase con la sesión del usuario → RLS).
- **Endpoints públicos** (`/api/public/chat`, `/api/webhooks/*`, `/api/cron/*`) usan la service role y filtran a mano.
  Webhooks autenticados: WhatsApp por firma `X-Hub-Signature-256`, Vapi por `x-vapi-secret`, cron por `CRON_SECRET`.
- **IA:** [`src/lib/ai.ts`](src/lib/ai.ts) — `claude-opus-5-5` con pensamiento adaptativo, salidas estructuradas
  validadas con Zod y *server-side fallback* si un clasificador rechaza la petición.
- **Integraciones:** [`src/lib/integrations.ts`](src/lib/integrations.ts) (Resend, Apify, Clay, GoHighLevel,
  WhatsApp, Vapi, webhook de publicación social).

## Automatizaciones (cron)

`vercel.json` programa:
- `/api/cron/cold-email` cada hora — envía los pasos vencidos respetando `daily_limit`.
- `/api/cron/social` cada 15 min — publica los posts programados.

> En el plan Hobby de Vercel los cron solo pueden ser diarios; usa Pro o un cron externo
> (`curl -H "Authorization: Bearer $CRON_SECRET" https://tu-app/api/cron/cold-email`).

## Webhooks a configurar

| Servicio | URL |
|----------|-----|
| WhatsApp (Meta) | `https://TU-APP/api/webhooks/whatsapp` — verify token = `WHATSAPP_VERIFY_TOKEN` |
| Vapi | `https://TU-APP/api/webhooks/voice` — secret = `VAPI_WEBHOOK_SECRET` |
| Widget web | `<script src="https://TU-APP/widget.js" data-agent="PUBLIC_KEY" async></script>` |

## Pendiente / siguientes pasos

- Detección automática de respuestas de cold email (hoy se marca "respondió" a mano; conectar inbox o webhook de Resend).
- Conexión directa a las APIs de Meta/Google Ads para subir creatividades y leer métricas (hoy se registran a mano).
- Zona horaria por workspace (las fechas del calendario social usan la del servidor).
