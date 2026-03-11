import { useState, useCallback, useEffect } from "react";

// ─── Palette ────────────────────────────────────────────────────────────────
const P = {
  producer:  { bg: "#1e3a5f", border: "#3b82f6", glow: "#3b82f620", text: "#93c5fd" },
  exchange:  { bg: "#3b1f6e", border: "#8b5cf6", glow: "#8b5cf620", text: "#c4b5fd" },
  queue:     { bg: "#4a2800", border: "#f59e0b", glow: "#f59e0b20", text: "#fcd34d" },
  consumer:  { bg: "#064e3b", border: "#10b981", glow: "#10b98120", text: "#6ee7b7" },
  partition: { bg: "#1e1b4b", border: "#6366f1", glow: "#6366f120", text: "#a5b4fc" },
  dead:      { bg: "#450a0a", border: "#ef4444", glow: "#ef444420", text: "#fca5a5" },
};

const PART_COLORS = ["#6366f1", "#ec4899", "#f59e0b"];

// ─── RabbitMQ exchange configs ───────────────────────────────────────────────
const RMQ = {
  direct: {
    label: "Direct Exchange",
    desc:  "Exact routing key match  →  one queue receives",
    keys:  ["payment", "shipping", "error", "unknown"],
    defKey: "payment",
    queues: [
      { id: "q1", label: "payment_queue",  bind: "payment",  consumer: "Payment Service" },
      { id: "q2", label: "shipping_queue", bind: "shipping", consumer: "Shipping Service" },
      { id: "q3", label: "error_queue",    bind: "error",    consumer: "Error Handler" },
    ],
    match: (queues, key) => queues.filter(q => q.bind === key),
  },
  fanout: {
    label: "Fanout Exchange",
    desc:  "Broadcasts to ALL bound queues — routing key ignored",
    keys:  ["any.key", "order.placed", "ignored"],
    defKey: "any.key",
    queues: [
      { id: "f1", label: "payment_fanout",   consumer: "Payment Service" },
      { id: "f2", label: "notif_fanout",     consumer: "Notification Svc" },
      { id: "f3", label: "analytics_fanout", consumer: "Analytics Svc" },
    ],
    match: (queues) => queues,
  },
  topic: {
    label: "Topic Exchange",
    desc:  " * = one word   #  = zero or more words",
    keys:  ["order.eu.failed", "order.us-east.pending", "order.apac.placed", "payment.eu.failed"],
    defKey: "order.eu.failed",
    queues: [
      { id: "t1", label: "all_orders",  pattern: "order.#",               consumer: "All Orders Svc" },
      { id: "t2", label: "eu_queue",    pattern: "order.eu.*",            consumer: "EU Service" },
      { id: "t3", label: "failures",    pattern: "*.*.failed",            consumer: "Failure Handler" },
      { id: "t4", label: "us_pending",  pattern: "order.us-east.pending", consumer: "US Pending Svc" },
    ],
    match: (queues, key) => queues.filter(q => topicMatch(q.pattern, key)),
  },
};

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

// ─── Shared tiny components ──────────────────────────────────────────────────
function Box({ pal, label, sub, active, style = {}, className = "" }) {
  return (
    <div
      className={`rounded-lg px-3 py-2 text-center transition-all duration-300 select-none ${className}`}
      style={{
        background: active ? pal.border + "22" : pal.bg,
        border: `2px solid ${active ? pal.border : pal.border + "66"}`,
        boxShadow: active ? `0 0 18px ${pal.glow}` : "none",
        transform: active ? "scale(1.06)" : "scale(1)",
        ...style,
      }}
    >
      <div className="text-xs font-bold font-mono leading-tight" style={{ color: pal.text }}>{label}</div>
      {sub && <div className="text-xs font-mono opacity-60 mt-0.5 leading-tight" style={{ color: pal.text }}>{sub}</div>}
    </div>
  );
}

function Arrow({ on, color = "#374151", dashed = false }) {
  return (
    <div className="flex items-center shrink-0 mx-1">
      <div
        className="transition-all duration-300"
        style={{
          width: 28,
          height: 2,
          background: on ? color : "#2d3748",
          borderTop: dashed ? "2px dashed " + (on ? color : "#2d3748") : undefined,
        }}
      />
      <div
        className="transition-all duration-300"
        style={{
          borderTop: "5px solid transparent",
          borderBottom: "5px solid transparent",
          borderLeft: `7px solid ${on ? color : "#2d3748"}`,
          marginLeft: -1,
        }}
      />
    </div>
  );
}

