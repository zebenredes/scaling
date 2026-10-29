/** Normalización y limpieza de leads (Módulo 7 · Limpieza de datos). */

export type LeadInput = {
  company?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  city?: string | null;
  country?: string | null;
  linkedin_url?: string | null;
  rating?: number | null;
  reviews_count?: number | null;
  data?: Record<string, unknown>;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const ROLE_PREFIXES = ["noreply", "no-reply", "donotreply", "postmaster", "abuse", "mailer-daemon"];
const DISPOSABLE = ["mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "yopmail.com"];

const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

const titleCase = (s: string | null) =>
  s ? s.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase()) : null;

export function normalizeEmail(e: string | null | undefined) {
  return e ? e.trim().toLowerCase().replace(/^mailto:/, "") : null;
}

export function normalizePhone(p: string | null | undefined) {
  if (!p) return null;
  const plus = p.trim().startsWith("+");
  const digits = p.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return (plus ? "+" : "") + digits;
}

export function normalizeWebsite(w: string | null | undefined) {
  if (!w) return null;
  const t = w.trim().toLowerCase();
  try {
    const u = new URL(t.startsWith("http") ? t : `https://${t}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** true = sintaxis OK y no es buzón de rol/desechable. */
export function isEmailUsable(email: string | null) {
  if (!email || !EMAIL_RE.test(email)) return false;
  const [local, domain] = email.split("@");
  if (ROLE_PREFIXES.some((p) => local.startsWith(p))) return false;
  return !DISPOSABLE.includes(domain);
}

export function cleanLead(l: LeadInput) {
  const email = normalizeEmail(l.email);
  return {
    company: str(l.company),
    first_name: titleCase(str(l.first_name)),
    last_name: titleCase(str(l.last_name)),
    title: str(l.title),
    email,
    phone: normalizePhone(l.phone),
    website: normalizeWebsite(l.website),
    city: titleCase(str(l.city)),
    country: str(l.country),
    linkedin_url: str(l.linkedin_url),
    email_valid: email ? isEmailUsable(email) : null,
  };
}

/** Clave de deduplicado: email, si no teléfono, si no empresa+web. */
export function dedupeKey(l: { email?: string | null; phone?: string | null; company?: string | null; website?: string | null }) {
  return (
    normalizeEmail(l.email) ??
    normalizePhone(l.phone) ??
    `${(l.company ?? "").toLowerCase()}|${normalizeWebsite(l.website) ?? ""}`
  );
}

/** Mapea un item de Apify / Clay / CSV a nuestro formato. */
export function mapExternalItem(item: Record<string, unknown>): LeadInput {
  const emails = Array.isArray(item.emails) ? (item.emails as unknown[]) : [];
  const fullName = str(item.full_name) ?? str(item.name);
  const [fn, ...ln] = (fullName ?? "").split(" ");
  return {
    company: str(item.company) ?? str(item.company_name) ?? str(item.title) ?? str(item.organization_name),
    first_name: str(item.first_name) ?? str(item.firstName) ?? (item.title ? null : fn || null),
    last_name: str(item.last_name) ?? str(item.lastName) ?? (item.title ? null : ln.join(" ") || null),
    title: str(item.job_title) ?? str(item.position) ?? str(item.headline),
    email: str(item.email) ?? str(emails[0]),
    phone: str(item.phone) ?? str(item.phoneUnformatted) ?? str(item.mobile_number),
    website: str(item.website) ?? str(item.company_website) ?? str(item.domain),
    city: str(item.city),
    country: str(item.country) ?? str(item.countryCode),
    linkedin_url: str(item.linkedin) ?? str(item.linkedin_url) ?? str(item.linkedinUrl),
    rating: num(item.totalScore ?? item.rating),
    reviews_count: num(item.reviewsCount),
    data: item,
  };
}

/** CSV simple con cabecera (soporta comillas dobles y separador , o ;). */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = !q;
      } else if (ch === sep && !q) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = split(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).map((l) => {
    const cells = split(l);
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
  });
}
