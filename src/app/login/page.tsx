import { login, signup } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form className="card w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Scaling · Agencia IA</h1>
          <p className="muted text-sm">Accede a tu panel de servicios</p>
        </div>
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
        {ok && <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">{ok}</p>}
        <label className="block">
          <span className="label">Nombre de la agencia (solo registro)</span>
          <input name="agency_name" className="input" placeholder="Mi Agencia IA" />
        </label>
        <label className="block">
          <span className="label">Email</span>
          <input name="email" type="email" required className="input" />
        </label>
        <label className="block">
          <span className="label">Contraseña</span>
          <input name="password" type="password" required minLength={6} className="input" />
        </label>
        <div className="flex gap-2">
          <button formAction={login} className="btn flex-1">
            Entrar
          </button>
          <button formAction={signup} className="btn-ghost flex-1">
            Crear cuenta
          </button>
        </div>
      </form>
    </main>
  );
}
