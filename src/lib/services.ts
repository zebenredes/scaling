/** Catálogo de los 7 servicios de la agencia (navegación + dashboard). */
export const SERVICES = [
  {
    slug: "captacion",
    n: 1,
    name: "Captación de clientes",
    short: "ICP, scraping (Google Maps, decisores, Clay), limpieza de datos",
    table: "leads",
  },
  {
    slug: "cold-email",
    n: 2,
    name: "Cold Email Marketing IA",
    short: "Secuencias personalizadas con IA y envío automático",
    table: "email_campaigns",
  },
  {
    slug: "ads",
    n: 3,
    name: "ADS IA Automatizados",
    short: "Campañas y creatividades generadas con IA para Meta, Google, TikTok",
    table: "ad_campaigns",
  },
  {
    slug: "social",
    n: 4,
    name: "Automatización de Redes Sociales",
    short: "Calendario de contenido generado y publicado automáticamente",
    table: "social_posts",
  },
  {
    slug: "crm",
    n: 5,
    name: "CRM Inteligente",
    short: "Contactos, pipeline y scoring con IA; sincroniza con GoHighLevel",
    table: "contacts",
  },
  {
    slug: "agentes-texto",
    n: 6,
    name: "Agente IA de Texto",
    short: "Chatbots para web y WhatsApp con base de conocimiento",
    table: "text_agents",
  },
  {
    slug: "agentes-voz",
    n: 7,
    name: "Agente IA de Voz",
    short: "Smart Calling: llamadas salientes y entrantes con IA",
    table: "voice_agents",
  },
] as const;
