import Link from "next/link";
import { getCtx } from "@/lib/context";
import { SERVICES } from "@/lib/services";
import { logout } from "@/app/login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, workspaceName } = await getCtx();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside
        className="w-full shrink-0 border-b p-4 md:sticky md:top-0 md:h-screen md:w-64 md:border-r md:border-b-0"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <Link href="/dashboard" className="block">
          <div className="text-lg font-semibold">Scaling</div>
          <div className="muted truncate text-xs">{workspaceName}</div>
        </Link>
        <nav className="mt-6 flex flex-wrap gap-1 text-sm md:flex-col">
          <NavLink href="/dashboard">Dashboard</NavLink>
          <NavLink href="/clientes">Clientes de la agencia</NavLink>
          <div className="muted mt-3 hidden px-2 text-xs font-medium uppercase md:block">Servicios</div>
          {SERVICES.map((s) => (
            <NavLink key={s.slug} href={`/${s.slug}`}>
              <span className="muted mr-1 tabular-nums">{s.n}.</span> {s.name}
            </NavLink>
          ))}
        </nav>
        <form action={logout} className="mt-6 hidden md:block">
          <div className="muted mb-2 truncate text-xs">{user.email}</div>
          <button className="btn-ghost w-full">Cerrar sesión</button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-md px-2 py-1.5 hover:bg-black/5">
      {children}
    </Link>
  );
}