function Chip({ label, active, onClick, activeColor = "#3b82f6" }) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-0.5 rounded text-xs font-mono transition-all"
      style={{
        background: active ? activeColor + "33" : "#1e293b",
        border: `1px solid ${active ? activeColor : "#374151"}`,
        color: active ? activeColor : "#6b7280",
      }}
    >
      {label}
    </button>
  );
}

function Log({ items, title }) {
  return (
    <div className="mt-4 rounded-lg p-3" style={{ background: "#020817", border: "1px solid #1e293b" }}>
      <div className="text-xs font-bold font-mono text-gray-500 mb-1.5">📋 {title}</div>
      {items.length === 0
        ? <div className="text-xs font-mono text-gray-700">No events yet — interact above!</div>
        : items.map((e, i) => (
          <div key={i} className="text-xs font-mono text-gray-300 leading-relaxed">{e}</div>
        ))
      }
    </div>
  );
}

// ─── RabbitMQ visualizer ─────────────────────────────────────────────────────
function RabbitMQViz() {
  const [type, setType] = useState("direct");
  const [key, setKey] = useState("payment");
  const [stage, setStage] = useState(0);      // 0 idle → 1 producer → 2 exchange → 3 queues → 4 consumer
  const [activeIds, setActiveIds] = useState(new Set());
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);

  const cfg = RMQ[type];

  useEffect(() => {
    setKey(cfg.defKey);
    setStage(0);
    setActiveIds(new Set());
  }, [type]);  // eslint-disable-line

  const matched = cfg.match(cfg.queues, key);

  const send = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setStage(1);
    await delay(650);
    setStage(2);
    await delay(650);
    setStage(3);
    setActiveIds(new Set(matched.map(q => q.id)));
    await delay(650);
    setStage(4);
    await delay(650);
    setStage(0);
    setActiveIds(new Set());
    setBusy(false);
    const ts = new Date().toLocaleTimeString();
    if (matched.length === 0) {
      setLog(prev => [`⚠️  [${ts}] key="${key}" matched NOTHING → message dropped`, ...prev.slice(0, 7)]);
    } else {
      setLog(prev => [
        `✉️  [${ts}] key="${key}" → ${cfg.label} → [${matched.map(q => q.label).join(", ")}]`,
        ...prev.slice(0, 7),
      ]);
    }
  }, [busy, key, matched, cfg]);  // eslint-disable-line

  const stageLabel = ["", "Producer sending…", "Exchange routing…", `→ ${activeIds.size} queue(s)`, "Consumer ACKing ✓"][stage] || "";

  return (
    <div>
      {/* Exchange type tabs */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {Object.entries(RMQ).map(([t, c]) => (
          <Chip key={t} label={c.label} active={type === t} activeColor="#8b5cf6"
            onClick={() => { if (!busy) setType(t); }} />
        ))}
      </div>

      <div className="text-xs font-mono text-indigo-300 mb-3">ℹ️  {cfg.desc}</div>

      {/* Routing key chooser */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs text-gray-500 font-mono shrink-0">Routing key:</span>
        {cfg.keys.map(k => (
          <Chip key={k} label={`"${k}"`} active={key === k} activeColor="#f59e0b"
            onClick={() => { if (!busy) setKey(k); }} />
        ))}
      </div>

      {/* Flow diagram */}
      <div className="rounded-xl p-4 overflow-x-auto" style={{ background: "#020817", border: "1px solid #1e293b" }}>
        <div className="flex items-center min-w-max">

          {/* Producer */}
          <Box pal={P.producer} label="📦 Producer" sub={`key: "${key}"`} active={stage >= 1} style={{ width: 112 }} />
          <Arrow on={stage >= 1} color="#3b82f6" />

          {/* Exchange */}
          <Box
            pal={P.exchange}
            label={`📫 ${type.toUpperCase()}`}
            sub="Exchange"
            active={stage >= 2}
            style={{ width: 100 }}
          />

          {/* Queue + Consumer rows */}
          <div className="flex flex-col gap-2 ml-2">
            {cfg.queues.map(q => {
              const hit = matched.some(m => m.id === q.id);
              const qPal = hit ? P.queue : { bg: "#111827", border: "#374151", glow: "#0", text: "#4b5563" };
              const cPal = hit ? P.consumer : { bg: "#111827", border: "#374151", glow: "#0", text: "#4b5563" };
              return (
                <div key={q.id} className="flex items-center">
                  <Arrow on={stage >= 2 && hit} color="#f59e0b" />
                  <Box pal={qPal} label={q.label} sub={q.pattern || q.bind || ""} active={stage >= 3 && activeIds.has(q.id)} style={{ width: 148 }} />
                  <Arrow on={stage >= 4 && activeIds.has(q.id)} color="#10b981" />
                  <Box pal={cPal} label={`👤 ${q.consumer}`} active={stage >= 4 && activeIds.has(q.id)} style={{ width: 148 }} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Send button + stage indicator */}
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        <button
          onClick={send}
          disabled={busy}
          className="px-4 py-2 rounded font-mono text-sm font-bold transition-all"
          style={{
            background: busy ? "#1e293b" : "#3b1f6e",
            border: `1px solid ${busy ? "#374151" : "#8b5cf6"}`,
            color: busy ? "#4b5563" : "#c4b5fd",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "⏳ Sending…" : "📤 Send Message"}
        </button>
        {stageLabel && <span className="text-xs font-mono text-gray-400">{stageLabel}</span>}
        {matched.length === 0 && !busy && (
          <span className="text-xs font-mono text-red-400">⚠️ No queues match this key</span>
        )}
      </div>

      <Log items={log} title="RabbitMQ Event Log" />
    </div>
  );
}

// ─── Kafka visualizer ────────────────────────────────────────────────────────
const GROUPS = [
  { id: "payment",   name: "payment-service",   color: "#3b82f6", desc: "Load balanced — workers share partitions" },
  { id: "inventory", name: "inventory-service",  color: "#10b981", desc: "Gets ALL messages (own cursor)" },
];

function hashPartition(key, n) {
  let h = 5381;
  for (const c of key) h = (h * 33 ^ c.charCodeAt(0)) >>> 0;
  return h % n;
}

const delay = (ms) => new Promise(r => setTimeout(r, ms));

function KafkaViz() {
  const [msgKey, setMsgKey] = useState("cust-001");
  const [parts, setParts] = useState([[], [], []]);        // messages per partition
  const [offsets, setOffsets] = useState({ payment: [0, 0, 0], inventory: [0, 0, 0] });
  const [stage, setStage] = useState(0);
  const [flashPart, setFlashPart] = useState(null);
  const [consumingGroup, setConsumingGroup] = useState(null);
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);

  const keyOpts = ["cust-001", "cust-002", "eu-order", "us-order", "cust-003"];
  const targetPart = hashPartition(msgKey, 3);

  const publish = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setStage(1);
    await delay(650);
    setStage(2);
    setFlashPart(targetPart);
    await delay(700);
    const msgId = Date.now().toString(36);
    setParts(prev => {
      const next = prev.map(p => [...p]);
      const row = [...next[targetPart], { id: msgId, key: msgKey }];
      next[targetPart] = row.slice(-9); // keep last 9
      return next;
    });
    setFlashPart(null);
    setStage(0);
    setBusy(false);
    setLog(prev => [
      `📤 key="${msgKey}" → partition ${targetPart} (deterministic hash)`,
      ...prev.slice(0, 7),
    ]);
  }, [busy, msgKey, targetPart]);

  const consume = useCallback(async (groupId) => {
    if (busy) return;
    const gOffsets = offsets[groupId];
    // find first partition with unconsumed messages
    let p = gOffsets.findIndex((o, i) => o < parts[i].length);
    if (p === -1) {
      setLog(prev => [`⚠️  ${groupId}: no new messages`, ...prev.slice(0, 7)]);
      return;
    }
    const offset = gOffsets[p];
    const msg = parts[p][offset];
    setBusy(true);
    setConsumingGroup(groupId);
    await delay(700);
    setOffsets(prev => {
      const next = { ...prev };
      const arr = [...prev[groupId]];
      arr[p] = offset + 1;
      next[groupId] = arr;
      return next;
    });
    setConsumingGroup(null);
    setBusy(false);
    setLog(prev => [
      `📨 ${groupId} consumed partition=${p} offset=${offset} key="${msg?.key}"`,
      ...prev.slice(0, 7),
    ]);
  }, [busy, offsets, parts]);

  return (
    <div>
      {/* Key chooser */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs text-gray-500 font-mono shrink-0">Message key:</span>
        {keyOpts.map(k => (
          <Chip key={k} label={k} active={msgKey === k} activeColor="#6366f1"
            onClick={() => { if (!busy) setMsgKey(k); }} />
        ))}
        <span className="text-xs font-mono ml-1" style={{ color: PART_COLORS[targetPart] }}>
          → partition {targetPart}
        </span>
      </div>

      {/* Main diagram */}
      <div className="rounded-xl p-4 overflow-x-auto" style={{ background: "#020817", border: "1px solid #1e293b" }}>
        <div className="flex gap-4 items-start min-w-max">

          {/* Producer */}
          <div className="flex flex-col items-center gap-2 pt-8">
            <Box pal={P.producer} label="📦 Producer" sub={`key: "${msgKey}"`} active={stage >= 1} style={{ width: 112 }} />
            <button
              onClick={publish}
              disabled={busy}
              className="px-3 py-1 rounded text-xs font-mono font-bold transition-all w-full"
              style={{
                background: busy ? "#1e293b" : "#1e3a5f",
                border: `1px solid ${busy ? "#374151" : "#3b82f6"}`,
                color: busy ? "#4b5563" : "#93c5fd",
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              {busy && stage > 0 && stage < 3 ? "⏳" : "📤 Publish"}
            </button>
          </div>

          <div className="flex items-start pt-10">
            <Arrow on={stage >= 2} color="#3b82f6" />
          </div>

          {/* Partitions */}
          <div style={{ minWidth: 280 }}>
            <div className="text-xs font-bold font-mono mb-2" style={{ color: "#a5b4fc" }}>
              📋 Topic: "orders" (3 partitions)
            </div>
            <div className="space-y-2">
              {[0, 1, 2].map(p => {
                const isFlash = flashPart === p;
                const col = PART_COLORS[p];
                return (
                  <div
                    key={p}
                    className="rounded-lg p-2 transition-all duration-300"
                    style={{
                      background: isFlash ? col + "22" : "#0f172a",
                      border: `1px solid ${isFlash ? col : "#1e293b"}`,
                      boxShadow: isFlash ? `0 0 14px ${col}44` : "none",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold shrink-0" style={{ color: col, width: 72 }}>
                        Partition {p}
                      </span>
                      <div className="flex gap-1 flex-1 overflow-hidden flex-wrap">
                        {parts[p].length === 0
                          ? <span className="text-xs text-gray-700 font-mono">empty</span>
                          : parts[p].map((m, idx) => (
                            <div
                              key={m.id}
                              className="rounded px-1.5 py-0.5 text-xs font-mono"
                              title={`key:${m.key} offset:${idx}`}
                              style={{
                                background: col + "33",
                                border: `1px solid ${col}55`,
                                color: col,
                              }}
                            >
                              {idx}
                            </div>
                          ))
                        }
                        {isFlash && (
                          <div
                            className="rounded px-1.5 py-0.5 text-xs font-mono animate-pulse"
                            style={{ background: "#ffffff33", border: "1px solid #ffffff66", color: "#fff" }}
                          >
                            ✉
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-gray-600 font-mono shrink-0">{parts[p].length}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-start pt-10">
            <Arrow on color="#374151" />
          </div>

          {/* Consumer groups */}
          <div className="space-y-3">
            {GROUPS.map(g => {
              const gOff = offsets[g.id];
              const pending = parts.reduce((s, p, i) => s + Math.max(0, p.length - gOff[i]), 0);
              const isConsuming = consumingGroup === g.id;
              return (
                <div
                  key={g.id}
                  className="rounded-lg p-2.5 transition-all duration-300"
                  style={{
                    background: isConsuming ? g.color + "22" : "#0f172a",
                    border: `1px solid ${isConsuming ? g.color : "#1e293b"}`,
                    minWidth: 168,
                  }}
                >
                  <div className="text-xs font-bold font-mono mb-0.5" style={{ color: g.color }}>
                    👥 {g.name}
                  </div>
                  <div className="text-xs text-gray-600 font-mono mb-2 leading-tight">{g.desc}</div>
                  {[0, 1, 2].map(p => (
                    <div key={p} className="flex gap-1 text-xs font-mono">
                      <span className="text-gray-600">P{p}:</span>
                      <span style={{ color: PART_COLORS[p] }}>
                        {gOff[p]}/{parts[p].length}
                      </span>
                      {gOff[p] < parts[p].length && (
                        <span className="text-yellow-500">↑{parts[p].length - gOff[p]}</span>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => consume(g.id)}
                    disabled={busy || pending === 0}
                    className="mt-2 w-full px-2 py-1 rounded text-xs font-mono transition-all"
                    style={{
                      background: pending > 0 && !busy ? g.color + "22" : "#1e293b",
                      border: `1px solid ${pending > 0 && !busy ? g.color : "#374151"}`,
                      color: pending > 0 && !busy ? g.color : "#4b5563",
                      cursor: pending > 0 && !busy ? "pointer" : "not-allowed",
                    }}
                  >
                    {isConsuming ? "⏳ Reading…" : `📨 Consume (${pending})`}
                  </button>
                </div>
              );
            })}
          </div>

        </div>
      </div>

      <div className="mt-2 text-xs font-mono text-gray-600">
        💡 Same key → same partition always. Each group tracks its own offset independently.
      </div>

      <Log items={log} title="Kafka Event Log" />
    </div>
  );
}

// ─── Comparison table ────────────────────────────────────────────────────────
function ComparisonTable() {
  const rows = [
    ["Message retention",     "Deleted after ACK",          "Persists (configurable TTL)"],
    ["Replay old messages",   "❌ Not possible",            "✅ Seek to any offset"],
    ["Routing",               "Rich: exchanges + bindings", "Simple: topic + key → partition"],
    ["Fan-out",               "Fanout exchange",            "Multiple consumer groups"],
    ["Best for",              "Task queues, RPC, workflows","Event streaming, audit logs"],
    ["Ordering guarantee",    "Per-queue",                  "Per-partition (same key)"],
    ["Throughput",            "~50k msgs/sec",              "~1M+ msgs/sec"],
    ["Delivery guarantee",    "At-least-once via ACK",      "At-least-once via offset commit"],
  ];
  return (
    <div className="rounded-2xl p-5 overflow-x-auto mt-6" style={{ background: "#0f172a", border: "1px solid #1e293b" }}>
      <h3 className="text-sm font-bold font-mono text-gray-300 mb-3">⚡ Quick Comparison</h3>
      <table className="w-full text-xs font-mono border-collapse">
        <thead>
          <tr>
            <th className="text-left py-1.5 pr-4 text-gray-500 font-semibold border-b border-gray-800">Feature</th>
            <th className="text-left py-1.5 pr-4 font-semibold border-b border-gray-800" style={{ color: "#c4b5fd" }}>🐰 RabbitMQ</th>
            <th className="text-left py-1.5 font-semibold border-b border-gray-800" style={{ color: "#93c5fd" }}>☁️ Kafka</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([feat, rmq, kfk], i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "#0a0f1a" }}>
              <td className="py-1.5 pr-4 text-gray-500">{feat}</td>
              <td className="py-1.5 pr-4" style={{ color: "#e9d5ff" }}>{rmq}</td>
              <td className="py-1.5" style={{ color: "#bfdbfe" }}>{kfk}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("rabbitmq");

  return (
    <div className="min-h-screen p-5" style={{ background: "#020817", color: "#f1f5f9" }}>
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-5">
          <h1 className="text-xl font-bold font-mono text-white">🔀 Message Queue Visualizer</h1>
          <p className="text-xs text-gray-500 font-mono mt-0.5">
            Interactive step-through of RabbitMQ and Apache Kafka
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-5">
          {[
            { id: "rabbitmq", icon: "🐰", label: "RabbitMQ",     color: "#8b5cf6" },
            { id: "kafka",    icon: "☁️", label: "Apache Kafka", color: "#3b82f6" },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-4 py-2 rounded-lg font-mono text-sm font-bold transition-all"
              style={{
                background: tab === t.id ? t.color + "33" : "#0f172a",
                border: `2px solid ${tab === t.id ? t.color : "#1e293b"}`,
                color: tab === t.id ? t.color : "#6b7280",
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Panel */}
        <div className="rounded-2xl p-5" style={{ background: "#0f172a", border: "1px solid #1e293b" }}>
          {tab === "rabbitmq" ? (
            <>
              <div className="mb-4">
                <h2 className="text-base font-bold font-mono" style={{ color: "#c4b5fd" }}>
                  RabbitMQ — Message Broker
                </h2>
                <p className="text-xs text-gray-500 font-mono">
                  Producer → Exchange (routes) → Queue(s) → Consumer ACKs
                </p>
              </div>
              <RabbitMQViz />
            </>
          ) : (
            <>
              <div className="mb-4">
                <h2 className="text-base font-bold font-mono" style={{ color: "#93c5fd" }}>
                  Apache Kafka — Event Streaming
                </h2>
                <p className="text-xs text-gray-500 font-mono">
                  Producer → Topic (partitioned log) → Consumer Groups (each with own offset cursor)
                </p>
              </div>
              <KafkaViz />
            </>
          )}
        </div>

        <ComparisonTable />

        {/* Legend */}
        <div className="mt-4 flex gap-4 flex-wrap">
          {[
            { label: "Producer",  col: "#3b82f6" },
            { label: "Exchange",  col: "#8b5cf6" },
            { label: "Queue",     col: "#f59e0b" },
            { label: "Consumer",  col: "#10b981" },
            { label: "Partition", col: "#6366f1" },
          ].map(({ label, col }) => (
            <div key={label} className="flex items-center gap-1.5 text-xs font-mono text-gray-400">
              <div className="w-3 h-3 rounded-sm" style={{ background: col + "66", border: `1px solid ${col}` }} />
              {label}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
