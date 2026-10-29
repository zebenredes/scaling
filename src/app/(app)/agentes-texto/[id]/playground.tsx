"use client";

import { useState, useTransition } from "react";
import { resetPlayground, testAgent } from "../actions";

type Msg = { role: "user" | "assistant"; content: string };

export function Playground({ agentId, initial }: { agentId: string; initial: Msg[] }) {
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  function send(e: React.FormEvent) {
    e.preventDefault();
    const message = text.trim();
    if (!message || pending) return;
    setText("");
    setMsgs((m) => [...m, { role: "user", content: message }]);
    start(async () => {
      try {
        const reply = await testAgent(agentId, message);
        setMsgs((m) => [...m, { role: "assistant", content: reply }]);
      } catch (err) {
        setMsgs((m) => [...m, { role: "assistant", content: `⚠️ ${err instanceof Error ? err.message : "Error"}` }]);
      }
    });
  }

  return (
    <div className="card flex h-[480px] flex-col p-0">
      <div className="flex items-center justify-between border-b px-4 py-2" style={{ borderColor: "var(--line)" }}>
        <span className="text-sm font-semibold">Playground</span>
        <button
          className="muted text-xs hover:underline"
          onClick={() => start(async () => {
            await resetPlayground(agentId);
            setMsgs([]);
          })}
        >
          Reiniciar
        </button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4 text-sm">
        {msgs.length === 0 && <p className="muted text-center">Escribe como si fueras un cliente.</p>}
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 ${
              m.role === "user" ? "ml-auto bg-brand text-white" : "bg-black/5 dark:bg-white/10"
            }`}
          >
            {m.content}
          </div>
        ))}
        {pending && <div className="muted text-xs">Escribiendo…</div>}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t p-3" style={{ borderColor: "var(--line)" }}>
        <input value={text} onChange={(e) => setText(e.target.value)} className="input" placeholder="Mensaje…" />
        <button className="btn" disabled={pending}>
          Enviar
        </button>
      </form>
    </div>
  );
}
