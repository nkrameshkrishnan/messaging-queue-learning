import { useState, useCallback, useEffect, Fragment } from "react";

// ─── Keyframe animations ──────────────────────────────────────────────────────
const ANIM_CSS = `
@keyframes mq-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
@keyframes mq-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes shimmer {
  0%   { background-position: -200% center; }
  100% { background-position:  200% center; }
}
.mq-bounce { animation: mq-bounce 2s ease-in-out infinite; }
.mq-pulse  { animation: mq-pulse 3s ease-in-out infinite; }
.fade-up   { animation: fadeUp 0.38s ease-out forwards; }
* { box-sizing: border-box; }
body {
  background: #f8fafc;
  min-height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  color: #1e293b;
  font-size: 16px;
}
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
button { font-family: inherit; }
`;

// ─── Utilities ────────────────────────────────────────────────────────────────
function topicMatch(pattern, key) {
  const pp = pattern.split(".");
  const kp = key.split(".");
  function go(pi, ki) {
    if (pi === pp.length && ki === kp.length) return true;
    if (pi < pp.length && pp[pi] === "#")
      return go(pi + 1, ki) || (ki < kp.length && go(pi, ki + 1));
    if (pi >= pp.length || ki >= kp.length) return false;
    if (pp[pi] === "*" || pp[pi] === kp[ki]) return go(pi + 1, ki + 1);
    return false;
  }
  return go(0, 0);
}

function hashPartition(key, n = 3) {
  let h = 5381;
  for (const c of key) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
  return h % n;
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  producer: { bg: "rgba(59, 130, 246, 0.10)", border: "#3b82f6", text: "#1d4ed8", glow: "rgba(59, 130, 246, 0.2)" },
  exchange: { bg: "rgba(168, 85, 247, 0.10)", border: "#a855f7", text: "#7c3aed", glow: "rgba(168, 85, 247, 0.2)" },
  queue:    { bg: "rgba(249, 115, 22, 0.10)", border: "#f97316", text: "#c2410c", glow: "rgba(249, 115, 22, 0.2)" },
  consumer: { bg: "rgba(34, 197, 94, 0.10)", border: "#22c55e", text: "#15803d", glow: "rgba(34, 197, 94, 0.2)" },
  stream:   { bg: "rgba(6, 182, 212, 0.10)", border: "#06b6d4", text: "#0e7490", glow: "rgba(6, 182, 212, 0.2)" },
  rpc:      { bg: "rgba(234, 179, 8, 0.10)", border: "#eab308", text: "#92400e", glow: "rgba(234, 179, 8, 0.2)" },
  kafka:    { bg: "rgba(99, 102, 241, 0.10)", border: "#6366f1", text: "#4338ca", glow: "rgba(99, 102, 241, 0.2)" },
  sqs:      { bg: "rgba(245, 158, 11, 0.10)", border: "#f59e0b", text: "#b45309", glow: "rgba(245, 158, 11, 0.2)" },
  dlq:      { bg: "rgba(239, 68, 68, 0.10)", border: "#ef4444", text: "#dc2626", glow: "rgba(239, 68, 68, 0.2)" },
  istio:    { bg: "rgba(14, 165, 233, 0.10)", border: "#0ea5e9", text: "#0369a1", glow: "rgba(14, 165, 233, 0.2)" },
};
const PART_COLORS = ["#6366f1", "#ec4899", "#f59e0b"];

// ─── Shared primitives ────────────────────────────────────────────────────────
function FlowNode({ tok, icon, label, sub, active, dimmed, w = 108 }) {
  return (
    <div style={{
      width: w, minWidth: w, borderRadius: 8, padding: "10px 12px",
      textAlign: "center", transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)", userSelect: "none",
      background: active ? tok.bg : dimmed ? "rgba(248,250,252,0.80)" : tok.bg,
      border: `1.5px solid ${active ? tok.border : dimmed ? "rgba(203,213,225,0.60)" : tok.border}`,
      boxShadow: active ? `0 0 0 3px ${tok.glow}, 0 4px 12px rgba(0,0,0,0.3)` : dimmed ? "none" : "0 2px 8px rgba(0,0,0,0.2)",
      transform: active ? "translateY(-2px)" : "translateY(0)",
      opacity: dimmed ? 0.3 : 1,
    }}>
      <div style={{ fontSize: 22, filter: active ? "none" : dimmed ? "grayscale(1)" : "none" }}>{icon}</div>
      <div style={{
        fontSize: 13, fontWeight: 600, fontFamily: "system-ui, -apple-system, sans-serif", lineHeight: 1.3, marginTop: 4,
        color: active ? tok.border : dimmed ? "#94a3b8" : tok.text,
      }}>{label}</div>
      {sub && (
        <div style={{ fontSize: 12, fontFamily: "monospace", lineHeight: 1.3, marginTop: 3, opacity: 0.7, color: tok.text }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function Arrow({ on, color = "rgba(148,163,184,0.60)", label = "" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", margin: "0 4px", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <div style={{ 
          height: 2, 
          width: 28, 
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", 
          background: on ? `linear-gradient(90deg, ${color}80, ${color})` : "rgba(148,163,184,0.40)",
          borderRadius: 1
        }} />
        <div style={{ 
          width: 0, 
          height: 0,
          borderTop: "4px solid transparent", 
          borderBottom: "4px solid transparent", 
          borderLeft: `6px solid ${on ? color : "rgba(148,163,184,0.40)"}`, 
          transition: "border-color .3s" 
        }} />
      </div>
      {label && <div style={{ fontSize: 11, fontFamily: "monospace", textAlign: "center", marginTop: 4, color: on ? color : "#64748b", maxWidth: 64, fontWeight: 500 }}>{label}</div>}
    </div>
  );
}

function BackArrow({ on, color = "rgba(148,163,184,0.60)", label = "" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", margin: "0 3px", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderRight: `7px solid ${on ? color : "rgba(148,163,184,0.60)"}`, transition: "border-color .35s" }} />
        <div style={{ height: 2, width: 26, transition: "all 0.35s", background: on ? color : "rgba(148,163,184,0.60)" }} />
      </div>
      {label && <div style={{ fontSize: 11, fontFamily: "monospace", textAlign: "center", marginTop: 2, color: on ? color : "#2d3748", maxWidth: 58 }}>{label}</div>}
    </div>
  );
}

function Narrative({ text, color = "#a855f7", step, total }) {
  if (!text) return null;
  return (
    <div style={{
      borderRadius: 10, padding: "16px 18px", fontSize: 16,
      fontFamily: "system-ui, -apple-system, sans-serif", lineHeight: 1.6, transition: "all 0.3s",
      background: `linear-gradient(135deg, ${color}08, ${color}12)`, 
      border: `1px solid ${color}30`, 
      color: "#475569",
      backdropFilter: "blur(8px)"
    }}>
      {step != null && total != null && (
        <div style={{ fontSize: 12, color, fontWeight: 600, marginBottom: 10, letterSpacing: 0.5, textTransform: "uppercase" }}>
          Step {step} of {total}
        </div>
      )}
      {text}
    </div>
  );
}

function StepBar({ current, total, color }) {
  if (current === 0) return null;
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{ 
          height: 4, 
          flex: 1, 
          borderRadius: 2, 
          background: i < current 
            ? `linear-gradient(90deg, ${color}cc, ${color})` 
            : "rgba(203,213,225,0.50)", 
          transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: i < current ? `0 0 8px ${color}40` : "none"
        }} />
      ))}
    </div>
  );
}

function StepBtn({ stage, total, color, onAdvance, onBack }) {
  const fwdLabel = stage === 0
    ? "Start Tutorial"
    : stage >= total
    ? "↺ Restart"
    : `Continue`;
  const canBack = stage > 0 && stage <= total;
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <button onClick={onBack} disabled={!canBack} style={{
        padding: "12px 20px", borderRadius: 8, fontFamily: "system-ui, -apple-system, sans-serif", fontSize: 16,
        fontWeight: 600, border: "none",
        background: canBack ? `${color}15` : "rgba(241,245,249,0.80)",
        color: canBack ? color : "#64748b",
        cursor: canBack ? "pointer" : "not-allowed",
        opacity: canBack ? 1 : 0.4, transition: "all 0.2s", flexShrink: 0,
        boxShadow: canBack ? `0 2px 8px ${color}20` : "none"
      }}>← Back</button>
      <button onClick={onAdvance} style={{
        flex: 1, padding: "12px 24px", borderRadius: 8, fontFamily: "system-ui, -apple-system, sans-serif", fontSize: 16,
        fontWeight: 600, cursor: "pointer", border: "none",
        background: stage === 0 || stage >= total 
          ? `linear-gradient(135deg, ${color}dd, ${color})` 
          : `${color}20`,
        color: stage === 0 || stage >= total ? "#fff" : color, 
        transition: "all 0.2s", 
        textAlign: "center",
        boxShadow: `0 4px 12px ${color}30`
      }}>{fwdLabel}</button>
    </div>
  );
}

function ConceptPanel({ lesson, color }) {
  const accent = color || lesson.color || "#6366f1";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Analogy card */}
      <div style={{
        borderRadius: 14, padding: "18px 18px",
        background: "#ffffff",
        border: `1px solid ${accent}28`,
        boxShadow: `0 0 0 1px ${accent}08`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: accent + "18", border: `1px solid ${accent}30`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
          }}>{lesson.analogy.icon}</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: accent, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 2 }}>Real World Analogy</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", lineHeight: 1.3 }}>{lesson.analogy.scenario}</div>
          </div>
        </div>
        <p style={{ fontSize: 14.5, color: "#64748b", lineHeight: 1.7, margin: 0 }}>{lesson.analogy.text}</p>
      </div>

      {/* Key Terms card */}
      <div style={{
        borderRadius: 14, padding: "16px 18px",
        background: "#ffffff", border: "1px solid #e8edf4",
      }}>
        <div style={{
          fontSize: 12, fontWeight: 700, marginBottom: 14, color: "#64748b",
          letterSpacing: 0.8, textTransform: "uppercase",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span>📚</span> Key Terms
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {lesson.terms.map((t, i) => (
            <div key={i} style={{
              display: "flex", gap: 12, paddingTop: i === 0 ? 0 : 12, paddingBottom: 12,
              borderBottom: i < lesson.terms.length - 1 ? "1px solid #e2e8f0" : "none",
            }}>
              <div style={{
                flexShrink: 0, width: 32, height: 32, borderRadius: 9,
                background: "#e8edf4", display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 17,
              }}>{t.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: "#475569", marginBottom: 2 }}>{t.term}</div>
                <div style={{ fontSize: 13.5, color: "#64748b", lineHeight: 1.6 }}>{t.def}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── CodeBlock: copyable syntax-highlighted code snippet ─────────────────────
function CodeBlock({ code, lang = "python", color = "#166534" }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  const lines = code.split("\n");
  return (
    <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", border: "1px solid #d1fae5", background: "#f0fdf4", marginTop: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 12px", background: "#dcfce7", borderBottom: "1px solid #bbf7d0" }}>
        <span style={{ fontSize: 11, fontFamily: "monospace", color: "#166534", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{lang}</span>
        <button onClick={copy} style={{ fontSize: 11, padding: "2px 10px", borderRadius: 6, border: "1px solid #86efac", background: copied ? "#22c55e" : "#ffffff", color: copied ? "#fff" : "#166534", cursor: "pointer", fontWeight: 600, transition: "all 0.2s", fontFamily: "monospace" }}>
          {copied ? "✓ Copied!" : "Copy"}
        </button>
      </div>
      <pre style={{ margin: 0, padding: "12px 14px", overflowX: "auto", fontFamily: "monospace", fontSize: 13, lineHeight: 1.75, color }}>
        {lines.map((ln, i) => (
          <div key={i} style={{ display: "flex", gap: 12 }}>
            <span style={{ color: "#86efac", userSelect: "none", minWidth: 18, textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
            <span>{ln}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}

// ─── QuizBlock: multiple-choice quiz engine ───────────────────────────────────
function QuizBlock({ questions, color = "#6366f1" }) {
  const [qIdx, setQIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const q = questions[qIdx];
  const confirm = () => {
    if (selected === null) return;
    setConfirmed(true);
    if (selected === q.correct) setScore(s => s + 1);
  };
  const next = () => {
    if (qIdx + 1 >= questions.length) { setFinished(true); return; }
    setQIdx(i => i + 1);
    setSelected(null);
    setConfirmed(false);
  };
  const reset = () => { setQIdx(0); setSelected(null); setConfirmed(false); setScore(0); setFinished(false); };

  if (finished) {
    const pct = Math.round((score / questions.length) * 100);
    const grade = pct >= 80 ? { icon: "🏆", msg: "Excellent! You have mastered this topic.", bg: "#f0fdf4", border: "#86efac", txt: "#166534" }
      : pct >= 60 ? { icon: "👍", msg: "Good effort! Review the tricky spots.", bg: "#fffbeb", border: "#fcd34d", txt: "#92400e" }
      : { icon: "📖", msg: "Worth revisiting the lesson before moving on.", bg: "#fef2f2", border: "#fca5a5", txt: "#991b1b" };
    return (
      <div style={{ borderRadius: 14, padding: "24px 20px", background: grade.bg, border: `1px solid ${grade.border}`, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>{grade.icon}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: grade.txt, marginBottom: 6 }}>{score}/{questions.length} correct ({pct}%)</div>
        <div style={{ fontSize: 14, color: grade.txt, marginBottom: 18, lineHeight: 1.6 }}>{grade.msg}</div>
        <button onClick={reset} style={{ padding: "8px 22px", borderRadius: 8, border: `1px solid ${color}`, background: color, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Try Again</button>
      </div>
    );
  }

  return (
    <div style={{ borderRadius: 14, border: "1px solid #e2e8f0", background: "#ffffff", overflow: "hidden" }}>
      <div style={{ padding: "12px 18px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8fafc" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>{"❓ Knowledge Check  · Q"}{qIdx + 1}/{questions.length}</span>
        <span style={{ fontSize: 13, color: color, fontWeight: 700 }}>Score: {score}</span>
      </div>
      <div style={{ padding: "18px 18px 10px" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", lineHeight: 1.55, marginBottom: 16 }}>{q.question}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {q.options.map((opt, i) => {
            let bg = "#f8fafc", border = "#e2e8f0", txtC = "#334155";
            if (confirmed) {
              if (i === q.correct) { bg = "#f0fdf4"; border = "#86efac"; txtC = "#166534"; }
              else if (i === selected) { bg = "#fef2f2"; border = "#fca5a5"; txtC = "#991b1b"; }
            } else if (i === selected) { bg = color + "12"; border = color + "80"; txtC = "#1e293b"; }
            return (
              <button key={i} onClick={() => !confirmed && setSelected(i)}
                style={{ textAlign: "left", padding: "10px 14px", borderRadius: 9, border: `1.5px solid ${border}`, background: bg, color: txtC, fontSize: 14, cursor: confirmed ? "default" : "pointer", fontFamily: "inherit", lineHeight: 1.5, transition: "all 0.15s" }}>
                <span style={{ fontWeight: 700, marginRight: 8 }}>{["A","B","C","D"][i]}.</span>{opt}
                {confirmed && i === q.correct && <span style={{ float: "right" }}>{"✅"}</span>}
                {confirmed && i === selected && i !== q.correct && <span style={{ float: "right" }}>{"❌"}</span>}
              </button>
            );
          })}
        </div>
        {confirmed && q.explanation && (
          <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 9, background: "#fffbeb", border: "1px solid #fcd34d", fontSize: 13, color: "#78350f", lineHeight: 1.6 }}>
            {"💡 "}<b>Explanation:</b> {q.explanation}
          </div>
        )}
      </div>
      <div style={{ padding: "12px 18px", borderTop: "1px solid #e2e8f0", display: "flex", gap: 10, justifyContent: "flex-end" }}>
        {!confirmed
          ? <button onClick={confirm} disabled={selected === null} style={{ padding: "8px 20px", borderRadius: 8, border: `1px solid ${selected === null ? "#e2e8f0" : color}`, background: selected === null ? "#f1f5f9" : color, color: selected === null ? "#94a3b8" : "#fff", fontWeight: 700, fontSize: 14, cursor: selected === null ? "not-allowed" : "pointer" }}>Check Answer</button>
          : <button onClick={next} style={{ padding: "8px 20px", borderRadius: 8, border: `1px solid ${color}`, background: color, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>{qIdx + 1 >= questions.length ? "See Results →" : "Next →"}</button>
        }
      </div>
    </div>
  );
}

// ─── Lesson metadata ──────────────────────────────────────────────────────────
const LESSONS_META = [
  {
    id: "hello", num: "01", title: "RabbitMQ – Hello World",
    subtitle: "The simplest possible message: one producer, one queue, one consumer.",
    color: "#3b82f6",
    group: "rabbitmq",
    analogy: { icon: "💌", scenario: "Sending a Postcard", text: "You write a postcard (the message) and drop it in a post box (the queue). The postman (consumer) picks it up later. The post box holds your card safely even if the postman isn't there yet — no message is lost." },
    terms: [
      { icon: "📤", term: "Producer", def: "The app that creates and sends messages. Connects to RabbitMQ via pika." },
      { icon: "📦", term: "Queue", def: "A named buffer that holds messages until consumed. Declared with channel.queue_declare()." },
      { icon: "📥", term: "Consumer", def: "The app that reads and processes messages. Subscribes with channel.basic_consume()." },
      { icon: "✅", term: "ACK", def: "Acknowledgement: consumer tells RabbitMQ 'I processed this — delete it.' Without ACK, message stays safe and is re-delivered if consumer crashes." },
    ],
  },
  {
    id: "work", num: "02", title: "RabbitMQ – Work Queues",
    subtitle: "Distribute slow, heavy tasks across multiple workers using round-robin delivery.",
    color: "#f97316", group: "rabbitmq",
    analogy: { icon: "🏭", scenario: "Factory Assembly Line", text: "A manager (producer) hands out work orders. Two workers share the pile — first order to Worker 1, second to Worker 2, third back to Worker 1 (round-robin). If a worker crashes, their task goes back to another worker automatically." },
    terms: [
      { icon: "⚖️", term: "Round-Robin", def: "Messages delivered to workers in turn: Worker 1, Worker 2, Worker 1... equally shared." },
      { icon: "🔒", term: "prefetch_count=1", def: "Fair dispatch: don't give me a new task until I finish the current one. Prevents overloading a slow worker." },
      { icon: "🔄", term: "Durable Queue", def: "Queue survives RabbitMQ restart: queue_declare(durable=True)." },
      { icon: "💾", term: "Persistent Message", def: "Message survives restart: BasicProperties(delivery_mode=PERSISTENT_DELIVERY_MODE)." },
    ],
  },
  {
    id: "pubsub", num: "03", title: "RabbitMQ – Pub/Subscribe",
    subtitle: "One message broadcast to ALL consumers simultaneously via a fanout exchange.",
    color: "#ec4899", group: "rabbitmq",
    analogy: { icon: "📡", scenario: "Live TV Broadcast", text: "A TV station (producer) broadcasts one signal via a transmission tower (fanout exchange). Every TV tuned to that channel (consumer) gets the same show at the same time. Adding a 4th TV doesn't change the station at all." },
    terms: [
      { icon: "🔀", term: "Exchange", def: "A routing hub. Producers send to exchanges, not directly to queues." },
      { icon: "📡", term: "Fanout Exchange", def: "Broadcasts every message to ALL bound queues. Routing keys are ignored." },
      { icon: "🔗", term: "Binding", def: "A link between an exchange and a queue: channel.queue_bind(exchange='logs', queue=q_name)." },
      { icon: "♻️", term: "Exclusive Queue", def: "Auto-deleted when consumer disconnects. Names look like 'amq.gen-XsdfR'." },
    ],
  },
  {
    id: "routing", num: "04", title: "RabbitMQ – Routing",
    subtitle: "Route messages to specific queues by matching exact routing keys with a direct exchange.",
    color: "#a855f7", group: "rabbitmq",
    analogy: { icon: "🏤", scenario: "Post Office Sorting", text: "A post office (direct exchange) receives packages with labels (routing keys). 'error' packages go to the security shelf, 'info' packages go to the log shelf. Packages only reach their matching shelf." },
    terms: [
      { icon: "🎯", term: "Direct Exchange", def: "Routes messages to queues whose binding key exactly matches the message's routing_key." },
      { icon: "🏷️", term: "routing_key", def: "A label on the message: 'error', 'info', 'warning'. The exchange uses this for routing." },
      { icon: "🔗", term: "Binding Key", def: "The label a queue registers with the exchange: queue_bind(routing_key='error')." },
      { icon: "🚫", term: "No Match = Dropped", def: "If no queue matches the routing key, the message is silently discarded." },
    ],
  },
  {
    id: "topics", num: "05", title: "RabbitMQ – Topics",
    subtitle: "Route by wildcard pattern-matching. * matches one word, # matches zero or more words.",
    color: "#06b6d4", group: "rabbitmq",
    analogy: { icon: "📰", scenario: "News Subscriptions", text: "A newsroom publishes 'world.politics', 'sports.football'. Subscribe to 'world.*' (any world story) or '#.football' (football from anywhere). You only get stories matching your pattern." },
    terms: [
      { icon: "🌳", term: "Topic Exchange", def: "Routes using dot-separated keys matched against binding patterns with wildcards." },
      { icon: "⭐", term: "* (star)", def: "Matches exactly ONE word. 'stock.*.nyse' matches 'stock.usd.nyse' but NOT 'stock.nyse'." },
      { icon: "#️⃣", term: "# (hash)", def: "Matches ZERO or MORE words. 'stock.#' matches 'stock', 'stock.usd', 'stock.usd.nyse'." },
      { icon: "🔑", term: "Key Format", def: "Words separated by dots: category.subcategory.detail (e.g. 'animal.rabbit.orange')." },
    ],
  },
  {
    id: "rpc", num: "06", title: "RabbitMQ – RPC",
    subtitle: "Send a request and wait for a reply — like calling a function that runs on a remote server.",
    color: "#eab308", group: "rabbitmq",
    analogy: { icon: "📞", scenario: "Restaurant Phone Order", text: "You call a restaurant (RPC server), give your order + callback number (reply_to queue), and order ID (correlation_id). The restaurant cooks and calls you back on YOUR number. Your order ID ensures the right response reaches the right caller." },
    terms: [
      { icon: "🎲", term: "correlation_id", def: "A unique UUID sent with every request. Server echoes it back so client can match response to request." },
      { icon: "📬", term: "reply_to", def: "Name of the temp queue the client creates to receive the response." },
      { icon: "📨", term: "BasicProperties", def: "pika.BasicProperties(reply_to=callback_queue, correlation_id=corr_id) — metadata on the message." },
      { icon: "⏳", term: "Blocking Wait", def: "Client polls the reply queue until a message with matching correlation_id arrives." },
    ],
  },
  {
    id: "stream-hello", num: "07", title: "RabbitMQ – Streams",
    subtitle: "Streams are persistent, replayable logs — multiple consumers can independently read the same messages.",
    color: "#06b6d4", group: "rabbitmq",
    analogy: { icon: "🎬", scenario: "YouTube Video Library", text: "When you upload a video to YouTube (stream), anyone can watch it — now or later. The video is NOT deleted after the first viewer. A second viewer watches it independently from the beginning. That's the difference from queues: messages persist and can be replayed." },
    terms: [
      { icon: "📜", term: "Stream", def: "An append-only log. Unlike queues, messages are NOT deleted after consumption." },
      { icon: "🔢", term: "Offset", def: "Integer position of a message in the stream. Consumer A at offset 0 reads all; Consumer B at offset 5 skips the first 5." },
      { icon: "🏁", term: "FIRST / LAST", def: "Start from the very beginning (FIRST) or only future messages (LAST)." },
      { icon: "🐍", term: "rstream library", def: "pip install rstream — Python client specifically for RabbitMQ Streams (not pika)." },
    ],
  },
  {
    id: "stream-offset", num: "08", title: "RabbitMQ – Offset Tracking",
    subtitle: "Bookmark your reading position so you can resume exactly where you left off after a restart.",
    color: "#22c55e", group: "rabbitmq",
    analogy: { icon: "🔖", scenario: "Bookmark in a Book", text: "Reading a 1000-page book, you place a bookmark at page 347 before sleep. Next morning you open to page 347 and continue — no restart, no missed pages. Offset tracking is your bookmark in a message stream." },
    terms: [
      { icon: "💾", term: "store_offset()", def: "Saves your position server-side: await consumer.store_offset('my-app', 'mystream', offset)." },
      { icon: "🔍", term: "query_offset()", def: "Retrieves saved position on restart: offset = await client.query_offset('my-app', 'mystream')." },
      { icon: "🛡️", term: "At-least-once", def: "Store offset AFTER processing. If crash before store, worst case = one re-process. Never lose a message." },
      { icon: "📊", term: "OffsetType.OFFSET(n)", def: "Start from a specific offset: ConsumerOffsetSpecification(OffsetType.OFFSET, last_offset + 1)." },
    ],
  },
  // ── RABBITMQ ADVANCED ──────────────────────────────────────────────────────
  {
    id: "rmq-dlx", num: "09", title: "RabbitMQ – Dead Letter Exchanges",
    subtitle: "Route rejected, expired, or nack'd messages to a special exchange for retry with backoff.",
    color: "#ef4444", group: "rabbitmq",
    analogy: { icon: "📮", scenario: "Return-to-Sender Post Office", text: "When a letter can't be delivered (wrong address, expired, refused), the post office doesn't throw it away — it sends it to a special 'Return Mail' department. Dead Letter Exchanges are RabbitMQ's return-mail department for undeliverable messages." },
    terms: [
      { icon: "💀", term: "Dead Letter Exchange (DLX)", def: "An exchange to which RabbitMQ automatically republishes a message when it is rejected, expired via TTL, or overflows a queue length limit." },
      { icon: "⏱️", term: "Message TTL (x-message-ttl)", def: "Per-queue TTL in milliseconds. If a message isn't consumed within the TTL window it becomes 'dead' and is routed to the DLX." },
      { icon: "🔁", term: "Retry with Backoff", def: "Pattern: dead-letter into a holding queue with a TTL (delay), then re-publish to the original exchange. Repeat with increasing delay until max retries." },
      { icon: "🪣", term: "x-dead-letter-exchange", def: "Queue argument that names the exchange dead messages are forwarded to: args={'x-dead-letter-exchange': 'dlx.orders'}." },
    ],
  },
  {
    id: "rmq-confirms", num: "10", title: "RabbitMQ – Publisher Confirms",
    subtitle: "Get an explicit broker acknowledgement for every published message to guarantee no data loss.",
    color: "#8b5cf6", group: "rabbitmq",
    analogy: { icon: "📬", scenario: "Certified Mail with Return Receipt", text: "Sending a regular letter means no guarantee it arrived. Certified mail gives you a signed receipt proving delivery. Publisher Confirms are RabbitMQ's signed receipt for every published message." },
    terms: [
      { icon: "✅", term: "channel.confirm_select()", def: "Puts the channel in Confirm mode. Every subsequent basic_publish gets a delivery tag and the broker sends back an ack (or nack)." },
      { icon: "🔢", term: "Delivery Tag", def: "A monotonically-increasing integer assigned to each published message in confirm mode. Lets you match acks to specific messages." },
      { icon: "👍", term: "Basic.Ack", def: "Broker confirms the message was safely written to disk (persistent) or routed to a consumer (transient). You can now consider it delivered." },
      { icon: "👎", term: "Basic.Nack / Multiple", def: "Broker signals it could not handle the message. The multiple flag can bulk-ack all outstanding delivery tags up to and including the tagged one." },
    ],
  },
  {
    id: "rmq-quorum", num: "11", title: "RabbitMQ – Quorum Queues",
    subtitle: "Raft-based replicated queues that trade memory efficiency for durable, strongly-consistent delivery.",
    color: "#06b6d4", group: "rabbitmq",
    analogy: { icon: "🗳️", scenario: "Democratic Vote for Every Write", text: "Imagine a committee where every decision requires a majority vote. Quorum Queues work the same way: a message is only confirmed when the majority of nodes (quorum) have written it to disk. No single node failure can lose data." },
    terms: [
      { icon: "🏛️", term: "Raft Consensus", def: "Distributed consensus algorithm used by Quorum Queues. Requires a majority (⌊n/2⌋+1) of nodes to acknowledge a write before it is committed." },
      { icon: "👑", term: "Leader Node", def: "One node acts as Raft leader and handles all publishes and consumer deliveries. Followers replicate the log and can become leader on failure." },
      { icon: "📊", term: "x-queue-type: quorum", def: "Queue declaration argument: channel.queue_declare('orders', arguments={'x-queue-type':'quorum'}). Cannot be changed after creation." },
      { icon: "⚡", term: "Delivery Limit", def: "Quorum queues support x-delivery-limit to automatically dead-letter messages that have been nack'd more than N times — poison message protection." },
    ],
  },
  {
    id: "rmq-flow", num: "12", title: "RabbitMQ – Flow Control & Back-pressure",
    subtitle: "How RabbitMQ protects itself from memory and disk exhaustion when producers are faster than consumers.",
    color: "#f59e0b", group: "rabbitmq",
    analogy: { icon: "🚦", scenario: "Highway On-Ramp Metering Light", text: "On busy highways, on-ramp lights turn red to slow down incoming cars and prevent gridlock. RabbitMQ's flow control does the same — it slows down producers automatically when memory or disk thresholds are exceeded." },
    terms: [
      { icon: "🧠", term: "Memory High-Watermark", def: "Default 0.4 (40% of RAM). When exceeded, RabbitMQ blocks all producers and triggers a memory alarm, allowing consumers to drain the backlog." },
      { icon: "💾", term: "Disk Free Low-Watermark", def: "Default 50 MB. If disk free space drops below this, RabbitMQ enters flow control to prevent log exhaustion and data corruption." },
      { icon: "🔒", term: "Connection Blocked", def: "When alarms fire, the broker sends a Connection.Blocked notification to all publishing connections. Publishers must pause until Connection.Unblocked arrives." },
      { icon: "💳", term: "Credit Flow (internal)", def: "Per-process credit-based flow control within the broker. Each Erlang process grants credits to upstream processes; when credits run out, the sender blocks." },
    ],
  },
  {
    id: "rmq-cluster", num: "13", title: "RabbitMQ – Clustering & Fault Tolerance",
    subtitle: "Join multiple RabbitMQ nodes into a cluster for high availability, load distribution, and zero-downtime deploys.",
    color: "#10b981", group: "rabbitmq",
    // NOTE: "14" quiz lesson inserted below
    analogy: { icon: "🏙️", scenario: "City with Multiple Power Stations", text: "A city powered by a single power station goes dark if it fails. Cities with multiple interconnected stations automatically re-route power when one goes down — citizens barely notice. A RabbitMQ cluster does the same for your message streams." },
    terms: [
      { icon: "🔗", term: "Erlang Cookie", def: "Secret shared token used to authenticate nodes joining a cluster. All nodes must have the same cookie in /var/lib/rabbitmq/.erlang.cookie." },
      { icon: "🌐", term: "rabbitmqctl join_cluster", def: "Command to add a node to an existing cluster: rabbitmqctl join_cluster rabbit@node1. Queues and exchanges are shared across all nodes." },
      { icon: "🔀", term: "Network Partition", def: "When nodes lose contact, RabbitMQ must decide whether to pause one side or allow split-brain. Controlled by cluster_partition_handling (pause_minority is safest)." },
      { icon: "🔄", term: "Rolling Upgrade", def: "Upgrade nodes one at a time with no downtime. Remove node → upgrade → rejoin. Quorum queues maintain availability through rolling upgrades automatically." },
    ],
  },
  {
    id: "rmq-quiz", num: "14", title: "RabbitMQ – Knowledge Check",
    subtitle: "Test your understanding of exchanges, durability, quorum queues, DLX, flow control, and more.",
    color: "#f97316", group: "rabbitmq",
    analogy: { icon: "🧠", scenario: "The Practice Exam", text: "A skilled engineer doesn't just read documentation — they quiz themselves until the concepts stick. This knowledge check reveals gaps before they become production incidents." },
    terms: [
      { icon: "📝", term: "7 Questions", def: "Covering exchanges, ACKs, durability, quorum queues, DLX, flow control, and topic routing." },
      { icon: "🎯", term: "Instant Feedback", def: "Each answer is explained immediately so you understand the why, not just the what." },
      { icon: "🏆", term: "80% Target", def: "Score 80% or higher to feel confident moving to a new course." },
    ],
  },
  // ── KAFKA ──────────────────────────────────────────────────────────────────
  {
  id: "kafka-hello", num: "01", title: "Kafka – Hello Kafka — First Message",
    subtitle: "Send your first message: producer, broker, consumer. The essential Kafka workflow.",
    color: "#6366f1", group: "kafka",
    analogy: { icon: "📰", scenario: "Newspaper Route", text: "A newspaper publisher (producer) writes an article and sends it to the printing plant (broker). Carriers (consumers) pick up printed papers and deliver them. The plant is always open and holds papers safely — readers get them when ready." },
    terms: [
      { icon: "💻", term: "Producer", def: "A client app that sends messages to Kafka topics using produce()." },
      { icon: "🗄️", term: "Broker", def: "A Kafka server that stores topic data and serves producers/consumers. Run with kafka-server-start.sh." },
      { icon: "📋", term: "Topic", def: "A named stream of messages. Producers send to topics; consumers read from topics." },
      { icon: "🖥️", term: "Consumer", def: "A client that subscribes to a topic with subscribe() and reads messages with poll()." },
    ],
  },
  {
  id: "kafka-partitions", num: "01", title: "Kafka – Topics & Partitions",
    subtitle: "Kafka splits a topic into ordered partitions. Message keys control which partition a message lands in.",
    color: "#6366f1", group: "kafka",
    analogy: { icon: "📚", scenario: "Library with Numbered Shelves", text: "A library (Kafka broker) has a section called 'orders' (the topic). The section is split into 3 numbered shelves (partitions). Books (messages) with the same author (key) always go on the same shelf — so you can find all of one author's books in one place." },
    terms: [
      { icon: "📋", term: "Topic", def: "A named category of messages — like a named channel or feed. Produced to and consumed from by name." },
      { icon: "🗂️", term: "Partition", def: "An ordered, immutable log of messages. Each topic is split into N partitions for parallelism and scalability." },
      { icon: "🔢", term: "Offset", def: "The sequential position of a message within a partition. Consumers track which offset they've read up to." },
      { icon: "🔑", term: "Message Key", def: "Optional string that determines the partition via hashing. Same key always → same partition. Guarantees ordering per key." },
    ],
  },
  {
  id: "kafka-groups", num: "02", title: "Kafka – Consumer Groups",
    subtitle: "A consumer group shares partitions among members — each partition goes to exactly one consumer in the group.",
    color: "#ec4899", group: "kafka",
    analogy: { icon: "👥", scenario: "Team Project Division", text: "A team of 3 people (consumer group) splits 3 chapters (partitions) of a report between them — each person reads their own chapter in parallel. A second independent team can read the full report too, completely unaffected by the first team." },
    terms: [
      { icon: "👥", term: "Consumer Group", def: "A named group of consumers. Kafka assigns each partition to exactly ONE consumer in the group." },
      { icon: "⚡", term: "Partition Assignment", def: "Kafka assigns partitions automatically. With 3 partitions and 3 consumers: each gets 1. With 4 consumers: 1 sits idle." },
      { icon: "🔄", term: "Rebalance", def: "When consumers join or leave the group, Kafka reassigns partitions automatically." },
      { icon: "📏", term: "Consumer Lag", def: "How far behind a consumer is. Lag = latest offset − committed offset. Monitored with kafka-consumer-groups.sh." },
    ],
  },
  {
  id: "kafka-offsets", num: "03", title: "Kafka – Offsets & Commits",
    subtitle: "Offsets are Kafka's bookmark system. Manual commits give you control; auto-commit trades safety for simplicity.",
    color: "#06b6d4", group: "kafka",
    analogy: { icon: "🔖", scenario: "Reading a Long Book", text: "You read pages 1–50 and place a bookmark at page 50. If you fall asleep before moving the bookmark, tomorrow you re-read some pages (at-least-once). Manual commit = you only move the bookmark after understanding each page. Auto-commit = bookmark moves every 5 minutes whether you finished reading or not." },
    terms: [
      { icon: "🔢", term: "Offset", def: "Unique sequential ID of a message within a partition. Always increases — never recycled." },
      { icon: "💾", term: "Manual Commit", def: "consumer.commit() — call this after processing. Offsets only advance when you decide. Strongest guarantee." },
      { icon: "⏱️", term: "Auto Commit", def: "enable.auto.commit=True. Kafka commits every auto.commit.interval.ms. Convenient but risks silent loss on crash." },
      { icon: "⏮️", term: "Seek / Replay", def: "consumer.seek(TopicPartition(topic, p, 0)) resets to offset 0. Lets you replay all historical messages." },
    ],
  },
  {
  id: "kafka-replication", num: "04", title: "Kafka – Replication",
    subtitle: "Each partition is copied to N brokers. When a leader fails, a follower takes over with no data loss.",
    color: "#f97316", group: "kafka",
    analogy: { icon: "📋", scenario: "Document with Backup Copies", text: "Your lawyer holds the original contract (leader broker). Two colleagues hold certified copies (replicas). If the lawyer disappears, a colleague's copy instantly becomes the official version. The more copies, the safer the data." },
    terms: [
      { icon: "🏆", term: "Leader", def: "The single replica that handles all reads and writes for a partition. Exactly one per partition at any time." },
      { icon: "📎", term: "Follower / Replica", def: "A copy of the partition on another broker. Silently syncs from the leader and becomes leader if needed." },
      { icon: "✅", term: "ISR (In-Sync Replicas)", def: "Replicas fully caught up with the leader. Only ISR members can become the new leader on failover." },
      { icon: "📡", term: "acks Setting", def: "acks=0 no wait · acks=1 leader only · acks=all wait for all ISR. Use acks=all + min.insync.replicas=2 in prod." },
    ],
  },
  {
  id: "kafka-producer", num: "06", title: "Kafka – Producer Internals & Config",
    subtitle: "Master producer settings: batching, compression, acknowledgments, and idempotence.",
    color: "#f97316", group: "kafka",
    analogy: { icon: "📬", scenario: "Bulk Mail Sorting", text: "Instead of mailing letters one-by-one (slow), you batch 100 letters together and mail them as one shipment (fast). You can also compress them (zip) to save space. acks=all means waiting for all post offices to confirm receipt." },
    terms: [
      { icon: "📦", term: "Batching (batch.size)", def: "Accumulate up to N bytes before sending. Default 16KB. Larger batches = better throughput, higher latency." },
      { icon: "⏱️", term: "linger.ms", def: "Wait up to N ms for more messages to arrive before sending a batch. Trades latency for throughput." },
      { icon: "✅", term: "acks Setting", def: "acks=0 (fire-forget), acks=1 (leader only), acks=all (all replicas). Use acks=all + compression in production." },
      { icon: "🔁", term: "Idempotent Producer", def: "enable.idempotence=true deduplicates automatic retries. Each message gets a PID + sequence number." },
    ],
  },
  {
  id: "kafka-schema", num: "07", title: "Kafka – Schema Registry & Avro",
    subtitle: "Use Apache Avro schemas to validate, serialize, and evolve message formats safely.",
    color: "#ec4899", group: "kafka",
    analogy: { icon: "📋", scenario: "Standardized Forms", text: "Instead of writing orders in free text (risky, inconsistent), you fill out a standardized form (schema). Different people fill it differently, but the form structure is always the same. The form can evolve over time while remaining backward compatible." },
    terms: [
      { icon: "📐", term: "Avro Schema", def: "A JSON schema defining message structure: fields, types, defaults. E.g. {\"name\":\"Order\",\"fields\":[{\"name\":\"id\",\"type\":\"string\"}]}" },
      { icon: "🏷️", term: "Schema ID", def: "A unique integer assigned by Schema Registry. Serialized in message header to enable fast deserialization." },
      { icon: "🔄", term: "Compatibility", def: "BACKWARD: new schema reads old data. FORWARD: old schema reads new data. FULL: both. Default is BACKWARD." },
      { icon: "🧬", term: "Schema Evolution", def: "Safely add optional fields with defaults. Consumers with old code still work; new code gets new fields." },
    ],
  },
  {
  id: "kafka-streams-api", num: "08", title: "Kafka – Kafka Streams API",
    subtitle: "Build real-time stream processing topologies: stateless ops, stateful aggregations, windowing.",
    color: "#06b6d4", group: "kafka",
    analogy: { icon: "🏭", scenario: "Assembly Line with Memory", text: "A conveyor belt moves items (stream). Stations can filter (drop defects), transform (paint), or aggregate (collect 10 items for bulk shipment). Some stations remember state (inventory tally); others are stateless (just counting)." },
    terms: [
      { icon: "📊", term: "KStream", def: "An infinite stream of individual records. Stateless operations: filter(), map(), branch()." },
      { icon: "📈", term: "KTable", def: "A changelog-backed table. Latest value per key. Stateful: aggregate(), reduce(). Good for joins." },
      { icon: "🪟", term: "Windowed Aggregation", def: "GroupByKey + TimeWindowedAggregation. E.g. revenue per category every 1 minute (tumbling window)." },
      { icon: "💾", term: "State Store", def: "RocksDB backing KTable or aggregate() state. Persisted locally; restored on restart via changelog topic." },
    ],
  },
  {
  id: "kafka-connect", num: "09", title: "Kafka – Kafka Connect",
    subtitle: "Integrate external systems: pull data from databases, push to data warehouses — no custom code.",
    color: "#a855f7", group: "kafka",
    analogy: { icon: "🔌", scenario: "USB Hub for Data", text: "A USB hub plugs into your computer (Kafka) and connects many devices (databases, warehouses, APIs). Each device has its own driver (connector). Plug and play — no rewiring the computer." },
    terms: [
      { icon: "👷", term: "Worker", def: "A JVM process running Kafka Connect. Executes connectors. Run multiple for fault tolerance." },
      { icon: "🔗", term: "Connector", def: "A plugin (SourceConnector or SinkConnector) that connects Kafka to an external system. E.g. JdbcSourceConnector reads from PostgreSQL." },
      { icon: "⚙️", term: "Task", def: "A unit of work within a connector. A connector spawns 1 or more tasks. Distributed across workers." },
      { icon: "📍", term: "Offset Storage", def: "Kafka Connect tracks read positions (for source) or write positions (for sink) in an internal topic. Survives restarts." },
    ],
  },
  {
    id: "kafka-transactions", num: "05", title: "Kafka – Transactions & EOS",
    subtitle: "Exactly-once semantics: idempotent producers deduplicate retries; transactions make multi-partition writes atomic.",
    color: "#a855f7", group: "kafka",
    analogy: { icon: "🏦", scenario: "Bank Transfer", text: "Moving $100 from Account A to Account B must be atomic — either BOTH the debit and credit happen, or NEITHER does. A transaction wraps both writes. If anything fails mid-way, the whole thing is rolled back. Consumers only see completed transfers, never half-executed ones." },
    terms: [
      { icon: "🔁", term: "At-Least-Once (default)", def: "Producer retries on failure — broker may receive duplicates. Safe only if processing is idempotent." },
      { icon: "🔑", term: "Idempotent Producer", def: "enable.idempotence=True. Each message gets PID + sequence number. Broker silently drops exact duplicates." },
      { icon: "⚛️", term: "Transactional Producer", def: "begin/commit/abort_transaction(). Multiple produce() calls become ONE atomic unit — all or nothing." },
      { icon: "🔒", term: "isolation.level", def: "read_committed: only see committed transactions. read_uncommitted (default): sees in-flight messages too." },
    ],
  },
  {
    id: "kafka-compaction", num: "11", title: "Kafka – Log Compaction",
    subtitle: "A compacted topic keeps only the latest value per key — it acts like a distributed key-value store.",
    color: "#22c55e", group: "kafka",
    analogy: { icon: "📇", scenario: "Address Book Updates", text: "Your address book has Alice's old address. She moves — you update her entry, not add a new row. The old address is gone, the new one kept. Log compaction does the same: a new value for key 'user-1' eventually removes the old message. The log always shows current state, not full history." },
    terms: [
      { icon: "🧹", term: "cleanup.policy=compact", def: "Topic-level setting that enables log compaction. Kafka periodically removes older messages for the same key." },
      { icon: "🏷️", term: "Compaction Key", def: "Compaction is key-based. Only the LATEST message per unique non-null key is retained after compaction runs." },
      { icon: "🪦", term: "Tombstone", def: "Producing value=None for a key marks it for deletion. After compaction, that key disappears from the log." },
      { icon: "📊", term: "KTable (Kafka Streams)", def: "Kafka Streams uses compacted topics as state stores. A KTable is a changelog-backed key-value view of a topic." },
    ],
  },
  {
    id: "kafka-security", num: "12", title: "Kafka – Security: TLS, SASL & ACLs",
    subtitle: "Encrypt communications, authenticate clients, and authorize access with granular ACLs.",
    color: "#ef4444", group: "kafka",
    analogy: { icon: "🔐", scenario: "Hotel Security", text: "TLS is the front desk checking your ID and encrypting your room key. SASL is the security guard verifying who you are. ACLs are the list of which guests can access which rooms. All three together = secure entry, verified identity, and restricted access." },
    terms: [
      { icon: "🔒", term: "TLS/SSL", def: "Encrypts broker-client and broker-broker communication. Requires keystore (server key+cert) and truststore (CA cert)." },
      { icon: "🆔", term: "SASL Authentication", def: "SASL/PLAIN (username/password), SASL/SCRAM-SHA-256 (hashed), SASL/OAUTHBEARER (token). Verifies client identity." },
      { icon: "🛡️", term: "ACL (Access Control List)", def: "Grants or denies operations (Read, Write, Create, Delete, Alter, Describe, etc) to principals on resources (Topic, Group, Cluster)." },
      { icon: "📊", term: "Quotas", def: "Limits client throughput (bytes/sec) and request rate. Prevents one client from overwhelming the cluster." },
    ],
  },
  {
    id: "kafka-production", num: "13", title: "Kafka – Production Project: Real-time Analytics",
    subtitle: "Build an end-to-end e-commerce analytics pipeline: multiple producers, Schema Registry, Streams, and sinks.",
    color: "#22c55e", group: "kafka",
    // NOTE: "14" and "15" inserted below
    analogy: { icon: "🛒", scenario: "E-commerce Data Pipeline", text: "Orders, clicks, and inventory changes stream in. Real-time analytics compute revenue trends. Elasticsearch shows dashboards. S3 archives everything. One coordinated system with no bottlenecks." },
    terms: [
      { icon: "📤", term: "Producers", def: "3 services: orders-producer, clicks-producer, inventory-producer. Each sends to its own topic with idempotent + acks=all." },
      { icon: "📋", term: "Avro Schemas", def: "OrderEvent, ClickEvent, InventoryEvent. Registered in Schema Registry. All producers/consumers use same schemas." },
      { icon: "🏭", term: "Kafka Streams", def: "Topology: orders → aggregate by category with 1-min tumbling window → real-time revenue dashboard." },
      { icon: "📊", term: "Sinks", def: "Elasticsearch for dashboards (via Kafka Connect sink), S3 for data lake (via Kafka Connect S3 sink)." },
    ],
  },
  {
    id: "kafka-metrics-sim", num: "14", title: "Kafka – Live Metrics Simulator",
    subtitle: "Tune producer rate, consumer count, and kill brokers — watch throughput, lag, and partition load react in real time.",
    color: "#6366f1", group: "kafka",
    analogy: { icon: "🎛️", scenario: "Flight Simulator", text: "A pilot trains in a simulator before flying a real aircraft. You would not learn what happens to consumer lag at 2000 msg/s by reading a chart. This simulator makes the consequences of configuration choices viscerally real." },
    terms: [
      { icon: "📈", term: "Consumer Lag", def: "The gap between the latest offset on a partition and the consumer's committed offset. High lag = consumer falling behind producers." },
      { icon: "🔥", term: "Partition Heatmap", def: "Visual representation of load distribution across partitions. Uneven heat reveals hot partitions caused by skewed keys." },
      { icon: "🖥️", term: "Broker Failure", def: "When a broker goes down, Kafka elects new partition leaders from ISR. With replication.factor=3 no data is lost, but there is brief leader election latency." },
    ],
  },
  {
    id: "kafka-quiz", num: "15", title: "Kafka – Knowledge Check",
    subtitle: "Test your understanding of partitions, consumer groups, replication, Kafka Streams, Schema Registry, and log compaction.",
    color: "#6366f1", group: "kafka",
    analogy: { icon: "🧠", scenario: "The Practice Exam", text: "Kafka has many subtle behaviors around partition assignment, acks, and offset management. Quiz yourself to make sure the mental models are solid before moving to production." },
    terms: [
      { icon: "📝", term: "7 Questions", def: "Covering partitioning, consumer groups, acks=all, consumer lag, KTable semantics, Schema Registry, and log compaction." },
      { icon: "🎯", term: "Instant Feedback", def: "Each answer explained so you learn from mistakes immediately." },
      { icon: "🏆", term: "80% Target", def: "Aim for 80%+ before building production pipelines." },
    ],
  },
  // ── SQS ────────────────────────────────────────────────────────────────────
  {
    id: "sqs-hello", num: "01", title: "AWS SQS – Hello SQS — First Queue",
    subtitle: "Send and receive your first message: fully managed, no server to run.",
    color: "#f59e0b", group: "sqs",
    analogy: { icon: "📮", scenario: "Public Mailbox", text: "Drop a postcard in a public mailbox (SQS). Someone picks it up later, reads it, and throws it away. If nobody picks it up, it stays there indefinitely (until max retention). AWS handles the mailbox — you just use the API." },
    terms: [
      { icon: "🎯", term: "Queue", def: "A named SQS queue. Create with CreateQueue API. Messages wait here until consumed." },
      { icon: "💬", term: "Message", def: "A piece of data: JSON, XML, or plain text. Max 256 KB. Sent with SendMessage." },
      { icon: "👻", term: "ReceiptHandle", def: "A unique token returned when you receive a message. Required to delete it." },
      { icon: "⏱️", term: "VisibilityTimeout", def: "After receive, message is hidden from other consumers for N seconds. Default 30s." },
    ],
  },
  {
    id: "sqs-standard", num: "02", title: "AWS SQS – Standard Queue",
    subtitle: "Fully managed queue as a service. No broker to run — AWS handles everything. Receive, process, then delete.",
    color: "#f59e0b", group: "sqs",
    analogy: { icon: "🎫", scenario: "Restaurant Order Tickets", text: "A kitchen printer (SQS) prints order tickets. A cook grabs a ticket (receive), the ticket flips over so no other cook grabs it (visibility timeout). After cooking, the cook throws the ticket away (delete). If the cook forgets, the ticket flips back and another cook can grab it." },
    terms: [
      { icon: "👻", term: "Visibility Timeout", def: "After receiving, the message is hidden from other consumers for N seconds. If not deleted in time, it reappears." },
      { icon: "🎟️", term: "ReceiptHandle", def: "A token returned when you receive a message. You MUST use it to delete the message after processing." },
      { icon: "⏱️", term: "Long Polling", def: "WaitTimeSeconds=20 waits up to 20s for a message. Cheaper than short polling (which returns empty responses instantly)." },
      { icon: "🔁", term: "At-Least-Once", def: "SQS may deliver a message more than once. Your processing code must be idempotent (safe to run twice)." },
    ],
  },
  {
    id: "sqs-polling", num: "03", title: "AWS SQS – Long Polling & Batch Ops",
    subtitle: "Reduce API calls and costs with long polling and batch send/receive.",
    color: "#06b6d4", group: "sqs",
    analogy: { icon: "⏳", scenario: "Waiting in Line", text: "Short poll: check mailbox every second. Usually empty (wasted trips). Long poll: wait outside the mailbox for up to 20 seconds. Someone eventually deposits mail (one efficient trip). Batch: send 10 letters in one trip instead of mailing them individually." },
    terms: [
      { icon: "⏱️", term: "Long Polling", def: "WaitTimeSeconds=20 waits up to 20s for a message. If nothing, returns empty. Cheap: fewer API calls." },
      { icon: "🚀", term: "Short Polling", def: "Default: returns immediately even if empty. Results in wasted API calls and higher costs." },
      { icon: "📦", term: "SendMessageBatch", def: "Send up to 10 messages in one API call. Each has MessageBody and optional MessageAttributes." },
      { icon: "🎁", term: "ReceiveMessageBatch", def: "Receive up to 10 messages in one call. Cheaper than individual ReceiveMessage calls." },
    ],
  },
  {
    id: "sqs-fifo", num: "04", title: "AWS SQS – FIFO & DLQ",
    subtitle: "FIFO queues guarantee strict ordering and exactly-once processing. DLQ catches messages that keep failing.",
    color: "#ef4444", group: "sqs",
    analogy: { icon: "🏪", scenario: "Deli Number Tickets", text: "A deli gives numbered tickets: 1, 2, 3... served in strict order (FIFO). If you show the same ticket twice within 5 minutes, the cashier ignores the duplicate (deduplication). If a customer can't be served 3 times, they're sent to a manager's desk (DLQ) for special handling." },
    terms: [
      { icon: "📋", term: "FIFO Queue", def: "Strict first-in, first-out ordering within a MessageGroupId. Queue name must end in .fifo." },
      { icon: "🆔", term: "MessageDeduplicationId", def: "A unique ID per message. Duplicate sends within 5 minutes are silently discarded — exactly-once delivery." },
      { icon: "🗂️", term: "MessageGroupId", def: "Messages in the same group are ordered strictly. Different groups can be processed in parallel." },
      { icon: "☠️", term: "Dead Letter Queue (DLQ)", def: "A separate queue that receives messages which have failed maxReceiveCount times. Used for debugging and alerting." },
    ],
  },
  {
    id: "sqs-dlq", num: "05", title: "AWS SQS – Dead Letter Queues & Redrive",
    subtitle: "Catch poison pills: messages that fail repeatedly go to DLQ for analysis and recovery.",
    color: "#ef4444", group: "sqs",
    analogy: { icon: "⚠️", scenario: "Undeliverable Mail", text: "If a package is undeliverable 3 times, the post office sends it to a special 'Return to Sender' department (DLQ) instead of discarding it. You can manually review and try again." },
    terms: [
      { icon: "☠️", term: "Dead Letter Queue (DLQ)", def: "A separate queue where messages fail after maxReceiveCount retries. Set with RedrivePolicy on main queue." },
      { icon: "🔂", term: "maxReceiveCount", def: "Number of times a message can be received before going to DLQ. Default 1 receive attempt; can be set higher." },
      { icon: "🆔", term: "ReceiveCount Attribute", def: "Increments each time a consumer receives a message. Visible to the consumer." },
      { icon: "🔙", term: "Redrive Policy", def: "JSON specifying the DLQ ARN and maxReceiveCount. E.g. {\"deadLetterTargetArn\":\"arn:aws:sqs:...:dlq\",\"maxReceiveCount\":\"3\"}" },
    ],
  },
  {
    id: "sqs-lambda", num: "06", title: "AWS SQS + Lambda Event Processing",
    subtitle: "Trigger Lambda functions automatically from SQS messages with built-in batch handling.",
    color: "#a855f7", group: "sqs",
    analogy: { icon: "⚡", scenario: "Delivery Robot", text: "When mail arrives in the mailbox, a robot is automatically triggered. It picks up bundles of mail (batch) and processes them. If some packages are damaged, it reports them and retries, without halting the whole delivery." },
    terms: [
      { icon: "🔗", term: "Event Source Mapping", def: "Link between SQS queue and Lambda. AWS polls the queue automatically and invokes Lambda on new messages." },
      { icon: "📦", term: "Batch Size", def: "How many messages Lambda processes in one invocation. Max 10. Larger batches = fewer invocations, higher latency." },
      { icon: "❌", term: "Partial Batch Failure", def: "Lambda returns batchItemFailures with failed message IDs. SQS retries only those, not the whole batch." },
      { icon: "🔄", term: "Concurrency", def: "Number of concurrent Lambda invocations. Controlled by reserved/provisioned concurrency." },
    ],
  },
  {
    id: "sqs-fanout", num: "07", title: "AWS SQS – SNS + SQS Fan-out",
    subtitle: "Publish once to SNS topic, fan out to multiple SQS queues for independent processing.",
    color: "#f97316", group: "sqs",
    analogy: { icon: "📢", scenario: "News Broadcast", text: "A radio station (SNS topic) broadcasts one announcement. Different receivers (SQS queues) pick it up: email service processes it for email, SMS service for texts, analytics service for tracking. All independent, decoupled." },
    terms: [
      { icon: "📡", term: "SNS Topic", def: "Pub/sub service. Publishers send one message; SNS fans it out to all subscribed SQS queues." },
      { icon: "🔗", term: "Subscription", def: "Connects SNS topic to SQS queue. SNS sends each published message to all subscriber queues." },
      { icon: "🔍", term: "Filter Policy", def: "JSON rules on SNS subscription. Only messages matching the filter policy are delivered to the SQS queue." },
      { icon: "♻️", term: "Decoupling", def: "Each SQS consumer (email, SMS, analytics) works independently. Adding a new consumer doesn't affect existing ones." },
    ],
  },
  {
    id: "sqs-filtering", num: "08", title: "AWS SQS – Message Attributes & Filtering",
    subtitle: "Add structured metadata to messages and filter at the SNS subscription level.",
    color: "#3b82f6", group: "sqs",
    analogy: { icon: "🏷️", scenario: "Envelope Labels", text: "Each envelope has labels: color (priority), region (zone), type (invoice/receipt). Postal worker reads the label and routes to the right bin. SNS filter policies work the same: match on MessageAttributes and only deliver if criteria match." },
    terms: [
      { icon: "📝", term: "MessageAttributes", def: "Key-value pairs attached to SQS/SNS messages. E.g. {\"event_type\":{\"StringValue\":\"order\"},\"priority\":{\"StringValue\":\"high\"}}" },
      { icon: "🔍", term: "Filter Policy", def: "JSON rules on SNS subscription. Match string (exact), string array (any match), numeric (>, <, =), or exists conditions." },
      { icon: "💰", term: "Cost Savings", def: "Filter at subscription level saves money: SNS doesn't fan out to queues that won't receive due to filter mismatch." },
      { icon: "🎯", term: "Attribute Matching", def: "E.g. {\"event_type\":[\"order\",\"payment\"]} matches messages with event_type=order OR event_type=payment." },
    ],
  },
  {
    id: "sqs-security", num: "09", title: "AWS SQS – Security: IAM, KMS & VPC",
    subtitle: "Encrypt messages, control access with IAM, and keep queues private in VPC.",
    color: "#10b981", group: "sqs",
    analogy: { icon: "🔐", scenario: "Secure Postal Service", text: "IAM is the bouncer checking credentials at the door. KMS is locking each envelope before shipping. VPC endpoint is a private tunnel — no internet. All three together = authenticated, encrypted, private." },
    terms: [
      { icon: "🆔", term: "IAM Policy", def: "Grant/deny SQS actions (SendMessage, ReceiveMessage, DeleteMessage) to principals. Attach to users, roles, or resources." },
      { icon: "🔒", term: "SQS Queue Policy", def: "Resource-based policy on the queue itself. Allows cross-account access or specific AWS services." },
      { icon: "🔑", term: "KMS CMK", def: "Customer-Managed Key for envelope encryption. Each message encrypted with KMS before storage, decrypted on receive." },
      { icon: "🌐", term: "VPC Endpoint", def: "Private connection to SQS without internet. Uses Gateway or Interface endpoint. Prevents data exfiltration." },
    ],
  },
  {
    id: "sqs-production", num: "10", title: "AWS SQS – Production Project: Order Processing",
    subtitle: "Build a resilient order pipeline: FIFO queues, DLQs, Lambda, SNS fan-out, and monitoring.",
    color: "#6366f1", group: "sqs",
    analogy: { icon: "🏭", scenario: "Robust Order Fulfillment", text: "Orders arrive in sequence (FIFO). Validation Lambda checks them. Valid orders go to payment queue. Payment Lambda charges card. Success triggers fan-out: email queue (receipt), analytics queue (metrics), inventory queue (stock update). Failures go to DLQ for manual handling. Monitoring tracks lag and errors." },
    terms: [
      { icon: "📋", term: "FIFO Queue", def: "order-queue.fifo. Strict ordering per MessageGroupId (customer ID). Deduplication prevents duplicate processing." },
      { icon: "⚡", term: "Lambda Validators", def: "Triggered by order-queue. Validates orders, checks inventory. Success → payment-queue. Failure → dlq-orders." },
      { icon: "📢", term: "SNS Fan-out", def: "payment-confirmed topic → email-queue, analytics-queue, inventory-queue. Each consumer independent." },
      { icon: "🆘", term: "DLQ Monitoring", def: "CloudWatch alarms on ApproximateNumberOfMessagesVisible in DLQs. PagerDuty alert on failures." },
    ],
  },
  {
    id: "sqs-visibility-sim", num: "11", title: "AWS SQS – Visibility Timeout Simulator",
    subtitle: "Watch how visibility timeout hides messages, triggers redelivery, and eventually routes to the DLQ.",
    color: "#f59e0b", group: "sqs",
    analogy: { icon: "⏱️", scenario: "Vanishing Baggage Claim", text: "A bag (message) comes out on the belt (queue). You grab it (ReceiveMessage) and it disappears from the belt for 30 seconds. If you don't check it in (DeleteMessage) in time, it reappears. After 3 reappearances the airline moves it to lost-and-found (DLQ)." },
    terms: [
      { icon: "⏱️", term: "Visibility Timeout", def: "Period (default 30s) a message is hidden after being received. Consumer must call DeleteMessage before timeout or message reappears." },
      { icon: "🔁", term: "Redelivery", def: "If timeout expires without deletion, SQS makes the message visible again. Another consumer (or the same) may pick it up." },
      { icon: "🔢", term: "ReceiveCount", def: "Tracks how many times a message has been received. When it exceeds maxReceiveCount, SQS routes it to the DLQ." },
      { icon: "💀", term: "Dead-Letter Queue", def: "Holds messages that failed processing maxReceiveCount times. Enables inspection and replay without blocking the main queue." },
    ],
  },
  {
    id: "sqs-cost-calc", num: "12", title: "AWS SQS – Cost Calculator",
    subtitle: "See how batching and long polling slash your monthly SQS bill dramatically.",
    color: "#10b981", group: "sqs",
    analogy: { icon: "💰", scenario: "Taxi vs Bus", text: "Standard polling is like calling a taxi every 20 seconds even if no one needs a ride — expensive and wasteful. Long polling is like a bus that waits up to 20 seconds for passengers (messages) before leaving. Batching is carpooling — 10 passengers in one trip costs the same as one." },
    terms: [
      { icon: "💵", term: "Request Pricing", def: "$0.40 per million requests. First 1 million/month always free. A request = one API call regardless of message count in batch." },
      { icon: "📦", term: "Batch Size (1–10)", def: "Up to 10 messages per ReceiveMessage/SendMessageBatch call. Reduces API calls and cost by up to 10×." },
      { icon: "⏳", term: "Long Polling", def: "WaitTimeSeconds 1–20. SQS waits up to 20s for a message before returning empty. Reduces empty receive calls ~90%." },
      { icon: "🗄️", term: "Extended Client (S3)", def: "Messages >256 KB stored in S3; pointer in SQS. S3 cost: $0.023/GB storage + $0.005/1K PUT + $0.0004/1K GET." },
    ],
  },
  {
    id: "sqs-filter-playground", num: "13", title: "AWS SQS – Filter Policy Playground",
    subtitle: "Build SNS filter policies interactively and see which test messages pass through to your SQS subscription.",
    color: "#8b5cf6", group: "sqs",
    analogy: { icon: "🔍", scenario: "Email Inbox Rules", text: "You subscribe to a mailing list (SNS topic) but only want emails about 'payments' from 'VIP' senders. You set inbox rules (filter policy) so only matching messages land in your inbox (SQS queue). Everything else is silently dropped — your queue stays clean." },
    terms: [
      { icon: "🏷️", term: "Message Attribute", def: "Key-value metadata attached to SNS messages: event_type='payment', priority='high'. Filter policy matches on these." },
      { icon: "📋", term: "Filter Policy", def: "JSON on the SNS subscription. If all conditions match the message attributes, SNS delivers to the subscriber; otherwise drops it." },
      { icon: "🔢", term: "Numeric Match", def: "Filter on number ranges: {\"amount\": [{\"numeric\": [\">=\", 100, \"<\", 1000]}]}. Supports =, !=, <, <=, >, >=, between." },
      { icon: "✅", term: "String Match", def: "Exact values: {\"event_type\": [\"payment\", \"refund\"]}. Also supports prefix, suffix, and anything-but patterns." },
    ],
  },
  {
    id: "sqs-quiz", num: "14", title: "AWS SQS – Knowledge Check",
    subtitle: "Test your SQS mastery: visibility timeout, FIFO, long polling, DLQ, and cost optimisation.",
    color: "#ef4444", group: "sqs",
    analogy: { icon: "🏆", scenario: "Queue Engineer Certification", text: "You've studied visibility timeouts, polling strategies, filter policies, dead-letter queues, and cost math. Now prove you can troubleshoot a production queue under pressure." },
    terms: [
      { icon: "📝", term: "Quiz Format", def: "7 scenario-based questions covering core SQS concepts with immediate feedback and detailed explanations." },
      { icon: "🏆", term: "Scoring", def: "≥80%: Queue Expert. ≥60%: Solid Foundation. <60%: Review recommended. Retry as many times as you like." },
    ],
  },
  // ── Istio ──────────────────────────────────────────────────────────────────
  {
    id: "istio-arch", num: "01", title: "Istio – Architecture & Sidecar",
    subtitle: "Istio adds an Envoy sidecar proxy to every pod, forming a data plane. Istiod is the control plane managing config, certs, and service discovery.",
    color: "#0ea5e9", group: "istio",
    analogy: { icon: "🛂", scenario: "Airport Security", text: "Every passenger (service) must pass through security (Envoy sidecar) before boarding or leaving. Airport management (Istiod) configures which gates are open, who can fly where, and issues boarding passes (TLS certs). Passengers don't handle any of this — it's completely transparent." },
    terms: [
      { icon: "🔷", term: "Envoy Proxy", def: "A high-performance L7 proxy injected as a sidecar container into every pod. Handles all inbound/outbound traffic, metrics, retries, and tracing automatically." },
      { icon: "🧠", term: "Istiod (Control Plane)", def: "The brain of Istio. Combines Pilot (service discovery), Citadel (cert management), and Galley (config validation) into one binary." },
      { icon: "🔗", term: "Data Plane", def: "The network of Envoy sidecars that actually move traffic between services. Configured by Istiod but operates independently once xDS config is pushed." },
      { icon: "💉", term: "Sidecar Injection", def: "When a namespace is labeled istio-injection=enabled, Kubernetes automatically injects an Envoy container into every new pod via a MutatingWebhook." },
    ],
  },
  {
    id: "istio-routing", num: "02", title: "Istio – Traffic Routing",
    subtitle: "VirtualService defines how requests are routed to services. DestinationRule configures policies for destination subsets — load balancing, pools, and TLS.",
    color: "#14b8a6", group: "istio",
    analogy: { icon: "🚦", scenario: "Smart GPS + Road Policy", text: "A VirtualService is the GPS app — it decides which road (v1 or v2) a car takes based on header, URI, or weight. A DestinationRule is the road policy — it sets speed limits (connection pools), retry policies, and which lanes (subsets) exist. Together they give fine-grained traffic control." },
    terms: [
      { icon: "🗺️", term: "VirtualService", def: "Defines routing rules for how requests flow to services. Can split by weight, headers, URI, or method. References DestinationRule subsets for destinations." },
      { icon: "🎯", term: "DestinationRule", def: "Defines named subsets (e.g., version: v1) and traffic policies — load balancing, circuit breaking, connection pools, TLS settings per subset." },
      { icon: "⚖️", term: "Subset", def: "A named group of pods selected by labels (e.g., version: v1). Defined in DestinationRule, referenced by VirtualService route destinations." },
      { icon: "🔁", term: "Retries & Timeouts", def: "VirtualService specifies retry attempts and per-try timeouts. Retries fire automatically on connect-failure, refused-stream, or 503 responses." },
    ],
  },
  {
    id: "istio-canary", num: "03", title: "Istio – Canary Deployments",
    subtitle: "Gradually shift traffic between service versions using weighted routing. Move from 100/0 to 0/100 without touching Kubernetes Deployments or Services.",
    color: "#22c55e", group: "istio",
    analogy: { icon: "🐤", scenario: "Restaurant Soft Launch", text: "A restaurant opens a new chef (v2) but sends only 10% of diners there while 90% still go to the trusted chef (v1). As positive reviews accumulate, more diners shift to v2. If v2 fails, flip back instantly. No diners are re-seated — the routing change is invisible to them." },
    terms: [
      { icon: "⚖️", term: "Weighted Routing", def: "Split traffic by percentage between subsets. VirtualService route weights must sum to 100. No changes to Deployments or Services required." },
      { icon: "📊", term: "Gradual Rollout", def: "Progress 5% → 10% → 25% → 50% → 100%. Validate with error rate and latency metrics at each step. Instant rollback by adjusting weights." },
      { icon: "🎯", term: "Header-Based Routing", def: "Send specific users (beta testers with x-version: v2 header) to v2 while all others get v1. Useful for internal dogfooding." },
      { icon: "🔀", term: "Traffic Mirroring", def: "Send 100% live traffic to v1 AND an async copy to v2. v2 responses are discarded — zero user impact, but v2 processes real production load." },
    ],
  },
  {
    id: "istio-fault", num: "04", title: "Istio – Fault Injection",
    subtitle: "Inject delays and HTTP aborts into service calls to test resilience — without changing application code. Chaos engineering built into the mesh.",
    color: "#ef4444", group: "istio",
    analogy: { icon: "🧪", scenario: "Fire Drill", text: "Instead of waiting for a real fire (outage), a fire marshal (Istio) randomly locks some doors (delay injection) or triggers alarms (abort injection) to test how staff (services) respond. The drill is invisible to staff — they believe it is real. Weaknesses are found and fixed safely before a real incident." },
    terms: [
      { icon: "⏰", term: "Delay Fault", def: "Artificially adds latency (e.g., 5s) to a percentage of requests before forwarding them. Tests timeout handling and cascading slowness." },
      { icon: "💥", term: "Abort Fault", def: "Returns an HTTP error code (e.g., 503) to a percentage of requests without forwarding them. Tests retry logic and error path handling." },
      { icon: "🎯", term: "Percentage Control", def: "Faults apply to a configurable percentage (e.g., 50%) of matching requests. Non-matching requests route normally — selective chaos." },
      { icon: "🔬", term: "Header-Scoped Faults", def: "Apply faults only when a specific header is present (e.g., x-test-fault: inject). Production traffic is unaffected; only test clients see faults." },
    ],
  },
  {
    id: "istio-circuit", num: "05", title: "Istio – Circuit Breaking",
    subtitle: "Automatically eject failing endpoints from the load balancing pool. Prevents a slow or faulty pod from receiving traffic until it recovers.",
    color: "#f97316", group: "istio",
    analogy: { icon: "⚡", scenario: "Electrical Circuit Breaker", text: "When one wire (pod) overloads with errors, the circuit breaker trips (ejects the pod from the pool). Other wires still carry current. After a cooling-off period (baseEjectionTime), the breaker resets and tries the pod again. The whole circuit is protected from one bad wire." },
    terms: [
      { icon: "🔌", term: "Outlier Detection", def: "Istio monitors each upstream host for consecutive 5xx errors. When the threshold is hit, the host is ejected from the load balancing pool." },
      { icon: "⏱️", term: "Ejection Duration", def: "Ejected host stays out for baseEjectionTime × ejection count. Exponential back-off prevents flapping. Returns to pool after the window expires." },
      { icon: "🔢", term: "Connection Pool Limits", def: "maxConnections, http1MaxPendingRequests, http2MaxRequests — requests exceeding these limits are fast-failed immediately instead of queuing." },
      { icon: "📊", term: "Max Ejection %", def: "Caps how many hosts can be ejected simultaneously (e.g., 50%). Prevents the entire pool being ejected, keeping the service partially available." },
    ],
  },
  {
    id: "istio-gateway", num: "06", title: "Istio – Ingress Gateway",
    subtitle: "The Istio Gateway handles all traffic entering the mesh from outside. Pair it with a VirtualService to route external requests to internal services.",
    color: "#8b5cf6", group: "istio",
    analogy: { icon: "🏢", scenario: "Office Building Lobby", text: "The Gateway is the building reception desk — the only entrance from outside. The receptionist (VirtualService) checks what the visitor needs (host/path) and directs them to the right floor (service). Without the VirtualService receptionist, no one gets past the lobby even if the door is open." },
    terms: [
      { icon: "🚪", term: "Gateway CRD", def: "Configures the istio-ingressgateway pod (a dedicated Envoy) to accept traffic on specific ports, protocols (HTTP/HTTPS/TCP), and hostnames." },
      { icon: "🔐", term: "TLS Termination", def: "The Gateway terminates TLS using a Kubernetes Secret (credentialName). Traffic downstream to services is plain HTTP or re-encrypted mTLS." },
      { icon: "🗺️", term: "VirtualService Binding", def: "A VirtualService references the Gateway name in its gateways field to receive external traffic. Internal mesh services omit this field." },
      { icon: "🔄", term: "HTTPS Redirect", def: "Set httpsRedirect: true on port 80 to auto-redirect HTTP clients to HTTPS. Enforced at the gateway before any service code runs." },
    ],
  },
  {
    id: "istio-mtls", num: "07", title: "Istio – mTLS",
    subtitle: "Mutual TLS encrypts all service-to-service traffic. Both sides present certificates. STRICT mode rejects any plaintext connection in the mesh.",
    color: "#06b6d4", group: "istio",
    analogy: { icon: "🤝", scenario: "Mutual ID Check", text: "In a bank vault room, both the guard AND the visitor show their ID badges before the door opens. Neither trusts the other without cryptographic proof. Istio's mTLS works the same — both caller and receiver present valid certificates before any data flows. No cert means no connection, period." },
    terms: [
      { icon: "🔒", term: "PeerAuthentication", def: "Sets the mTLS mode for a namespace or workload. STRICT rejects non-mTLS traffic. PERMISSIVE accepts both mTLS and plaintext (used during migration)." },
      { icon: "📜", term: "SPIFFE/SVID", def: "Istio issues each service a cryptographic identity in SPIFFE URI format (spiffe://cluster.local/ns/X/sa/Y). Used in mTLS certs and authorization rules." },
      { icon: "🏭", term: "Citadel (inside Istiod)", def: "The CA that issues, rotates, and revokes sidecar certificates automatically every 24 hours. Zero-touch cert lifecycle for the whole mesh." },
      { icon: "🌐", term: "Mesh-Wide mTLS", def: "Applying PeerAuthentication in istio-system namespace sets the policy for the entire mesh — every service-to-service call must use mTLS." },
    ],
  },
  {
    id: "istio-authz", num: "08", title: "Istio – Authorization Policy",
    subtitle: "Fine-grained access control at L4/L7: who can call what. ALLOW or DENY based on service identity, namespace, HTTP method, path, and JWT claims.",
    color: "#ec4899", group: "istio",
    analogy: { icon: "🔑", scenario: "Hotel Key Card System", text: "Each hotel room (service) has its own key card reader (AuthorizationPolicy). Housekeeping (sa/housekeeping) can open rooms but not the safe. Guests (sa/guest) can open only their own room. The front desk (Istiod) issues the key cards. No master key exists — every permission is explicit and granular." },
    terms: [
      { icon: "✅", term: "ALLOW Action", def: "Explicitly allows matching requests. When any ALLOW rule exists, all other traffic is denied by default — implicit deny-all baseline." },
      { icon: "🚫", term: "DENY Action", def: "Explicitly denies matching requests. DENY rules are evaluated before ALLOW rules and always take priority in the evaluation order." },
      { icon: "🆔", term: "Principal", def: "The SPIFFE identity of the calling service (cluster.local/ns/NAMESPACE/sa/SERVICEACCOUNT). Used for service-to-service access control." },
      { icon: "🎫", term: "JWT Claims", def: "AuthorizationPolicy can check JWT token fields (issuer, audience, custom claims) for end-user authorization alongside mTLS service identity." },
    ],
  },
  {
    id: "istio-observe", num: "09", title: "Istio – Observability",
    subtitle: "Istio auto-generates golden signal metrics, distributed traces, and access logs for every service call — zero application code changes required.",
    color: "#eab308", group: "istio",
    analogy: { icon: "🔭", scenario: "Air Traffic Control", text: "Air traffic controllers (Kiali) see every plane (service) on radar, track routes, and spot collisions (errors) before they happen. Each plane's black box (Jaeger) records the full flight path. Ground crew (Prometheus) monitor engine health (metrics) every 15 seconds. Pilots (app developers) fly normally — all monitoring is automatic and invisible." },
    terms: [
      { icon: "📊", term: "Golden Signals", def: "Istio auto-generates the 4 golden signals per service: Latency, Traffic (req/s), Errors (4xx/5xx rate), and Saturation (connection pool usage)." },
      { icon: "🗺️", term: "Kiali", def: "Service graph UI showing real-time traffic flow, health status, and configuration validation. Visualizes VirtualServices, DestinationRules, and mTLS status." },
      { icon: "🔍", term: "Jaeger / Zipkin", def: "Distributed tracing: each request gets a trace ID propagated through all service hops. View end-to-end latency breakdown as a trace waterfall." },
      { icon: "📈", term: "Prometheus + Grafana", def: "Istio exposes metrics on port 15090. Prometheus scrapes them; Grafana dashboards visualize request rates, error rates, and p50/p99/p99 latencies." },
    ],
  },
  // ── Istio – ICA-Complete & Expert Lessons ──────────────────────────────────
  {
    id: "istio-install", num: "10", title: "Istio – Installation & Profiles",
    subtitle: "Istio ships four profiles: minimal, default, demo, and production. IstioOperator lets you customize every control plane component declaratively.",
    color: "#0284c7", group: "istio",
    analogy: { icon: "🏗️", scenario: "Building Blueprints", text: "Like choosing a house blueprint — minimal is a studio apartment (just the structure), default is a family home, demo adds every feature for inspection, and production is a hardened custom build. The IstioOperator CRD is your architect's instruction sheet — change any room without rebuilding from scratch." },
    terms: [
      { icon: "📋", term: "Installation Profiles", def: "demo: all components, for learning. default: control plane + ingress gateway, for most clusters. minimal: control plane only. production: hardened, resource-tuned." },
      { icon: "⚙️", term: "IstioOperator", def: "A CRD that declaratively configures Istio installation — resource limits, replica counts, component toggles, mesh-wide settings. Apply with istioctl install -f operator.yaml." },
      { icon: "🔄", term: "Canary Upgrade", def: "Run two Istio control planes side-by-side (old + new tag). Migrate namespaces one at a time by updating the istio.io/rev label. Zero-downtime upgrade path." },
      { icon: "🏷️", term: "Revision Labels", def: "istio.io/rev=stable on a namespace pins it to a specific Istio revision. Enables gradual upgrades and rollback without cluster-wide disruption." },
    ],
  },
  {
    id: "istio-service-entry", num: "11", title: "Istio – ServiceEntry",
    subtitle: "ServiceEntry registers external services (outside the mesh) into Istio's internal registry, enabling VirtualService routing, mTLS, and traffic policies for egress traffic.",
    color: "#34d399", group: "istio",
    analogy: { icon: "📖", scenario: "Company Phone Directory", text: "The mesh registry is the internal phone directory — only listed numbers can be reached through official channels. ServiceEntry adds an external vendor's number to the directory. Once listed, you can apply call policies (routing rules, retries, TLS) just like internal extensions. Unlisted numbers are either blocked or connect directly without oversight." },
    terms: [
      { icon: "📋", term: "ServiceEntry", def: "Registers an external hostname (e.g., api.payment.com) into Istio's service registry. Enables VirtualService, DestinationRule, and AuthorizationPolicy to apply to external traffic." },
      { icon: "🔒", term: "REGISTRY_ONLY", def: "meshConfig.outboundTrafficPolicy=REGISTRY_ONLY blocks all egress to unregistered hosts. Forced allowlist — every external service must have a ServiceEntry." },
      { icon: "🔐", term: "TLS Origination", def: "Sidecar can upgrade plaintext HTTP to HTTPS toward external services (DestinationRule mode=SIMPLE). The app calls plain HTTP; Envoy adds TLS automatically." },
      { icon: "🌐", term: "MESH_EXTERNAL", def: "location: MESH_EXTERNAL marks the service as outside the mesh. Used with resolution: DNS for dynamically resolved external hosts." },
    ],
  },
  {
    id: "istio-egress", num: "12", title: "Istio – Egress Gateway",
    subtitle: "The Egress Gateway is a dedicated Envoy that funnels all outbound mesh traffic through a single auditable exit point, enabling centralized policy, logging, and TLS.",
    color: "#fb7185", group: "istio",
    analogy: { icon: "🛃", scenario: "Customs Border Control", text: "Without an egress gateway, any employee (pod) can make international calls (external requests) directly — untracked. The egress gateway is customs — every outbound package must pass through one checkpoint. Customs logs it, applies rules, and decides whether to let it through. Suspicious packages are blocked before leaving the building." },
    terms: [
      { icon: "🚪", term: "Egress Gateway Pod", def: "A dedicated istio-egressgateway Envoy in istio-system. Traffic is routed through it via a VirtualService that redirects egress to the gateway before going external." },
      { icon: "📜", term: "ServiceEntry + VS + DR", def: "The pattern: ServiceEntry registers the external host → VirtualService routes mesh traffic to egressgateway → DestinationRule applies TLS origination at the gateway." },
      { icon: "🔍", term: "Centralized Audit", def: "All external calls exit through one pod, making it easy to apply AuthorizationPolicy, capture access logs, and enforce egress-only-via-gateway with NetworkPolicy." },
      { icon: "🔒", term: "mTLS to Gateway", def: "Traffic from sidecar to egress gateway uses mTLS (ISTIO_MUTUAL mode). The gateway terminates mTLS, then applies TLS origination toward the external service." },
    ],
  },
  {
    id: "istio-jwt", num: "13", title: "Istio – JWT Authentication",
    subtitle: "RequestAuthentication validates JWT tokens on incoming requests. Combined with AuthorizationPolicy, it enables end-user identity checks alongside service-to-service mTLS.",
    color: "#a78bfa", group: "istio",
    analogy: { icon: "🎫", scenario: "Concert Ticket + VIP Badge", text: "mTLS is the security guard checking employee badges (service identity). JWT is the concert ticket showing which band you bought tickets for (user claims: role, email, tenant). The door requires BOTH — a valid employee badge to enter the building, plus a ticket that grants access to the specific show. Forged or expired tickets are rejected at the door." },
    terms: [
      { icon: "🔑", term: "RequestAuthentication", def: "Validates JWT tokens in the Authorization header or a cookie. Configures JWKS URI to fetch public keys for signature verification. Invalid tokens = 401." },
      { icon: "📜", term: "JWKS URI", def: "JSON Web Key Set endpoint. Istio fetches public keys from this URL to verify token signatures. Supports Google, Auth0, Keycloak, and any OIDC-compliant provider." },
      { icon: "🎭", term: "JWT Claims in AuthzPolicy", def: "After token validation, claims are available as request.auth.claims[role], [email], etc. AuthorizationPolicy when: conditions can check these for fine-grained access." },
      { icon: "⚡", term: "Missing Token Behavior", def: "RequestAuthentication without AuthorizationPolicy allows requests with no token (just validates if present). Add AuthorizationPolicy requireRequestPrincipal: ['*'] to require tokens." },
    ],
  },
  {
    id: "istio-troubleshoot", num: "14", title: "Istio – Troubleshooting",
    subtitle: "The istioctl CLI is your primary diagnostic tool. Use analyze, proxy-status, and proxy-config to debug routing, mTLS, and configuration issues systematically.",
    color: "#f472b6", group: "istio",
    analogy: { icon: "🔧", scenario: "Car Diagnostics", text: "istioctl analyze is the OBD-II port — plug in and get a list of fault codes and recommended fixes. proxy-status is the dashboard warning lights — which ECU (Envoy) is out of sync. proxy-config is the full diagnostic report — detailed sensor readings for every component. Envoy's admin API is the mechanic's live data stream." },
    terms: [
      { icon: "🔍", term: "istioctl analyze", def: "Scans all Istio configs in a namespace for common mistakes: missing DestinationRule for a VirtualService subset, port name protocol mismatches, host not found errors." },
      { icon: "📡", term: "proxy-status", def: "Shows xDS sync state for every Envoy in the mesh — whether each sidecar has received the latest CDS, LDS, RDS, EDS updates from Istiod. Stale = 'NOT SYNCED'." },
      { icon: "🗺️", term: "proxy-config", def: "Dumps Envoy's actual runtime config: listeners (proxy-config listener), routes (proxy-config route), clusters, endpoints. Shows what Envoy actually does, not what YAML says." },
      { icon: "🌐", term: "Envoy Admin (:15000)", def: "kubectl exec <pod> -c istio-proxy -- curl localhost:15000/config_dump dumps full Envoy config. /stats shows live counters. /clusters shows upstream health." },
    ],
  },
  {
    id: "istio-mirror", num: "15", title: "Istio – Traffic Mirroring",
    subtitle: "Mirror (shadow) live traffic to a second destination. Responses from the mirror are discarded — zero user impact. Validate v2 with real production load before shifting weights.",
    color: "#67e8f9", group: "istio",
    analogy: { icon: "🪞", scenario: "Flight Simulator", text: "Pilots train in a simulator using real flight data — every maneuver, every turbulence — but crashes have no real-world consequences. Traffic mirroring is the flight simulator for your new service version: v2 receives every real production request and must process it, but its responses are thrown away. Bugs are caught before real passengers board." },
    terms: [
      { icon: "🔀", term: "Mirror Field", def: "VirtualService http route mirror: field specifies the shadow destination. mirrorPercentage.value controls what fraction of traffic is copied (0–100)." },
      { icon: "🔇", term: "Responses Discarded", def: "The mirror receives requests and must process them, but Envoy discards the response. The original client only gets the primary response — zero latency impact." },
      { icon: "✏️", term: "Header Manipulation", def: "VirtualService headers: request.add/set/remove fields add, modify, or strip HTTP headers before forwarding. response.add/set modifies headers returned to the client." },
      { icon: "🎯", term: "Use Cases", def: "Shadow testing new versions, pre-warming caches, validating integrations, comparing response bodies between v1 and v2 by logging both in a separate collector service." },
    ],
  },
  {
    id: "istio-sidecar", num: "16", title: "Istio – Sidecar Resource",
    subtitle: "By default every Envoy sidecar tracks ALL services in the mesh. The Sidecar resource scopes each proxy's config to only the services it needs, slashing memory by up to 80% in large meshes.",
    color: "#15803d", group: "istio",
    analogy: { icon: "📦", scenario: "Warehouse Stock List", text: "A warehouse worker (pod) doesn't need the full catalogue of every product in every warehouse worldwide — just the items on today's pick list. By default Istio sends every Envoy the full 10,000-item catalogue. The Sidecar resource is the manager saying: you only need items 42, 67, and 88. Smaller list = faster lookups, less memory, faster config updates." },
    terms: [
      { icon: "📋", term: "Sidecar CRD", def: "Scopes what services an Envoy tracks. egress.hosts controls which namespaces/services appear in the proxy's outbound config. ingress.port configures inbound listeners." },
      { icon: "🌐", term: "Default Sidecar", def: "A Sidecar with no workloadSelector in the root namespace (istio-system or config root) applies to all proxies in the mesh as a baseline policy." },
      { icon: "💾", term: "Memory Savings", def: "Each Envoy needs config for every tracked service endpoint. In a 100-service mesh, scoping to 5 needed services can cut sidecar memory from 200 MB to 40 MB per pod." },
      { icon: "🔗", term: "Egress Hosts Format", def: "hosts format: namespace/service.namespace.svc.cluster.local or ./service (same namespace) or istio-system/* (all services in istio-system)." },
    ],
  },
  {
    id: "istio-lb", num: "17", title: "Istio – Load Balancing",
    subtitle: "Istio supports six load balancing algorithms. CONSISTENT_HASH enables sticky sessions by hashing on a header, cookie, or source IP — critical for stateful services.",
    color: "#fbbf24", group: "istio",
    analogy: { icon: "🎯", scenario: "Supermarket Checkout", text: "ROUND_ROBIN is queuing by rota. LEAST_REQUEST is choosing the shortest queue. RANDOM is picking any open till. CONSISTENT_HASH is always going to the same cashier who knows your loyalty card — your session state (shopping cart) stays with that cashier. If your cashier goes home, a new consistent cashier is assigned and your cart migrates." },
    terms: [
      { icon: "🔄", term: "ROUND_ROBIN / LEAST_REQUEST", def: "Default algorithms. ROUND_ROBIN distributes equally. LEAST_REQUEST picks the upstream with the fewest active requests — better for heterogeneous workloads." },
      { icon: "🗝️", term: "CONSISTENT_HASH", def: "All requests with the same hash value (header, cookie, or src IP) always go to the same backend. Enables sticky sessions without a load balancer session table." },
      { icon: "🍪", term: "Hash on Cookie", def: "DestinationRule loadBalancer.consistentHash.httpCookie: name/ttl. Istio generates the cookie if absent and sets TTL. The client sends it back — sticky routing for free." },
      { icon: "💍", term: "RING_HASH", def: "Like CONSISTENT_HASH but uses a virtual node ring to distribute load more evenly when backends differ in capacity. Tunable via minimumRingSize." },
    ],
  },
  {
    id: "istio-ambient", num: "18", title: "Istio – Ambient Mesh",
    subtitle: "Ambient mode removes per-pod sidecars entirely. A per-node ztunnel handles L4 mTLS, while optional per-namespace waypoint proxies handle L7 policies. Drastically lower resource overhead.",
    color: "#818cf8", group: "istio",
    analogy: { icon: "🌊", scenario: "Water Pipes vs Water Truck", text: "Sidecar mode is a water delivery truck (Envoy) glued to every house — constant overhead even when not in use. Ambient mode is building proper water pipes: ztunnel is the main supply pipe running under every street (node), handling the basics. Waypoint proxies are the pressure regulator valves you add only to buildings (namespaces) that need fine control. Most houses only need the pipe." },
    terms: [
      { icon: "🔷", term: "ztunnel", def: "A Rust-based zero-trust tunnel running as a DaemonSet (one per node). Handles L4 traffic: mTLS identity, basic telemetry, and L4 AuthorizationPolicy. No Envoy overhead." },
      { icon: "🚦", term: "Waypoint Proxy", def: "An optional Envoy-based proxy deployed per-namespace or per-service. Handles L7 features: VirtualService routing, header manipulation, JWT auth, WasmPlugin. Created via Gateway API." },
      { icon: "⚡", term: "Resource Savings", def: "Removing per-pod sidecars cuts ~500 MB RAM and ~0.5 CPU per 10 pods. ztunnel uses ~50 MB per node. Total mesh overhead drops ~60–80% vs sidecar mode." },
      { icon: "🔄", term: "Migration Path", def: "kubectl label namespace demo istio.io/dataplane-mode=ambient replaces the injection label. Sidecar and ambient namespaces can coexist in the same cluster during migration." },
    ],
  },
  {
    id: "istio-wasm", num: "19", title: "Istio – WebAssembly Plugins",
    subtitle: "WasmPlugin extends Envoy with custom filters compiled to WebAssembly — add auth logic, rate limiting, request transformation, or custom telemetry without forking Envoy.",
    color: "#c084fc", group: "istio",
    analogy: { icon: "🔌", scenario: "Browser Extensions", text: "Envoy is the browser — fast and capable but with a fixed feature set. WasmPlugin is the extension store: anyone can publish a plugin that runs inside the browser (Envoy), intercepts pages (requests), modifies content (headers), or blocks malicious sites (rate limiting). Extensions are sandboxed — a buggy plugin crashes its sandbox, not the browser." },
    terms: [
      { icon: "🧩", term: "WasmPlugin CRD", def: "Deploys a Wasm filter to selected workloads. Specifies the .wasm binary URL (OCI registry or HTTP), the phase (AUTHN/AUTHZ/STATS), and per-plugin config as JSON." },
      { icon: "🚀", term: "Proxy-Wasm SDK", def: "Wasm filters are written in Rust, Go, C++, or AssemblyScript using the proxy-wasm ABI. They implement hooks: on_http_request_headers, on_http_response_body, etc." },
      { icon: "⚡", term: "Phase Execution", def: "AUTHN phase runs before mTLS. AUTHZ phase runs after mTLS, before AuthorizationPolicy. STATS phase runs last — good for custom metrics emission." },
      { icon: "🛡️", term: "Sandbox Safety", def: "Wasm runs in a VM inside Envoy. A panicking plugin is caught by the sandbox — Envoy continues serving. Config errors are reported to Istiod without crashing the sidecar." },
    ],
  },
  {
    id: "istio-traffic-sim", num: "20", title: "Istio – Traffic Simulator",
    subtitle: "Control VirtualService weights with a slider, inject faults, and watch the circuit breaker trip — all in real time.",
    color: "#0ea5e9", group: "istio",
    analogy: { icon: "🎮", scenario: "Control Tower Simulator", text: "Air traffic controllers train in simulators before directing real planes. The Istio traffic simulator lets you crash test your mental model of canary deployments, fault injection, and circuit breaking without a real cluster." },
    terms: [
      { icon: "⚖️", term: "VirtualService Weights", def: "Distribute traffic between subsets (e.g. v1 80%, v2 20%). Envoy enforces the split on every request without DNS changes." },
      { icon: "💥", term: "Fault Injection", def: "Envoy can inject latency (delay) or error responses (abort) on a percentage of requests — perfect for chaos testing your downstream error handling." },
      { icon: "🔴", term: "Circuit Breaker", def: "Outlier detection ejects unhealthy hosts. When error rate exceeds threshold, the circuit opens and returns 503 immediately, preventing cascade failures." },
    ],
  },
  {
    id: "istio-quiz", num: "21", title: "Istio – Knowledge Check",
    subtitle: "Test your understanding of sidecars, routing, mTLS, circuit breaking, traffic mirroring, and ServiceEntry.",
    color: "#0ea5e9", group: "istio",
    analogy: { icon: "🧠", scenario: "The Practice Exam", text: "Istio has many interconnected concepts. Quiz yourself to make sure you can confidently explain traffic routing, the control plane, and zero-trust security before configuring production clusters." },
    terms: [
      { icon: "📝", term: "7 Questions", def: "Covering sidecar injection, VirtualService, mTLS, Istiod, circuit breaking, traffic mirroring, and ServiceEntry." },
      { icon: "🎯", term: "Instant Feedback", def: "Explanations reveal the nuance behind each concept." },
      { icon: "🏆", term: "80% Target", def: "Score 80%+ before configuring real cluster traffic management." },
    ],
  },
];

// ─── LESSON 1: Hello World ────────────────────────────────────────────────────
function HelloWorldLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Declare the queue</b><br/><br/>
      <span style={{color:"#166534"}}>channel.queue_declare(queue='hello')</span><br/><br/>
      Safe to call every time — only creates the queue if it doesn't exist yet. Both producer and consumer can declare the same queue.</>,
    <><b style={{color:meta.color}}>Step 2 — Publish a message</b><br/><br/>
      <span style={{color:"#166534"}}>channel.basic_publish(exchange='',<br/>{"    "}routing_key='hello', body='Hello World!')</span><br/><br/>
      exchange='' is the <b>default (nameless) exchange</b>. With it, routing_key is just the queue name.</>,
    <><b style={{color:meta.color}}>Step 3 — Message enters the queue</b><br/><br/>
      Default exchange delivers the message into 'hello'. The message sits here safely even if no consumer is running yet. <b>Producers and consumers are fully decoupled.</b></>,
    <><b style={{color:meta.color}}>Step 4 — Consumer receives the message</b><br/><br/>
      <span style={{color:"#166534"}}>def callback(ch, method, props, body):<br/>{"    "}print(f"Received {"{body}"}")<br/><br/>channel.basic_consume(queue='hello',<br/>{"    "}on_message_callback=callback)</span></>,
    <><b style={{color:meta.color}}>Step 5 — Acknowledgement (ACK)</b><br/><br/>
      <span style={{color:"#166534"}}>ch.basic_ack(delivery_tag=method.delivery_tag)</span><br/><br/>
      ✅ RabbitMQ deletes the message only after ACK.<br/>
      💡 Consumer crashes before ACK? RabbitMQ automatically re-delivers to another consumer!</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:"rgba(248,250,252,0.85)",border:"1px solid rgba(148,163,184,0.40)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:4}}>
          <FlowNode tok={T.producer} icon="💻" label="Producer" sub="send.py" active={stage===1||stage===2}/>
          <Arrow on={stage>=2} color={T.producer.border} label={stage>=2?"routing_key='hello'":""}/>
          <FlowNode tok={T.exchange} icon="⚡" label="Default Exchange" sub="(nameless ∅)" active={stage===2||stage===3} dimmed={stage>0&&stage<2} w={116}/>
          <Arrow on={stage>=3} color={T.exchange.border}/>
          <FlowNode tok={T.queue} icon="📦" label="Queue 'hello'" active={stage===3}/>
          <Arrow on={stage>=4} color={T.queue.border}/>
          <FlowNode tok={T.consumer} icon="🖥️" label="Consumer" sub={stage>=5?"✅ ACK sent":"receive.py"} active={stage===4||stage===5}/>
        </div>
        {stage>=5&&<div style={{marginTop:12,padding:"10px 14px",borderRadius:8,background:"rgba(34, 197, 94, 0.1)",border:"1px solid rgba(34, 197, 94, 0.3)",fontSize: 14,fontFamily:"monospace",color:"#15803d"}}>✅ ACK received → message deleted permanently</div>}
      </div>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
    </div>
  );
}

// ─── LESSON 2: Work Queues ────────────────────────────────────────────────────
function WorkQueuesLesson({ meta }) {
  const STEPS = 6;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const TASKS = [{id:1,label:"Task 1 🖼️"},{id:2,label:"Task 2 📊"},{id:3,label:"Task 3 🎥"},{id:4,label:"Task 4 📝"}];
  const taken = (id) => (id===1&&stage>=3)||(id===2&&stage>=4)||(id===3&&stage>=5)||(id===4&&stage>=6);
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Declare a durable queue</b><br/><br/><span style={{color:"#166534"}}>channel.queue_declare(queue='task_queue', durable=True)</span><br/><br/>durable=True means the queue survives a RabbitMQ restart. Without this, all waiting tasks vanish on restart.</>,
    <><b style={{color:meta.color}}>Step 2 — Send persistent tasks</b><br/><br/><span style={{color:"#166534"}}>channel.basic_publish(exchange='', routing_key='task_queue', body='Task 1',<br/>{"    "}properties=pika.BasicProperties(<br/>{"        "}delivery_mode=pika.DeliveryMode.Persistent))</span><br/><br/>PERSISTENT ensures each message also survives restart. Both queue AND messages must be durable.</>,
    <><b style={{color:meta.color}}>Step 3 — Worker 1 picks Task 1 (round-robin)</b><br/><br/><span style={{color:"#166534"}}>channel.basic_qos(prefetch_count=1)</span><br/><br/>prefetch=1: "Don't give me Task 2 until I ACK Task 1." Prevents a fast worker from being flooded while a slow one sits idle.</>,
    <><b style={{color:meta.color}}>Step 4 — Worker 2 picks Task 2 simultaneously</b><br/><br/>Round-robin: Task 1→Worker 1, Task 2→Worker 2, Task 3→Worker 1, Task 4→Worker 2.<br/><br/>Both workers process <b>in parallel</b> — just add more workers to scale automatically.</>,
    <><b style={{color:meta.color}}>Step 5 — Worker 1 ACKs Task 1 and picks Task 3</b><br/><br/><span style={{color:"#166534"}}>ch.basic_ack(delivery_tag=method.delivery_tag)</span><br/><br/>After ACK, Worker 1 is free and picks up the next available task.</>,
    <><b style={{color:meta.color}}>Step 6 — All 4 tasks complete!</b><br/><br/>💥 <b>Crash scenario:</b> If Worker 1 dies mid-task, its un-ACK'd task is re-queued and delivered to Worker 2. <b>No data ever lost</b> as long as you ACK only after successful processing.</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:"rgba(248,250,252,0.85)",border:"1px solid rgba(148,163,184,0.40)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:14,flexWrap:"wrap"}}>
          <FlowNode tok={T.producer} icon="💻" label="Producer" sub="new_task.py" active={stage===1||stage===2}/>
          <Arrow on={stage>=2} color={T.producer.border} label={stage>=2?"4 tasks":""}/>
          <div style={{flex:1,minWidth:180,borderRadius:8,padding:"10px 12px",border:`1.5px solid ${stage>=1?T.queue.border+"80":"rgba(148,163,184,0.40)"}`,background:T.queue.bg,backdropFilter:"blur(8px)"}}>
            <div style={{fontSize: 13,color:T.queue.text,fontFamily:"system-ui, -apple-system, sans-serif",fontWeight:600,marginBottom:8}}>📦 task_queue {stage>=1?"(durable=True)":""}</div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              {stage>=2?TASKS.map(t=>(
                <div key={t.id} style={{borderRadius:6,padding:"4px 8px",fontSize: 12,fontFamily:"monospace",background:taken(t.id)?"rgba(255,255,255,0.96)":T.queue.border+"30",border:`1px solid ${taken(t.id)?"rgba(148,163,184,0.60)":T.queue.border}`,color:taken(t.id)?"#64748b":T.queue.text,textDecoration:taken(t.id)?"line-through":"none",transition:"all 0.3s"}}>{t.label}</div>
              )):<div style={{fontSize: 12,color:"#64748b",fontFamily:"monospace"}}>empty...</div>}
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:16,paddingLeft:20,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <Arrow on={stage>=3} color={T.queue.border} label={stage>=3?"Task 1,3":""}/>
            <FlowNode tok={T.consumer} icon="⚙️" label="Worker 1" sub={stage>=6?"✅ done":stage>=5?"Task 3...":stage>=3?"Task 1...":"worker.py"} active={stage===3||stage===5}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <Arrow on={stage>=4} color={T.queue.border} label={stage>=4?"Task 2,4":""}/>
            <FlowNode tok={T.consumer} icon="⚙️" label="Worker 2" sub={stage>=6?"✅ done":stage>=4?"Task 2...":"worker.py"} active={stage===4}/>
          </div>
        </div>
      </div>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
    </div>
  );
}

// ─── LESSON 3: Pub/Subscribe ──────────────────────────────────────────────────
function PubSubLesson({ meta }) {
  const STEPS = 4;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Declare a fanout exchange</b><br/><br/><span style={{color:"#166534"}}>channel.exchange_declare(exchange='logs', exchange_type='fanout')</span><br/><br/>The producer now publishes to an <b>exchange</b>, not a queue. fanout = "broadcast to everyone".</>,
    <><b style={{color:meta.color}}>Step 2 — Each consumer creates its own private queue</b><br/><br/><span style={{color:"#166534"}}>result = channel.queue_declare(queue='', exclusive=True)<br/>q_name = result.method.queue  # 'amq.gen-XsdfR'<br/>channel.queue_bind(exchange='logs', queue=q_name)</span><br/><br/>exclusive=True: auto-deleted when consumer disconnects. Each consumer gets their own private queue.</>,
    <><b style={{color:meta.color}}>Step 3 — Producer broadcasts the message</b><br/><br/><span style={{color:"#166534"}}>channel.basic_publish(exchange='logs', routing_key='', body=message)</span><br/><br/>The fanout exchange <b>copies</b> the message to every bound queue simultaneously. routing_key is ignored.</>,
    <><b style={{color:meta.color}}>Step 4 — Both consumers receive independently</b><br/><br/>✅ Consumer A received it (e.g. writes to disk)<br/>✅ Consumer B received the same message (e.g. shows on screen)<br/><br/>💡 Add a 3rd consumer? Zero code changes on the producer side!</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:"rgba(248,250,252,0.85)",border:"1px solid rgba(148,163,184,0.40)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:4,flexWrap:"wrap"}}>
          <FlowNode tok={T.producer} icon="📡" label="Producer" sub="emit_log.py" active={stage===1||stage===3}/>
          <Arrow on={stage>=3} color={T.producer.border}/>
          <FlowNode tok={T.exchange} icon="📡" label="Fanout Exchange" sub="'logs'" active={stage===1||stage===3} w={120}/>
          <div style={{display:"flex",flexDirection:"column",gap:16,marginTop:4}}>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <Arrow on={stage>=3} color={T.exchange.border}/>
              <FlowNode tok={T.queue} icon="📦" label="amq.gen-XsdfR" sub={stage>=2?"Consumer A queue":"not created"} active={stage===2||stage===3} dimmed={stage===1} w={118}/>
              <Arrow on={stage>=4} color={T.queue.border}/>
              <FlowNode tok={T.consumer} icon="🖥️" label="Consumer A" sub={stage>=4?"✅ received!":""} active={stage===4} dimmed={stage<2}/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <Arrow on={stage>=3} color={T.exchange.border}/>
              <FlowNode tok={T.queue} icon="📦" label="amq.gen-Ybc7K" sub={stage>=2?"Consumer B queue":"not created"} active={stage===2||stage===3} dimmed={stage===1} w={118}/>
              <Arrow on={stage>=4} color={T.queue.border}/>
              <FlowNode tok={T.consumer} icon="💻" label="Consumer B" sub={stage>=4?"✅ received!":""} active={stage===4} dimmed={stage<2}/>
            </div>
          </div>
        </div>
      </div>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
    </div>
  );
}

// ─── LESSON 4: Routing ────────────────────────────────────────────────────────
const ROUTING_KEYS_LIST = ["error","warning","info","debug"];
function RoutingLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const [rKey, setRKey] = useState("error");
  const locked = stage > 0 && stage < STEPS;
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const errorMatch = ["error"].includes(rKey);
  const allMatch = ["error","warning","info"].includes(rKey);
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Declare a direct exchange</b><br/><br/><span style={{color:"#166534"}}>channel.exchange_declare(exchange='direct_logs', exchange_type='direct')</span><br/><br/>You chose routing_key=<b>'{rKey}'</b>. Direct exchange = <b>exact match only</b> against binding keys.</>,
    <><b style={{color:meta.color}}>Step 2 — Publish with routing key</b><br/><br/><span style={{color:"#166534"}}>channel.basic_publish(exchange='direct_logs',<br/>{"    "}routing_key='{rKey}', body=message)</span><br/><br/>The exchange checks every bound queue: "does your binding key = '{rKey}'?"</>,
    <><b style={{color:meta.color}}>Step 3 — Exchange checks bindings</b><br/><br/>• queue_errors → bound to ['error'] → {errorMatch?"✅ MATCH!":"❌ no match"}<br/>• queue_all → bound to ['error','warning','info'] → {allMatch?"✅ MATCH!":"❌ no match"}</>,
    <><b style={{color:meta.color}}>Step 4 — Messages delivered</b><br/><br/>{errorMatch?"📨 queue_errors RECEIVES it":"⛔ queue_errors SKIPPED"}<br/>{allMatch?"📨 queue_all RECEIVES it":"⛔ queue_all SKIPPED"}<br/><br/>{!errorMatch&&!allMatch?"⚠️ No matching queue — message is DROPPED silently.":""}</>,
    <><b style={{color:meta.color}}>Step 5 — Consumers process their messages</b><br/><br/>💡 A queue can bind with multiple keys — call queue_bind() multiple times.<br/>💡 Same queue, same exchange, different routing_key each time.<br/><br/>Reset and try a different key to see what gets dropped!</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
        <span style={{fontSize: 13,color:"#475569",fontFamily:"monospace"}}>routing_key:</span>
        {ROUTING_KEYS_LIST.map(k=>(
          <button key={k} disabled={locked} onClick={()=>setRKey(k)} style={{padding:"3px 10px",borderRadius:9999,fontSize: 13,fontFamily:"monospace",background:rKey===k?meta.color+"20":"rgba(248,250,252,0.92)",border:`1px solid ${rKey===k?meta.color:"rgba(71, 85, 105, 0.5)"}`,color:rKey===k?meta.color:locked?"#64748b":"#6b7280",cursor:locked?"not-allowed":"pointer"}}>{k}</button>
        ))}
        {locked&&<span style={{fontSize: 12,color:"#475569",fontFamily:"monospace"}}>🔒 locked</span>}
      </div>
      <div style={{borderRadius:10,background:"rgba(248,250,252,0.85)",border:"1px solid rgba(148,163,184,0.40)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:4,flexWrap:"wrap"}}>
          <FlowNode tok={T.producer} icon="💻" label="Producer" sub={`key='${rKey}'`} active={stage===1||stage===2}/>
          <Arrow on={stage>=2} color={T.producer.border} label={stage>=2?rKey:""}/>
          <FlowNode tok={T.exchange} icon="🎯" label="Direct Exchange" sub="direct_logs" active={stage===2||stage===3} w={118}/>
          <div style={{display:"flex",flexDirection:"column",gap:12,marginTop:4}}>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <Arrow on={stage>=3&&errorMatch} color={errorMatch?meta.color:"#ef4444"} label="key=error"/>
              <FlowNode tok={T.queue} icon="🔴" label="queue_errors" sub="binds: 'error'" active={stage>=3&&errorMatch} dimmed={stage>=3&&!errorMatch} w={112}/>
              <Arrow on={stage>=4&&errorMatch} color={T.queue.border}/>
              <FlowNode tok={T.consumer} icon="🖥️" label="Error Logger" sub={stage>=4&&errorMatch?"✅ got it":""} active={stage>=4&&errorMatch} dimmed={stage>=3&&!errorMatch}/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <Arrow on={stage>=3&&allMatch} color={allMatch?meta.color:"#ef4444"} label="err/warn/info"/>
              <FlowNode tok={T.queue} icon="🟡" label="queue_all" sub="binds: err,warn,info" active={stage>=3&&allMatch} dimmed={stage>=3&&!allMatch} w={112}/>
              <Arrow on={stage>=4&&allMatch} color={T.queue.border}/>
              <FlowNode tok={T.consumer} icon="💻" label="Full Logger" sub={stage>=4&&allMatch?"✅ got it":""} active={stage>=4&&allMatch} dimmed={stage>=3&&!allMatch}/>
            </div>
          </div>
        </div>
      </div>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
    </div>
  );
}

// ─── LESSON 5: Topics ─────────────────────────────────────────────────────────
const TOPIC_KEYS_LIST = ["kern.critical","kern.info","cron.warning","auth.error","kern.warning.disk"];
const TOPIC_BINDINGS = [
  {queue:"Q: kern.*",pattern:"kern.*",icon:"🐧"},
  {queue:"Q: *.critical",pattern:"*.critical",icon:"🚨"},
  {queue:"Q: kern.#",pattern:"kern.#",icon:"🔎"},
];
function TopicsLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const [rKey, setRKey] = useState("kern.critical");
  const locked = stage > 0 && stage < STEPS;
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const matches = TOPIC_BINDINGS.map(b => topicMatch(b.pattern, rKey));
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Declare a topic exchange</b><br/><br/><span style={{color:"#166534"}}>channel.exchange_declare(exchange='topic_logs', exchange_type='topic')</span><br/><br/>You chose routing_key=<b>'{rKey}'</b>. Words separated by dots. The exchange pattern-matches this against binding patterns.</>,
    <><b style={{color:meta.color}}>Step 2 — Publish with topic key</b><br/><br/><span style={{color:"#166534"}}>channel.basic_publish(exchange='topic_logs',<br/>{"    "}routing_key='{rKey}', body=message)</span><br/><br/>The exchange tests '{rKey}' against each binding pattern using wildcard rules.</>,
    <><b style={{color:meta.color}}>Step 3 — Pattern matching for '{rKey}'</b><br/><br/>{TOPIC_BINDINGS.map((b,i)=><span key={i}>• <b>'{b.pattern}'</b> → {matches[i]?"✅ MATCH":"❌ no match"}<br/></span>)}<br/>* = exactly 1 word &nbsp;&nbsp; # = 0 or more words</>,
    <><b style={{color:meta.color}}>Step 4 — Messages delivered to {matches.filter(Boolean).length} queue(s)</b><br/><br/>{TOPIC_BINDINGS.map((b,i)=><span key={i}>{matches[i]?`📨 ${b.icon} ${b.queue} — RECEIVES it`:`⛔ ${b.icon} ${b.queue} — skipped`}<br/></span>)}</>,
    <><b style={{color:meta.color}}>Step 5 — Try different keys!</b><br/><br/>• 'kern.critical' → matches kern.*, *.critical, kern.#<br/>• 'kern.info' → matches kern.*, kern.# (not *.critical)<br/>• 'cron.warning' → matches nothing above!<br/>• 'kern.warning.disk' → only kern.# (* fails on multi-word)<br/><br/>Reset and try a different key.</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
        <span style={{fontSize: 13,color:"#475569",fontFamily:"monospace"}}>routing_key:</span>
        {TOPIC_KEYS_LIST.map(k=>(
          <button key={k} disabled={locked} onClick={()=>setRKey(k)} style={{padding:"3px 8px",borderRadius:9999,fontSize: 12,fontFamily:"monospace",background:rKey===k?meta.color+"20":"rgba(248,250,252,0.92)",border:`1px solid ${rKey===k?meta.color:"rgba(71, 85, 105, 0.5)"}`,color:rKey===k?meta.color:locked?"#64748b":"#6b7280",cursor:locked?"not-allowed":"pointer"}}>{k}</button>
        ))}
      </div>
      <div style={{borderRadius:10,background:"rgba(248,250,252,0.85)",border:"1px solid rgba(148,163,184,0.40)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:4,flexWrap:"wrap"}}>
          <FlowNode tok={T.producer} icon="💻" label="Producer" sub={rKey} active={stage===1||stage===2}/>
          <Arrow on={stage>=2} color={T.producer.border} label={stage>=2?rKey:""}/>
          <FlowNode tok={T.exchange} icon="🌳" label="Topic Exchange" sub="topic_logs" active={stage===2||stage===3} w={114}/>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginTop:4}}>
            {TOPIC_BINDINGS.map((b,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:4}}>
                <Arrow on={stage>=3&&matches[i]} color={matches[i]?meta.color:"#ef4444"} label={b.pattern}/>
                <FlowNode tok={T.queue} icon={b.icon} label={b.queue} active={stage>=3&&matches[i]} dimmed={stage>=3&&!matches[i]} w={112}/>
                <Arrow on={stage>=4&&matches[i]} color={T.queue.border}/>
                <FlowNode tok={T.consumer} icon="🖥️" label="Consumer" sub={stage>=4&&matches[i]?"✅ received":""} active={stage>=4&&matches[i]} dimmed={stage>=3&&!matches[i]}/>
              </div>
            ))}
          </div>
        </div>
      </div>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
    </div>
  );
}

// ─── LESSON 6: RPC ────────────────────────────────────────────────────────────
function RPCLesson({ meta }) {
  const STEPS = 6;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const CORR = "f7a3b2c1-8e5d"; const RQNAME = "amq.gen-R9xQ7";
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Client creates reply queue & correlation ID</b><br/><br/><span style={{color:"#166534"}}>result = channel.queue_declare(queue='', exclusive=True)<br/>callback_queue = result.method.queue  # '{RQNAME}'<br/>corr_id = str(uuid.uuid4())  # '{CORR}'</span><br/><br/>The reply queue is where the server sends back the result. The correlation_id is a unique tag to match response to request.</>,
    <><b style={{color:meta.color}}>Step 2 — Client sends the RPC request</b><br/><br/><span style={{color:"#166534"}}>channel.basic_publish(exchange='', routing_key='rpc_queue',<br/>{"    "}body='fib(30)',<br/>{"    "}properties=pika.BasicProperties(<br/>{"        "}reply_to='{RQNAME}', correlation_id='{CORR}'))</span></>,
    <><b style={{color:meta.color}}>Step 3 — Server receives and processes</b><br/><br/><span style={{color:"#166534"}}>def on_request(ch, method, props, body):<br/>{"    "}n = int(body)  # 30<br/>{"    "}result = fib(n)  # computing fibonacci(30)…</span><br/><br/>fib(30) = 832040. The server is running channel.start_consuming() on 'rpc_queue'.</>,
    <><b style={{color:meta.color}}>Step 4 — Server publishes result to reply queue</b><br/><br/><span style={{color:"#166534"}}>ch.basic_publish(exchange='', routing_key=props.reply_to,<br/>{"    "}properties=pika.BasicProperties(<br/>{"        "}correlation_id=props.correlation_id),<br/>{"    "}body=str(result))</span><br/><br/>Server sends to '{RQNAME}' and echoes back the correlation_id.</>,
    <><b style={{color:meta.color}}>Step 5 — Client receives response</b><br/><br/>Client was polling in a loop:<br/><span style={{color:"#166534"}}>while self.response is None:<br/>{"    "}self.connection.process_data_events(time_limit=1)</span><br/><br/>A message arrived in '{RQNAME}' — checking if correlation_id matches...</>,
    <><b style={{color:meta.color}}>Step 6 — Match confirmed! Result delivered.</b><br/><br/><span style={{color:"#166534"}}>if self.corr_id == props.correlation_id:<br/>{"    "}self.response = int(body)  # 832040 ✅</span><br/><br/>fib(30) = <b style={{color:meta.color}}>832040</b><br/><br/>💡 Why correlation_id? Multiple RPC calls can be in flight — each has a unique ID so responses never get mixed up.</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:"rgba(248,250,252,0.85)",border:"1px solid rgba(148,163,184,0.40)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        <div style={{fontSize: 12,color:"#475569",fontFamily:"monospace",marginBottom:6,letterSpacing:1}}>→ REQUEST PATH</div>
        <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap",marginBottom:14}}>
          <FlowNode tok={T.producer} icon="💻" label="Client" sub="rpc_client.py" active={stage===1||stage===2||stage===5||stage===6}/>
          <Arrow on={stage>=2} color={T.producer.border} label={stage>=2?"fib(30)":""}/>
          <FlowNode tok={T.queue} icon="📦" label="rpc_queue" active={stage===2||stage===3} dimmed={stage<2} w={108}/>
          <Arrow on={stage>=3} color={T.queue.border}/>
          <FlowNode tok={T.consumer} icon="🖥️" label="RPC Server" sub={stage>=4?"result=832040":"rpc_server.py"} active={stage===3||stage===4}/>
        </div>
        <div style={{fontSize: 12,color:"#475569",fontFamily:"monospace",marginBottom:6,letterSpacing:1}}>← REPLY PATH</div>
        <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap",marginBottom:10}}>
          <FlowNode tok={T.producer} icon="💻" label="Client" sub={stage>=6?"✅ 832040":stage>=1?`corr_id: ${CORR.slice(0,8)}…`:""} active={stage===5||stage===6}/>
          <BackArrow on={stage>=5} color={meta.color} label={stage>=5?"832040":""}/>
          <FlowNode tok={T.rpc} icon="📬" label={RQNAME} sub={stage>=1?"exclusive=True":""} active={stage===4||stage===5} dimmed={stage<1} w={108}/>
          <BackArrow on={stage>=4} color={T.consumer.border} label={stage>=4?"result":""}/>
          <FlowNode tok={T.consumer} icon="🖥️" label="RPC Server" sub={stage>=4?"publishing…":""} active={stage===4} dimmed={stage<3}/>
        </div>
        {stage>=2&&<div style={{padding:"8px 12px",borderRadius:8,background:T.rpc.bg,border:`1px solid ${T.rpc.border}50`,fontSize: 13,fontFamily:"monospace",color:T.rpc.text}}>🔑 correlation_id: <b>{CORR}</b>{stage>=6?<span style={{color:"#22c55e"}}> ← ✅ MATCHED!</span>:stage>=5?" ← checking...":""}</div>}
      </div>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
    </div>
  );
}

// ─── LESSON 7: Streams Hello World ───────────────────────────────────────────
function StreamHelloLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const MSGS = ["Hello!","World!","Streams!"];
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Create stream and publish</b><br/><br/>RabbitMQ Streams uses the <b>rstream</b> library (not pika):<br/><br/><span style={{color:"#166534"}}>pip install rstream<br/><br/>async with Producer(host='localhost') as producer:<br/>{"    "}await producer.create_stream('mystream')<br/>{"    "}await producer.send('mystream',<br/>{"        "}[AMQPMessage(body=b'Hello!'), ...])</span></>,
    <><b style={{color:meta.color}}>Step 2 — Messages persist in the log</b><br/><br/>Unlike queues, stream messages are stored in a <b>persistent append-only log</b>.<br/><br/>Messages are NOT deleted after being consumed. Each has an <b>offset</b> — a sequential integer position.</>,
    <><b style={{color:meta.color}}>Step 3 — Consumer A subscribes from the beginning</b><br/><br/><span style={{color:"#166534"}}>await consumer.subscribe('mystream',<br/>{"    "}callback=on_message,<br/>{"    "}offset_specification=ConsumerOffsetSpecification(<br/>{"        "}OffsetType.FIRST, None))</span><br/><br/>OffsetType.FIRST = start from message at offset 0.</>,
    <><b style={{color:meta.color}}>Step 4 — Consumer A reads all 3 messages</b><br/><br/>Received "Hello!", "World!", "Streams!" ✅<br/><br/><b>The messages are still in the stream!</b> Consuming does NOT delete them — this is the fundamental difference from queues.</>,
    <><b style={{color:meta.color}}>Step 5 — Consumer B reads the same messages independently</b><br/><br/>Consumer B subscribes with OffsetType.FIRST and also reads all 3 messages — the exact same ones Consumer A read.<br/><br/>🔑 With a queue, Consumer B would get nothing. With a stream, every consumer independently replays the full history.</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:"rgba(248,250,252,0.85)",border:"1px solid rgba(148,163,184,0.40)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        <div style={{marginBottom:14}}>
          <div style={{fontSize: 12,color:"#475569",fontFamily:"monospace",marginBottom:8,letterSpacing:1}}>📜 STREAM: mystream (append-only log)</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {MSGS.map((m,i)=>(
              <div key={i} style={{borderRadius:8,padding:"8px 12px",fontSize: 13,fontFamily:"monospace",background:stage>=2?T.stream.border+"18":"#f1f5f9",border:`2px solid ${stage>=2?T.stream.border:"rgba(148,163,184,0.60)"}`,color:stage>=2?T.stream.text:"#64748b",transition:"all 0.35s"}}>
                <div style={{fontSize: 11,color:stage>=2?"#475569":"rgba(148,163,184,0.60)",marginBottom:3}}>offset {i}</div>
                📦 {m}
                {stage>=4&&<div style={{fontSize: 11,color:"#22c55e",marginTop:2}}>read by A ✅</div>}
                {stage>=5&&<div style={{fontSize: 11,color:T.stream.border,marginTop:1}}>read by B ✅</div>}
              </div>
            ))}
            {stage>=2&&<div style={{borderRadius:8,padding:"8px 12px",fontSize: 13,fontFamily:"monospace",background:"rgba(248,250,252,0.92)",border:"1px dashed rgba(148,163,184,0.50)",color:"#64748b"}}><div style={{fontSize: 11,marginBottom:3}}>offset 3</div>📦 next...</div>}
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <FlowNode tok={T.producer} icon="💻" label="Producer" active={stage===1}/>
            <Arrow on={stage>=2} color={T.producer.border} label={stage>=2?"3 msgs":""}/>
            <div style={{fontSize: 13,fontFamily:"monospace",color:stage>=2?T.stream.text:"#64748b"}}>📜 persisted forever</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <FlowNode tok={T.consumer} icon="🖥️" label="Consumer A" sub={stage>=4?"✅ read all 3":stage>=3?"subscribing…":""} active={stage===3||stage===4} dimmed={stage<3}/>
            <Arrow on={stage>=4} color={T.consumer.border} label={stage>=4?"FIRST→end":""}/>
            <div style={{fontSize: 13,fontFamily:"monospace",color:stage>=4?"#86efac":"#64748b"}}>{stage>=4?"reads offsets 0,1,2 ✅":""}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <FlowNode tok={T.consumer} icon="💻" label="Consumer B" sub={stage>=5?"✅ read all 3":""} active={stage===5} dimmed={stage<5}/>
            <Arrow on={stage>=5} color={T.consumer.border} label={stage>=5?"FIRST→end":""}/>
            <div style={{fontSize: 13,fontFamily:"monospace",color:stage>=5?T.stream.text:"#64748b"}}>{stage>=5?"reads offsets 0,1,2 ✅ (same data!)":""}</div>
          </div>
        </div>
      </div>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
    </div>
  );
}

// ─── LESSON 8: Streams Offset Tracking ───────────────────────────────────────
function StreamOffsetLesson({ meta }) {
  const STEPS = 6;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const ALL = ["msg0","msg1","msg2","msg3","msg4","msg5"];
  const crashed = stage === 4;
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Consumer subscribes from offset 0</b><br/><br/><span style={{color:"#166534"}}>await consumer.subscribe('mystream',<br/>{"    "}offset_specification=ConsumerOffsetSpecification(<br/>{"        "}OffsetType.OFFSET, 0))</span><br/><br/>Consumer reads messages one by one starting at the beginning.</>,
    <><b style={{color:meta.color}}>Step 2 — Process msgs 0,1,2 and save offset</b><br/><br/><span style={{color:"#166534"}}>async def on_message(msg, message_context):<br/>{"    "}await process(msg)  # do the work<br/>{"    "}await consumer.store_offset(<br/>{"        "}'myapp', 'mystream', message_context.offset)</span><br/><br/>Offset 2 is now saved server-side in RabbitMQ.</>,
    <><b style={{color:meta.color}}>Step 3 — Offset 2 saved on RabbitMQ server</b><br/><br/>The offset is stored <b>server-side</b> — not in the consumer process. It survives consumer crashes, restarts, and redeployments.<br/><br/>saved_offset['myapp'] = 2 means: "I processed everything up to and including offset 2."</>,
    <><b style={{color:meta.color}}>Step 4 — Consumer CRASHES! 💥</b><br/><br/>All in-memory state is lost. But saved_offset = 2 is still safely on the RabbitMQ server.<br/><br/>Messages 3, 4, 5 were NOT processed — and we know this because the bookmark is at 2, not 5.</>,
    <><b style={{color:meta.color}}>Step 5 — Consumer restarts and queries offset</b><br/><br/><span style={{color:"#166534"}}>offset = await client.query_offset('myapp', 'mystream')<br/># returns: 2<br/>resume_from = offset + 1  # = 3</span><br/><br/>Consumer subscribes with OffsetType.OFFSET(3) — skipping the already-processed messages.</>,
    <><b style={{color:meta.color}}>Step 6 — Resumed from offset 3 ✅</b><br/><br/>Consumer reads msg3, msg4, msg5 — exactly where it left off.<br/><br/>✅ No messages lost &nbsp;&nbsp; ✅ No duplicates<br/><br/>💡 Always store_offset() AFTER processing. Worst case on crash = one re-process (at-least-once). That's safe!</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:"rgba(248,250,252,0.85)",border:"1px solid rgba(148,163,184,0.40)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        <div style={{marginBottom:14}}>
          <div style={{fontSize: 12,color:"#475569",fontFamily:"monospace",marginBottom:8,letterSpacing:1}}>📜 STREAM: mystream</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {ALL.map((m,i)=>{
              const done=(i<=2&&stage>=2)||(i>=3&&stage>=6);
              const old=i<=2&&stage>=5;
              const cur=i>=3&&stage===6;
              return(<div key={i} style={{borderRadius:8,padding:"7px 10px",fontSize: 12,fontFamily:"monospace",background:old?"#f0fff4":done?meta.color+"18":"#f1f5f9",border:`2px solid ${cur?meta.color:done?meta.color+"60":"rgba(148,163,184,0.60)"}`,color:old?"#1e3a2a":done?"#86efac":"#64748b",transition:"all 0.35s"}}>
                <div style={{fontSize: 10,marginBottom:2,color:old?"#1e3a2a":"#475569"}}>offset {i}</div>
                {m}{i<=2&&stage>=2?" ✅":""}{cur?" ◀":""}
              </div>);
            })}
          </div>
        </div>
        <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
          <FlowNode tok={T.consumer} icon={crashed?"💥":"🖥️"} label="Consumer" sub={crashed?"CRASHED!":stage>=6?"resumed offset 3":stage>=5?"restarting…":stage>=1?`offset ${Math.min(stage-1,2)}`:"myapp-consumer"} active={!crashed&&stage>=1&&stage!==4} dimmed={crashed}/>
          {stage>=3&&!crashed&&stage<5&&<><Arrow on color={meta.color} label="store_offset(2)"/><div style={{borderRadius:10,padding:"8px 12px",background:T.rpc.bg,border:`1px solid ${T.rpc.border}60`,fontSize: 13,fontFamily:"monospace",color:T.rpc.text}}><div style={{fontSize: 11,color:"#475569",marginBottom:4}}>💾 Offset Store (server)</div>myapp → offset <b>2</b></div></>}
          {stage>=5&&<><BackArrow on color={meta.color} label="query=2"/><div style={{borderRadius:10,padding:"8px 12px",background:T.rpc.bg,border:`1px solid ${T.rpc.border}60`,fontSize: 13,fontFamily:"monospace",color:T.rpc.text}}><div style={{fontSize: 11,color:"#475569",marginBottom:4}}>💾 Offset Store (server)</div>myapp → offset <b>2</b><br/><span style={{color:meta.color}}>→ resume from offset 3</span></div></>}
        </div>
      </div>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
    </div>
  );
}

// ─── LESSON 9: RabbitMQ – Dead Letter Exchanges ───────────────────────────────
function DlxLesson({ meta }) {
  const STEPS = 6;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const retryNum = Math.max(0, stage - 4);
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Declare queues with DLX and TTL</b><br/><br/><span style={{color:"#166534"}}>channel.queue_declare('orders',<br/>{"    "}arguments={"{"}<br/>{"        "}'x-dead-letter-exchange': 'dlx.orders',<br/>{"        "}'x-message-ttl': 5000,  # 5 s TTL<br/>{"        "}'x-max-length': 1000<br/>{"    "}{"}"})<br/>channel.queue_declare('orders.retry', arguments={"{"}<br/>{"    "}'x-dead-letter-exchange': '',        # default exchange<br/>{"    "}'x-dead-letter-routing-key': 'orders',<br/>{"    "}'x-message-ttl': 10000 # 10 s hold<br/>{"}"})</span><br/><br/>Two queues: <b>orders</b> (main) and <b>orders.retry</b> (delay buffer). DLX links them together.</>,
    <><b style={{color:meta.color}}>Step 2 — Producer publishes to orders queue</b><br/><br/><span style={{color:"#166534"}}>channel.basic_publish(<br/>{"    "}exchange='',<br/>{"    "}routing_key='orders',<br/>{"    "}body=json.dumps({"{'order_id':'ORD-99','amount':250}"}),<br/>{"    "}properties=pika.BasicProperties(<br/>{"        "}delivery_mode=2,  # persistent<br/>{"        "}headers={"{'x-retry-count': 0}"}<br/>{"    "})<br/>)</span><br/><br/>Message enters the <b>orders</b> queue. Consumer picks it up and tries to process.</>,
    <><b style={{color:meta.color}}>Step 3 — Consumer nacks / message TTL expires</b><br/><br/><span style={{color:"#166534"}}>def on_message(ch, method, props, body):<br/>{"    "}try:<br/>{"        "}process_order(body)<br/>{"        "}ch.basic_ack(method.delivery_tag)<br/>{"    "}except Exception:<br/>{"        "}# nack without requeue → triggers DLX<br/>{"        "}ch.basic_nack(method.delivery_tag, requeue=False)</span><br/><br/>basic_nack(requeue=<b>False</b>) tells RabbitMQ: "this message failed — do not put it back." RabbitMQ immediately routes it to the DLX.</>,
    <><b style={{color:meta.color}}>Step 4 — Message arrives at orders.retry (delay queue)</b><br/><br/>The dead-lettered message lands in <b>orders.retry</b>.<br/><br/>It sits there for the retry TTL (<b>10 seconds</b>). When the TTL expires, RabbitMQ dead-letters it again — this time back to the default exchange with routing key <b>'orders'</b>.<br/><br/>The message re-enters the original <b>orders</b> queue for a second attempt. 🔁</>,
    <><b style={{color:meta.color}}>Step 5 — Exponential backoff with retry counter</b><br/><br/><span style={{color:"#166534"}}>headers = props.headers or {"{}"}<br/>retry_count = headers.get('x-retry-count', 0)<br/>{"if retry_count >= 3:"}<br/>{"    "}# Too many retries → park in dead end queue<br/>{"    "}channel.basic_publish(exchange='dlx.orders',<br/>{"        "}routing_key='orders.dead', body=body)<br/>{"    "}ch.basic_ack(method.delivery_tag)<br/>else:<br/>{"    "}headers['x-retry-count'] = retry_count + 1<br/>{"    "}ch.basic_nack(method.delivery_tag, requeue=False)</span></>,
    <><b style={{color:meta.color}}>Step 6 — Poison message parked in orders.dead ✅</b><br/><br/>After 3 retries the message is considered a <b>poison message</b> and forwarded to <b>orders.dead</b> for manual inspection.<br/><br/>✅ Main queue is unblocked &nbsp;&nbsp; ✅ No messages lost<br/>✅ Retry history preserved in headers &nbsp;&nbsp; ✅ Alerting can monitor orders.dead depth<br/><br/>This pattern is called <b>Dead Letter + Retry with Backoff</b> — the backbone of resilient RabbitMQ systems.</>,
  ];
  const mainActive  = stage >= 2 && stage < 3;
  const nackActive  = stage === 3;
  const retryActive = stage === 4;
  const deadActive  = stage >= 5;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:"rgba(248,250,252,0.85)",border:"1px solid rgba(148,163,184,0.40)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        {/* Flow diagram */}
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:14}}>
          <FlowNode tok={T.producer} icon="💻" label="Producer" sub={stage>=2?"ORD-99":""} active={stage===2}/>
          <Arrow on={stage>=2} color={T.producer.border} label="publish"/>
          {/* Main queue */}
          <div style={{borderRadius:8,padding:"10px 12px",minWidth:120,background:mainActive?T.queue.bg:"rgba(241,245,249,0.80)",border:`1.5px solid ${mainActive?T.queue.border:"rgba(148,163,184,0.50)"}`,transition:"all 0.3s",textAlign:"center"}}>
            <div style={{fontSize: 13,fontWeight:600,color:mainActive?T.queue.text:"#475569",fontFamily:"system-ui, -apple-system, sans-serif",marginBottom:4}}>📦 orders</div>
            <div style={{fontSize: 11,fontFamily:"monospace",color:"#475569"}}>TTL: 5s | DLX: dlx.orders</div>
          </div>
          <Arrow on={stage>=2&&stage<3} color={T.consumer.border} label="consume"/>
          <FlowNode tok={T.consumer} icon={nackActive?"❌":"🖥️"} label="Consumer" sub={nackActive?"nack(requeue=F)":stage>=3?"processed":stage>=2?"processing...":""} active={stage===2} dimmed={stage<2}/>
        </div>
        {/* DLX + retry path */}
        {stage >= 3 && (
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginTop:8,paddingTop:10,borderTop:"1px dashed rgba(239,68,68,0.3)"}}>
            <div style={{fontSize: 11,color:T.dlq.text,fontFamily:"monospace",minWidth:60}}>💀 DLX</div>
            <Arrow on={stage>=3} color={T.dlq.border} label="dead-letter"/>
            <div style={{borderRadius:8,padding:"10px 12px",minWidth:120,background:retryActive?T.dlq.bg:"rgba(241,245,249,0.80)",border:`1.5px solid ${retryActive?T.dlq.border:"rgba(239,68,68,0.3)"}`,transition:"all 0.3s",textAlign:"center"}}>
              <div style={{fontSize: 13,fontWeight:600,color:retryActive?T.dlq.text:"#475569",fontFamily:"system-ui, -apple-system, sans-serif",marginBottom:4}}>⏱️ orders.retry</div>
              <div style={{fontSize: 11,fontFamily:"monospace",color:"#475569"}}>hold 10s → re-route</div>
              {retryNum > 0 && <div style={{fontSize: 11,fontFamily:"monospace",color:T.dlq.text,marginTop:4}}>retry #{retryNum}</div>}
            </div>
            {stage >= 4 && <Arrow on={stage>=4} color={T.queue.border} label="TTL→requeue"/>}
            {stage >= 6 && (
              <>
                <Arrow on color={T.dlq.border} label="≥3 retries"/>
                <div style={{borderRadius:8,padding:"10px 12px",minWidth:100,background:deadActive?"rgba(239,68,68,0.15)":"rgba(241,245,249,0.80)",border:`1.5px solid ${deadActive?"#ef4444":"rgba(148,163,184,0.50)"}`,transition:"all 0.3s",textAlign:"center"}}>
                  <div style={{fontSize: 13,fontWeight:600,color:deadActive?T.dlq.text:"#475569",fontFamily:"system-ui, -apple-system, sans-serif",marginBottom:4}}>🪣 orders.dead</div>
                  <div style={{fontSize: 11,fontFamily:"monospace",color:"#475569"}}>manual inspect</div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
    </div>
  );
}

// ─── LESSON 10: RabbitMQ – Publisher Confirms ─────────────────────────────────
function PublisherConfirmsLesson({ meta }) {
  const STEPS = 6;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const ackTag   = stage >= 4 ? 1 : null;
  const nackTag  = stage === 5 ? 2 : null;
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Enable Confirm mode on the channel</b><br/><br/><span style={{color:"#166534"}}>import pika<br/>conn = pika.BlockingConnection(pika.ConnectionParameters('localhost'))<br/>channel = conn.channel()<br/><br/># Enable publisher confirms<br/>channel.confirm_delivery()</span><br/><br/>Once confirm_delivery() is called, every subsequent basic_publish will be tracked by the broker and you'll receive an ack or nack for each one.</>,
    <><b style={{color:meta.color}}>Step 2 — Publish message (delivery tag 1)</b><br/><br/><span style={{color:"#166534"}}>channel.basic_publish(<br/>{"    "}exchange='orders',<br/>{"    "}routing_key='new-order',<br/>{"    "}body=json.dumps(order_payload),<br/>{"    "}properties=pika.BasicProperties(<br/>{"        "}delivery_mode=2,   # persistent to disk<br/>{"        "}content_type='application/json'<br/>{"    "})<br/>)  # delivery_tag = 1</span><br/><br/>The broker assigns <b>delivery tag 1</b> to this message and begins processing it.</>,
    <><b style={{color:meta.color}}>Step 3 — Broker writes message to disk</b><br/><br/>Because delivery_mode=<b>2</b> (persistent), the broker writes the message to its on-disk journal <b>before</b> sending the ack.<br/><br/>This guarantees that even if the broker restarts immediately after acking, the message is not lost.<br/><br/>For transient messages (delivery_mode=1), the broker acks after routing to a consumer — faster but loses message on broker crash.</>,
    <><b style={{color:meta.color}}>Step 4 — Broker sends Basic.Ack (tag=1) ✅</b><br/><br/><span style={{color:"#166534"}}># With pika's BlockingChannel, confirm_delivery()<br/># raises an exception if a nack arrives<br/># Otherwise it returns True on success<br/><br/># In async mode (SelectConnection):<br/>def on_ack(frame):<br/>{"    "}delivery_tag = frame.method.delivery_tag<br/>{"    "}multiple     = frame.method.multiple<br/>{"    "}mark_confirmed(delivery_tag, multiple)</span><br/><br/>The ack means: "I have safely persisted message #1. You can consider it delivered."</>,
    <><b style={{color:meta.color}}>Step 5 — Broker sends Basic.Nack (tag=2) ❌</b><br/><br/><span style={{color:"#166534"}}>def on_nack(frame):<br/>{"    "}delivery_tag = frame.method.delivery_tag<br/>{"    "}# Republish or alert<br/>{"    "}resend_message(delivery_tag)</span><br/><br/>A nack means the broker <b>could not</b> handle the message — typically a queue overflow or internal error. You must republish or alert.<br/><br/>💡 Nacks are rare in practice; they signal a broker-side problem, not a message problem.</>,
    <><b style={{color:meta.color}}>Step 6 — Async batch confirms for throughput 🚀</b><br/><br/><span style={{color:"#166534"}}># Publish 1000 messages, collect acks asynchronously<br/>unconfirmed = {"{}"}<br/>for i, msg in enumerate(batch, start=1):<br/>{"    "}channel.basic_publish(..., body=msg)<br/>{"    "}unconfirmed[i] = msg<br/><br/>def on_ack(frame):<br/>{"    "}tag = frame.method.delivery_tag<br/>{"    "}if frame.method.multiple:<br/>{"        "}for k in list(unconfirmed):<br/>{"            if k <= tag: del unconfirmed[k]"}<br/>{"    "}else:<br/>{"        "}del unconfirmed[tag]</span><br/><br/>This <b>async batch confirm</b> pattern achieves ~30k msg/s with zero data loss — the recommended approach for high-throughput producers.</>,
  ];
  const msgs = [
    { tag: 1, status: stage >= 4 ? "acked" : stage >= 2 ? "pending" : "unsent" },
    { tag: 2, status: stage >= 5 ? "nacked" : stage >= 2 ? "pending" : "unsent" },
    { tag: 3, status: stage >= 6 ? "acked" : "unsent" },
  ];
  const statusColor = { acked: "#22c55e", nacked: "#ef4444", pending: meta.color, unsent: "#94a3b8" };
  const statusIcon  = { acked: "✅", nacked: "❌", pending: "⏳", unsent: "—" };
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:"rgba(248,250,252,0.85)",border:"1px solid rgba(148,163,184,0.40)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        {/* Confirm mode channel */}
        <div style={{marginBottom:12,padding:"8px 12px",borderRadius:8,background:`${meta.color}10`,border:`1px solid ${meta.color}30`,fontSize: 13,fontFamily:"monospace",color:meta.color}}>
          {stage>=1?"✅ channel in CONFIRM mode — delivery tags active":"⬜ standard channel (no confirms)"}
        </div>
        <div style={{display:"flex",alignItems:"flex-start",gap:6,flexWrap:"wrap"}}>
          <FlowNode tok={T.producer} icon="💻" label="Producer" sub={stage>=2?"publishing…":"confirm_select()"} active={stage>=1&&stage<4}/>
          <Arrow on={stage>=2} color={T.producer.border} label="basic_publish"/>
          {/* Broker box */}
          <div style={{borderRadius:8,padding:"12px 14px",minWidth:140,background:"rgba(99,102,241,0.08)",border:`1px solid rgba(99,102,241,0.3)`,backdropFilter:"blur(8px)"}}>
            <div style={{fontSize: 13,fontWeight:600,color:"#818cf8",fontFamily:"system-ui, -apple-system, sans-serif",marginBottom:8}}>🏠 Broker</div>
            {msgs.map(m => (
              <div key={m.tag} style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,borderRadius:6,padding:"4px 8px",background:`${statusColor[m.status]}12`,border:`1px solid ${statusColor[m.status]}30`,transition:"all 0.3s"}}>
                <span style={{fontSize: 12,fontFamily:"monospace",color:"#475569"}}>tag={m.tag}</span>
                <span style={{fontSize: 14}}>{statusIcon[m.status]}</span>
                <span style={{fontSize: 12,fontFamily:"monospace",color:statusColor[m.status]}}>{m.status}</span>
              </div>
            ))}
          </div>
          {/* Ack/Nack arrows back */}
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {stage>=4&&<div style={{display:"flex",alignItems:"center",gap:4}}>
              <BackArrow on color="#22c55e" label="Ack tag=1"/>
              <span style={{fontSize: 12,color:"#22c55e",fontFamily:"monospace"}}>✅ safe</span>
            </div>}
            {stage>=5&&<div style={{display:"flex",alignItems:"center",gap:4}}>
              <BackArrow on color="#ef4444" label="Nack tag=2"/>
              <span style={{fontSize: 12,color:"#ef4444",fontFamily:"monospace"}}>❌ resend</span>
            </div>}
          </div>
        </div>
      </div>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
    </div>
  );
}

// ─── LESSON 11: RabbitMQ – Quorum Queues ──────────────────────────────────────
function QuorumQueuesLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  // nodes: node1=leader (after election), node2=follower, node3=follower
  const leaderIdx = stage >= 2 ? 0 : stage === 1 ? null : null;
  const node3Down = stage >= 4;
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Declare a Quorum Queue</b><br/><br/><span style={{color:"#166534"}}>channel.queue_declare(<br/>{"    "}'critical-orders',<br/>{"    "}durable=True,<br/>{"    "}arguments={"{'x-queue-type': 'quorum'}"}<br/>)<br/><br/># 3-node cluster: quorum = ⌊3/2⌋+1 = 2 nodes</span><br/><br/>Unlike classic queues, quorum queues <b>cannot</b> be non-durable. They are always persistent and replicated. The queue exists on <b>every</b> node in the cluster.</>,
    <><b style={{color:meta.color}}>Step 2 — Raft Leader Election</b><br/><br/>On creation (or after a leader failure), nodes run a <b>Raft election</b>:<br/><br/>1. A node becomes <b>candidate</b> and requests votes<br/>2. Nodes vote if they haven't voted this term<br/>3. First to get majority (≥2 of 3) becomes <b>leader</b><br/><br/>node-1 wins the election and becomes the <b>Raft leader</b> for this queue. All publishes and acks route through the leader.</>,
    <><b style={{color:meta.color}}>Step 3 — Quorum Write: majority must acknowledge</b><br/><br/><span style={{color:"#166534"}}>channel.basic_publish(<br/>{"    "}exchange='',<br/>{"    "}routing_key='critical-orders',<br/>{"    "}body=payload,<br/>{"    "}properties=pika.BasicProperties(delivery_mode=2)<br/>)</span><br/><br/>The leader appends the message to its Raft log and replicates to followers.<br/><br/>✅ node-1 (leader) wrote &nbsp;&nbsp; ✅ node-2 (follower) wrote<br/>❌ node-3 — lagging<br/><br/>2 of 3 nodes confirmed → <b>quorum reached</b> → producer acked!</>,
    <><b style={{color:meta.color}}>Step 4 — node-3 fails — queue keeps serving 💪</b><br/><br/>node-3 crashes. The cluster still has <b>2 nodes alive</b> (node-1, node-2) — that's still a majority for a 3-node quorum (⌊3/2⌋+1 = 2).<br/><br/>✅ Publishes continue &nbsp;&nbsp; ✅ Consumers continue<br/>✅ No messages lost — node-2 has a complete replica<br/><br/>If instead 2 nodes fail (leaving only 1), the quorum is lost and the queue pauses to protect consistency.</>,
    <><b style={{color:meta.color}}>Step 5 — Delivery Limit: poison message protection ✅</b><br/><br/><span style={{color:"#166534"}}># Declare with delivery limit<br/>channel.queue_declare('critical-orders', arguments={"{"}<br/>{"    "}'x-queue-type': 'quorum',<br/>{"    "}'x-delivery-limit': 3  # auto-DLX after 3 nacks<br/>{"}"})</span><br/><br/>If a message is nack'd 3 times (e.g. a processing bug), RabbitMQ automatically dead-letters it instead of letting it loop forever.<br/><br/>💡 Combine with DLX (Lesson 09) for full poison-message handling.</>,
  ];
  const nodes = [
    { id: "node-1", label: "node-1", role: leaderIdx===0?"LEADER":"follower", active: stage>=2&&leaderIdx===0 },
    { id: "node-2", label: "node-2", role: "follower", active: stage>=3 },
    { id: "node-3", label: "node-3", role: node3Down?"DOWN":"follower", active: false, down: node3Down },
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:"rgba(248,250,252,0.85)",border:"1px solid rgba(148,163,184,0.40)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        <div style={{display:"flex",gap:8,alignItems:"flex-start",flexWrap:"wrap"}}>
          <FlowNode tok={T.producer} icon="💻" label="Producer" sub={stage>=3?"publish…":""} active={stage===3}/>
          <Arrow on={stage>=3} color={T.producer.border} label="basic_publish"/>
          {/* 3-node cluster */}
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {nodes.map(n => (
              <div key={n.id} style={{display:"flex",alignItems:"center",gap:6,borderRadius:8,padding:"8px 12px",minWidth:160,
                background:n.down?"rgba(239,68,68,0.05)":n.active?`${meta.color}10`:"rgba(241,245,249,0.80)",
                border:`1.5px solid ${n.down?"rgba(239,68,68,0.4)":n.active?meta.color:"rgba(148,163,184,0.50)"}`,
                transition:"all 0.3s"}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:n.down?"#ef4444":n.active?meta.color:"#334155",flexShrink:0,transition:"all 0.3s",boxShadow:n.active?`0 0 8px ${meta.color}60`:"none"}}/>
                <div>
                  <div style={{fontSize: 13,fontWeight:600,fontFamily:"system-ui, -apple-system, sans-serif",color:n.down?"#ef4444":n.active?meta.color:"#64748b"}}>{n.label}</div>
                  <div style={{fontSize: 11,fontFamily:"monospace",color:n.down?"#7f1d1d":n.role==="LEADER"?meta.color:"#475569"}}>{n.role}</div>
                  {stage>=3&&!n.down&&<div style={{fontSize: 11,fontFamily:"monospace",color:"#22c55e",marginTop:2}}>✅ wrote</div>}
                  {stage>=3&&n.role==="follower"&&!n.down&&n.id==="node-3"&&stage===3&&<div style={{fontSize: 11,fontFamily:"monospace",color:"#f59e0b",marginTop:2}}>⏳ lagging</div>}
                </div>
              </div>
            ))}
          </div>
          {stage>=3&&<div style={{display:"flex",flexDirection:"column",justifyContent:"center",gap:6}}>
            <BackArrow on color="#22c55e" label="Ack (quorum)"/>
          </div>}
        </div>
        {stage>=2&&<div style={{marginTop:12,padding:"8px 12px",borderRadius:8,background:`${meta.color}08`,border:`1px solid ${meta.color}30`,fontSize: 13,fontFamily:"monospace",color:meta.color}}>
          quorum = ⌊3/2⌋+1 = <b>2 nodes</b> · {stage>=4?"2/3 alive → ✅ serving":"write confirmed when 2 of 3 ack"}
        </div>}
      </div>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
    </div>
  );
}

// ─── LESSON 12: RabbitMQ – Flow Control & Back-pressure ───────────────────────
function FlowControlLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const memPct = [10, 30, 55, 55, 30][stage] ?? 10;
  const alarmOn = stage >= 2 && stage < 4;
  const blocked = stage >= 3 && stage < 4;
  const draining = stage >= 4;
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Normal operation: producers publish freely</b><br/><br/>RabbitMQ monitors broker memory and disk continuously.<br/><br/>Default memory high-watermark = <b>0.4</b> (40% of total RAM).<br/>Default disk free low-watermark = <b>50 MB</b>.<br/><br/>While both are healthy, producers publish at full speed and the broker routes messages to queues and consumers without delay.</>,
    <><b style={{color:meta.color}}>Step 2 — Memory climbs toward the watermark</b><br/><br/>Consumers are slow (downstream bottleneck). Messages accumulate in queues faster than they are consumed.<br/><br/>RabbitMQ's internal memory tracker observes memory usage rising above <b>40%</b> of available RAM.<br/><br/>The broker prepares to activate flow control — calculating which connections need to be throttled.</>,
    <><b style={{color:meta.color}}>Step 3 — Memory alarm fires 🚨 — producers blocked</b><br/><br/><span style={{color:"#166534"}}># Client side — pika raises an exception<br/>pika.exceptions.ConnectionBlockedError<br/><br/># Or listen to Connection.Blocked notification:<br/>conn.add_on_connection_blocked_callback(on_blocked)<br/>conn.add_on_connection_unblocked_callback(on_unblocked)<br/><br/>def on_blocked(conn, reason):<br/>{"    "}logger.warning("Producer blocked: %s", reason)</span><br/><br/>All <b>publishing</b> connections receive a <b>Connection.Blocked</b> frame. Consuming connections continue unaffected — draining is still allowed.</>,
    <><b style={{color:meta.color}}>Step 4 — Consumers drain the backlog</b><br/><br/>With producers paused, consumers work through the accumulated message backlog.<br/><br/>Memory usage falls as messages are consumed and removed from queues.<br/><br/>The broker continuously checks memory every few hundred milliseconds. When memory drops below the watermark, it will unblock connections.</>,
    <><b style={{color:meta.color}}>Step 5 — Connection.Unblocked — producers resume ✅</b><br/><br/><span style={{color:"#166534"}}>def on_unblocked(conn):<br/>{"    "}logger.info("Producer unblocked — resuming")<br/>{"    "}resume_publishing()</span><br/><br/>Broker sends <b>Connection.Unblocked</b>. Producers resume publishing.<br/><br/>✅ Broker memory safe &nbsp;&nbsp; ✅ Zero message loss<br/><br/>💡 Best practices: size consumers for 2×producer throughput, set per-queue <b>x-max-length</b>, and monitor <code>rabbitmq_alarms_memory_used_watermark</code> in Prometheus.</>,
  ];
  const memColor = memPct < 35 ? "#22c55e" : memPct < 50 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:"rgba(248,250,252,0.85)",border:"1px solid rgba(148,163,184,0.40)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        {/* Memory gauge */}
        <div style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontSize: 12,fontFamily:"monospace",color:"#475569"}}>🧠 Broker memory</span>
            <span style={{fontSize: 12,fontFamily:"monospace",color:memColor}}>{memPct}% {alarmOn?"🚨 ALARM":""}</span>
          </div>
          <div style={{height:10,borderRadius:999,background:"rgba(241,245,249,0.85)",overflow:"hidden",border:"1px solid rgba(148,163,184,0.50)"}}>
            <div style={{height:"100%",width:`${memPct}%`,background:`linear-gradient(90deg,#22c55e,${memColor})`,transition:"width 0.5s ease",borderRadius:999}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:2}}>
            <span style={{fontSize: 11,fontFamily:"monospace",color:"#334155"}}>0%</span>
            <span style={{fontSize: 11,fontFamily:"monospace",color:"#f59e0b"}}>▲ 40% watermark</span>
            <span style={{fontSize: 11,fontFamily:"monospace",color:"#334155"}}>100%</span>
          </div>
        </div>
        {/* Flow diagram */}
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <FlowNode tok={T.producer} icon={blocked?"🚫":"💻"} label="Producer" sub={blocked?"BLOCKED":draining?"wait…":"publishing"} active={stage===1&&!blocked} dimmed={blocked}/>
          <Arrow on={!blocked&&stage>=1} color={blocked?"#ef4444":T.producer.border} label={blocked?"blocked":"→ msgs"}/>
          <div style={{borderRadius:8,padding:"12px 14px",minWidth:120,background:alarmOn?"rgba(239,68,68,0.1)":"rgba(249,115,22,0.08)",border:`1.5px solid ${alarmOn?"#ef4444":"rgba(249,115,22,0.3)"}`,transition:"all 0.3s",textAlign:"center"}}>
            <div style={{fontSize: 13,fontWeight:600,fontFamily:"system-ui, -apple-system, sans-serif",color:alarmOn?"#f87171":T.queue.text,marginBottom:4}}>📦 Queue backlog</div>
            <div style={{fontSize: 11,fontFamily:"monospace",color:"#475569"}}>{stage>=2?"msgs accumulating":stage>=4?"draining…":"healthy"}</div>
          </div>
          <Arrow on={stage>=1} color={T.consumer.border} label="consume"/>
          <FlowNode tok={T.consumer} icon="🖥️" label="Consumer" sub={draining?"draining backlog…":"slow consumer"} active={draining}/>
        </div>
        {alarmOn&&<div style={{marginTop:12,padding:"8px 12px",borderRadius:8,background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",fontSize: 13,fontFamily:"monospace",color:"#f87171"}}>
          🚨 memory_alarm active · Connection.Blocked sent to all publishing connections
        </div>}
        {draining&&<div style={{marginTop:12,padding:"8px 12px",borderRadius:8,background:"rgba(34,197,94,0.1)",border:"1px solid rgba(34,197,94,0.3)",fontSize: 13,fontFamily:"monospace",color:"#15803d"}}>
          ✅ Connection.Unblocked sent · producers resumed · memory nominal
        </div>}
      </div>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
    </div>
  );
}

// ─── LESSON 13: RabbitMQ – Clustering & Fault Tolerance ───────────────────────
function ClusteringLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const node2Joined = stage >= 2;
  const node3Joined = stage >= 3;
  const node2Down   = stage >= 4;
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Start node-1 and set Erlang cookie</b><br/><br/><span style={{color:"#166534"}}>sudo rabbitmq-server -detached<br/><br/># All nodes MUST share the same secret cookie<br/>cat /var/lib/rabbitmq/.erlang.cookie<br/># e.g. → ABCXYZERLANGCOOKIE<br/><br/># node-2 and node-3: copy this exact cookie<br/>scp node1:/var/lib/rabbitmq/.erlang.cookie \<br/>{"    "}/var/lib/rabbitmq/.erlang.cookie</span><br/><br/>The <b>Erlang cookie</b> is the cluster's shared secret. Nodes reject join attempts with a different cookie.</>,
    <><b style={{color:meta.color}}>Step 2 — Join node-2 to the cluster</b><br/><br/><span style={{color:"#166534"}}># On node-2:<br/>rabbitmqctl stop_app<br/>rabbitmqctl reset<br/>rabbitmqctl join_cluster rabbit@node-1<br/>rabbitmqctl start_app<br/><br/># Verify from any node:<br/>rabbitmqctl cluster_status<br/># Nodes: [{"{"}disc, [rabbit@node-1, rabbit@node-2]{"}"}]</span><br/><br/>node-2 fetches schema and metadata from node-1. Exchanges, virtual hosts, and users are now shared across both nodes.</>,
    <><b style={{color:meta.color}}>Step 3 — 3-node cluster operational</b><br/><br/>With 3 nodes, quorum queues tolerate <b>1 node failure</b> (⌊3/2⌋+1 = 2 needed).<br/><br/>Queue leaders are distributed across nodes for load balancing. Clients should connect to a <b>load balancer</b> (HAProxy / NLB) that sits in front of all 3 nodes — not directly to any single node.<br/><br/><span style={{color:"#166534"}}># HAProxy config (frontend + backend)<br/>frontend rmq<br/>{"    "}bind *:5672<br/>{"    "}default_backend rmq_nodes<br/>backend rmq_nodes<br/>{"    "}balance roundrobin<br/>{"    "}server node1 node-1:5672 check<br/>{"    "}server node2 node-2:5672 check<br/>{"    "}server node3 node-3:5672 check</span></>,
    <><b style={{color:meta.color}}>Step 4 — node-2 goes down (network partition / crash)</b><br/><br/>node-2 becomes unreachable. The cluster detects this via heartbeat timeouts (default 60s, tune with <b>net_ticktime</b>).<br/><br/>With <b>pause_minority</b> partition handling (recommended):<br/>- node-2 is alone → it pauses itself to prevent split-brain<br/>- node-1 + node-3 form the majority → continue serving<br/><br/><span style={{color:"#166534"}}># In rabbitmq.conf:<br/>cluster_partition_handling = pause_minority</span></>,
    <><b style={{color:meta.color}}>Step 5 — Rolling upgrade: zero-downtime deploy ✅</b><br/><br/><span style={{color:"#166534"}}># 1. Remove node-2 from load balancer<br/># 2. Stop node-2:<br/>rabbitmqctl stop_app<br/><br/># 3. Upgrade RabbitMQ on node-2<br/>apt-get install rabbitmq-server=3.13.x<br/><br/># 4. Restart and rejoin<br/>rabbitmqctl start_app<br/><br/># 5. Repeat for node-3, then node-1</span><br/><br/>Quorum queues maintain availability during rolling upgrades because the remaining nodes always form a quorum. Classic mirrored queues required full cluster downtime — another reason to migrate to quorum queues.</>,
  ];
  const nodeStatus = [
    { label: "node-1", joined: true,         down: false,       leader: stage>=2 },
    { label: "node-2", joined: node2Joined,   down: node2Down,   leader: false },
    { label: "node-3", joined: node3Joined,   down: false,       leader: false },
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:"rgba(248,250,252,0.85)",border:"1px solid rgba(148,163,184,0.40)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        {/* Client + LB */}
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:14}}>
          <FlowNode tok={T.producer} icon="🖥️" label="Client" sub="pika connect" active={stage>=3}/>
          <Arrow on={stage>=3} color={T.producer.border} label="AMQP :5672"/>
          <div style={{borderRadius:8,padding:"10px 14px",background:"rgba(14,165,233,0.08)",border:"1px solid rgba(14,165,233,0.3)",textAlign:"center",minWidth:90}}>
            <div style={{fontSize: 13,fontWeight:600,color:"#0284c7",fontFamily:"system-ui, -apple-system, sans-serif"}}>⚖️ HAProxy</div>
            <div style={{fontSize: 11,fontFamily:"monospace",color:"#475569"}}>load balancer</div>
          </div>
          <Arrow on={stage>=3} color={meta.color} label="round-robin"/>
          {/* Nodes */}
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {nodeStatus.map(n => (
              <div key={n.label} style={{display:"flex",alignItems:"center",gap:8,borderRadius:8,padding:"8px 12px",minWidth:170,
                background:n.down?"rgba(239,68,68,0.05)":n.joined?`${meta.color}0a`:"rgba(30,41,59,0.3)",
                border:`1.5px solid ${n.down?"rgba(239,68,68,0.5)":n.joined?`${meta.color}50`:"rgba(148,163,184,0.40)"}`,
                transition:"all 0.35s",opacity:n.joined?1:0.4}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:n.down?"#ef4444":n.joined?meta.color:"#334155",flexShrink:0,transition:"all 0.35s",boxShadow:n.leader?`0 0 10px ${meta.color}80`:"none"}}/>
                <div>
                  <div style={{fontSize: 13,fontWeight:600,fontFamily:"system-ui, -apple-system, sans-serif",color:n.down?"#ef4444":n.joined?meta.color:"#475569"}}>
                    {n.label} {n.leader&&"👑"} {n.down&&"💥"}
                  </div>
                  <div style={{fontSize: 11,fontFamily:"monospace",color:n.down?"#7f1d1d":"#475569"}}>
                    {n.down?"UNREACHABLE":n.joined?"in cluster":"not joined"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        {node2Down&&<div style={{padding:"8px 12px",borderRadius:8,background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.3)",fontSize: 13,fontFamily:"monospace",color:"#f87171"}}>
          ⚠️ node-2 unreachable · pause_minority: node-2 paused itself · node-1 + node-3 serving (quorum intact)
        </div>}
        {stage>=3&&!node2Down&&<div style={{padding:"8px 12px",borderRadius:8,background:`${meta.color}08`,border:`1px solid ${meta.color}30`,fontSize: 13,fontFamily:"monospace",color:meta.color}}>
          ✅ 3-node cluster · quorum = 2/3 · 1 node failure tolerated
        </div>}
      </div>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
    </div>
  );
}

// ─── LESSON 8 (Kafka): Kafka – Hello Kafka ──────────────────────────────────
function KafkaHelloLesson({ meta }) {
  const STEPS = 6;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Start Kafka: broker running on :9092</b><br/><br/><span style={{color:"#166534"}}>kafka-server-start.sh config/server.properties</span><br/><br/>Kafka is a distributed message broker written in Scala/Java. One server (or cluster of servers) acts as the central hub for all producers and consumers.</>,
    <><b style={{color:meta.color}}>Step 2 — Create a topic</b><br/><br/><span style={{color:"#166534"}}>kafka-topics.sh --create --topic=orders \
{"    "}--partitions=1 --replication-factor=1 \
{"    "}--bootstrap-server=localhost:9092</span><br/><br/>A <b>topic</b> is a named stream. All messages for orders go into the 'orders' topic. Think of it as a channel or feed.</>,
    <><b style={{color:meta.color}}>Step 3 — Producer sends a message</b><br/><br/><span style={{color:"#166534"}}>from confluent_kafka import Producer<br/>p = Producer({"{'bootstrap.servers':'localhost:9092'}"})  <br/>p.produce('orders', value='{"{'id':1,'user':'alice'}"}')<br/>p.flush()</span><br/><br/>The producer is a Python app that calls <b>produce()</b>. <b>flush()</b> ensures the broker receives it.</>,
    <><b style={{color:meta.color}}>Step 4 — Broker stores the message</b><br/><br/>The Kafka broker receives the message and appends it to the 'orders' topic partition.<br/><br/>The message is now persistent — even if the producer crashes, the message is safe on the broker's disk.</>,
    <><b style={{color:meta.color}}>Step 5 — Consumer subscribes</b><br/><br/><span style={{color:"#166534"}}>from confluent_kafka import Consumer<br/>c = Consumer({`{'bootstrap.servers':'localhost:9092',\n'group.id':'payment-svc'}`})  <br/>c.subscribe(['orders'])</span><br/><br/>The consumer is another Python app. It subscribes to the 'orders' topic and joins group 'payment-svc'.</>,
    <><b style={{color:meta.color}}>Step 6 — Consumer polls and processes</b><br/><br/><span style={{color:"#166534"}}>while True:<br/>{"    "}msg = c.poll(1.0)  # Wait 1 sec for a message<br/>{"    "}if msg:<br/>{"    "}{"    "}print(msg.value())<br/>{"    "}{"    "}c.commit()  # Bookmark: we processed this</span><br/><br/>✅ Done! The message flows: producer → broker → consumer. Decoupled architecture: producer and consumer never talk directly.</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:meta.color+"08",border:`1px solid ${meta.color}25`,padding:"18px 16px"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <FlowNode tok={T.producer} icon="💻" label="Producer" active={stage>=3&&stage<=3}/>
          <Arrow on={stage>=3} color={T.producer.border} label={stage>=3?"produce()":""}/>
          <FlowNode tok={T.kafka} icon="🗄️" label="Kafka Broker" sub=":9092" active={stage>=4}/>
          <Arrow on={stage>=5} color={T.kafka.border} label={stage>=5?"poll()":""}/>
          <FlowNode tok={T.consumer} icon="🖥️" label="Consumer" sub={stage>=5?"payment-svc":""} active={stage>=5}/>
        </div>
        {stage>=4&&(
          <div style={{marginTop:12,padding:"10px 12px",borderRadius:8,background:`linear-gradient(135deg, ${meta.color}15, ${meta.color}20)`,border:`1px solid ${meta.color}30`,fontSize: 13,fontFamily:"monospace",color:meta.color}}>
            💾 Message persisted on broker disk — survives restarts
          </div>
        )}
      </div>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
    </div>
  );
}

// ─── LESSON 14 (Kafka): Producer Internals & Config ──────────────────────
function KafkaProducerLesson({ meta }) {
  const STEPS = 6;
  const [stage, setStage] = useState(0);
  const [acks, setAcks] = useState("1");
  const locked = stage > 0 && stage < STEPS;
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Messages accumulate in RecordAccumulator</b><br/><br/>Instead of sending each message immediately, the producer buffers messages in memory: RecordAccumulator. Batching = efficiency.</>,
    <><b style={{color:meta.color}}>Step 2 — Timer: linger.ms</b><br/><br/><span style={{color:"#166534"}}>p = Producer({`{'bootstrap.servers':'localhost:9092','linger.ms':10,'batch.size':16384}`})</span><br/><br/>The producer waits up to <b>linger.ms=10</b> milliseconds for more messages to arrive. If messages fill the buffer (16KB) first, send immediately.</>,
    <><b style={{color:meta.color}}>Step 3 — Compression: snappy or lz4</b><br/><br/><span style={{color:"#166534"}}>Producer({"{'compression.type':'snappy'}"})  # or 'lz4', 'gzip'</span><br/><br/>Before sending the batch, compress it to save network bandwidth. Snappy is fast; gzip is smaller but slower.</>,
    <><b style={{color:meta.color}}>Step 4 — Choose acks setting: fire-forget vs safety</b><br/><br/><span style={{color:"#166534"}}>Producer({"{'acks':" + (acks === "0" ? "'0'" : acks === "1" ? "'1'" : "'all'") + "}"})</span><br/><br/>Select how many replicas must acknowledge before produce() returns:<br/>• <b>acks=0</b>: fire-and-forget (fast but risky)<br/>• <b>acks=1</b>: leader only (safer)<br/>• <b>acks=all</b>: all in-sync replicas (safest, slowest)</>,
    <><b style={{color:meta.color}}>Step 5 — Idempotent producer for exactly-once</b><br/><br/><span style={{color:"#166534"}}>Producer({"{'enable.idempotence':true,\n\'acks\':\'all\'"})  </span><br/><br/>Each message gets (ProducerID + sequence number). Broker deduplicates. Safe retries with no duplicates.</>,
    <><b style={{color:meta.color}}>Step 6 — Send and flush</b><br/><br/><span style={{color:"#166534"}}>p.produce('orders', value='...', key='user-123')<br/>p.flush()  # Wait for all in-flight to complete</span><br/><br/>After flush(), all messages are acknowledged by the broker. Your data is safe.</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
        {["0","1","all"].map(a=>(
          <button key={a} disabled={locked} onClick={()=>setAcks(a)} style={{padding:"6px 14px",borderRadius:8,fontSize: 13,fontFamily:"monospace",fontWeight:600,background:acks===a?meta.color+"20":"rgba(248,250,252,0.92)",border:`1px solid ${acks===a?meta.color:"rgba(71, 85, 105, 0.5)"}`,color:acks===a?meta.color:locked?"#64748b":"#6b7280",cursor:locked?"not-allowed":"pointer"}}>
            {"acks="} {a}
          </button>
        ))}
        {locked&&<span style={{fontSize: 12,color:"#475569",fontFamily:"monospace"}}>🔒 locked</span>}
      </div>
      <div style={{borderRadius:10,background:meta.color+"08",border:`1px solid ${meta.color}25`,padding:"16px 14px"}}>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div style={{fontSize: 13,fontFamily:"monospace",color:"#475569"}}>📦 RecordAccumulator buffer:</div>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            {[0,1,2,3].map((i,idx)=>(
              <div key={idx} style={{
                flex:1,height:32,borderRadius:6,background:stage>=2?meta.color+"30":"#e2e8f0",
                border:`1px solid ${stage>=2?meta.color+"60":"#cbd5e1"}`,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize: 12,fontFamily:"monospace",color:stage>=2?meta.color:"#64748b",transition:"all 0.3s"
              }}>
                msg{i+1}
              </div>
            ))}
          </div>
          {stage>=3&&(
            <div style={{marginTop:6,fontSize: 12,fontFamily:"monospace",color:meta.color,padding:"8px 10px",borderRadius:6,background:meta.color+"15"}}>
              💨 Compressing with snappy...
            </div>
          )}
        </div>
        {stage>=4&&(
          <div style={{marginTop:10,fontSize: 12,fontFamily:"monospace",color:"#475569",padding:"8px 10px",borderRadius:6,background:"rgba(100,200,255,0.1)"}}>
            {acks==="0"?"🚀 Fire-forget: no wait":acks==="1"?"⏱️ Leader ACK: medium safety":"🛡️ All ISR ACK: maximum safety"}
          </div>
        )}
      </div>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
    </div>
  );
}

// ─── LESSON 15 (Kafka): Schema Registry & Avro ────────────────────────────
function KafkaSchemaLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Problem: unvalidated schemas</b><br/><br/>Without Schema Registry, producers and consumers must agree on message format manually. A breaking change crashes consumers. No validation. No safety.</>,
    <><b style={{color:meta.color}}>Step 2 — Define Avro schema and register</b><br/><br/><span style={{color:"#166534"}}>{`schema = {
  "type": "record",
  "name": "Order",
  "fields": [
    {"name": "id", "type": "string"},
    {"name": "user_id", "type": "string"},
    {"name": "amount", "type": "double"}
  ]
}`}</span><br/><br/>POST /subjects/orders-value/versions to Schema Registry. Gets assigned schema_id=1.</>,
    <><b style={{color:meta.color}}>Step 3 — Producer serializes with schema ID in header</b><br/><br/><span style={{color:"#166534"}}>from confluent_kafka.schema_registry.schema_registry_client import SchemaRegistryClient<br/>sr = SchemaRegistryClient({"{'url':'http://localhost:8081'}"} )<br/>serializer = AvroSerializer(sr, schema_str)</span><br/><br/>Producer embeds [schemaId=1] + serialized bytes in the wire message. Tiny overhead, huge safety gain.</>,
    <><b style={{color:meta.color}}>Step 4 — Consumer deserializes: lookup schema by ID</b><br/><br/><span style={{color:"#166534"}}>deserializer = AvroDeserializer(sr)<br/>msg = c.poll(1.0)<br/>data = deserializer(msg.value(), None)  # Automatically fetches schema_id=1 from Registry</span><br/><br/>Consumer reads schema_id from header, fetches schema definition, deserializes. Zero guessing.</>,
    <><b style={{color:meta.color}}>Step 5 — Schema evolution: backward compatible</b><br/><br/><span style={{color:"#166534"}}>New schema adds optional field: "region": {'{"type": "string", "default": "US"}'}</span><br/><br/>✅ Old consumers can still read messages with new schema (default value fills in).<br/>✅ New consumers can read old messages (new field simply absent).<br/>This is BACKWARD compatibility — the foundation of safe schema evolution.</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:meta.color+"08",border:`1px solid ${meta.color}25`,padding:"16px 14px"}}>
        {stage<2&&(
          <div style={{fontSize: 13,color:"#6b7280",fontFamily:"system-ui",lineHeight:1.6}}>
            ⚠️ Without schemas: producers send JSON with different formats. Consumers crash on unexpected fields.
          </div>
        )}
        {stage>=2&&stage<4&&(
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <FlowNode tok={{bg:meta.color+"15",border:meta.color,text:meta.color,glow:meta.color+"30"}} icon="💻" label="Producer" active={stage>=3}/>
            <Arrow on={stage>=3} color={meta.color} label={stage>=3?"serialize + ID":""}/>
            <div style={{borderRadius:8,padding:"8px 12px",background:"rgba(30,41,59,0.05)",border:`1px solid ${meta.color}40`,fontSize: 12,fontFamily:"monospace",color:"#475569"}}>
              {stage>=3?"[schemaId=1]...bytes":"Schema Reg."}
            </div>
            <Arrow on={stage>=4} color={meta.color} label={stage>=4?"deserialize":""}/>
            <FlowNode tok={{bg:meta.color+"15",border:meta.color,text:meta.color,glow:meta.color+"30"}} icon="🖥️" label="Consumer" active={stage===4}/>
          </div>
        )}
        {stage>=4&&(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{fontSize: 12,fontFamily:"monospace",color:"#475569",padding:"8px 10px",borderRadius:6,background:"#f1f5f9"}}>
              ✅ Schema evolution: new field with default value
            </div>
            <div style={{fontSize: 12,color:meta.color,fontFamily:"monospace",padding:"8px 10px",borderRadius:6,background:meta.color+"15"}}>
              Old consumers + new message = works (default fills new field)<br/>New consumers + old message = works (new field absent)
            </div>
          </div>
        )}
      </div>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
    </div>
  );
}

// ─── LESSON 16 (Kafka): Kafka Streams API ──────────────────────────────────
function KafkaStreamsApiLesson({ meta }) {
  const STEPS = 6;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Define topology: source → operations → sink</b><br/><br/><span style={{color:"#166534"}}>from kafka import KafkaStreams, StreamsBuilder<br/>builder = StreamsBuilder()<br/>source = builder.stream('orders')</span><br/><br/>A topology is a DAG (directed acyclic graph) of processing steps. Start with a source topic.</>,
    <><b style={{color:meta.color}}>Step 2 — Stateless operations: filter, map, branch</b><br/><br/><span style={{color:"#166534"}}>filtered = source.filter(lambda k, v: v['amount'] {">"} 1000)<br/>mapped = filtered.map(lambda k, v: (k, {"{'amount': v['amount'] * 1.1}"}))</span><br/><br/>No state needed. One record in → one record out (or zero if filtered).</>,
    <><b style={{color:meta.color}}>Step 3 — Key selection for aggregation</b><br/><br/><span style={{color:"#166534"}}>grouped = filtered.groupByKey()</span><br/><br/>Group records by the message key. All messages with the same key will be aggregated together.</>,
    <><b style={{color:meta.color}}>Step 4 — Windowed aggregation: tumble, hop, session</b><br/><br/><span style={{color:"#166534"}}>aggregated = grouped \
    .windowedBy(TimeWindows.of(60000))  # 1 min tumbling window \
    .aggregate(lambda: 0, lambda k, v, total: total + v['amount'])</span><br/><br/>Compute sum(amount) per category every 1 minute. RocksDB state store holds running totals.</>,
    <><b style={{color:meta.color}}>Step 5 — Emit results to sink topic</b><br/><br/><span style={{color:"#166534"}}>aggregated.toStream() \
    .map(lambda k, v: (str(k), json.dumps(v))) \
    .to('revenue-per-category')</span><br/><br/>Write windowed results to a sink topic. Other consumers can read the real-time aggregations.</>,
    <><b style={{color:meta.color}}>Step 6 — Run the topology</b><br/><br/><span style={{color:"#166534"}}>streams = KafkaStreams(builder.build(), config)<br/>streams.start()</span><br/><br/>The topology runs continuously, processing every message from the source topic. Fault-tolerant: state is checkpointed and restored on restart.</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:meta.color+"08",border:`1px solid ${meta.color}25`,padding:"16px 14px"}}>
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",fontSize: 12}}>
          <div style={{borderRadius:6,padding:"6px 10px",background:meta.color+"20",border:`1px solid ${meta.color}`,fontFamily:"monospace",color:meta.color,fontWeight:600}}>
            orders (source)
          </div>
          {stage>=2&&(
            <>
              <div style={{fontSize: 14,color:"#64748b"}}>→</div>
              <div style={{borderRadius:6,padding:"6px 10px",background:"#e2e8f0",border:"1px solid #cbd5e1",fontFamily:"monospace",color:"#475569"}}>filter + map</div>
            </>
          )}
          {stage>=3&&(
            <>
              <div style={{fontSize: 14,color:"#64748b"}}>→</div>
              <div style={{borderRadius:6,padding:"6px 10px",background:"#e2e8f0",border:"1px solid #cbd5e1",fontFamily:"monospace",color:"#475569"}}>groupBy</div>
            </>
          )}
          {stage>=4&&(
            <>
              <div style={{fontSize: 14,color:"#64748b"}}>→</div>
              <div style={{borderRadius:6,padding:"6px 10px",background:"#e2e8f0",border:"1px solid #cbd5e1",fontFamily:"monospace",color:"#475569"}}>window(1m) + aggregate</div>
            </>
          )}
          {stage>=5&&(
            <>
              <div style={{fontSize: 14,color:"#64748b"}}>→</div>
              <div style={{borderRadius:6,padding:"6px 10px",background:meta.color+"20",border:`1px solid ${meta.color}`,fontFamily:"monospace",color:meta.color,fontWeight:600}}>revenue (sink)</div>
            </>
          )}
        </div>
        {stage>=4&&(
          <div style={{marginTop:10,padding:"8px 10px",borderRadius:6,background:`linear-gradient(135deg, ${meta.color}15, ${meta.color}20)`,border:`1px solid ${meta.color}30`,fontSize: 12,fontFamily:"monospace",color:meta.color}}>
            💾 State store (RocksDB): holds windowed aggregates. Persisted to changelog topic for recovery.
          </div>
        )}
      </div>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
    </div>
  );
}

// ─── LESSON 17 (Kafka): Kafka Connect ────────────────────────────────────────
function KafkaConnectLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Problem: integrating external systems</b><br/><br/>You need to pull data from a PostgreSQL database and send it to a data warehouse. Writing custom consumer code is tedious and error-prone.</>,
    <><b style={{color:meta.color}}>Step 2 — Kafka Connect: worker + connectors</b><br/><br/><span style={{color:"#166534"}}>connect-distributed.sh config/connect-distributed.properties</span><br/><br/>A Kafka Connect worker is a JVM process that loads connector plugins and manages tasks. Run multiple for HA.</>,
    <><b style={{color:meta.color}}>Step 3 — Define source connector: PostgreSQL → Kafka</b><br/><br/><span style={{color:"#166534"}}>POST /connectors {"{"}<br/>  "name": "postgres-source",<br/>  "config": {"{"}<br/>    "connector.class": "io.confluent.connect.jdbc.JdbcSourceConnector",<br/>    "connection.url": "jdbc:postgresql://localhost/orders",<br/>    "table.whitelist": "orders",<br/>    "topic.prefix": "db_"<br/>  {"}"}<br/>{"}"}</span><br/><br/>The connector polls the database, captures changes, and publishes to Kafka topics. No custom code!</>,
    <><b style={{color:meta.color}}>Step 4 — Define sink connector: Kafka → Elasticsearch</b><br/><br/><span style={{color:"#166534"}}>POST /connectors {"{"}<br/>  "name": "es-sink",<br/>  "config": {"{"}<br/>    "connector.class": "io.confluent.connect.elasticsearch.ElasticsearchSinkConnector",<br/>    "connection.url": "http://elasticsearch:9200",<br/>    "topics": "db_orders"<br/>  {"}"}<br/>{"}"}</span><br/><br/>This sink connector consumes from 'db_orders' topic and indexes documents in Elasticsearch for real-time dashboards.</>,
    <><b style={{color:meta.color}}>Step 5 — Distributed, fault-tolerant execution</b><br/><br/>Multiple workers share the tasks. If one worker crashes, another restarts the task. Offset tracking in Kafka ensures no data loss. Scale horizontally.</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:meta.color+"08",border:`1px solid ${meta.color}25`,padding:"16px 14px"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:6,flexWrap:"wrap"}}>
          <FlowNode tok={{bg:"#e0f2fe",border:"#0284c7",text:"#0c4a6e",glow:"#0284c730"}} icon="🗄️" label="PostgreSQL" sub="source" active={stage>=3} w={95}/>
          {stage>=3&&<Arrow on color="#0284c7" label="poll"/>}
          <FlowNode tok={T.kafka} icon="🗄️" label="Kafka Topic" sub="db_orders" active={stage>=3}/>
          {stage>=4&&<Arrow on color={meta.color} label="sink"/>}
          {stage>=4&&<FlowNode tok={{bg:"#fef3c7",border:"#f59e0b",text:"#92400e",glow:"#f59e0b30"}} icon="🔍" label="Elasticsearch" sub="index" active={stage>=4} w={95}/>}
        </div>
        {stage>=3&&(
          <div style={{marginTop:10,padding:"8px 10px",borderRadius:6,background:`linear-gradient(135deg, ${meta.color}15, ${meta.color}20)`,border:`1px solid ${meta.color}30`,fontSize: 12,fontFamily:"monospace",color:meta.color}}>
            {stage<4?"✳️ Source connector running: polling database":"✅ Full pipeline: DB → Kafka → Elasticsearch (dashboards)"}
          </div>
        )}
      </div>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
    </div>
  );
}

// ─── LESSON 18 (Kafka): Security ─────────────────────────────────────────────
function KafkaSecurityLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const [authType, setAuthType] = useState("tls");
  const locked = stage > 0 && stage < STEPS;
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — TLS: Encrypt communication</b><br/><br/><span style={{color:"#166534"}}>security.protocol=SSL<br/>ssl.truststore.location=/path/to/truststore.jks<br/>ssl.truststore.password=***</span><br/><br/>All traffic between client and broker is encrypted. Requires server keystore + client truststore.</>,
    <><b style={{color:meta.color}}>Step 2 — SASL: Authenticate the client</b><br/><br/><span style={{color:"#166534"}}>security.protocol=SASL_SSL<br/>sasl.mechanism=SCRAM-SHA-256<br/>sasl.username=alice<br/>sasl.password=secret</span><br/><br/>Client proves identity with username/password or other credentials. Broker verifies before accepting connection.</>,
    <><b style={{color:meta.color}}>Step 3 — ACLs: Authorize operations</b><br/><br/><span style={{color:"#166534"}}>kafka-acls.sh --create \
  --allow-principal User:alice \
  --operation Read,Write \
  --topic orders</span><br/><br/>Even authenticated clients must have permission. Alice can read and write to 'orders' topic. Bob cannot.</>,
    <><b style={{color:meta.color}}>Step 4 — Complete flow: auth + authz</b><br/><br/>Client connects → TLS handshake (encrypt) → SASL auth (prove identity) → ACL check (verify permission) → Broker accepts or rejects.</>,
    <><b style={{color:meta.color}}>Step 5 — Quotas: protect the cluster</b><br/><br/><span style={{color:"#166534"}}>kafka-configs.sh --alter --add-config \
  'producer_byte_rate=1000000' \
  --entity-type clients --entity-name alice</span><br/><br/>Limit clients to 1MB/sec. Prevents one rogue client from overwhelming the cluster.</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
        {["tls","sasl","acl"].map(t=>(
          <button key={t} disabled={locked} onClick={()=>setAuthType(t)} style={{padding:"6px 12px",borderRadius:8,fontSize: 12,fontFamily:"monospace",fontWeight:600,background:authType===t?meta.color+"20":"rgba(248,250,252,0.92)",border:`1px solid ${authType===t?meta.color:"rgba(71, 85, 105, 0.5)"}`,color:authType===t?meta.color:locked?"#64748b":"#6b7280",cursor:locked?"not-allowed":"pointer",textTransform:"uppercase"}}>
            {t}
          </button>
        ))}
      </div>
      <div style={{borderRadius:10,background:meta.color+"08",border:`1px solid ${meta.color}25`,padding:"16px 14px"}}>
        {stage>=2&&(
          <div style={{display:"flex",alignItems:"center",gap:8,flexDirection:"column"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,width:"100%"}}>
              <div style={{borderRadius:6,padding:"6px 10px",background:"rgba(59, 130, 246, 0.2)",border:"1px solid #3b82f6",fontFamily:"monospace",fontSize: 12,color:"#1d4ed8"}}>Client</div>
              <Arrow on={stage>=2} color={authType==="tls"||authType==="sasl"?meta.color:"#475569"} label={stage>=2&&authType!=="acl"?"TLS":""}/>
              <div style={{borderRadius:6,padding:"6px 10px",background:authType==="tls"||authType==="sasl"?meta.color+"20":"#f1f5f9",border:`1px solid ${authType==="tls"||authType==="sasl"?meta.color:"#cbd5e1"}`,fontFamily:"monospace",fontSize: 12,color:authType==="tls"||authType==="sasl"?meta.color:"#64748b"}}>
                {stage>=2?(authType==="sasl"?"SASL":"TLS"):"Broker"}
              </div>
              {stage>=3&&<Arrow on color={authType==="acl"?meta.color:"#475569"} label={authType==="acl"?"ACL check":""}/>}
              {stage>=3&&<div style={{borderRadius:6,padding:"6px 10px",background:authType==="acl"?meta.color+"20":"#f1f5f9",border:`1px solid ${authType==="acl"?meta.color:"#cbd5e1"}`,fontFamily:"monospace",fontSize: 12,color:authType==="acl"?meta.color:"#64748b"}}>Broker</div>}
            </div>
            {stage>=2&&authType==="tls"&&<div style={{fontSize: 11,fontFamily:"monospace",color:"#64748b",marginTop:4}}>🔒 SSL/TLS: all traffic encrypted</div>}
            {stage>=2&&authType==="sasl"&&<div style={{fontSize: 11,fontFamily:"monospace",color:"#64748b",marginTop:4}}>🆔 SASL: client identity verified</div>}
            {stage>=3&&authType==="acl"&&<div style={{fontSize: 11,fontFamily:"monospace",color:"#64748b",marginTop:4}}>✅ ACL: operation permitted</div>}
          </div>
        )}
      </div>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
    </div>
  );
}

// ─── LESSON 19 (Kafka): Production Project ────────────────────────────────────
function KafkaProductionLesson({ meta }) {
  const STEPS = 7;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Architecture: 3 producers, 3 Kafka topics, Streams, Sinks, DLQs</b><br/><br/>Producers: orders-svc, clicks-svc, inventory-svc. Each publishes to its own topic with the same Avro schema. Real-time analytics compute revenue trends. Elasticsearch shows live dashboards. S3 stores raw data for reporting.</>,
    <><b style={{color:meta.color}}>Step 2 — Producer 1: orders-producer with idempotence</b><br/><br/><span style={{color:"#166534"}}>Producer({"{'bootstrap.servers':'kafka:9092',\n\'enable.idempotence\':\'true\',\n\'compression.type\':\'snappy\',\n\'acks\':\'all\'"})  <br/>produce('orders', key=user_id, value=order_json)</span><br/><br/>Each order message has a unique key (user_id) for ordering guarantee. Compression reduces bandwidth.</>,
    <><b style={{color:meta.color}}>Step 3 — All messages validated with Avro schemas</b><br/><br/>OrderEvent, ClickEvent, InventoryEvent schemas registered in Schema Registry. Producers serialize; consumers deserialize automatically. Breaking changes are rejected.</>,
    <><b style={{color:meta.color}}>Step 4 — Kafka Streams: compute revenue per category (1-min tumbling window)</b><br/><br/><span style={{color:"#166534"}}>source.groupByKey() \
    .windowedBy(TimeWindows.of(60000)) \
    .aggregate(sum_amount) \
    .to('revenue-by-category')</span><br/><br/>Real-time aggregation. RocksDB state store backed by changelog topic. Fault-tolerant.</>,
    <><b style={{color:meta.color}}>Step 5 — Kafka Connect: Elasticsearch sink (dashboards)</b><br/><br/>revenue-by-category topic → Kafka Connect ES sink → Elasticsearch index. Dashboards query ES for live metrics. Also S3 sink for historical data lake.</>,
    <><b style={{color:meta.color}}>Step 6 — Consumer group: fraud detection with velocity checks</b><br/><br/><span style={{color:"#166534"}}>Consumer({"{'group.id':'fraud-detection'}"})<br/>if user_orders_last_1min {">"}  10:<br/>{"    "}alert('velocity spike')</span><br/><br/>A dedicated consumer monitors for suspicious patterns and triggers alerts.</>,
    <><b style={{color:meta.color}}>Step 7 — Monitoring: consumer lag, broker metrics, throughput</b><br/><br/><span style={{color:"#166534"}}>kafka-consumer-groups.sh --describe --group fraud-detection</span><br/><br/>Track consumer lag with Prometheus + Grafana. Alert if lag exceeds threshold. Monitor under-replicated partitions and broker disk space. This is production Kafka!</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:meta.color+"08",border:`1px solid ${meta.color}25`,padding:"16px 14px",fontSize: 12,fontFamily:"monospace"}}>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {stage>=1&&(
            <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{color:"#64748b"}}>Producers:</span>
              <FlowNode tok={T.producer} icon="📦" label="orders" w={80} active={stage>=2}/>
              <FlowNode tok={T.producer} icon="🖱️" label="clicks" w={80} active={stage>=3}/>
              <FlowNode tok={T.producer} icon="📊" label="inventory" w={80} active={stage>=3}/>
            </div>
          )}
          {stage>=4&&(
            <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{color:"#64748b"}}>Streams:</span>
              <div style={{borderRadius:6,padding:"6px 10px",background:meta.color+"20",border:`1px solid ${meta.color}`,color:meta.color,fontWeight:600}}>revenue per category</div>
            </div>
          )}
          {stage>=5&&(
            <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{color:"#64748b"}}>Sinks:</span>
              <FlowNode tok={{bg:"#fef3c7",border:"#f59e0b",text:"#92400e",glow:"#f59e0b30"}} icon="🔍" label="Elasticsearch" w={95}/>
              <FlowNode tok={{bg:"#e0f2fe",border:"#0284c7",text:"#0c4a6e",glow:"#0284c730"}} icon="☁️" label="S3" w={80}/>
            </div>
          )}
          {stage>=6&&(
            <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{color:"#64748b"}}>Consumer:</span>
              <FlowNode tok={T.consumer} icon="⚠️" label="fraud detection" w={110} active/>
            </div>
          )}
          {stage>=7&&(
            <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{color:"#64748b"}}>Monitoring:</span>
              <div style={{borderRadius:6,padding:"6px 10px",background:"#f1f5f9",border:"1px solid #cbd5e1",color:"#64748b",fontSize: 11}}>consumer lag</div>
              <div style={{borderRadius:6,padding:"6px 10px",background:"#f1f5f9",border:"1px solid #cbd5e1",color:"#64748b",fontSize: 11}}>throughput</div>
              <div style={{borderRadius:6,padding:"6px 10px",background:"#f1f5f9",border:"1px solid #cbd5e1",color:"#64748b",fontSize: 11}}>replication</div>
            </div>
          )}
        </div>
      </div>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
    </div>
  );
}


// ─── LESSON 9 (Kafka): Kafka – Topics & Partitions ────────────────────────────
const KAFKA_KEYS = ["user-123","order-456","user-123","payment-789","order-456"];
function KafkaPartitionsLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const [msgKey, setMsgKey] = useState("user-123");
  const locked = stage > 0 && stage < STEPS;
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const targetPart = hashPartition(msgKey);
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Create topic with 3 partitions</b><br/><br/><span style={{color:"#166534"}}>from confluent_kafka.admin import AdminClient, NewTopic<br/><br/>admin = AdminClient({"{'bootstrap.servers':'localhost:9092'}"})  <br/>admin.create_topics([NewTopic('orders', num_partitions=3,<br/>{"    "}replication_factor=1)])</span><br/><br/>The topic 'orders' is split into 3 independent append-only logs called <b>partitions</b>.</>,
    <><b style={{color:meta.color}}>Step 2 — Producer sends with message key</b><br/><br/><span style={{color:"#166534"}}>from confluent_kafka import Producer<br/><br/>p = Producer({"{'bootstrap.servers':'localhost:9092'}"})  <br/>p.produce('orders', key='{msgKey}', value='buy BTC')<br/>p.flush()</span><br/><br/>The message key '<b>{msgKey}</b>' determines which partition this message goes to.</>,
    <><b style={{color:meta.color}}>Step 3 — Kafka hashes the key → Partition {targetPart}</b><br/><br/>Kafka applies a hash function to '<b>{msgKey}</b>':<br/><br/>murmur2('<b>{msgKey}</b>') % 3 = <b style={{color:meta.color}}>Partition {targetPart}</b><br/><br/>✅ Same key <b>always</b> goes to the same partition. This guarantees <b>ordering per key</b>. All orders for user-123 arrive in sequence.</>,
    <><b style={{color:meta.color}}>Step 4 — Message appended to Partition {targetPart}</b><br/><br/>The message is appended to the end of Partition {targetPart}'s log.<br/><br/>Each partition has its own sequential <b>offsets</b>: 0, 1, 2, 3...<br/><br/>The offset within a partition is where a consumer tracks progress.</>,
    <><b style={{color:meta.color}}>Step 5 — Consumer reads from Partition {targetPart}</b><br/><br/><span style={{color:"#166534"}}>from confluent_kafka import Consumer<br/><br/>c = Consumer({"{'bootstrap.servers':'localhost:9092',\n'group.id':'payment-svc'}"})  <br/>c.subscribe(['orders'])<br/>msg = c.poll(1.0)<br/>c.commit()</span><br/><br/>Kafka automatically assigns partitions to consumers. The consumer commits offset to track progress.</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
        <span style={{fontSize: 13,color:"#475569",fontFamily:"monospace"}}>message key:</span>
        {KAFKA_KEYS.filter((k,i,a)=>a.indexOf(k)===i).map(k=>(
          <button key={k} disabled={locked} onClick={()=>setMsgKey(k)} style={{padding:"3px 10px",borderRadius:9999,fontSize: 13,fontFamily:"monospace",background:msgKey===k?meta.color+"20":"rgba(248,250,252,0.92)",border:`1px solid ${msgKey===k?meta.color:"rgba(71, 85, 105, 0.5)"}`,color:msgKey===k?meta.color:locked?"#64748b":"#6b7280",cursor:locked?"not-allowed":"pointer"}}>{k}</button>
        ))}
        {locked&&<span style={{fontSize: 12,color:"#475569",fontFamily:"monospace"}}>🔒 locked</span>}
      </div>
      <div style={{borderRadius:10,background:"rgba(248,250,252,0.85)",border:"1px solid rgba(148,163,184,0.40)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:6,flexWrap:"wrap"}}>
          <FlowNode tok={T.producer} icon="💻" label="Producer" sub={stage>=2?`key='${msgKey}'`:""} active={stage===1||stage===2}/>
          <Arrow on={stage>=2} color={T.producer.border} label={stage>=2?msgKey:""}/>
          {/* Kafka broker with 3 partitions */}
          <div style={{borderRadius:10,padding:"12px 14px",background:"rgba(99, 102, 241, 0.1)",border:`1px solid ${T.kafka.border}40`,minWidth:160,backdropFilter:"blur(8px)"}}>
            <div style={{fontSize: 13,color:T.kafka.text,fontFamily:"system-ui, -apple-system, sans-serif",fontWeight:600,marginBottom:8}}>🗄️ Kafka Topic: orders</div>
            {[0,1,2].map(p=>(
              <div key={p} style={{display:"flex",alignItems:"center",gap:6,marginBottom:p<2?6:0}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:PART_COLORS[p],flexShrink:0,boxShadow:`0 0 8px ${PART_COLORS[p]}40`}}/>
                <div style={{flex:1,borderRadius:6,padding:"4px 8px",fontSize: 12,fontFamily:"monospace",background:stage>=4&&p===targetPart?PART_COLORS[p]+"20":"#f1f5f9",border:`1px solid ${stage>=4&&p===targetPart?PART_COLORS[p]:stage>=3&&p===targetPart?PART_COLORS[p]+"80":"rgba(148,163,184,0.60)"}`,color:stage>=3&&p===targetPart?PART_COLORS[p]:"#64748b",transition:"all 0.35s"}}>
                  P{p}: offset 0→{p===1?8:p===0?5:3}{stage>=4&&p===targetPart?` ← NEW`:""}
                </div>
              </div>
            ))}
          </div>
          <Arrow on={stage>=5} color={PART_COLORS[targetPart]} label={stage>=5?`P${targetPart}`:""}/>
          <FlowNode tok={T.consumer} icon="🖥️" label="Consumer" sub={stage>=5?"payment-svc":""} active={stage===5} dimmed={stage<5}/>
        </div>
        {stage>=3&&(
          <div style={{marginTop:12,padding:"10px 14px",borderRadius:8,background:`linear-gradient(135deg, ${PART_COLORS[targetPart]}08, ${PART_COLORS[targetPart]}12)`,border:`1px solid ${PART_COLORS[targetPart]}40`,fontSize: 14,fontFamily:"system-ui, -apple-system, sans-serif",color:PART_COLORS[targetPart],backdropFilter:"blur(8px)"}}>
            hash('{msgKey}') % 3 = <b>{targetPart}</b> → always Partition {targetPart} → ordering guaranteed for '{msgKey}'
          </div>
        )}
      </div>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
    </div>
  );
}

// ─── LESSON 10: Kafka – Consumer Groups ──────────────────────────────────────
function KafkaGroupsLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Consumers in a group subscribe</b><br/><br/><span style={{color:"#166534"}}>c = Consumer({"{'bootstrap.servers':'localhost:9092',\n'group.id':'payment-svc'}"})  <br/>c.subscribe(['orders'])</span><br/><br/>All 3 consumers share the same <b>group.id='payment-svc'</b>. Kafka knows they are in the same group and will divide the work.</>,
    <><b style={{color:meta.color}}>Step 2 — Kafka assigns one partition per consumer</b><br/><br/>With 3 partitions and 3 consumers in the group:<br/><br/>• Consumer 1 → Partition 0<br/>• Consumer 2 → Partition 1<br/>• Consumer 3 → Partition 2<br/><br/>Each partition goes to <b>exactly one</b> consumer in the group. This is the <b>partition assignment</b>.</>,
    <><b style={{color:meta.color}}>Step 3 — Message on P0 → only Consumer 1 receives it</b><br/><br/>A new order arrives on Partition 0. <b>Only Consumer 1</b> gets it — Consumer 2 and Consumer 3 are not affected.<br/><br/>This is parallel processing: all 3 partitions are consumed simultaneously by different workers.</>,
    <><b style={{color:meta.color}}>Step 4 — A second consumer group reads ALL messages too</b><br/><br/><span style={{color:"#166534"}}>c2 = Consumer({"{'group.id':'analytics-svc'}"})  <br/>c2.subscribe(['orders'])</span><br/><br/>'analytics-svc' is a <b>completely separate group</b>. It gets its own copy of every message from every partition — completely independent of 'payment-svc'. This is how Kafka differs from RabbitMQ queues.</>,
    <><b style={{color:meta.color}}>Step 5 — Consumer 1 crashes → Partition 0 rebalanced</b><br/><br/>Kafka detects Consumer 1 missed heartbeats. A <b>rebalance</b> is triggered:<br/><br/>• Consumer 2 now handles P0 + P1<br/>• Consumer 3 still handles P2<br/><br/>No messages are lost. Kafka picks up from the last committed offset automatically.</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:"rgba(248,250,252,0.85)",border:"1px solid rgba(148,163,184,0.40)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        {/* Topic partitions */}
        <div style={{marginBottom:12}}>
          <div style={{fontSize: 12,color:"#475569",fontFamily:"monospace",marginBottom:6,letterSpacing:1}}>🗄️ KAFKA TOPIC: orders (3 partitions)</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {[0,1,2].map(p=>{
              const c1active=(p===0&&stage===3);
              const rebalanced=(p===0&&stage===5);
              return(
                <div key={p} style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{width:80,borderRadius:6,padding:"4px 8px",fontSize: 12,fontFamily:"monospace",background:PART_COLORS[p]+"20",border:`1px solid ${PART_COLORS[p]}`,color:PART_COLORS[p],textAlign:"center"}}>P{p}</div>
                  <Arrow on={stage>=2} color={PART_COLORS[p]} label={stage>=2?`→ C${rebalanced&&p===0?2:p+1}${rebalanced&&p===0?" (rebalanced)":""}`:""} />
                  <FlowNode tok={{bg:"#f0fdf4",border:PART_COLORS[p],text:PART_COLORS[p],glow:PART_COLORS[p]+"30"}}
                    icon={p===0&&stage===5?"💥":"⚙️"}
                    label={`Consumer ${p+1}`}
                    sub={p===0&&stage===5?"CRASHED":stage>=2?`payment-svc`:""}
                    active={c1active&&!rebalanced}
                    dimmed={p===0&&stage===5}
                  />
                  {stage>=4&&(
                    <>
                      <Arrow on color="#475569"/>
                      <FlowNode tok={{bg:"#f5f3ff",border:"#a855f7",text:"#d8b4fe",glow:"#a855f730"}} icon="📊" label={`Analytics C${p+1}`} sub="analytics-svc" active={stage===4||stage===5} w={100}/>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {stage>=4&&(
          <div style={{padding:"8px 12px",borderRadius:8,background:"#f5f3ff",border:"1px solid #a855f750",fontSize: 13,fontFamily:"monospace",color:"#d8b4fe"}}>
            💡 Two groups read the same topic independently. payment-svc and analytics-svc both get every message — zero overlap, zero interference.
          </div>
        )}
      </div>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
    </div>
  );
}

// ─── LESSON 9 (SQS): Hello SQS ────────────────────────────────────────────────
function SQSHelloLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Create queue (fully managed — AWS handles everything)</b><br/><br/><span style={{color:"#166534"}}>import boto3<br/>sqs = boto3.client('sqs', region_name='us-east-1')<br/>response = sqs.create_queue(QueueName='orders-queue')<br/>queue_url = response['QueueUrl']</span><br/><br/>Unlike Kafka, there is NO broker to run. AWS manages the entire queue infrastructure behind the scenes.</>,
    <><b style={{color:meta.color}}>Step 2 — Producer sends a message</b><br/><br/><span style={{color:"#166534"}}>sqs.send_message(<br/>{"    "}QueueUrl=queue_url,<br/>{"    "}MessageBody='Order #1234')</span><br/><br/>Message is stored in SQS. AWS keeps it safe and available for consumers.</>,
    <><b style={{color:meta.color}}>Step 3 — Consumer receives (message becomes INVISIBLE)</b><br/><br/><span style={{color:"#166534"}}>response = sqs.receive_message(<br/>{"    "}QueueUrl=queue_url,<br/>{"    "}VisibilityTimeout=30)<br/>receipt = response['Messages'][0]['ReceiptHandle']</span><br/><br/>⚠️ Message is hidden from other consumers for 30 seconds. If consumer crashes, message reappears after timeout.</>,
    <><b style={{color:meta.color}}>Step 4 — Consumer processes (has 30 seconds)</b><br/><br/>The consumer has up to 30 seconds (VisibilityTimeout) to process the message. If processing takes longer, extend the timeout with ChangeMessageVisibility.</>,
    <><b style={{color:meta.color}}>Step 5 — Delete the message (only way to remove it)</b><br/><br/><span style={{color:"#166534"}}>sqs.delete_message(QueueUrl=queue_url, ReceiptHandle=receipt)</span><br/><br/>✅ Message permanently removed. If NOT deleted within timeout, message reappears for another consumer — this is SQS's crash-safety mechanism!</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:meta.color+"08",border:`1px solid ${meta.color}25`,padding:"18px 16px"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <FlowNode tok={T.producer} icon="💻" label="Producer" active={stage===2}/>
          <Arrow on={stage>=2} color={T.producer.border} label={stage>=2?"send":""}/>
          <FlowNode tok={T.sqs} icon="📮" label="SQS Queue" sub={stage>=3?"(invisible 30s)":stage>=5?"(deleted)":stage>=2?"(visible)":""} active={stage>=2}/>
          <Arrow on={stage>=3} color={T.sqs.border} label={stage>=3?"receive":""}/>
          <FlowNode tok={T.consumer} icon="🖥️" label="Consumer" sub={stage>=4?"processing":stage===5?"✅ done":""} active={stage>=3}/>
        </div>
        {stage>=3&&stage<5&&(
          <div style={{marginTop:12,padding:"10px 12px",borderRadius:8,background:`linear-gradient(135deg, ${meta.color}15, ${meta.color}20)`,border:`1px solid ${meta.color}30`,fontSize: 12,fontFamily:"monospace",color:meta.color}}>
            ⏱️ 30-second visibility timeout — must delete before it expires!
          </div>
        )}
      </div>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
    </div>
  );
}

// ─── LESSON 10 (SQS): Long Polling ────────────────────────────────────────────
function SQSPollingLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const [pollType, setPollType] = useState("short");
  const locked = stage > 0 && stage < STEPS;
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Short polling: request returns immediately (expensive)</b><br/><br/><span style={{color:"#166534"}}>for i in range(60):  # Every second for 60 seconds<br/>{"    "}response = sqs.receive_message(QueueUrl=queue_url)<br/>{"    "}# Usually empty!</span><br/><br/>Makes 60 API calls/minute. Most return empty. AWS charges per API call. Very expensive!</>,
    <><b style={{color:meta.color}}>Step 2 — Long polling: wait up to 20 seconds (efficient)</b><br/><br/><span style={{color:"#166534"}}>response = sqs.receive_message(<br/>{"    "}QueueUrl=queue_url,<br/>{"    "}WaitTimeSeconds=20)</span><br/><br/>Waits up to 20 seconds for a message to arrive. If one shows up after 3 seconds, returns immediately. Reduces API calls 10× — much cheaper!</>,
    <><b style={{color:meta.color}}>Step 3 — Batch send: 10 messages in one API call</b><br/><br/><span style={{color:"#166534"}}>sqs.send_message_batch(<br/>{"    "}QueueUrl=queue_url,<br/>{"    "}Entries=[<br/>{"    "}{"    "}{"{'Id': 'msg1', 'MessageBody': 'Order 1'}"},<br/>{"    "}{"    "}{"{'Id': 'msg2', 'MessageBody': 'Order 2'}"},<br/>{"    "}{"    "}# ... up to 10 messages<br/>{"    "}])</span><br/><br/>Send/receive up to 10 messages per API call. Drastically reduces cost.</>,
    <><b style={{color:meta.color}}>Step 4 — Compare: short vs long polling with batching</b><br/><br/>Short polling: 1000 receive_message calls/min, 99% empty. $3.50/mo<br/>Long polling + batch: 100 receive_message_batch calls/min, efficient. $0.35/mo — 10× cheaper!</>,
    <><b style={{color:meta.color}}>Step 5 — Production recommendation</b><br/><br/>Always use WaitTimeSeconds=20 and batch operations. Single receive_message calls are rare and expensive. Best practice: few large batches rather than many small calls.</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
        {["short","long"].map(t=>(
          <button key={t} disabled={locked} onClick={()=>setPollType(t)} style={{padding:"6px 12px",borderRadius:8,fontSize: 12,fontFamily:"monospace",fontWeight:600,background:pollType===t?meta.color+"20":"rgba(248,250,252,0.92)",border:`1px solid ${pollType===t?meta.color:"rgba(71, 85, 105, 0.5)"}`,color:pollType===t?meta.color:locked?"#64748b":"#6b7280",cursor:locked?"not-allowed":"pointer",textTransform:"capitalize"}}>
            {t} polling
          </button>
        ))}
      </div>
      <div style={{borderRadius:10,background:meta.color+"08",border:`1px solid ${meta.color}25`,padding:"16px 14px"}}>
        {stage>=2&&(
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <div style={{fontSize: 12,fontFamily:"monospace",color:"#475569"}}>📊 API Calls per minute:</div>
            <div style={{display:"flex",gap:4,alignItems:"flex-end",height:60}}>
              {[...Array(5)].map((_, i)=>{
                const h = pollType==="short" ? 50 : 10;
                return (
                  <div key={i} style={{flex:1,height:h,background:meta.color+"40",borderRadius:4,transition:"all 0.3s",opacity:0.7+(i*0.1)}}/>
                );
              })}
            </div>
            <div style={{fontSize: 11,fontFamily:"monospace",color:"#64748b",display:"flex",justifyContent:"space-between"}}>
              <span>{pollType==="short"?"Short: 60+ calls":"Long: 10 calls"}</span>
              <span>{pollType==="short"?"99% empty":"Efficient"}</span>
            </div>
          </div>
        )}
      </div>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
    </div>
  );
}

// ─── LESSON 12 (SQS): Dead Letter Queues ──────────────────────────────────────
function SQSDLQLesson({ meta }) {
  const STEPS = 6;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Problem: poison pills (messages that always fail)</b><br/><br/>A malformed message keeps failing on every retry. It blocks the consumer and wastes time. Need a way to isolate it.</>,
    <><b style={{color:meta.color}}>Step 2 — Create a Dead Letter Queue (DLQ)</b><br/><br/><span style={{color:"#166534"}}>sqs.create_queue(QueueName='orders-dlq')</span><br/><br/>A separate SQS queue where problematic messages go. Think of it as a quarantine zone.</>,
    <><b style={{color:meta.color}}>Step 3 — Configure main queue with RedrivePolicy</b><br/><br/><span style={{color:"#166534"}}>sqs.set_queue_attributes(<br/>{"    "}QueueUrl=queue_url,<br/>{"    "}Attributes={"{"}<br/>{"    "}{"    "}'RedrivePolicy': json.dumps({"{"}<br/>{"    "}{"    "}{"    "}'deadLetterTargetArn': 'arn:aws:sqs:...dlq',<br/>{"    "}{"    "}{"    "}'maxReceiveCount': 3<br/>{"    "}{"    "}{"}"}))<br/>{"    "}{"}"})</span><br/><br/>After 3 failed receive attempts, SQS automatically moves the message to the DLQ.</>,
    <><b style={{color:meta.color}}>Step 4 — Message flows: receive → process → delete or fail→retry→DLQ</b><br/><br/>Success path: receive → process → delete (done).<br/>Failure path: receive #1 fails → retry → receive #2 fails → retry → receive #3 fails → DLQ (quarantine).</>,
    <><b style={{color:meta.color}}>Step 5 — Monitor DLQ with CloudWatch alarms</b><br/><br/><span style={{color:"#166534"}}>alarm = cloudwatch.put_metric_alarm(<br/>{"    "}AlarmName='orders-dlq-has-messages',<br/>{"    "}MetricName='ApproximateNumberOfMessagesVisible',<br/>{"    "}Dimensions=[{"{'Name': 'QueueName', 'Value': 'orders-dlq'}"}],<br/>{"    "}Threshold=1, ComparisonOperator='GreaterThanOrEqualToThreshold')</span><br/><br/>Alert your ops team immediately when messages appear in DLQ.</>,
    <><b style={{color:meta.color}}>Step 6 — Manual investigation and redrive</b><br/><br/>Inspect the failed message in DLQ. Fix the bug. Re-send the message to the main queue (redrive). This is your fallback mechanism for unhandled errors.</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:meta.color+"08",border:`1px solid ${meta.color}25`,padding:"16px 14px"}}>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <FlowNode tok={T.producer} icon="📮" label="Producer" active={stage>=1} w={90}/>
            <Arrow on={stage>=1} color={T.producer.border}/>
            <FlowNode tok={T.sqs} icon="📋" label="Main Queue" active={stage>=1} w={100}/>
            {stage>=3&&<Arrow on color={T.dlq.border} label="maxReceive=3"/>}
            {stage>=3&&<FlowNode tok={T.dlq} icon="☠️" label="DLQ" active={stage>=4} w={80}/>}
          </div>
          {stage>=4&&(
            <div style={{marginTop:6,padding:"8px 10px",borderRadius:6,background:`linear-gradient(135deg, ${T.dlq.border}15, ${T.dlq.border}20)`,border:`1px solid ${T.dlq.border}30`,fontSize: 12,fontFamily:"monospace",color:T.dlq.text}}>
              ☠️ Poison pill: fails 3 times → quarantined in DLQ → ops alerted → manual redrive
            </div>
          )}
        </div>
      </div>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
    </div>
  );
}

// ─── LESSON 13 (SQS): SQS + Lambda ────────────────────────────────────────────
function SQSLambdaLesson({ meta }) {
  const STEPS = 6;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Create event source mapping: SQS → Lambda</b><br/><br/><span style={{color:"#166534"}}>lambda_client.create_event_source_mapping(<br/>{"    "}EventSourceArn='arn:aws:sqs:...:orders-queue',<br/>{"    "}FunctionName='process-order',<br/>{"    "}BatchSize=10,<br/>{"    "}BatchWindow=5)</span><br/><br/>AWS automatically polls the SQS queue and invokes your Lambda function whenever messages arrive.</>,
    <><b style={{color:meta.color}}>Step 2 — Lambda is triggered with batch of messages</b><br/><br/><span style={{color:"#166534"}}>def process_order(event, context):<br/>{"    "}for record in event['Records']:<br/>{"    "}{"    "}body = json.loads(record['body'])<br/>{"    "}{"    "}print(f"Processing order {body['id']}")</span><br/><br/>event['Records'] contains up to 10 messages (BatchSize). Process them all in one Lambda invocation.</>,
    <><b style={{color:meta.color}}>Step 3 — Successful processing: Lambda returns empty list</b><br/><br/><span style={{color:"#166534"}}>return {"{'batchItemFailures': []}"} {" "} # All succeeded</span><br/><br/>SQS automatically deletes all 10 messages from the queue. Done!</>,
    <><b style={{color:meta.color}}>Step 4 — Partial batch failure: return failed message IDs</b><br/><br/><span style={{color:"#166534"}}>failed = []<br/>for record in event['Records']:<br/>{"    "}try:<br/>{"    "}{"    "}process(record)<br/>{"    "}except:<br/>{"    "}{"    "}failed.append({"{'itemId': record['messageId']}"})<br/>return {"{'batchItemFailures': failed}"}</span><br/><br/>Only failed messages are returned to queue. Successful ones are deleted. No all-or-nothing blocking.</>,
    <><b style={{color:meta.color}}>Step 5 — Concurrency and scalability</b><br/><br/>Multiple Lambda instances run in parallel. Each processes a batch. As queue depth grows, AWS auto-scales Lambda concurrency. One Lambda instance = one batch = max 10 messages at a time.</>,
    <><b style={{color:meta.color}}>Step 6 — Error handling: DLQ for Lambda failures</b><br/><br/><span style={{color:"#166534"}}>Lambda function crashes → SQS re-delivers → maxReceiveCount hits → DLQ</span><br/><br/>If your Lambda keeps crashing, after maxReceiveCount retries, the message goes to the DLQ. Chain SQS→Lambda→DLQ for complete safety.</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:meta.color+"08",border:`1px solid ${meta.color}25`,padding:"16px 14px"}}>
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          <FlowNode tok={T.sqs} icon="📮" label="SQS Queue" sub={stage>=2?"polling":"wait"} active={stage>=1} w={100}/>
          {stage>=2&&<Arrow on color={meta.color} label="batch(10)"/>}
          {stage>=2&&<FlowNode tok={{bg:meta.color+"15",border:meta.color,text:meta.color,glow:meta.color+"30"}} icon="⚡" label="Lambda" sub={stage>=3?"processing":"invoked"} active={stage>=2} w={90}/>}
          {stage>=3&&<Arrow on color={stage>=4?meta.color:"#ef4444"} label={stage>=4?"partial fail":""}/>}
          {stage>=3&&<FlowNode tok={stage>=4?T.dlq:T.consumer} icon={stage>=4?"☠️":"✅"} label={stage>=4?"DLQ":"Deleted"} active w={80}/>}
        </div>
      </div>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
    </div>
  );
}

// ─── LESSON 14 (SQS): SNS + SQS Fan-out ───────────────────────────────────────
function SQSFanoutLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Problem: one message, many independent consumers</b><br/><br/>When an order is placed, you need to: send email receipt, record analytics, update inventory. Three completely independent services. How to decouple?</>,
    <><b style={{color:meta.color}}>Step 2 — SNS Topic: fan-out hub</b><br/><br/><span style={{color:"#166534"}}>sns = boto3.client('sns')<br/>sns.create_topic(Name='order-events')<br/>sns.publish(<br/>{"    "}TopicArn='arn:aws:sns:...:order-events',<br/>{"    "}Message=json.dumps({"{'order_id': 123}"}))</span><br/><br/>Publish ONE message to SNS. SNS automatically fans it out to all subscribed SQS queues.</>,
    <><b style={{color:meta.color}}>Step 3 — Subscribe SQS queues to SNS topic</b><br/><br/><span style={{color:"#166534"}}># Create 3 queues<br/>email_queue = sqs.create_queue(QueueName='email-queue')<br/>analytics_queue = sqs.create_queue(QueueName='analytics-queue')<br/>inventory_queue = sqs.create_queue(QueueName='inventory-queue')<br/><br/># Subscribe each to SNS topic<br/>sns.subscribe(TopicArn=topic_arn, Protocol='sqs', Endpoint=email_queue_arn)</span><br/><br/>Each SQS queue receives a COPY of every message. Independent processing!</>,
    <><b style={{color:meta.color}}>Step 4 — Consumers process independently</b><br/><br/>Email service polls email-queue. Analytics service polls analytics-queue. Inventory service polls inventory-queue. None interfere. One slow service doesn't block others. Perfect decoupling!</>,
    <><b style={{color:meta.color}}>Step 5 — Add new consumer without changing publisher</b><br/><br/>New requirement: send SMS notifications. Create sms-queue, subscribe to SNS topic. Done! No change to producer code. This is the power of pub/sub with SQS.</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:meta.color+"08",border:`1px solid ${meta.color}25`,padding:"16px 14px"}}>
        <div style={{display:"flex",flexDirection:"column",gap:10,alignItems:"center"}}>
          {stage>=1&&<FlowNode tok={T.producer} icon="📤" label="Publisher" active w={100}/>}
          {stage>=2&&<Arrow on color={meta.color} label="SNS Topic"/>}
          {stage>=2&&(
            <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
              <FlowNode tok={T.sqs} icon="📧" label="Email Queue" active={stage>=3} w={95}/>
              {stage>=4&&<FlowNode tok={T.consumer} icon="✉️" label="Email Svc" active w={95}/>}
            </div>
          )}
          {stage>=3&&(
            <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
              <FlowNode tok={T.sqs} icon="📊" label="Analytics Queue" active={stage>=4} w={95}/>
              {stage>=4&&<FlowNode tok={T.consumer} icon="📈" label="Analytics Svc" active w={95}/>}
            </div>
          )}
          {stage>=3&&(
            <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
              <FlowNode tok={T.sqs} icon="📦" label="Inventory Queue" active={stage>=4} w={95}/>
              {stage>=4&&<FlowNode tok={T.consumer} icon="🏭" label="Inventory Svc" active w={95}/>}
            </div>
          )}
        </div>
        {stage>=4&&(
          <div style={{marginTop:10,padding:"8px 10px",borderRadius:6,background:`linear-gradient(135deg, ${meta.color}15, ${meta.color}20)`,border:`1px solid ${meta.color}30`,fontSize: 12,fontFamily:"monospace",color:meta.color}}>
            ✅ Decoupled: each consumer independent. Add/remove without affecting others.
          </div>
        )}
      </div>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
    </div>
  );
}

// ─── LESSON 15 (SQS): Message Attributes & Filtering ──────────────────────────
function SQSFilteringLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const [filterType, setFilterType] = useState("string");
  const locked = stage > 0 && stage < STEPS;
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Attach metadata to messages: MessageAttributes</b><br/><br/><span style={{color:"#166534"}}>sns.publish(<br/>{"    "}TopicArn=topic_arn,<br/>{"    "}Message=message,<br/>{"    "}MessageAttributes={"{"}<br/>{"    "}{"    "}'event_type': {"{'DataType': 'String', 'StringValue': 'order'}"},<br/>{"    "}{"    "}'priority': {"{'DataType': 'String', 'StringValue': 'high'}"},<br/>{"    "}{"    "}'region': {"{'DataType': 'String', 'StringValue': 'us-west-2'}"}<br/>{"    "}{"}"})</span><br/><br/>Each message carries structured metadata beyond the message body.</>,
    <><b style={{color:meta.color}}>Step 2 — Define filter policy: only matching attributes are delivered</b><br/><br/><span style={{color:"#166534"}}>filter_policy = {"{"}<br/>{"    "}'event_type': ['order', 'payment'],<br/>{"    "}'priority': ['high'],<br/>{"    "}'region': ['us-west-2', 'us-east-1']<br/>{"}"}<br/>sns.set_subscription_attributes(..., AttributeName='FilterPolicy', AttributeValue=json.dumps(filter_policy))</span><br/><br/>SNS only delivers to this queue if: (event_type=order OR payment) AND priority=high AND (region=us-west OR us-east).</>,
    <><b style={{color:meta.color}}>Step 3 — String matching: exact values</b><br/><br/>Filter: {"{'event_type': ['order']}"} → only messages with event_type=order pass. Messages with event_type=payment are dropped (saved to DLQ or lost, depending on SNS config).</>,
    <><b style={{color:meta.color}}>Step 4 — Numeric and exists conditions</b><br/><br/><span style={{color:"#166534"}}>filter_policy = {"{"}<br/>{"    "}'amount': [{"{'numeric': ['>', 100]}"}],  # amount > 100<br/>{"    "}'optional_field': [{"{'exists': True}"}]  # field must be present<br/>{"}"}</span><br/><br/>Powerful matching: numeric comparisons, field existence, array contains. All without writing code.</>,
    <><b style={{color:meta.color}}>Step 5 — Cost savings: unmatched messages never reach queue</b><br/><br/>SNS filter is applied server-side. Messages that don't match the filter policy are not fanned to the queue. No API charges, no storage cost for irrelevant messages. Filter early, filter often!</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
        {["string","numeric","exists"].map(f=>(
          <button key={f} disabled={locked} onClick={()=>setFilterType(f)} style={{padding:"6px 12px",borderRadius:8,fontSize: 12,fontFamily:"monospace",fontWeight:600,background:filterType===f?meta.color+"20":"rgba(248,250,252,0.92)",border:`1px solid ${filterType===f?meta.color:"rgba(71, 85, 105, 0.5)"}`,color:filterType===f?meta.color:locked?"#64748b":"#6b7280",cursor:locked?"not-allowed":"pointer",textTransform:"capitalize"}}>
            {f}
          </button>
        ))}
      </div>
      <div style={{borderRadius:10,background:meta.color+"08",border:`1px solid ${meta.color}25`,padding:"16px 14px"}}>
        {stage>=2&&(
          <div style={{display:"flex",flexDirection:"column",gap:6,fontSize: 12,fontFamily:"monospace"}}>
            <div style={{color:"#475569"}}>📋 Filter Policy:</div>
            {filterType==="string"&&(
              <div style={{padding:"8px 10px",borderRadius:6,background:"#f1f5f9",color:"#64748b"}}>
                {"{"} "event_type": ["order", "payment"] {"}"}
              </div>
            )}
            {filterType==="numeric"&&(
              <div style={{padding:"8px 10px",borderRadius:6,background:"#f1f5f9",color:"#64748b"}}>
                {"{"} "amount": [{"{numeric: [">", 100]}"} ] {"}"}
              </div>
            )}
            {filterType==="exists"&&(
              <div style={{padding:"8px 10px",borderRadius:6,background:"#f1f5f9",color:"#64748b"}}>
                {"{"} "optional_field": [{"{exists: true}"} ] {"}"}
              </div>
            )}
            {stage>=3&&(
              <div style={{padding:"8px 10px",borderRadius:6,background:meta.color+"15",color:meta.color}}>
                ✅ Only matching messages reach queue | ❌ Others dropped
              </div>
            )}
          </div>
        )}
      </div>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
    </div>
  );
}

// ─── LESSON 16 (SQS): Security ────────────────────────────────────────────────
function SQSSecurityLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — IAM: control WHO can access the queue</b><br/><br/><span style={{color:"#166534"}}>{"{"}<br/>{"  "}"Effect": "Allow",<br/>{"  "}"Principal": {"{"} "AWS": "arn:aws:iam::123456:user/alice" {"}"},<br/>{"  "}"Action": ["sqs:SendMessage", "sqs:ReceiveMessage"],<br/>{"  "}"Resource": "arn:aws:sqs:us-east-1:123456:orders-queue"<br/>{"}"}</span><br/><br/>Only Alice can send and receive. Bob cannot. Fine-grained permission control.</>,
    <><b style={{color:meta.color}}>Step 2 — Queue Policy: cross-account or service access</b><br/><br/><span style={{color:"#166534"}}>sqs.set_queue_attributes(<br/>{"    "}QueueUrl=queue_url,<br/>{"    "}Attributes={"{"}<br/>{"    "}{"    "}'Policy': json.dumps({"{"} "Effect": "Allow", "Principal": "arn:aws:iam::OTHER_ACCOUNT:role/service" {"}"})<br/>{"    "}{"}"})</span><br/><br/>Resource-based policy. Allows another AWS account's service to access this queue.</>,
    <><b style={{color:meta.color}}>Step 3 — KMS: encrypt messages at rest</b><br/><br/><span style={{color:"#166534"}}>sqs.set_queue_attributes(<br/>{"    "}QueueUrl=queue_url,<br/>{"    "}Attributes={"{"}<br/>{"    "}{"    "}'KmsMasterKeyId': 'arn:aws:kms:...:key/...'<br/>{"    "}{"}"})</span><br/><br/>Each message is encrypted with the KMS key before storage. Decrypted on receive. Data safe at rest.</>,
    <><b style={{color:meta.color}}>Step 4 — VPC Endpoint: private network (no internet)</b><br/><br/><span style={{color:"#166534"}}>ec2 = boto3.client('ec2')<br/>ec2.create_vpc_endpoint(<br/>{"    "}VpcEndpointType='Interface',<br/>{"    "}ServiceName='com.amazonaws.us-east-1.sqs')</span><br/><br/>EC2 instances in the VPC communicate with SQS via private endpoint. No internet gateway needed. Data never leaves AWS network.</>,
    <><b style={{color:meta.color}}>Step 5 — Layered security: IAM + Queue Policy + KMS + VPC</b><br/><br/>All four together: who accesses (IAM), from where (VPC endpoint), how encrypted (KMS), what permissions (queue policy). Defense in depth!</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:meta.color+"08",border:`1px solid ${meta.color}25`,padding:"16px 14px"}}>
        {stage>=1&&(
          <div style={{display:"flex",flexDirection:"column",gap:6,fontSize: 12}}>
            <div style={{display:"flex",gap:4,alignItems:"center"}}>
              <div style={{width:16,height:16,borderRadius:4,background:"#ef4444"}}/>
              <span style={{color:"#64748b",fontWeight:600}}>IAM</span>
              <span style={{color:"#475569",fontSize: 11}}>Who</span>
            </div>
            {stage>=2&&(
              <div style={{display:"flex",gap:4,alignItems:"center"}}>
                <div style={{width:16,height:16,borderRadius:4,background:"#f97316"}}/>
                <span style={{color:"#64748b",fontWeight:600}}>Queue Policy</span>
                <span style={{color:"#475569",fontSize: 11}}>Cross-Account</span>
              </div>
            )}
            {stage>=3&&(
              <div style={{display:"flex",gap:4,alignItems:"center"}}>
                <div style={{width:16,height:16,borderRadius:4,background:"#eab308"}}/>
                <span style={{color:"#64748b",fontWeight:600}}>KMS Encryption</span>
                <span style={{color:"#475569",fontSize: 11}}>At Rest</span>
              </div>
            )}
            {stage>=4&&(
              <div style={{display:"flex",gap:4,alignItems:"center"}}>
                <div style={{width:16,height:16,borderRadius:4,background:"#06b6d4"}}/>
                <span style={{color:"#64748b",fontWeight:600}}>VPC Endpoint</span>
                <span style={{color:"#475569",fontSize: 11}}>Private</span>
              </div>
            )}
          </div>
        )}
      </div>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
    </div>
  );
}

// ─── LESSON 17 (SQS): Production Project ──────────────────────────────────────
function SQSProductionLesson({ meta }) {
  const STEPS = 7;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Architecture: Order API → order-queue.fifo → validators → payment-queue → SNS fan-out → downstream queues + DLQs</b><br/><br/>Strict ordering, exactly-once delivery, multiple stages, independent consumers, comprehensive DLQ monitoring.</>,
    <><b style={{color:meta.color}}>Step 2 — FIFO queue: strict ordering per customer</b><br/><br/><span style={{color:"#166534"}}>sqs.send_message(<br/>{"    "}QueueUrl='order-queue.fifo',<br/>{"    "}MessageGroupId=customer_id,  # Orders for Alice in sequence<br/>{"    "}MessageDeduplicationId=order_id,  # Idempotent<br/>{"    "}MessageBody=json.dumps(order))</span><br/><br/>Orders for customer "alice" always processed in sequence. Dedup ID prevents accidental replays within 5 min.</>,
    <><b style={{color:meta.color}}>Step 3 — Lambda validator: check order, inventory, update DB</b><br/><br/><span style={{color:"#166534"}}>def validate_order(event):<br/>{"    "}for record in event['Records']:<br/>{"    "}{"    "}order = json.loads(record['body'])<br/>{"    "}{"    "}if check_inventory(order):<br/>{"    "}{"    "}{"    "}sqs.send_message(QueueUrl=payment_queue, MessageBody=order)<br/>{"    "}{"    "}else:<br/>{"    "}{"    "}{"    "}sqs.send_message(QueueUrl=dlq, MessageBody=order)</span><br/><br/>Success → payment queue. Failure → DLQ. Clean separation.</>,
    <><b style={{color:meta.color}}>Step 4 — Payment processing: charge card, emit success</b><br/><br/><span style={{color:"#166534"}}>def process_payment(event):<br/>{"    "}for record in event['Records']:<br/>{"    "}{"    "}order = json.loads(record['body'])<br/>{"    "}{"    "}charge_result = stripe.charge(...)<br/>{"    "}{"    "}sns.publish(TopicArn=payment_success_topic, Message=order)</span><br/><br/>Successfully charged orders published to SNS payment_success topic.</>,
    <><b style={{color:meta.color}}>Step 5 — SNS fan-out: email, analytics, inventory (independent)</b><br/><br/>payment_success topic → 3 queues:<br/>• email-queue (send receipt)<br/>• analytics-queue (track metrics)<br/>• inventory-queue (decrement stock)<br/><br/>All work in parallel. One slow consumer doesn't block others.</>,
    <><b style={{color:meta.color}}>Step 6 — DLQ monitoring: alerts and manual redrive</b><br/><br/><span style={{color:"#166534"}}>cloudwatch.put_metric_alarm(<br/>{"    "}AlarmName='dlq-has-messages',<br/>{"    "}MetricName='ApproximateNumberOfMessagesVisible',<br/>{"    "}Threshold=1,<br/>{"    "}AlarmActions=['arn:aws:sns:...pagerduty'])</span><br/><br/>DLQ messages trigger PagerDuty. Ops investigates, fixes, redrives.</>,
    <><b style={{color:meta.color}}>Step 7 — Cost optimization: batching, long polling, SQS Extended Client</b><br/><br/>• Long polling (WaitTimeSeconds=20) reduces API calls<br/>• Batch operations (10 per call) saves cost<br/>• SQS Extended Client for large payloads ({">"}256KB): store in S3, reference in SQS<br/>• This production system is resilient, scalable, and cost-effective!</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:meta.color+"08",border:`1px solid ${meta.color}25`,padding:"16px 14px",fontSize: 11,fontFamily:"monospace"}}>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {stage>=1&&(
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <div style={{width:12,height:12,borderRadius:"50%",background:meta.color}}/>
              <span style={{color:"#475569"}}>Order API → order-queue.fifo</span>
            </div>
          )}
          {stage>=2&&(
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <div style={{width:12,height:12,borderRadius:"50%",background:"#10b981"}}/>
              <span style={{color:"#475569"}}>Validator Lambda → payment-queue / dlq-validate</span>
            </div>
          )}
          {stage>=4&&(
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <div style={{width:12,height:12,borderRadius:"50%",background:"#a855f7"}}/>
              <span style={{color:"#475569"}}>Payment Lambda → SNS fan-out / dlq-payment</span>
            </div>
          )}
          {stage>=5&&(
            <>
              <div style={{display:"flex",alignItems:"center",gap:4,marginLeft:16}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:"#ec4899"}}/>
                <span style={{color:"#64748b"}}>email-queue</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:4,marginLeft:16}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:"#ec4899"}}/>
                <span style={{color:"#64748b"}}>analytics-queue</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:4,marginLeft:16}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:"#ec4899"}}/>
                <span style={{color:"#64748b"}}>inventory-queue</span>
              </div>
            </>
          )}
          {stage>=6&&(
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <div style={{width:12,height:12,borderRadius:"50%",background:"#ef4444"}}/>
              <span style={{color:"#475569"}}>DLQ monitoring → PagerDuty alerts</span>
            </div>
          )}
        </div>
      </div>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
    </div>
  );
}


// ─── LESSON 11: AWS SQS – Standard Queue ─────────────────────────────────────
function SQSStandardLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const RECEIPT = "AQEBwJnKyrHigUMZj6reyNurGb6...";
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Create the queue (fully managed — no server!)</b><br/><br/><span style={{color:"#166534"}}>import boto3<br/>sqs = boto3.client('sqs', region_name='us-east-1')<br/><br/>response = sqs.create_queue(QueueName='order-queue')<br/>queue_url = response['QueueUrl']</span><br/><br/>Unlike RabbitMQ/Kafka, <b>there is no broker to run</b>. AWS manages everything. You just call the API.</>,
    <><b style={{color:meta.color}}>Step 2 — Send a message</b><br/><br/><span style={{color:"#166534"}}>sqs.send_message(<br/>{"    "}QueueUrl=queue_url,<br/>{"    "}MessageBody='Process order #1234',<br/>{"    "}MessageAttributes={"{'OrderId': {'StringValue':'1234','DataType':'String'}}"}</span><br/><br/>Message is stored in SQS and available for consumers to receive.</>,
    <><b style={{color:meta.color}}>Step 3 — Consumer RECEIVES (message becomes invisible)</b><br/><br/><span style={{color:"#166534"}}>response = sqs.receive_message(<br/>{"    "}QueueUrl=queue_url,<br/>{"    "}WaitTimeSeconds=20,<br/>{"    "}VisibilityTimeout=30)<br/><br/>receipt = response['Messages'][0]['ReceiptHandle']</span><br/><br/>⚠️ Message is now <b>invisible to all other consumers</b> for 30 seconds. It's NOT deleted yet!</>,
    <><b style={{color:meta.color}}>Step 4 — Consumer processes the order</b><br/><br/>The consumer has up to 30 seconds (VisibilityTimeout) to process.<br/><br/>The ReceiptHandle: <b>'{RECEIPT.slice(0,30)}…'</b><br/><br/>This token proves you received the message and is required for deletion. Save it!</>,
    <><b style={{color:meta.color}}>Step 5 — Consumer DELETES the message</b><br/><br/><span style={{color:"#166534"}}>sqs.delete_message(<br/>{"    "}QueueUrl=queue_url,<br/>{"    "}ReceiptHandle=receipt)</span><br/><br/>✅ Message permanently removed.<br/><br/>💡 If NOT deleted within 30s, the message <b>reappears</b> in the queue and another consumer can pick it up. This is SQS's crash-safety mechanism!</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:"rgba(248,250,252,0.85)",border:"1px solid rgba(148,163,184,0.40)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:8,flexWrap:"wrap"}}>
          <FlowNode tok={T.producer} icon="💻" label="Producer (boto3)" sub="AWS SDK" active={stage===1||stage===2}/>
          <Arrow on={stage>=2} color={T.producer.border} label={stage>=2?"send_message":""}/>
          {/* SQS Queue */}
          <div style={{flex:1,minWidth:160,borderRadius:10,padding:"12px 14px",background:T.sqs.bg,border:`1.5px solid ${stage>=1?T.sqs.border+"80":"rgba(148,163,184,0.40)"}`,transition:"all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",backdropFilter:"blur(8px)"}}>
            <div style={{fontSize: 13,color:T.sqs.text,fontFamily:"system-ui, -apple-system, sans-serif",fontWeight:600,marginBottom:8}}>☁️ AWS SQS: order-queue</div>
            {stage===0&&<div style={{fontSize: 12,color:"#64748b",fontFamily:"monospace"}}>empty</div>}
            {stage>=2&&stage<3&&<div style={{borderRadius:6,padding:"5px 10px",fontSize: 13,fontFamily:"monospace",background:T.sqs.border+"30",border:`1px solid ${T.sqs.border}`,color:T.sqs.text}}>📨 Process order #1234 ← visible</div>}
            {stage>=3&&stage<5&&<div style={{borderRadius:6,padding:"4px 8px",fontSize: 12,fontFamily:"monospace",background:"rgba(255,255,255,0.96)",border:"1px dashed rgba(71, 85, 105, 0.5)",color:"#64748b"}}>👻 Process order #1234 ← INVISIBLE (30s timer)</div>}
            {stage>=5&&<div style={{fontSize: 12,color:"#64748b",fontFamily:"monospace"}}>empty (deleted ✅)</div>}
          </div>
          <Arrow on={stage>=3} color={T.sqs.border} label={stage>=3?"receive_message":""}/>
          <FlowNode tok={T.consumer} icon="🖥️" label="Consumer (boto3)" sub={stage>=5?"✅ deleted":stage>=3?"processing…":""} active={stage>=3&&stage<=5}/>
        </div>
        {stage>=3&&stage<5&&(
          <div style={{marginTop:12,padding:"10px 14px",borderRadius:8,background:`linear-gradient(135deg, ${T.rpc.border}08, ${T.rpc.border}12)`,border:`1px solid ${T.rpc.border}30`,fontSize: 14,fontFamily:"system-ui, -apple-system, sans-serif",color:T.rpc.text,backdropFilter:"blur(8px)"}}>
            ⏱️ VisibilityTimeout countdown: 30s... message invisible to others. Must delete before timer expires!
          </div>
        )}
      </div>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
    </div>
  );
}

// ─── LESSON 12: AWS SQS – FIFO & DLQ ─────────────────────────────────────────
function SQSFIFOLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const MSGS = ["Order #1 (group: user-A)","Order #2 (group: user-A)","Order #3 (group: user-B)"];
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Create a FIFO queue</b><br/><br/><span style={{color:"#166534"}}>sqs.create_queue(<br/>{"    "}QueueName='orders.fifo',<br/>{"    "}Attributes={"{'FifoQueue':'true',\n'ContentBasedDeduplication':'true'}"})</span><br/><br/>Queue name <b>must end in .fifo</b>. FIFO queues guarantee strict ordering and exactly-once processing.</>,
    <><b style={{color:meta.color}}>Step 2 — Send with MessageGroupId and DeduplicationId</b><br/><br/><span style={{color:"#166534"}}>sqs.send_message(<br/>{"    "}QueueUrl=fifo_url,<br/>{"    "}MessageBody='Order #1',<br/>{"    "}MessageGroupId='user-A',<br/>{"    "}MessageDeduplicationId='order-1-uuid')</span><br/><br/>MessageGroupId: messages in the same group are delivered in strict FIFO order.<br/>MessageDeduplicationId: duplicate sends within 5 minutes are silently dropped.</>,
    <><b style={{color:meta.color}}>Step 3 — Messages delivered in strict order within each group</b><br/><br/>Within group 'user-A': Order #1 is delivered before Order #2. Always.<br/>Group 'user-B' is processed in parallel independently.<br/><br/>✅ Order #1 → ✅ Order #2 → ✅ Order #3<br/><br/>No message can skip ahead within its group.</>,
    <><b style={{color:meta.color}}>Step 4 — Message fails 3 times (maxReceiveCount)</b><br/><br/>A message that can't be processed is received, visibility timeout expires, and reappears — repeatedly.<br/><br/>After <b>maxReceiveCount=3</b> failures, SQS automatically moves it to the <b>Dead Letter Queue (DLQ)</b> for investigation.<br/><br/>The main queue stays clean and unblocked.</>,
    <><b style={{color:meta.color}}>Step 5 — DLQ holds failed messages for debugging</b><br/><br/><span style={{color:"#166534"}}>dlq_url = sqs.create_queue(<br/>{"    "}QueueName='orders-dlq.fifo',<br/>{"    "}Attributes={"{'FifoQueue':'true'}"})['QueueUrl']<br/><br/># Set redrive policy on main queue:<br/>sqs.set_queue_attributes(Attributes={"{'RedrivePolicy':json.dumps({'maxReceiveCount':3,'deadLetterTargetArn':dlq_arn})}"})</span><br/><br/>✅ Alert on DLQ depth → investigate why messages are failing.</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:"rgba(248,250,252,0.85)",border:"1px solid rgba(148,163,184,0.40)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:8,flexWrap:"wrap",marginBottom:12}}>
          <FlowNode tok={T.producer} icon="💻" label="Producer" sub="boto3" active={stage===1||stage===2}/>
          <Arrow on={stage>=2} color={T.producer.border}/>
          {/* FIFO queue */}
          <div style={{flex:1,minWidth:170,borderRadius:10,padding:"12px 14px",background:T.sqs.bg,border:`1.5px solid ${meta.color}80`,backdropFilter:"blur(8px)"}}>
            <div style={{fontSize: 13,color:T.sqs.text,fontFamily:"system-ui, -apple-system, sans-serif",fontWeight:600,marginBottom:8}}>☁️ orders.fifo (FIFO Queue)</div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {MSGS.map((m,i)=>{
                const active=stage>=3&&i<3&&!(stage>=4&&i===0);
                const failed=stage>=4&&i===0;
                return(<div key={i} style={{borderRadius:6,padding:"3px 8px",fontSize: 12,fontFamily:"monospace",background:failed?"#fff5f5":active?meta.color+"20":"#f1f5f9",border:`1px solid ${failed?T.dlq.border:active?meta.color:"rgba(148,163,184,0.60)"}`,color:failed?T.dlq.text:active?T.sqs.text:"#64748b",transition:"all 0.3s"}}>{i+1}. {m}{failed?" ← FAILED 3x ↓":""}</div>);
              })}
              {stage<2&&<div style={{fontSize: 12,color:"#64748b",fontFamily:"monospace"}}>empty</div>}
            </div>
          </div>
          <Arrow on={stage>=3} color={meta.color}/>
          <FlowNode tok={T.consumer} icon="🖥️" label="Consumer" sub={stage>=3?"processing…":""} active={stage===3}/>
        </div>
        {/* DLQ */}
        {stage>=4&&(
          <div style={{display:"flex",alignItems:"center",gap:8,paddingLeft:16}}>
            <div style={{fontSize: 12,color:T.dlq.text,fontFamily:"monospace"}}>↓ maxReceiveCount exceeded (3x)</div>
            <Arrow on color={T.dlq.border}/>
            <div style={{borderRadius:10,padding:"12px 14px",background:T.dlq.bg,border:`1.5px solid ${T.dlq.border}`,backdropFilter:"blur(8px)"}}>
              <div style={{fontSize: 13,color:T.dlq.text,fontFamily:"system-ui, -apple-system, sans-serif",fontWeight:600,marginBottom:4}}>☠️ orders-dlq.fifo (Dead Letter Queue)</div>
              <div style={{fontSize: 13,color:T.dlq.text,fontFamily:"monospace"}}>1. Order #1 (group: user-A) ← investigate!</div>
            </div>
            {stage>=5&&<><Arrow on color="#f59e0b" label="alert!"/><FlowNode tok={T.rpc} icon="🔔" label="CloudWatch Alert" sub="DLQ depth > 0" active w={110}/></>}
          </div>
        )}
      </div>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
    </div>
  );
}

// ─── LESSON 11: Kafka – Offsets & Commits ─────────────────────────────────────
function KafkaOffsetsLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  // Partition state: each cell = offset 0..7, committed cursor, consumer cursor
  const MSGS = 8;
  const committedAt = stage >= 3 ? Math.min(stage - 1, MSGS) : stage >= 2 ? 2 : 0;
  const consumerAt  = stage >= 2 ? Math.min(stage + 1, MSGS) : stage >= 1 ? 1 : 0;
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Partition 0 has 8 messages (offsets 0–7)</b><br/><br/>Each message in a partition has a unique, ever-increasing <b>offset</b>. Offset 0 is the first, offset 7 the latest. The consumer hasn't started yet — no progress is recorded.</>,
    <><b style={{color:meta.color}}>Step 2 — Consumer reads offset 0</b><br/><br/><span style={{color:"#166534"}}>msg = consumer.poll(timeout=1.0)<br/># msg.offset() == 0</span><br/><br/>The consumer fetches offset 0. It has NOT committed yet — if it crashes now, it will re-read from offset 0.</>,
    <><b style={{color:meta.color}}>Step 3 — Manual commit after processing</b><br/><br/><span style={{color:"#166534"}}># Process the message…<br/>consumer.commit(asynchronous=False)<br/># Committed offset = 1 (next to read)</span><br/><br/>✅ Committed offset advances to <b>1</b>. On restart, Kafka delivers from offset 1 — no re-processing.</>,
    <><b style={{color:meta.color}}>Step 4 — Consumer crashes at offset 4</b><br/><br/>Consumer read offsets 1–4 but crashed before committing offset 4.<br/><br/>On restart, Kafka delivers from offset <b>3</b> (last committed = 3). Offset 3 and 4 are re-processed. This is <b>at-least-once</b> delivery.</>,
    <><b style={{color:meta.color}}>Step 5 — Seek to beginning (replay)</b><br/><br/><span style={{color:"#166534"}}>from confluent_kafka import TopicPartition<br/>consumer.seek(TopicPartition('orders', 0, 0))<br/># Consumer jumps back to offset 0!</span><br/><br/>🔁 Useful after a bug fix to re-process all historical messages. Works on any offset, not just 0.</>,
  ];

  const PART_C = meta.color;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={PART_C}/>
      <div style={{borderRadius:10,background:"rgba(248,250,252,0.85)",border:"1px solid rgba(148,163,184,0.40)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        {/* Partition strip */}
        <div style={{fontSize: 12,color:T.stream.text,fontFamily:"system-ui, -apple-system, sans-serif",fontWeight:600,marginBottom:8}}>📦 Partition 0 — offsets 0 to 7</div>
        <div style={{display:"flex",gap:4,marginBottom:12}}>
          {Array.from({length:MSGS},(_,i)=>{
            const isConsumed = stage >= 2 && i < consumerAt;
            const isCommitted = i < committedAt;
            const isReplay = stage===5;
            return (
              <div key={i} style={{
                flex:1,minWidth:28,borderRadius:6,padding:"6px 2px",textAlign:"center",transition:"all 0.3s",
                background: isReplay ? PART_C+"30" : isCommitted ? PART_C+"20" : isConsumed ? "rgba(148,163,184,0.60)" : "#f1f5f9",
                border:`1px solid ${isReplay ? PART_C : isCommitted ? PART_C+"80" : isConsumed ? "#64748b" : "rgba(148,163,184,0.60)"}`,
              }}>
                <div style={{fontSize: 11,fontFamily:"monospace",color:isCommitted||isReplay?PART_C:"#475569"}}>off</div>
                <div style={{fontSize: 15,fontFamily:"system-ui, -apple-system, sans-serif",fontWeight:600,color:isReplay?PART_C:isCommitted?PART_C:isConsumed?"#64748b":"rgba(148,163,184,0.60)"}}>{i}</div>
              </div>
            );
          })}
        </div>
        {/* Legend row */}
        <div style={{display:"flex",gap:16,fontSize: 12,fontFamily:"monospace"}}>
          <span style={{color:PART_C}}>■ committed</span>
          <span style={{color:"#475569"}}>■ read (uncommitted)</span>
          <span style={{color:"rgba(148,163,184,0.60)"}}>■ unread</span>
        </div>
        {stage>=1&&(
          <div style={{marginTop:12,padding:"10px 14px",borderRadius:8,background:`linear-gradient(135deg, ${PART_C}08, ${PART_C}12)`,border:`1px solid ${PART_C}30`,fontSize: 14,fontFamily:"system-ui, -apple-system, sans-serif",color:PART_C}}>
            {stage===5 ? "⏮️  seek(partition=0, offset=0) — replaying from the start"
             : stage===4 ? `💥 Crashed at offset 4 | Last committed: 3 | Will re-read from 3`
             : `Consumer position: ${consumerAt} | Committed: ${committedAt} | Lag: ${MSGS-committedAt}`}
          </div>
        )}
      </div>
      <StepBtn stage={stage} total={STEPS} color={PART_C} onAdvance={advance} onBack={goBack}/>
      <Narrative text={NARR[stage]} color={PART_C} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
    </div>
  );
}

// ─── LESSON 12: Kafka – Replication ──────────────────────────────────────────
function KafkaReplicationLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const BROKERS = [
    { id:0, label:"Broker 0", role:"Leader",   color:"#f97316" },
    { id:1, label:"Broker 1", role:"Follower",  color:"#6366f1" },
    { id:2, label:"Broker 2", role:"Follower",  color:"#6366f1" },
  ];
  const broker0Failed = stage >= 5;
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Topic created with replication_factor=3</b><br/><br/><span style={{color:"#166534"}}>from confluent_kafka.admin import NewTopic<br/>NewTopic('orders', num_partitions=3,<br/>{"         "}replication_factor=3)</span><br/><br/>Kafka assigns Partition 0 to Broker 0 (leader) and replicates it to Brokers 1 and 2 (followers). All writes go to the leader only.</>,
    <><b style={{color:meta.color}}>Step 2 — Followers sync from the leader</b><br/><br/>After each write to the leader, followers pull new messages and catch up. A follower that is caught up is called <b>In-Sync</b> (part of the ISR).<br/><br/>ISR (In-Sync Replicas) = the set of replicas that are eligible to become the new leader.</>,
    <><b style={{color:meta.color}}>Step 3 — Producer sends with acks=1 (leader-only)</b><br/><br/><span style={{color:"#166534"}}>Producer({"{'acks': '1'}"})</span><br/><br/>Leader acknowledges the write immediately. Followers may not have the message yet.<br/><br/>⚠️ If Broker 0 crashes RIGHT NOW, the message is lost — followers haven't synced it yet.</>,
    <><b style={{color:meta.color}}>Step 4 — Producer sends with acks=all (safest)</b><br/><br/><span style={{color:"#166534"}}>Producer({"{'acks': 'all', 'min.insync.replicas': '2'}"})</span><br/><br/>Leader waits until ALL ISR replicas confirm they have the message.<br/><br/>✅ Even if Broker 0 dies now, Brokers 1 or 2 have the message. Zero data loss.</>,
    <><b style={{color:meta.color}}>Step 5 — Broker 0 (leader) crashes → automatic failover</b><br/><br/>Kafka's controller detects Broker 0 is gone. Within seconds, it elects a new leader from the ISR (Broker 1 or 2).<br/><br/>✅ With acks=all, NO messages were lost. Producers automatically reconnect to the new leader. <b>Clients see no data loss.</b></>,
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:"rgba(248,250,252,0.85)",border:"1px solid rgba(148,163,184,0.40)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        <div style={{fontSize: 12,color:"#475569",fontFamily:"system-ui, -apple-system, sans-serif",fontWeight:600,marginBottom:12}}>🗄️ KAFKA CLUSTER — Partition 0 (RF=3)</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {BROKERS.map((b)=>{
            const isFailed = broker0Failed && b.id===0;
            const isNewLeader = broker0Failed && b.id===1;
            const roleLabel = isFailed ? "DEAD" : isNewLeader ? "New Leader" : b.role;
            const inISR = stage >= 2 && !isFailed;
            return (
              <div key={b.id} style={{
                display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:10,transition:"all 0.4s",
                background: isFailed ? "#fff5f5" : isNewLeader ? "#f9731615" : `${b.color}12`,
                border:`1px solid ${isFailed ? "#ef4444" : isNewLeader ? "#f97316" : b.color+"60"}`,
                opacity: isFailed ? 0.4 : 1,
              }}>
                <div style={{fontSize: 22}}>{isFailed ? "💀" : b.id===0 ? "👑" : "📋"}</div>
                <div style={{flex:1,fontFamily:"monospace",fontSize: 13}}>
                  <div style={{color: isFailed?"#ef4444":isNewLeader?"#f97316":b.color,fontWeight:"bold"}}>{b.label} — {roleLabel}</div>
                  <div style={{color:"#475569",marginTop:2}}>
                    Partition 0 {inISR ? "✅ in ISR" : stage>0?"⏳ syncing…":""}
                  </div>
                </div>
                {stage>=3&&!isFailed&&(
                  <div style={{fontSize: 12,fontFamily:"monospace",padding:"3px 8px",borderRadius:6,
                    background: stage>=4?"#22c55e20":"#f9731620",
                    color: stage>=4?"#22c55e":"#f97316",
                    border: `1px solid ${stage>=4?"#22c55e40":"#f9731640"}`}}>
                    {stage>=4?"acks=all ✅":"acks=1 ⚠️"}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {stage>=3&&(
          <div style={{marginTop:10,padding:"10px 14px",borderRadius:8,background:`linear-gradient(135deg, ${meta.color}08, ${meta.color}12)`,border:`1px solid ${meta.color}30`,fontSize: 14,fontFamily:"system-ui, -apple-system, sans-serif",color:meta.color}}>
            {stage===5?"🔄 Controller elected Broker 1 as new leader. Writes resume automatically."
             :stage===4?"acks=all: leader waits for ALL ISR replicas → zero data loss"
             :"acks=1: leader acks immediately → possible data loss on failover"}
          </div>
        )}
      </div>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
    </div>
  );
}

// ─── LESSON 13: Kafka – Transactions & EOS ───────────────────────────────────
function KafkaTransactionsLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const aborted = false; // committed path demo
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Default: at-least-once (duplicates possible)</b><br/><br/>Network glitch → producer retries → broker gets the message twice.<br/><br/>With no idempotence, BOTH copies are stored. Downstream systems may charge a customer twice, or ship twice.</>,
    <><b style={{color:meta.color}}>Step 2 — Idempotent producer deduplicates retries</b><br/><br/><span style={{color:"#166534"}}>Producer({"{'enable.idempotence': True}"})</span><br/><br/>Each message carries <b>PID</b> (producer ID) + monotonic <b>sequence number</b>. The broker sees a duplicate PID+seq and silently drops it.<br/><br/>✅ Exactly-once delivery to a SINGLE partition.</>,
    <><b style={{color:meta.color}}>Step 3 — Transactional producer: begin_transaction()</b><br/><br/><span style={{color:"#166534"}}>p = Producer({"{'transactional.id': 'order-producer-1'}"})<br/>p.init_transactions()<br/>p.begin_transaction()</span><br/><br/>The producer tells the broker: "Everything I send next is part of one atomic unit." Messages are written but marked as <b>PENDING</b>.</>,
    <><b style={{color:meta.color}}>Step 4 — Write to two topics atomically</b><br/><br/><span style={{color:"#166534"}}>p.produce('orders', ...)<br/>p.produce('audit_log', ...)<br/># Both PENDING — consumers can't see them yet</span><br/><br/>A <code>read_committed</code> consumer sees neither message until the transaction is committed.</>,
    <><b style={{color:meta.color}}>Step 5 — commit_transaction() → both visible atomically</b><br/><br/><span style={{color:"#166534"}}>p.commit_transaction()<br/># OR: p.abort_transaction() to roll back</span><br/><br/>✅ Both messages appear SIMULTANEOUSLY to read_committed consumers. Either both are visible, or neither — never a partial view. This is <b>exactly-once across multiple topics</b>.</>,
  ];

  const txColors = { pending:"#f59e0b", committed:"#22c55e", idle:"rgba(148,163,184,0.60)" };
  const topicState = stage >= 5 ? "committed" : stage >= 3 ? "pending" : "idle";

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:"rgba(248,250,252,0.85)",border:"1px solid rgba(148,163,184,0.40)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        {/* Idempotence layer */}
        {stage>=2&&(
          <div style={{marginBottom:12,padding:"10px 14px",borderRadius:8,background:"rgba(34, 197, 94, 0.1)",border:"1px solid rgba(34, 197, 94, 0.3)",display:"flex",gap:8,alignItems:"center"}}>
            <span style={{fontSize: 18}}>🔑</span>
            <span style={{fontSize: 14,fontFamily:"system-ui, -apple-system, sans-serif",color:"#15803d",fontWeight:500}}>Idempotent Producer — PID: 42 | Seq: {stage >= 3 ? "2,3" : "1"} | duplicates auto-dropped</span>
          </div>
        )}
        {/* Transaction state */}
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          {["orders","eos_audit"].map((t,i)=>(
            <div key={t} style={{
              flex:1,borderRadius:10,padding:"12px 10px",textAlign:"center",transition:"all 0.4s",
              background: txColors[topicState]+"15",
              border:`1px solid ${txColors[topicState]}60`,
            }}>
              <div style={{fontSize: 18}}>{i===0?"📦":"📋"}</div>
              <div style={{fontSize: 13,fontFamily:"system-ui, -apple-system, sans-serif",fontWeight:600,color:txColors[topicState],marginTop:4}}>{t}</div>
              <div style={{fontSize: 12,fontFamily:"monospace",color:"#475569",marginTop:2}}>
                {topicState==="committed"?"✅ committed"
                 :topicState==="pending"&&stage>=i+3?"⏳ PENDING"
                 :"(empty)"}
              </div>
            </div>
          ))}
        </div>
        {/* Transaction status badge */}
        {stage>=3&&(
          <div style={{padding:"8px 12px",borderRadius:8,textAlign:"center",
            background: txColors[topicState]+"15",
            border:`1px solid ${txColors[topicState]}60`,
            fontSize: 14,fontFamily:"monospace",color:txColors[topicState]}}>
            {topicState==="committed" ? "✅ COMMITTED — read_committed consumers see both messages"
             :"⏳ TRANSACTION OPEN — messages pending, not yet visible"}
          </div>
        )}
      </div>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
    </div>
  );
}

// ─── LESSON 14: Kafka – Log Compaction ───────────────────────────────────────
function KafkaCompactionLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Create a compacted topic</b><br/><br/><span style={{color:"#166534"}}>NewTopic('user_profiles',<br/>{"  "}config={"{'cleanup.policy': 'compact'}"})</span><br/><br/>Unlike normal topics (delete policy), compacted topics keep the <b>latest value per key forever</b>. Old superseded values are cleaned up in the background.</>,
    <><b style={{color:meta.color}}>Step 2 — Producer writes initial values</b><br/><br/><span style={{color:"#166534"}}>producer.produce('user_profiles', key='user-1', value='Alice v1')<br/>producer.produce('user_profiles', key='user-2', value='Bob')</span><br/><br/>At this point: user-1 → Alice v1, user-2 → Bob. Both are in the log with different keys.</>,
    <><b style={{color:meta.color}}>Step 3 — Update user-1 (same key, new value)</b><br/><br/><span style={{color:"#166534"}}>producer.produce('user_profiles', key='user-1', value='Alice v3')</span><br/><br/>The log now has TWO messages for 'user-1'. Before compaction: both old and new exist. After compaction: only 'Alice v3' remains.</>,
    <><b style={{color:meta.color}}>Step 4 — Tombstone: delete user-3</b><br/><br/><span style={{color:"#166534"}}>producer.produce('user_profiles', key='user-3', value=None)</span><br/><br/>Producing <code>value=None</code> is a <b>tombstone</b>. It tells Kafka: "delete this key during compaction." After compaction runs, user-3 disappears completely.</>,
    <><b style={{color:meta.color}}>Step 5 — Compaction runs → only latest values remain</b><br/><br/>Kafka's log cleaner background thread scans and removes older messages for the same key.<br/><br/>Compacted log result:<br/>• user-1 → <b>Alice v3</b> (v1 deleted)<br/>• user-2 → <b>Bob</b> (unchanged)<br/>• user-3 → <b>deleted</b> (tombstone removed)<br/><br/>✅ Reads from offset 0 now give the <b>current state</b> — like a KV store.</>,
  ];

  // Log entries for visualization
  const LOG = [
    { key:"user-1", val:"Alice v1", offset:0, superseded: stage>=3 },
    { key:"user-2", val:"Bob",      offset:1, superseded: false },
    { key:"user-1", val:"Alice v3", offset:2, active:true, show: stage>=3 },
    { key:"user-3", val:"TOMBSTONE",offset:3, tombstone:true, show:stage>=4, deleted:stage>=5 },
  ];
  const compacted = stage>=5;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:"rgba(248,250,252,0.85)",border:"1px solid rgba(148,163,184,0.40)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        <div style={{fontSize: 12,color:"#475569",fontFamily:"system-ui, -apple-system, sans-serif",fontWeight:600,marginBottom:12}}>
          📜 Topic: user_profiles (cleanup.policy=compact)
          {compacted && <span style={{color:meta.color}}> — AFTER COMPACTION</span>}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {LOG.filter(e => e.show !== false || e.offset <= 1).map(e => {
            if (e.show === false) return null;
            const hidden = compacted && (e.superseded || e.deleted);
            const isTombstone = e.tombstone;
            const color = compacted && !hidden
              ? meta.color
              : isTombstone ? "#ef4444"
              : e.superseded ? "rgba(71, 85, 105, 0.5)" : "#6366f1";
            return (
              <div key={`${e.key}-${e.offset}`} style={{
                display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:8,
                transition:"all 0.4s",opacity: hidden ? 0.15 : 1,
                background: hidden ? "#f1f5f9" : isTombstone ? "#fff5f540" : `${color}12`,
                border:`1px solid ${hidden ? "rgba(148,163,184,0.60)" : color+"50"}`,
              }}>
                <div style={{fontSize: 12,fontFamily:"monospace",color:"#475569",minWidth:60}}>offset={e.offset}</div>
                <div style={{fontSize: 13,fontFamily:"monospace",color,fontWeight:"bold",minWidth:60}}>key='{e.key}'</div>
                <div style={{fontSize: 13,fontFamily:"monospace",color: isTombstone?"#ef4444":color}}>
                  {isTombstone ? "🪦 TOMBSTONE (value=None)" : `value='${e.val}'`}
                </div>
                {hidden && <div style={{fontSize: 12,fontFamily:"monospace",color:"rgba(71, 85, 105, 0.5)",marginLeft:"auto"}}>compacted away</div>}
                {compacted && !hidden && !isTombstone && <div style={{fontSize: 12,color:meta.color,marginLeft:"auto"}}>✅ retained</div>}
              </div>
            );
          })}
        </div>
      </div>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
    </div>
  );
}

// ─── LESSON 17: Istio Architecture & Sidecar ─────────────────────────────────
function IstioArchLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const injected = stage >= 3;
  const traffic  = stage >= 4;
  const istiodActive = stage >= 5;
  const NARR = [
    "Before Istio: pods communicate directly. No encryption, no telemetry, no traffic control.",
    "Step 1 — Label namespace: kubectl label namespace demo istio-injection=enabled. A MutatingWebhook now watches all new pods in this namespace.",
    "Step 2 — Deploy app: Kubernetes calls the Istio webhook which automatically injects an Envoy sidecar container alongside every application container.",
    "Step 3 — Traffic flows: all inbound and outbound traffic is transparently intercepted by Envoy (iptables rules redirect port 15001/15006). The app is unaware.",
    "Step 4 — Istiod pushes xDS config: Pilot sends service discovery, routing rules, and TLS certificates to every Envoy in the mesh via gRPC streams.",
    "Full mesh: Envoy enforces policies, collects metrics, and generates traces — all without a single line of application code change.",
  ];
  const box = (label, sub, color, active) => (
    <div style={{ borderRadius: 8, padding: "6px 10px", border: `1px solid ${active ? color : color + "40"}`, background: active ? color + "20" : "#f1f5f9", transition: "all 0.35s", minWidth: 90, textAlign: "center" }}>
      <div style={{ fontSize: 13, fontWeight: "bold", fontFamily: "monospace", color: active ? color : color + "80" }}>{label}</div>
      {sub && <div style={{ fontSize: 11, fontFamily: "monospace", color: "#64748b", marginTop: 2 }}>{sub}</div>}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StepBar current={stage} total={STEPS} color={meta.color} />
      {/* Istiod control plane */}
      <div style={{ textAlign: "center", padding: "8px 0" }}>
        <div style={{ display: "inline-block", borderRadius: 10, padding: "6px 20px", border: `2px solid ${istiodActive ? "#0ea5e9" : "rgba(148,163,184,0.60)"}`, background: istiodActive ? "#0ea5e920" : "#f1f5f9", transition: "all 0.4s" }}>
          <div style={{ fontSize: 14, fontWeight: "bold", fontFamily: "monospace", color: istiodActive ? "#0ea5e9" : "#64748b" }}>🧠 Istiod (Control Plane)</div>
          <div style={{ fontSize: 12, fontFamily: "monospace", color: "#64748b", marginTop: 2 }}>Pilot · Citadel · Galley</div>
        </div>
        {istiodActive && <div style={{ fontSize: 12, fontFamily: "monospace", color: "#0ea5e9", marginTop: 4 }}>↓ xDS config push (gRPC)</div>}
      </div>
      {/* Pod */}
      <div style={{ borderRadius: 12, border: `2px solid ${injected ? "#0ea5e9" : "#64748b"}`, padding: 14, background: "#f8fafc", transition: "all 0.4s" }}>
        <div style={{ fontSize: 12, fontFamily: "monospace", color: "#64748b", marginBottom: 10 }}>
          {stage >= 2 ? "✅ namespace: demo  |  label: istio-injection=enabled" : "namespace: demo  |  no injection label"}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
          {box("📦 App Container", "port :8080", "#22c55e", true)}
          {injected && (
            <>
              <div style={{ fontSize: 18, color: "#0ea5e9" }}>+</div>
              {box("🔷 Envoy Sidecar", "port :15001", "#0ea5e9", traffic)}
            </>
          )}
        </div>
        {traffic && (
          <div style={{ marginTop: 10, fontSize: 12, fontFamily: "monospace", color: "#0ea5e9", textAlign: "center", padding: "4px 8px", background: "#0ea5e910", borderRadius: 6, border: "1px solid #0ea5e930" }}>
            iptables intercepts all traffic → Envoy → App (transparent proxy)
          </div>
        )}
      </div>
      <Narrative text={NARR[stage]} color={meta.color} step={stage > 0 && stage <= STEPS ? stage : null} total={STEPS} />
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack} />
    </div>
  );
}

// ─── LESSON 18: Istio Traffic Routing ────────────────────────────────────────
function IstioRoutingLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const useHeader = stage >= 4;
  const activeSubset = stage >= 3 ? (useHeader ? "v2" : "v1") : null;
  const NARR = [
    "Without Istio: all traffic goes to whichever pod Kubernetes picks (ClusterIP round-robin). No version awareness.",
    "Step 1 — Deploy v1 and v2 pods: both labeled app=myapp but with version=v1 and version=v2 respectively. One Kubernetes Service selects both.",
    "Step 2 — Apply DestinationRule: defines subsets 'v1' (version=v1) and 'v2' (version=v2). Also configures load balancing and connection pools per subset.",
    "Step 3 — Default route: VirtualService sends 100% traffic to subset v1. Requests to myapp.svc always land on v1 pods.",
    "Step 4 — Header routing: VirtualService adds a match rule — if header x-version: v2 is present, route to subset v2. All other requests still go to v1.",
    "Result: two versions running simultaneously, traffic split by header. Next step: add weights for gradual canary rollout.",
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StepBar current={stage} total={STEPS} color={meta.color} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Request */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
          <div style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(71, 85, 105, 0.4)", background: "rgba(248,250,252,0.92)", fontSize: 14, fontFamily: "system-ui, -apple-system, sans-serif", color: "#64748b", backdropFilter: "blur(8px)" }}>
            {useHeader ? "🌐 Request  [x-version: v2]" : "🌐 Request  [no version header]"}
          </div>
          {stage >= 2 && <div style={{ fontSize: 12, color: "#14b8a6" }}>→</div>}
        </div>
        {/* VirtualService */}
        {stage >= 2 && (
          <div style={{ borderRadius: 10, border: `1px solid #14b8a6`, background: "#14b8a610", padding: "8px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: "bold", fontFamily: "monospace", color: "#14b8a6" }}>📋 VirtualService: myapp</div>
            <div style={{ fontSize: 12, fontFamily: "monospace", color: "#64748b", marginTop: 4 }}>
              {stage >= 4 ? "match: x-version=v2 → subset: v2 | default → subset: v1" : "default route → subset: v1"}
            </div>
          </div>
        )}
        {/* DestinationRule + subsets */}
        {stage >= 3 && (
          <div style={{ borderRadius: 10, border: "1px solid #8b5cf6", background: "#8b5cf610", padding: "8px 14px" }}>
            <div style={{ fontSize: 13, fontWeight: "bold", fontFamily: "monospace", color: "#8b5cf6", marginBottom: 6 }}>🎯 DestinationRule: myapp</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              {["v1", "v2"].map(v => (
                <div key={v} style={{ borderRadius: 8, padding: "5px 16px", border: `1px solid ${activeSubset === v ? "#22c55e" : "#64748b"}`, background: activeSubset === v ? "#22c55e20" : "#f1f5f9", transition: "all 0.35s", textAlign: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: "bold", fontFamily: "monospace", color: activeSubset === v ? "#22c55e" : "#64748b" }}>subset: {v}</div>
                  <div style={{ fontSize: 12, fontFamily: "monospace", color: "#64748b" }}>version={v}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <Narrative text={NARR[stage]} color={meta.color} step={stage > 0 && stage <= STEPS ? stage : null} total={STEPS} />
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack} />
    </div>
  );
}

// ─── LESSON 19: Istio Canary Deployments ─────────────────────────────────────
function IstioCanaryLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const weights = [[100,0],[90,10],[50,50],[10,90],[0,100]];
  const [w1, w2] = weights[Math.min(stage, 4)];
  const NARR = [
    "Start: 100% of traffic flows to v1. v2 is deployed but receives no traffic yet.",
    "Canary 10%: shift 10% to v2. Monitor error rate and p99 latency. Most users still on v1.",
    "Canary 50%: after validating 10% metrics, promote to 50/50. A/B comparison at full scale.",
    "Canary 90%: v2 looking healthy. Shift 90% to v2, keep 10% safety net on v1.",
    "Full rollout: 100% on v2. v1 still deployed — instant rollback if anomalies appear.",
    "Zero-downtime rollout complete. No changes to Kubernetes Deployments or Services — only VirtualService weights changed.",
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StepBar current={stage} total={STEPS} color={meta.color} />
      {/* Traffic split bar */}
      <div style={{ borderRadius: 12, border: "1px solid rgba(148,163,184,0.60)", background: "#f8fafc", padding: 16 }}>
        <div style={{ fontSize: 12, fontFamily: "monospace", color: "#64748b", marginBottom: 10, textAlign: "center" }}>VirtualService weight split</div>
        <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", height: 32, marginBottom: 10, transition: "all 0.5s" }}>
          {w1 > 0 && <div style={{ flex: w1, background: "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: "bold", fontFamily: "monospace", color: "#fff", transition: "flex 0.5s" }}>{w1}% v1</div>}
          {w2 > 0 && <div style={{ flex: w2, background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: "bold", fontFamily: "monospace", color: "#fff", transition: "flex 0.5s" }}>{w2}% v2</div>}
        </div>
        {/* Pods */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          {[
            { label: "v1 pods", color: "#6366f1", weight: w1 },
            { label: "v2 pods", color: "#22c55e", weight: w2 },
          ].map(({ label, color, weight }) => (
            <div key={label} style={{ textAlign: "center", opacity: weight === 0 ? 0.3 : 1, transition: "opacity 0.4s" }}>
              <div style={{ fontSize: 22 }}>📦📦</div>
              <div style={{ fontSize: 12, fontFamily: "monospace", color, marginTop: 2 }}>{label}</div>
              <div style={{ fontSize: 12, fontFamily: "monospace", color: "#64748b" }}>weight: {weight}</div>
            </div>
          ))}
        </div>
      </div>
      <Narrative text={NARR[stage]} color={meta.color} step={stage > 0 && stage <= STEPS ? stage : null} total={STEPS} />
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack} />
    </div>
  );
}

// ─── LESSON 20: Istio Fault Injection ────────────────────────────────────────
function IstioFaultLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const faultType = stage >= 3 ? "abort" : stage >= 2 ? "delay" : "none";
  const headerScoped = stage >= 5;
  const NARR = [
    "Normal baseline: client sends requests, Envoy forwards them to the service. No faults active.",
    "Step 1 — Apply VirtualService with fault block. Faults are defined per HTTP route and applied by Envoy — no app code changes needed.",
    "Step 2 — Delay fault: 50% of requests get a 5-second artificial delay BEFORE being forwarded. Tests whether clients handle slow upstreams correctly.",
    "Step 3 — Abort fault: 10% of requests get an immediate HTTP 503 response. The upstream service is never called. Tests retry and error-handling code.",
    "Step 4 — Combined: both delay (50%) and abort (10%) active simultaneously. Edge case testing at production scale.",
    "Best practice: scope faults to a test header (x-test-fault: inject). Production requests skip the fault block — only canary testers are affected.",
  ];
  const faultColors = { none: "#64748b", delay: "#f59e0b", abort: "#ef4444" };
  const fc = faultColors[faultType];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StepBar current={stage} total={STEPS} color={meta.color} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        <div style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid rgba(71, 85, 105, 0.4)", background: "rgba(248,250,252,0.92)", fontSize: 14, fontFamily: "system-ui, -apple-system, sans-serif", color: "#64748b", textAlign: "center", backdropFilter: "blur(8px)" }}>
          🌐 Client<br />{headerScoped ? "[x-test-fault: inject]" : "[request]"}
        </div>
        <div style={{ fontSize: 18, color: "#64748b" }}>→</div>
        {/* Fault injector */}
        <div style={{ padding: "8px 14px", borderRadius: 8, border: `2px solid ${fc}`, background: fc + "15", fontSize: 13, fontFamily: "monospace", color: fc, textAlign: "center", minWidth: 110, transition: "all 0.4s" }}>
          🔷 Envoy<br />
          {faultType === "delay" && "⏰ +5s delay (50%)"}
          {faultType === "abort" && "💥 503 abort (10%)"}
          {faultType === "none" && "no fault"}
        </div>
        {faultType !== "abort" && <div style={{ fontSize: 18, color: "#64748b" }}>→</div>}
        {faultType !== "abort" && (
          <div style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #22c55e55", background: "#f0fdf4", fontSize: 13, fontFamily: "monospace", color: "#15803d", textAlign: "center" }}>
            📦 Service
          </div>
        )}
        {faultType === "abort" && (
          <div style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #ef4444", background: "#ef444415", fontSize: 13, fontFamily: "monospace", color: "#ef4444" }}>
            ← HTTP 503
          </div>
        )}
      </div>
      {stage >= 4 && (
        <div style={{ borderRadius: 8, padding: "8px 12px", border: "1px solid #f59e0b40", background: "#f59e0b10", fontSize: 12, fontFamily: "monospace", color: "#f59e0b", textAlign: "center" }}>
          Combined: 50% requests get +5s delay · 10% get 503 abort
        </div>
      )}
      <Narrative text={NARR[stage]} color={meta.color} step={stage > 0 && stage <= STEPS ? stage : null} total={STEPS} />
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack} />
    </div>
  );
}

// ─── LESSON 21: Istio Circuit Breaking ───────────────────────────────────────
function IstioCircuitLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const pod3Errors = stage >= 2;
  const pod3Ejected = stage >= 3;
  const pod3Recovering = stage >= 5;
  const NARR = [
    "Three healthy pods share traffic equally. DestinationRule outlier detection is watching for consecutive errors.",
    "Step 1 — Apply DestinationRule with outlierDetection: consecutive5xxErrors=3, interval=10s, baseEjectionTime=30s.",
    "Step 2 — Pod-3 starts returning 503 errors (bad deploy, OOM, slow dependency). Envoy counts consecutive 5xx responses.",
    "Step 3 — Threshold hit (3 consecutive errors): Envoy ejects Pod-3 from the load balancing pool for 30 seconds. No more traffic sent to it.",
    "Step 4 — Pod-1 and Pod-2 absorb the load. Users see no errors. Connection pool limits fast-fail requests that would queue.",
    "Step 5 — After baseEjectionTime (30s), Pod-3 is re-admitted to the pool for a probe request. If healthy, it rejoins fully.",
  ];
  const pods = [
    { id: "Pod-1", ok: true },
    { id: "Pod-2", ok: true },
    { id: "Pod-3", error: pod3Errors, ejected: pod3Ejected, recovering: pod3Recovering },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StepBar current={stage} total={STEPS} color={meta.color} />
      {/* Load balancer → pods */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <div style={{ padding: "6px 20px", borderRadius: 8, border: "1px solid #f97316", background: "#f9731620", fontSize: 13, fontWeight: "bold", fontFamily: "monospace", color: "#f97316" }}>
          ⚖️ Envoy Load Balancer
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {pods.map(p => {
            const color = p.ejected ? "#ef4444" : p.error ? "#f59e0b" : "#22c55e";
            const label = p.ejected ? (p.recovering ? "🔄 PROBE" : "🚫 EJECTED") : p.error ? "⚠️ ERRORS" : "✅ healthy";
            return (
              <div key={p.id} style={{ borderRadius: 10, padding: "10px 14px", border: `2px solid ${color}`, background: color + "15", textAlign: "center", minWidth: 80, transition: "all 0.4s", opacity: p.ejected && !p.recovering ? 0.5 : 1 }}>
                <div style={{ fontSize: 20 }}>📦</div>
                <div style={{ fontSize: 12, fontWeight: "bold", fontFamily: "monospace", color, marginTop: 4 }}>{p.id}</div>
                <div style={{ fontSize: 11, fontFamily: "monospace", color, marginTop: 2 }}>{label}</div>
              </div>
            );
          })}
        </div>
        {pod3Ejected && !pod3Recovering && (
          <div style={{ fontSize: 12, fontFamily: "monospace", color: "#ef4444", padding: "4px 12px", background: "#ef444415", borderRadius: 6, border: "1px solid #ef444430" }}>
            Pod-3 ejected for 30s · ejectionCount × baseEjectionTime
          </div>
        )}
      </div>
      <Narrative text={NARR[stage]} color={meta.color} step={stage > 0 && stage <= STEPS ? stage : null} total={STEPS} />
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack} />
    </div>
  );
}

// ─── LESSON 22: Istio Ingress Gateway ────────────────────────────────────────
function IstioGatewayLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const tlsActive = stage >= 3;
  const vsActive  = stage >= 4;
  const svcActive = stage >= 5;
  const NARR = [
    "External traffic arrives at the Kubernetes LoadBalancer Service in front of the Istio Ingress Gateway pod.",
    "Step 1 — Deploy istio-ingressgateway: a dedicated Envoy pod in istio-system. Configured separately from mesh sidecars.",
    "Step 2 — Apply Gateway CRD: declares which ports/hosts/protocols the gateway accepts. Selector: istio=ingressgateway.",
    "Step 3 — TLS termination: Gateway loads the TLS secret and terminates HTTPS. HTTP clients on port 80 receive a redirect to 443.",
    "Step 4 — Bind VirtualService to Gateway: VirtualService references the Gateway by name in its gateways field. Routes map host+path to internal services.",
    "Step 5 — Request routed: external user → LoadBalancer → Ingress Gateway (TLS terminated) → VirtualService rules → internal Service → app pod.",
  ];
  const step = (label, sub, active, icon) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 90 }}>
      <div style={{ padding: "7px 12px", borderRadius: 8, border: `2px solid ${active ? "#8b5cf6" : "rgba(148,163,184,0.60)"}`, background: active ? "#8b5cf620" : "#f1f5f9", textAlign: "center", transition: "all 0.4s", width: "100%" }}>
        <div style={{ fontSize: 18 }}>{icon}</div>
        <div style={{ fontSize: 12, fontWeight: "bold", fontFamily: "monospace", color: active ? "#8b5cf6" : "#64748b", marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, fontFamily: "monospace", color: "#64748b", marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StepBar current={stage} total={STEPS} color={meta.color} />
      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
        {step("Internet", "HTTPS :443", stage >= 2, "🌐")}
        <div style={{ fontSize: 14, color: "#64748b" }}>→</div>
        {step("Gateway", tlsActive ? "TLS terminated" : "port :443", stage >= 2, "🚪")}
        <div style={{ fontSize: 14, color: "#64748b" }}>→</div>
        {step("VirtualService", "host/path rules", vsActive, "🗺️")}
        <div style={{ fontSize: 14, color: "#64748b" }}>→</div>
        {step("Service Pod", "app:myapp", svcActive, "📦")}
      </div>
      {tlsActive && (
        <div style={{ borderRadius: 8, padding: "6px 12px", border: "1px solid #06b6d440", background: "#06b6d410", fontSize: 12, fontFamily: "monospace", color: "#06b6d4", textAlign: "center" }}>
          🔐 TLS secret: myapp-tls-secret  |  HTTP → 301 → HTTPS redirect active
        </div>
      )}
      <Narrative text={NARR[stage]} color={meta.color} step={stage > 0 && stage <= STEPS ? stage : null} total={STEPS} />
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack} />
    </div>
  );
}

// ─── LESSON 23: Istio mTLS ────────────────────────────────────────────────────
function IstioMtlsLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const mode = stage <= 1 ? "none" : stage <= 2 ? "permissive" : "strict";
  const certExchange = stage >= 4;
  const encrypted = stage >= 5;
  const modeColor = { none: "#64748b", permissive: "#f59e0b", strict: "#06b6d4" }[mode];
  const NARR = [
    "No Istio: services communicate over plain HTTP. Any compromised pod can intercept or spoof traffic — no identity verification.",
    "Step 1 — Start with PERMISSIVE mode: PeerAuthentication allows both mTLS and plaintext. Safe for gradual migration while old clients catch up.",
    "Step 2 — Deploy sidecars: Envoy automatically negotiates mTLS with peers that support it. Legacy clients still use plaintext.",
    "Step 3 — Switch to STRICT mode: kubectl apply PeerAuthentication with mode=STRICT. All plaintext connections are now rejected with a TLS handshake error.",
    "Step 4 — Certificate exchange: Citadel (inside Istiod) issues SVID certs to each sidecar. Both sides present certs and verify the peer SPIFFE identity.",
    "Step 5 — Encrypted tunnel: all service-to-service data flows through a mutually authenticated TLS 1.3 tunnel. Zero plaintext even inside the cluster.",
  ];
  const serviceBox = (label, sa, side) => (
    <div style={{ borderRadius: 10, border: `2px solid ${encrypted ? "#06b6d4" : mode !== "none" ? "#06b6d460" : "#64748b"}`, background: "#f0faff", padding: "10px 14px", textAlign: "center", minWidth: 100, transition: "all 0.4s" }}>
      <div style={{ fontSize: 20 }}>📦</div>
      <div style={{ fontSize: 12, fontWeight: "bold", fontFamily: "monospace", color: "#7dd3fc" }}>{label}</div>
      <div style={{ fontSize: 11, fontFamily: "monospace", color: "#64748b" }}>sa/{sa}</div>
      {certExchange && <div style={{ marginTop: 4, fontSize: 11, fontFamily: "monospace", color: "#06b6d4" }}>📜 SVID cert</div>}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StepBar current={stage} total={STEPS} color={meta.color} />
      {/* Mode badge */}
      <div style={{ textAlign: "center" }}>
        <span style={{ padding: "3px 14px", borderRadius: 20, fontSize: 13, fontWeight: "bold", fontFamily: "monospace", background: modeColor + "20", border: `1px solid ${modeColor}`, color: modeColor, transition: "all 0.4s" }}>
          PeerAuthentication mode: {mode.toUpperCase()}
        </span>
      </div>
      {/* Service-to-service diagram */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
        {serviceBox("frontend", "frontend")}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{ height: 3, width: 60, borderRadius: 2, background: encrypted ? "#06b6d4" : mode !== "none" ? "#06b6d440" : "#64748b", transition: "all 0.4s" }} />
          <div style={{ fontSize: 11, fontFamily: "monospace", color: encrypted ? "#06b6d4" : "#64748b", transition: "all 0.4s" }}>
            {encrypted ? "🔒 mTLS 1.3" : mode === "permissive" ? "⚡ mTLS or HTTP" : "HTTP (plain)"}
          </div>
        </div>
        {serviceBox("backend", "backend")}
      </div>
      <Narrative text={NARR[stage]} color={meta.color} step={stage > 0 && stage <= STEPS ? stage : null} total={STEPS} />
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack} />
    </div>
  );
}

// ─── LESSON 24: Istio Authorization Policy ───────────────────────────────────
function IstioAuthzLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const policyActive = stage >= 2;
  const denyDefault  = stage >= 3;
  const NARR = [
    "No AuthorizationPolicy: the service accepts requests from any pod in the cluster. This is zero-trust's opposite — implicit allow-all.",
    "Step 1 — Apply AuthorizationPolicy with action: ALLOW. Specify rules: frontend service account may call GET/POST on /api/*.",
    "Step 2 — Implicit deny-all takes effect: because one ALLOW rule exists, Istio denies all traffic that does NOT match the rule by default.",
    "Step 3 — Frontend calls backend: principal matches (cluster.local/ns/demo/sa/frontend), method is GET /api/orders — ALLOWED.",
    "Step 4 — Attacker pod calls backend: principal is cluster.local/ns/default/sa/attacker — no matching ALLOW rule — DENIED with 403.",
    "Best practice: also add an explicit DENY policy for known-bad traffic. DENY rules always evaluate before ALLOW rules.",
  ];
  const callers = [
    { label: "frontend", sa: "sa/frontend", allowed: stage >= 4, tried: stage >= 4 },
    { label: "attacker", sa: "sa/attacker",  allowed: false,      tried: stage >= 5 },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StepBar current={stage} total={STEPS} color={meta.color} />
      <div style={{ display: "flex", gap: 10, alignItems: "stretch", flexWrap: "wrap", justifyContent: "center" }}>
        {/* Callers */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {callers.map(c => (
            <div key={c.label} style={{ borderRadius: 8, padding: "8px 12px", border: `1px solid ${c.tried ? (c.allowed ? "#22c55e" : "#ef4444") : "rgba(148,163,184,0.60)"}`, background: "#f8fafc", textAlign: "center", minWidth: 100, transition: "all 0.4s" }}>
              <div style={{ fontSize: 16 }}>{c.allowed ? "📦" : "☠️"}</div>
              <div style={{ fontSize: 12, fontWeight: "bold", fontFamily: "monospace", color: c.tried ? (c.allowed ? "#22c55e" : "#ef4444") : "#64748b" }}>{c.label}</div>
              <div style={{ fontSize: 11, fontFamily: "monospace", color: "#64748b" }}>{c.sa}</div>
              {c.tried && <div style={{ fontSize: 12, marginTop: 4, color: c.allowed ? "#22c55e" : "#ef4444" }}>{c.allowed ? "✅ 200 OK" : "🚫 403"}</div>}
            </div>
          ))}
        </div>
        {/* Policy */}
        {policyActive && (
          <div style={{ borderRadius: 10, border: `1px solid #ec4899`, background: "#ec489910", padding: "10px 14px", minWidth: 180, fontSize: 12, fontFamily: "monospace" }}>
            <div style={{ fontWeight: "bold", color: "#ec4899", marginBottom: 6 }}>🔑 AuthorizationPolicy</div>
            <div style={{ color: "#64748b" }}>action: ALLOW</div>
            <div style={{ color: "#64748b" }}>from: sa/frontend</div>
            <div style={{ color: "#64748b" }}>methods: GET, POST</div>
            <div style={{ color: "#64748b" }}>paths: /api/*</div>
            {denyDefault && <div style={{ marginTop: 6, color: "#ef4444" }}>implicit: DENY all others</div>}
          </div>
        )}
        {/* Backend */}
        <div style={{ borderRadius: 10, border: "1px solid #ec489950", background: "#f0faff", padding: "10px 14px", textAlign: "center", alignSelf: "center", minWidth: 90 }}>
          <div style={{ fontSize: 20 }}>📦</div>
          <div style={{ fontSize: 12, fontWeight: "bold", fontFamily: "monospace", color: "#7dd3fc" }}>backend</div>
          <div style={{ fontSize: 11, fontFamily: "monospace", color: "#64748b" }}>sa/backend</div>
        </div>
      </div>
      <Narrative text={NARR[stage]} color={meta.color} step={stage > 0 && stage <= STEPS ? stage : null} total={STEPS} />
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack} />
    </div>
  );
}

// ─── LESSON 25: Istio Observability ──────────────────────────────────────────
function IstioObserveLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const metricsFlow  = stage >= 2;
  const tracingFlow  = stage >= 3;
  const kialiActive  = stage >= 4;
  const alertActive  = stage >= 5;
  const NARR = [
    "Without Istio: each team instruments their own service differently — or not at all. No consistent observability layer.",
    "Step 1 — Install addons: kubectl apply -f samples/addons/ deploys Prometheus, Grafana, Jaeger, and Kiali in istio-system namespace.",
    "Step 2 — Metrics: Envoy exposes Prometheus metrics on :15090/stats/prometheus. Every request generates latency, status code, and byte count metrics automatically.",
    "Step 3 — Distributed tracing: Envoy generates trace spans and propagates trace headers (x-b3-traceid). Jaeger collects the full call chain across all services.",
    "Step 4 — Kiali service graph: uses Prometheus metrics to render a real-time topology graph. Shows traffic rate, error %, mTLS status, and config validation warnings.",
    "Step 5 — Alerting: Prometheus alert rules fire on high error rate (>5%) or p99 latency (>1s). PagerDuty/Slack notifications via Alertmanager. Zero app code changes.",
  ];
  const tool = (icon, label, sub, active, color) => (
    <div style={{ borderRadius: 8, padding: "8px 12px", border: `1px solid ${active ? color : "rgba(148,163,184,0.60)"}`, background: active ? color + "15" : "#f1f5f9", textAlign: "center", minWidth: 90, transition: "all 0.4s" }}>
      <div style={{ fontSize: 20 }}>{icon}</div>
      <div style={{ fontSize: 12, fontWeight: "bold", fontFamily: "monospace", color: active ? color : "#64748b" }}>{label}</div>
      {sub && <div style={{ fontSize: 11, fontFamily: "monospace", color: "#64748b", marginTop: 1 }}>{sub}</div>}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StepBar current={stage} total={STEPS} color={meta.color} />
      {/* Services row */}
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        {["frontend", "orders", "payment"].map(s => (
          <div key={s} style={{ borderRadius: 8, padding: "6px 10px", border: "1px solid rgba(148,163,184,0.60)", background: "#f8fafc", textAlign: "center" }}>
            <div style={{ fontSize: 15 }}>📦</div>
            <div style={{ fontSize: 11, fontFamily: "monospace", color: "#64748b" }}>{s}</div>
            {metricsFlow && <div style={{ fontSize: 10, color: "#eab308", marginTop: 2 }}>→ metrics</div>}
            {tracingFlow  && <div style={{ fontSize: 10, color: "#a855f7", marginTop: 1 }}>→ traces</div>}
          </div>
        ))}
      </div>
      {/* Observability tools */}
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        {tool("📊", "Prometheus", "metrics scrape", metricsFlow, "#f97316")}
        {tool("📈", "Grafana", "dashboards", metricsFlow, "#f59e0b")}
        {tool("🔍", "Jaeger", "traces", tracingFlow, "#a855f7")}
        {tool("🗺️", "Kiali", "service graph", kialiActive, "#22c55e")}
      </div>
      {alertActive && (
        <div style={{ borderRadius: 8, padding: "6px 14px", border: "1px solid #ef4444", background: "#ef444415", fontSize: 12, fontFamily: "monospace", color: "#ef4444", textAlign: "center" }}>
          🚨 Alert: payment error rate 8.3% {">"} threshold 5% → PagerDuty notified
        </div>
      )}
      <Narrative text={NARR[stage]} color={meta.color} step={stage > 0 && stage <= STEPS ? stage : null} total={STEPS} />
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack} />
    </div>
  );
}

// ─── LESSON 26: Istio Installation & Profiles ────────────────────────────────
function IstioInstallLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const PROFILES = [
    { name: "minimal",    cp: true,  ig: false, eg: false, mem: "~200 MB", use: "CI / edge clusters" },
    { name: "default",    cp: true,  ig: true,  eg: false, mem: "~500 MB", use: "Most production clusters" },
    { name: "demo",       cp: true,  ig: true,  eg: true,  mem: "~900 MB", use: "Learning & demos" },
    { name: "production", cp: true,  ig: true,  eg: true,  mem: "~700 MB", use: "Hardened production" },
  ];
  const activeProfile = stage <= 1 ? null : stage === 2 ? "demo" : stage === 3 ? "default" : "production";
  const NARR = [
    "Istio ships four installation profiles. Choosing the right one matters — each enables different components and has different resource footprints.",
    "Step 1 — Choose a profile. For this tutorial use demo (all features enabled). For production clusters, use default or a custom IstioOperator.",
    "Step 2 — Install: istioctl install --set profile=demo -y. Istiod, the ingress gateway, and egress gateway are deployed in istio-system.",
    "Step 3 — Default profile is recommended for most clusters: control plane + ingress gateway only. Lower memory, no egress gateway by default.",
    "Step 4 — IstioOperator: create an operator.yaml to customize any component — resource limits, replica counts, feature flags. Apply with istioctl install -f operator.yaml.",
    "Step 5 — Canary upgrade: install a new revision (--set revision=1-20) alongside the existing one. Migrate namespaces one at a time using istio.io/rev label. Zero-downtime.",
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StepBar current={stage} total={STEPS} color={meta.color} />
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "monospace" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
              {["Profile", "Control Plane", "Ingress GW", "Egress GW", "~Memory", "Best For"].map(h => (
                <th key={h} style={{ padding: "6px 8px", textAlign: "left", color: "#64748b", fontWeight: "bold" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PROFILES.map(p => {
              const active = activeProfile === p.name;
              const highlight = stage >= 2;
              return (
                <tr key={p.name} style={{ borderBottom: "1px solid #e2e8f0", background: active ? meta.color + "15" : "transparent", transition: "all 0.3s" }}>
                  <td style={{ padding: "7px 8px", fontWeight: "bold", color: active ? meta.color : "#64748b" }}>{p.name}</td>
                  <td style={{ padding: "7px 8px", color: p.cp ? "#22c55e" : "#94a3b8" }}>{p.cp ? "✅" : "—"}</td>
                  <td style={{ padding: "7px 8px", color: p.ig ? "#22c55e" : "#94a3b8" }}>{p.ig ? "✅" : "—"}</td>
                  <td style={{ padding: "7px 8px", color: p.eg ? "#22c55e" : "#94a3b8" }}>{p.eg ? "✅" : "—"}</td>
                  <td style={{ padding: "7px 8px", color: "#64748b" }}>{p.mem}</td>
                  <td style={{ padding: "7px 8px", color: "#64748b" }}>{p.use}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {stage >= 4 && (
        <div style={{ borderRadius: 8, padding: "8px 12px", border: "1px solid #38bdf840", background: "#38bdf810", fontSize: 12, fontFamily: "monospace", color: "#0284c7" }}>
          IstioOperator: set components.pilot.k8s.resources.requests.memory=256Mi · replicaCount=2 · meshConfig.accessLogFile=/dev/stdout
        </div>
      )}
      <Narrative text={NARR[stage]} color={meta.color} step={stage > 0 && stage <= STEPS ? stage : null} total={STEPS} />
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack} />
    </div>
  );
}

// ─── LESSON 27: Istio ServiceEntry ───────────────────────────────────────────
function IstioServiceEntryLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const registered = stage >= 3;
  const blocked = stage >= 2 && !registered;
  const tlsOrig = stage >= 5;
  const NARR = [
    "By default Istio allows all outbound traffic (ALLOW_ANY). External services are reachable but invisible to mesh policies — no routing rules, no mTLS, no metrics.",
    "Step 1 — Enable REGISTRY_ONLY: set meshConfig.outboundTrafficPolicy=REGISTRY_ONLY. Now all egress to unregistered hosts is blocked by the sidecar.",
    "Step 2 — Blocked: apps trying to reach api.payment.com get a 502/503. Every external dependency must now be explicitly declared.",
    "Step 3 — Apply ServiceEntry for api.payment.com (port 443, resolution DNS, location MESH_EXTERNAL). The host is now in Istio's service registry.",
    "Step 4 — Traffic flows again. Now you can apply a VirtualService (timeouts, retries) and DestinationRule (connection pool limits) to the external service.",
    "Step 5 — TLS origination: DestinationRule mode=SIMPLE on api.payment.com. App calls plain HTTP :80; Envoy upgrades to HTTPS :443 automatically. The app never needs TLS code.",
  ];
  const extService = (label, registered, blocked) => (
    <div style={{ borderRadius: 8, padding: "8px 12px", border: `1px solid ${registered ? "#34d399" : blocked ? "#ef4444" : "#94a3b8"}`, background: registered ? "#34d39915" : blocked ? "#ef444415" : "#f1f5f9", transition: "all 0.35s", textAlign: "center", minWidth: 140 }}>
      <div style={{ fontSize: 14 }}>{registered ? "🌐" : blocked ? "🚫" : "🌐"}</div>
      <div style={{ fontSize: 12, fontFamily: "monospace", color: registered ? "#34d399" : blocked ? "#ef4444" : "#64748b", fontWeight: "bold" }}>{label}</div>
      <div style={{ fontSize: 11, fontFamily: "monospace", color: "#475569", marginTop: 2 }}>{registered ? "✅ ServiceEntry" : blocked ? "BLOCKED" : "external"}</div>
      {tlsOrig && registered && <div style={{ fontSize: 11, color: "#06b6d4", marginTop: 2 }}>🔐 TLS origination</div>}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StepBar current={stage} total={STEPS} color={meta.color} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
        <div style={{ borderRadius: 10, padding: "10px 14px", border: "1px solid #34d39930", background: "#f0faff", textAlign: "center" }}>
          <div style={{ fontSize: 18 }}>📦</div>
          <div style={{ fontSize: 12, fontFamily: "monospace", color: "#7dd3fc" }}>app pod</div>
        </div>
        <div style={{ fontSize: 16, color: "#64748b" }}>→</div>
        <div style={{ borderRadius: 8, padding: "6px 10px", border: "1px solid #0ea5e940", background: "#f0faff", textAlign: "center" }}>
          <div style={{ fontSize: 12, fontFamily: "monospace", color: "#0ea5e9" }}>🔷 Envoy</div>
          <div style={{ fontSize: 11, fontFamily: "monospace", color: "#475569" }}>{stage >= 2 ? "REGISTRY_ONLY" : "ALLOW_ANY"}</div>
        </div>
        <div style={{ fontSize: 16, color: "#64748b" }}>→</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {extService("api.payment.com", registered, blocked)}
          {extService("api.maps.com", false, stage >= 2)}
        </div>
      </div>
      <Narrative text={NARR[stage]} color={meta.color} step={stage > 0 && stage <= STEPS ? stage : null} total={STEPS} />
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack} />
    </div>
  );
}

// ─── LESSON 28: Istio Egress Gateway ─────────────────────────────────────────
function IstioEgressLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const gwActive  = stage >= 3;
  const auditOn   = stage >= 4;
  const tlsOrig   = stage >= 5;
  const NARR = [
    "Without an egress gateway every pod makes external calls directly. Traffic exits from any node — no central audit point, no policy enforcement.",
    "Step 1 — Deploy istio-egressgateway: it's a dedicated Envoy pod in istio-system, similar to the ingress gateway but for outbound traffic.",
    "Step 2 — Create the routing chain: ServiceEntry registers the external host → VirtualService routes internal mesh traffic to the egress gateway → second VS routes from gateway to external.",
    "Step 3 — All external calls now pass through the egress gateway pod. Any pod that bypasses it (direct egress) can be blocked with a Kubernetes NetworkPolicy.",
    "Step 4 — Centralized audit: the egress gateway emits access logs for every external call. Apply AuthorizationPolicy on the egress gateway to allow only specific service accounts.",
    "Step 5 — TLS origination at the gateway: DestinationRule on the egress gateway handles HTTPS toward the external service. Internal traffic to the gateway uses mTLS (ISTIO_MUTUAL).",
  ];
  const node = (icon, label, sub, active) => (
    <div style={{ borderRadius: 10, padding: "8px 12px", border: `2px solid ${active ? "#fb7185" : "#94a3b8"}`, background: active ? "#fb718515" : "#f1f5f9", textAlign: "center", minWidth: 80, transition: "all 0.35s" }}>
      <div style={{ fontSize: 18 }}>{icon}</div>
      <div style={{ fontSize: 12, fontWeight: "bold", fontFamily: "monospace", color: active ? "#fb7185" : "#64748b" }}>{label}</div>
      {sub && <div style={{ fontSize: 11, fontFamily: "monospace", color: "#475569", marginTop: 2 }}>{sub}</div>}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StepBar current={stage} total={STEPS} color={meta.color} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        {node("📦", "App Pod", "namespace", true)}
        <div style={{ fontSize: 13, color: "#64748b" }}>→</div>
        {gwActive
          ? node("🚪", "Egress GW", tlsOrig ? "TLS orig" : "istio-system", true)
          : <div style={{ borderRadius: 10, padding: "8px 12px", border: "1px solid #e2e8f0", background: "#f8fafc", textAlign: "center", minWidth: 80 }}>
              <div style={{ fontSize: 12, fontFamily: "monospace", color: "#475569" }}>no gateway</div>
            </div>
        }
        <div style={{ fontSize: 13, color: "#64748b" }}>→</div>
        {node("🌐", "api.payment.com", ":443 external", gwActive)}
      </div>
      {auditOn && (
        <div style={{ borderRadius: 8, padding: "6px 12px", border: "1px solid #fb718440", background: "#fb718410", fontSize: 12, fontFamily: "monospace", color: "#fb7185", textAlign: "center" }}>
          📋 Egress Gateway access log: 200 api.payment.com /charge 142ms  ·  AuthzPolicy enforced
        </div>
      )}
      <Narrative text={NARR[stage]} color={meta.color} step={stage > 0 && stage <= STEPS ? stage : null} total={STEPS} />
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack} />
    </div>
  );
}

// ─── LESSON 29: Istio JWT Authentication ─────────────────────────────────────
function IstioJwtLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const raActive   = stage >= 2;
  const noToken    = stage >= 3 && stage < 4;
  const validToken = stage >= 4;
  const combined   = stage >= 5;
  const NARR = [
    "mTLS proves service identity (which pod is calling). JWT proves user identity (who the user is). Both together give you full zero-trust: service + end-user verification.",
    "Step 1 — Apply RequestAuthentication with issuer URL and jwksUri (the JWKS endpoint of your IdP: Auth0, Google, Keycloak…). Istio caches public keys for signature verification.",
    "Step 2 — RequestAuthentication is applied. A request WITH a valid token is accepted. A request with a MISSING token is also accepted (RequestAuthentication only validates if present).",
    "Step 3 — To REQUIRE a token: add AuthorizationPolicy requireRequestPrincipal: ['*']. Now requests with no token get 403. Invalid tokens always get 401 from RequestAuthentication.",
    "Step 4 — Valid JWT accepted. The token's claims are available as request.auth.claims[role], [email], etc.",
    "Step 5 — Combined policy: AuthorizationPolicy checks BOTH the SPIFFE principal (service identity via mTLS) AND the JWT claim role=admin. Dual-layer zero-trust.",
  ];
  const tokenBox = (label, valid, shown, icon, color) => !shown ? null : (
    <div style={{ borderRadius: 8, padding: "6px 10px", border: `1px solid ${color}`, background: color + "12", textAlign: "center", fontSize: 12, fontFamily: "monospace", color }}>
      <div style={{ fontSize: 16 }}>{icon}</div>
      <div style={{ fontWeight: "bold" }}>{label}</div>
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StepBar current={stage} total={STEPS} color={meta.color} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
        <div style={{ borderRadius: 10, padding: "10px 12px", border: "1px solid #e2e8f0", background: "#f8fafc", textAlign: "center" }}>
          <div style={{ fontSize: 18 }}>🌐</div>
          <div style={{ fontSize: 12, fontFamily: "monospace", color: "#64748b" }}>Client</div>
          {validToken && <div style={{ fontSize: 11, color: "#22c55e", marginTop: 2 }}>🎫 JWT token</div>}
          {noToken    && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 2 }}>❌ no token</div>}
        </div>
        <div style={{ fontSize: 14, color: "#64748b" }}>→</div>
        {raActive && (
          <div style={{ borderRadius: 10, padding: "8px 12px", border: `1px solid #a78bfa`, background: "#a78bfa12", textAlign: "center", minWidth: 130 }}>
            <div style={{ fontSize: 12, fontWeight: "bold", fontFamily: "monospace", color: "#a78bfa" }}>RequestAuthentication</div>
            <div style={{ fontSize: 11, fontFamily: "monospace", color: "#64748b", marginTop: 2 }}>issuer: auth.example.com</div>
            <div style={{ fontSize: 11, fontFamily: "monospace", color: "#64748b" }}>jwksUri: /.well-known/jwks</div>
            {combined && <div style={{ fontSize: 11, color: "#ec4899", marginTop: 4 }}>+ AuthzPolicy: role=admin</div>}
          </div>
        )}
        <div style={{ fontSize: 14, color: "#64748b" }}>→</div>
        <div style={{ borderRadius: 10, padding: "8px 12px", border: `1px solid ${noToken ? "#ef444450" : validToken ? "#22c55e50" : "#94a3b8"}`, background: "#f0faff", textAlign: "center", transition: "all 0.4s" }}>
          <div style={{ fontSize: 18 }}>📦</div>
          <div style={{ fontSize: 12, fontFamily: "monospace", color: noToken ? "#ef4444" : validToken ? "#22c55e" : "#64748b" }}>
            {noToken ? "403 Forbidden" : validToken ? "200 OK" : "service"}
          </div>
        </div>
      </div>
      <Narrative text={NARR[stage]} color={meta.color} step={stage > 0 && stage <= STEPS ? stage : null} total={STEPS} />
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack} />
    </div>
  );
}

// ─── LESSON 30: Istio Troubleshooting ────────────────────────────────────────
function IstioTroubleshootLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const COMMANDS = [
    { cmd: "istioctl analyze -n istio-demo", title: "Config Validation", color: "#f472b6",
      output: `Warning [IST0101] VirtualService 'backend' references host 'backend.v2' not found
Warning [IST0108] DestinationRule 'backend' missing subset 'v3'
Info    [IST0118] Port name 'tcp-8080' should be 'http' for protocol detection
✓ No errors found — 3 warnings to address` },
    { cmd: "istioctl proxy-status", title: "Sidecar Sync State", color: "#fb923c",
      output: `NAME                          CDS    LDS    EDS    RDS    ISTIOD
frontend-7d4b9f-xk2mp        SYNCED SYNCED SYNCED SYNCED istiod-abc
backend-v1-5c8d-mnq3r        SYNCED SYNCED SYNCED SYNCED istiod-abc
backend-v2-9f2c-pqr8s    NOT SYNCED  ...` },
    { cmd: "istioctl proxy-config route frontend-pod -n istio-demo", title: "Envoy Route Table", color: "#34d399",
      output: `NAME          DOMAINS     MATCH     VIRTUAL SERVICE
backend:9090  backend     /*        backend.istio-demo
              Header x-version=v2 → subset:v2  (weighted 10%)
              Default               → subset:v1  (weighted 90%)` },
    { cmd: "kubectl exec <pod> -c istio-proxy -- curl localhost:15000/stats | grep upstream_rq", title: "Envoy Admin Stats", color: "#67e8f9",
      output: `cluster.outbound|9090|v1|backend.istio-demo.svc.cluster.local.upstream_rq_total: 842
cluster.outbound|9090|v2|backend.istio-demo.svc.cluster.local.upstream_rq_total: 92
cluster.outbound|9090|v2|backend.istio-demo.svc.cluster.local.upstream_rq_5xx: 3` },
    { cmd: "istioctl authn tls-check <pod>.istio-demo backend.istio-demo.svc.cluster.local", title: "mTLS Health Check", color: "#a78bfa",
      output: `HOST:PORT                                  STATUS    SERVER        CLIENT
backend.istio-demo.svc.cluster.local:9090  OK        mTLS          mTLS
✓ mTLS mutual authentication is active` },
  ];
  const active = COMMANDS[Math.min(stage - 1, COMMANDS.length - 1)];
  const NARR = [
    "The istioctl CLI has three essential diagnostic commands. Master these and you can debug virtually any Istio issue systematically.",
    "istioctl analyze: scans Kubernetes resources for config mistakes — missing subsets, wrong port names, unresolved host references. Run this FIRST when something seems broken.",
    "istioctl proxy-status: shows whether each Envoy has received the latest config from Istiod. 'NOT SYNCED' means the sidecar is running stale config — this explains routing bugs.",
    "istioctl proxy-config route <pod>: dumps Envoy's actual route table. Shows what routing rules the proxy is actually enforcing — essential when VirtualService seems not to apply.",
    "Envoy Admin API (:15000): direct access to the proxy's internal stats. upstream_rq_5xx shows error counts per cluster; /config_dump shows full running config as JSON.",
    "istioctl authn tls-check: verifies mTLS status between two specific services. Shows SERVER mode and CLIENT mode — both must be mTLS for full mutual authentication.",
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StepBar current={stage} total={STEPS} color={meta.color} />
      {stage > 0 && active && (
        <div style={{ borderRadius: 10, border: `1px solid ${active.color}40`, background: "#f8fafc", overflow: "hidden" }}>
          <div style={{ padding: "7px 12px", background: active.color + "18", borderBottom: `1px solid ${active.color}30`, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: "bold", color: active.color }}>{active.title}</span>
          </div>
          <div style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 12, color: "#15803d", background: "#f8fafc" }}>
            <div style={{ color: "#64748b", marginBottom: 4 }}>$ {active.cmd}</div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "#64748b", lineHeight: 1.6 }}>{active.output}</pre>
          </div>
        </div>
      )}
      <Narrative text={NARR[stage]} color={meta.color} step={stage > 0 && stage <= STEPS ? stage : null} total={STEPS} />
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack} />
    </div>
  );
}

// ─── LESSON 31: Istio Traffic Mirroring & Header Manipulation ─────────────────
function IstioMirrorLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const mirrorOn   = stage >= 3;
  const headerMod  = stage >= 4;
  const pct        = stage <= 2 ? 0 : stage === 3 ? 100 : stage === 4 ? 50 : 100;
  const NARR = [
    "Traffic mirroring lets you send a copy of live traffic to v2 before shifting any real load. v2 must handle it, but its responses are discarded — zero user impact.",
    "Step 1 — v1 is live, v2 is deployed but receives no traffic. You want to validate v2 with real production requests without risking any users.",
    "Step 2 — Add mirror + mirrorPercentage to the VirtualService. 100% of live requests to v1 are also sent async to v2. Users only receive v1 responses.",
    "Step 3 — Mirror is active. v2 processes every request, logs errors, and reveals bugs. Monitor v2 error rate and latency in Grafana — adjust before shifting any weight.",
    "Step 4 — Header manipulation: VirtualService headers.request.add injects x-source: production before forwarding. headers.response.remove strips internal headers before the client sees them.",
    "Step 5 — After validating with mirroring, add weights (v1=90, v2=10) and disable the mirror. Gradual canary can now begin with confidence from real traffic validation.",
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StepBar current={stage} total={STEPS} color={meta.color} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
        <div style={{ borderRadius: 10, padding: "8px 12px", border: "1px solid #e2e8f0", background: "#f8fafc", textAlign: "center" }}>
          <div style={{ fontSize: 18 }}>🌐</div>
          <div style={{ fontSize: 12, fontFamily: "monospace", color: "#64748b" }}>Client</div>
          {headerMod && <div style={{ fontSize: 11, color: "#67e8f9", marginTop: 2 }}>x-source: production</div>}
        </div>
        <div style={{ fontSize: 16, color: "#64748b" }}>→</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          <div style={{ borderRadius: 10, padding: "8px 12px", border: "2px solid #6366f1", background: "#6366f115", textAlign: "center", minWidth: 80 }}>
            <div style={{ fontSize: 12, fontWeight: "bold", fontFamily: "monospace", color: "#a5b4fc" }}>📦 v1</div>
            <div style={{ fontSize: 11, fontFamily: "monospace", color: "#22c55e" }}>← response returned</div>
          </div>
          {mirrorOn && (
            <div style={{ borderRadius: 10, padding: "8px 12px", border: `2px dashed #67e8f9`, background: "#67e8f910", textAlign: "center", minWidth: 80, opacity: 0.85 }}>
              <div style={{ fontSize: 12, fontWeight: "bold", fontFamily: "monospace", color: "#67e8f9" }}>📦 v2 (mirror)</div>
              <div style={{ fontSize: 11, fontFamily: "monospace", color: "#64748b" }}>response discarded</div>
              {pct > 0 && <div style={{ fontSize: 11, color: "#67e8f9" }}>{pct}% mirrored</div>}
            </div>
          )}
        </div>
      </div>
      <Narrative text={NARR[stage]} color={meta.color} step={stage > 0 && stage <= STEPS ? stage : null} total={STEPS} />
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack} />
    </div>
  );
}

// ─── LESSON 32: Istio Sidecar Resource ───────────────────────────────────────
function IstioSidecarResourceLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const scoped    = stage >= 3;
  const allSvcs   = ["frontend", "backend", "orders", "payments", "inventory", "auth", "notifications", "analytics", "search", "gateway"];
  const neededSvcs = ["backend", "auth"];
  const NARR = [
    "By default every Envoy sidecar tracks ALL services in the mesh. In a 100-service cluster each proxy carries config for 100 services — most of which it never calls.",
    "Step 1 — The problem: a frontend pod only calls backend and auth, but its Envoy has config for all 10 services. This wastes memory and slows down Istiod config pushes.",
    "Step 2 — Measure: kubectl exec <pod> -c istio-proxy -- curl localhost:15000/memory_allocator_stats. Before scoping: ~200 MB. The waste adds up across hundreds of pods.",
    "Step 3 — Apply a Sidecar resource with workloadSelector for the frontend pods. egress.hosts lists only ./backend and ./auth. Envoy drops config for the other 8 services.",
    "Step 4 — Memory drops to ~50 MB per frontend pod. Config push time to this Envoy also decreases — Istiod sends a smaller xDS payload.",
    "Step 5 — Default Sidecar: create a Sidecar with no workloadSelector in the root namespace. All proxies inherit this unless overridden. Best practice: limit every workload to its dependencies.",
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StepBar current={stage} total={STEPS} color={meta.color} />
      <div style={{ borderRadius: 10, border: "1px solid #e2e8f0", background: "#f8fafc", padding: 12 }}>
        <div style={{ fontSize: 12, fontFamily: "monospace", color: "#64748b", marginBottom: 8, textAlign: "center" }}>
          {scoped ? "🔷 Envoy config (scoped — after Sidecar resource)" : "🔷 Envoy config (default — all services)"}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "center" }}>
          {allSvcs.map(s => {
            const needed = neededSvcs.includes(s);
            const visible = !scoped || needed;
            return (
              <div key={s} style={{ padding: "3px 8px", borderRadius: 6, border: `1px solid ${visible ? "#4ade8050" : "#94a3b8"}`, background: visible ? "#4ade8010" : "transparent", fontSize: 11, fontFamily: "monospace", color: visible ? "#4ade80" : "#94a3b8", transition: "all 0.4s", opacity: visible ? 1 : 0.2 }}>
                {s}
              </div>
            );
          })}
        </div>
        {scoped && (
          <div style={{ marginTop: 8, fontSize: 12, fontFamily: "monospace", color: "#15803d", textAlign: "center" }}>
            8 services dropped · memory: ~200 MB → ~50 MB
          </div>
        )}
      </div>
      <Narrative text={NARR[stage]} color={meta.color} step={stage > 0 && stage <= STEPS ? stage : null} total={STEPS} />
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack} />
    </div>
  );
}

// ─── LESSON 33: Istio Load Balancing ─────────────────────────────────────────
function IstioLbLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const ALGOS = [
    { name: "ROUND_ROBIN",    desc: "Each request goes to the next pod in rotation. Default. Fair but ignores pod load.", tag: "Default", color: "#6366f1" },
    { name: "LEAST_REQUEST",  desc: "Picks the pod with fewest active connections. Better for heterogeneous workloads.", tag: "Recommended", color: "#22c55e" },
    { name: "RANDOM",         desc: "Picks a random pod. Works well when all pods are equally loaded.", tag: "Simple", color: "#f59e0b" },
    { name: "CONSISTENT_HASH",desc: "Same hash key always maps to the same pod. Enables sticky sessions via header/cookie/IP.", tag: "Sticky", color: "#0ea5e9" },
    { name: "RING_HASH",      desc: "Like CONSISTENT_HASH but uses a virtual ring for more even distribution across varying-capacity pods.", tag: "Advanced", color: "#a855f7" },
  ];
  const active = ALGOS[Math.min(stage === 0 ? 0 : stage - 1, ALGOS.length - 1)];
  const NARR = [
    "Istio's DestinationRule controls the load balancing algorithm per service or per subset. The right choice depends on your workload characteristics.",
    "ROUND_ROBIN: the default. Simple and predictable — request 1 to pod-1, 2 to pod-2, 3 to pod-3, repeat. Does not account for pod response times.",
    "LEAST_REQUEST: pick the pod with fewest active connections. Significantly better tail latency when pods have varying response times or different capacities.",
    "RANDOM: pick any available pod uniformly at random. Statistically similar to ROUND_ROBIN at scale; lower overhead with no pod counter needed.",
    "CONSISTENT_HASH: a hash of the incoming request's header, cookie, or source IP determines which pod serves it. Same user always reaches the same pod — session affinity.",
    "RING_HASH: consistent hashing on a virtual ring (minimumRingSize controls granularity). More even distribution than CONSISTENT_HASH when pod count changes.",
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StepBar current={stage} total={STEPS} color={meta.color} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {ALGOS.map((algo, i) => {
          const isActive = i === (stage === 0 ? 0 : stage - 1);
          return (
            <div key={algo.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", borderRadius: 8, border: `1px solid ${isActive ? algo.color : "#94a3b8"}`, background: isActive ? algo.color + "15" : "#f1f5f9", transition: "all 0.35s" }}>
              <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: "bold", color: isActive ? algo.color : "#94a3b8", minWidth: 130 }}>{algo.name}</span>
              <span style={{ fontSize: 11, fontFamily: "monospace", color: "#64748b", flex: 1 }}>{algo.desc}</span>
              <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 4, background: isActive ? algo.color + "25" : "#94a3b8", color: isActive ? algo.color : "#94a3b8", fontFamily: "monospace" }}>{algo.tag}</span>
            </div>
          );
        })}
      </div>
      {stage >= 4 && (
        <div style={{ borderRadius: 8, padding: "7px 12px", border: "1px solid #0ea5e940", background: "#0ea5e910", fontSize: 12, fontFamily: "monospace", color: "#0ea5e9" }}>
          Cookie hash: httpCookie.name=session · ttl=0s → Istio generates cookie if absent · client sends it back → always same pod
        </div>
      )}
      <Narrative text={NARR[stage]} color={meta.color} step={stage > 0 && stage <= STEPS ? stage : null} total={STEPS} />
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack} />
    </div>
  );
}

// ─── LESSON 34: Istio Ambient Mesh ───────────────────────────────────────────
function IstioAmbientLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const ambientMode = stage >= 3;
  const waypointOn  = stage >= 4;
  const migrating   = stage >= 5;
  const NARR = [
    "Sidecar mode injects an Envoy into every pod. In a 1,000-pod cluster that's 1,000 Envoys — even for pods that only need basic mTLS. Ambient Mesh offers a lighter alternative.",
    "Step 1 — Problem: each Envoy sidecar consumes ~50 MB RAM + ~0.5 CPU. That's 50 GB RAM and 500 CPU for a 1,000-pod cluster just for proxies.",
    "Step 2 — Ambient mode: kubectl label namespace demo istio.io/dataplane-mode=ambient. No more sidecar injection. Existing pods are immediately enrolled without restart.",
    "Step 3 — ztunnel: a Rust-based DaemonSet (one pod per node) handles L4 traffic. It provides mTLS, workload identity (SPIFFE), and basic L4 metrics. No per-pod Envoy needed.",
    "Step 4 — Waypoint proxy: for L7 features (VirtualService routing, JWT auth, WasmPlugin) add a waypoint. kubectl gateway install --class istio-waypoint in the namespace.",
    "Step 5 — Migration: sidecar and ambient namespaces coexist. Migrate namespace by namespace — add the ambient label, remove the injection label. Rollback by reversing labels.",
  ];
  const podStyle = (label, hasEnvoy, active) => (
    <div style={{ borderRadius: 8, padding: "6px 10px", border: `1px solid ${active ? "#818cf8" : "#94a3b8"}`, background: active ? "#818cf815" : "#f1f5f9", textAlign: "center", minWidth: 70, transition: "all 0.4s" }}>
      <div style={{ fontSize: 14 }}>📦</div>
      <div style={{ fontSize: 11, fontFamily: "monospace", color: active ? "#818cf8" : "#94a3b8" }}>{label}</div>
      {hasEnvoy && <div style={{ fontSize: 10, color: "#f59e0b", marginTop: 1 }}>+Envoy 🔷</div>}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StepBar current={stage} total={STEPS} color={meta.color} />
      {!ambientMode ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12, fontFamily: "monospace", color: "#64748b", textAlign: "center" }}>Sidecar mode — Envoy injected into every pod</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            {["pod-1","pod-2","pod-3","pod-4","pod-5"].map(p => podStyle(p, true, false))}
          </div>
          <div style={{ fontSize: 12, fontFamily: "monospace", color: "#ef4444", textAlign: "center" }}>5 × ~50 MB = ~250 MB proxy overhead</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12, fontFamily: "monospace", color: "#818cf8", textAlign: "center" }}>Ambient mode — no sidecars, ztunnel on each node</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            {["pod-1","pod-2","pod-3","pod-4","pod-5"].map(p => podStyle(p, false, true))}
          </div>
          <div style={{ borderRadius: 8, padding: "6px 12px", border: "1px solid #818cf840", background: "#818cf810", fontSize: 12, fontFamily: "monospace", color: "#818cf8", textAlign: "center" }}>
            🔷 ztunnel (DaemonSet, 1 per node · ~50 MB) handles L4 mTLS for all pods
          </div>
          {waypointOn && (
            <div style={{ borderRadius: 8, padding: "6px 12px", border: "1px solid #06b6d440", background: "#06b6d410", fontSize: 12, fontFamily: "monospace", color: "#06b6d4", textAlign: "center" }}>
              🚦 Waypoint proxy (optional, per-namespace) handles L7: VS routing, JWT, WasmPlugin
            </div>
          )}
        </div>
      )}
      <Narrative text={NARR[stage]} color={meta.color} step={stage > 0 && stage <= STEPS ? stage : null} total={STEPS} />
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack} />
    </div>
  );
}

// ─── LESSON 35: Istio WebAssembly Plugins ────────────────────────────────────
function IstioWasmLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const pluginActive = stage >= 2;
  const customHeader = stage >= 3;
  const rateLimited  = stage >= 4;
  const PHASES = [
    { name: "AUTHN",  color: "#f472b6", desc: "Before mTLS — custom auth logic",     active: stage >= 2 },
    { name: "AUTHZ",  color: "#fb7185", desc: "After mTLS, before AuthzPolicy",       active: stage >= 3 },
    { name: "STATS",  color: "#fbbf24", desc: "After routing — custom metrics",       active: stage >= 4 },
  ];
  const NARR = [
    "Envoy has built-in filters (mTLS, JWT, rate limiting), but production systems often need custom logic. WasmPlugin lets you add it without modifying Istio or Envoy.",
    "Step 1 — Write a filter in Rust/Go/C++ using the proxy-wasm SDK. Compile to .wasm and push to an OCI registry (or serve via HTTP). No Envoy fork required.",
    "Step 2 — Apply WasmPlugin CRD: specify the .wasm URL, the target workloads via selector, the execution phase (AUTHN/AUTHZ/STATS), and any JSON plugin config.",
    "Step 3 — AUTHZ phase example: a custom Wasm filter adds x-request-id header and checks an external allow-list. The response is modified to add x-filtered-by: wasm.",
    "Step 4 — STATS phase example: Wasm filter emits a custom Prometheus metric istio_custom_rate_limit_triggered_total when requests exceed a threshold.",
    "Step 5 — Safety: Wasm runs in a VM sandbox inside Envoy. A panicking plugin is caught by the sandbox — Envoy rejects the request with 500 but keeps serving. Config errors are reported without crashing the sidecar.",
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StepBar current={stage} total={STEPS} color={meta.color} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        <div style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#f8fafc", textAlign: "center" }}>
          <div style={{ fontSize: 16 }}>🌐</div>
          <div style={{ fontSize: 11, fontFamily: "monospace", color: "#64748b" }}>Request</div>
        </div>
        <div style={{ fontSize: 14, color: "#64748b" }}>→</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {PHASES.map(ph => (
            <div key={ph.name} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${ph.active ? ph.color : "#94a3b8"}`, background: ph.active ? ph.color + "15" : "#f1f5f9", fontSize: 11, fontFamily: "monospace", color: ph.active ? ph.color : "#94a3b8", transition: "all 0.35s", display: "flex", gap: 8 }}>
              <span style={{ fontWeight: "bold", minWidth: 40 }}>{ph.name}</span>
              <span style={{ color: ph.active ? ph.color + "cc" : "#94a3b8" }}>{ph.desc}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 14, color: "#64748b" }}>→</div>
        <div style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${rateLimited ? "#ef4444" : customHeader ? "#22c55e" : "#94a3b8"}`, background: "#f8fafc", textAlign: "center", transition: "all 0.4s" }}>
          <div style={{ fontSize: 16 }}>📦</div>
          <div style={{ fontSize: 11, fontFamily: "monospace", color: rateLimited ? "#ef4444" : customHeader ? "#22c55e" : "#64748b" }}>
            {rateLimited ? "429 Rate Limited" : customHeader ? "200 + x-filtered-by" : "Service"}
          </div>
        </div>
      </div>
      <Narrative text={NARR[stage]} color={meta.color} step={stage > 0 && stage <= STEPS ? stage : null} total={STEPS} />
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack} />
    </div>
  );
}

// ─── Production Scenarios ─────────────────────────────────────────────────────

// Shared mini primitives for scenario diagrams
function SvcBox({ label, sub, color = "#0ea5e9", pulse = false, warn = false, dim = false }) {
  return (
    <div style={{
      padding: "8px 14px", borderRadius: 10, minWidth: 90, textAlign: "center",
      background: dim ? "#f1f5f9" : (warn ? "#7f1d1d" : color + "18"),
      border: `1.5px solid ${dim ? "#e2e8f0" : (warn ? "#ef4444" : color + (pulse ? "ff" : "60"))}`,
      boxShadow: pulse && !dim ? `0 0 12px ${color}50` : "none",
      transition: "all 0.4s", opacity: dim ? 0.35 : 1,
    }}>
      <div style={{ fontSize: 13, fontWeight: "bold", color: dim ? "#334155" : (warn ? "#fca5a5" : color), fontFamily: "monospace" }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: dim ? "#94a3b8" : "#64748b", marginTop: 2, fontFamily: "monospace" }}>{sub}</div>}
    </div>
  );
}

function ScenarioArrow({ label, active, color = "#0ea5e9", blocked = false, vertical = false }) {
  const C = blocked ? "#ef4444" : (active ? color : "#94a3b8");
  return (
    <div style={{
      display: "flex", flexDirection: vertical ? "column" : "row",
      alignItems: "center", gap: 2, minWidth: vertical ? "auto" : 40,
    }}>
      {label && <span style={{ fontSize: 10, fontFamily: "monospace", color: C, whiteSpace: "nowrap" }}>{label}</span>}
      <div style={{
        [vertical ? "width" : "height"]: 2, [vertical ? "height" : "width"]: vertical ? 28 : "100%",
        background: active ? `linear-gradient(90deg, ${C}00, ${C}, ${C}00)` : C,
        minWidth: vertical ? 2 : 30, minHeight: vertical ? 28 : 2,
        transition: "all 0.4s",
        boxShadow: active && !blocked ? `0 0 6px ${C}` : "none",
      }} />
      <span style={{ fontSize: 11, color: C }}>{blocked ? "✗" : "→"}</span>
    </div>
  );
}

function PolicyBadge({ text, color }) {
  return (
    <span style={{
      fontSize: 10, fontFamily: "monospace", padding: "2px 6px", borderRadius: 4,
      background: color + "20", border: `1px solid ${color}50`, color,
    }}>{text}</span>
  );
}

// ── Detailed flow helper components ──────────────────────────────────────────
function HopLane({ hops, arrows }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 0, flexWrap: "wrap", justifyContent: "center", padding: "12px 0" }}>
      {hops.map((hop, i) => (
        <Fragment key={i}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 84 }}>
            <div style={{
              padding: "6px 10px", borderRadius: 8, textAlign: "center",
              background: hop.dim ? "#050a14" : (hop.warn ? "#3f0505" : hop.color + "18"),
              border: `1.5px solid ${hop.dim ? "#e2e8f0" : (hop.warn ? "#ef444460" : hop.active ? hop.color : hop.color + "35")}`,
              boxShadow: hop.active && !hop.dim ? `0 0 10px ${hop.color}30` : "none",
              opacity: hop.dim ? 0.22 : 1, transition: "all 0.35s",
            }}>
              <div style={{ fontSize: 12, fontWeight: "bold", color: hop.dim ? "#94a3b8" : (hop.warn ? "#fca5a5" : hop.color), fontFamily: "monospace" }}>{hop.name}</div>
              {hop.sub && <div style={{ fontSize: 10, color: hop.dim ? "#94a3b8" : "#64748b", marginTop: 1, fontFamily: "monospace" }}>{hop.sub}</div>}
            </div>
            {hop.sidecarAction && (
              <div style={{
                padding: "2px 6px", borderRadius: 4, fontSize: 10, fontFamily: "monospace",
                background: hop.warn ? "#3f0505" : "#080f1f",
                border: `1px solid ${hop.warn ? "#ef444450" : hop.active ? hop.color + "55" : "#94a3b8"}`,
                color: hop.warn ? "#fca5a5" : hop.active ? hop.color : "#94a3b8",
                textAlign: "center", maxWidth: 108,
              }}>
                ⬡ {hop.sidecarAction}
              </div>
            )}
            {hop.sidecarNote && (
              <div style={{ fontSize: 9, color: hop.warn ? "#ef444450" : "#283141", fontFamily: "monospace", maxWidth: 108, textAlign: "center", lineHeight: 1.3 }}>
                {hop.sidecarNote}
              </div>
            )}
          </div>
          {i < hops.length - 1 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", paddingTop: 10, gap: 1, minWidth: 38 }}>
              {arrows && arrows[i] ? (
                <>
                  <span style={{ fontSize: 9, fontFamily: "monospace", color: arrows[i].blocked ? "#ef4444" : arrows[i].active ? (arrows[i].color || "#0ea5e9") : "#94a3b8", whiteSpace: "nowrap" }}>{arrows[i].label}</span>
                  <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                    <div style={{ flex: 1, height: 1.5, background: arrows[i].blocked ? "#ef4444" : arrows[i].active ? (arrows[i].color || "#0ea5e9") : "#94a3b8" }} />
                    <span style={{ fontSize: 11, color: arrows[i].blocked ? "#ef4444" : arrows[i].active ? (arrows[i].color || "#0ea5e9") : "#94a3b8" }}>{arrows[i].blocked ? "✗" : "▶"}</span>
                  </div>
                  {arrows[i].proto && <span style={{ fontSize: 9, fontFamily: "monospace", color: "#475569" }}>{arrows[i].proto}</span>}
                </>
              ) : (
                <div style={{ display: "flex", alignItems: "center", width: "100%", marginTop: 9 }}>
                  <div style={{ flex: 1, height: 1, background: "#94a3b8" }} />
                  <span style={{ fontSize: 11, color: "#475569" }}>▶</span>
                </div>
              )}
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}

function FilterChainBox({ filters, active, color }) {
  return (
    <div style={{ background: "#f0faff", border: `1px solid ${color}25`, borderRadius: 10, padding: "10px 12px", minWidth: 210 }}>
      <div style={{ fontSize: 11, fontFamily: "monospace", color: "#475569", marginBottom: 7, letterSpacing: "0.04em" }}>⚙ ENVOY FILTER CHAIN</div>
      {filters.map((f, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "flex-start", gap: 7, padding: "4px 7px", borderRadius: 6, marginBottom: 3,
          background: i === active ? color + "12" : "transparent",
          border: `1px solid ${i === active ? color + "45" : "transparent"}`, transition: "all 0.3s",
        }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: i === active ? color : i < active ? color + "45" : "#94a3b8", flexShrink: 0, marginTop: 3 }} />
          <div>
            <div style={{ fontSize: 11, fontFamily: "monospace", color: i === active ? color : i < active ? color + "80" : "#94a3b8", fontWeight: i === active ? "bold" : "normal" }}>{f.name}</div>
            {i === active && f.detail && <div style={{ fontSize: 10, color: "#64748b", marginTop: 2, lineHeight: 1.45 }}>{f.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function RequestStateBox({ headers, status, color }) {
  return (
    <div style={{ background: "#f0faff", border: `1px solid ${color}25`, borderRadius: 10, padding: "10px 12px", flex: 1, minWidth: 200 }}>
      <div style={{ fontSize: 11, fontFamily: "monospace", color: "#475569", marginBottom: 7, letterSpacing: "0.04em" }}>📋 REQUEST STATE</div>
      {status && (
        <div style={{
          fontSize: 11, fontFamily: "monospace", marginBottom: 7,
          color: status.startsWith("2") ? "#22c55e" : status.startsWith("4") ? "#ef4444" : "#f59e0b",
          padding: "2px 8px", background: "#eff6ff", borderRadius: 4, display: "inline-block",
        }}>HTTP {status}</div>
      )}
      {headers.map((h, i) => (
        <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 2 }}>
          {h.badge && (
            <span style={{
              fontSize: 8.5, padding: "1px 3px", borderRadius: 2, flexShrink: 0,
              background: h.badge === "NEW" ? "#14532d" : h.badge === "SET" ? "#1e3a5f" : "#3f0505",
              color: h.badge === "NEW" ? "#4ade80" : h.badge === "SET" ? "#7dd3fc" : "#fca5a5",
              fontFamily: "monospace",
            }}>{h.badge}</span>
          )}
          <span style={{ fontSize: 10, fontFamily: "monospace", color: "#4b5563", flexShrink: 0 }}>{h.k}:</span>
          <span style={{
            fontSize: 10, fontFamily: "monospace", wordBreak: "break-all",
            color: h.badge === "NEW" ? "#4ade8085" : h.badge === "SET" ? "#7dd3fc85" : h.badge === "DEL" ? "#4b5563" : "#64748b",
            textDecoration: h.badge === "DEL" ? "line-through" : "none",
          }}>{h.v}</span>
        </div>
      ))}
    </div>
  );
}

function YamlBox({ code, color }) {
  return (
    <div style={{ background: "#f0faff", border: `1px solid ${color}25`, borderRadius: 10, padding: "10px 12px", flex: 1, minWidth: 210 }}>
      <div style={{ fontSize: 11, fontFamily: "monospace", color: "#475569", marginBottom: 6, letterSpacing: "0.04em" }}>📄 ACTIVE ISTIO CONFIG</div>
      <pre style={{ margin: 0, fontSize: 10, fontFamily: "monospace", color: "#4ade8090", whiteSpace: "pre-wrap", lineHeight: 1.6, maxHeight: 152, overflowY: "auto" }}>{code}</pre>
    </div>
  );
}

function ScenarioShell({ icon, name, subtitle, steps, color }) {
  const [step, setStep] = useState(0);
  const advance = useCallback(() => setStep(s => Math.min(steps.length - 1, s + 1)), [steps.length]);
  const reset   = useCallback(() => setStep(0), []);
  const S = steps[step];
  return (
    <div style={{ background: "#f0f9ff", border: `1px solid ${color}20`, borderRadius: 14, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <div>
          <div style={{ fontSize: 15, fontWeight: "bold", color: color + "cc", fontFamily: "monospace" }}>{name}</div>
          <div style={{ fontSize: 12, color: "#64748b", fontFamily: "monospace" }}>{subtitle}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {steps.map((_, i) => (
            <div key={i} onClick={() => setStep(i)} style={{
              width: 7, height: 7, borderRadius: "50%", cursor: "pointer", transition: "all 0.2s",
              background: i < step ? color + "50" : i === step ? color : "#94a3b8",
              border: i === step ? `1px solid ${color}` : "1px solid transparent",
            }} />
          ))}
        </div>
      </div>
      <div style={{ background: color + "10", border: `1px solid ${color}28`, borderRadius: 8, padding: "7px 14px", marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: "bold", color, fontFamily: "monospace" }}>
          [{String(step).padStart(2, "0")}/{String(steps.length - 1).padStart(2, "0")}] {S.title}
        </span>
      </div>
      <div style={{ borderTop: "1px solid #0a1020", borderBottom: "1px solid #0a1020", marginBottom: 12 }}>
        <HopLane hops={S.hops} arrows={S.arrows} />
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        {S.chain && <FilterChainBox filters={S.chain.filters} active={S.chain.active} color={color} />}
        {S.yaml && <YamlBox code={S.yaml} color={color} />}
        {(S.headers || S.status) && <RequestStateBox headers={S.headers || []} status={S.status} color={color} />}
      </div>
      <div style={{ background: "#f0faff", borderRadius: 10, padding: "12px 16px", borderLeft: `3px solid ${color}`, marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: "bold", color, marginBottom: 5 }}>{S.narTitle}</div>
        <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.68 }}>{S.narBody}</div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={reset} style={{ padding: "6px 14px", borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0", color: "#64748b", fontSize: 13, fontFamily: "monospace", cursor: "pointer" }}>↺ Reset</button>
        <button onClick={advance} disabled={step === steps.length - 1} style={{ padding: "6px 18px", borderRadius: 8, background: step === steps.length - 1 ? "#f1f5f9" : color + "1a", border: `1px solid ${step === steps.length - 1 ? "#e2e8f0" : color}`, color: step === steps.length - 1 ? "#94a3b8" : color, fontSize: 13, fontFamily: "monospace", cursor: step === steps.length - 1 ? "not-allowed" : "pointer", fontWeight: "bold" }}>Next step →</button>
        <span style={{ marginLeft: "auto", fontSize: 12, fontFamily: "monospace", color: "#283141" }}>Step {step + 1} / {steps.length}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── RabbitMQ Production Lab ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// Shared RabbitMQ node renderer
function RmqNode({ icon, label, sub, role, active, dimmed }) {
  const colors = {
    producer:  { bg: "rgba(249,115,22,0.10)", border: "#f97316", text: "#fb923c" },
    exchange:  { bg: "rgba(168,85,247,0.10)",  border: "#a855f7", text: "#c084fc" },
    queue:     { bg: "rgba(34,197,94,0.10)",   border: "#22c55e", text: "#4ade80" },
    consumer:  { bg: "rgba(59,130,246,0.10)",  border: "#3b82f6", text: "#60a5fa" },
    dlq:       { bg: "rgba(239,68,68,0.10)",   border: "#ef4444", text: "#f87171" },
    cluster:   { bg: "rgba(6,182,212,0.10)",   border: "#06b6d4", text: "#22d3ee" },
  };
  const c = colors[role] || colors.queue;
  return (
    <div style={{
      minWidth: 100, maxWidth: 120, borderRadius: 10, padding: "10px 12px",
      textAlign: "center", transition: "all 0.25s ease", userSelect: "none",
      background: active ? c.bg : dimmed ? "rgba(241,245,249,0.70)" : c.bg,
      border: `1.5px solid ${active ? c.border : dimmed ? "#e2e8f0" : c.border + "60"}`,
      boxShadow: active ? `0 0 0 3px ${c.border}22, 0 4px 14px rgba(0,0,0,0.3)` : "none",
      transform: active ? "translateY(-2px)" : "none",
      opacity: dimmed ? 0.3 : 1,
    }}>
      <div style={{ fontSize: 22 }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: active ? "#f1f5f9" : c.text, marginTop: 4, lineHeight: 1.3 }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color: c.text, opacity: 0.7, marginTop: 2, fontFamily: "monospace" }}>{sub}</div>}
    </div>
  );
}

function RmqArrow({ label, active, color = "#334155", dashed }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 4px", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <div style={{
          height: 2, width: 32,
          background: active ? `linear-gradient(90deg, ${color}60, ${color})` : "#94a3b8",
          borderRadius: 1,
          borderTop: dashed ? `2px dashed ${active ? color : "#94a3b8"}` : undefined,
        }} />
        <div style={{ width: 0, height: 0, borderTop: "4px solid transparent", borderBottom: "4px solid transparent", borderLeft: `6px solid ${active ? color : "#94a3b8"}` }} />
      </div>
      {label && <div style={{ fontSize: 11, color: active ? color : "#94a3b8", fontFamily: "monospace", marginTop: 3, maxWidth: 60, textAlign: "center", lineHeight: 1.3 }}>{label}</div>}
    </div>
  );
}

function RmqMsgBox({ props }) {
  const colors = { routing_key: "#f97316", delivery_mode: "#22c55e", content_type: "#3b82f6", correlation_id: "#a855f7", reply_to: "#06b6d4", expiration: "#ef4444", headers: "#eab308" };
  return (
    <div style={{ borderRadius: 12, border: "1px solid #e8edf4", background: "#f8fafc", overflow: "hidden" }}>
      <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 15 }}>📨</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#64748b", letterSpacing: 0.8, textTransform: "uppercase" }}>Message Properties</span>
      </div>
      <div style={{ padding: "10px 14px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
        {props.map(([k, v, badge]) => (
          <div key={k} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontFamily: "monospace", fontSize: 13 }}>
            <span style={{ color: "#64748b", minWidth: 100, flexShrink: 0 }}>{k}:</span>
            <span style={{ color: "#475569", wordBreak: "break-all" }}>{v}</span>
            {badge && <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, fontWeight: 700, background: (colors[badge] || "#334155") + "22", color: colors[badge] || "#94a3b8", flexShrink: 0 }}>{badge.toUpperCase()}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function RmqCodeBox({ title, code }) {
  return (
    <div style={{ borderRadius: 12, border: "1px solid #e8edf4", background: "#f8fafc", overflow: "hidden" }}>
      <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 15 }}>🐍</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#64748b", letterSpacing: 0.8, textTransform: "uppercase" }}>{title || "Python / pika"}</span>
      </div>
      <pre style={{ margin: 0, padding: "12px 14px", fontSize: 13, fontFamily: "monospace", color: "#64748b", whiteSpace: "pre-wrap", lineHeight: 1.6, overflowX: "auto" }}>{code}</pre>
    </div>
  );
}

function RmqScenarioShell({ title, steps }) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const s = steps[step];

  useCallback(() => {
    if (!playing) return;
    if (step >= steps.length - 1) { setPlaying(false); return; }
    const t = setTimeout(() => setStep(i => i + 1), 1800);
    return () => clearTimeout(t);
  }, [playing, step, steps.length]);

  // use proper useCallback for effect
  const { useState: _us, useCallback: uc } = { useState, useCallback };

  return (
    <div style={{ borderRadius: 16, border: "1px solid #e8edf4", background: "#f8fafc", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, color: "#f97316", fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 }}>Production Scenario</div>
          <div style={{ fontSize: 19, fontWeight: 800, color: "#0f172a" }}>{title}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setStep(i => Math.max(0, i - 1))} disabled={step === 0}
            style={{ padding: "6px 14px", borderRadius: 8, fontSize: 14, fontWeight: 600, background: "#ffffff", border: "1px solid #d1d9e6", color: step === 0 ? "#94a3b8" : "#64748b", cursor: step === 0 ? "not-allowed" : "pointer" }}>← Prev</button>
          <button onClick={() => setPlaying(p => !p)}
            style={{ padding: "6px 16px", borderRadius: 8, fontSize: 14, fontWeight: 700, background: playing ? "#ef444420" : "#f9731620", border: `1px solid ${playing ? "#ef4444" : "#f97316"}`, color: playing ? "#f87171" : "#fb923c", cursor: "pointer" }}>
            {playing ? "⏸ Pause" : "▶ Play"}</button>
          <button onClick={() => setStep(i => Math.min(steps.length - 1, i + 1))} disabled={step === steps.length - 1}
            style={{ padding: "6px 14px", borderRadius: 8, fontSize: 14, fontWeight: 600, background: "#ffffff", border: "1px solid #d1d9e6", color: step === steps.length - 1 ? "#94a3b8" : "#64748b", cursor: step === steps.length - 1 ? "not-allowed" : "pointer" }}>Next →</button>
        </div>
      </div>

      {/* Step progress dots */}
      <div style={{ display: "flex", gap: 6, padding: "10px 20px", borderBottom: "1px solid #e2e8f0", flexWrap: "wrap" }}>
        {steps.map((st, i) => (
          <button key={i} onClick={() => setStep(i)} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 7, fontSize: 13, fontWeight: i === step ? 700 : 400, border: `1px solid ${i === step ? "#f97316" : "#e8edf4"}`,
            background: i === step ? "#f9731618" : "transparent", color: i === step ? "#fb923c" : "#94a3b8", cursor: "pointer"
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: i < step ? "#22c55e" : i === step ? "#f97316" : "#94a3b8" }} />
            {st.stepLabel || `Step ${i + 1}`}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Narration */}
        <div style={{ borderRadius: 12, padding: "14px 16px", background: "rgba(249,115,22,0.06)", border: "1px solid rgba(249,115,22,0.2)" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#f97316", marginBottom: 6 }}>{s.narTitle}</div>
          <div style={{ fontSize: 15, color: "#64748b", lineHeight: 1.7 }}>{s.narBody}</div>
          {s.status && (
            <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 6, background: (s.status.ok ? "#22c55e" : "#ef4444") + "18", border: `1px solid ${(s.status.ok ? "#22c55e" : "#ef4444")}30`, fontSize: 13, fontWeight: 700, color: s.status.ok ? "#4ade80" : "#f87171" }}>
              {s.status.ok ? "✓" : "✗"} {s.status.msg}
            </div>
          )}
        </div>

        {/* Message flow */}
        <div style={{ borderRadius: 12, border: "1px solid #e8edf4", background: "#f8fafc", padding: "16px 12px", overflowX: "auto" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Message Flow</div>
          <div style={{ display: "flex", alignItems: "center", gap: 0, minWidth: "max-content" }}>
            {s.flow.map((item, i) => (
              <Fragment key={i}>
                {item.type === "node" && <RmqNode {...item} />}
                {item.type === "arrow" && <RmqArrow {...item} />}
              </Fragment>
            ))}
          </div>
        </div>

        {/* Bottom 2-col: message props + code */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <RmqMsgBox props={s.msgProps} />
          <RmqCodeBox title={s.codeTitle} code={s.code} />
        </div>
      </div>
    </div>
  );
}

// ── RabbitMQ Prod Scenario 1: E-commerce Order Processing ────────────────────
function RmqProdEcommerce() {
  const steps = [
  {
      stepLabel: "Topology",
      narTitle: "E-commerce Order Processing Architecture",
      narBody: "Three topic exchanges fan traffic to specialised queues: order.created events route to fulfillment, billing, and analytics workers. DLQ captures failed messages for retry.",
      status: { ok: true, msg: "3 exchanges · 6 queues · DLQ enabled" },
      flow: [
        { type: "node", icon: "🛒", label: "Order API", sub: "producer", role: "producer", active: true },
        { type: "arrow", label: "order.*", active: true, color: "#f97316" },
        { type: "node", icon: "🔀", label: "orders", sub: "topic exchange", role: "exchange", active: true },
        { type: "arrow", label: "routing", active: true, color: "#a855f7" },
        { type: "node", icon: "📋", label: "fulfillment", sub: "durable queue", role: "queue", active: true },
        { type: "arrow", label: "consume", active: true, color: "#22c55e" },
        { type: "node", icon: "⚙️", label: "Worker x3", sub: "prefetch=1", role: "consumer", active: true },
      ],
      msgProps: [
        ["exchange", "orders", "routing_key"],
        ["type", "topic", null],
        ["durable", "True", null],
        ["queues", "fulfillment, billing, analytics", null],
        ["dlx", "orders.dead", "routing_key"],
      ],
      codeTitle: "Exchange & Queue Declaration",
      code: `channel.exchange_declare(
  exchange='orders',
  exchange_type='topic',
  durable=True)

channel.queue_declare(
  queue='fulfillment',
  durable=True,
  arguments={
    'x-dead-letter-exchange': 'orders.dead',
    'x-message-ttl': 3600000
  })

channel.queue_bind(
  exchange='orders',
  queue='fulfillment',
  routing_key='order.created.*')`,
    },
  {
      stepLabel: "Publish",
      narTitle: "Order Published with Routing Key",
      narBody: "The Order API publishes to the 'orders' topic exchange with routing key 'order.created.electronics'. delivery_mode=2 makes the message persistent — it survives a broker restart.",
      status: { ok: true, msg: "Message persisted to disk" },
      flow: [
        { type: "node", icon: "🛒", label: "Order API", sub: "publish()", role: "producer", active: true },
        { type: "arrow", label: "order.created\n.electronics", active: true, color: "#f97316" },
        { type: "node", icon: "🔀", label: "orders", sub: "topic exchange", role: "exchange", active: true },
        { type: "arrow", label: "matching…", active: false, color: "#a855f7" },
        { type: "node", icon: "📋", label: "fulfillment", sub: "durable queue", role: "queue", active: false, dimmed: false },
        { type: "arrow", label: "", active: false, color: "#22c55e" },
        { type: "node", icon: "⚙️", label: "Worker", sub: "waiting", role: "consumer", active: false, dimmed: true },
      ],
      msgProps: [
        ["routing_key", "order.created.electronics", "routing_key"],
        ["delivery_mode", "2 (persistent)", "delivery_mode"],
        ["content_type", "application/json", null],
        ["message_id", "ord-20240316-4891", null],
        ["timestamp", "1710590400", null],
        ["body", '{"order_id":"4891","sku":"E-123"}', null],
      ],
      codeTitle: "Publisher Code",
      code: `channel.basic_publish(
  exchange='orders',
  routing_key='order.created.electronics',
  body=json.dumps(order),
  properties=pika.BasicProperties(
    delivery_mode=2,        # persistent
    content_type='application/json',
    message_id=str(uuid4()),
    timestamp=int(time.time()),
  ))`,
    },
  {
      stepLabel: "Routing",
      narTitle: "Topic Exchange Pattern Matching",
      narBody: "'order.created.electronics' matches 'order.created.*' (fulfillment) AND 'order.#' (analytics). The exchange copies the message to BOTH matching queues — this is fan-out with selectivity.",
      status: { ok: true, msg: "Routed to 2 queues" },
      flow: [
        { type: "node", icon: "🛒", label: "Order API", sub: "published", role: "producer", active: false, dimmed: true },
        { type: "arrow", label: "order.created\n.electronics", active: true, color: "#f97316" },
        { type: "node", icon: "🔀", label: "orders", sub: "matching keys", role: "exchange", active: true },
        { type: "arrow", label: "order.created.*\n✓ match", active: true, color: "#22c55e" },
        { type: "node", icon: "📋", label: "fulfillment", sub: "1 msg queued", role: "queue", active: true },
        { type: "arrow", label: "order.#\n✓ match", active: true, color: "#22c55e" },
        { type: "node", icon: "📊", label: "analytics", sub: "1 msg queued", role: "queue", active: true },
      ],
      msgProps: [
        ["binding: fulfillment", "order.created.*", "routing_key"],
        ["binding: billing",     "order.created.*", "routing_key"],
        ["binding: analytics",   "order.#",         "routing_key"],
        ["match: electronics",   "✓ fulfillment, billing, analytics", null],
        ["copies_made",          "3", null],
      ],
      codeTitle: "Binding Patterns",
      code: `# Bindings registered at startup
bindings = [
  ('fulfillment', 'order.created.*'),
  ('billing',     'order.created.*'),
  ('analytics',   'order.#'),
  ('shipping',    'order.shipped.*'),
  ('refunds',     'order.refunded.#'),
]

for queue, pattern in bindings:
  channel.queue_bind(
    exchange='orders',
    queue=queue,
    routing_key=pattern)`,
    },
  {
      stepLabel: "Fair Dispatch",
      narTitle: "prefetch_count=1 — Fair Worker Dispatch",
      narBody: "Without prefetch, RabbitMQ round-robins blindly — a slow worker gets flooded. With prefetch_count=1, each worker holds at most 1 unacknowledged message, ensuring faster workers do more work.",
      status: { ok: true, msg: "prefetch_count=1 active on all workers" },
      flow: [
        { type: "node", icon: "📋", label: "fulfillment", sub: "5 msgs", role: "queue", active: true },
        { type: "arrow", label: "dispatch", active: true, color: "#3b82f6" },
        { type: "node", icon: "⚙️", label: "Worker 1", sub: "1 in-flight", role: "consumer", active: true },
        { type: "arrow", label: "dispatch", active: true, color: "#3b82f6" },
        { type: "node", icon: "⚙️", label: "Worker 2", sub: "1 in-flight", role: "consumer", active: true },
        { type: "arrow", label: "waiting", active: false, color: "#3b82f6" },
        { type: "node", icon: "⚙️", label: "Worker 3", sub: "idle", role: "consumer", active: false },
      ],
      msgProps: [
        ["prefetch_count", "1", "headers"],
        ["worker_1_status", "processing ord-4891", null],
        ["worker_2_status", "processing ord-4892", null],
        ["worker_3_status", "idle (waiting)", null],
        ["queue_depth",     "3 remaining", null],
      ],
      codeTitle: "Fair Dispatch Setup",
      code: `def start_worker(worker_id):
  channel.basic_qos(
    prefetch_count=1)  # key setting

  def callback(ch, method, props, body):
    order = json.loads(body)
    process_order(order)  # slow work
    ch.basic_ack(
      delivery_tag=method.delivery_tag)

  channel.basic_consume(
    queue='fulfillment',
    on_message_callback=callback)

  channel.start_consuming()`,
    },
  {
      stepLabel: "DLQ",
      narTitle: "Dead Letter Queue — Failed Message Handling",
      narBody: "Payment processing fails for ord-4893 (card declined). After 3 NACK + requeue=False, the message is dead-lettered to orders.dead exchange with original headers preserved for debugging.",
      status: { ok: false, msg: "ord-4893 → DLQ after 3 failures" },
      flow: [
        { type: "node", icon: "📋", label: "billing", sub: "processing", role: "queue", active: true },
        { type: "arrow", label: "nack × 3", active: true, color: "#ef4444" },
        { type: "node", icon: "⚙️", label: "Billing\nWorker", sub: "card declined", role: "consumer", active: true },
        { type: "arrow", label: "dead-letter", active: true, color: "#ef4444", dashed: true },
        { type: "node", icon: "🔀", label: "orders.dead", sub: "DLX exchange", role: "dlq", active: true },
        { type: "arrow", label: "route", active: true, color: "#ef4444" },
        { type: "node", icon: "☠️", label: "billing.dlq", sub: "retry queue", role: "dlq", active: true },
      ],
      msgProps: [
        ["x-death[0].reason",    "rejected",          "routing_key"],
        ["x-death[0].count",     "3",                 null],
        ["x-death[0].queue",     "billing",           null],
        ["x-death[0].exchange",  "orders",            null],
        ["x-original-routing-key","order.created.electronics", "routing_key"],
        ["x-first-death-at",     "2024-03-16T09:42Z", null],
      ],
      codeTitle: "DLQ & Retry Logic",
      code: `# Queue declared with DLX
channel.queue_declare(
  queue='billing',
  durable=True,
  arguments={
    'x-dead-letter-exchange': 'orders.dead',
    'x-dead-letter-routing-key': 'billing.failed',
  })

# Consumer NAKs on failure
def callback(ch, method, props, body):
  try:
    charge_card(json.loads(body))
    ch.basic_ack(method.delivery_tag)
  except PaymentError:
    ch.basic_nack(
      method.delivery_tag,
      requeue=False)   # → DLQ`,
    },
  {
      stepLabel: "Publisher Confirms",
      narTitle: "Publisher Confirms — Guaranteed Delivery",
      narBody: "channel.confirm_delivery() switches the channel to confirm mode. The broker sends a basic.ack once the message is persisted to disk (both exchange + all bound queues). No ack = retry.",
      status: { ok: true, msg: "Ack received — message durable on disk" },
      flow: [
        { type: "node", icon: "🛒", label: "Order API", sub: "confirm mode", role: "producer", active: true },
        { type: "arrow", label: "publish", active: true, color: "#f97316" },
        { type: "node", icon: "🔀", label: "orders", sub: "exchange", role: "exchange", active: true },
        { type: "arrow", label: "persist\nto disk", active: true, color: "#22c55e" },
        { type: "node", icon: "💾", label: "Disk", sub: "durable", role: "queue", active: true },
        { type: "arrow", label: "basic.ack\n←", active: true, color: "#22c55e" },
        { type: "node", icon: "✅", label: "Confirmed", sub: "delivery_tag=1", role: "consumer", active: true },
      ],
      msgProps: [
        ["confirm_mode",   "enabled",         "delivery_mode"],
        ["delivery_tag",   "1",               null],
        ["ack_received",   "True",            null],
        ["nack_received",  "False",           null],
        ["delivery_mode",  "2 (persistent)",  "delivery_mode"],
        ["persisted",      "exchange + queue disk", null],
      ],
      codeTitle: "Publisher Confirms",
      code: `channel.confirm_delivery()

def publish_with_confirm(order):
  channel.basic_publish(
    exchange='orders',
    routing_key='order.created.electronics',
    body=json.dumps(order),
    properties=pika.BasicProperties(
      delivery_mode=2))

  # Block until ack/nack
  if channel.is_open:
    print("✓ Confirmed — message on disk")
  else:
    raise Exception("Nack received — retry")`,
    },
  {
      stepLabel: "Consumer ACK",
      narTitle: "Consumer ACK Flow — At-Least-Once Delivery",
      narBody: "The worker calls basic_ack only AFTER successfully writing to the database. If the worker crashes mid-processing, RabbitMQ re-delivers the message to another worker — guaranteeing no loss.",
      status: { ok: true, msg: "ACK sent — message removed from queue" },
      flow: [
        { type: "node", icon: "📋", label: "fulfillment", sub: "msg in-flight", role: "queue", active: true },
        { type: "arrow", label: "deliver", active: true, color: "#3b82f6" },
        { type: "node", icon: "⚙️", label: "Worker", sub: "processing", role: "consumer", active: true },
        { type: "arrow", label: "DB write\n→ ACK", active: true, color: "#22c55e" },
        { type: "node", icon: "🗄️", label: "Database", sub: "committed", role: "queue", active: true },
        { type: "arrow", label: "basic_ack\n←", active: true, color: "#22c55e" },
        { type: "node", icon: "🗑️", label: "Deleted", sub: "from queue", role: "consumer", active: true },
      ],
      msgProps: [
        ["delivery_tag",   "42",               null],
        ["redelivered",    "False",            null],
        ["ack_mode",       "manual",           "delivery_mode"],
        ["db_write",       "SUCCESS",          "routing_key"],
        ["basic_ack",      "delivery_tag=42",  null],
        ["queue_depth",    "4 remaining",      null],
      ],
      codeTitle: "Manual ACK Pattern",
      code: `def callback(ch, method, props, body):
  order = json.loads(body)
  try:
    # 1. Process (may take time)
    result = fulfill_order(order)

    # 2. Write to DB atomically
    db.save_fulfillment(result)

    # 3. ACK only on success
    ch.basic_ack(
      delivery_tag=method.delivery_tag)

  except Exception as e:
    # NACK with requeue for retry
    ch.basic_nack(
      delivery_tag=method.delivery_tag,
      requeue=True)`,
    },
  ];
  return <RmqScenarioShell title="E-commerce Order Processing" steps={steps} />;
}

// ── RabbitMQ Prod Scenario 2: Financial Event Sourcing ───────────────────────
function RmqProdFintech() {
  const steps = [
  {
      stepLabel: "Topology",
      narTitle: "Financial Event Sourcing Architecture",
      narBody: "A headers exchange routes trade events by asset class and region. Compliance, risk, and audit services subscribe with independent queues. All messages are persistent with mandatory routing.",
      status: { ok: true, msg: "Headers exchange · persistent · mandatory=True" },
      flow: [
        { type: "node", icon: "💹", label: "Trade Engine", sub: "producer", role: "producer", active: true },
        { type: "arrow", label: "headers", active: true, color: "#f97316" },
        { type: "node", icon: "🔀", label: "trades", sub: "headers exchange", role: "exchange", active: true },
        { type: "arrow", label: "x-match: all", active: true, color: "#a855f7" },
        { type: "node", icon: "📋", label: "compliance", sub: "durable", role: "queue", active: true },
        { type: "arrow", label: "consume", active: true, color: "#22c55e" },
        { type: "node", icon: "🔍", label: "Compliance Svc", sub: "audit", role: "consumer", active: true },
      ],
      msgProps: [
        ["exchange_type",  "headers",          "headers"],
        ["x-match",        "all",              null],
        ["asset_class",    "equity",           "routing_key"],
        ["region",         "US",               null],
        ["mandatory",      "True",             "delivery_mode"],
        ["durable",        "True",             null],
      ],
      codeTitle: "Headers Exchange Declaration",
      code: `channel.exchange_declare(
  exchange='trades',
  exchange_type='headers',
  durable=True)

# Compliance binds on equity + US
channel.queue_bind(
  exchange='trades',
  queue='compliance',
  arguments={
    'x-match': 'all',    # ALL headers must match
    'asset_class': 'equity',
    'region': 'US',
  })

# Risk binds on any high-value
channel.queue_bind(
  exchange='trades',
  queue='risk',
  arguments={
    'x-match': 'any',    # ANY header matches
    'notional_usd': 'large',
  })`,
    },
  {
      stepLabel: "Persistent Msg",
      narTitle: "Persistent Messages with Mandatory Flag",
      narBody: "mandatory=True ensures the broker returns an Unroutable error if no queue matches the headers. This prevents silent data loss — critical in financial systems where every trade must be audited.",
      status: { ok: true, msg: "Routed to compliance + risk queues" },
      flow: [
        { type: "node", icon: "💹", label: "Trade Engine", sub: "SELL AAPL", role: "producer", active: true },
        { type: "arrow", label: "mandatory\npublish", active: true, color: "#f97316" },
        { type: "node", icon: "🔀", label: "trades", sub: "headers match", role: "exchange", active: true },
        { type: "arrow", label: "matched\n✓", active: true, color: "#22c55e" },
        { type: "node", icon: "📋", label: "compliance", sub: "persisted", role: "queue", active: true },
        { type: "arrow", label: "", active: true, color: "#22c55e" },
        { type: "node", icon: "📋", label: "risk", sub: "persisted", role: "queue", active: true },
      ],
      msgProps: [
        ["asset_class",    "equity",           "routing_key"],
        ["region",         "US",               null],
        ["notional_usd",   "large",            "headers"],
        ["trade_id",       "TRD-20240316-991", null],
        ["delivery_mode",  "2 (persistent)",   "delivery_mode"],
        ["mandatory",      "True",             null],
      ],
      codeTitle: "Mandatory Publish",
      code: `# Return handler for unrouted messages
def on_return(ch, method, props, body):
  alert_ops(f"UNROUTED: {body}")

channel.add_on_return_callback(on_return)

channel.basic_publish(
  exchange='trades',
  routing_key='',       # ignored by headers exchange
  mandatory=True,       # error if unroutable
  body=json.dumps(trade),
  properties=pika.BasicProperties(
    delivery_mode=2,
    headers={
      'asset_class': 'equity',
      'region': 'US',
      'notional_usd': 'large',
      'trade_id': trade['id'],
    }))`,
    },
  {
      stepLabel: "Tx & Confirms",
      narTitle: "AMQP Transactions vs Publisher Confirms",
      narBody: "For exactly-once publish semantics, choose between AMQP transactions (slower, atomic) or publisher confirms (async, higher throughput). For high-frequency trading, confirms are preferred.",
      status: { ok: true, msg: "Confirms: 1200 msg/s vs Tx: 80 msg/s" },
      flow: [
        { type: "node", icon: "💹", label: "Trade Engine", sub: "confirm mode", role: "producer", active: true },
        { type: "arrow", label: "batch\npublish", active: true, color: "#f97316" },
        { type: "node", icon: "🔀", label: "trades", sub: "exchange", role: "exchange", active: true },
        { type: "arrow", label: "batch ack\n←", active: true, color: "#22c55e" },
        { type: "node", icon: "✅", label: "Confirmed", sub: "1200/s", role: "consumer", active: true },
        { type: "arrow", label: "vs tx", active: false, color: "#ef4444" },
        { type: "node", icon: "🐢", label: "Tx Mode", sub: "80/s", role: "dlq", active: false, dimmed: true },
      ],
      msgProps: [
        ["mode",             "publisher_confirms", "routing_key"],
        ["throughput",       "1200 msg/s",        null],
        ["latency",          "~0.8ms avg",        null],
        ["batch_size",       "100 messages",      "headers"],
        ["outstanding_acks", "0",                 null],
      ],
      codeTitle: "Async Confirms with Coroutine",
      code: `channel.confirm_delivery()
pending = {}

def on_ack(delivery_tag, multiple):
  if multiple:
    for tag in list(pending):
      if tag <= delivery_tag:
        pending.pop(tag).set_result(True)
  else:
    pending.pop(delivery_tag, None)

channel.add_on_ack_callback(on_ack)
channel.add_on_nack_callback(
  lambda tag, mult: on_nack(tag, mult))

# Publish batch asynchronously
for trade in batch:
  fut = asyncio.Future()
  tag = channel.basic_publish(...)
  pending[tag] = fut`,
    },
  {
      stepLabel: "Priority Queue",
      narTitle: "Priority Queue for Regulatory Alerts",
      narBody: "Regulatory trade alerts use a priority queue (x-max-priority=10). A PRIORITY_10 Reg-NMS violation message skips ahead of thousands of normal audit messages.",
      status: { ok: true, msg: "Priority 10 msg consumed first" },
      flow: [
        { type: "node", icon: "🚨", label: "Risk Engine", sub: "priority=10", role: "producer", active: true },
        { type: "arrow", label: "high priority\npublish", active: true, color: "#ef4444" },
        { type: "node", icon: "📋", label: "compliance\n(priority)", sub: "x-max-priority=10", role: "queue", active: true },
        { type: "arrow", label: "reorder\n→ front", active: true, color: "#ef4444" },
        { type: "node", icon: "⚙️", label: "Compliance\nWorker", sub: "priority pop", role: "consumer", active: true },
        { type: "arrow", label: "process\n→", active: true, color: "#22c55e" },
        { type: "node", icon: "🔍", label: "Reg Alert\nHandler", sub: "< 10ms SLA", role: "consumer", active: true },
      ],
      msgProps: [
        ["priority",         "10 (max)",         "routing_key"],
        ["x-max-priority",   "10",               "headers"],
        ["queue_depth",       "4200 msgs",       null],
        ["position_after_insert", "front",       "delivery_mode"],
        ["consume_order",    "priority-first",   null],
      ],
      codeTitle: "Priority Queue",
      code: `# Declare queue with priority support
channel.queue_declare(
  queue='compliance',
  durable=True,
  arguments={
    'x-max-priority': 10  # 0-10 range
  })

# Publish high-priority alert
channel.basic_publish(
  exchange='trades',
  routing_key='compliance',
  body=json.dumps(violation),
  properties=pika.BasicProperties(
    priority=10,          # jumps to front
    delivery_mode=2,
    expiration='10000',   # 10s TTL
  ))`,
    },
  {
      stepLabel: "TTL & Expiry",
      narTitle: "Message TTL — Time-Sensitive Market Data",
      narBody: "Market data quotes expire quickly. x-message-ttl=500ms ensures stale price quotes are dropped from the queue rather than processed by a downstream service with outdated data.",
      status: { ok: true, msg: "Expired messages discarded silently" },
      flow: [
        { type: "node", icon: "📈", label: "Market Feed", sub: "TTL=500ms", role: "producer", active: true },
        { type: "arrow", label: "publish\n+TTL", active: true, color: "#f97316" },
        { type: "node", icon: "📋", label: "quotes", sub: "TTL queue", role: "queue", active: true },
        { type: "arrow", label: "expired\n→ DLX", active: true, color: "#ef4444", dashed: true },
        { type: "node", icon: "☠️", label: "quotes.dlq", sub: "expired msgs", role: "dlq", active: true },
        { type: "arrow", label: "fresh\n→ process", active: true, color: "#22c55e" },
        { type: "node", icon: "⚙️", label: "Pricer", sub: "< 500ms only", role: "consumer", active: true },
      ],
      msgProps: [
        ["x-message-ttl",  "500 (ms)",       "headers"],
        ["x-dead-letter-exchange", "quotes.expired", null],
        ["msg_age_at_consume", "320ms",       null],
        ["msg_status",      "FRESH",          "routing_key"],
        ["expired_count",   "14 in last min", null],
      ],
      codeTitle: "Per-Queue and Per-Message TTL",
      code: `# Per-queue TTL (affects all messages)
channel.queue_declare(
  queue='quotes',
  arguments={
    'x-message-ttl': 500,  # 500ms
    'x-dead-letter-exchange': 'quotes.expired',
  })

# Per-message TTL (overrides queue TTL)
channel.basic_publish(
  exchange='market',
  routing_key='quotes',
  body=json.dumps(quote),
  properties=pika.BasicProperties(
    expiration='200',    # 200ms this msg
    delivery_mode=1,     # non-persistent ok
  ))`,
    },
  {
      stepLabel: "Audit Stream",
      narTitle: "Audit Trail with Shovel + Remote Archival",
      narBody: "The Shovel plugin forwards a copy of every compliance queue message to a long-term S3-backed audit broker over federation. This creates a tamper-resistant append-only audit log.",
      status: { ok: true, msg: "Shovel active — 0 message loss" },
      flow: [
        { type: "node", icon: "📋", label: "compliance", sub: "primary", role: "queue", active: true },
        { type: "arrow", label: "shovel\nplugin", active: true, color: "#3b82f6", dashed: true },
        { type: "node", icon: "🔀", label: "audit.broker", sub: "remote cluster", role: "exchange", active: true },
        { type: "arrow", label: "persist", active: true, color: "#3b82f6" },
        { type: "node", icon: "📦", label: "audit.archive", sub: "S3-backed", role: "cluster", active: true },
        { type: "arrow", label: "index", active: true, color: "#06b6d4" },
        { type: "node", icon: "🔍", label: "Audit API", sub: "query/replay", role: "consumer", active: true },
      ],
      msgProps: [
        ["plugin",          "rabbitmq_shovel", "headers"],
        ["src-queue",       "compliance",      null],
        ["dest-uri",        "amqp://audit-broker:5672", null],
        ["dest-exchange",   "audit.archive",   "routing_key"],
        ["ack-mode",        "on-confirm",      "delivery_mode"],
        ["shovel-name",     "compliance-archive", null],
      ],
      codeTitle: "Shovel Config (rabbitmq.conf)",
      code: `## rabbitmq.conf — Shovel plugin
shovel.compliance_archive.src-uri  = amqp://
shovel.compliance_archive.src-queue = compliance
shovel.compliance_archive.dest-uri  = amqp://audit.broker.internal
shovel.compliance_archive.dest-exchange = audit.archive
shovel.compliance_archive.ack-mode  = on-confirm
shovel.compliance_archive.reconnect-delay = 5

## Enable plugin:
## rabbitmq-plugins enable rabbitmq_shovel
## rabbitmq-plugins enable rabbitmq_shovel_management`,
    },
  ];
  return <RmqScenarioShell title="Financial Event Sourcing" steps={steps} />;
}

// ── RabbitMQ Prod Scenario 3: High-Availability Cluster ──────────────────────
function RmqProdHA() {
  const steps = [
  {
      stepLabel: "Cluster Setup",
      narTitle: "3-Node RabbitMQ Cluster Topology",
      narBody: "Three nodes form a cluster sharing metadata (exchanges, bindings, users) but NOT queue data by default. Classic mirrored queues or Quorum queues distribute message data for HA.",
      status: { ok: true, msg: "Cluster: 3 nodes · Quorum queues enabled" },
      flow: [
        { type: "node", icon: "🔄", label: "HAProxy", sub: "load balancer", role: "producer", active: true },
        { type: "arrow", label: "round-robin", active: true, color: "#06b6d4" },
        { type: "node", icon: "🐰", label: "rabbit@node1", sub: "leader", role: "cluster", active: true },
        { type: "arrow", label: "replicate", active: true, color: "#3b82f6" },
        { type: "node", icon: "🐰", label: "rabbit@node2", sub: "follower", role: "cluster", active: true },
        { type: "arrow", label: "replicate", active: true, color: "#3b82f6" },
        { type: "node", icon: "🐰", label: "rabbit@node3", sub: "follower", role: "cluster", active: true },
      ],
      msgProps: [
        ["cluster_name",    "prod-rabbit-cluster", null],
        ["nodes",           "node1, node2, node3", "routing_key"],
        ["queue_type",      "quorum",              "headers"],
        ["min_quorum_size", "2",                   null],
        ["ha_policy",       "all",                 null],
        ["total_queues",    "12 mirrored",         null],
      ],
      codeTitle: "Cluster Join Commands",
      code: `## On node2 & node3:
rabbitmqctl stop_app
rabbitmqctl reset
rabbitmqctl join_cluster rabbit@node1
rabbitmqctl start_app

## Verify cluster status:
rabbitmqctl cluster_status

## Create quorum queue via API:
curl -u admin:pass \\
  -X PUT http://node1:15672/api/queues/%2F/orders \\
  -d '{"durable":true,
       "arguments":{"x-queue-type":"quorum"}}'`,
    },
  {
      stepLabel: "Quorum Queue",
      narTitle: "Quorum Queues — Raft-Based Replication",
      narBody: "Quorum queues use the Raft consensus algorithm. A message is confirmed only after a majority (quorum) of replicas have persisted it. This guarantees no data loss even on a single node failure.",
      status: { ok: true, msg: "Raft quorum reached — message durable" },
      flow: [
        { type: "node", icon: "🛒", label: "Producer", sub: "publish", role: "producer", active: true },
        { type: "arrow", label: "write", active: true, color: "#f97316" },
        { type: "node", icon: "🐰", label: "node1\n(leader)", sub: "Raft leader", role: "cluster", active: true },
        { type: "arrow", label: "replicate\n→", active: true, color: "#3b82f6" },
        { type: "node", icon: "🐰", label: "node2", sub: "follower ✓", role: "cluster", active: true },
        { type: "arrow", label: "replicate\n→", active: true, color: "#3b82f6" },
        { type: "node", icon: "🐰", label: "node3", sub: "follower ✓", role: "cluster", active: true },
      ],
      msgProps: [
        ["queue_type",       "quorum",               "headers"],
        ["raft_state",       "leader=node1",         "routing_key"],
        ["quorum_size",      "3 nodes",              null],
        ["writes_confirmed", "2/3 (quorum met)",     "delivery_mode"],
        ["msg_acked",        "True",                 null],
        ["data_safety",      "survives 1 node loss", null],
      ],
      codeTitle: "Declare Quorum Queue",
      code: `# Quorum queue: preferred for HA
channel.queue_declare(
  queue='orders',
  durable=True,
  arguments={
    'x-queue-type': 'quorum',
    # optional: minimum replicas
    'x-quorum-initial-group-size': 3,
    # dead-lettering still works
    'x-dead-letter-exchange': 'orders.dead',
  })

# Consumer with manual ACK (required for quorum)
channel.basic_qos(prefetch_count=10)
channel.basic_consume(
  queue='orders',
  auto_ack=False,
  on_message_callback=callback)`,
    },
  {
      stepLabel: "Node Failure",
      narTitle: "Node Failure — Automatic Leader Election",
      narBody: "node1 crashes. The Raft protocol elects node2 as the new leader within ~5 seconds. Consumers reconnect via HAProxy; no messages are lost because node2 already has all committed data.",
      status: { ok: false, msg: "node1 down → node2 elected leader in 4.2s" },
      flow: [
        { type: "node", icon: "💀", label: "node1", sub: "CRASHED", role: "dlq", active: false, dimmed: true },
        { type: "arrow", label: "election\n↓", active: true, color: "#f59e0b" },
        { type: "node", icon: "👑", label: "node2\n(NEW leader)", sub: "Raft elected", role: "cluster", active: true },
        { type: "arrow", label: "sync", active: true, color: "#3b82f6" },
        { type: "node", icon: "🐰", label: "node3", sub: "follower", role: "cluster", active: true },
        { type: "arrow", label: "reconnect", active: true, color: "#22c55e" },
        { type: "node", icon: "⚙️", label: "Consumers", sub: "reconnecting", role: "consumer", active: true },
      ],
      msgProps: [
        ["failed_node",      "rabbit@node1",          "routing_key"],
        ["election_trigger", "heartbeat timeout",     null],
        ["new_leader",       "rabbit@node2",          "delivery_mode"],
        ["election_time",    "4.2 seconds",           null],
        ["messages_lost",    "0 (quorum guaranteed)", "headers"],
        ["consumer_downtime","< 5 seconds",           null],
      ],
      codeTitle: "Connection Failover (pika)",
      code: `import pika

# Multi-host connection string
params = pika.ConnectionParameters(
  host='haproxy.internal',
  port=5672,
  heartbeat=30,
  blocked_connection_timeout=300,
  connection_attempts=3,
  retry_delay=2)

def connect_with_retry():
  while True:
    try:
      conn = pika.BlockingConnection(params)
      return conn.channel()
    except pika.exceptions.AMQPConnectionError:
      time.sleep(2)
      continue  # HAProxy retries next node`,
    },
  {
      stepLabel: "Rolling Upgrade",
      narTitle: "Zero-Downtime Rolling Upgrade",
      narBody: "RabbitMQ supports rolling upgrades one node at a time. Drain the node (remove from LB), upgrade, restart, re-join cluster. Quorum queues maintain availability as long as majority is up.",
      status: { ok: true, msg: "node3 upgraded — 0 message loss, 0 downtime" },
      flow: [
        { type: "node", icon: "🔄", label: "HAProxy", sub: "drain node3", role: "producer", active: true },
        { type: "arrow", label: "remove\nfrom LB", active: true, color: "#f59e0b" },
        { type: "node", icon: "⬆️", label: "node3", sub: "upgrading", role: "exchange", active: true },
        { type: "arrow", label: "traffic\n→ 1 & 2", active: true, color: "#22c55e" },
        { type: "node", icon: "🐰", label: "node1+2", sub: "active", role: "cluster", active: true },
        { type: "arrow", label: "re-add\nto LB", active: true, color: "#22c55e" },
        { type: "node", icon: "✅", label: "node3 v3.13", sub: "rejoined", role: "cluster", active: true },
      ],
      msgProps: [
        ["upgrade_strategy",  "rolling",              "routing_key"],
        ["current_version",   "3.12.13",              null],
        ["target_version",    "3.13.2",               null],
        ["active_nodes_during_upgrade", "2/3",        "headers"],
        ["quorum_maintained", "True (2 > 3/2)",       "delivery_mode"],
        ["downtime",          "0 ms",                 null],
      ],
      codeTitle: "Rolling Upgrade Steps",
      code: `## Step 1: Drain node3 from HAProxy
## (remove from backend pool)

## Step 2: Stop node3 gracefully
rabbitmqctl drain          # no new connections
rabbitmqctl stop_app

## Step 3: Upgrade package
apt-get install rabbitmq-server=3.13.2

## Step 4: Start & re-join
rabbitmqctl start_app

## Step 5: Verify cluster health
rabbitmqctl cluster_status
rabbitmqctl list_queues name \
  messages consumers synchronised_slave_pids

## Step 6: Re-add to HAProxy`,
    },
  {
      stepLabel: "Monitoring",
      narTitle: "Production Monitoring — Prometheus + Grafana",
      narBody: "The rabbitmq_prometheus plugin exposes /metrics. Key SLOs: queue depth < 10k, consumer utilisation > 0.8, memory < 70% of watermark, disk free > 5GB. Alert on any breach.",
      status: { ok: true, msg: "All SLOs green — cluster healthy" },
      flow: [
        { type: "node", icon: "🐰", label: "RabbitMQ\nCluster", sub: ":15692/metrics", role: "cluster", active: true },
        { type: "arrow", label: "scrape\n15s", active: true, color: "#f97316" },
        { type: "node", icon: "📊", label: "Prometheus", sub: "time-series", role: "exchange", active: true },
        { type: "arrow", label: "query", active: true, color: "#3b82f6" },
        { type: "node", icon: "📈", label: "Grafana", sub: "dashboard", role: "queue", active: true },
        { type: "arrow", label: "alert", active: true, color: "#ef4444" },
        { type: "node", icon: "🔔", label: "PagerDuty", sub: "on-call", role: "consumer", active: true },
      ],
      msgProps: [
        ["plugin",           "rabbitmq_prometheus", "headers"],
        ["scrape_port",      "15692",               null],
        ["key_metric_1",     "rabbitmq_queue_messages < 10000", "routing_key"],
        ["key_metric_2",     "rabbitmq_queue_consumer_utilisation > 0.8", null],
        ["key_metric_3",     "rabbitmq_node_mem_used < 70%", null],
        ["alert_channel",    "PagerDuty + Slack",   null],
      ],
      codeTitle: "Prometheus Alert Rules",
      code: `# prometheus-alerts.yml
groups:
- name: rabbitmq
  rules:
  - alert: HighQueueDepth
    expr: rabbitmq_queue_messages > 10000
    for: 2m
    labels: { severity: warning }
    annotations:
      summary: "Queue depth > 10k"

  - alert: LowConsumerUtilisation
    expr: rabbitmq_queue_consumer_utilisation < 0.5
    for: 5m
    labels: { severity: critical }

  - alert: MemoryWatermark
    expr: rabbitmq_node_mem_used /
      rabbitmq_node_mem_limit > 0.7
    for: 1m
    labels: { severity: critical }`,
    },
  ];
  return <RmqScenarioShell title="High-Availability Cluster" steps={steps} />;
}

// ── RabbitMQ Production Lab tab selector ────────────────────────────────────
function RabbitMQProductionLab() {
  const [tab, setTab] = useState(0);
  const tabs = [
    { label: "🛒 E-commerce Pipeline", comp: RmqProdEcommerce },
    { label: "💹 Financial Event Sourcing", comp: RmqProdFintech },
    { label: "🔄 HA Cluster", comp: RmqProdHA },
  ];
  const Active = tabs[tab].comp;
  return (
    <div style={{ marginTop: 40 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#f97316", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Production Grade</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", letterSpacing: -0.4, marginBottom: 4 }}>RabbitMQ in Production</div>
        <div style={{ fontSize: 15, color: "#64748b" }}>Real-world architectures with step-by-step message flow, AMQP properties, and Python code for each scenario.</div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {tabs.map((t, i) => (
          <button key={i} onClick={() => setTab(i)} style={{
            padding: "8px 18px", borderRadius: 10, fontSize: 15, fontWeight: i === tab ? 700 : 500, cursor: "pointer",
            background: i === tab ? "#f9731620" : "#ffffff",
            border: `1px solid ${i === tab ? "#f97316" : "#e8edf4"}`,
            color: i === tab ? "#f97316" : "#64748b",
            transition: "all 0.15s",
          }}>
            {t.label}
          </button>
        ))}
      </div>
      <Active />
    </div>
  );
}

// ── Scenario 1: E-commerce Checkout Platform (8 detailed steps) ───────────────
function ProdEcommerce() {
  const C = "#0ea5e9";
  const STEPS = [
  {
      title: "Service Mesh Topology — 6 services, every pod Envoy-injected",
      hops: [
        { name: "Browser", sub: "user agent", color: "#64748b", active: true },
        { name: "Ingress GW", sub: "istio-ingress", color: C, active: true, sidecarAction: "TLS + JWT", sidecarNote: ":443 listener" },
        { name: "Frontend", sub: ":8080", color: C, active: true, sidecarAction: "iptables :15001", sidecarNote: "outbound capture" },
        { name: "Cart", sub: ":9090", color: "#22c55e", active: true, sidecarAction: "iptables :15006", sidecarNote: "inbound capture" },
        { name: "Payment v1", sub: "stable", color: "#22c55e", active: true, sidecarAction: "iptables :15001" },
        { name: "Order", sub: ":9090", color: "#818cf8", active: true, sidecarAction: "iptables :15001" },
      ],
      arrows: [
        { label: "HTTPS :443", active: true, color: C },
        { label: "HTTP/2", active: true, color: C },
        { label: "mTLS", active: true, color: "#22c55e", proto: ":15001→:15006" },
        { label: "mTLS", active: true, color: "#22c55e" },
        { label: "mTLS", active: true, color: "#22c55e" },
      ],
      chain: null, yaml: null, headers: null,
      narTitle: "How Envoy enters every pod",
      narBody: "The istio-init init container runs iptables rules before the app starts: all outbound TCP is redirected to Envoy :15001, all inbound to :15006. The app binds normally to :8080/:9090 — it never sees raw TCP. Istiod pushes xDS config (Listeners, Routes, Clusters, Endpoints) to each Envoy over gRPC. The entire mesh config is delivered in under 1 second after a pod starts.",
    },
  {
      title: "iptables REDIRECT — how every sidecar captures traffic transparently",
      hops: [
        { name: "App :8080", sub: "frontend", color: "#0284c7", active: true },
        { name: "iptables", sub: "OUTPUT chain", color: "#f59e0b", active: true, sidecarAction: "REDIRECT :15001", sidecarNote: "all TCP except uid 1337" },
        { name: "Envoy :15001", sub: "virt outbound", color: C, active: true, sidecarAction: "xDS route lookup", sidecarNote: "original dst preserved" },
        { name: "Cart Envoy", sub: "inbound :15006", color: "#22c55e", active: true, sidecarAction: "PREROUTING", sidecarNote: "verify SPIFFE cert" },
        { name: "Cart App", sub: ":9090", color: "#22c55e", active: true },
      ],
      arrows: [
        { label: "plain HTTP", active: true, color: "#f59e0b" },
        { label: "all :15001", active: true, color: C },
        { label: "mTLS TCP", active: true, color: "#22c55e", proto: "HBONE" },
        { label: ":9090", active: true, color: "#22c55e" },
      ],
      chain: {
        active: 2,
        filters: [
          { name: "iptables OUTPUT rule (outbound capture)", detail: "-p tcp ! --dport 15001 -m owner ! --uid-owner 1337 -j REDIRECT --to-port 15001  (uid 1337 = Envoy itself, prevents redirect loop)" },
          { name: "iptables PREROUTING rule (inbound capture)", detail: "-p tcp -j REDIRECT --to-port 15006  (all inbound TCP to the pod is captured before the app sees it)" },
          { name: "Envoy Virtual Outbound Listener :15001", detail: "SO_ORIGINAL_DST socket option recovers original IP:port. Looks up matching Cluster from xDS RDS (e.g. outbound|9090||cart.istio-demo.svc.cluster.local)." },
          { name: "TLS origination → Cart :15006", detail: "Envoy presents SPIFFE SVID cert (from SDS). Cart Envoy verifies cert chain and SPIFFE URI SAN before accepting." },
        ],
      },
      yaml: `# iptables rules injected by istio-init container
# Outbound: capture all TCP except Envoy itself (uid 1337)
iptables -t nat -A OUTPUT -p tcp \\
  ! --dport 15001 \\
  -m owner ! --uid-owner 1337 \\
  -j REDIRECT --to-port 15001

# Inbound: capture all inbound TCP
iptables -t nat -A PREROUTING -p tcp \\
  -j REDIRECT --to-port 15006`,
      headers: [
        { k: "x-envoy-original-dst-host", v: "cart.istio-demo:9090", badge: "NEW" },
        { k: "x-b3-traceid", v: "a3f4b2c1d5e6f7a8", badge: "NEW" },
        { k: "x-b3-spanid", v: "b2c3d4e5", badge: "NEW" },
        { k: "x-b3-sampled", v: "1", badge: "NEW" },
      ],
      narTitle: "How iptables makes the sidecar completely transparent",
      narBody: "The istio-init init container installs NAT rules before any app traffic flows. Every outbound connection from the app (attempting to connect to cart:9090) is transparently redirected to Envoy :15001. Envoy uses the SO_ORIGINAL_DST socket option to recover the original destination and look up the correct xDS cluster. The app code in Frontend calls cart:9090 normally — it has no idea Envoy is in the path. No app code changes, no env vars, no proxy settings.",
    },
  {
      title: "JWT Auth Filter — validating the Bearer token at the Ingress edge",
      hops: [
        { name: "Browser", sub: "Authorization: Bearer eyJ...", color: "#64748b", active: true },
        { name: "Ingress GW", sub: "istio-ingressgateway", color: C, active: true, sidecarAction: "JWT Auth Filter", sidecarNote: "JWKS RS256 verify" },
        { name: "Frontend", sub: "v1", color: C, active: true },
        { name: "Cart", sub: "v1", color: "#22c55e", active: false, dim: true },
        { name: "Payment", sub: "v1", color: "#22c55e", active: false, dim: true },
      ],
      arrows: [
        { label: "Bearer eyJ...", active: true, color: C },
        { label: "x-jwt-payload injected", active: true, color: "#22c55e" },
        { label: "", active: false },
        { label: "", active: false },
      ],
      chain: {
        active: 1,
        filters: [
          { name: "TLS Inspector", detail: "Terminates TLS 1.3. Extracts SNI: shop.example.com. Decrypts payload." },
          { name: "JWT Auth Filter", detail: "Fetches JWKS from issuer URL (cached 5m). Verifies RS256 signature. Validates exp/nbf/aud claims. Extracts {sub, email, role} into Envoy dynamic metadata for AuthzPolicy." },
          { name: "HTTP Connection Manager", detail: "Applies VirtualService routing rules. Selects upstream cluster: Frontend." },
          { name: "Router", detail: "Forwards to Frontend pod via mTLS." },
        ],
      },
      yaml: `# RequestAuthentication — JWT filter config
apiVersion: security.istio.io/v1beta1
kind: RequestAuthentication
metadata: {name: shop-jwt}
spec:
  selector:
    matchLabels: {istio: ingressgateway}
  jwtRules:
  - issuer: "https://accounts.google.com"
    jwksUri: "https://googleapis.com/oauth2/v3/certs"
    forwardOriginalToken: false`,
      headers: [
        { k: "Authorization", v: "Bearer eyJhbGciOiJSUzI1NiJ9..." },
        { k: "Host", v: "shop.example.com" },
        { k: "x-jwt-payload", v: '{"sub":"user123","email":"r@x.com","role":"user"}', badge: "NEW" },
        { k: "x-forwarded-proto", v: "https", badge: "SET" },
        { k: "Authorization", v: "(removed — forwardOriginalToken:false)", badge: "DEL" },
      ],
      status: "200 OK (JWT valid)",
      narTitle: "How JWT validation works inside Envoy — before any app code runs",
      narBody: "The JWT Auth filter intercepts the request before routing. It fetches the JWKS (public keys) from the issuer URL — cached with a 5-minute TTL, so latency is ~0 on cache hit. It verifies the RS256 signature, checks exp/nbf/aud claims. On success, it extracts the JWT payload into Envoy dynamic metadata (request.auth.claims). Downstream AuthorizationPolicy can then match against request.auth.claims[role]. If the token is missing or invalid: 401 Jwt verification fails — the request never touches the app.",
    },
  {
      title: "mTLS Handshake — SPIFFE certificate exchange between sidecars",
      hops: [
        { name: "Frontend", sub: "plain HTTP out", color: C, active: true },
        { name: "Frontend Envoy", sub: "outbound :15001", color: C, active: true, sidecarAction: "TLS originate", sidecarNote: "SDS cert from Istiod" },
        { name: "Cart Envoy", sub: "inbound :15006", color: "#22c55e", active: true, sidecarAction: "TLS terminate", sidecarNote: "verify SPIFFE peer URI" },
        { name: "Cart App", sub: ":9090 plain", color: "#22c55e", active: true },
      ],
      arrows: [
        { label: "plain HTTP", active: true, color: "#64748b" },
        { label: "TLS 1.3 / mTLS", active: true, color: "#22c55e", proto: "SPIFFE SVIDs" },
        { label: "plain HTTP", active: true, color: "#22c55e" },
      ],
      chain: {
        active: 1,
        filters: [
          { name: "SDS (Secret Discovery Service)", detail: "Envoy calls Istiod SDS gRPC API to receive X.509 SVID. Cert SAN = spiffe://cluster.local/ns/istio-demo/sa/frontend. Refreshed 1h before expiry." },
          { name: "TLS 1.3 mTLS Handshake", detail: "Frontend Envoy presents SVID. Cart Envoy verifies cert chain against mesh trust bundle. Both verify SAN URI matches expected SPIFFE identity. Handshake: ~1ms." },
          { name: "XFCC Header injection", detail: "x-forwarded-client-cert injected: By=spiffe://…/sa/cart;URI=spiffe://…/sa/frontend;Hash=sha256:3f4a…" },
          { name: "AuthorizationPolicy check", detail: "Source principal verified against policy. source.principal='cluster.local/ns/istio-demo/sa/frontend' matches ALLOW rule." },
        ],
      },
      yaml: `# PeerAuthentication — STRICT mTLS for namespace
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata: {name: strict-mtls, namespace: istio-demo}
spec:
  mtls: {mode: STRICT}  # Reject ALL plaintext

---
# DestinationRule — originate mTLS to Cart
spec:
  host: cart
  trafficPolicy:
    tls: {mode: ISTIO_MUTUAL}`,
      headers: [
        { k: "x-forwarded-client-cert", v: "By=spiffe://cluster.local/ns/istio-demo/sa/cart;URI=spiffe://cluster.local/ns/istio-demo/sa/frontend;Hash=sha256:3f4a…", badge: "NEW" },
        { k: "x-b3-traceid", v: "a3f4b2c1d5e6f7a8" },
        { k: "x-b3-spanid", v: "c4d5e6f7", badge: "SET" },
      ],
      narTitle: "How mTLS works without touching application code",
      narBody: "Istiod is the mesh Certificate Authority. Each Envoy sidecar calls the SDS gRPC API at startup to receive its X.509 SVID — a cert whose Subject Alternative Name (SAN) is a SPIFFE URI encoding the pod's namespace and ServiceAccount: spiffe://cluster.local/ns/istio-demo/sa/frontend. On every outbound connection, Envoy automatically presents this cert and verifies the peer cert. The app sends/receives plain HTTP internally — it has no idea TLS is happening. The XFCC (x-forwarded-client-cert) header makes the verified peer identity available to the app and AuthorizationPolicy.",
    },
  {
      title: "Outlier Detection — Circuit Breaker ejecting a failing Product pod",
      hops: [
        { name: "Frontend", sub: "GET /product", color: C, active: true },
        { name: "Product pod-1", sub: "healthy ✓", color: "#22c55e", active: false, dim: true },
        { name: "Product pod-2", sub: "5xx × 3", color: "#ef4444", active: true, warn: true, sidecarAction: "EJECTED 30s", sidecarNote: "consecutiveErrors=3 hit" },
        { name: "Product pod-3", sub: "healthy ✓", color: "#22c55e", active: true, sidecarAction: "re-routed here" },
      ],
      arrows: [
        { label: "EDS cluster", active: true, color: C },
        { label: "pod-2 ejected", active: true, color: "#ef4444", blocked: true },
        { label: "retry → pod-3", active: true, color: "#22c55e" },
      ],
      chain: {
        active: 1,
        filters: [
          { name: "EDS Cluster: product", detail: "Endpoints: pod-1 IP:9090 (HEALTHY), pod-2 IP:9090 (UNHEALTHY — ejected), pod-3 IP:9090 (HEALTHY). LB skips ejected endpoints." },
          { name: "Outlier Detection", detail: "consecutive5xxErrors: 3 reached for pod-2. Ejected from LB for baseEjectionTime=30s. Envoy tracks health per individual endpoint (IP:port), not per pod label." },
          { name: "Retry Filter", detail: "retryOn: 5xx. Attempt 2/3: pod-2 skipped (ejected). Route to pod-3. 200 OK returned to Frontend. x-envoy-upstream-rq-retries: 1 injected." },
          { name: "Re-probe after 30s", detail: "After ejection duration, pod-2 is re-added to the pool at reduced weight. If it responds OK, weight restores gradually." },
        ],
      },
      yaml: `# DestinationRule — outlier detection
spec:
  host: product
  trafficPolicy:
    outlierDetection:
      consecutive5xxErrors: 3
      interval: 10s
      baseEjectionTime: 30s
      maxEjectionPercent: 50
      minHealthPercent: 30`,
      headers: [
        { k: "x-envoy-upstream-rq-retries", v: "1", badge: "NEW" },
        { k: "x-envoy-attempt-count", v: "2", badge: "SET" },
      ],
      status: "200 OK (after 1 retry)",
      narTitle: "How circuit breaking prevents cascading failure",
      narBody: "Outlier detection tracks each endpoint (pod IP:port) independently inside Envoy's EDS cluster. After consecutiveGatewayErrors=3 consecutive 5xx responses from pod-2, that specific pod is ejected from the load-balancing pool for baseEjectionTime=30s. The retry filter immediately re-routes to pod-3. The caller (Frontend) sees a 200 with one retry header — no 503 surfaces to the user. After 30s, pod-2 is re-probed at 10% traffic weight. If it recovers, weight gradually restores.",
    },
  {
      title: "VirtualService Canary — 90/10 weighted routing to Payment v2",
      hops: [
        { name: "Frontend", sub: "POST /checkout", color: C, active: true },
        { name: "Frontend Envoy", sub: "xDS RDS route", color: C, active: true, sidecarAction: "Weight route", sidecarNote: "rand(0-100)=7 → v2" },
        { name: "Payment v1", sub: "90% — stable", color: "#22c55e", active: true },
        { name: "Payment v2", sub: "10% — canary", color: "#f59e0b", active: true, sidecarAction: "NEW: Stripe SDK v3", sidecarNote: "canary subset" },
        { name: "Order Svc", sub: "confirm", color: "#818cf8", active: false, dim: true },
      ],
      arrows: [
        { label: "EDS lookup", active: true, color: C },
        { label: "90%", active: true, color: "#22c55e" },
        { label: "10%", active: true, color: "#f59e0b" },
        { label: "", active: false },
      ],
      chain: {
        active: 2,
        filters: [
          { name: "HTTP Connection Manager", detail: "Request: POST /checkout to host: payment. Looks up route in xDS RDS config pushed by Istiod." },
          { name: "Route Table lookup (RDS)", detail: "Host 'payment' matched. Route: weighted destinations. Evaluates two destination entries with weights [90, 10]." },
          { name: "Weight Selector", detail: "Generates rand(0..100) = 7. Cumulative weight: v1=[0-89], v2=[90-99]. 7 falls in v1? No — wait: Envoy picks v2 subset since random(100) < 10. EDS returns pod IP for version=v2 label." },
          { name: "Cluster: payment|v2|istio-demo", detail: "Outbound mTLS connection to Payment-v2 pod. No Kubernetes Service change — only xDS config." },
        ],
      },
      yaml: `# VirtualService — 90/10 canary split
spec:
  hosts: [payment]
  http:
  - route:
    - destination:
        host: payment
        subset: v1
      weight: 90
    - destination:
        host: payment
        subset: v2
      weight: 10
---
# DestinationRule — define subsets by label
spec:
  host: payment
  subsets:
  - name: v1
    labels: {version: v1}
  - name: v2
    labels: {version: v2}`,
      headers: [
        { k: "x-envoy-upstream-service-time", v: "38", badge: "NEW" },
        { k: "x-b3-traceid", v: "a3f4b2c1d5e6f7a8" },
        { k: "x-b3-parentspanid", v: "c4d5e6f7" },
        { k: "x-b3-spanid", v: "d5e6f7a8", badge: "NEW" },
      ],
      narTitle: "How Envoy implements weighted routing with no load balancer changes",
      narBody: "The VirtualService is compiled by Istiod into an xDS Route Configuration (RDS) and pushed to the Frontend's sidecar Envoy — no restart, no rolling update. At request time, Envoy evaluates the weighted route: it selects the destination subset using a random number in [0, total_weight). subset: v2 maps to a DestinationRule subset that filters EDS endpoints by label version=v2. The canary rollout is instant — one kubectl apply and the next request can hit v2. To increase the canary, edit the weight from 10 to 25 and re-apply.",
    },
  {
      title: "Retry + Timeout — automatic recovery from transient Payment failures",
      hops: [
        { name: "Frontend", sub: "POST /checkout", color: C, active: true },
        { name: "Payment v1", sub: "503 attempt 1", color: "#ef4444", active: true, warn: true, sidecarAction: "503 upstream", sidecarNote: "overload / restart" },
        { name: "Payment v1", sub: "200 attempt 2", color: "#22c55e", active: true, sidecarAction: "retry success" },
        { name: "Order Svc", sub: "confirm", color: "#818cf8", active: true },
      ],
      arrows: [
        { label: "attempt 1", active: true, color: "#ef4444" },
        { label: "retry 100ms", active: true, color: "#22c55e" },
        { label: "confirm", active: true, color: "#818cf8" },
      ],
      chain: {
        active: 1,
        filters: [
          { name: "HTTP Router → Payment cluster", detail: "Attempt 1 dispatched to pod-1. Response: 503 Service Unavailable (upstream overloaded)." },
          { name: "Retry Policy", detail: "503 matches retryOn: 5xx. perTryTimeout=2s not exceeded. Backoff: 100ms. Dispatching attempt 2 to pod-2 (different endpoint via LB). retries: 1/3." },
          { name: "Attempt 2 success", detail: "200 OK in 45ms from pod-2. Total elapsed: 145ms. Within global timeout of 3s." },
          { name: "Global Timeout check", detail: "145ms < 3s timeout budget. Response forwarded to Frontend with x-envoy-upstream-rq-retries: 1." },
        ],
      },
      yaml: `# VirtualService — retries + global timeout
spec:
  hosts: [payment]
  http:
  - timeout: 3s
    retries:
      attempts: 3
      perTryTimeout: 2s
      retryOn: >-
        5xx,connect-failure,
        retriable-4xx,reset
    route:
    - destination: {host: payment, subset: v1}`,
      headers: [
        { k: "x-envoy-upstream-rq-retries", v: "1", badge: "NEW" },
        { k: "x-envoy-upstream-rq-timeout-ms", v: "3000", badge: "NEW" },
        { k: "x-envoy-attempt-count", v: "2", badge: "SET" },
      ],
      status: "200 OK (1 retry, 145ms)",
      narTitle: "How retry logic is entirely enforced in Envoy — zero app changes",
      narBody: "The VirtualService retry config is compiled into a per-route retry policy in Envoy's RDS config. On a 503 response, Envoy's retry filter checks: Does the response code match retryOn? Is perTryTimeout exceeded? Are we under the attempts limit? If all pass, Envoy backs off 100ms, picks a different healthy endpoint from the EDS cluster, and re-dispatches. The app in Frontend makes one HTTP call — it never sees the 503. The global timeout=3s caps the total attempt chain, preventing unbounded retries from holding connections indefinitely.",
    },
  {
      title: "Distributed Tracing — x-b3 headers linking every hop in Jaeger",
      hops: [
        { name: "Ingress GW", sub: "span: ROOT", color: C, active: true, sidecarAction: "create traceid", sidecarNote: "x-b3-traceid" },
        { name: "Frontend", sub: "span: child", color: C, active: true, sidecarAction: "propagate", sidecarNote: "x-b3-parentspanid" },
        { name: "Cart", sub: "span: child", color: "#22c55e", active: true, sidecarAction: "new spanid" },
        { name: "Payment v1", sub: "span: child", color: "#22c55e", active: true, sidecarAction: "new spanid" },
        { name: "Order", sub: "span: leaf", color: "#818cf8", active: true, sidecarAction: "new spanid" },
      ],
      arrows: [
        { label: "propagate headers", active: true, color: C },
        { label: "propagate headers", active: true, color: "#22c55e" },
        { label: "propagate headers", active: true, color: "#22c55e" },
        { label: "propagate headers", active: true, color: "#818cf8" },
      ],
      chain: {
        active: 1,
        filters: [
          { name: "HTTP Connection Manager (every hop)", detail: "Each Envoy reads incoming x-b3-traceid (or generates one on first hop). Sets x-b3-parentspanid = current spanid. Generates new random x-b3-spanid." },
          { name: "Tracing Filter (Zipkin/Jaeger reporter)", detail: "Reports span to Jaeger collector: {traceId, spanId, parentSpanId, serviceName, startTime, durationMs, tags: {http.method, http.url, http.status_code, peer.address}}." },
          { name: "App must propagate headers!", detail: "Envoy injects on inbound but CANNOT propagate across the app. App code must copy x-b3-* from incoming request to all outgoing requests (use OpenTelemetry SDK or manual header copy)." },
        ],
      },
      yaml: `# Telemetry — 100% sampling for dev
apiVersion: telemetry.istio.io/v1alpha1
kind: Telemetry
metadata: {namespace: istio-system}
spec:
  tracing:
  - providers: [{name: jaeger}]
    randomSamplingPercentage: 100.0
# Jaeger installed via:
# kubectl apply -f samples/addons/jaeger.yaml`,
      headers: [
        { k: "x-b3-traceid", v: "a3f4b2c1d5e6f7a8b9c0d1e2f3a4b5c6" },
        { k: "x-b3-spanid", v: "e7f8a9b0 (order leaf)", badge: "SET" },
        { k: "x-b3-parentspanid", v: "d5e6f7a8 (payment span)" },
        { k: "x-b3-sampled", v: "1" },
      ],
      narTitle: "How distributed tracing links every hop — and the one thing you must do",
      narBody: "Each Envoy sidecar injects the x-b3-traceid header on the first hop — this single ID ties together the entire request chain in Jaeger. On each subsequent hop, Envoy records a new span: {service, method, path, status, latency} and reports it to the Jaeger collector via the Zipkin gRPC protocol. Critical app responsibility: the app must forward the x-b3-* headers from its inbound request to all outbound requests — Envoy alone cannot cross the application boundary. In Jaeger you see the full waterfall: Ingress (2ms) → Frontend (12ms) → Cart (8ms) + Product (parallel) → Payment (45ms) → Order (6ms). Total: 71ms, one trace ID.",
    },
  ];
  return <ScenarioShell icon="🛒" name="E-commerce Checkout Platform" subtitle="iptables · JWT · mTLS · Circuit Breaker · Canary · Retry · Tracing" steps={STEPS} color={C} />;
}

// ── Scenario 2: FinTech API Gateway (8 detailed steps) ────────────────────────
function ProdFintech() {
  const C = "#a78bfa";
  const STEPS = [
  {
      title: "Zero-Trust API Topology — JWT + SPIFFE + Egress Audit",
      hops: [
        { name: "Mobile App", sub: "Bearer JWT", color: "#64748b", active: true },
        { name: "Ingress GW", sub: "JWT + TLS", color: C, active: true, sidecarAction: "RequestAuthn", sidecarNote: "JWKS verify" },
        { name: "Account Svc", sub: ":8080", color: "#22c55e", active: true, sidecarAction: "AuthzPolicy", sidecarNote: "role=user" },
        { name: "Transaction", sub: ":8080", color: "#0ea5e9", active: true, sidecarAction: "AuthzPolicy", sidecarNote: "role=verified" },
        { name: "Egress GW", sub: "audit log", color: "#fb7185", active: true, sidecarAction: "log all egress" },
        { name: "Stripe", sub: "external", color: "#34d399", active: true },
      ],
      arrows: [
        { label: "HTTPS + JWT", active: true, color: C },
        { label: "mTLS", active: true, color: "#22c55e" },
        { label: "mTLS", active: true, color: "#0ea5e9" },
        { label: "mTLS → egress", active: true, color: "#fb7185" },
        { label: "HTTPS", active: true, color: "#34d399" },
      ],
      chain: null, yaml: null, headers: null,
      narTitle: "Zero-trust FinTech: defense in depth with Istio",
      narBody: "Every request passes through 4 security checkpoints: (1) JWT signature validation at the ingress edge, (2) JWT claims-based AuthorizationPolicy per service, (3) SPIFFE mTLS between every internal service, (4) all external egress routed through a dedicated Egress Gateway with full access logs. No traffic ever reaches an internal service without passing all checkpoints. A compromised pod cannot talk to another service — SPIFFE identity prevents it.",
    },
  {
      title: "JWT Validation — JWKS fetch, signature verification, claim extraction",
      hops: [
        { name: "Mobile App", sub: "Authorization: Bearer eyJ...", color: "#64748b", active: true },
        { name: "Ingress GW", sub: "JWT Auth Filter", color: C, active: true, sidecarAction: "RS256 verify", sidecarNote: "JWKS cached 5m" },
        { name: "Auth Service", sub: "IdP (external)", color: "#f59e0b", active: false, dim: true },
        { name: "Account Svc", sub: "claims forwarded", color: "#22c55e", active: true },
      ],
      arrows: [
        { label: "Bearer token", active: true, color: C },
        { label: "(JWKS cached)", active: false },
        { label: "x-jwt-payload", active: true, color: "#22c55e" },
      ],
      chain: {
        active: 1,
        filters: [
          { name: "TLS Inspector", detail: "TLS 1.3 terminated. Client certificate not required here (mTLS only for inter-service)." },
          { name: "JWT Auth Filter (HTTP filter #1)", detail: "1) Extracts 'Authorization: Bearer <token>' header. 2) Splits header.payload.signature. 3) Fetches public key from JWKS URI — cached in Envoy for 300s. 4) Verifies RS256 signature. 5) Validates: exp > now, aud matches, iss matches. 6) Injects claims into metadata." },
          { name: "Metadata extraction", detail: "request.auth.claims['sub'] = 'user_abc123'. request.auth.claims['role'] = 'verified'. request.auth.claims['tenant_id'] = 'acme'. These are available to AuthorizationPolicy rules." },
          { name: "Router → Account cluster", detail: "Request forwarded. AuthorizationPolicy checked at Account sidecar using the injected metadata." },
        ],
      },
      yaml: `# RequestAuthentication — validate JWT at ingress
spec:
  selector:
    matchLabels: {istio: ingressgateway}
  jwtRules:
  - issuer: "https://auth.myfintech.com"
    jwksUri: "https://auth.myfintech.com/.well-known/jwks.json"
    audiences: ["fintech-api"]
    forwardOriginalToken: false
    # Claims available as:
    # request.auth.claims[role]
    # request.auth.claims[tenant_id]`,
      headers: [
        { k: "Authorization", v: "Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyX2FiYzEyMyIsInJvbGUiOiJ2ZXJpZmllZCJ9..." },
        { k: "x-jwt-payload", v: '{"sub":"user_abc123","role":"verified","tenant":"acme","exp":1742000000}', badge: "NEW" },
        { k: "x-request-id", v: "f8a3b2c1-d4e5-6789-abcd-ef0123456789", badge: "NEW" },
      ],
      status: "200 OK (JWT valid, role=verified)",
      narTitle: "How Envoy validates JWTs without contacting the IdP on every request",
      narBody: "The JWT Auth filter uses public-key cryptography (RS256). It only needs the IdP's public key (JWKS) — not the IdP itself — to verify tokens. The JWKS is fetched once and cached for 5 minutes. On cache hit, verification is a pure CPU operation (~0.1ms). On cache miss, Envoy fetches JWKS async without blocking the request. If the token is expired, has a bad signature, or wrong audience: 401 Jwt verification fails is returned before the request reaches any backend.",
    },
  {
      title: "Claims-based AuthorizationPolicy — role gating per endpoint",
      hops: [
        { name: "Ingress GW", sub: "JWT claims attached", color: C, active: true },
        { name: "Account Svc", sub: "GET /accounts", color: "#22c55e", active: true, sidecarAction: "ALLOW (role=user+)", sidecarNote: "AuthzPolicy check" },
        { name: "Transaction", sub: "POST /transfer", color: "#0ea5e9", active: true, sidecarAction: "ALLOW (role=verified)", sidecarNote: "rejected if role=user" },
        { name: "Admin API", sub: "GET /admin", color: "#f59e0b", active: true, sidecarAction: "ALLOW (role=admin)", sidecarNote: "403 if not admin" },
      ],
      arrows: [
        { label: "mTLS + claims", active: true, color: C },
        { label: "role=user ✓", active: true, color: "#22c55e" },
        { label: "role=verified ✓", active: true, color: "#0ea5e9" },
      ],
      chain: {
        active: 1,
        filters: [
          { name: "Inbound mTLS Termination", detail: "Verifies source SPIFFE cert: spiffe://cluster.local/ns/fintech/sa/ingress-svc. Allowed by AuthzPolicy source.principal check." },
          { name: "AuthorizationPolicy evaluation (ALLOW list)", detail: "Default: DENY all (no matching ALLOW rule = 403). Rules evaluated in order. Match: from.source.requestPrincipals=* + when.request.auth.claims[role]=verified + to.operation.paths=[/transfer/*]. Grant access." },
          { name: "Claims check: role=verified required", detail: "request.auth.claims[role] = 'verified' matches. 'user' role would fail this rule → 403 RBAC: access denied." },
          { name: "Router → Transaction upstream", detail: "Request forwarded with all original headers intact." },
        ],
      },
      yaml: `# AuthorizationPolicy — claim-gated endpoints
spec:
  selector:
    matchLabels: {app: transaction-svc}
  action: ALLOW
  rules:
  - from:
    - source: {requestPrincipals: ["*"]}
    to:
    - operation:
        methods: ["POST"]
        paths: ["/transfer/*"]
    when:
    - key: request.auth.claims[role]
      values: ["verified", "admin"]`,
      headers: [
        { k: "x-jwt-payload", v: '{"sub":"user_abc123","role":"verified","tenant":"acme"}' },
        { k: ":authority", v: "transaction-svc.fintech.svc.cluster.local" },
        { k: ":path", v: "/transfer/send" },
        { k: ":method", v: "POST" },
      ],
      status: "200 OK (role=verified, POST /transfer allowed)",
      narTitle: "How JWT claims become authorization decisions at the sidecar level",
      narBody: "The JWT Auth filter at the Ingress extracts claims into Envoy's dynamic metadata. When the request reaches Transaction svc's sidecar, the AuthorizationPolicy engine reads request.auth.claims[role] from that metadata — no extra network call. The ALLOW rule is an explicit allowlist: any request NOT matching a rule is implicitly DENIED (Istio default deny-all semantics). A user with role=user calling POST /transfer gets: 403 RBAC: access denied from the sidecar before the app code runs.",
    },
  {
      title: "WasmPlugin Rate Limiter — request counting at the AUTHZ phase",
      hops: [
        { name: "Mobile App", sub: "200+ req/min", color: "#64748b", active: true },
        { name: "Ingress GW", sub: "JWT validated", color: C, active: true },
        { name: "WasmPlugin", sub: "AUTHZ phase", color: "#f59e0b", active: true, sidecarAction: "rate: 201/min", sidecarNote: "LIMIT exceeded → 429" },
        { name: "Account Svc", sub: "protected", color: "#22c55e", active: false, dim: true },
      ],
      arrows: [
        { label: "JWT valid", active: true, color: C },
        { label: "Wasm filter", active: true, color: "#f59e0b" },
        { label: "429 blocked", active: true, color: "#ef4444", blocked: true },
      ],
      chain: {
        active: 2,
        filters: [
          { name: "JWT Auth Filter (AUTHN phase)", detail: "Token validated. sub=user_abc123 extracted into metadata." },
          { name: "AuthorizationPolicy (AUTHZ phase — before Wasm)", detail: "ALLOW rules checked. Request path/method matches. SPIFFE source verified." },
          { name: "WasmPlugin Rate Limiter (AUTHZ phase)", detail: "Reads request.auth.claims[sub]. Increments in-memory sliding window counter for user_abc123. Counter = 201. Threshold = 200/min. Returns HTTP 429 Too Many Requests. Request blocked here — never reaches Account Svc." },
          { name: "Router (not reached)", detail: "Upstream call skipped. 429 returned to client with Retry-After: 60s header." },
        ],
      },
      yaml: `# WasmPlugin — per-user rate limiter
apiVersion: extensions.istio.io/v1alpha1
kind: WasmPlugin
metadata: {name: rate-limiter}
spec:
  selector:
    matchLabels: {istio: ingressgateway}
  url: oci://ghcr.io/myorg/rate-limiter:v2
  phase: AUTHZ
  pluginConfig:
    requests_per_minute: 200
    key_from: "request.auth.claims[sub]"
    reject_code: 429`,
      headers: [
        { k: "x-jwt-payload", v: '{"sub":"user_abc123","role":"verified"}' },
        { k: "x-ratelimit-limit", v: "200", badge: "NEW" },
        { k: "x-ratelimit-remaining", v: "0", badge: "NEW" },
        { k: "retry-after", v: "60", badge: "NEW" },
      ],
      status: "429 Too Many Requests",
      narTitle: "How WasmPlugin inserts custom logic into Envoy's filter chain",
      narBody: "WasmPlugin loads a compiled WebAssembly binary into Envoy's filter chain at a specified phase (AUTHN, AUTHZ, or STATS). The plugin runs in a sandboxed Wasm runtime — no host file/network access, safe to deploy. The rate limiter Wasm module reads the JWT sub claim from Envoy metadata (previously extracted by the JWT filter), increments a per-user counter in the module's memory, and returns HTTP 429 if over the limit. The OCI image is pulled by Istio's agent and distributed to all matching sidecars via xDS — no restart required.",
    },
  {
      title: "Egress Gateway — centralised auditing of all outbound calls to Stripe",
      hops: [
        { name: "Transaction", sub: "call Stripe", color: "#0ea5e9", active: true },
        { name: "Txn Envoy", sub: "outbound :15001", color: "#0ea5e9", active: true, sidecarAction: "VS route match", sidecarNote: "→ EgressGW cluster" },
        { name: "Egress GW", sub: "istio-egressgateway", color: "#fb7185", active: true, sidecarAction: "access log", sidecarNote: "every call audited" },
        { name: "Stripe API", sub: "api.stripe.com", color: "#34d399", active: true },
      ],
      arrows: [
        { label: "plain HTTP", active: true, color: "#0ea5e9" },
        { label: "mTLS in-cluster", active: true, color: "#fb7185", proto: "to EgressGW" },
        { label: "TLS to Stripe", active: true, color: "#34d399", proto: "SNI: api.stripe.com" },
      ],
      chain: {
        active: 2,
        filters: [
          { name: "VirtualService match (Transaction sidecar)", detail: "Host: api.stripe.com matched. VirtualService rule: gateways=[mesh], route to istio-egressgateway.istio-system cluster. Request goes to Egress GW, NOT directly to Stripe." },
          { name: "mTLS transit to Egress GW", detail: "Transaction sidecar opens mTLS connection to Egress GW pod. SPIFFE cert verified: spiffe://…/sa/transaction-svc must be in AuthzPolicy allowlist at EgressGW." },
          { name: "Egress GW: Access Log + TLS origination", detail: "Access log entry written: {timestamp, source_principal=spiffe://…/transaction-svc, destination=api.stripe.com, method=POST, path=/v1/charges, status=200, duration=342ms}. EgressGW originates TLS to Stripe with correct SNI." },
          { name: "Response path", detail: "Stripe response flows back: Stripe → EgressGW → Transaction sidecar → Transaction app." },
        ],
      },
      yaml: `# VirtualService — force traffic via EgressGW
spec:
  hosts: [api.stripe.com]
  gateways: [mesh, egress-stripe-gw]
  http:
  - match: [{gateways: [mesh]}]
    route:
    - destination:
        host: istio-egressgateway.istio-system.svc
        subset: stripe
  - match: [{gateways: [egress-stripe-gw]}]
    route:
    - destination:
        host: api.stripe.com
        port: {number: 443}`,
      headers: [
        { k: "Host", v: "api.stripe.com" },
        { k: "Authorization", v: "Bearer sk_live_..." },
        { k: "x-source-principal", v: "spiffe://cluster.local/ns/fintech/sa/transaction-svc", badge: "NEW" },
        { k: "x-egress-audit-id", v: "egr-20260315-f8a3b2c1", badge: "NEW" },
      ],
      narTitle: "How egress gateway centralises external call auditing",
      narBody: "Without an egress gateway, any pod in the cluster can call Stripe directly — hard to audit, impossible to block selectively. The VirtualService mesh rule intercepts calls to api.stripe.com at the source pod's sidecar and redirects them to the Egress Gateway pod first. The Egress GW writes a structured access log entry for every call — capturing source service identity (SPIFFE), destination, path, status, and duration. Compliance teams get a single audit stream. External firewalls only need to allowlist the Egress GW's fixed IP.",
    },
  {
      title: "mTLS STRICT — blocking plaintext inter-service calls entirely",
      hops: [
        { name: "Transaction", sub: "plain HTTP attempt", color: "#ef4444", active: true, warn: true },
        { name: "Account Svc", sub: "STRICT mode", color: C, active: true, sidecarAction: "REJECT plaintext", sidecarNote: "PeerAuthentication STRICT" },
        { name: "Transaction", sub: "mTLS retry", color: "#0ea5e9", active: true, sidecarAction: "ISTIO_MUTUAL", sidecarNote: "DestinationRule" },
        { name: "Account Svc", sub: "accepted ✓", color: "#22c55e", active: true, sidecarAction: "cert verified" },
      ],
      arrows: [
        { label: "plaintext REJECTED", active: true, color: "#ef4444", blocked: true },
        { label: "mTLS TLS 1.3", active: true, color: "#22c55e" },
        { label: "", active: true, color: "#22c55e" },
      ],
      chain: {
        active: 0,
        filters: [
          { name: "PeerAuthentication STRICT — inbound TLS check", detail: "Account sidecar inbound listener requires TLS. Plaintext connection from any source is immediately rejected with: 'upstream connect error … TLS error: CERTIFICATE_REQUIRED'. No data reaches the app." },
          { name: "DestinationRule ISTIO_MUTUAL — outbound TLS origination", detail: "Transaction sidecar DestinationRule trafficPolicy.tls.mode=ISTIO_MUTUAL: Envoy automatically presents its SPIFFE SVID cert when connecting to Account Svc. No app code change." },
          { name: "SPIFFE URI SAN validation", detail: "Account Envoy verifies Transaction's cert SAN = spiffe://cluster.local/ns/fintech/sa/transaction-svc. SAN must match. Wrong namespace or ServiceAccount = TLS handshake failure." },
          { name: "AuthorizationPolicy: source.principal", detail: "Transaction SPIFFE principal matches ALLOW rule source.principals. Request forwarded to Account app." },
        ],
      },
      yaml: `# PeerAuthentication — namespace-wide STRICT
spec:
  mtls: {mode: STRICT}
  # All pods in fintech namespace:
  # - REJECT plaintext inbound connections
  # - REQUIRE client TLS certificate

# DestinationRule — auto-originate mTLS
spec:
  host: account-svc
  trafficPolicy:
    tls:
      mode: ISTIO_MUTUAL
      # Envoy uses SDS cert automatically`,
      headers: [
        { k: "x-forwarded-client-cert", v: "By=spiffe://cluster.local/ns/fintech/sa/account-svc;URI=spiffe://cluster.local/ns/fintech/sa/transaction-svc", badge: "NEW" },
      ],
      status: "200 OK (mTLS STRICT — cert verified)",
      narTitle: "How STRICT mTLS prevents lateral movement from compromised pods",
      narBody: "PeerAuthentication STRICT mode makes Account svc's inbound listener reject any non-TLS connection immediately. A compromised pod in another namespace that tries to call Account svc directly gets a TLS error — even if it knows the Service DNS name. It cannot present a valid SPIFFE cert for the fintech namespace because Istiod only issues certs to pods with the correct ServiceAccount. STRICT mTLS is the last line of defence: even if network policies, ingress controls, and AuthzPolicy all fail, the cryptographic identity check holds.",
    },
  {
      title: "Audit Access Log — structured egress log fields for compliance",
      hops: [
        { name: "Transaction", sub: "POST /charges", color: "#0ea5e9", active: true },
        { name: "Egress GW", sub: "access log written", color: "#fb7185", active: true, sidecarAction: "structured log", sidecarNote: "JSON to stdout" },
        { name: "Log Aggregator", sub: "Fluentd / Loki", color: "#f59e0b", active: true },
        { name: "Compliance DB", sub: "audit store", color: "#818cf8", active: true },
      ],
      arrows: [
        { label: "via mTLS", active: true, color: "#fb7185" },
        { label: "stdout → sink", active: true, color: "#f59e0b" },
        { label: "indexed", active: true, color: "#818cf8" },
      ],
      chain: {
        active: 1,
        filters: [
          { name: "Request received at EgressGW", detail: "Source: Transaction svc (SPIFFE verified). Destination: api.stripe.com:443. Path: POST /v1/charges." },
          { name: "Access Logger (HTTP filter)", detail: "Writes JSON log entry to /dev/stdout on EgressGW pod. Fields: [%START_TIME%, %REQ(:METHOD)%, %REQ(X-ENVOY-ORIGINAL-PATH?:PATH)%, %RESPONSE_CODE%, %DURATION%, %DOWNSTREAM_PEER_URI_SAN%, %UPSTREAM_HOST%]." },
          { name: "Sidecar access log at Transaction pod", detail: "Outbound log on Transaction sidecar also captures the same call from the source side. Two log entries per call: one at source, one at egress." },
          { name: "Telemetry CRD custom fields", detail: "Telemetry.accessLogging can add custom fields: provider.name=otel, filter.expression to log only errors, or custom tags from request headers." },
        ],
      },
      yaml: `# Telemetry — custom access log format
apiVersion: telemetry.istio.io/v1alpha1
kind: Telemetry
metadata: {namespace: fintech}
spec:
  accessLogging:
  - providers: [{name: otel}]
    filter:
      expression: >
        response.code >= 400 ||
        request.headers['x-audit'] == 'true'`,
      headers: [
        { k: "log.timestamp", v: "2026-03-15T10:23:44.512Z" },
        { k: "log.source_principal", v: "spiffe://cluster.local/ns/fintech/sa/transaction-svc" },
        { k: "log.method", v: "POST" },
        { k: "log.path", v: "/v1/charges" },
        { k: "log.response_code", v: "200" },
        { k: "log.duration_ms", v: "342" },
        { k: "log.upstream_host", v: "api.stripe.com:443" },
      ],
      narTitle: "How structured access logs provide a complete audit trail",
      narBody: "Envoy writes a structured access log entry for every request that passes through it. At the Egress Gateway, this captures source SPIFFE identity, destination, path, method, status code, and duration for every call to an external system. Combined with the Telemetry CRD filter, you can log only error responses or requests with specific audit headers — reducing log volume by 99% while retaining all compliance-relevant events. The logs flow to stdout, picked up by Fluentd/Loki, and indexed in a compliance database — a complete, tamper-proof audit trail with zero application instrumentation.",
    },
  ];
  return <ScenarioShell icon="🏦" name="FinTech API Gateway" subtitle="JWT Claims · WasmPlugin · Egress Audit · mTLS STRICT · Access Logs" steps={STEPS} color={C} />;
}

// ── Scenario 3: Zero-Trust SaaS Platform (8 detailed steps) ───────────────────
function ProdSaaS() {
  const C = "#34d399";
  const STEPS = [
  {
      title: "Multi-tenant SaaS Topology — namespace isolation via Istio",
      hops: [
        { name: "Tenant-A", sub: "frontend-a", color: C, active: true, sidecarAction: "STRICT mTLS", sidecarNote: "PeerAuth per-ns" },
        { name: "Shared Platform", sub: "Prometheus/Kiali", color: "#0ea5e9", active: true, sidecarAction: "observability" },
        { name: "Tenant-B", sub: "frontend-b", color: "#818cf8", active: true, sidecarAction: "STRICT mTLS", sidecarNote: "separate SPIFFE SA" },
        { name: "Istio Control", sub: "istiod", color: "#f59e0b", active: true, sidecarAction: "cert issuer", sidecarNote: "SPIFFE per-namespace" },
      ],
      arrows: [
        { label: "cross-ns DENY", active: true, color: "#ef4444", blocked: true },
        { label: "cross-ns DENY", active: true, color: "#ef4444", blocked: true },
        { label: "xDS push", active: true, color: "#f59e0b" },
      ],
      chain: null, yaml: null, headers: null,
      narTitle: "How Istio enforces tenant isolation without network policies",
      narBody: "Each tenant runs in a dedicated Kubernetes namespace. Istio provides isolation at three layers: (1) PeerAuthentication STRICT in each namespace enforces mTLS — tenants cannot receive plaintext connections. (2) AuthorizationPolicy default-deny blocks all cross-namespace calls by default. (3) Istiod issues SPIFFE certs scoped to the namespace/ServiceAccount — Tenant-A pods physically cannot present a Tenant-B SPIFFE identity. No Kubernetes NetworkPolicy required.",
    },
  {
      title: "Cross-tenant call blocked — AuthzPolicy evaluation at the sidecar",
      hops: [
        { name: "Frontend-A", sub: "tenant-a ns", color: C, active: true },
        { name: "Frontend-A Envoy", sub: "outbound :15001", color: C, active: true, sidecarAction: "SPIFFE: ns/tenant-a", sidecarNote: "cannot fake tenant-b" },
        { name: "API-B Envoy", sub: "inbound :15006", color: "#818cf8", active: true, sidecarAction: "DENY: source ns", sidecarNote: "AuthzPolicy rejects" },
        { name: "API-B App", sub: "tenant-b code", color: "#818cf8", active: false, dim: true },
      ],
      arrows: [
        { label: "mTLS attempt", active: true, color: C },
        { label: "403 RBAC DENY", active: true, color: "#ef4444", blocked: true },
        { label: "never reached", active: false },
      ],
      chain: {
        active: 2,
        filters: [
          { name: "mTLS Handshake", detail: "Frontend-A Envoy presents SPIFFE cert: spiffe://cluster.local/ns/tenant-a/sa/frontend-a. API-B Envoy accepts TLS handshake — cert is valid (issued by Istiod). TLS handshake succeeds." },
          { name: "XFCC header parsed", detail: "x-forwarded-client-cert: URI=spiffe://cluster.local/ns/tenant-a/sa/frontend-a. Source namespace = tenant-a extracted." },
          { name: "AuthorizationPolicy evaluation", detail: "API-B policy: ALLOW only if source.namespace='tenant-b'. Incoming source.namespace='tenant-a' — NO matching ALLOW rule. Default action: DENY. Returns 403 RBAC: access denied." },
          { name: "App-B code never executes", detail: "The 403 is generated by the sidecar Envoy, not the application. API-B's JVM/Python process sees zero traffic from this request." },
        ],
      },
      yaml: `# AuthzPolicy on API-B — allow only from tenant-b
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: api-b-allow-own-tenant
  namespace: tenant-b
spec:
  action: ALLOW
  rules:
  - from:
    - source:
        namespaces: ["tenant-b"]
  # No rule matches tenant-a → implicit DENY`,
      headers: [
        { k: "x-forwarded-client-cert", v: "URI=spiffe://cluster.local/ns/tenant-a/sa/frontend-a" },
        { k: ":authority", v: "api-b.tenant-b.svc.cluster.local" },
      ],
      status: "403 RBAC: access denied",
      narTitle: "How the sidecar enforces tenant isolation before any app code runs",
      narBody: "The cross-tenant denial happens entirely inside the destination sidecar (API-B's Envoy). The mTLS handshake succeeds — the cert is valid. But the AuthorizationPolicy rule checks the source namespace extracted from the SPIFFE URI. tenant-a does not match tenant-b, so no ALLOW rule fires and the default DENY is returned. API-B's application code is never invoked. This is a cryptographic guarantee: Tenant-A pods cannot fake a Tenant-B SPIFFE cert because Istiod only issues certs matching the pod's actual ServiceAccount and namespace.",
    },
  {
      title: "SPIFFE Identity — namespace-scoped certificates from Istiod",
      hops: [
        { name: "Istiod CA", sub: "cert authority", color: "#f59e0b", active: true, sidecarAction: "issue SVIDs", sidecarNote: "X.509 + SPIFFE URI SAN" },
        { name: "Frontend-A Envoy", sub: "SDS request", color: C, active: true, sidecarAction: "cert: ns/tenant-a", sidecarNote: "SA: frontend-sa" },
        { name: "API-A Envoy", sub: "SDS request", color: C, active: true, sidecarAction: "cert: ns/tenant-a", sidecarNote: "SA: api-sa" },
        { name: "API-B Envoy", sub: "separate cert", color: "#818cf8", active: true, sidecarAction: "cert: ns/tenant-b", sidecarNote: "SA: api-b-sa" },
      ],
      arrows: [
        { label: "SDS gRPC", active: true, color: "#f59e0b" },
        { label: "SDS gRPC", active: true, color: "#f59e0b" },
        { label: "SDS gRPC", active: true, color: "#818cf8" },
      ],
      chain: {
        active: 0,
        filters: [
          { name: "Istiod Certificate Authority (SDS API)", detail: "Envoy calls istiod:15012 (gRPC SDS). Presents K8s ServiceAccount token. Istiod verifies token with K8s API, issues X.509 cert. SAN = spiffe://cluster.local/ns/<namespace>/sa/<serviceaccount>. cert lifetime = 24h, rotated at 75% (18h)." },
          { name: "Trust bundle distribution", detail: "Istiod also pushes the mesh root CA trust bundle to all Envoys. This is what enables every sidecar to verify any other sidecar's cert without contacting the CA at runtime." },
          { name: "Cross-tenant proof", detail: "Frontend-A cert SAN: spiffe://cluster.local/ns/tenant-a/sa/frontend-a. Cannot be used for tenant-b calls because AuthzPolicy on Tenant-B checks source.namespace=tenant-a." },
          { name: "Cert rotation", detail: "Envoy re-requests a new cert from Istiod before expiry. Zero downtime — new cert loaded via SDS hot reload, existing connections continue with old cert until natural close." },
        ],
      },
      yaml: `# Inspect SPIFFE cert of a running pod:
# istioctl proxy-config secret \\
#   frontend-a-pod-xxx -n tenant-a

# Output (abbreviated):
# RESOURCE NAME  TYPE           STATUS
# default        Cert Chain     ACTIVE
# VALID FROM:    2026-03-15
# EXPIRE AT:     2026-03-16
# SAN:           spiffe://cluster.local/
#                ns/tenant-a/sa/frontend-a`,
      headers: [
        { k: "SAN (cert field)", v: "spiffe://cluster.local/ns/tenant-a/sa/frontend-a", badge: "NEW" },
        { k: "cert.issuer", v: "CN=istiod.istio-system.svc (mesh root CA)" },
        { k: "cert.notAfter", v: "2026-03-16T10:23:44Z" },
        { k: "cert.notBefore", v: "2026-03-15T10:23:44Z" },
      ],
      narTitle: "How SPIFFE certificates encode namespace and ServiceAccount identity",
      narBody: "Istiod acts as the mesh Certificate Authority. Every Envoy calls the SDS gRPC API at startup, presenting its Kubernetes ServiceAccount JWT as proof of identity. Istiod verifies the token with the K8s API Server, then issues an X.509 cert with SAN = spiffe://cluster.local/ns/<namespace>/sa/<serviceaccount>. This SPIFFE URI is the cryptographic identity of the pod. Since Istiod only issues certs matching the pod's actual namespace and ServiceAccount (verified by K8s), a Tenant-A pod physically cannot obtain a Tenant-B cert.",
    },
  {
      title: "Traffic Mirroring — dark launch of API-A v2 under real load",
      hops: [
        { name: "Client", sub: "live request", color: "#64748b", active: true },
        { name: "API-A v1", sub: "live → 200 OK", color: C, active: true, sidecarAction: "respond normally" },
        { name: "API-A v2", sub: "shadow copy 👻", color: "#f59e0b", active: true, sidecarAction: "mirror: receive", sidecarNote: "response DISCARDED" },
        { name: "Metrics", sub: "compare v1 vs v2", color: "#0ea5e9", active: true, sidecarAction: "latency diff" },
      ],
      arrows: [
        { label: "100% live", active: true, color: C },
        { label: "100% shadow", active: true, color: "#f59e0b", proto: "async copy" },
        { label: "observe", active: true, color: "#0ea5e9" },
      ],
      chain: {
        active: 1,
        filters: [
          { name: "HTTP Router — primary route to v1", detail: "VirtualService route: 100% to API-A subset v1. Response from v1 returned to client immediately. Client sees normal response." },
          { name: "Mirror filter — async copy to v2", detail: "Simultaneously (async, does NOT delay primary response): Envoy sends identical request copy to API-A v2. Host header modified to 'api-a-shadow'. mirrorPercentage: 100%." },
          { name: "v2 response DISCARDED", detail: "Whatever API-A v2 returns (200, 500, timeout) is silently discarded by Envoy. The client never sees it. Errors in v2 do not affect production users." },
          { name: "Telemetry comparison", detail: "Prometheus captures metrics for both v1 and v2 clusters: request_duration_ms, error_rate_5xx. Compare in Grafana to validate v2 performance under real load." },
        ],
      },
      yaml: `# VirtualService — mirror 100% to v2
spec:
  hosts: [api-a]
  http:
  - route:
    - destination:
        host: api-a
        subset: v1
      weight: 100
    mirror:
      host: api-a
      subset: v2
    mirrorPercentage:
      value: 100.0
# v2 receives Host: api-a-shadow
# v2 response is DISCARDED by Envoy`,
      headers: [
        { k: "Host (live)", v: "api-a.tenant-a.svc.cluster.local" },
        { k: "Host (shadow copy)", v: "api-a-shadow", badge: "SET" },
        { k: "x-envoy-mirror-request", v: "true", badge: "NEW" },
        { k: "x-b3-traceid", v: "a3f4b2c1d5e6f7a8 (same traceid)" },
      ],
      narTitle: "How traffic mirroring enables zero-risk production load testing",
      narBody: "Envoy's mirror filter sends an asynchronous copy of every request to the shadow destination. The copy is sent after the primary response is already on its way back to the client — zero added latency. The shadow response is discarded by Envoy regardless of status code. Errors, panics, or slow responses in v2 have zero user impact. Engineers monitor Grafana dashboards to compare v1 and v2 metrics under identical production load. When v2's metrics match v2's metrics, they shift live traffic with a VirtualService weight change.",
    },
  {
      title: "Sidecar CRD — scoping Envoy config to slash memory by 75%",
      hops: [
        { name: "API-A Pod", sub: "before scoping", color: "#ef4444", active: true, sidecarAction: "200 clusters", sidecarNote: "~180MB Envoy RAM" },
        { name: "Sidecar CRD", sub: "applied", color: C, active: true, sidecarAction: "scope: ./*, platform/*", sidecarNote: "allowlist only" },
        { name: "API-A Pod", sub: "after scoping", color: C, active: true, sidecarAction: "12 clusters", sidecarNote: "~45MB Envoy RAM" },
        { name: "Other tenants", sub: "invisible", color: "#475569", active: false, dim: true },
      ],
      arrows: [
        { label: "xDS push: 200 clusters", active: true, color: "#ef4444" },
        { label: "xDS push: 12 clusters", active: true, color: C },
        { label: "no routes", active: false },
      ],
      chain: {
        active: 1,
        filters: [
          { name: "Default Envoy config (no Sidecar CRD)", detail: "Istiod pushes config for ALL services in ALL namespaces to every Envoy. 200-service mesh: ~200 EDS clusters, ~200 LDS listeners, ~200 RDS routes per Envoy. 180MB RAM per sidecar." },
          { name: "Sidecar CRD applied — egress allowlist", detail: "spec.egress.hosts: ['./api-a', './cache', 'platform/*']. Istiod filters xDS push: only pushes config for the 12 services in the allowlist. Other services become invisible — cannot be routed to even by accident." },
          { name: "Istiod xDS delta push", detail: "Envoy uses xDS delta protocol (SOTW → delta). Istiod sends only the diff: REMOVE 188 clusters, REMOVE 188 listeners. Envoy memory drops from 180MB to 45MB within seconds." },
          { name: "Security improvement", detail: "A compromised API-A pod cannot even attempt to call Tenant-B services — there are no routes in its Envoy config for them. Sidecar scoping reduces attack surface beyond what AuthzPolicy provides." },
        ],
      },
      yaml: `# Sidecar — scope API-A to own namespace + platform
apiVersion: networking.istio.io/v1beta1
kind: Sidecar
metadata: {name: api-a-scope, namespace: tenant-a}
spec:
  workloadSelector:
    labels: {app: api-a}
  egress:
  - hosts:
    - "./*"          # same namespace only
    - "platform/*"   # shared observability
    - "istio-system/*"
  ingress:
  - port: {number: 8080, protocol: HTTP}
    defaultEndpoint: 0.0.0.0:8080`,
      headers: [
        { k: "xDS.clusters.before", v: "200 entries (all mesh services)" },
        { k: "xDS.clusters.after", v: "12 entries (scoped)", badge: "SET" },
        { k: "envoy.memory.before", v: "~180 MB" },
        { k: "envoy.memory.after", v: "~45 MB", badge: "SET" },
      ],
      narTitle: "How Sidecar CRD reduces Envoy memory and limits blast radius",
      narBody: "By default, every Envoy sidecar holds config for every service in the entire mesh — this is Istiod's default 'push everything' model. In a 200-service mesh, that is ~180MB RAM per sidecar and 200 cluster entries. The Sidecar CRD creates an egress allowlist: Istiod only pushes config for services that pod can legitimately reach. The result: 188 unnecessary cluster entries removed, memory drops to 45MB, and xDS config push time halves. Side benefit: blast radius reduction — a compromised pod has no Envoy routes to services outside its allowlist.",
    },
  {
      title: "Kiali Security Graph — visualising the mesh security posture",
      hops: [
        { name: "Kiali", sub: "service graph", color: "#0ea5e9", active: true, sidecarAction: "query Prometheus", sidecarNote: "Istio telemetry" },
        { name: "Tenant-A graph", sub: "🔒 mTLS active", color: C, active: true, sidecarAction: "green padlocks", sidecarNote: "STRICT everywhere" },
        { name: "Tenant-B graph", sub: "⚠ PERMISSIVE", color: "#f59e0b", active: true, sidecarAction: "yellow warning", sidecarNote: "upgrade needed" },
        { name: "Platform ns", sub: "✓ healthy", color: "#0ea5e9", active: true, sidecarAction: "all green" },
      ],
      arrows: [
        { label: "Prom metrics", active: true, color: "#0ea5e9" },
        { label: "security status", active: true, color: C },
        { label: "security status", active: true, color: "#f59e0b" },
      ],
      chain: {
        active: 1,
        filters: [
          { name: "Kiali queries Prometheus metrics", detail: "Kiali reads istio_requests_total with labels: source_workload, destination_service, connection_security_policy. 'connection_security_policy=mutual_tls' → green padlock. 'none' → red exclamation." },
          { name: "Security badge: mTLS active (green 🔒)", detail: "All edges between Tenant-A services show green padlocks — PeerAuthentication STRICT enforced. No plaintext connections exist." },
          { name: "Security badge: PERMISSIVE warning (yellow ⚠)", detail: "Tenant-B is still in PERMISSIVE mode (migration in progress). Yellow warning on all edges. Kiali shows which specific services accept plaintext." },
          { name: "AuthorizationPolicy violation attempts", detail: "Kiali can show blocked request attempts: edges appear with a red 'blocked' indicator when AuthzPolicy denies are recorded in Prometheus metrics (pilot_k8s_cfg_events counter)." },
        ],
      },
      yaml: `# Check mTLS status from CLI:
# istioctl authn tls-check \\
#   frontend-a-pod.tenant-a \\
#   api-a.tenant-a.svc.cluster.local

# STATUS  SERVER     CLIENT     AUTHN POLICY
# OK      STRICT     ISTIO_MUTUAL  /tenant-a/strict-mtls

# Enforce STRICT mesh-wide in one apply:
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: istio-system  # root ns = mesh-wide
spec:
  mtls: {mode: STRICT}`,
      headers: [
        { k: "kiali.security.tenant-a", v: "mTLS: STRICT ✓ — all edges encrypted", badge: "NEW" },
        { k: "kiali.security.tenant-b", v: "mTLS: PERMISSIVE ⚠ — plaintext allowed", badge: "NEW" },
        { k: "kiali.authz.violations_24h", v: "3 (cross-tenant attempts blocked)" },
      ],
      narTitle: "How Kiali turns Istio telemetry into a real-time security dashboard",
      narBody: "Kiali reads Istio's Prometheus metrics (specifically the connection_security_policy label on istio_requests_total) to determine the mTLS state of every edge in the service graph. Green padlock = STRICT mTLS confirmed. Yellow warning = PERMISSIVE (accepts plaintext). Red = plaintext detected. The graph also shows AuthzPolicy-blocked requests as red edges — invaluable for spotting misconfigured services or detecting lateral movement attempts. To upgrade Tenant-B from PERMISSIVE to STRICT, apply one PeerAuthentication resource. Kiali's graph turns green within 30 seconds.",
    },
  {
      title: "Ambient Mesh option — sidecar-free mTLS for new tenant namespaces",
      hops: [
        { name: "Tenant-C Pod", sub: "no sidecar!", color: "#818cf8", active: true, sidecarAction: "just 1 container", sidecarNote: "label: ambient mode" },
        { name: "ztunnel", sub: "per-node DaemonSet", color: "#a78bfa", active: true, sidecarAction: "L4 mTLS", sidecarNote: "shared across all pods" },
        { name: "Waypoint Proxy", sub: "optional L7", color: "#c084fc", active: true, sidecarAction: "L7 AuthzPolicy", sidecarNote: "Envoy per-SA" },
        { name: "Tenant-C API", sub: "target pod", color: "#818cf8", active: true },
      ],
      arrows: [
        { label: "HBONE tunnel", active: true, color: "#a78bfa" },
        { label: "L7 route + authz", active: true, color: "#c084fc" },
        { label: "plain TCP", active: true, color: "#818cf8" },
      ],
      chain: {
        active: 1,
        filters: [
          { name: "Namespace label: istio.io/dataplane-mode=ambient", detail: "No pod restart needed. No sidecar injected. Just label the namespace and enroll all pods instantly." },
          { name: "ztunnel (L4 mTLS — per node DaemonSet)", detail: "ztunnel is a Rust-based DaemonSet (one per K8s node). It transparently intercepts all pod traffic using eBPF/iptables and establishes HBONE (mTLS tunnel) between nodes. mTLS is enforced at L4 — zero overhead at the pod level." },
          { name: "Waypoint Proxy (optional — L7 features)", detail: "Created by: istioctl waypoint apply -n tenant-c. A per-namespace Envoy pod is deployed. VirtualService, fault injection, JWT AuthzPolicy on HTTP headers all work through the waypoint." },
          { name: "Resource comparison", detail: "Sidecar: ~50-128MB RAM per pod. Ambient ztunnel: ~1-2MB per pod (shared ztunnel DaemonSet). 50-100x memory reduction for large deployments." },
        ],
      },
      yaml: `# Enroll namespace in ambient mode
kubectl label namespace tenant-c \\
  istio.io/dataplane-mode=ambient

# Create waypoint for L7 features
istioctl waypoint apply \\
  --namespace tenant-c

# Verify: pods have NO istio-proxy container
kubectl get pods -n tenant-c
# NAME          READY   STATUS
# api-c-xxx     1/1     Running  ← 1/1, not 2/2!`,
      headers: [
        { k: "dataplane.mode", v: "ambient (no sidecar container)" },
        { k: "ztunnel.protocol", v: "HBONE (HTTP-Based Overlay Network Encapsulation)" },
        { k: "mTLS.enforcement", v: "L4 — ztunnel per node" },
        { k: "L7.features", v: "via waypoint proxy (optional)", badge: "NEW" },
        { k: "memory.per.pod", v: "~1-2 MB (vs 50-128 MB sidecar)", badge: "NEW" },
      ],
      narTitle: "How Ambient Mesh delivers mTLS with no sidecar and 50x less memory",
      narBody: "Ambient mesh replaces the per-pod sidecar with a per-node ztunnel DaemonSet. Labelling a namespace with istio.io/dataplane-mode=ambient enrolls all its pods instantly — no pod restart, no sidecar injection, no init containers. ztunnel intercepts pod traffic using eBPF and routes it through an HBONE (mTLS tunnel) to the destination node's ztunnel. L4 mTLS, SPIFFE identity, and basic AuthorizationPolicy work out of the box. For L7 features (VirtualService, JWT AuthzPolicy on headers, fault injection), add a Waypoint Proxy per namespace — a dedicated Envoy pod that handles L7 processing without touching application pods.",
    },
  ];
  return <ScenarioShell icon="🏢" name="Zero-Trust SaaS Platform" subtitle="Namespace Isolation · SPIFFE · Mirroring · Sidecar Scoping · Kiali · Ambient" steps={STEPS} color={C} />;
}

// ── IstioProductionLab wrapper ─────────────────────────────────────────────────
function IstioProductionLab() {
  const [active, setActive] = useState(0);
  const SCENARIOS = [
    { id: "ecommerce", icon: "🛒", title: "E-commerce Checkout",   tags: ["Canary","CircuitBreaker","JWT","Tracing"],      color: "#0ea5e9" },
    { id: "fintech",   icon: "🏦", title: "FinTech API Gateway",   tags: ["ClaimAuthZ","WasmPlugin","EgressAudit","SPIFFE"], color: "#a78bfa" },
    { id: "saas",      icon: "🏢", title: "Zero-Trust SaaS",       tags: ["Isolation","mTLS","Mirroring","Kiali"],           color: "#34d399" },
  ];

  return (
    <div style={{ maxWidth: 1120, margin: "32px auto 0", padding: "0 0 40px" }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ width: 3, height: 32, background: "linear-gradient(180deg,#0ea5e9,#34d399)", borderRadius: 2 }} />
        <div>
          <div style={{ fontSize: 16, fontWeight: "bold", color: "#0f172a", fontFamily: "monospace" }}>🏭 Production Scenarios</div>
          <div style={{ fontSize: 12, color: "#64748b", fontFamily: "monospace" }}>End-to-end animated walkthroughs — how Istio works in real production systems</div>
        </div>
      </div>

      {/* Scenario selector tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {SCENARIOS.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setActive(i)}
            style={{
              padding: "8px 16px", borderRadius: 10, fontSize: 13, fontFamily: "monospace", cursor: "pointer",
              background: active === i ? s.color + "18" : "#0a0f1a",
              border: `1.5px solid ${active === i ? s.color : "#94a3b8"}`,
              color: active === i ? s.color : "#64748b",
              fontWeight: active === i ? "bold" : "normal",
              transition: "all 0.2s",
            }}
          >
            {s.icon} {s.title}
            <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>{s.tags.join(" · ")}</span>
          </button>
        ))}
      </div>

      {/* Active scenario */}
      {active === 0 && <ProdEcommerce />}
      {active === 1 && <ProdFintech />}
      {active === 2 && <ProdSaaS />}
    </div>
  );
}

// ─── NEW: Kafka Live Metrics Simulator ───────────────────────────────────────
function KafkaMetricsSimulator({ meta }) {
  const [running, setRunning] = useState(false);
  const [producerRate, setProducerRate] = useState(500);
  const [consumerCount, setConsumerCount] = useState(3);
  const [msgs, setMsgs] = useState(0);
  const [lag, setLag] = useState(0);
  const [throughput, setThroughput] = useState(0);
  const [partitionLoad, setPartitionLoad] = useState([0, 0, 0, 0, 0, 0]);
  const [brokerHealth, setBrokerHealth] = useState([true, true, true]);
  const [tick, setTick] = useState(0);

  const consumerRate = consumerCount * 180;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setTick(t => t + 1);
      const delta = producerRate - consumerRate;
      setMsgs(m => Math.max(0, m + Math.floor(producerRate / 10)));
      setLag(l => Math.max(0, l + Math.floor(delta / 10)));
      setThroughput(Math.floor(producerRate + (Math.random() - 0.5) * 40));
      setPartitionLoad(() => {
        const base = producerRate / 6;
        return Array.from({ length: 6 }, (_, i) => Math.min(100, Math.floor(base / 10 + (Math.random() * 20) + (i * 3 % 15))));
      });
    }, 300);
    return () => clearInterval(id);
  }, [running, producerRate, consumerRate]);

  const lagStatus = lag > 2000 ? "critical" : lag > 500 ? "warning" : "ok";
  const lagColor = lagStatus === "critical" ? "#ef4444" : lagStatus === "warning" ? "#f59e0b" : "#22c55e";

  const killBroker = (i) => setBrokerHealth(h => h.map((v, j) => j === i ? false : v));
  const healAll = () => { setBrokerHealth([true, true, true]); setLag(0); };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <div style={{ borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", padding: "14px 16px" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#1e293b", marginBottom: 4 }}>⚡ Kafka Live Metrics Dashboard</div>
        <div style={{ fontSize: 13, color: "#64748b" }}>Simulate a real Kafka cluster — tune producer rate, consumer count, kill brokers and watch the metrics react.</div>
      </div>

      {/* Controls */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ borderRadius: 10, padding: "14px 16px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Producer Rate</div>
          <input type="range" min={100} max={2000} step={100} value={producerRate}
            onChange={e => setProducerRate(Number(e.target.value))}
            style={{ width: "100%", accentColor: meta.color }} />
          <div style={{ fontSize: 18, fontWeight: 800, color: meta.color, marginTop: 6 }}>{producerRate.toLocaleString()} msg/s</div>
        </div>
        <div style={{ borderRadius: 10, padding: "14px 16px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Consumer Count</div>
          <input type="range" min={1} max={6} step={1} value={consumerCount}
            onChange={e => setConsumerCount(Number(e.target.value))}
            style={{ width: "100%", accentColor: meta.color }} />
          <div style={{ fontSize: 18, fontWeight: 800, color: meta.color, marginTop: 6 }}>{consumerCount} consumers · {consumerRate.toLocaleString()} msg/s total</div>
        </div>
      </div>

      {/* Live Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {[
          { label: "Messages Produced", val: msgs.toLocaleString(), unit: "total", color: meta.color },
          { label: "Throughput", val: throughput.toLocaleString(), unit: "msg/s", color: "#22c55e" },
          { label: "Consumer Lag", val: lag.toLocaleString(), unit: "msgs behind", color: lagColor },
        ].map(m => (
          <div key={m.label} style={{ borderRadius: 10, padding: "14px 14px", background: "#ffffff", border: `1px solid ${m.color}30`, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{m.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: m.color, fontFamily: "monospace" }}>{m.val}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{m.unit}</div>
          </div>
        ))}
      </div>

      {/* Partition Heatmap */}
      <div style={{ borderRadius: 10, padding: "14px 16px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 12 }}>📊 Partition Load Heatmap (6 partitions)</div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          {partitionLoad.map((load, i) => {
            const h = Math.max(8, (load / 100) * 64);
            const c = load > 80 ? "#ef4444" : load > 60 ? "#f59e0b" : meta.color;
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ fontSize: 10, color: c, fontWeight: 700 }}>{load}%</div>
                <div style={{ width: "100%", height: h, background: c + "cc", borderRadius: "4px 4px 0 0", transition: "height 0.3s, background 0.3s" }} />
                <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace" }}>P{i}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Broker Health */}
      <div style={{ borderRadius: 10, padding: "14px 16px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 12 }}>🖥️ Broker Health · Click to simulate failure</div>
        <div style={{ display: "flex", gap: 12 }}>
          {brokerHealth.map((alive, i) => (
            <button key={i} onClick={() => killBroker(i)}
              style={{ flex: 1, padding: "12px 8px", borderRadius: 10, border: `1.5px solid ${alive ? "#86efac" : "#fca5a5"}`, background: alive ? "#f0fdf4" : "#fef2f2", cursor: "pointer" }}>
              <div style={{ fontSize: 18 }}>{alive ? "🟢" : "🔴"}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: alive ? "#166534" : "#991b1b", marginTop: 4 }}>Broker {i}</div>
              <div style={{ fontSize: 11, color: alive ? "#166534" : "#ef4444" }}>{alive ? "healthy" : "DOWN"}</div>
            </button>
          ))}
        </div>
        {!brokerHealth.every(Boolean) && (
          <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fca5a5", fontSize: 13, color: "#991b1b" }}>
            ⚠️ Broker failure detected! Kafka is electing new leaders for affected partitions. In production: replication.factor=3 ensures no data loss.
            <button onClick={healAll} style={{ marginLeft: 12, padding: "3px 12px", borderRadius: 6, border: "1px solid #ef4444", background: "#fff", color: "#ef4444", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>Restore All</button>
          </div>
        )}
      </div>

      {/* Start/Stop */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <button onClick={() => setRunning(r => !r)}
          style={{ padding: "11px 32px", borderRadius: 10, border: "none", background: running ? "#ef4444" : meta.color, color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", boxShadow: `0 4px 18px ${running ? "#ef444440" : meta.color + "50"}`, transition: "all 0.2s" }}>
          {running ? "⏹ Stop Simulation" : "▶ Start Simulation"}
        </button>
      </div>

      {/* Insight */}
      <div style={{ borderRadius: 10, padding: "12px 16px", background: "#fffbeb", border: "1px solid #fcd34d", fontSize: 13, color: "#78350f", lineHeight: 1.65 }}>
        <b>💡 Production insight:</b> When producerRate {">"} consumerRate, consumer lag grows exponentially. Fix: add more consumers (up to partition count), scale partitions, or enable consumer auto-scaling via KEDA. Lag is monitored via the <b>__consumer_offsets</b> internal topic.
      </div>
    </div>
  );
}

// ─── NEW: Istio Traffic Simulator ────────────────────────────────────────────
function IstioTrafficSimulator({ meta }) {
  const [v1Weight, setV1Weight] = useState(80);
  const [faultEnabled, setFaultEnabled] = useState(false);
  const [faultType, setFaultType] = useState("delay");
  const [faultPct, setFaultPct] = useState(20);
  const [circuitOpen, setCircuitOpen] = useState(false);
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState({ total: 0, v1: 0, v2: 0, errors: 0, delayed: 0 });
  const [running, setRunning] = useState(false);

  const v2Weight = 100 - v1Weight;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const id2 = Date.now();
      const goV2 = Math.random() * 100 < v2Weight;
      const version = goV2 ? "v2" : "v1";
      let status = "200";
      let delayed = false;
      if (faultEnabled && !circuitOpen) {
        if (faultType === "abort" && Math.random() * 100 < faultPct) status = "500";
        else if (faultType === "delay" && Math.random() * 100 < faultPct) delayed = true;
      }
      if (circuitOpen) status = "503";
      const req = { id: id2, version, status, delayed, x: Math.random() * 80 + 10 };
      setRequests(r => [...r.slice(-20), req]);
      setStats(s => ({
        total: s.total + 1,
        v1: s.v1 + (version === "v1" ? 1 : 0),
        v2: s.v2 + (version === "v2" ? 1 : 0),
        errors: s.errors + (status !== "200" ? 1 : 0),
        delayed: s.delayed + (delayed ? 1 : 0),
      }));
      // Auto-trip circuit breaker at >40% error rate
      setStats(s => {
        if (s.total > 10 && s.errors / s.total > 0.4 && !circuitOpen) setCircuitOpen(true);
        return s;
      });
    }, 400);
    return () => clearInterval(id);
  }, [running, v1Weight, v2Weight, faultEnabled, faultType, faultPct, circuitOpen]);

  const errorRate = stats.total > 0 ? Math.round((stats.errors / stats.total) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", padding: "14px 16px" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#1e293b", marginBottom: 4 }}>🔷 Istio Traffic Simulator</div>
        <div style={{ fontSize: 13, color: "#64748b" }}>Configure VirtualService weights, fault injection, and observe circuit breaker behavior in real time.</div>
      </div>

      {/* Traffic Split Control */}
      <div style={{ borderRadius: 10, padding: "14px 16px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 12 }}>⚖️ VirtualService Traffic Split</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#22c55e", minWidth: 60 }}>v1 {v1Weight}%</span>
          <input type="range" min={0} max={100} step={5} value={v1Weight}
            onChange={e => setV1Weight(Number(e.target.value))}
            style={{ flex: 1, accentColor: meta.color }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#818cf8", minWidth: 60, textAlign: "right" }}>v2 {v2Weight}%</span>
        </div>
        <CodeBlock lang="yaml" color="#166534" code={`# VirtualService
spec:
  http:
  - route:
    - destination: {host: myapp, subset: v1}
      weight: ${v1Weight}
    - destination: {host: myapp, subset: v2}
      weight: ${v2Weight}`} />
      </div>

      {/* Fault Injection */}
      <div style={{ borderRadius: 10, padding: "14px 16px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>💥 Fault Injection</div>
          <button onClick={() => setFaultEnabled(f => !f)}
            style={{ padding: "4px 14px", borderRadius: 6, border: `1px solid ${faultEnabled ? "#ef4444" : "#e2e8f0"}`, background: faultEnabled ? "#fef2f2" : "#f8fafc", color: faultEnabled ? "#ef4444" : "#64748b", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            {faultEnabled ? "Disable" : "Enable"}
          </button>
        </div>
        {faultEnabled && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 10 }}>
              {["delay", "abort"].map(t => (
                <button key={t} onClick={() => setFaultType(t)}
                  style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1.5px solid ${faultType === t ? "#ef4444" : "#e2e8f0"}`, background: faultType === t ? "#fef2f2" : "#f8fafc", color: faultType === t ? "#ef4444" : "#64748b", fontWeight: 700, fontSize: 13, cursor: "pointer", textTransform: "capitalize" }}>
                  {t === "delay" ? "⏱ Delay (latency)" : "🚫 Abort (HTTP 500)"}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 13, color: "#64748b", minWidth: 90 }}>Percentage:</span>
              <input type="range" min={5} max={100} step={5} value={faultPct}
                onChange={e => setFaultPct(Number(e.target.value))}
                style={{ flex: 1, accentColor: "#ef4444" }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#ef4444", minWidth: 40 }}>{faultPct}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Circuit Breaker */}
      <div style={{ borderRadius: 10, padding: "14px 16px", background: circuitOpen ? "#fef2f2" : "#ffffff", border: `1px solid ${circuitOpen ? "#fca5a5" : "#e2e8f0"}`, transition: "all 0.4s" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: circuitOpen ? "#991b1b" : "#475569" }}>
              {circuitOpen ? "🔴 Circuit Breaker: OPEN" : "🟢 Circuit Breaker: Closed"}
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Trips automatically when error rate {">"} 40%. Returns 503 to callers.</div>
          </div>
          {circuitOpen && (
            <button onClick={() => { setCircuitOpen(false); setStats(s => ({ ...s, errors: 0, total: Math.floor(s.total * 0.3) })); }}
              style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #22c55e", background: "#f0fdf4", color: "#166534", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {[
          { l: "Total Requests", v: stats.total, c: "#475569" },
          { l: "→ v1", v: stats.v1, c: "#22c55e" },
          { l: "→ v2", v: stats.v2, c: "#818cf8" },
          { l: "Error Rate", v: `${errorRate}%`, c: errorRate > 30 ? "#ef4444" : "#475569" },
        ].map(s => (
          <div key={s.l} style={{ borderRadius: 10, padding: "12px 10px", background: "#ffffff", border: "1px solid #e2e8f0", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{s.l}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.c, fontFamily: "monospace" }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Request stream visualization */}
      <div style={{ borderRadius: 10, padding: "14px 16px", background: "#ffffff", border: "1px solid #e2e8f0", minHeight: 80, position: "relative", overflow: "hidden" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 8 }}>📡 Live Request Stream</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {requests.slice(-30).map(r => (
            <div key={r.id} title={`${r.version} · HTTP ${r.status}${r.delayed ? " · delayed" : ""}`}
              style={{ width: 16, height: 16, borderRadius: "50%",
                background: r.status !== "200" ? "#ef4444" : r.version === "v1" ? "#22c55e" : "#818cf8",
                opacity: r.delayed ? 0.5 : 1,
                border: r.delayed ? "2px solid #f59e0b" : "none",
                transition: "all 0.2s" }} />
          ))}
        </div>
        <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 8 }}>
          {"🟢 v1  🟣 v2  🔴 error  ⭕ delayed"}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center" }}>
        <button onClick={() => { setRunning(r => !r); if (running) setRequests([]); }}
          style={{ padding: "11px 32px", borderRadius: 10, border: "none", background: running ? "#ef4444" : meta.color, color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", transition: "all 0.2s" }}>
          {running ? "⏹ Stop" : "▶ Start Traffic"}
        </button>
      </div>
    </div>
  );
}

// ─── NEW: RabbitMQ Knowledge Check ───────────────────────────────────────────
const RMQ_QUIZ_QUESTIONS = [
  { question: "Which exchange type routes messages to ALL bound queues regardless of routing key?", options: ["Direct", "Topic", "Fanout", "Headers"], correct: 2, explanation: "Fanout exchanges broadcast every message to all bound queues. Routing keys are ignored." },
  { question: "What happens to an unacknowledged message if a consumer crashes before sending an ACK?", options: ["It is lost permanently", "RabbitMQ re-delivers it to another consumer", "It moves to the DLX immediately", "The channel closes and the message is discarded"], correct: 1, explanation: "Without an ACK, RabbitMQ considers the message unprocessed and re-delivers it to any available consumer in the queue." },
  { question: "You need a queue that survives a RabbitMQ broker restart. Which declaration is correct?", options: ["channel.queue_declare(queue='q', persistent=True)", "channel.queue_declare(queue='q', durable=True)", "channel.queue_declare(queue='q', durable=True, delivery_mode=2)", "channel.basic_publish(..., durable=True)"], correct: 1, explanation: "durable=True on queue_declare makes the queue itself survive restarts. For messages to survive too, delivery_mode=2 is also needed." },
  { question: "A Quorum Queue requires how many nodes to agree before a message is confirmed?", options: ["1 (leader only)", "Majority ((n/2)+1)", "All nodes", "At least 2"], correct: 1, explanation: "Quorum queues use the Raft consensus algorithm — a majority of replicas must confirm a write before the producer receives an acknowledgement." },
  { question: "What does a Dead Letter Exchange (DLX) do?", options: ["Drops rejected messages permanently", "Stores messages that failed to be delivered in a backup queue", "Automatically retries failed messages every 5 seconds", "Logs all rejected messages to disk"], correct: 1, explanation: "A DLX is an exchange configured on a queue. Rejected, expired (TTL), or overflow messages are republished there, allowing a separate consumer to handle failures." },
  { question: "With flow control active, what does RabbitMQ do to producers?", options: ["Closes their TCP connection", "Sends a NACK for every message", "Blocks them using TCP backpressure until memory/disk recovers", "Moves them to a slow-lane queue"], correct: 2, explanation: "RabbitMQ uses TCP backpressure to block the producer's socket — no data loss, but the producer stalls until memory/disk levels recover." },
  { question: "Topic exchange routing key 'orders.#' will match which of these?", options: ["Only 'orders'", "'orders.eu' and 'orders.eu.retail'", "'orders.eu' only", "Any key containing the word 'orders'"], correct: 1, explanation: "# matches zero or more dot-separated words. So 'orders.#' matches 'orders.eu', 'orders.eu.retail', 'orders.us.express', etc." },
];

function RabbitMQQuizLesson({ meta }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ borderRadius: 10, padding: "14px 16px", background: "#fff7ed", border: "1px solid #fed7aa" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#c2410c", marginBottom: 4 }}>🐰 RabbitMQ · End-of-Course Knowledge Check</div>
        <div style={{ fontSize: 13, color: "#78350f", lineHeight: 1.6 }}>7 questions covering exchanges, durability, quorum queues, DLX, and flow control. Aim for 80%+ to move on confidently.</div>
      </div>
      <QuizBlock questions={RMQ_QUIZ_QUESTIONS} color={meta.color} />
    </div>
  );
}

// ─── NEW: Kafka Knowledge Check ───────────────────────────────────────────────
const KAFKA_QUIZ_QUESTIONS = [
  { question: "What determines which partition a message lands in when a key is provided?", options: ["Random assignment by the broker", "Round-robin across all partitions", "murmur2 hash of the key modulo partition count", "The producer's partition.assignment.strategy"], correct: 2, explanation: "Kafka's default partitioner applies murmur2 hash to the key and takes modulo the number of partitions. Same key always lands on the same partition." },
  { question: "With 4 partitions and 6 consumers in the same consumer group, what happens?", options: ["All 6 consumers share work equally", "2 consumers sit idle", "Kafka creates 2 extra partitions automatically", "Messages are duplicated to extra consumers"], correct: 1, explanation: "Kafka assigns at most one consumer per partition in a group. With 6 consumers and 4 partitions, 2 consumers have no partitions assigned and sit idle." },
  { question: "What does acks=all mean for a Kafka producer?", options: ["Message is written to leader only", "Message is written to disk on leader and acknowledged", "All in-sync replicas (ISR) must acknowledge before the producer gets a response", "All brokers in the cluster must acknowledge"], correct: 2, explanation: "acks=all (or acks=-1) means the leader waits for all ISR replicas to confirm the write. Combined with min.insync.replicas, this is the strongest durability guarantee." },
  { question: "What is consumer lag?", options: ["Network latency between producer and broker", "The difference between the latest offset and the consumer's committed offset", "Time delay in rebalancing after a consumer joins", "The number of unprocessed messages on the producer side"], correct: 1, explanation: "Consumer lag = latest_offset - consumer_committed_offset. High lag means the consumer is falling behind the producer and may need scaling." },
  { question: "Kafka Streams KTable semantics mean:", options: ["Append-only log of all events", "A changelog where the latest value per key wins (like a hash map)", "FIFO queue processing", "Windowed aggregations only"], correct: 1, explanation: "A KTable is an abstraction over a compacted topic. It represents the latest state for each key — like a continuously-updated database table." },
  { question: "What is the purpose of Schema Registry?", options: ["Store Kafka consumer group offsets", "Enforce schema compatibility and store Avro/Protobuf schemas centrally", "Replicate topics across data centers", "Store Kafka broker configuration"], correct: 1, explanation: "Schema Registry centralizes schema management. Producers register schemas; consumers fetch them. It enforces compatibility rules (backward, forward, full) to prevent breaking changes." },
  { question: "Log compaction retains:", options: ["All messages indefinitely", "Only messages from the last 7 days", "The latest message per unique key, plus all messages without a key", "Only messages in the active segment"], correct: 2, explanation: "Compaction keeps the most recent value for each key. Messages with null keys (tombstones count as deletes) are handled separately. This gives you a compact changelog of final states." },
];

function KafkaQuizLesson({ meta }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ borderRadius: 10, padding: "14px 16px", background: "#eef2ff", border: "1px solid #c7d2fe" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#4338ca", marginBottom: 4 }}>⚡ Kafka · End-of-Course Knowledge Check</div>
        <div style={{ fontSize: 13, color: "#3730a3", lineHeight: 1.6 }}>7 questions covering partitions, consumer groups, replication, Kafka Streams, Schema Registry, and log compaction. Aim for 80%+.</div>
      </div>
      <QuizBlock questions={KAFKA_QUIZ_QUESTIONS} color={meta.color} />
    </div>
  );
}

// ─── NEW: Istio Knowledge Check ───────────────────────────────────────────────
const ISTIO_QUIZ_QUESTIONS = [
  { question: "What intercepts all network traffic in an Istio-injected pod?", options: ["Istiod control plane", "iptables rules redirecting to the Envoy sidecar", "The Kubernetes kube-proxy", "A Kubernetes NetworkPolicy"], correct: 1, explanation: "iptables rules (managed by the istio-init container) redirect inbound and outbound traffic to Envoy's ports (15001/15006) transparently — the app is unaware." },
  { question: "A canary deployment routes 5% of traffic to v2. What Istio resource configures the weights?", options: ["DestinationRule", "VirtualService", "Gateway", "AuthorizationPolicy"], correct: 1, explanation: "VirtualService defines routing rules including weight-based traffic splitting. DestinationRule defines the subsets (v1/v2) but VirtualService applies the weights." },
  { question: "mTLS in STRICT mode means:", options: ["Only clients with a valid JWT can connect", "All traffic in the mesh must use mutual TLS — plaintext connections are rejected", "Envoy encrypts data at rest inside pods", "Only egress traffic is encrypted"], correct: 1, explanation: "STRICT mTLS requires both sides to present certificates. Plaintext connections to mTLS-enforced workloads are rejected. This provides pod-to-pod zero-trust encryption." },
  { question: "What is the role of Istiod?", options: ["Handle all data-plane request routing", "Serve as the Kubernetes ingress controller", "Act as the control plane: push xDS config, manage certs, validate resources", "Store Prometheus metrics"], correct: 2, explanation: "Istiod (formerly Pilot + Citadel + Galley) pushes xDS configuration to all Envoy sidecars, manages certificate issuance via its CA, and validates Istio CRDs." },
  { question: "A circuit breaker in Istio outlier detection ejects a host when:", options: ["The host sends more than 1000 req/s", "The host returns consecutive 5xx errors above a threshold", "CPU on the host exceeds 80%", "The host's response time exceeds 1 second"], correct: 1, explanation: "Outlier detection monitors for consecutive gateway errors (5xx) or connection failures. When a host crosses the threshold, it is temporarily ejected from the load balancing pool." },
  { question: "Traffic mirroring (shadowing) sends:", options: ["100% of traffic to v2, keeping v1 as fallback", "A copy of live traffic to a shadow service while live traffic still goes to primary", "Alternate requests between v1 and v2", "Traffic to a staging environment only"], correct: 1, explanation: "Mirroring duplicates each request to a shadow cluster/version. Responses from the shadow are ignored. This lets you test v2 with real production traffic at zero risk." },
  { question: "An Istio ServiceEntry is used to:", options: ["Define internal service versions and subsets", "Register external services (outside the mesh) so Envoy can manage and observe their traffic", "Configure JWT issuer validation", "Set resource limits on sidecar memory usage"], correct: 1, explanation: "ServiceEntry brings external services (e.g. external APIs, legacy systems) into the mesh registry. This lets Envoy apply policies, circuit breaking, and mTLS to external calls." },
];

function IstioQuizLesson({ meta }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ borderRadius: 10, padding: "14px 16px", background: "#e0f2fe", border: "1px solid #bae6fd" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#0369a1", marginBottom: 4 }}>🔷 Istio · End-of-Course Knowledge Check</div>
        <div style={{ fontSize: 13, color: "#075985", lineHeight: 1.6 }}>7 questions covering sidecars, routing, mTLS, circuit breaking, traffic mirroring, and ServiceEntry. Aim for 80%+.</div>
      </div>
      <QuizBlock questions={ISTIO_QUIZ_QUESTIONS} color={meta.color} />
    </div>
  );
}

// ─── NEW: SQS Visibility Timeout Simulator ───────────────────────────────────
function SQSVisibilitySimulator({ meta }) {
  const [running, setRunning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [phase, setPhase] = useState("idle"); // idle | received | processing | deleted | crashed | redelivered
  const [crashMode, setCrashMode] = useState(false);
  const [history, setHistory] = useState([]);
  const [attempt, setAttempt] = useState(1);
  const TIMEOUT = 30;

  useEffect(() => {
    if (!running) return;
    if (phase === "idle") {
      setPhase("received");
      setTimeLeft(TIMEOUT);
      setHistory(h => [...h, { t: Date.now(), msg: `Attempt #${attempt}: Consumer received message. Visibility timeout started (${TIMEOUT}s).`, c: "#6366f1" }]);
      return;
    }
    if (phase !== "processing" && phase !== "received") return;
    if (timeLeft <= 0) {
      if (crashMode) {
        setPhase("crashed");
        setRunning(false);
        setHistory(h => [...h, { t: Date.now(), msg: "⚠️ Timeout! Consumer did not ACK or DELETE. Message becomes VISIBLE again.", c: "#ef4444" }]);
      } else {
        setPhase("deleted");
        setRunning(false);
        setHistory(h => [...h, { t: Date.now(), msg: "✅ Message deleted successfully before timeout.", c: "#22c55e" }]);
      }
      return;
    }
    const id = setTimeout(() => {
      setTimeLeft(t => t - 1);
      if (timeLeft === 20) {
        setPhase("processing");
        setHistory(h => [...h, { t: Date.now(), msg: "Consumer started processing…", c: "#f59e0b" }]);
      }
      if (!crashMode && timeLeft === 8) {
        setPhase("deleted");
        setRunning(false);
        setHistory(h => [...h, { t: Date.now(), msg: "✅ Consumer called DeleteMessage. Message permanently removed.", c: "#22c55e" }]);
      }
    }, 1000);
    return () => clearTimeout(id);
  }, [running, phase, timeLeft, crashMode, attempt]);

  const reset = (nextAttempt = 1) => {
    setRunning(false); setPhase("idle"); setTimeLeft(TIMEOUT);
    setAttempt(nextAttempt); if (nextAttempt === 1) setHistory([]);
  };

  const simulateCrashRecovery = () => {
    setPhase("redelivered");
    setHistory(h => [...h, { t: Date.now(), msg: `Attempt #${attempt + 1}: SQS re-delivers message to another consumer. maxReceiveCount now ${attempt + 1}.`, c: "#6366f1" }]);
    setAttempt(a => a + 1);
    reset(attempt + 1);
    setTimeout(() => setRunning(true), 300);
  };

  const pct = Math.round(((TIMEOUT - timeLeft) / TIMEOUT) * 100);
  const barColor = timeLeft > 15 ? "#22c55e" : timeLeft > 8 ? "#f59e0b" : "#ef4444";
  const phaseInfo = {
    idle:        { icon: "📦", label: "Waiting in Queue",      color: "#64748b" },
    received:    { icon: "👁️",  label: "Received (Invisible)", color: "#6366f1" },
    processing:  { icon: "⚙️",  label: "Being Processed",      color: "#f59e0b" },
    deleted:     { icon: "✅",  label: "Deleted — Done!",       color: "#22c55e" },
    crashed:     { icon: "💥",  label: "Consumer Crashed!",     color: "#ef4444" },
    redelivered: { icon: "🔄",  label: "Re-delivered",         color: "#6366f1" },
  }[phase];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ borderRadius: 10, background: "#fffbeb", border: "1px solid #fcd34d", padding: "14px 16px" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#92400e", marginBottom: 4 }}>⏱️ SQS Visibility Timeout Simulator</div>
        <div style={{ fontSize: 13, color: "#78350f" }}>Watch the 30-second window live. Toggle "Consumer Crashes" to see message redelivery in action.</div>
      </div>

      {/* Mode toggle */}
      <div style={{ display: "flex", gap: 10 }}>
        {[false, true].map(c => (
          <button key={String(c)} onClick={() => { setCrashMode(c); reset(); }}
            style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1.5px solid ${crashMode === c ? (c ? "#ef4444" : "#22c55e") : "#e2e8f0"}`, background: crashMode === c ? (c ? "#fef2f2" : "#f0fdf4") : "#f8fafc", color: crashMode === c ? (c ? "#ef4444" : "#22c55e") : "#64748b", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
            {c ? "💥 Consumer Crashes" : "✅ Happy Path"}
          </button>
        ))}
      </div>

      {/* Message state */}
      <div style={{ borderRadius: 12, padding: "20px", background: "#ffffff", border: `2px solid ${phaseInfo.color}40`, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>{phaseInfo.icon}</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: phaseInfo.color }}>{phaseInfo.label}</div>
        <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>Attempt #{attempt}</div>
      </div>

      {/* Visibility timeout bar */}
      <div style={{ borderRadius: 10, padding: "14px 16px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>Visibility Timeout Window</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: barColor, fontFamily: "monospace" }}>{timeLeft}s remaining</span>
        </div>
        <div style={{ height: 16, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${barColor}88, ${barColor})`, transition: "width 0.9s linear, background 0.5s", borderRadius: 99 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>Received</span>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>Timeout</span>
        </div>
      </div>

      {/* Event log */}
      {history.length > 0 && (
        <div style={{ borderRadius: 10, padding: "12px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", maxHeight: 160, overflowY: "auto" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 8 }}>📋 Event Log</div>
          {history.map((h, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "flex-start" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: h.c, flexShrink: 0, marginTop: 4 }} />
              <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>{h.msg}</div>
            </div>
          ))}
        </div>
      )}

      {/* Crash recovery prompt */}
      {phase === "crashed" && (
        <div style={{ borderRadius: 10, padding: "14px 16px", background: "#fef2f2", border: "1px solid #fca5a5" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#991b1b", marginBottom: 8 }}>Message is now VISIBLE again in the queue.</div>
          <div style={{ fontSize: 13, color: "#7f1d1d", marginBottom: 12 }}>
            SQS will redeliver to the next available consumer. After {4 - attempt} more failures it goes to the DLQ (maxReceiveCount=3).
          </div>
          {attempt < 4 ? (
            <button onClick={simulateCrashRecovery}
              style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#ef4444", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
              Redeliver to Next Consumer →
            </button>
          ) : (
            <div style={{ padding: "10px 14px", borderRadius: 8, background: "#7f1d1d", color: "#fca5a5", fontWeight: 700, fontSize: 14 }}>
              ☠️ maxReceiveCount exceeded — message moves to DLQ!
            </div>
          )}
        </div>
      )}

      {phase === "deleted" && (
        <div style={{ borderRadius: 10, padding: "12px 14px", background: "#f0fdf4", border: "1px solid #86efac", fontSize: 13, color: "#166534", fontWeight: 600 }}>
          ✅ Perfect! Message deleted before timeout. No redelivery. Zero duplicates. This is the happy path.
        </div>
      )}

      {/* Controls */}
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        {(phase === "idle" || phase === "deleted") && (
          <button onClick={() => { if (phase === "deleted") reset(); setTimeout(() => setRunning(true), 50); }}
            style={{ padding: "11px 32px", borderRadius: 10, border: "none", background: meta.color, color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
            {phase === "deleted" ? "▶ Run Again" : "▶ Start Simulation"}
          </button>
        )}
        {(phase === "received" || phase === "processing") && (
          <button onClick={() => { setRunning(false); reset(); }}
            style={{ padding: "11px 32px", borderRadius: 10, border: "none", background: "#94a3b8", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
            ⏹ Reset
          </button>
        )}
      </div>

      <div style={{ borderRadius: 10, padding: "12px 16px", background: "#fffbeb", border: "1px solid #fcd34d", fontSize: 13, color: "#78350f", lineHeight: 1.65 }}>
        <b>💡 Production tip:</b> Set VisibilityTimeout to 6× your average processing time. Use ChangeMessageVisibility to extend on-the-fly if processing takes longer than expected. Never let the timeout expire — it causes duplicate processing.
      </div>
    </div>
  );
}

// ─── NEW: SQS Cost Calculator ─────────────────────────────────────────────────
function SQSCostCalculator({ meta }) {
  const [msgPerDay, setMsgPerDay] = useState(1000000);   // 1M/day default
  const [batchSize, setBatchSize] = useState(1);
  const [useLong, setUseLong] = useState(false);
  const [useExtended, setUseExtended] = useState(false);
  const [msgSizeKB, setMsgSizeKB] = useState(10);

  // SQS pricing: first 1M free/mo, then $0.40 per million requests
  // S3 pricing for extended client: $0.023/GB, $0.005 per 1k PUT requests
  const msgsPerMonth = msgPerDay * 30;
  // Each receive = 1 API call per batch (batchSize messages)
  const sendCalls = msgsPerMonth;
  const receiveCalls = Math.ceil(msgsPerMonth / batchSize);
  const deleteCalls = msgsPerMonth;
  const totalCalls = sendCalls + receiveCalls + deleteCalls;
  const billableCalls = Math.max(0, totalCalls - 1_000_000); // first 1M free
  // Long polling reduces receive calls by ~90%
  const adjustedCalls = useLong ? (sendCalls + Math.ceil(receiveCalls * 0.1) + deleteCalls) : totalCalls;
  const adjustedBillable = Math.max(0, adjustedCalls - 1_000_000);
  const sqsCost = (adjustedBillable / 1_000_000) * 0.40;

  // S3 Extended Client cost (only if enabled and msg > 256KB)
  let s3Cost = 0;
  if (useExtended && msgSizeKB > 256) {
    const totalGB = (msgsPerMonth * msgSizeKB) / (1024 * 1024);
    const s3Storage = totalGB * 0.023;
    const s3Puts = (msgsPerMonth / 1000) * 0.005;
    s3Cost = s3Storage + s3Puts;
  }

  const total = sqsCost + s3Cost;
  const savingsVsBaseline = Math.max(0, ((adjustedBillable - Math.max(0, (sendCalls + receiveCalls + deleteCalls - 1_000_000))) / Math.max(1, adjustedBillable)) * 100);

  const fmt = (n) => n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ borderRadius: 10, background: "#fffbeb", border: "1px solid #fcd34d", padding: "14px 16px" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#92400e", marginBottom: 4 }}>💰 SQS Cost Calculator</div>
        <div style={{ fontSize: 13, color: "#78350f" }}>Tune your workload and see how batching + long polling cut your AWS bill. Based on the official SQS pricing ($0.40 / 1M requests, first 1M free).</div>
      </div>

      {/* Inputs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[
          { label: "Messages per Day", value: msgPerDay, min: 10000, max: 100000000, step: 100000, set: setMsgPerDay, fmt: v => `${(v/1000000).toFixed(1)}M` },
          { label: "Batch Size (1–10)", value: batchSize, min: 1, max: 10, step: 1, set: setBatchSize, fmt: v => `${v} msg/call` },
        ].map(({ label, value, min, max, step, set, fmt: f }) => (
          <div key={label} style={{ borderRadius: 10, padding: "14px 16px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
            <input type="range" min={min} max={max} step={step} value={value}
              onChange={e => set(Number(e.target.value))} style={{ width: "100%", accentColor: meta.color }} />
            <div style={{ fontSize: 18, fontWeight: 800, color: meta.color, marginTop: 6 }}>{f(value)}</div>
          </div>
        ))}
      </div>

      {/* Toggles */}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => setUseLong(l => !l)}
          style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1.5px solid ${useLong ? "#06b6d4" : "#e2e8f0"}`, background: useLong ? "#ecfeff" : "#f8fafc", color: useLong ? "#0e7490" : "#64748b", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          {useLong ? "✅" : "☐"} Long Polling (WaitTimeSeconds=20)
        </button>
        <button onClick={() => setUseExtended(e => !e)}
          style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1.5px solid ${useExtended ? "#a855f7" : "#e2e8f0"}`, background: useExtended ? "#faf5ff" : "#f8fafc", color: useExtended ? "#7e22ce" : "#64748b", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          {useExtended ? "✅" : "☐"} SQS Extended Client (S3 for large msgs)
        </button>
      </div>

      {useExtended && (
        <div style={{ borderRadius: 10, padding: "14px 16px", background: "#faf5ff", border: "1px solid #e9d5ff" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#7e22ce", marginBottom: 8, textTransform: "uppercase" }}>Message Size</div>
          <input type="range" min={10} max={2048} step={10} value={msgSizeKB}
            onChange={e => setMsgSizeKB(Number(e.target.value))} style={{ width: "100%", accentColor: "#a855f7" }} />
          <div style={{ fontSize: 18, fontWeight: 800, color: "#a855f7", marginTop: 6 }}>{msgSizeKB} KB {msgSizeKB > 256 ? "→ stored in S3" : "→ fits in SQS (≤256KB)"}</div>
        </div>
      )}

      {/* Cost breakdown */}
      <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #e2e8f0" }}>
        <div style={{ padding: "14px 18px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: 0.5 }}>Monthly Cost Breakdown</div>
        </div>
        {[
          { label: "Messages / month", val: `${(msgsPerMonth/1_000_000).toFixed(1)}M`, sub: null },
          { label: "Total API calls", val: `${(adjustedCalls/1_000_000).toFixed(2)}M`, sub: useLong ? "↓ long polling reduces receive calls ~90%" : null },
          { label: "Billable calls", val: `${(adjustedBillable/1_000_000).toFixed(2)}M`, sub: "first 1M/month free" },
          { label: "SQS cost", val: fmt(sqsCost), sub: "$0.40 per million requests", big: true, color: meta.color },
          useExtended && msgSizeKB > 256 ? { label: "S3 (extended client)", val: fmt(s3Cost), sub: "storage + PUT requests", big: false, color: "#a855f7" } : null,
          { label: "Total monthly estimate", val: fmt(total), sub: null, big: true, color: total < 5 ? "#22c55e" : total < 50 ? "#f59e0b" : "#ef4444" },
        ].filter(Boolean).map((row, i) => (
          <div key={i} style={{ padding: "12px 18px", borderBottom: i < 4 ? "1px solid #e2e8f0" : "none", display: "flex", alignItems: "center", justifyContent: "space-between", background: row.big ? "#f0fdf4" : "#ffffff" }}>
            <div>
              <div style={{ fontSize: row.big ? 15 : 13, fontWeight: row.big ? 700 : 500, color: "#334155" }}>{row.label}</div>
              {row.sub && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{row.sub}</div>}
            </div>
            <div style={{ fontSize: row.big ? 20 : 15, fontWeight: 800, color: row.color || "#475569", fontFamily: "monospace" }}>{row.val}</div>
          </div>
        ))}
      </div>

      {/* Optimization tip */}
      <div style={{ borderRadius: 10, padding: "12px 16px", background: "#ecfeff", border: "1px solid #a5f3fc", fontSize: 13, color: "#0e7490", lineHeight: 1.65 }}>
        <b>💡 Quick wins:</b> Enable long polling (saves ~60% on receive calls) + batch size=10 (10× fewer receive calls) = up to <b>90% cost reduction</b> with zero code complexity.
        {batchSize < 10 && !useLong && <span style={{ display: "block", marginTop: 6, fontWeight: 700 }}>⬆️ Try enabling both above to see the savings.</span>}
      </div>
    </div>
  );
}

// ─── NEW: SQS Filter Playground ──────────────────────────────────────────────
function SQSFilterPlayground({ meta }) {
  const [filterType, setFilterType] = useState("event_type");
  const [filterValues, setFilterValues] = useState(["order"]);
  const [numericOp, setNumericOp] = useState(">");
  const [numericVal, setNumericVal] = useState(100);
  const [testInput, setTestInput] = useState({ event_type: "order", priority: "high", amount: 150 });
  const [showResult, setShowResult] = useState(false);

  const MESSAGES = [
    { id: 1, attrs: { event_type: "order", priority: "high", amount: 250 }, label: "Order #1001 — $250" },
    { id: 2, attrs: { event_type: "payment", priority: "high", amount: 80 }, label: "Payment #P202 — $80" },
    { id: 3, attrs: { event_type: "order", priority: "low", amount: 15 }, label: "Order #1002 — $15" },
    { id: 4, attrs: { event_type: "refund", priority: "high", amount: 500 }, label: "Refund #R301 — $500" },
    { id: 5, attrs: { event_type: "order", priority: "high", amount: 120 }, label: "Order #1003 — $120" },
  ];

  const policyMatches = (msg) => {
    if (filterType === "event_type") return filterValues.includes(msg.attrs.event_type);
    if (filterType === "priority")   return filterValues.includes(msg.attrs.priority);
    if (filterType === "amount") {
      if (numericOp === ">")  return msg.attrs.amount > numericVal;
      if (numericOp === ">=") return msg.attrs.amount >= numericVal;
      if (numericOp === "<")  return msg.attrs.amount < numericVal;
    }
    return false;
  };

  const toggleValue = (v) => setFilterValues(fv => fv.includes(v) ? fv.filter(x => x !== v) : [...fv, v]);

  const OPTIONS = {
    event_type: ["order", "payment", "refund", "shipment"],
    priority:   ["high", "medium", "low"],
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ borderRadius: 10, background: "#eff6ff", border: "1px solid #bfdbfe", padding: "14px 16px" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#1d4ed8", marginBottom: 4 }}>🔍 SNS Filter Policy Playground</div>
        <div style={{ fontSize: 13, color: "#1e40af" }}>Build a filter policy and see which messages pass through to your SQS queue — and which get dropped server-side.</div>
      </div>

      {/* Filter type selector */}
      <div style={{ borderRadius: 10, padding: "14px 16px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 12 }}>Filter Attribute</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["event_type", "priority", "amount"].map(t => (
            <button key={t} onClick={() => { setFilterType(t); setFilterValues(["order"]); }}
              style={{ padding: "7px 14px", borderRadius: 8, border: `1.5px solid ${filterType === t ? meta.color : "#e2e8f0"}`, background: filterType === t ? meta.color + "12" : "#f8fafc", color: filterType === t ? meta.color : "#64748b", fontWeight: filterType === t ? 700 : 500, fontSize: 13, cursor: "pointer" }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Filter value config */}
      <div style={{ borderRadius: 10, padding: "14px 16px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 12 }}>
          {filterType === "amount" ? "Condition" : "Allowed Values (check all that should PASS)"}
        </div>
        {filterType === "amount" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {[">", ">=", "<"].map(op => (
              <button key={op} onClick={() => setNumericOp(op)}
                style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${numericOp === op ? "#ef4444" : "#e2e8f0"}`, background: numericOp === op ? "#fef2f2" : "#f8fafc", color: numericOp === op ? "#ef4444" : "#64748b", fontWeight: 700, cursor: "pointer" }}>
                {op}
              </button>
            ))}
            <input type="number" value={numericVal} onChange={e => setNumericVal(Number(e.target.value))}
              style={{ width: 90, padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 15, fontWeight: 700, color: "#334155", fontFamily: "monospace" }} />
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {OPTIONS[filterType].map(v => (
              <button key={v} onClick={() => toggleValue(v)}
                style={{ padding: "7px 14px", borderRadius: 8, border: `1.5px solid ${filterValues.includes(v) ? "#22c55e" : "#e2e8f0"}`, background: filterValues.includes(v) ? "#f0fdf4" : "#f8fafc", color: filterValues.includes(v) ? "#166534" : "#64748b", fontWeight: filterValues.includes(v) ? 700 : 500, fontSize: 13, cursor: "pointer" }}>
                {filterValues.includes(v) ? "✅ " : ""}{v}
              </button>
            ))}
          </div>
        )}
        {/* Policy preview */}
        <CodeBlock lang="json" color="#166534" code={filterType === "amount"
          ? `{\n  "${filterType}": [{"numeric": ["${numericOp}", ${numericVal}]}]\n}`
          : `{\n  "${filterType}": ${JSON.stringify(filterValues)}\n}`}
        />
      </div>

      {/* Live message results */}
      <div style={{ borderRadius: 10, padding: "14px 16px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 12 }}>📨 Incoming Messages (5 total)</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {MESSAGES.map(msg => {
            const passes = policyMatches(msg);
            return (
              <div key={msg.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 9, border: `1.5px solid ${passes ? "#86efac" : "#fca5a5"}`, background: passes ? "#f0fdf4" : "#fef2f2", transition: "all 0.3s" }}>
                <div style={{ fontSize: 18 }}>{passes ? "✅" : "❌"}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: passes ? "#166534" : "#991b1b" }}>{msg.label}</div>
                  <div style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace", marginTop: 2 }}>
                    {Object.entries(msg.attrs).map(([k, v]) => (
                      <span key={k} style={{ marginRight: 10, color: k === filterType ? (passes ? "#166534" : "#ef4444") : "#94a3b8", fontWeight: k === filterType ? 700 : 400 }}>
                        {k}={String(v)}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: passes ? "#166534" : "#991b1b", flexShrink: 0 }}>
                  {passes ? "→ Queue" : "Dropped"}
                </div>
              </div>
            );
          })}
        </div>
        {/* Summary */}
        <div style={{ marginTop: 12, display: "flex", gap: 12 }}>
          {[
            { label: "Delivered to queue", val: MESSAGES.filter(policyMatches).length, color: "#22c55e" },
            { label: "Filtered out (free!)", val: MESSAGES.filter(m => !policyMatches(m)).length, color: "#ef4444" },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, borderRadius: 8, padding: "10px 14px", background: "#f8fafc", border: `1px solid ${s.color}30`, textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.val}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderRadius: 10, padding: "12px 16px", background: "#fffbeb", border: "1px solid #fcd34d", fontSize: 13, color: "#78350f", lineHeight: 1.65 }}>
        <b>💡 Key insight:</b> SNS applies the filter policy <b>before</b> delivering to your SQS queue. Dropped messages incur <b>zero SQS cost</b> and zero Lambda invocations. Filter early — process only what matters.
      </div>
    </div>
  );
}

// ─── NEW: SQS Knowledge Check ─────────────────────────────────────────────────
const SQS_QUIZ_QUESTIONS = [
  { question: "A consumer receives a message but crashes before calling DeleteMessage. What happens?", options: ["The message is permanently lost", "The message reappears in the queue after the VisibilityTimeout expires", "The message is immediately moved to the DLQ", "SQS sends a retry notification to the producer"], correct: 1, explanation: "SQS hides the message during VisibilityTimeout. If DeleteMessage is never called (consumer crash, timeout), the message becomes visible again and SQS redelivers it to any available consumer." },
  { question: "What is the maximum batch size for SQS SendMessageBatch and ReceiveMessage?", options: ["5 messages", "10 messages", "100 messages", "Unlimited"], correct: 1, explanation: "SQS supports batch operations of up to 10 messages per call. This reduces API calls by 10× and is one of the easiest cost optimizations available." },
  { question: "Long polling (WaitTimeSeconds=20) reduces costs because:", options: ["It compresses messages before sending", "It delays message delivery by 20 seconds", "It reduces the number of empty ReceiveMessage responses, cutting API call volume by ~90%", "It increases VisibilityTimeout automatically"], correct: 2, explanation: "Short polling returns immediately (often empty). Long polling waits up to 20 seconds for a message to arrive — drastically reducing the number of empty API calls which are still billed." },
  { question: "What is the key difference between SQS Standard and FIFO queues?", options: ["FIFO is slower but free; Standard is fast but paid", "Standard guarantees ordering; FIFO does not", "FIFO guarantees ordering + exactly-once delivery; Standard has at-least-once and best-effort ordering", "FIFO can store up to 14 days; Standard only 4 days"], correct: 2, explanation: "Standard queues offer higher throughput but at-least-once delivery and best-effort ordering. FIFO queues guarantee strict ordering per MessageGroupId and exactly-once delivery (5-minute deduplication window)." },
  { question: "When does SQS move a message to the Dead Letter Queue (DLQ)?", options: ["When processing takes longer than VisibilityTimeout", "When a message has been received more times than maxReceiveCount allows", "When the message body exceeds 256KB", "When no consumer has received the message within 24 hours"], correct: 1, explanation: "The RedrivePolicy's maxReceiveCount defines how many times SQS will attempt redelivery. After that count is exceeded, SQS automatically moves the message to the configured DLQ." },
  { question: "SNS filter policies are applied:", options: ["By the SQS queue after receiving the message", "By the Lambda function before processing", "By SNS before delivering to the subscriber — dropped messages cost nothing", "By the producer before publishing"], correct: 2, explanation: "SNS evaluates filter policies server-side before fan-out. Messages that don't match the policy are dropped and never reach your SQS queue, saving both SQS API costs and Lambda invocations." },
  { question: "The SQS Extended Client Library is needed when:", options: ["You have more than 10 concurrent consumers", "Your messages exceed the 256KB SQS payload limit", "You need FIFO ordering across regions", "You want to encrypt messages client-side"], correct: 1, explanation: "SQS has a hard 256KB message body limit. The Extended Client Library transparently stores the payload in S3, puts a reference in the SQS message, and retrieves it on receive — all automatically." },
];

function SQSQuizLesson({ meta }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ borderRadius: 10, padding: "14px 16px", background: "#fffbeb", border: "1px solid #fcd34d" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#92400e", marginBottom: 4 }}>☁️ AWS SQS · End-of-Course Knowledge Check</div>
        <div style={{ fontSize: 13, color: "#78350f", lineHeight: 1.6 }}>7 questions covering visibility timeout, batching, polling strategies, Standard vs FIFO, DLQ, SNS filtering, and the Extended Client. Aim for 80%+.</div>
      </div>
      <QuizBlock questions={SQS_QUIZ_QUESTIONS} color={meta.color} />
    </div>
  );
}

// ─── Component map ────────────────────────────────────────────────────────────
const LESSON_COMPONENTS = {
  "hello":               HelloWorldLesson,
  "work":                WorkQueuesLesson,
  "pubsub":              PubSubLesson,
  "routing":             RoutingLesson,
  "topics":              TopicsLesson,
  "rpc":                 RPCLesson,
  "stream-hello":        StreamHelloLesson,
  "stream-offset":       StreamOffsetLesson,
  "rmq-dlx":             DlxLesson,
  "rmq-confirms":        PublisherConfirmsLesson,
  "rmq-quorum":          QuorumQueuesLesson,
  "rmq-flow":            FlowControlLesson,
  "rmq-cluster":         ClusteringLesson,
  "kafka-hello":        KafkaHelloLesson,
  "kafka-partitions":    KafkaPartitionsLesson,
  "kafka-groups":        KafkaGroupsLesson,
  "kafka-offsets":       KafkaOffsetsLesson,
  "kafka-replication":   KafkaReplicationLesson,
  "kafka-producer":      KafkaProducerLesson,
  "kafka-schema":        KafkaSchemaLesson,
  "kafka-streams-api":   KafkaStreamsApiLesson,
  "kafka-connect":       KafkaConnectLesson,
  "kafka-transactions":  KafkaTransactionsLesson,
  "kafka-compaction":    KafkaCompactionLesson,
  "kafka-security":      KafkaSecurityLesson,
  "kafka-production":    KafkaProductionLesson,
  "sqs-hello":           SQSHelloLesson,
  "sqs-standard":        SQSStandardLesson,
  "sqs-polling":         SQSPollingLesson,
  "sqs-fifo":            SQSFIFOLesson,
  "sqs-dlq":             SQSDLQLesson,
  "sqs-lambda":          SQSLambdaLesson,
  "sqs-fanout":          SQSFanoutLesson,
  "sqs-filtering":       SQSFilteringLesson,
  "sqs-security":        SQSSecurityLesson,
  "sqs-production":      SQSProductionLesson,
  "sqs-visibility-sim":  SQSVisibilitySimulator,
  "sqs-cost-calc":       SQSCostCalculator,
  "sqs-filter-playground": SQSFilterPlayground,
  "sqs-quiz":            SQSQuizLesson,
  "istio-arch":          IstioArchLesson,
  "istio-routing":       IstioRoutingLesson,
  "istio-canary":        IstioCanaryLesson,
  "istio-fault":         IstioFaultLesson,
  "istio-circuit":       IstioCircuitLesson,
  "istio-gateway":       IstioGatewayLesson,
  "istio-mtls":          IstioMtlsLesson,
  "istio-authz":         IstioAuthzLesson,
  "istio-observe":       IstioObserveLesson,
  "istio-install":       IstioInstallLesson,
  "istio-service-entry": IstioServiceEntryLesson,
  "istio-egress":        IstioEgressLesson,
  "istio-jwt":           IstioJwtLesson,
  "istio-troubleshoot":  IstioTroubleshootLesson,
  "istio-mirror":        IstioMirrorLesson,
  "istio-sidecar":       IstioSidecarResourceLesson,
  "istio-lb":            IstioLbLesson,
  "istio-ambient":       IstioAmbientLesson,
  "istio-wasm":          IstioWasmLesson,
  // ── New interactive lessons ────────────────────────────────────────────────
  "rmq-quiz":            RabbitMQQuizLesson,
  "kafka-metrics-sim":   KafkaMetricsSimulator,
  "kafka-quiz":          KafkaQuizLesson,
  "istio-traffic-sim":   IstioTrafficSimulator,
  "istio-quiz":          IstioQuizLesson,
};

const GROUP_LABELS = { rabbitmq: "🐰 RabbitMQ", kafka: "⚡ Kafka", sqs: "☁️ AWS SQS", istio: "🔷 Istio" };
const GROUP_COLORS = { rabbitmq: "#f97316", kafka: "#6366f1", sqs: "#f59e0b", istio: "#0ea5e9" };

// ─── Home page data ───────────────────────────────────────────────────────────
const HOME_CARDS = [
  {
    key: "rabbitmq", num: "01",
    name: "RabbitMQ",
    subtitle: "AMQP Message Broker",
    color: "#f97316",
    bg: "#fff7f0",
    description: "From fundamentals to production-grade architecture. Covers exchanges, routing, streams, plus real-world scenarios: e-commerce pipelines, financial event sourcing, and HA cluster design.",
    features: ["Exchanges, Routing & Pub/Sub", "Publisher Confirms & Quorum Queues", "DLX, Flow Control & Clustering", "Production: E-commerce, Fintech & HA Cluster"],
    lessonCount: 13,
    stack: "Python · pika 1.3 · rstream",
  },
  {
    key: "kafka", num: "02",
    name: "Apache Kafka",
    subtitle: "Distributed Event Streaming",
    color: "#6366f1",
    bg: "#f0f0ff",
    description: "Master distributed event streaming: from hello-world to production pipelines. Topics, partitions, consumer groups, producer optimization, Schema Registry, Kafka Streams, Connect integration, security (TLS/SASL), and real-time analytics.",
    features: ["Hello & First Message", "Producer Batching & Acks", "Schema Registry & Avro", "Kafka Streams Topology", "Kafka Connect Integration", "Security & ACLs", "Production: Real-time Analytics"],
    lessonCount: 13,
    stack: "Python · confluent-kafka",
  },
  {
    key: "sqs", num: "03",
    name: "AWS SQS",
    subtitle: "Managed Cloud Queue Service",
    color: "#f59e0b",
    bg: "#fffbf0",
    description: "From hello-world to production order pipelines. Standard vs FIFO, polling, batching, Dead Letter Queues, Lambda triggers, SNS fan-out, message attributes & filtering, encryption & IAM security.",
    features: ["Hello & First Message", "Long Polling & Batching", "FIFO & Deduplication", "Dead Letter Queues", "Lambda Event Triggers", "SNS Fan-out", "Message Attributes & Filtering", "Security & Monitoring"],
    lessonCount: 10,
    stack: "Python · boto3",
  },
  {
    key: "istio", num: "04",
    name: "Istio Service Mesh",
    subtitle: "Kubernetes-Native Service Mesh",
    color: "#0ea5e9",
    bg: "#f0faff",
    description: "Learn service mesh patterns: sidecar architecture, intelligent traffic management, mutual TLS security, and zero-code observability.",
    features: ["Sidecar Injection & Architecture", "Canary, Fault Injection & Circuit Breaker", "Ingress Gateway & TLS", "mTLS, AuthzPolicy & Kiali"],
    lessonCount: 19,
    stack: "Kubernetes · Istio · YAML",
  },
];

// ─── Official Brand Logos ───────────────────────────────────────────────────────
// Images live in public/logos/ — import.meta.env.BASE_URL ensures correct
// prefix in both `vite dev` (/) and GitHub Pages (/messaging-queue-learning/)
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function RabbitMQLogo({ size = 48 }) {
  return (
    <img
      src={`${BASE}/logos/rabbitmq.jpeg`}
      alt="RabbitMQ"
      width={size} height={size}
      style={{ borderRadius: 12, objectFit: "contain", display: "block" }}
    />
  );
}

function KafkaLogo({ size = 48 }) {
  return (
    <img
      src={`${BASE}/logos/kafka.svg`}
      alt="Apache Kafka"
      width={size} height={size}
      style={{ borderRadius: 12, objectFit: "contain", display: "block", background: "#fff" }}
    />
  );
}

function SQSLogo({ size = 48 }) {
  return (
    <img
      src={`${BASE}/logos/images.png`}
      alt="Amazon SQS"
      width={size} height={size}
      style={{ borderRadius: 12, objectFit: "contain", display: "block" }}
    />
  );
}

function IstioLogo({ size = 48 }) {
  return (
    <img
      src={`${BASE}/logos/istio-logo.png`}
      alt="Istio"
      width={size} height={size}
      style={{ borderRadius: 12, objectFit: "contain", display: "block", background: "#fff" }}
    />
  );
}

const LOGO_COMPONENTS = {
  rabbitmq: RabbitMQLogo,
  kafka:    KafkaLogo,
  sqs:      SQSLogo,
  istio:    IstioLogo,
};

// ─── Decision Wizard ─────────────────────────────────────────────────────────
const DW_QUESTIONS = [
  { q: "What is your primary use case?", opts: [
    { t: "Task queues / background jobs", s: { rabbitmq: 3, kafka: 1, sqs: 3 } },
    { t: "Real-time streaming & analytics", s: { rabbitmq: 0, kafka: 4, sqs: 0 } },
    { t: "Microservice event bus", s: { rabbitmq: 3, kafka: 3, sqs: 2 } },
    { t: "Managed cloud queue (AWS-native)", s: { rabbitmq: 0, kafka: 1, sqs: 4 } },
  ]},
  { q: "What scale do you expect?", opts: [
    { t: "Thousands of messages/day", s: { rabbitmq: 3, kafka: 1, sqs: 3 } },
    { t: "Millions of messages/day", s: { rabbitmq: 2, kafka: 3, sqs: 2 } },
    { t: "Billions of messages/day", s: { rabbitmq: 0, kafka: 4, sqs: 1 } },
  ]},
  { q: "Do you need strict message ordering?", opts: [
    { t: "Yes, globally ordered", s: { rabbitmq: 1, kafka: 3, sqs: 1 } },
    { t: "Per-key / per-partition ordering is fine", s: { rabbitmq: 1, kafka: 4, sqs: 2 } },
    { t: "No — best-effort is OK", s: { rabbitmq: 3, kafka: 1, sqs: 3 } },
  ]},
  { q: "Do you need to replay past messages?", opts: [
    { t: "Yes — replay weeks of history", s: { rabbitmq: 0, kafka: 4, sqs: 0 } },
    { t: "Sometimes — requeue/redrive is enough", s: { rabbitmq: 3, kafka: 1, sqs: 3 } },
    { t: "No — fire-and-forget is fine", s: { rabbitmq: 3, kafka: 1, sqs: 3 } },
  ]},
  { q: "Where is your infrastructure?", opts: [
    { t: "AWS cloud, prefer managed services", s: { rabbitmq: 1, kafka: 2, sqs: 4 } },
    { t: "On-premise or multi-cloud", s: { rabbitmq: 3, kafka: 4, sqs: 0 } },
    { t: "Kubernetes (any cloud)", s: { rabbitmq: 2, kafka: 3, sqs: 1 } },
  ]},
];

const DW_RESULTS = {
  rabbitmq: { name: "RabbitMQ", icon: "🐰", color: "#f97316", key: "rabbitmq", why: "Best for task queues, pub/sub, and complex routing with low-to-medium scale. Rich protocol support (AMQP), mature ecosystem, easy to self-host." },
  kafka: { name: "Apache Kafka", icon: "⚡", color: "#6366f1", key: "kafka", why: "Best for high-throughput event streaming, real-time analytics, and replay-capable event log. Handles billions of messages with built-in partitioning and replication." },
  sqs: { name: "AWS SQS", icon: "☁️", color: "#f59e0b", key: "sqs", why: "Best for AWS-native workloads needing a fully managed, serverless queue. Zero ops, integrates natively with Lambda, SNS, and other AWS services." },
};

function DecisionWizard({ onNavigate }) {
  const [step, setStep] = useState(0);
  const [scores, setScores] = useState({ rabbitmq: 0, kafka: 0, sqs: 0 });
  const [done, setDone] = useState(false);
  const [selected, setSelected] = useState(null);

  const pick = (opt) => {
    const next = { rabbitmq: scores.rabbitmq + opt.s.rabbitmq, kafka: scores.kafka + opt.s.kafka, sqs: scores.sqs + opt.s.sqs };
    setScores(next);
    setSelected(null);
    if (step + 1 >= DW_QUESTIONS.length) setDone(true);
    else setStep(s => s + 1);
  };
  const reset = () => { setStep(0); setScores({ rabbitmq: 0, kafka: 0, sqs: 0 }); setDone(false); setSelected(null); };

  const winner = done ? Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0] : null;
  const result = winner ? DW_RESULTS[winner] : null;
  const totalMax = DW_QUESTIONS.length * 4;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#6366f1", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>Interactive Tool</div>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", margin: "0 0 10px", letterSpacing: -0.5 }}>Which Technology Should You Use?</h2>
        <p style={{ fontSize: 15, color: "#64748b", margin: 0 }}>Answer 5 questions to get a personalised recommendation.</p>
      </div>

      {!done ? (
        <div style={{ borderRadius: 16, background: "#ffffff", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
          {/* Progress */}
          <div style={{ height: 4, background: "#e8edf4" }}>
            <div style={{ height: "100%", width: `${((step) / DW_QUESTIONS.length) * 100}%`, background: "linear-gradient(90deg, #6366f1, #3b82f6)", transition: "width 0.4s ease" }} />
          </div>
          <div style={{ padding: "24px 24px 20px" }}>
            <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Question {step + 1} of {DW_QUESTIONS.length}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#1e293b", lineHeight: 1.4, marginBottom: 20 }}>{DW_QUESTIONS[step].q}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {DW_QUESTIONS[step].opts.map((opt, i) => (
                <button key={i} onClick={() => { setSelected(i); setTimeout(() => pick(opt), 200); }}
                  style={{ textAlign: "left", padding: "14px 18px", borderRadius: 10, border: `1.5px solid ${selected === i ? "#6366f1" : "#e2e8f0"}`, background: selected === i ? "#eef2ff" : "#f8fafc", color: selected === i ? "#4338ca" : "#334155", fontSize: 15, cursor: "pointer", fontFamily: "inherit", fontWeight: selected === i ? 700 : 500, transition: "all 0.15s", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 26, height: 26, borderRadius: "50%", border: `1.5px solid ${selected === i ? "#6366f1" : "#d1d5db"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: selected === i ? "#6366f1" : "#94a3b8", flexShrink: 0 }}>{["A","B","C","D"][i]}</span>
                  {opt.t}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ borderRadius: 16, background: "#ffffff", border: `2px solid ${result.color}40`, overflow: "hidden", boxShadow: `0 4px 32px ${result.color}20` }}>
          <div style={{ padding: "24px 24px 0", background: `linear-gradient(135deg, ${result.color}12, #ffffff)` }}>
            <div style={{ fontSize: 12, color: result.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Our Recommendation</div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: result.color + "20", border: `1.5px solid ${result.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>{result.icon}</div>
              <div>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a" }}>{result.name}</div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>Best match based on your answers</div>
              </div>
            </div>
            <p style={{ fontSize: 14, color: "#475569", lineHeight: 1.7, margin: "0 0 20px", paddingBottom: 20, borderBottom: "1px solid #e2e8f0" }}>{result.why}</p>
          </div>
          {/* Score breakdown */}
          <div style={{ padding: "18px 24px 20px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 14, textTransform: "uppercase", letterSpacing: 0.5 }}>Score Breakdown</div>
            {Object.entries(scores).sort((a, b) => b[1] - a[1]).map(([tech, score]) => {
              const r = DW_RESULTS[tech];
              const pct = Math.round((score / totalMax) * 100);
              return (
                <div key={tech} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#334155" }}>{r.icon} {r.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: r.color }}>{pct}%</span>
                  </div>
                  <div style={{ height: 8, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: r.color, borderRadius: 99, transition: "width 0.6s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ padding: "0 24px 24px", display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => onNavigate(result.key)}
              style={{ flex: 1, padding: "12px 20px", borderRadius: 10, border: "none", background: result.color, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
              Start {result.name} Course →
            </button>
            <button onClick={reset}
              style={{ padding: "12px 20px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#64748b", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
              Retake
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Platform Navbar ──────────────────────────────────────────────────────────
function PlatformNav({ onHome, courseColor, courseName }) {
  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 100,
      background: "rgba(255,255,255,0.97)", backdropFilter: "blur(20px)",
      borderBottom: "1px solid #e2e8f0",
      padding: "0 24px", height: 58,
      display: "flex", alignItems: "center", gap: 20,
    }}>
      {/* Logo */}
      <div
        onClick={onHome}
        style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", flexShrink: 0, userSelect: "none" }}
      >
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: "linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 19, boxShadow: "0 2px 12px #6366f150",
        }}>⚡</div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", letterSpacing: -0.4, lineHeight: 1 }}>DevMesh</div>
          <div style={{ fontSize: 11, color: "#475569", letterSpacing: 1, textTransform: "uppercase", lineHeight: 1, marginTop: 2 }}>Learn</div>
        </div>
      </div>

      {/* Breadcrumb */}
      {courseName ? (
        <>
          <div style={{ width: 1, height: 20, background: "#e8edf4", flexShrink: 0 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, minWidth: 0 }}>
            <span
              onClick={onHome}
              style={{ color: "#64748b", cursor: "pointer", whiteSpace: "nowrap", transition: "color 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.color = "#94a3b8"}
              onMouseLeave={e => e.currentTarget.style.color = "#475569"}
            >Courses</span>
            <span style={{ color: "#475569", fontSize: 18, lineHeight: 1 }}>›</span>
            <span style={{ color: courseColor, fontWeight: 700, whiteSpace: "nowrap" }}>{courseName}</span>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", gap: 24, marginLeft: 8 }}>
          {["Courses", "Community", "Docs"].map(item => (
            <span key={item} style={{ fontSize: 15, color: "#64748b", cursor: "pointer", transition: "color 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.color = "#94a3b8"}
              onMouseLeave={e => e.currentTarget.style.color = "#475569"}
            >{item}</span>
          ))}
        </div>
      )}

      {/* Right side */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          height: 30, padding: "0 14px", borderRadius: 8,
          background: "transparent", border: "1px solid #d1d9e6",
          display: "flex", alignItems: "center", fontSize: 14, color: "#64748b",
          cursor: "pointer", transition: "all 0.15s",
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#94a3b8"; e.currentTarget.style.color = "#475569"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#d1d9e6"; e.currentTarget.style.color = "#64748b"; }}
        >Sign in</div>
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 700, color: "#fff", cursor: "pointer",
          boxShadow: "0 2px 8px #7c3aed40",
        }}>R</div>
      </div>
    </nav>
  );
}

// ─── Home Page ────────────────────────────────────────────────────────────────
function HomePage({ onNavigate }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", color: "#475569" }}>
      <style>{ANIM_CSS}</style>
      <PlatformNav onHome={() => {}} />

      {/* Hero */}
      <div style={{
        position: "relative", overflow: "hidden",
        background: "linear-gradient(180deg, #eef2ff 0%, #f8fafc 100%)",
        padding: "72px 24px 64px",
        borderBottom: "1px solid #e2e8f0",
      }}>
        {/* Grid bg */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.04,
          backgroundImage: "linear-gradient(#cbd5e1 1px, transparent 1px), linear-gradient(90deg, #cbd5e1 1px, transparent 1px)",
          backgroundSize: "32px 32px", pointerEvents: "none",
        }} />
        {/* Glow orbs */}
        <div style={{ position: "absolute", top: -80, left: "20%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, #6366f118 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: -60, right: "15%", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, #0ea5e912 0%, transparent 70%)", pointerEvents: "none" }} />

        <div style={{ maxWidth: 820, margin: "0 auto", textAlign: "center", position: "relative" }}>
          {/* Badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "5px 16px 5px 10px", borderRadius: 99,
            background: "#ffffff", border: "1px solid #d1d9e6",
            marginBottom: 28, fontSize: 14, color: "#64748b",
          }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e80" }} />
            Interactive learning platform · No signup required
          </div>

          {/* Headline */}
          <h1 style={{ fontSize: "clamp(28px, 5vw, 50px)", fontWeight: 800, color: "#0f172a", letterSpacing: -1.2, lineHeight: 1.12, margin: "0 0 22px" }}>
            Master Modern{" "}
            <span style={{ background: "linear-gradient(90deg, #818cf8, #60a5fa, #38bdf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Messaging</span>
            {" & "}
            <span style={{ background: "linear-gradient(90deg, #38bdf8, #34d399)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Service Mesh</span>
          </h1>

          <p style={{ fontSize: 19, color: "#64748b", lineHeight: 1.75, maxWidth: 540, margin: "0 auto 44px" }}>
            Step-through animated visualizations with runnable code examples and real-world analogies. Learn how distributed systems work, one interaction at a time.
          </p>

          {/* CTAs */}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 52 }}>
            <button
              onClick={() => onNavigate("rabbitmq")}
              style={{
                padding: "12px 28px", borderRadius: 10, border: "none",
                background: "linear-gradient(135deg, #6366f1, #3b82f6)",
                color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer",
                boxShadow: "0 4px 20px #6366f140",
                transition: "all 0.2s",
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 30px #6366f160"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 20px #6366f140"; }}
            >Start Learning Free →</button>
            <button
              onClick={() => document.getElementById("courses-section")?.scrollIntoView({ behavior: "smooth" })}
              style={{
                padding: "12px 28px", borderRadius: 10,
                background: "transparent", border: "1px solid #d1d9e6",
                color: "#64748b", fontSize: 16, fontWeight: 600, cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#94a3b8"; e.currentTarget.style.color = "#1e293b"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#d1d9e6"; e.currentTarget.style.color = "#94a3b8"; }}
            >Browse Courses</button>
          </div>

          {/* Stats */}
          <div style={{
            display: "inline-flex",
            background: "#ffffff", border: "1px solid #e8edf4", borderRadius: 16,
            overflow: "hidden",
          }}>
            {[
              { val: "4", lbl: "Courses", icon: "📚" },
              { val: "25+", lbl: "Lessons", icon: "🎯" },
              { val: "100%", lbl: "Free", icon: "🎁" },
              { val: "Live", lbl: "Visualizers", icon: "⚡" },
            ].map(({ val, lbl, icon }, i, arr) => (
              <div key={lbl} style={{
                padding: "18px 28px", textAlign: "center",
                borderRight: i < arr.length - 1 ? "1px solid #e8edf4" : "none",
              }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 4, letterSpacing: 0.3 }}>{lbl}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Decision Wizard Section */}
      <div style={{ background: "linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0", padding: "56px 24px" }}>
        <DecisionWizard onNavigate={onNavigate} />
      </div>

      {/* Courses section */}
      <div id="courses-section" style={{ maxWidth: 1120, margin: "0 auto", padding: "60px 24px 80px" }}>
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#475569", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>What you'll learn</div>
          <h2 style={{ fontSize: 30, fontWeight: 800, color: "#0f172a", margin: "0 0 10px", letterSpacing: -0.5 }}>Browse Courses</h2>
          <p style={{ fontSize: 16, color: "#64748b", margin: 0, maxWidth: 480 }}>Pick a technology and start learning through interactive step-by-step visualizations</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 24 }}>
          {HOME_CARDS.map((card, i) => (
            <TechCard key={card.key} card={card} onNavigate={onNavigate} index={i} />
          ))}
        </div>
      </div>

      {/* Features strip */}
      <div style={{ borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", padding: "40px 24px" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 32 }}>
          {[
            { icon: "🎬", title: "Animated Visualizers", desc: "Step through each concept with live animated diagrams" },
            { icon: "🔬", title: "Real World Analogies", desc: "Every lesson comes with an intuitive real-world explanation" },
            { icon: "💻", title: "Runnable Code", desc: "Copy-paste Python and YAML examples for every scenario" },
            { icon: "📈", title: "Track Progress", desc: "Pick up exactly where you left off in any course" },
          ].map(f => (
            <div key={f.title} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ fontSize: 26, flexShrink: 0, marginTop: 2 }}>{f.icon}</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#475569", marginBottom: 4 }}>{f.title}</div>
                <div style={{ fontSize: 14.5, color: "#64748b", lineHeight: 1.6 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: "28px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 14, color: "#475569" }}>
          RabbitMQ pika 1.3 · Kafka confluent-kafka · AWS SQS boto3 · Istio 1.20+
        </div>
      </div>
    </div>
  );
}

// ─── Course Card ──────────────────────────────────────────────────────────────
function TechCard({ card, onNavigate, index = 0 }) {
  const [hovered, setHovered] = useState(false);
  const ratings  = { rabbitmq: { stars: 4.9, count: "3.4k" }, kafka: { stars: 4.7, count: "1.8k" }, sqs: { stars: 4.6, count: "945" }, istio: { stars: 4.9, count: "3.2k" } };
  const levels   = { rabbitmq: "Advanced", kafka: "Intermediate", sqs: "Beginner", istio: "Advanced" };
  const durations = { rabbitmq: "~6 hrs", kafka: "~2.5 hrs", sqs: "~1 hr", istio: "~6 hrs" };
  const levelColor = { Beginner: "#22c55e", Intermediate: "#f59e0b", Advanced: "#ef4444" };
  const rating = ratings[card.key];
  const level  = levels[card.key];

  return (
    <div
      onClick={() => onNavigate(card.key)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 16, overflow: "hidden", cursor: "pointer", userSelect: "none",
        background: "#ffffff",
        border: `1px solid ${hovered ? card.color + "50" : "#94a3b8"}`,
        boxShadow: hovered ? `0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px ${card.color}20` : "0 2px 8px rgba(0,0,0,0.3)",
        transform: hovered ? "translateY(-6px)" : "translateY(0)",
        transition: "all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
        animation: `fadeUp 0.4s ease-out ${index * 0.08}s backwards`,
      }}
    >
      {/* Thumbnail */}
      {(() => {
        const LogoComp = LOGO_COMPONENTS[card.key];
        return (
          <div style={{
            height: 148, position: "relative",
            background: `linear-gradient(145deg, ${card.bg} 0%, ${card.color}18 100%)`,
            borderBottom: `1px solid ${card.color}15`,
            display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
          }}>
            {/* Subtle dot grid */}
            <div style={{
              position: "absolute", inset: 0, opacity: 0.05,
              backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
              backgroundSize: "20px 20px", pointerEvents: "none",
            }} />
            {/* Glow behind logo */}
            <div style={{
              position: "absolute", width: 100, height: 100, borderRadius: "50%",
              background: `radial-gradient(circle, ${card.color}30 0%, transparent 70%)`,
              pointerEvents: "none",
            }} />
            {/* Official logo */}
            <div style={{
              position: "relative", zIndex: 1,
              filter: "drop-shadow(0 6px 24px rgba(0,0,0,0.5))",
              transform: hovered ? "scale(1.1)" : "scale(1)",
              transition: "transform 0.35s cubic-bezier(0.34,1.56,0.64,1)",
            }}>
              {LogoComp ? <LogoComp size={60} /> : null}
            </div>
            {/* Course number — top left */}
            <div style={{
              position: "absolute", top: 12, left: 12,
              fontSize: 13, fontWeight: 800, letterSpacing: 0.5,
              color: card.color,
              background: "rgba(255,255,255,0.88)", backdropFilter: "blur(8px)",
              padding: "3px 9px", borderRadius: 6,
              border: `1px solid ${card.color}30`,
            }}>Course {card.num}</div>
            {/* Level badge — top right */}
            <div style={{
              position: "absolute", top: 12, right: 12,
              padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700,
              background: "rgba(255,255,255,0.88)", backdropFilter: "blur(8px)",
              color: levelColor[level], border: `1px solid ${levelColor[level]}30`,
              letterSpacing: 0.3,
            }}>{level}</div>
            {/* Lessons count — bottom left */}
            <div style={{
              position: "absolute", bottom: 12, left: 12,
              padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
              background: "rgba(255,255,255,0.88)", backdropFilter: "blur(8px)",
              color: "#64748b",
            }}>📖 {card.lessonCount} lessons</div>
          </div>
        );
      })()}

      {/* Content */}
      <div style={{ padding: "18px 18px 20px" }}>
        <div style={{
          fontSize: 12, color: card.color, fontWeight: 700,
          letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6,
        }}>{card.subtitle}</div>

        <h3 style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", margin: "0 0 8px", lineHeight: 1.3, letterSpacing: -0.2 }}>{card.name}</h3>

        <p style={{
          fontSize: 14.5, color: "#64748b", lineHeight: 1.65, margin: "0 0 14px",
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>{card.description}</p>

        {/* Star rating */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: "#fbbf24" }}>{rating.stars}</span>
          <div style={{ display: "flex", gap: 1 }}>
            {[1, 2, 3, 4, 5].map(s => (
              <span key={s} style={{ fontSize: 13, color: s <= Math.floor(rating.stars) ? "#fbbf24" : "#94a3b8" }}>★</span>
            ))}
          </div>
          <span style={{ fontSize: 13, color: "#475569" }}>({rating.count} ratings)</span>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 14, borderTop: `1px solid #e8edf4` }}>
          <span style={{ fontSize: 13, color: "#475569" }}>⏱ {durations[card.key]}</span>
          <div style={{
            padding: "6px 16px", borderRadius: 8, fontSize: 14, fontWeight: 700,
            background: hovered ? card.color : card.color + "18",
            color: hovered ? "#fff" : card.color,
            border: `1px solid ${hovered ? "transparent" : card.color + "30"}`,
            transition: "all 0.2s",
            boxShadow: hovered ? `0 2px 12px ${card.color}50` : "none",
          }}>
            {hovered ? "Enroll Now →" : "View Course"}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tech Page (lesson viewer for one group) ──────────────────────────────────
function TechPage({ group, onHome }) {
  const groupLessons = LESSONS_META.filter(l => l.group === group);
  const [activeIdx, setActiveIdx] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const safeIdx = Math.min(activeIdx, groupLessons.length - 1);
  const lesson = groupLessons[safeIdx];
  const LessonComp = LESSON_COMPONENTS[lesson.id];
  const color = GROUP_COLORS[group];
  const card = HOME_CARDS.find(c => c.key === group);
  const progress = Math.round(((safeIdx + 1) / groupLessons.length) * 100);

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", color: "#475569", display: "flex", flexDirection: "column" }}>
      <style>{ANIM_CSS}</style>
      <PlatformNav onHome={onHome} courseColor={color} courseName={card?.name} />

      {/* Thin progress bar under nav */}
      <div style={{ height: 3, background: "#94a3b8", flexShrink: 0 }}>
        <div style={{
          height: "100%", width: `${progress}%`,
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          transition: "width 0.5s ease", borderRadius: "0 2px 2px 0",
        }} />
      </div>

      {/* Page body */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, position: "relative" }}>

        {/* ── Sidebar ── */}
        <aside style={{
          width: sidebarOpen ? 288 : 0,
          minWidth: sidebarOpen ? 288 : 0,
          background: "#f5f7fa",
          borderRight: "1px solid #e2e8f0",
          height: "calc(100vh - 61px)",
          overflowY: sidebarOpen ? "auto" : "hidden",
          overflowX: "hidden",
          position: "sticky",
          top: 61,
          flexShrink: 0,
          transition: "width 0.28s ease, min-width 0.28s ease",
        }}>
          {sidebarOpen && (
            <div>
              {/* Sidebar course header */}
              <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  {(() => {
                    const SidebarLogo = LOGO_COMPONENTS[group];
                    return (
                      <div style={{ flexShrink: 0 }}>
                        {SidebarLogo ? <SidebarLogo size={42} /> : null}
                      </div>
                    );
                  })()}
                  <div>
                    <div style={{ fontSize: 13, color: "#475569", fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 2 }}>Course {card?.num}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>{card?.name}</div>
                    <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{card?.subtitle}</div>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: "#64748b" }}>Course progress</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color }}>
                    {safeIdx + 1}/{groupLessons.length} lessons
                  </span>
                </div>
                <div style={{ height: 6, background: "#e8edf4", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${progress}%`,
                    background: `linear-gradient(90deg, ${color}90, ${color})`,
                    transition: "width 0.4s ease", borderRadius: 99,
                  }} />
                </div>
                <div style={{ fontSize: 12, color: "#475569", marginTop: 6 }}>{progress}% complete</div>
              </div>

              {/* Lesson list */}
              <div style={{ padding: "10px 0 20px" }}>
                <div style={{
                  padding: "8px 20px 6px", fontSize: 12, fontWeight: 700,
                  color: "#475569", letterSpacing: 1.2, textTransform: "uppercase",
                }}>Course Content</div>

                {groupLessons.map((l, i) => (
                  <div
                    key={l.id}
                    onClick={() => setActiveIdx(i)}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 12,
                      padding: "10px 20px", cursor: "pointer",
                      background: i === safeIdx ? `${color}14` : "transparent",
                      borderLeft: `3px solid ${i === safeIdx ? color : "transparent"}`,
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={e => { if (i !== safeIdx) e.currentTarget.style.background = "#ffffff"; }}
                    onMouseLeave={e => { if (i !== safeIdx) e.currentTarget.style.background = "transparent"; }}
                  >
                    {/* Step indicator */}
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: i < safeIdx ? color : i === safeIdx ? color + "22" : "#94a3b8",
                      border: `1.5px solid ${i <= safeIdx ? color : "#e8edf4"}`,
                      fontSize: 12, fontWeight: 800,
                      color: i < safeIdx ? "#fff" : i === safeIdx ? color : "#94a3b8",
                    }}>
                      {i < safeIdx ? "✓" : l.num}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 14.5, fontWeight: i === safeIdx ? 700 : 400,
                        lineHeight: 1.4,
                        color: i === safeIdx ? "#1e293b" : i < safeIdx ? "#475569" : "#64748b",
                      }}>
                        {l.title.split("–")[1]?.trim() || l.title}
                      </div>
                      <div style={{ fontSize: 12.5, color: "#475569", marginTop: 2, lineHeight: 1.4 }}>
                        {(l.subtitle || "").slice(0, 48)}{(l.subtitle || "").length > 48 ? "…" : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Sidebar toggle tab */}
        <div
          onClick={() => setSidebarOpen(o => !o)}
          style={{
            position: "sticky", top: "50vh", alignSelf: "flex-start",
            width: 20, height: 56, marginTop: "20vh",
            background: "#ffffff", border: "1px solid #e8edf4",
            borderLeft: "none", borderRadius: "0 8px 8px 0",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", flexShrink: 0, zIndex: 10,
            color: "#475569", fontSize: 12, transition: "all 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "#e8edf4"; e.currentTarget.style.color = color; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#ffffff"; e.currentTarget.style.color = "#334155"; }}
        >
          {sidebarOpen ? "‹" : "›"}
        </div>

        {/* ── Main content ── */}
        <main style={{ flex: 1, minWidth: 0, padding: "28px 32px 56px", overflowX: "hidden" }}>

          {/* Lesson header card */}
          <div style={{
            background: "#ffffff", border: "1px solid #e2e8f0",
            borderRadius: 16, padding: "22px 24px", marginBottom: 24,
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span style={{
                    padding: "3px 12px", borderRadius: 6,
                    background: color + "18", color, fontSize: 13, fontWeight: 700,
                    border: `1px solid ${color}28`, letterSpacing: 0.3,
                  }}>Lesson {lesson.num}</span>
                  <span style={{ fontSize: 13, color: "#475569" }}>·</span>
                  <span style={{ fontSize: 13, color: "#475569" }}>{card?.name}</span>
                </div>
                <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", margin: "0 0 8px", letterSpacing: -0.4, lineHeight: 1.25 }}>
                  {lesson.title}
                </h1>
                <p style={{ fontSize: 15.5, color: "#64748b", margin: 0, lineHeight: 1.6 }}>{lesson.subtitle}</p>
              </div>

              {/* Prev / Next controls */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                <button
                  onClick={() => setActiveIdx(i => Math.max(0, i - 1))}
                  disabled={safeIdx === 0}
                  style={{
                    padding: "8px 16px", borderRadius: 9, fontSize: 15, fontWeight: 600,
                    background: "#e8edf4",
                    border: `1px solid ${safeIdx === 0 ? "#ffffff" : "#d1d9e6"}`,
                    color: safeIdx === 0 ? "#94a3b8" : "#64748b",
                    cursor: safeIdx === 0 ? "not-allowed" : "pointer", transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { if (safeIdx > 0) { e.currentTarget.style.color = "#0f172a"; e.currentTarget.style.borderColor = "#94a3b8"; } }}
                  onMouseLeave={e => { e.currentTarget.style.color = safeIdx === 0 ? "#94a3b8" : "#64748b"; e.currentTarget.style.borderColor = safeIdx === 0 ? "#ffffff" : "#d1d9e6"; }}
                >← Prev</button>

                <button
                  onClick={() => setActiveIdx(i => Math.min(groupLessons.length - 1, i + 1))}
                  disabled={safeIdx === groupLessons.length - 1}
                  style={{
                    padding: "8px 20px", borderRadius: 9, fontSize: 15, fontWeight: 700,
                    background: safeIdx < groupLessons.length - 1 ? color : "#ffffff",
                    border: `1px solid ${safeIdx < groupLessons.length - 1 ? "transparent" : "#ffffff"}`,
                    color: safeIdx < groupLessons.length - 1 ? "#fff" : "#94a3b8",
                    cursor: safeIdx === groupLessons.length - 1 ? "not-allowed" : "pointer",
                    transition: "all 0.15s",
                    boxShadow: safeIdx < groupLessons.length - 1 ? `0 3px 16px ${color}50` : "none",
                  }}
                >Next →</button>
              </div>
            </div>
          </div>

          {/* Concept + Visualizer columns */}
          <div style={{ display: "flex", gap: 22, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ width: 272, minWidth: 248, flexShrink: 0 }}>
              <ConceptPanel lesson={lesson} color={color} />
            </div>
            <div style={{ flex: 1, minWidth: 300, display: "flex", flexDirection: "column", gap: 14 }}>
              <LessonComp key={lesson.id} meta={lesson} />
            </div>
          </div>

          {/* Production Scenarios — RabbitMQ */}
          {group === "rabbitmq" && <RabbitMQProductionLab />}

          {/* Production Scenarios — Istio */}
          {group === "istio" && (
            <div style={{ marginTop: 40 }}>
              <IstioProductionLab />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ─── App (page router) ────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("home"); // "home" | "rabbitmq" | "kafka" | "sqs" | "istio"

  if (page === "home") {
    return <HomePage onNavigate={setPage} />;
  }
  return <TechPage group={page} onHome={() => setPage("home")} />;
}
