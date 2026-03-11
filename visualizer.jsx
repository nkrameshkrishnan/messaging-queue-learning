import { useState, useCallback, useEffect } from "react";

// ─── Utilities ───────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

function hashPartition(key) {
  let h = 5381;
  for (const c of key) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
  return h % 3;
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  producer:  { bg: "#0c1e38", border: "#3b82f6", text: "#93c5fd", glow: "#3b82f630" },
  exchange:  { bg: "#1a0a38", border: "#a855f7", text: "#d8b4fe", glow: "#a855f730" },
  queue:     { bg: "#1c0c00", border: "#f97316", text: "#fdba74", glow: "#f9731630" },
  consumer:  { bg: "#022c1c", border: "#22c55e", text: "#86efac", glow: "#22c55e30" },
  partition: { bg: "#0a0a28", border: "#6366f1", text: "#a5b4fc", glow: "#6366f130" },
  dlq:       { bg: "#1c0606", border: "#ef4444", text: "#fca5a5", glow: "#ef444430" },
};
const PART_COLS = ["#6366f1", "#ec4899", "#f59e0b"];

// ─── Shared primitives ────────────────────────────────────────────────────────
function FlowNode({ tok, icon, label, sub, active, dimmed, w = 120 }) {
  return (
    <div
      className="rounded-xl px-3 py-2 text-center transition-all duration-300 select-none"
      style={{
        width: w,
        minWidth: w,
        background: active ? tok.border + "25" : dimmed ? "#080808" : tok.bg,
        border: `2px solid ${active ? tok.border : dimmed ? "#1a1a1a" : tok.border + "60"}`,
        boxShadow: active ? `0 0 22px ${tok.glow}` : "none",
        transform: active ? "scale(1.07)" : "scale(1)",
        opacity: dimmed ? 0.3 : 1,
      }}
    >
      <div style={{ fontSize: 20 }}>{icon}</div>
      <div className="text-xs font-bold font-mono leading-tight mt-0.5" style={{ color: active ? tok.border : dimmed ? "#333" : tok.text }}>
        {label}
      </div>
      {sub && (
        <div className="text-xs font-mono leading-tight mt-0.5 opacity-60" style={{ color: tok.text }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function Arrow({ on, color = "#1e293b", label = "" }) {
  return (
    <div className="flex flex-col items-center mx-1 shrink-0">
      <div className="flex items-center">
        <div className="h-0.5 w-8 transition-all duration-300" style={{ background: on ? color : "#1e293b" }} />
        <div style={{
          borderTop: "5px solid transparent",
          borderBottom: "5px solid transparent",
          borderLeft: `7px solid ${on ? color : "#1e293b"}`,
          transition: "border-color .3s",
        }} />
      </div>
      {label && (
        <div className="text-xs font-mono text-center mt-0.5 leading-tight" style={{ color: on ? color : "#2d3748", maxWidth: 68 }}>
          {label}
        </div>
      )}
    </div>
  );
}

function Pill({ label, active, color = "#6366f1", onClick }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-0.5 rounded-full text-xs font-mono transition-all"
      style={{
        background: active ? color + "25" : "#0f172a",
        border: `1px solid ${active ? color : "#374151"}`,
        color: active ? color : "#6b7280",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

// ─── Narrative box ────────────────────────────────────────────────────────────
function Narrative({ text, color = "#a855f7" }) {
  if (!text) return null;
  return (
    <div
      className="rounded-xl px-4 py-3 mt-3 text-sm font-mono leading-relaxed transition-all duration-300"
      style={{ background: color + "12", border: `1px solid ${color}50`, color: "#e2e8f0" }}
    >
      {text}
    </div>
  );
}

// ─── Concept side-panel ───────────────────────────────────────────────────────
function ConceptPanel({ lesson }) {
  return (
    <div className="space-y-3">
      {/* Title card */}
      <div className="rounded-xl p-3.5" style={{ background: "#080e1a", border: "1px solid #1e293b" }}>
        <div className="text-xs font-mono font-bold mb-1" style={{ color: "#475569" }}>
          LESSON {lesson.num}
        </div>
        <div className="text-base font-bold text-white leading-tight">{lesson.title}</div>
        <div className="text-xs text-gray-400 mt-1 leading-relaxed">{lesson.subtitle}</div>
      </div>

      {/* Real-world analogy */}
      <div className="rounded-xl p-3.5" style={{ background: "#061406", border: "1px solid #14532d" }}>
        <div className="flex items-center gap-2 mb-2">
          <span style={{ fontSize: 22 }}>{lesson.analogy.icon}</span>
          <div>
            <div className="text-xs font-mono font-bold" style={{ color: "#22c55e" }}>REAL WORLD ANALOGY</div>
            <div className="text-xs font-bold text-white">{lesson.analogy.scenario}</div>
          </div>
        </div>
        <p className="text-xs text-gray-300 leading-relaxed">{lesson.analogy.text}</p>
      </div>

      {/* Key terms */}
      <div className="rounded-xl p-3.5" style={{ background: "#080e1a", border: "1px solid #1e293b" }}>
        <div className="text-xs font-mono font-bold mb-2.5" style={{ color: "#475569" }}>📚 KEY TERMS</div>
        <div className="space-y-3">
          {lesson.terms.map((t, i) => (
            <div key={i} className="flex gap-2">
              <div
                className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-mono font-bold self-start mt-0.5"
                style={{ background: "#1e293b", color: "#e2e8f0" }}
              >
                {t.icon}
              </div>
              <div>
                <div className="text-xs font-bold font-mono text-white">{t.term}</div>
                <div className="text-xs text-gray-400 leading-relaxed mt-0.5">{t.def}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Lesson data ──────────────────────────────────────────────────────────────
const RMQ_LESSONS = [
  {
    id: "queue",
    num: "01",
    title: "The Basic Queue",
    subtitle: "Messages wait safely until a worker is ready to process them.",
    analogy: {
      icon: "☕",
      scenario: "Coffee Shop Order Queue",
      text: "You order a coffee. The cashier writes your order on a slip and pins it to a rail. The barista takes slips one by one. Even if 10 people order at once, no order is lost — they wait safely on the rail. If a barista goes on break, slips keep piling up until they return.",
    },
    terms: [
      { icon: "📦", term: "Producer", def: "The app that creates and sends messages. Like the cashier writing order slips." },
      { icon: "📋", term: "Queue", def: "A waiting line of messages. They stay here until a consumer picks them up. Like the order slip rail." },
      { icon: "👤", term: "Consumer", def: "The service that reads and processes messages. Like the barista making the drinks." },
      { icon: "✅", term: "ACK (Acknowledgement)", def: "The consumer tells RabbitMQ 'I finished processing this — delete it.' Until ACK is sent, the message is safe. If the consumer crashes, the message is re-delivered automatically." },
    ],
    type: "basic",
  },
  {
    id: "direct",
    num: "02",
    title: "Direct Exchange",
    subtitle: "Route messages to the right service using an exact label (routing key).",
    analogy: {
      icon: "📮",
      scenario: "Office Mail Room",
      text: "Letters arrive at the mail room with a department label: 'Finance', 'HR', 'Engineering'. The mail sorter reads the label and puts each letter in the right pigeonhole. Only the Finance department gets Finance mail. A letter labeled 'unknown' has no pigeonhole — it's dropped.",
    },
    terms: [
      { icon: "📫", term: "Exchange", def: "A smart router sitting between the producer and queues. The producer sends to the exchange — NOT directly to a queue." },
      { icon: "🏷️", term: "Routing Key", def: "A label on each message (like a department name). The exchange uses this to decide which queue gets the message." },
      { icon: "🔗", term: "Binding", def: "A rule connecting an exchange to a queue. Example: 'if routing key = payment → send to payment_queue'." },
    ],
    type: "direct",
    defKey: "payment",
    keys: ["payment", "shipping", "error", "unknown"],
    queues: [
      { id: "q1", label: "payment_queue",  bind: "payment",  consumer: "Payment Service",  icon: "💳" },
      { id: "q2", label: "shipping_queue", bind: "shipping", consumer: "Shipping Service", icon: "🚚" },
      { id: "q3", label: "error_queue",    bind: "error",    consumer: "Error Handler",    icon: "⚠️" },
    ],
  },
  {
    id: "fanout",
    num: "03",
    title: "Fanout Exchange",
    subtitle: "Broadcast the same message to ALL queues at once — routing key ignored.",
    analogy: {
      icon: "📢",
      scenario: "Company-wide Announcement Email",
      text: "The CEO sends 'We hit our sales goal!' to the entire company. Every department — Finance, HR, Engineering, Marketing — gets a copy. Nobody is excluded. Nobody needs to be individually addressed. Everybody gets the same news simultaneously.",
    },
    terms: [
      { icon: "📡", term: "Fanout Exchange", def: "Copies every message to ALL bound queues. The routing key is completely ignored — irrelevant." },
      { icon: "📋→📋", term: "Fan-out", def: "One message becomes N copies — one per bound queue. Like a photocopier that automatically distributes to every inbox." },
      { icon: "🆓", term: "Independent Consumers", def: "Each consumer gets their own copy. Payment charges the card; Notifications sends an email; Analytics logs the sale — all independently, simultaneously." },
    ],
    type: "fanout",
    queues: [
      { id: "f1", label: "payment_fanout",   consumer: "Payment Service",      icon: "💳" },
      { id: "f2", label: "notif_fanout",     consumer: "Notification Service", icon: "🔔" },
      { id: "f3", label: "analytics_fanout", consumer: "Analytics Service",    icon: "📊" },
    ],
  },
  {
    id: "topic",
    num: "04",
    title: "Topic Exchange",
    subtitle: "Wildcard routing — subscribe to patterns, not exact keys.",
    analogy: {
      icon: "📰",
      scenario: "News Subscription Service",
      text: "You can subscribe to 'sports.*' (all sports news) or 'world.#' (everything world-related at any depth). One person only gets sports headlines; another gets every world news article ever published. A routing key like 'order.eu.failed' could match multiple subscribers at once.",
    },
    terms: [
      { icon: "*", term: "* (star wildcard)", def: "Matches exactly ONE word. Example: 'order.eu.*' matches 'order.eu.placed' and 'order.eu.failed' — but NOT 'order.eu.sub.failed' (that's two words after .eu)." },
      { icon: "#", term: "# (hash wildcard)", def: "Matches ZERO or MORE words. Example: 'order.#' matches 'order.placed', 'order.eu.placed', 'order.eu.sub.placed' — anything that starts with 'order'." },
      { icon: "🎯", term: "Pattern Binding", def: "Queues bind to patterns instead of exact keys. A message can match multiple patterns and be delivered to multiple queues simultaneously." },
    ],
    type: "topic",
    defKey: "order.eu.failed",
    keys: ["order.eu.failed", "order.us-east.pending", "order.apac.placed", "payment.eu.failed"],
    queues: [
      { id: "t1", label: "all_orders",  pattern: "order.#",               consumer: "All Orders Svc",  icon: "📋" },
      { id: "t2", label: "eu_queue",    pattern: "order.eu.*",            consumer: "EU Service",      icon: "🌍" },
      { id: "t3", label: "failures",    pattern: "*.*.failed",            consumer: "Failure Handler", icon: "⚠️" },
      { id: "t4", label: "us_pending",  pattern: "order.us-east.pending", consumer: "US Pending Svc",  icon: "🇺🇸" },
    ],
  },
];

const KAFKA_LESSONS = [
  {
    id: "topic",
    num: "01",
    title: "Topics, Partitions & Offsets",
    subtitle: "Kafka is a permanent, ordered log — messages are never deleted after reading.",
    analogy: {
      icon: "📚",
      scenario: "Public Library Archive",
      text: "A library never throws away books after someone reads them. Each book (message) gets a permanent shelf number (offset). Anyone can borrow the same book; reading it doesn't remove it. New books are always added to the end of the shelf. You can always say 'I want to re-read from book #5 onwards'.",
    },
    terms: [
      { icon: "📋", term: "Topic", def: "A named, ordered stream of messages. Like a dedicated shelf in the library. You publish to a topic; consumers subscribe to it." },
      { icon: "📍", term: "Offset", def: "A sequential number for each message: 0, 1, 2, 3... Like page numbers. You can always seek back and re-read from any offset." },
      { icon: "🗂️", term: "Partition", def: "A topic is split into partitions for parallelism. Think of it as separate aisles in the library. More partitions = more consumers can read in parallel." },
      { icon: "🔑", term: "Message Key", def: "An optional label that determines which partition a message goes to. Messages with the SAME key ALWAYS go to the SAME partition — guaranteeing order for that key." },
    ],
    tipsTitle: "Try these experiments",
    tips: [
      "Pick key 'cust-001' and publish it 3 times — notice it ALWAYS hits the same partition",
      "Switch to 'cust-002' — it goes to a different partition",
      "Publish many messages, then scroll through the offsets (0, 1, 2…)",
      "Unlike RabbitMQ, messages STAY after being consumed — they never disappear",
    ],
  },
  {
    id: "groups",
    num: "02",
    title: "Consumer Groups",
    subtitle: "Same group = share the work. Different group = each gets a full copy.",
    analogy: {
      icon: "📖",
      scenario: "Two Teams Reading the Same Report",
      text: "A weekly sales report is published. The Finance team (2 people) splits it — person 1 reads pages 1-50, person 2 reads 51-100. They share the work. Meanwhile, the Marketing team (1 person) reads the same complete report entirely independently. Finance reading their pages doesn't affect Marketing's progress at all. Each team has their own private bookmark.",
    },
    terms: [
      { icon: "🏷️", term: "group.id", def: "The group's name. Consumers sharing the same group.id split the partitions between them (load balance). Consumers with different group.id each get a full copy of everything." },
      { icon: "📌", term: "Committed Offset", def: "The group's bookmark. Kafka remembers 'Group A has processed up to offset 5 on Partition 0'. If Group A restarts, it picks up from offset 5 — nothing is lost or replayed unintentionally." },
      { icon: "♻️", term: "Replay", def: "Since messages aren't deleted, a new consumer group can start from offset 0 and read ALL historical messages. Powerful for backfilling a new service or fixing a bug." },
    ],
    tipsTitle: "See it in action",
    tips: [
      "Publish several messages, then click Consume on Service A — only its bookmark moves",
      "Now click Consume on Service B — it reads the SAME messages from its own offset 0",
      "Service A and B are completely independent — one doesn't affect the other",
      "Try consuming from Service A again — it picks up where it left off, not from the start",
    ],
  },
];

// ─── Narrative generator ──────────────────────────────────────────────────────
function makeNarrative(lessonId, stage, ctx = {}) {
  const scripts = {
    queue: [
      null,
      "📦  Step 1/4 — The Order Service creates a new message (an order) and sends it to the queue.",
      "📋  Step 2/4 — The message arrives safely in the queue. It waits here. Even if the Payment Service is busy or offline, the message is NOT lost.",
      "👤  Step 3/4 — The Payment Service picks up the message and starts processing it (charging the card)...",
      "✅  Step 4/4 — Done! The consumer sends an ACK back to RabbitMQ: \"I handled this, you can delete it now.\" RabbitMQ removes the message from the queue.",
    ],
    direct: [
      null,
      `📦  Step 1/4 — Order Service sends a message with routing key: "${ctx.key}"`,
      `📫  Step 2/4 — The message hits the Direct Exchange. It scans its binding rules looking for a queue bound to "${ctx.key}"...`,
      ctx.matchCount > 0
        ? `✅  Step 3/4 — Match found! Routing key "${ctx.key}" matches → ${ctx.matchNames}. Message delivered.`
        : `❌  Step 3/4 — No queue is bound to "${ctx.key}". The message has nowhere to go and is DROPPED.`,
      ctx.matchCount > 0
        ? "👤  Step 4/4 — The consumer picks up and processes the message, then ACKs it."
        : "🗑️  Step 4/4 — Message discarded. To fix this: add a queue bound to this routing key.",
    ],
    fanout: [
      null,
      "📦  Step 1/4 — Order Service publishes an 'order placed' event to the Fanout Exchange.",
      "📡  Step 2/4 — Fanout Exchange COPIES the message to ALL 3 bound queues simultaneously. Notice: the routing key is completely ignored!",
      "📋  Step 3/4 — All 3 queues now hold their own independent copy. One message became three.",
      "👥  Step 4/4 — Each service processes its own copy: Payment charges the card 💳, Notifications sends an email 🔔, Analytics logs the sale 📊. All in parallel!",
    ],
    topic: [
      null,
      `📦  Step 1/4 — Publishing event with topic key: "${ctx.key}"`,
      `🎯  Step 2/4 — Topic Exchange tests the key "${ctx.key}" against all queue patterns...`,
      ctx.matchCount > 0
        ? `✅  Step 3/4 — ${ctx.matchCount} pattern(s) matched! Routed to: ${ctx.matchNames}.`
        : `❌  Step 3/4 — No patterns matched "${ctx.key}". Message dropped.`,
      ctx.matchCount > 0
        ? "👤  Step 4/4 — Matching consumers receive their copy and process it."
        : "💡  Step 4/4 — Try a key like 'order.eu.failed' to see multiple queues match.",
    ],
  };
  return scripts[lessonId]?.[stage] ?? null;
}

// ─── RabbitMQ lesson component ────────────────────────────────────────────────
function RabbitMQLesson({ lesson }) {
  const [rKey, setRKey]       = useState(lesson.defKey ?? "");
  const [stage, setStage]     = useState(0);
  const [hitIds, setHitIds]   = useState(new Set());
  const [narr, setNarr]       = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy]       = useState(false);

  useEffect(() => {
    setRKey(lesson.defKey ?? "");
    setStage(0); setHitIds(new Set()); setNarr(null); setBusy(false);
  }, [lesson.id]); // eslint-disable-line

  const getHits = useCallback(() => {
    if (!lesson.queues) return [];
    if (lesson.type === "direct") return lesson.queues.filter((q) => q.bind === rKey);
    if (lesson.type === "fanout") return lesson.queues;
    if (lesson.type === "topic")  return lesson.queues.filter((q) => topicMatch(q.pattern, rKey));
    return [];
  }, [lesson, rKey]);

  const run = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const hits = getHits();
    const ctx = { key: rKey, matchNames: hits.map((q) => q.label).join(", "), matchCount: hits.length };
    const ids = new Set(hits.map((q) => q.id));

    for (let s = 1; s <= 4; s++) {
      setStage(s);
      if (s === 3) setHitIds(ids);
      setNarr(makeNarrative(lesson.id, s, ctx));
      await sleep(950);
    }

    setStage(0); setHitIds(new Set()); setBusy(false);
    setNarr(null);

    const ts = new Date().toLocaleTimeString();
    const entry = hits.length === 0
      ? `⚠️  [${ts}] key="${rKey}" → no match → dropped`
      : `✅  [${ts}] key="${rKey}" → [${hits.map((q) => q.label).join(", ")}]`;
    setHistory((p) => [entry, ...p.slice(0, 5)]);
  }, [busy, rKey, lesson, getHits]);

  const hits = getHits();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* Concept panel */}
      <div className="lg:col-span-2">
        <ConceptPanel lesson={lesson} />
      </div>

      {/* Interactive zone */}
      <div className="lg:col-span-3 space-y-3">

        {/* Key picker for direct/topic */}
        {(lesson.type === "direct" || lesson.type === "topic") && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 font-mono shrink-0">
              {lesson.type === "direct" ? "Routing key:" : "Topic key:"}
            </span>
            {lesson.keys.map((k) => (
              <Pill key={k} label={`"${k}"`} active={rKey === k} color="#a855f7"
                onClick={() => !busy && setRKey(k)} />
            ))}
          </div>
        )}

        {/* Diagram area */}
        <div className="rounded-2xl p-4 overflow-x-auto" style={{ background: "#050d1a", border: "1px solid #1e293b" }}>

          {/* BASIC QUEUE */}
          {lesson.type === "basic" && (
            <div className="flex items-center justify-start gap-0 min-w-max py-2">
              <FlowNode tok={T.producer} icon="📦" label="Order Service" sub="Producer" active={stage >= 1} />
              <Arrow on={stage >= 1} color="#3b82f6" label="sends to" />
              <FlowNode tok={T.queue} icon="📋" label="orders_queue" sub="Queue" active={stage >= 2} w={138} />
              <Arrow on={stage >= 3} color="#22c55e" label="delivers" />
              <FlowNode tok={T.consumer} icon="👤" label="Payment Svc" sub="Consumer" active={stage >= 3} />
              {stage >= 4 && (
                <div className="ml-2 px-2 py-0.5 rounded-full text-xs font-mono font-bold animate-bounce"
                  style={{ background: "#22c55e25", border: "1px solid #22c55e", color: "#86efac" }}>
                  ACK ✓
                </div>
              )}
            </div>
          )}

          {/* DIRECT / TOPIC EXCHANGE */}
          {(lesson.type === "direct" || lesson.type === "topic") && (
            <div className="flex items-center min-w-max">
              <FlowNode tok={T.producer} icon="📦" label="Order Service" sub={`key:"${rKey}"`} active={stage >= 1} />
              <Arrow on={stage >= 1} color="#3b82f6" />
              <FlowNode tok={T.exchange} icon="📫"
                label={lesson.type === "direct" ? "DIRECT" : "TOPIC"}
                sub="Exchange" active={stage >= 2} w={106} />
              <div className="flex flex-col gap-2 ml-1">
                {lesson.queues.map((q) => {
                  const hit = hits.some((h) => h.id === q.id);
                  const qTok = hit ? T.queue : { bg: "#0a0a0a", border: "#1a1a1a", text: "#1a1a1a", glow: "#0" };
                  const cTok = hit ? T.consumer : { bg: "#0a0a0a", border: "#1a1a1a", text: "#1a1a1a", glow: "#0" };
                  return (
                    <div key={q.id} className="flex items-center">
                      <Arrow on={stage >= 2 && hit} color="#f97316"
                        label={lesson.type === "direct" ? q.bind : q.pattern} />
                      <FlowNode tok={qTok} icon={q.icon} label={q.label}
                        sub={lesson.type === "topic" ? q.pattern : q.bind}
                        active={stage >= 3 && hitIds.has(q.id)} dimmed={!hit} w={148} />
                      <Arrow on={stage >= 4 && hitIds.has(q.id)} color="#22c55e" />
                      <FlowNode tok={cTok} icon="👤" label={q.consumer}
                        active={stage >= 4 && hitIds.has(q.id)} dimmed={!hit} w={148} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* FANOUT EXCHANGE */}
          {lesson.type === "fanout" && (
            <div className="flex items-center min-w-max">
              <FlowNode tok={T.producer} icon="📦" label="Order Service" sub="Producer" active={stage >= 1} />
              <Arrow on={stage >= 1} color="#3b82f6" />
              <FlowNode tok={T.exchange} icon="📡" label="FANOUT" sub="Exchange" active={stage >= 2} w={106} />
              <div className="flex flex-col gap-2 ml-1">
                {lesson.queues.map((q) => (
                  <div key={q.id} className="flex items-center">
                    <Arrow on={stage >= 2} color="#f97316" label="copy" />
                    <FlowNode tok={T.queue} icon={q.icon} label={q.label} active={stage >= 3} w={160} />
                    <Arrow on={stage >= 4} color="#22c55e" />
                    <FlowNode tok={T.consumer} icon="👤" label={q.consumer} active={stage >= 4} w={160} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Send button */}
        <button onClick={run} disabled={busy}
          className="w-full py-2.5 rounded-xl text-sm font-mono font-bold transition-all"
          style={{
            background: busy ? "#080e1a" : "#1a0a38",
            border: `2px solid ${busy ? "#374151" : "#a855f7"}`,
            color: busy ? "#374151" : "#d8b4fe",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "⏳  Animating step-by-step…" : "▶  Send Message  (watch step-by-step)"}
        </button>

        {/* Step narrative */}
        <Narrative text={narr} color="#a855f7" />

        {/* History log */}
        {history.length > 0 && (
          <div className="rounded-xl p-3" style={{ background: "#050d1a", border: "1px solid #1e293b" }}>
            <div className="text-xs font-mono font-bold mb-1.5" style={{ color: "#334155" }}>📋 HISTORY</div>
            {history.map((e, i) => (
              <div key={i} className="text-xs font-mono text-gray-500">{e}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Kafka lesson component ───────────────────────────────────────────────────
function KafkaLesson({ lesson }) {
  const [msgKey, setMsgKey]   = useState("cust-001");
  const [parts, setParts]     = useState([[], [], []]);
  const [offsets, setOffsets] = useState({ svc_a: [0, 0, 0], svc_b: [0, 0, 0] });
  const [flashP, setFlashP]   = useState(null);
  const [stage, setStage]     = useState(0);
  const [narr, setNarr]       = useState(null);
  const [consuming, setConsuming] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy]       = useState(false);

  const targetP = hashPartition(msgKey);

  const publish = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setStage(1);
    setNarr(`📦  Producer creates a message with key "${msgKey}". Kafka is about to decide which partition to send it to...`);
    await sleep(800);

    setStage(2);
    setFlashP(targetP);
    setNarr(`🔑  Kafka hashes the key "${msgKey}" → Partition ${targetP}. Same key ALWAYS maps to the same partition. This guarantees messages from the same customer arrive in order!`);
    await sleep(900);

    const msgId = Date.now().toString(36);
    const newOffset = parts[targetP].length;
    setParts((prev) => {
      const next = prev.map((p) => [...p]);
      const row = [...next[targetP], { id: msgId, key: msgKey, offset: newOffset }];
      next[targetP] = row.slice(-9);
      return next;
    });
    setFlashP(null);
    setStage(3);
    setNarr(`✅  Message appended to Partition ${targetP} at offset ${newOffset}. Unlike RabbitMQ, Kafka KEEPS this message forever (until retention expires). It's not deleted when consumed!`);
    await sleep(1000);

    setStage(0);
    setNarr(null);
    setBusy(false);
    setHistory((p) => [`📤 key="${msgKey}" → Partition ${targetP} offset ${newOffset}`, ...p.slice(0, 5)]);
  }, [busy, msgKey, targetP, parts]);

  const consume = useCallback(async (groupId) => {
    if (busy) return;
    const gOff = offsets[groupId];
    const p = gOff.findIndex((o, i) => o < parts[i].length);
    if (p === -1) {
      setNarr(`⚠️  ${groupId === "svc_a" ? "Service A" : "Service B"} is fully caught up — no new messages to consume!`);
      setTimeout(() => setNarr(null), 2500);
      return;
    }
    const offset = gOff[p];
    const msg = parts[p][offset];
    setBusy(true);
    setConsuming(groupId);
    const gName = groupId === "svc_a" ? "Service A" : "Service B";
    setNarr(`📖  ${gName} reads from Partition ${p} at offset ${offset}. The OTHER service is NOT affected — they each have their own private bookmark.`);
    await sleep(900);
    setOffsets((prev) => {
      const next = { ...prev };
      const arr = [...prev[groupId]];
      arr[p] = offset + 1;
      next[groupId] = arr;
      return next;
    });
    setConsuming(null);
    setBusy(false);
    setNarr(`✅  ${gName} committed offset ${offset + 1} on Partition ${p}. Next poll starts from here. Notice the other service's bookmark didn't move!`);
    setHistory((prev) => [`📨 ${gName}: P${p} offset ${offset} key="${msg?.key}"`, ...prev.slice(0, 5)]);
    setTimeout(() => setNarr(null), 3500);
  }, [busy, offsets, parts]);

  const SVCS = [
    { id: "svc_a", name: "Service A", color: "#3b82f6", desc: "Independent cursor" },
    { id: "svc_b", name: "Service B", color: "#22c55e", desc: "Independent cursor" },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* Concept panel */}
      <div className="lg:col-span-2">
        <ConceptPanel lesson={lesson} />
      </div>

      {/* Interactive zone */}
      <div className="lg:col-span-3 space-y-3">

        {/* Key picker */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 font-mono shrink-0">Message key:</span>
          {["cust-001", "cust-002", "eu-order", "us-order"].map((k) => (
            <Pill key={k} label={k} active={msgKey === k} color="#6366f1"
              onClick={() => !busy && setMsgKey(k)} />
          ))}
          <span className="text-xs font-mono" style={{ color: PART_COLS[targetP] }}>
            → Partition {targetP}
          </span>
        </div>

        {/* Kafka diagram */}
        <div className="rounded-2xl p-4" style={{ background: "#050d1a", border: "1px solid #1e293b" }}>
          <div className="flex gap-3 items-start">

            {/* Producer */}
            <div className="flex flex-col items-center gap-2 shrink-0">
              <FlowNode tok={T.producer} icon="📦" label="Producer"
                sub={`key:"${msgKey}"`} active={stage >= 1} w={100} />
              <button onClick={publish} disabled={busy}
                className="px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all w-full"
                style={{
                  background: busy ? "#0a0f1a" : "#0c1e38",
                  border: `1px solid ${busy ? "#374151" : "#3b82f6"}`,
                  color: busy ? "#334155" : "#93c5fd",
                  cursor: busy ? "not-allowed" : "pointer",
                }}
              >
                {busy && stage > 0 && stage < 3 ? "⏳" : "📤 Publish"}
              </button>
            </div>

            <div className="flex items-start pt-8">
              <Arrow on={stage >= 2} color="#3b82f6" />
            </div>

            {/* Partitions */}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold font-mono mb-2" style={{ color: "#475569" }}>
                📋 Topic: "order_events" (3 partitions)
              </div>
              {[0, 1, 2].map((p) => {
                const col = PART_COLS[p];
                const flash = flashP === p;
                const isTarget = targetP === p;
                return (
                  <div key={p} className="rounded-lg p-2 mb-1.5 transition-all duration-300"
                    style={{
                      background: flash ? col + "20" : "#080e1a",
                      border: `1px solid ${flash ? col : isTarget ? col + "35" : "#1e293b"}`,
                      boxShadow: flash ? `0 0 16px ${col}40` : "none",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold shrink-0" style={{ color: col, width: 68 }}>
                        Partition {p}
                      </span>
                      <div className="flex gap-1 flex-1 flex-wrap overflow-hidden">
                        {parts[p].length === 0
                          ? <span className="text-xs text-gray-700 font-mono">empty</span>
                          : parts[p].map((m, idx) => (
                            <div key={m.id} title={`key:${m.key} offset:${idx}`}
                              className="rounded px-1.5 py-0.5 text-xs font-mono"
                              style={{ background: col + "30", border: `1px solid ${col}55`, color: col }}
                            >
                              {idx}
                            </div>
                          ))
                        }
                        {flash && (
                          <div className="rounded px-1.5 py-0.5 text-xs font-mono animate-pulse"
                            style={{ background: "#ffffff20", border: "1px solid #ffffff50", color: "#fff" }}>
                            ✉
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-gray-700 font-mono shrink-0">{parts[p].length}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-start pt-8">
              <Arrow on color="#1e293b" />
            </div>

            {/* Consumer groups */}
            <div className="space-y-2 shrink-0">
              {SVCS.map((svc) => {
                const gOff = offsets[svc.id];
                const pending = parts.reduce((s, p, i) => s + Math.max(0, p.length - gOff[i]), 0);
                const isConsuming = consuming === svc.id;
                return (
                  <div key={svc.id} className="rounded-xl p-2.5 transition-all duration-300"
                    style={{
                      background: isConsuming ? svc.color + "18" : "#080e1a",
                      border: `1px solid ${isConsuming ? svc.color : "#1e293b"}`,
                      minWidth: 144,
                    }}
                  >
                    <div className="text-xs font-bold font-mono" style={{ color: svc.color }}>
                      👥 {svc.name}
                    </div>
                    <div className="text-xs text-gray-600 font-mono mb-1.5 leading-tight">{svc.desc}</div>
                    {[0, 1, 2].map((p) => (
                      <div key={p} className="flex gap-1 text-xs font-mono">
                        <span style={{ color: "#334155" }}>P{p}:</span>
                        <span style={{ color: PART_COLS[p] }}>{gOff[p]}/{parts[p].length}</span>
                        {gOff[p] < parts[p].length && (
                          <span style={{ color: "#fbbf24" }}>↑{parts[p].length - gOff[p]}</span>
                        )}
                      </div>
                    ))}
                    <button onClick={() => consume(svc.id)} disabled={busy || pending === 0}
                      className="mt-2 w-full px-2 py-1 rounded-lg text-xs font-mono transition-all"
                      style={{
                        background: pending > 0 && !busy ? svc.color + "20" : "#0a0f1a",
                        border: `1px solid ${pending > 0 && !busy ? svc.color : "#1e293b"}`,
                        color: pending > 0 && !busy ? svc.color : "#334155",
                        cursor: pending > 0 && !busy ? "pointer" : "not-allowed",
                      }}
                    >
                      {isConsuming ? "⏳" : `📨 Consume (${pending})`}
                    </button>
                  </div>
                );
              })}
            </div>

          </div>
        </div>

        {/* Narrative */}
        <Narrative text={narr} color="#6366f1" />

        {/* Tips */}
        <div className="rounded-xl p-3" style={{ background: "#080e1a", border: "1px solid #1e293b" }}>
          <div className="text-xs font-mono font-bold mb-2" style={{ color: "#334155" }}>
            🧪 {lesson.tipsTitle}
          </div>
          {lesson.tips.map((tip, i) => (
            <div key={i} className="text-xs font-mono text-gray-600 leading-relaxed">→ {tip}</div>
          ))}
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="rounded-xl p-3" style={{ background: "#050d1a", border: "1px solid #1e293b" }}>
            <div className="text-xs font-mono font-bold mb-1.5" style={{ color: "#334155" }}>📋 HISTORY</div>
            {history.map((e, i) => (
              <div key={i} className="text-xs font-mono text-gray-500">{e}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Root app ─────────────────────────────────────────────────────────────────
export default function App() {
  const [broker, setBroker] = useState("rabbitmq");
  const [rmqIdx, setRmqIdx] = useState(0);
  const [kfkIdx, setKfkIdx] = useState(0);

  const lessons = broker === "rabbitmq" ? RMQ_LESSONS : KAFKA_LESSONS;
  const idx     = broker === "rabbitmq" ? rmqIdx : kfkIdx;
  const setIdx  = broker === "rabbitmq" ? setRmqIdx : setKfkIdx;
  const lesson  = lessons[idx];

  const BROKERS = [
    { id: "rabbitmq", icon: "🐰", label: "RabbitMQ",     sub: "Message Broker",    color: "#a855f7" },
    { id: "kafka",    icon: "☁️", label: "Apache Kafka", sub: "Event Streaming",   color: "#3b82f6" },
  ];

  return (
    <div className="min-h-screen p-4" style={{ background: "#020817", color: "#f1f5f9" }}>
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold font-mono text-white">🎓 Message Queue Learning Guide</h1>
          <p className="text-sm text-gray-500 font-mono mt-1">
            Beginner-friendly • Interactive • Step-by-step explanations
          </p>
        </div>

        {/* Broker selector */}
        <div className="flex gap-3 justify-center mb-6">
          {BROKERS.map((b) => (
            <button key={b.id} onClick={() => setBroker(b.id)}
              className="px-5 py-2.5 rounded-xl font-mono transition-all"
              style={{
                background: broker === b.id ? b.color + "20" : "#080e1a",
                border: `2px solid ${broker === b.id ? b.color : "#1e293b"}`,
                color: broker === b.id ? b.color : "#475569",
              }}
            >
              <span className="font-bold text-sm">{b.icon} {b.label}</span>
              <div className="text-xs opacity-70">{b.sub}</div>
            </button>
          ))}
        </div>

        {/* Lesson tabs */}
        <div className="flex gap-2 justify-center mb-5 flex-wrap">
          {lessons.map((l, i) => (
            <button key={l.id} onClick={() => setIdx(i)}
              className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all"
              style={{
                background: idx === i ? "#1e293b" : "#080e1a",
                border: `1px solid ${idx === i ? "#475569" : "#1e293b"}`,
                color: idx === i ? "#e2e8f0" : "#334155",
              }}
            >
              {l.num}. {l.title}
            </button>
          ))}
        </div>

        {/* Lesson content */}
        <div className="rounded-2xl p-5" style={{ background: "#080e1a", border: "1px solid #1e293b" }}>
          {broker === "rabbitmq"
            ? <RabbitMQLesson key={`rmq-${lesson.id}`} lesson={lesson} />
            : <KafkaLesson    key={`kfk-${lesson.id}`} lesson={lesson} />
          }
        </div>

        {/* Progress nav */}
        <div className="flex items-center justify-between mt-4 px-1">
          <button onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0}
            className="px-4 py-2 rounded-lg text-xs font-mono transition-all"
            style={{
              background: "#080e1a", border: "1px solid #1e293b",
              color: idx === 0 ? "#1e293b" : "#6b7280",
              cursor: idx === 0 ? "not-allowed" : "pointer",
            }}
          >
            ← Previous
          </button>

          <div className="flex items-center gap-4">
            <div className="flex gap-1.5">
              {lessons.map((_, i) => (
                <button key={i} onClick={() => setIdx(i)}
                  className="rounded-full transition-all"
                  style={{
                    width: i === idx ? 20 : 8,
                    height: 8,
                    background: i === idx ? (broker === "rabbitmq" ? "#a855f7" : "#3b82f6") : "#1e293b",
                  }}
                />
              ))}
            </div>
            <span className="text-xs font-mono text-gray-600">
              {idx + 1} / {lessons.length}
            </span>
          </div>

          <button onClick={() => setIdx(Math.min(lessons.length - 1, idx + 1))}
            disabled={idx === lessons.length - 1}
            className="px-4 py-2 rounded-lg text-xs font-mono transition-all"
            style={{
              background: "#080e1a", border: "1px solid #1e293b",
              color: idx === lessons.length - 1 ? "#1e293b" : "#6b7280",
              cursor: idx === lessons.length - 1 ? "not-allowed" : "pointer",
            }}
          >
            Next →
          </button>
        </div>

        {/* Footer hint */}
        <p className="text-center text-xs font-mono mt-4" style={{ color: "#1e293b" }}>
          Click ▶ Send Message in each lesson to see an animated step-by-step explanation
        </p>
      </div>
    </div>
  );
}
