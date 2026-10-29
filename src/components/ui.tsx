import Link from "next/link";

export function PageHeader({
  title,
  subtitle,
  back,
  children,
}: {
  title: string;
  subtitle?: string;
  back?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {back && (
          <Link href={back} className="muted mb-1 inline-block text-sm hover:underline">
            ← Volver
          </Link>
        )}
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="muted mt-1 text-sm">{subtitle}</p>}
      </div>
      {children && <div className="flex gap-2">{children}</div>}
    </div>
  );
}

export function Field({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  required,
  textarea,
  rows = 4,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number | null;
  placeholder?: string;
  required?: boolean;
  textarea?: boolean;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {textarea ? (
        <textarea
          name={name}
          rows={rows}
          className="input"
          defaultValue={defaultValue ?? undefined}
          placeholder={placeholder}
          required={required}
        />
      ) : (
        <input
          name={name}
          type={type}
          className="input"
          defaultValue={defaultValue ?? undefined}
          placeholder={placeholder}
          required={required}
        />
      )}
    </label>
  );
}

export function Select({
  label,
  name,
  options,
  defaultValue,
}: {
  label: string;
  name: string;
  options: readonly (string | { value: string; label: string })[];
  defaultValue?: string | null;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select name={name} className="input" defaultValue={defaultValue ?? undefined}>
        {options.map((o) => {
          const { value, label } = typeof o === "string" ? { value: o, label: o } : o;
          return (
            <option key={value} value={value}>
              {label}
            </option>
          );
        })}
      </select>
    </label>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="muted py-6 text-center text-sm">{children}</p>;
}

/** Aviso tras una acción (?ok= / ?error= en la URL). */
export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <div
      className={`mb-4 rounded-lg px-4 py-2 text-sm ${
        error ? "bg-red-500/10 text-red-600" : "bg-emerald-500/10 text-emerald-600"
      }`}
    >
      {error ?? ok}
    </div>
  );
}

export function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });
}
