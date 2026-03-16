import { useState, useCallback, Fragment } from "react";

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
.mq-bounce { animation: mq-bounce 2s ease-in-out infinite; }
.mq-pulse { animation: mq-pulse 3s ease-in-out infinite; }
* { box-sizing: border-box; }
body { 
  background: linear-gradient(135deg, #0f172a 0%, rgba(51, 65, 85, 0.5) 100%);
  min-height: 100vh;
}
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
  producer: { bg: "rgba(59, 130, 246, 0.08)", border: "#3b82f6", text: "#60a5fa", glow: "rgba(59, 130, 246, 0.2)" },
  exchange: { bg: "rgba(168, 85, 247, 0.08)", border: "#a855f7", text: "#c084fc", glow: "rgba(168, 85, 247, 0.2)" },
  queue:    { bg: "rgba(249, 115, 22, 0.08)", border: "#f97316", text: "#fb923c", glow: "rgba(249, 115, 22, 0.2)" },
  consumer: { bg: "rgba(34, 197, 94, 0.08)", border: "#22c55e", text: "#4ade80", glow: "rgba(34, 197, 94, 0.2)" },
  stream:   { bg: "rgba(6, 182, 212, 0.08)", border: "#06b6d4", text: "#22d3ee", glow: "rgba(6, 182, 212, 0.2)" },
  rpc:      { bg: "rgba(234, 179, 8, 0.08)", border: "#eab308", text: "#facc15", glow: "rgba(234, 179, 8, 0.2)" },
  kafka:    { bg: "rgba(99, 102, 241, 0.08)", border: "#6366f1", text: "#818cf8", glow: "rgba(99, 102, 241, 0.2)" },
  sqs:      { bg: "rgba(245, 158, 11, 0.08)", border: "#f59e0b", text: "#fbbf24", glow: "rgba(245, 158, 11, 0.2)" },
  dlq:      { bg: "rgba(239, 68, 68, 0.08)", border: "#ef4444", text: "#f87171", glow: "rgba(239, 68, 68, 0.2)" },
  istio:    { bg: "rgba(14, 165, 233, 0.08)", border: "#0ea5e9", text: "#38bdf8", glow: "rgba(14, 165, 233, 0.2)" },
};
const PART_COLORS = ["#6366f1", "#ec4899", "#f59e0b"];

// ─── Shared primitives ────────────────────────────────────────────────────────
function FlowNode({ tok, icon, label, sub, active, dimmed, w = 108 }) {
  return (
    <div style={{
      width: w, minWidth: w, borderRadius: 8, padding: "10px 12px",
      textAlign: "center", transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)", userSelect: "none",
      background: active ? tok.bg : dimmed ? "rgba(15, 23, 42, 0.5)" : tok.bg,
      border: `1.5px solid ${active ? tok.border : dimmed ? "rgba(51, 65, 85, 0.3)" : tok.border}`,
      boxShadow: active ? `0 0 0 3px ${tok.glow}, 0 4px 12px rgba(0,0,0,0.3)` : dimmed ? "none" : "0 2px 8px rgba(0,0,0,0.2)",
      transform: active ? "translateY(-2px)" : "translateY(0)",
      opacity: dimmed ? 0.3 : 1,
    }}>
      <div style={{ fontSize: 20, filter: active ? "none" : dimmed ? "grayscale(1)" : "none" }}>{icon}</div>
      <div style={{
        fontSize: 11, fontWeight: 600, fontFamily: "system-ui, -apple-system, sans-serif", lineHeight: 1.3, marginTop: 4,
        color: active ? tok.border : dimmed ? "#475569" : tok.text,
      }}>{label}</div>
      {sub && (
        <div style={{ fontSize: 10, fontFamily: "monospace", lineHeight: 1.3, marginTop: 3, opacity: 0.7, color: tok.text }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function Arrow({ on, color = "rgba(51, 65, 85, 0.5)", label = "" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", margin: "0 4px", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <div style={{ 
          height: 2, 
          width: 28, 
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", 
          background: on ? `linear-gradient(90deg, ${color}80, ${color})` : "rgba(51, 65, 85, 0.3)",
          borderRadius: 1
        }} />
        <div style={{ 
          width: 0, 
          height: 0,
          borderTop: "4px solid transparent", 
          borderBottom: "4px solid transparent", 
          borderLeft: `6px solid ${on ? color : "rgba(51, 65, 85, 0.3)"}`, 
          transition: "border-color .3s" 
        }} />
      </div>
      {label && <div style={{ fontSize: 9, fontFamily: "monospace", textAlign: "center", marginTop: 4, color: on ? color : "#64748b", maxWidth: 64, fontWeight: 500 }}>{label}</div>}
    </div>
  );
}

function BackArrow({ on, color = "rgba(51, 65, 85, 0.5)", label = "" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", margin: "0 3px", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderRight: `7px solid ${on ? color : "rgba(51, 65, 85, 0.5)"}`, transition: "border-color .35s" }} />
        <div style={{ height: 2, width: 26, transition: "all 0.35s", background: on ? color : "rgba(51, 65, 85, 0.5)" }} />
      </div>
      {label && <div style={{ fontSize: 9, fontFamily: "monospace", textAlign: "center", marginTop: 2, color: on ? color : "#2d3748", maxWidth: 58 }}>{label}</div>}
    </div>
  );
}

function Narrative({ text, color = "#a855f7", step, total }) {
  if (!text) return null;
  return (
    <div style={{
      borderRadius: 10, padding: "16px 18px", fontSize: 14,
      fontFamily: "system-ui, -apple-system, sans-serif", lineHeight: 1.6, transition: "all 0.3s",
      background: `linear-gradient(135deg, ${color}08, ${color}12)`, 
      border: `1px solid ${color}30`, 
      color: "#e2e8f0",
      backdropFilter: "blur(8px)"
    }}>
      {step != null && total != null && (
        <div style={{ fontSize: 10, color, fontWeight: 600, marginBottom: 10, letterSpacing: 0.5, textTransform: "uppercase" }}>
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
            : "rgba(30, 41, 59, 0.5)", 
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
        padding: "12px 20px", borderRadius: 8, fontFamily: "system-ui, -apple-system, sans-serif", fontSize: 14,
        fontWeight: 600, border: "none",
        background: canBack ? `${color}15` : "rgba(15, 23, 42, 0.5)",
        color: canBack ? color : "#475569",
        cursor: canBack ? "pointer" : "not-allowed",
        opacity: canBack ? 1 : 0.4, transition: "all 0.2s", flexShrink: 0,
        boxShadow: canBack ? `0 2px 8px ${color}20` : "none"
      }}>← Back</button>
      <button onClick={onAdvance} style={{
        flex: 1, padding: "12px 24px", borderRadius: 8, fontFamily: "system-ui, -apple-system, sans-serif", fontSize: 14,
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

function ConceptPanel({ lesson }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ borderRadius: 10, padding: 16, background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(51, 65, 85, 0.4)", backdropFilter: "blur(12px)" }}>
        <div style={{ fontSize: 10, fontFamily: "system-ui, -apple-system, sans-serif", fontWeight: 600, marginBottom: 6, color: "#64748b", letterSpacing: 0.5, textTransform: "uppercase" }}>
          Lesson {lesson.num}
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#f1f5f9", lineHeight: 1.3, fontFamily: "system-ui, -apple-system, sans-serif" }}>{lesson.title}</div>
        <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 6, lineHeight: 1.5, fontFamily: "system-ui, -apple-system, sans-serif" }}>{lesson.subtitle}</div>
      </div>

      <div style={{ borderRadius: 10, padding: 16, background: "linear-gradient(135deg, rgba(34, 197, 94, 0.08), rgba(34, 197, 94, 0.12))", border: "1px solid rgba(34, 197, 94, 0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 24 }}>{lesson.analogy.icon}</span>
          <div>
            <div style={{ fontSize: 10, fontFamily: "system-ui, -apple-system, sans-serif", fontWeight: 600, color: "#22c55e", letterSpacing: 0.5, textTransform: "uppercase" }}>Real World Analogy</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9", fontFamily: "system-ui, -apple-system, sans-serif" }}>{lesson.analogy.scenario}</div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.6, margin: 0, fontFamily: "system-ui, -apple-system, sans-serif" }}>{lesson.analogy.text}</p>
      </div>

      <div style={{ borderRadius: 10, padding: 16, background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(51, 65, 85, 0.4)" }}>
        <div style={{ fontSize: 10, fontFamily: "system-ui, -apple-system, sans-serif", fontWeight: 600, marginBottom: 12, color: "#64748b", letterSpacing: 0.5, textTransform: "uppercase" }}>📚 Key Terms</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {lesson.terms.map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 10 }}>
              <div style={{ flexShrink: 0, borderRadius: 6, padding: "4px 8px", fontSize: 13, fontFamily: "system-ui, -apple-system, sans-serif", fontWeight: 600, alignSelf: "flex-start", marginTop: 2, background: "rgba(51, 65, 85, 0.4)", color: "#e2e8f0" }}>{t.icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "system-ui, -apple-system, sans-serif", color: "#f1f5f9" }}>{t.term}</div>
                <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5, marginTop: 2, fontFamily: "system-ui, -apple-system, sans-serif" }}>{t.def}</div>
              </div>
            </div>
          ))}
        </div>
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
  // ── KAFKA ──────────────────────────────────────────────────────────────────
  {
    id: "kafka-partitions", num: "09", title: "Kafka – Topics & Partitions",
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
    id: "kafka-groups", num: "10", title: "Kafka – Consumer Groups",
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
    id: "kafka-offsets", num: "11", title: "Kafka – Offsets & Commits",
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
    id: "kafka-replication", num: "12", title: "Kafka – Replication",
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
    id: "kafka-transactions", num: "13", title: "Kafka – Transactions & EOS",
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
    id: "kafka-compaction", num: "14", title: "Kafka – Log Compaction",
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
  // ── SQS ────────────────────────────────────────────────────────────────────
  {
    id: "sqs-standard", num: "15", title: "AWS SQS – Standard Queue",
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
    id: "sqs-fifo", num: "16", title: "AWS SQS – FIFO & DLQ",
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
  // ── Istio ──────────────────────────────────────────────────────────────────
  {
    id: "istio-arch", num: "17", title: "Istio – Architecture & Sidecar",
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
    id: "istio-routing", num: "18", title: "Istio – Traffic Routing",
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
    id: "istio-canary", num: "19", title: "Istio – Canary Deployments",
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
    id: "istio-fault", num: "20", title: "Istio – Fault Injection",
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
    id: "istio-circuit", num: "21", title: "Istio – Circuit Breaking",
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
    id: "istio-gateway", num: "22", title: "Istio – Ingress Gateway",
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
    id: "istio-mtls", num: "23", title: "Istio – mTLS",
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
    id: "istio-authz", num: "24", title: "Istio – Authorization Policy",
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
    id: "istio-observe", num: "25", title: "Istio – Observability",
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
    id: "istio-install", num: "26", title: "Istio – Installation & Profiles",
    subtitle: "Istio ships four profiles: minimal, default, demo, and production. IstioOperator lets you customize every control plane component declaratively.",
    color: "#38bdf8", group: "istio",
    analogy: { icon: "🏗️", scenario: "Building Blueprints", text: "Like choosing a house blueprint — minimal is a studio apartment (just the structure), default is a family home, demo adds every feature for inspection, and production is a hardened custom build. The IstioOperator CRD is your architect's instruction sheet — change any room without rebuilding from scratch." },
    terms: [
      { icon: "📋", term: "Installation Profiles", def: "demo: all components, for learning. default: control plane + ingress gateway, for most clusters. minimal: control plane only. production: hardened, resource-tuned." },
      { icon: "⚙️", term: "IstioOperator", def: "A CRD that declaratively configures Istio installation — resource limits, replica counts, component toggles, mesh-wide settings. Apply with istioctl install -f operator.yaml." },
      { icon: "🔄", term: "Canary Upgrade", def: "Run two Istio control planes side-by-side (old + new tag). Migrate namespaces one at a time by updating the istio.io/rev label. Zero-downtime upgrade path." },
      { icon: "🏷️", term: "Revision Labels", def: "istio.io/rev=stable on a namespace pins it to a specific Istio revision. Enables gradual upgrades and rollback without cluster-wide disruption." },
    ],
  },
  {
    id: "istio-service-entry", num: "27", title: "Istio – ServiceEntry",
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
    id: "istio-egress", num: "28", title: "Istio – Egress Gateway",
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
    id: "istio-jwt", num: "29", title: "Istio – JWT Authentication",
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
    id: "istio-troubleshoot", num: "30", title: "Istio – Troubleshooting",
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
    id: "istio-mirror", num: "31", title: "Istio – Traffic Mirroring",
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
    id: "istio-sidecar", num: "32", title: "Istio – Sidecar Resource",
    subtitle: "By default every Envoy sidecar tracks ALL services in the mesh. The Sidecar resource scopes each proxy's config to only the services it needs, slashing memory by up to 80% in large meshes.",
    color: "#4ade80", group: "istio",
    analogy: { icon: "📦", scenario: "Warehouse Stock List", text: "A warehouse worker (pod) doesn't need the full catalogue of every product in every warehouse worldwide — just the items on today's pick list. By default Istio sends every Envoy the full 10,000-item catalogue. The Sidecar resource is the manager saying: you only need items 42, 67, and 88. Smaller list = faster lookups, less memory, faster config updates." },
    terms: [
      { icon: "📋", term: "Sidecar CRD", def: "Scopes what services an Envoy tracks. egress.hosts controls which namespaces/services appear in the proxy's outbound config. ingress.port configures inbound listeners." },
      { icon: "🌐", term: "Default Sidecar", def: "A Sidecar with no workloadSelector in the root namespace (istio-system or config root) applies to all proxies in the mesh as a baseline policy." },
      { icon: "💾", term: "Memory Savings", def: "Each Envoy needs config for every tracked service endpoint. In a 100-service mesh, scoping to 5 needed services can cut sidecar memory from 200 MB to 40 MB per pod." },
      { icon: "🔗", term: "Egress Hosts Format", def: "hosts format: namespace/service.namespace.svc.cluster.local or ./service (same namespace) or istio-system/* (all services in istio-system)." },
    ],
  },
  {
    id: "istio-lb", num: "33", title: "Istio – Load Balancing",
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
    id: "istio-ambient", num: "34", title: "Istio – Ambient Mesh",
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
    id: "istio-wasm", num: "35", title: "Istio – WebAssembly Plugins",
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
];

// ─── LESSON 1: Hello World ────────────────────────────────────────────────────
function HelloWorldLesson({ meta }) {
  const STEPS = 5;
  const [stage, setStage] = useState(0);
  const advance = useCallback(() => setStage(s => (s >= STEPS ? 0 : s + 1)), []);
  const goBack  = useCallback(() => setStage(s => (s > 0 ? s - 1 : 0)), []);
  const NARR = [null,
    <><b style={{color:meta.color}}>Step 1 — Declare the queue</b><br/><br/>
      <span style={{color:"#a3e635"}}>channel.queue_declare(queue='hello')</span><br/><br/>
      Safe to call every time — only creates the queue if it doesn't exist yet. Both producer and consumer can declare the same queue.</>,
    <><b style={{color:meta.color}}>Step 2 — Publish a message</b><br/><br/>
      <span style={{color:"#a3e635"}}>channel.basic_publish(exchange='',<br/>{"    "}routing_key='hello', body='Hello World!')</span><br/><br/>
      exchange='' is the <b>default (nameless) exchange</b>. With it, routing_key is just the queue name.</>,
    <><b style={{color:meta.color}}>Step 3 — Message enters the queue</b><br/><br/>
      Default exchange delivers the message into 'hello'. The message sits here safely even if no consumer is running yet. <b>Producers and consumers are fully decoupled.</b></>,
    <><b style={{color:meta.color}}>Step 4 — Consumer receives the message</b><br/><br/>
      <span style={{color:"#a3e635"}}>def callback(ch, method, props, body):<br/>{"    "}print(f"Received {"{body}"}")<br/><br/>channel.basic_consume(queue='hello',<br/>{"    "}on_message_callback=callback)</span></>,
    <><b style={{color:meta.color}}>Step 5 — Acknowledgement (ACK)</b><br/><br/>
      <span style={{color:"#a3e635"}}>ch.basic_ack(delivery_tag=method.delivery_tag)</span><br/><br/>
      ✅ RabbitMQ deletes the message only after ACK.<br/>
      💡 Consumer crashes before ACK? RabbitMQ automatically re-delivers to another consumer!</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:"rgba(15, 23, 42, 0.4)",border:"1px solid rgba(51, 65, 85, 0.3)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:4}}>
          <FlowNode tok={T.producer} icon="💻" label="Producer" sub="send.py" active={stage===1||stage===2}/>
          <Arrow on={stage>=2} color={T.producer.border} label={stage>=2?"routing_key='hello'":""}/>
          <FlowNode tok={T.exchange} icon="⚡" label="Default Exchange" sub="(nameless ∅)" active={stage===2||stage===3} dimmed={stage>0&&stage<2} w={116}/>
          <Arrow on={stage>=3} color={T.exchange.border}/>
          <FlowNode tok={T.queue} icon="📦" label="Queue 'hello'" active={stage===3}/>
          <Arrow on={stage>=4} color={T.queue.border}/>
          <FlowNode tok={T.consumer} icon="🖥️" label="Consumer" sub={stage>=5?"✅ ACK sent":"receive.py"} active={stage===4||stage===5}/>
        </div>
        {stage>=5&&<div style={{marginTop:12,padding:"10px 14px",borderRadius:8,background:"rgba(34, 197, 94, 0.1)",border:"1px solid rgba(34, 197, 94, 0.3)",fontSize:12,fontFamily:"monospace",color:"#4ade80"}}>✅ ACK received → message deleted permanently</div>}
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
    <><b style={{color:meta.color}}>Step 1 — Declare a durable queue</b><br/><br/><span style={{color:"#a3e635"}}>channel.queue_declare(queue='task_queue', durable=True)</span><br/><br/>durable=True means the queue survives a RabbitMQ restart. Without this, all waiting tasks vanish on restart.</>,
    <><b style={{color:meta.color}}>Step 2 — Send persistent tasks</b><br/><br/><span style={{color:"#a3e635"}}>channel.basic_publish(exchange='', routing_key='task_queue', body='Task 1',<br/>{"    "}properties=pika.BasicProperties(<br/>{"        "}delivery_mode=pika.DeliveryMode.Persistent))</span><br/><br/>PERSISTENT ensures each message also survives restart. Both queue AND messages must be durable.</>,
    <><b style={{color:meta.color}}>Step 3 — Worker 1 picks Task 1 (round-robin)</b><br/><br/><span style={{color:"#a3e635"}}>channel.basic_qos(prefetch_count=1)</span><br/><br/>prefetch=1: "Don't give me Task 2 until I ACK Task 1." Prevents a fast worker from being flooded while a slow one sits idle.</>,
    <><b style={{color:meta.color}}>Step 4 — Worker 2 picks Task 2 simultaneously</b><br/><br/>Round-robin: Task 1→Worker 1, Task 2→Worker 2, Task 3→Worker 1, Task 4→Worker 2.<br/><br/>Both workers process <b>in parallel</b> — just add more workers to scale automatically.</>,
    <><b style={{color:meta.color}}>Step 5 — Worker 1 ACKs Task 1 and picks Task 3</b><br/><br/><span style={{color:"#a3e635"}}>ch.basic_ack(delivery_tag=method.delivery_tag)</span><br/><br/>After ACK, Worker 1 is free and picks up the next available task.</>,
    <><b style={{color:meta.color}}>Step 6 — All 4 tasks complete!</b><br/><br/>💥 <b>Crash scenario:</b> If Worker 1 dies mid-task, its un-ACK'd task is re-queued and delivered to Worker 2. <b>No data ever lost</b> as long as you ACK only after successful processing.</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:"rgba(15, 23, 42, 0.4)",border:"1px solid rgba(51, 65, 85, 0.3)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:14,flexWrap:"wrap"}}>
          <FlowNode tok={T.producer} icon="💻" label="Producer" sub="new_task.py" active={stage===1||stage===2}/>
          <Arrow on={stage>=2} color={T.producer.border} label={stage>=2?"4 tasks":""}/>
          <div style={{flex:1,minWidth:180,borderRadius:8,padding:"10px 12px",border:`1.5px solid ${stage>=1?T.queue.border+"80":"rgba(51, 65, 85, 0.3)"}`,background:T.queue.bg,backdropFilter:"blur(8px)"}}>
            <div style={{fontSize:11,color:T.queue.text,fontFamily:"system-ui, -apple-system, sans-serif",fontWeight:600,marginBottom:8}}>📦 task_queue {stage>=1?"(durable=True)":""}</div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              {stage>=2?TASKS.map(t=>(
                <div key={t.id} style={{borderRadius:6,padding:"4px 8px",fontSize:10,fontFamily:"monospace",background:taken(t.id)?"rgba(15, 23, 42, 0.8)":T.queue.border+"30",border:`1px solid ${taken(t.id)?"rgba(51, 65, 85, 0.5)":T.queue.border}`,color:taken(t.id)?"#64748b":T.queue.text,textDecoration:taken(t.id)?"line-through":"none",transition:"all 0.3s"}}>{t.label}</div>
              )):<div style={{fontSize:10,color:"#64748b",fontFamily:"monospace"}}>empty...</div>}
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
    <><b style={{color:meta.color}}>Step 1 — Declare a fanout exchange</b><br/><br/><span style={{color:"#a3e635"}}>channel.exchange_declare(exchange='logs', exchange_type='fanout')</span><br/><br/>The producer now publishes to an <b>exchange</b>, not a queue. fanout = "broadcast to everyone".</>,
    <><b style={{color:meta.color}}>Step 2 — Each consumer creates its own private queue</b><br/><br/><span style={{color:"#a3e635"}}>result = channel.queue_declare(queue='', exclusive=True)<br/>q_name = result.method.queue  # 'amq.gen-XsdfR'<br/>channel.queue_bind(exchange='logs', queue=q_name)</span><br/><br/>exclusive=True: auto-deleted when consumer disconnects. Each consumer gets their own private queue.</>,
    <><b style={{color:meta.color}}>Step 3 — Producer broadcasts the message</b><br/><br/><span style={{color:"#a3e635"}}>channel.basic_publish(exchange='logs', routing_key='', body=message)</span><br/><br/>The fanout exchange <b>copies</b> the message to every bound queue simultaneously. routing_key is ignored.</>,
    <><b style={{color:meta.color}}>Step 4 — Both consumers receive independently</b><br/><br/>✅ Consumer A received it (e.g. writes to disk)<br/>✅ Consumer B received the same message (e.g. shows on screen)<br/><br/>💡 Add a 3rd consumer? Zero code changes on the producer side!</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:"rgba(15, 23, 42, 0.4)",border:"1px solid rgba(51, 65, 85, 0.3)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
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
    <><b style={{color:meta.color}}>Step 1 — Declare a direct exchange</b><br/><br/><span style={{color:"#a3e635"}}>channel.exchange_declare(exchange='direct_logs', exchange_type='direct')</span><br/><br/>You chose routing_key=<b>'{rKey}'</b>. Direct exchange = <b>exact match only</b> against binding keys.</>,
    <><b style={{color:meta.color}}>Step 2 — Publish with routing key</b><br/><br/><span style={{color:"#a3e635"}}>channel.basic_publish(exchange='direct_logs',<br/>{"    "}routing_key='{rKey}', body=message)</span><br/><br/>The exchange checks every bound queue: "does your binding key = '{rKey}'?"</>,
    <><b style={{color:meta.color}}>Step 3 — Exchange checks bindings</b><br/><br/>• queue_errors → bound to ['error'] → {errorMatch?"✅ MATCH!":"❌ no match"}<br/>• queue_all → bound to ['error','warning','info'] → {allMatch?"✅ MATCH!":"❌ no match"}</>,
    <><b style={{color:meta.color}}>Step 4 — Messages delivered</b><br/><br/>{errorMatch?"📨 queue_errors RECEIVES it":"⛔ queue_errors SKIPPED"}<br/>{allMatch?"📨 queue_all RECEIVES it":"⛔ queue_all SKIPPED"}<br/><br/>{!errorMatch&&!allMatch?"⚠️ No matching queue — message is DROPPED silently.":""}</>,
    <><b style={{color:meta.color}}>Step 5 — Consumers process their messages</b><br/><br/>💡 A queue can bind with multiple keys — call queue_bind() multiple times.<br/>💡 Same queue, same exchange, different routing_key each time.<br/><br/>Reset and try a different key to see what gets dropped!</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
        <span style={{fontSize:11,color:"#475569",fontFamily:"monospace"}}>routing_key:</span>
        {ROUTING_KEYS_LIST.map(k=>(
          <button key={k} disabled={locked} onClick={()=>setRKey(k)} style={{padding:"3px 10px",borderRadius:9999,fontSize:11,fontFamily:"monospace",background:rKey===k?meta.color+"20":"rgba(15, 23, 42, 0.6)",border:`1px solid ${rKey===k?meta.color:"rgba(71, 85, 105, 0.5)"}`,color:rKey===k?meta.color:locked?"#64748b":"#6b7280",cursor:locked?"not-allowed":"pointer"}}>{k}</button>
        ))}
        {locked&&<span style={{fontSize:10,color:"#475569",fontFamily:"monospace"}}>🔒 locked</span>}
      </div>
      <div style={{borderRadius:10,background:"rgba(15, 23, 42, 0.4)",border:"1px solid rgba(51, 65, 85, 0.3)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
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
    <><b style={{color:meta.color}}>Step 1 — Declare a topic exchange</b><br/><br/><span style={{color:"#a3e635"}}>channel.exchange_declare(exchange='topic_logs', exchange_type='topic')</span><br/><br/>You chose routing_key=<b>'{rKey}'</b>. Words separated by dots. The exchange pattern-matches this against binding patterns.</>,
    <><b style={{color:meta.color}}>Step 2 — Publish with topic key</b><br/><br/><span style={{color:"#a3e635"}}>channel.basic_publish(exchange='topic_logs',<br/>{"    "}routing_key='{rKey}', body=message)</span><br/><br/>The exchange tests '{rKey}' against each binding pattern using wildcard rules.</>,
    <><b style={{color:meta.color}}>Step 3 — Pattern matching for '{rKey}'</b><br/><br/>{TOPIC_BINDINGS.map((b,i)=><span key={i}>• <b>'{b.pattern}'</b> → {matches[i]?"✅ MATCH":"❌ no match"}<br/></span>)}<br/>* = exactly 1 word &nbsp;&nbsp; # = 0 or more words</>,
    <><b style={{color:meta.color}}>Step 4 — Messages delivered to {matches.filter(Boolean).length} queue(s)</b><br/><br/>{TOPIC_BINDINGS.map((b,i)=><span key={i}>{matches[i]?`📨 ${b.icon} ${b.queue} — RECEIVES it`:`⛔ ${b.icon} ${b.queue} — skipped`}<br/></span>)}</>,
    <><b style={{color:meta.color}}>Step 5 — Try different keys!</b><br/><br/>• 'kern.critical' → matches kern.*, *.critical, kern.#<br/>• 'kern.info' → matches kern.*, kern.# (not *.critical)<br/>• 'cron.warning' → matches nothing above!<br/>• 'kern.warning.disk' → only kern.# (* fails on multi-word)<br/><br/>Reset and try a different key.</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
        <span style={{fontSize:11,color:"#475569",fontFamily:"monospace"}}>routing_key:</span>
        {TOPIC_KEYS_LIST.map(k=>(
          <button key={k} disabled={locked} onClick={()=>setRKey(k)} style={{padding:"3px 8px",borderRadius:9999,fontSize:10,fontFamily:"monospace",background:rKey===k?meta.color+"20":"rgba(15, 23, 42, 0.6)",border:`1px solid ${rKey===k?meta.color:"rgba(71, 85, 105, 0.5)"}`,color:rKey===k?meta.color:locked?"#64748b":"#6b7280",cursor:locked?"not-allowed":"pointer"}}>{k}</button>
        ))}
      </div>
      <div style={{borderRadius:10,background:"rgba(15, 23, 42, 0.4)",border:"1px solid rgba(51, 65, 85, 0.3)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
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
    <><b style={{color:meta.color}}>Step 1 — Client creates reply queue & correlation ID</b><br/><br/><span style={{color:"#a3e635"}}>result = channel.queue_declare(queue='', exclusive=True)<br/>callback_queue = result.method.queue  # '{RQNAME}'<br/>corr_id = str(uuid.uuid4())  # '{CORR}'</span><br/><br/>The reply queue is where the server sends back the result. The correlation_id is a unique tag to match response to request.</>,
    <><b style={{color:meta.color}}>Step 2 — Client sends the RPC request</b><br/><br/><span style={{color:"#a3e635"}}>channel.basic_publish(exchange='', routing_key='rpc_queue',<br/>{"    "}body='fib(30)',<br/>{"    "}properties=pika.BasicProperties(<br/>{"        "}reply_to='{RQNAME}', correlation_id='{CORR}'))</span></>,
    <><b style={{color:meta.color}}>Step 3 — Server receives and processes</b><br/><br/><span style={{color:"#a3e635"}}>def on_request(ch, method, props, body):<br/>{"    "}n = int(body)  # 30<br/>{"    "}result = fib(n)  # computing fibonacci(30)…</span><br/><br/>fib(30) = 832040. The server is running channel.start_consuming() on 'rpc_queue'.</>,
    <><b style={{color:meta.color}}>Step 4 — Server publishes result to reply queue</b><br/><br/><span style={{color:"#a3e635"}}>ch.basic_publish(exchange='', routing_key=props.reply_to,<br/>{"    "}properties=pika.BasicProperties(<br/>{"        "}correlation_id=props.correlation_id),<br/>{"    "}body=str(result))</span><br/><br/>Server sends to '{RQNAME}' and echoes back the correlation_id.</>,
    <><b style={{color:meta.color}}>Step 5 — Client receives response</b><br/><br/>Client was polling in a loop:<br/><span style={{color:"#a3e635"}}>while self.response is None:<br/>{"    "}self.connection.process_data_events(time_limit=1)</span><br/><br/>A message arrived in '{RQNAME}' — checking if correlation_id matches...</>,
    <><b style={{color:meta.color}}>Step 6 — Match confirmed! Result delivered.</b><br/><br/><span style={{color:"#a3e635"}}>if self.corr_id == props.correlation_id:<br/>{"    "}self.response = int(body)  # 832040 ✅</span><br/><br/>fib(30) = <b style={{color:meta.color}}>832040</b><br/><br/>💡 Why correlation_id? Multiple RPC calls can be in flight — each has a unique ID so responses never get mixed up.</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:"rgba(15, 23, 42, 0.4)",border:"1px solid rgba(51, 65, 85, 0.3)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        <div style={{fontSize:10,color:"#475569",fontFamily:"monospace",marginBottom:6,letterSpacing:1}}>→ REQUEST PATH</div>
        <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap",marginBottom:14}}>
          <FlowNode tok={T.producer} icon="💻" label="Client" sub="rpc_client.py" active={stage===1||stage===2||stage===5||stage===6}/>
          <Arrow on={stage>=2} color={T.producer.border} label={stage>=2?"fib(30)":""}/>
          <FlowNode tok={T.queue} icon="📦" label="rpc_queue" active={stage===2||stage===3} dimmed={stage<2} w={108}/>
          <Arrow on={stage>=3} color={T.queue.border}/>
          <FlowNode tok={T.consumer} icon="🖥️" label="RPC Server" sub={stage>=4?"result=832040":"rpc_server.py"} active={stage===3||stage===4}/>
        </div>
        <div style={{fontSize:10,color:"#475569",fontFamily:"monospace",marginBottom:6,letterSpacing:1}}>← REPLY PATH</div>
        <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap",marginBottom:10}}>
          <FlowNode tok={T.producer} icon="💻" label="Client" sub={stage>=6?"✅ 832040":stage>=1?`corr_id: ${CORR.slice(0,8)}…`:""} active={stage===5||stage===6}/>
          <BackArrow on={stage>=5} color={meta.color} label={stage>=5?"832040":""}/>
          <FlowNode tok={T.rpc} icon="📬" label={RQNAME} sub={stage>=1?"exclusive=True":""} active={stage===4||stage===5} dimmed={stage<1} w={108}/>
          <BackArrow on={stage>=4} color={T.consumer.border} label={stage>=4?"result":""}/>
          <FlowNode tok={T.consumer} icon="🖥️" label="RPC Server" sub={stage>=4?"publishing…":""} active={stage===4} dimmed={stage<3}/>
        </div>
        {stage>=2&&<div style={{padding:"8px 12px",borderRadius:8,background:T.rpc.bg,border:`1px solid ${T.rpc.border}50`,fontSize:11,fontFamily:"monospace",color:T.rpc.text}}>🔑 correlation_id: <b>{CORR}</b>{stage>=6?<span style={{color:"#22c55e"}}> ← ✅ MATCHED!</span>:stage>=5?" ← checking...":""}</div>}
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
    <><b style={{color:meta.color}}>Step 1 — Create stream and publish</b><br/><br/>RabbitMQ Streams uses the <b>rstream</b> library (not pika):<br/><br/><span style={{color:"#a3e635"}}>pip install rstream<br/><br/>async with Producer(host='localhost') as producer:<br/>{"    "}await producer.create_stream('mystream')<br/>{"    "}await producer.send('mystream',<br/>{"        "}[AMQPMessage(body=b'Hello!'), ...])</span></>,
    <><b style={{color:meta.color}}>Step 2 — Messages persist in the log</b><br/><br/>Unlike queues, stream messages are stored in a <b>persistent append-only log</b>.<br/><br/>Messages are NOT deleted after being consumed. Each has an <b>offset</b> — a sequential integer position.</>,
    <><b style={{color:meta.color}}>Step 3 — Consumer A subscribes from the beginning</b><br/><br/><span style={{color:"#a3e635"}}>await consumer.subscribe('mystream',<br/>{"    "}callback=on_message,<br/>{"    "}offset_specification=ConsumerOffsetSpecification(<br/>{"        "}OffsetType.FIRST, None))</span><br/><br/>OffsetType.FIRST = start from message at offset 0.</>,
    <><b style={{color:meta.color}}>Step 4 — Consumer A reads all 3 messages</b><br/><br/>Received "Hello!", "World!", "Streams!" ✅<br/><br/><b>The messages are still in the stream!</b> Consuming does NOT delete them — this is the fundamental difference from queues.</>,
    <><b style={{color:meta.color}}>Step 5 — Consumer B reads the same messages independently</b><br/><br/>Consumer B subscribes with OffsetType.FIRST and also reads all 3 messages — the exact same ones Consumer A read.<br/><br/>🔑 With a queue, Consumer B would get nothing. With a stream, every consumer independently replays the full history.</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:"rgba(15, 23, 42, 0.4)",border:"1px solid rgba(51, 65, 85, 0.3)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,color:"#475569",fontFamily:"monospace",marginBottom:8,letterSpacing:1}}>📜 STREAM: mystream (append-only log)</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {MSGS.map((m,i)=>(
              <div key={i} style={{borderRadius:8,padding:"8px 12px",fontSize:11,fontFamily:"monospace",background:stage>=2?T.stream.border+"18":"#0a0a0a",border:`2px solid ${stage>=2?T.stream.border:"rgba(51, 65, 85, 0.5)"}`,color:stage>=2?T.stream.text:"#64748b",transition:"all 0.35s"}}>
                <div style={{fontSize:9,color:stage>=2?"#475569":"rgba(51, 65, 85, 0.5)",marginBottom:3}}>offset {i}</div>
                📦 {m}
                {stage>=4&&<div style={{fontSize:9,color:"#22c55e",marginTop:2}}>read by A ✅</div>}
                {stage>=5&&<div style={{fontSize:9,color:T.stream.border,marginTop:1}}>read by B ✅</div>}
              </div>
            ))}
            {stage>=2&&<div style={{borderRadius:8,padding:"8px 12px",fontSize:11,fontFamily:"monospace",background:"rgba(15, 23, 42, 0.6)",border:"1px dashed rgba(51, 65, 85, 0.4)",color:"#64748b"}}><div style={{fontSize:9,marginBottom:3}}>offset 3</div>📦 next...</div>}
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <FlowNode tok={T.producer} icon="💻" label="Producer" active={stage===1}/>
            <Arrow on={stage>=2} color={T.producer.border} label={stage>=2?"3 msgs":""}/>
            <div style={{fontSize:11,fontFamily:"monospace",color:stage>=2?T.stream.text:"#64748b"}}>📜 persisted forever</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <FlowNode tok={T.consumer} icon="🖥️" label="Consumer A" sub={stage>=4?"✅ read all 3":stage>=3?"subscribing…":""} active={stage===3||stage===4} dimmed={stage<3}/>
            <Arrow on={stage>=4} color={T.consumer.border} label={stage>=4?"FIRST→end":""}/>
            <div style={{fontSize:11,fontFamily:"monospace",color:stage>=4?"#86efac":"#64748b"}}>{stage>=4?"reads offsets 0,1,2 ✅":""}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <FlowNode tok={T.consumer} icon="💻" label="Consumer B" sub={stage>=5?"✅ read all 3":""} active={stage===5} dimmed={stage<5}/>
            <Arrow on={stage>=5} color={T.consumer.border} label={stage>=5?"FIRST→end":""}/>
            <div style={{fontSize:11,fontFamily:"monospace",color:stage>=5?T.stream.text:"#64748b"}}>{stage>=5?"reads offsets 0,1,2 ✅ (same data!)":""}</div>
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
    <><b style={{color:meta.color}}>Step 1 — Consumer subscribes from offset 0</b><br/><br/><span style={{color:"#a3e635"}}>await consumer.subscribe('mystream',<br/>{"    "}offset_specification=ConsumerOffsetSpecification(<br/>{"        "}OffsetType.OFFSET, 0))</span><br/><br/>Consumer reads messages one by one starting at the beginning.</>,
    <><b style={{color:meta.color}}>Step 2 — Process msgs 0,1,2 and save offset</b><br/><br/><span style={{color:"#a3e635"}}>async def on_message(msg, message_context):<br/>{"    "}await process(msg)  # do the work<br/>{"    "}await consumer.store_offset(<br/>{"        "}'myapp', 'mystream', message_context.offset)</span><br/><br/>Offset 2 is now saved server-side in RabbitMQ.</>,
    <><b style={{color:meta.color}}>Step 3 — Offset 2 saved on RabbitMQ server</b><br/><br/>The offset is stored <b>server-side</b> — not in the consumer process. It survives consumer crashes, restarts, and redeployments.<br/><br/>saved_offset['myapp'] = 2 means: "I processed everything up to and including offset 2."</>,
    <><b style={{color:meta.color}}>Step 4 — Consumer CRASHES! 💥</b><br/><br/>All in-memory state is lost. But saved_offset = 2 is still safely on the RabbitMQ server.<br/><br/>Messages 3, 4, 5 were NOT processed — and we know this because the bookmark is at 2, not 5.</>,
    <><b style={{color:meta.color}}>Step 5 — Consumer restarts and queries offset</b><br/><br/><span style={{color:"#a3e635"}}>offset = await client.query_offset('myapp', 'mystream')<br/># returns: 2<br/>resume_from = offset + 1  # = 3</span><br/><br/>Consumer subscribes with OffsetType.OFFSET(3) — skipping the already-processed messages.</>,
    <><b style={{color:meta.color}}>Step 6 — Resumed from offset 3 ✅</b><br/><br/>Consumer reads msg3, msg4, msg5 — exactly where it left off.<br/><br/>✅ No messages lost &nbsp;&nbsp; ✅ No duplicates<br/><br/>💡 Always store_offset() AFTER processing. Worst case on crash = one re-process (at-least-once). That's safe!</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:"rgba(15, 23, 42, 0.4)",border:"1px solid rgba(51, 65, 85, 0.3)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,color:"#475569",fontFamily:"monospace",marginBottom:8,letterSpacing:1}}>📜 STREAM: mystream</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {ALL.map((m,i)=>{
              const done=(i<=2&&stage>=2)||(i>=3&&stage>=6);
              const old=i<=2&&stage>=5;
              const cur=i>=3&&stage===6;
              return(<div key={i} style={{borderRadius:8,padding:"7px 10px",fontSize:10,fontFamily:"monospace",background:old?"#0a1510":done?meta.color+"18":"#0a0a0a",border:`2px solid ${cur?meta.color:done?meta.color+"60":"rgba(51, 65, 85, 0.5)"}`,color:old?"#1e3a2a":done?"#86efac":"#64748b",transition:"all 0.35s"}}>
                <div style={{fontSize:8,marginBottom:2,color:old?"#1e3a2a":"#475569"}}>offset {i}</div>
                {m}{i<=2&&stage>=2?" ✅":""}{cur?" ◀":""}
              </div>);
            })}
          </div>
        </div>
        <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
          <FlowNode tok={T.consumer} icon={crashed?"💥":"🖥️"} label="Consumer" sub={crashed?"CRASHED!":stage>=6?"resumed offset 3":stage>=5?"restarting…":stage>=1?`offset ${Math.min(stage-1,2)}`:"myapp-consumer"} active={!crashed&&stage>=1&&stage!==4} dimmed={crashed}/>
          {stage>=3&&!crashed&&stage<5&&<><Arrow on color={meta.color} label="store_offset(2)"/><div style={{borderRadius:10,padding:"8px 12px",background:T.rpc.bg,border:`1px solid ${T.rpc.border}60`,fontSize:11,fontFamily:"monospace",color:T.rpc.text}}><div style={{fontSize:9,color:"#475569",marginBottom:4}}>💾 Offset Store (server)</div>myapp → offset <b>2</b></div></>}
          {stage>=5&&<><BackArrow on color={meta.color} label="query=2"/><div style={{borderRadius:10,padding:"8px 12px",background:T.rpc.bg,border:`1px solid ${T.rpc.border}60`,fontSize:11,fontFamily:"monospace",color:T.rpc.text}}><div style={{fontSize:9,color:"#475569",marginBottom:4}}>💾 Offset Store (server)</div>myapp → offset <b>2</b><br/><span style={{color:meta.color}}>→ resume from offset 3</span></div></>}
        </div>
      </div>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
    </div>
  );
}

// ─── LESSON 9: Kafka – Topics & Partitions ────────────────────────────────────
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
    <><b style={{color:meta.color}}>Step 1 — Create topic with 3 partitions</b><br/><br/><span style={{color:"#a3e635"}}>from confluent_kafka.admin import AdminClient, NewTopic<br/><br/>admin = AdminClient({"{'bootstrap.servers':'localhost:9092'}"})  <br/>admin.create_topics([NewTopic('orders', num_partitions=3,<br/>{"    "}replication_factor=1)])</span><br/><br/>The topic 'orders' is split into 3 independent append-only logs called <b>partitions</b>.</>,
    <><b style={{color:meta.color}}>Step 2 — Producer sends with message key</b><br/><br/><span style={{color:"#a3e635"}}>from confluent_kafka import Producer<br/><br/>p = Producer({"{'bootstrap.servers':'localhost:9092'}"})  <br/>p.produce('orders', key='{msgKey}', value='buy BTC')<br/>p.flush()</span><br/><br/>The message key '<b>{msgKey}</b>' determines which partition this message goes to.</>,
    <><b style={{color:meta.color}}>Step 3 — Kafka hashes the key → Partition {targetPart}</b><br/><br/>Kafka applies a hash function to '<b>{msgKey}</b>':<br/><br/>murmur2('<b>{msgKey}</b>') % 3 = <b style={{color:meta.color}}>Partition {targetPart}</b><br/><br/>✅ Same key <b>always</b> goes to the same partition. This guarantees <b>ordering per key</b>. All orders for user-123 arrive in sequence.</>,
    <><b style={{color:meta.color}}>Step 4 — Message appended to Partition {targetPart}</b><br/><br/>The message is appended to the end of Partition {targetPart}'s log.<br/><br/>Each partition has its own sequential <b>offsets</b>: 0, 1, 2, 3...<br/><br/>The offset within a partition is where a consumer tracks progress.</>,
    <><b style={{color:meta.color}}>Step 5 — Consumer reads from Partition {targetPart}</b><br/><br/><span style={{color:"#a3e635"}}>from confluent_kafka import Consumer<br/><br/>c = Consumer({"{'bootstrap.servers':'localhost:9092',\n'group.id':'payment-svc'}"})  <br/>c.subscribe(['orders'])<br/>msg = c.poll(1.0)<br/>c.commit()</span><br/><br/>Kafka automatically assigns partitions to consumers. The consumer commits offset to track progress.</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
        <span style={{fontSize:11,color:"#475569",fontFamily:"monospace"}}>message key:</span>
        {KAFKA_KEYS.filter((k,i,a)=>a.indexOf(k)===i).map(k=>(
          <button key={k} disabled={locked} onClick={()=>setMsgKey(k)} style={{padding:"3px 10px",borderRadius:9999,fontSize:11,fontFamily:"monospace",background:msgKey===k?meta.color+"20":"rgba(15, 23, 42, 0.6)",border:`1px solid ${msgKey===k?meta.color:"rgba(71, 85, 105, 0.5)"}`,color:msgKey===k?meta.color:locked?"#64748b":"#6b7280",cursor:locked?"not-allowed":"pointer"}}>{k}</button>
        ))}
        {locked&&<span style={{fontSize:10,color:"#475569",fontFamily:"monospace"}}>🔒 locked</span>}
      </div>
      <div style={{borderRadius:10,background:"rgba(15, 23, 42, 0.4)",border:"1px solid rgba(51, 65, 85, 0.3)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:6,flexWrap:"wrap"}}>
          <FlowNode tok={T.producer} icon="💻" label="Producer" sub={stage>=2?`key='${msgKey}'`:""} active={stage===1||stage===2}/>
          <Arrow on={stage>=2} color={T.producer.border} label={stage>=2?msgKey:""}/>
          {/* Kafka broker with 3 partitions */}
          <div style={{borderRadius:10,padding:"12px 14px",background:"rgba(99, 102, 241, 0.1)",border:`1px solid ${T.kafka.border}40`,minWidth:160,backdropFilter:"blur(8px)"}}>
            <div style={{fontSize:11,color:T.kafka.text,fontFamily:"system-ui, -apple-system, sans-serif",fontWeight:600,marginBottom:8}}>🗄️ Kafka Topic: orders</div>
            {[0,1,2].map(p=>(
              <div key={p} style={{display:"flex",alignItems:"center",gap:6,marginBottom:p<2?6:0}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:PART_COLORS[p],flexShrink:0,boxShadow:`0 0 8px ${PART_COLORS[p]}40`}}/>
                <div style={{flex:1,borderRadius:6,padding:"4px 8px",fontSize:10,fontFamily:"monospace",background:stage>=4&&p===targetPart?PART_COLORS[p]+"20":"#0a0a0a",border:`1px solid ${stage>=4&&p===targetPart?PART_COLORS[p]:stage>=3&&p===targetPart?PART_COLORS[p]+"80":"rgba(51, 65, 85, 0.5)"}`,color:stage>=3&&p===targetPart?PART_COLORS[p]:"#64748b",transition:"all 0.35s"}}>
                  P{p}: offset 0→{p===1?8:p===0?5:3}{stage>=4&&p===targetPart?` ← NEW`:""}
                </div>
              </div>
            ))}
          </div>
          <Arrow on={stage>=5} color={PART_COLORS[targetPart]} label={stage>=5?`P${targetPart}`:""}/>
          <FlowNode tok={T.consumer} icon="🖥️" label="Consumer" sub={stage>=5?"payment-svc":""} active={stage===5} dimmed={stage<5}/>
        </div>
        {stage>=3&&(
          <div style={{marginTop:12,padding:"10px 14px",borderRadius:8,background:`linear-gradient(135deg, ${PART_COLORS[targetPart]}08, ${PART_COLORS[targetPart]}12)`,border:`1px solid ${PART_COLORS[targetPart]}40`,fontSize:12,fontFamily:"system-ui, -apple-system, sans-serif",color:PART_COLORS[targetPart],backdropFilter:"blur(8px)"}}>
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
    <><b style={{color:meta.color}}>Step 1 — Consumers in a group subscribe</b><br/><br/><span style={{color:"#a3e635"}}>c = Consumer({"{'bootstrap.servers':'localhost:9092',\n'group.id':'payment-svc'}"})  <br/>c.subscribe(['orders'])</span><br/><br/>All 3 consumers share the same <b>group.id='payment-svc'</b>. Kafka knows they are in the same group and will divide the work.</>,
    <><b style={{color:meta.color}}>Step 2 — Kafka assigns one partition per consumer</b><br/><br/>With 3 partitions and 3 consumers in the group:<br/><br/>• Consumer 1 → Partition 0<br/>• Consumer 2 → Partition 1<br/>• Consumer 3 → Partition 2<br/><br/>Each partition goes to <b>exactly one</b> consumer in the group. This is the <b>partition assignment</b>.</>,
    <><b style={{color:meta.color}}>Step 3 — Message on P0 → only Consumer 1 receives it</b><br/><br/>A new order arrives on Partition 0. <b>Only Consumer 1</b> gets it — Consumer 2 and Consumer 3 are not affected.<br/><br/>This is parallel processing: all 3 partitions are consumed simultaneously by different workers.</>,
    <><b style={{color:meta.color}}>Step 4 — A second consumer group reads ALL messages too</b><br/><br/><span style={{color:"#a3e635"}}>c2 = Consumer({"{'group.id':'analytics-svc'}"})  <br/>c2.subscribe(['orders'])</span><br/><br/>'analytics-svc' is a <b>completely separate group</b>. It gets its own copy of every message from every partition — completely independent of 'payment-svc'. This is how Kafka differs from RabbitMQ queues.</>,
    <><b style={{color:meta.color}}>Step 5 — Consumer 1 crashes → Partition 0 rebalanced</b><br/><br/>Kafka detects Consumer 1 missed heartbeats. A <b>rebalance</b> is triggered:<br/><br/>• Consumer 2 now handles P0 + P1<br/>• Consumer 3 still handles P2<br/><br/>No messages are lost. Kafka picks up from the last committed offset automatically.</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:"rgba(15, 23, 42, 0.4)",border:"1px solid rgba(51, 65, 85, 0.3)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        {/* Topic partitions */}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:10,color:"#475569",fontFamily:"monospace",marginBottom:6,letterSpacing:1}}>🗄️ KAFKA TOPIC: orders (3 partitions)</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {[0,1,2].map(p=>{
              const c1active=(p===0&&stage===3);
              const rebalanced=(p===0&&stage===5);
              return(
                <div key={p} style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{width:80,borderRadius:6,padding:"4px 8px",fontSize:10,fontFamily:"monospace",background:PART_COLORS[p]+"20",border:`1px solid ${PART_COLORS[p]}`,color:PART_COLORS[p],textAlign:"center"}}>P{p}</div>
                  <Arrow on={stage>=2} color={PART_COLORS[p]} label={stage>=2?`→ C${rebalanced&&p===0?2:p+1}${rebalanced&&p===0?" (rebalanced)":""}`:""} />
                  <FlowNode tok={{bg:"#022c1c",border:PART_COLORS[p],text:PART_COLORS[p],glow:PART_COLORS[p]+"30"}}
                    icon={p===0&&stage===5?"💥":"⚙️"}
                    label={`Consumer ${p+1}`}
                    sub={p===0&&stage===5?"CRASHED":stage>=2?`payment-svc`:""}
                    active={c1active&&!rebalanced}
                    dimmed={p===0&&stage===5}
                  />
                  {stage>=4&&(
                    <>
                      <Arrow on color="#475569"/>
                      <FlowNode tok={{bg:"#1a0a38",border:"#a855f7",text:"#d8b4fe",glow:"#a855f730"}} icon="📊" label={`Analytics C${p+1}`} sub="analytics-svc" active={stage===4||stage===5} w={100}/>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {stage>=4&&(
          <div style={{padding:"8px 12px",borderRadius:8,background:"#1a0a38",border:"1px solid #a855f750",fontSize:11,fontFamily:"monospace",color:"#d8b4fe"}}>
            💡 Two groups read the same topic independently. payment-svc and analytics-svc both get every message — zero overlap, zero interference.
          </div>
        )}
      </div>
      <StepBtn stage={stage} total={STEPS} color={meta.color} onAdvance={advance} onBack={goBack}/>
      <Narrative text={NARR[stage]} color={meta.color} step={stage>0&&stage<=STEPS?stage:null} total={STEPS}/>
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
    <><b style={{color:meta.color}}>Step 1 — Create the queue (fully managed — no server!)</b><br/><br/><span style={{color:"#a3e635"}}>import boto3<br/>sqs = boto3.client('sqs', region_name='us-east-1')<br/><br/>response = sqs.create_queue(QueueName='order-queue')<br/>queue_url = response['QueueUrl']</span><br/><br/>Unlike RabbitMQ/Kafka, <b>there is no broker to run</b>. AWS manages everything. You just call the API.</>,
    <><b style={{color:meta.color}}>Step 2 — Send a message</b><br/><br/><span style={{color:"#a3e635"}}>sqs.send_message(<br/>{"    "}QueueUrl=queue_url,<br/>{"    "}MessageBody='Process order #1234',<br/>{"    "}MessageAttributes={"{'OrderId': {'StringValue':'1234','DataType':'String'}}"}</span><br/><br/>Message is stored in SQS and available for consumers to receive.</>,
    <><b style={{color:meta.color}}>Step 3 — Consumer RECEIVES (message becomes invisible)</b><br/><br/><span style={{color:"#a3e635"}}>response = sqs.receive_message(<br/>{"    "}QueueUrl=queue_url,<br/>{"    "}WaitTimeSeconds=20,<br/>{"    "}VisibilityTimeout=30)<br/><br/>receipt = response['Messages'][0]['ReceiptHandle']</span><br/><br/>⚠️ Message is now <b>invisible to all other consumers</b> for 30 seconds. It's NOT deleted yet!</>,
    <><b style={{color:meta.color}}>Step 4 — Consumer processes the order</b><br/><br/>The consumer has up to 30 seconds (VisibilityTimeout) to process.<br/><br/>The ReceiptHandle: <b>'{RECEIPT.slice(0,30)}…'</b><br/><br/>This token proves you received the message and is required for deletion. Save it!</>,
    <><b style={{color:meta.color}}>Step 5 — Consumer DELETES the message</b><br/><br/><span style={{color:"#a3e635"}}>sqs.delete_message(<br/>{"    "}QueueUrl=queue_url,<br/>{"    "}ReceiptHandle=receipt)</span><br/><br/>✅ Message permanently removed.<br/><br/>💡 If NOT deleted within 30s, the message <b>reappears</b> in the queue and another consumer can pick it up. This is SQS's crash-safety mechanism!</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:"rgba(15, 23, 42, 0.4)",border:"1px solid rgba(51, 65, 85, 0.3)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:8,flexWrap:"wrap"}}>
          <FlowNode tok={T.producer} icon="💻" label="Producer (boto3)" sub="AWS SDK" active={stage===1||stage===2}/>
          <Arrow on={stage>=2} color={T.producer.border} label={stage>=2?"send_message":""}/>
          {/* SQS Queue */}
          <div style={{flex:1,minWidth:160,borderRadius:10,padding:"12px 14px",background:T.sqs.bg,border:`1.5px solid ${stage>=1?T.sqs.border+"80":"rgba(51, 65, 85, 0.3)"}`,transition:"all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",backdropFilter:"blur(8px)"}}>
            <div style={{fontSize:11,color:T.sqs.text,fontFamily:"system-ui, -apple-system, sans-serif",fontWeight:600,marginBottom:8}}>☁️ AWS SQS: order-queue</div>
            {stage===0&&<div style={{fontSize:10,color:"#64748b",fontFamily:"monospace"}}>empty</div>}
            {stage>=2&&stage<3&&<div style={{borderRadius:6,padding:"5px 10px",fontSize:11,fontFamily:"monospace",background:T.sqs.border+"30",border:`1px solid ${T.sqs.border}`,color:T.sqs.text}}>📨 Process order #1234 ← visible</div>}
            {stage>=3&&stage<5&&<div style={{borderRadius:6,padding:"4px 8px",fontSize:10,fontFamily:"monospace",background:"rgba(15, 23, 42, 0.8)",border:"1px dashed rgba(71, 85, 105, 0.5)",color:"#64748b"}}>👻 Process order #1234 ← INVISIBLE (30s timer)</div>}
            {stage>=5&&<div style={{fontSize:10,color:"#64748b",fontFamily:"monospace"}}>empty (deleted ✅)</div>}
          </div>
          <Arrow on={stage>=3} color={T.sqs.border} label={stage>=3?"receive_message":""}/>
          <FlowNode tok={T.consumer} icon="🖥️" label="Consumer (boto3)" sub={stage>=5?"✅ deleted":stage>=3?"processing…":""} active={stage>=3&&stage<=5}/>
        </div>
        {stage>=3&&stage<5&&(
          <div style={{marginTop:12,padding:"10px 14px",borderRadius:8,background:`linear-gradient(135deg, ${T.rpc.border}08, ${T.rpc.border}12)`,border:`1px solid ${T.rpc.border}30`,fontSize:12,fontFamily:"system-ui, -apple-system, sans-serif",color:T.rpc.text,backdropFilter:"blur(8px)"}}>
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
    <><b style={{color:meta.color}}>Step 1 — Create a FIFO queue</b><br/><br/><span style={{color:"#a3e635"}}>sqs.create_queue(<br/>{"    "}QueueName='orders.fifo',<br/>{"    "}Attributes={"{'FifoQueue':'true',\n'ContentBasedDeduplication':'true'}"})</span><br/><br/>Queue name <b>must end in .fifo</b>. FIFO queues guarantee strict ordering and exactly-once processing.</>,
    <><b style={{color:meta.color}}>Step 2 — Send with MessageGroupId and DeduplicationId</b><br/><br/><span style={{color:"#a3e635"}}>sqs.send_message(<br/>{"    "}QueueUrl=fifo_url,<br/>{"    "}MessageBody='Order #1',<br/>{"    "}MessageGroupId='user-A',<br/>{"    "}MessageDeduplicationId='order-1-uuid')</span><br/><br/>MessageGroupId: messages in the same group are delivered in strict FIFO order.<br/>MessageDeduplicationId: duplicate sends within 5 minutes are silently dropped.</>,
    <><b style={{color:meta.color}}>Step 3 — Messages delivered in strict order within each group</b><br/><br/>Within group 'user-A': Order #1 is delivered before Order #2. Always.<br/>Group 'user-B' is processed in parallel independently.<br/><br/>✅ Order #1 → ✅ Order #2 → ✅ Order #3<br/><br/>No message can skip ahead within its group.</>,
    <><b style={{color:meta.color}}>Step 4 — Message fails 3 times (maxReceiveCount)</b><br/><br/>A message that can't be processed is received, visibility timeout expires, and reappears — repeatedly.<br/><br/>After <b>maxReceiveCount=3</b> failures, SQS automatically moves it to the <b>Dead Letter Queue (DLQ)</b> for investigation.<br/><br/>The main queue stays clean and unblocked.</>,
    <><b style={{color:meta.color}}>Step 5 — DLQ holds failed messages for debugging</b><br/><br/><span style={{color:"#a3e635"}}>dlq_url = sqs.create_queue(<br/>{"    "}QueueName='orders-dlq.fifo',<br/>{"    "}Attributes={"{'FifoQueue':'true'}"})['QueueUrl']<br/><br/># Set redrive policy on main queue:<br/>sqs.set_queue_attributes(Attributes={"{'RedrivePolicy':json.dumps({'maxReceiveCount':3,'deadLetterTargetArn':dlq_arn})}"})</span><br/><br/>✅ Alert on DLQ depth → investigate why messages are failing.</>,
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:"rgba(15, 23, 42, 0.4)",border:"1px solid rgba(51, 65, 85, 0.3)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:8,flexWrap:"wrap",marginBottom:12}}>
          <FlowNode tok={T.producer} icon="💻" label="Producer" sub="boto3" active={stage===1||stage===2}/>
          <Arrow on={stage>=2} color={T.producer.border}/>
          {/* FIFO queue */}
          <div style={{flex:1,minWidth:170,borderRadius:10,padding:"12px 14px",background:T.sqs.bg,border:`1.5px solid ${meta.color}80`,backdropFilter:"blur(8px)"}}>
            <div style={{fontSize:11,color:T.sqs.text,fontFamily:"system-ui, -apple-system, sans-serif",fontWeight:600,marginBottom:8}}>☁️ orders.fifo (FIFO Queue)</div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {MSGS.map((m,i)=>{
                const active=stage>=3&&i<3&&!(stage>=4&&i===0);
                const failed=stage>=4&&i===0;
                return(<div key={i} style={{borderRadius:6,padding:"3px 8px",fontSize:10,fontFamily:"monospace",background:failed?"#1a0000":active?meta.color+"20":"#0a0a0a",border:`1px solid ${failed?T.dlq.border:active?meta.color:"rgba(51, 65, 85, 0.5)"}`,color:failed?T.dlq.text:active?T.sqs.text:"#64748b",transition:"all 0.3s"}}>{i+1}. {m}{failed?" ← FAILED 3x ↓":""}</div>);
              })}
              {stage<2&&<div style={{fontSize:10,color:"#64748b",fontFamily:"monospace"}}>empty</div>}
            </div>
          </div>
          <Arrow on={stage>=3} color={meta.color}/>
          <FlowNode tok={T.consumer} icon="🖥️" label="Consumer" sub={stage>=3?"processing…":""} active={stage===3}/>
        </div>
        {/* DLQ */}
        {stage>=4&&(
          <div style={{display:"flex",alignItems:"center",gap:8,paddingLeft:16}}>
            <div style={{fontSize:10,color:T.dlq.text,fontFamily:"monospace"}}>↓ maxReceiveCount exceeded (3x)</div>
            <Arrow on color={T.dlq.border}/>
            <div style={{borderRadius:10,padding:"12px 14px",background:T.dlq.bg,border:`1.5px solid ${T.dlq.border}`,backdropFilter:"blur(8px)"}}>
              <div style={{fontSize:11,color:T.dlq.text,fontFamily:"system-ui, -apple-system, sans-serif",fontWeight:600,marginBottom:4}}>☠️ orders-dlq.fifo (Dead Letter Queue)</div>
              <div style={{fontSize:11,color:T.dlq.text,fontFamily:"monospace"}}>1. Order #1 (group: user-A) ← investigate!</div>
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
    <><b style={{color:meta.color}}>Step 2 — Consumer reads offset 0</b><br/><br/><span style={{color:"#a3e635"}}>msg = consumer.poll(timeout=1.0)<br/># msg.offset() == 0</span><br/><br/>The consumer fetches offset 0. It has NOT committed yet — if it crashes now, it will re-read from offset 0.</>,
    <><b style={{color:meta.color}}>Step 3 — Manual commit after processing</b><br/><br/><span style={{color:"#a3e635"}}># Process the message…<br/>consumer.commit(asynchronous=False)<br/># Committed offset = 1 (next to read)</span><br/><br/>✅ Committed offset advances to <b>1</b>. On restart, Kafka delivers from offset 1 — no re-processing.</>,
    <><b style={{color:meta.color}}>Step 4 — Consumer crashes at offset 4</b><br/><br/>Consumer read offsets 1–4 but crashed before committing offset 4.<br/><br/>On restart, Kafka delivers from offset <b>3</b> (last committed = 3). Offset 3 and 4 are re-processed. This is <b>at-least-once</b> delivery.</>,
    <><b style={{color:meta.color}}>Step 5 — Seek to beginning (replay)</b><br/><br/><span style={{color:"#a3e635"}}>from confluent_kafka import TopicPartition<br/>consumer.seek(TopicPartition('orders', 0, 0))<br/># Consumer jumps back to offset 0!</span><br/><br/>🔁 Useful after a bug fix to re-process all historical messages. Works on any offset, not just 0.</>,
  ];

  const PART_C = meta.color;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={PART_C}/>
      <div style={{borderRadius:10,background:"rgba(15, 23, 42, 0.4)",border:"1px solid rgba(51, 65, 85, 0.3)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        {/* Partition strip */}
        <div style={{fontSize:10,color:T.stream.text,fontFamily:"system-ui, -apple-system, sans-serif",fontWeight:600,marginBottom:8}}>📦 Partition 0 — offsets 0 to 7</div>
        <div style={{display:"flex",gap:4,marginBottom:12}}>
          {Array.from({length:MSGS},(_,i)=>{
            const isConsumed = stage >= 2 && i < consumerAt;
            const isCommitted = i < committedAt;
            const isReplay = stage===5;
            return (
              <div key={i} style={{
                flex:1,minWidth:28,borderRadius:6,padding:"6px 2px",textAlign:"center",transition:"all 0.3s",
                background: isReplay ? PART_C+"30" : isCommitted ? PART_C+"20" : isConsumed ? "rgba(51, 65, 85, 0.5)" : "#080e1a",
                border:`1px solid ${isReplay ? PART_C : isCommitted ? PART_C+"80" : isConsumed ? "#64748b" : "rgba(51, 65, 85, 0.5)"}`,
              }}>
                <div style={{fontSize:9,fontFamily:"monospace",color:isCommitted||isReplay?PART_C:"#475569"}}>off</div>
                <div style={{fontSize:13,fontFamily:"system-ui, -apple-system, sans-serif",fontWeight:600,color:isReplay?PART_C:isCommitted?PART_C:isConsumed?"#64748b":"rgba(51, 65, 85, 0.5)"}}>{i}</div>
              </div>
            );
          })}
        </div>
        {/* Legend row */}
        <div style={{display:"flex",gap:16,fontSize:10,fontFamily:"monospace"}}>
          <span style={{color:PART_C}}>■ committed</span>
          <span style={{color:"#475569"}}>■ read (uncommitted)</span>
          <span style={{color:"rgba(51, 65, 85, 0.5)"}}>■ unread</span>
        </div>
        {stage>=1&&(
          <div style={{marginTop:12,padding:"10px 14px",borderRadius:8,background:`linear-gradient(135deg, ${PART_C}08, ${PART_C}12)`,border:`1px solid ${PART_C}30`,fontSize:12,fontFamily:"system-ui, -apple-system, sans-serif",color:PART_C}}>
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
    <><b style={{color:meta.color}}>Step 1 — Topic created with replication_factor=3</b><br/><br/><span style={{color:"#a3e635"}}>from confluent_kafka.admin import NewTopic<br/>NewTopic('orders', num_partitions=3,<br/>{"         "}replication_factor=3)</span><br/><br/>Kafka assigns Partition 0 to Broker 0 (leader) and replicates it to Brokers 1 and 2 (followers). All writes go to the leader only.</>,
    <><b style={{color:meta.color}}>Step 2 — Followers sync from the leader</b><br/><br/>After each write to the leader, followers pull new messages and catch up. A follower that is caught up is called <b>In-Sync</b> (part of the ISR).<br/><br/>ISR (In-Sync Replicas) = the set of replicas that are eligible to become the new leader.</>,
    <><b style={{color:meta.color}}>Step 3 — Producer sends with acks=1 (leader-only)</b><br/><br/><span style={{color:"#a3e635"}}>Producer({"{'acks': '1'}"})</span><br/><br/>Leader acknowledges the write immediately. Followers may not have the message yet.<br/><br/>⚠️ If Broker 0 crashes RIGHT NOW, the message is lost — followers haven't synced it yet.</>,
    <><b style={{color:meta.color}}>Step 4 — Producer sends with acks=all (safest)</b><br/><br/><span style={{color:"#a3e635"}}>Producer({"{'acks': 'all', 'min.insync.replicas': '2'}"})</span><br/><br/>Leader waits until ALL ISR replicas confirm they have the message.<br/><br/>✅ Even if Broker 0 dies now, Brokers 1 or 2 have the message. Zero data loss.</>,
    <><b style={{color:meta.color}}>Step 5 — Broker 0 (leader) crashes → automatic failover</b><br/><br/>Kafka's controller detects Broker 0 is gone. Within seconds, it elects a new leader from the ISR (Broker 1 or 2).<br/><br/>✅ With acks=all, NO messages were lost. Producers automatically reconnect to the new leader. <b>Clients see no data loss.</b></>,
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:"rgba(15, 23, 42, 0.4)",border:"1px solid rgba(51, 65, 85, 0.3)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        <div style={{fontSize:10,color:"#475569",fontFamily:"system-ui, -apple-system, sans-serif",fontWeight:600,marginBottom:12}}>🗄️ KAFKA CLUSTER — Partition 0 (RF=3)</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {BROKERS.map((b)=>{
            const isFailed = broker0Failed && b.id===0;
            const isNewLeader = broker0Failed && b.id===1;
            const roleLabel = isFailed ? "DEAD" : isNewLeader ? "New Leader" : b.role;
            const inISR = stage >= 2 && !isFailed;
            return (
              <div key={b.id} style={{
                display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:10,transition:"all 0.4s",
                background: isFailed ? "#1a0000" : isNewLeader ? "#f9731615" : `${b.color}12`,
                border:`1px solid ${isFailed ? "#ef4444" : isNewLeader ? "#f97316" : b.color+"60"}`,
                opacity: isFailed ? 0.4 : 1,
              }}>
                <div style={{fontSize:20}}>{isFailed ? "💀" : b.id===0 ? "👑" : "📋"}</div>
                <div style={{flex:1,fontFamily:"monospace",fontSize:11}}>
                  <div style={{color: isFailed?"#ef4444":isNewLeader?"#f97316":b.color,fontWeight:"bold"}}>{b.label} — {roleLabel}</div>
                  <div style={{color:"#475569",marginTop:2}}>
                    Partition 0 {inISR ? "✅ in ISR" : stage>0?"⏳ syncing…":""}
                  </div>
                </div>
                {stage>=3&&!isFailed&&(
                  <div style={{fontSize:10,fontFamily:"monospace",padding:"3px 8px",borderRadius:6,
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
          <div style={{marginTop:10,padding:"10px 14px",borderRadius:8,background:`linear-gradient(135deg, ${meta.color}08, ${meta.color}12)`,border:`1px solid ${meta.color}30`,fontSize:12,fontFamily:"system-ui, -apple-system, sans-serif",color:meta.color}}>
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
    <><b style={{color:meta.color}}>Step 2 — Idempotent producer deduplicates retries</b><br/><br/><span style={{color:"#a3e635"}}>Producer({"{'enable.idempotence': True}"})</span><br/><br/>Each message carries <b>PID</b> (producer ID) + monotonic <b>sequence number</b>. The broker sees a duplicate PID+seq and silently drops it.<br/><br/>✅ Exactly-once delivery to a SINGLE partition.</>,
    <><b style={{color:meta.color}}>Step 3 — Transactional producer: begin_transaction()</b><br/><br/><span style={{color:"#a3e635"}}>p = Producer({"{'transactional.id': 'order-producer-1'}"})<br/>p.init_transactions()<br/>p.begin_transaction()</span><br/><br/>The producer tells the broker: "Everything I send next is part of one atomic unit." Messages are written but marked as <b>PENDING</b>.</>,
    <><b style={{color:meta.color}}>Step 4 — Write to two topics atomically</b><br/><br/><span style={{color:"#a3e635"}}>p.produce('orders', ...)<br/>p.produce('audit_log', ...)<br/># Both PENDING — consumers can't see them yet</span><br/><br/>A <code>read_committed</code> consumer sees neither message until the transaction is committed.</>,
    <><b style={{color:meta.color}}>Step 5 — commit_transaction() → both visible atomically</b><br/><br/><span style={{color:"#a3e635"}}>p.commit_transaction()<br/># OR: p.abort_transaction() to roll back</span><br/><br/>✅ Both messages appear SIMULTANEOUSLY to read_committed consumers. Either both are visible, or neither — never a partial view. This is <b>exactly-once across multiple topics</b>.</>,
  ];

  const txColors = { pending:"#f59e0b", committed:"#22c55e", idle:"rgba(51, 65, 85, 0.5)" };
  const topicState = stage >= 5 ? "committed" : stage >= 3 ? "pending" : "idle";

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <StepBar current={stage} total={STEPS} color={meta.color}/>
      <div style={{borderRadius:10,background:"rgba(15, 23, 42, 0.4)",border:"1px solid rgba(51, 65, 85, 0.3)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        {/* Idempotence layer */}
        {stage>=2&&(
          <div style={{marginBottom:12,padding:"10px 14px",borderRadius:8,background:"rgba(34, 197, 94, 0.1)",border:"1px solid rgba(34, 197, 94, 0.3)",display:"flex",gap:8,alignItems:"center"}}>
            <span style={{fontSize:16}}>🔑</span>
            <span style={{fontSize:12,fontFamily:"system-ui, -apple-system, sans-serif",color:"#4ade80",fontWeight:500}}>Idempotent Producer — PID: 42 | Seq: {stage >= 3 ? "2,3" : "1"} | duplicates auto-dropped</span>
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
              <div style={{fontSize:16}}>{i===0?"📦":"📋"}</div>
              <div style={{fontSize:11,fontFamily:"system-ui, -apple-system, sans-serif",fontWeight:600,color:txColors[topicState],marginTop:4}}>{t}</div>
              <div style={{fontSize:10,fontFamily:"monospace",color:"#475569",marginTop:2}}>
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
            fontSize:12,fontFamily:"monospace",color:txColors[topicState]}}>
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
    <><b style={{color:meta.color}}>Step 1 — Create a compacted topic</b><br/><br/><span style={{color:"#a3e635"}}>NewTopic('user_profiles',<br/>{"  "}config={"{'cleanup.policy': 'compact'}"})</span><br/><br/>Unlike normal topics (delete policy), compacted topics keep the <b>latest value per key forever</b>. Old superseded values are cleaned up in the background.</>,
    <><b style={{color:meta.color}}>Step 2 — Producer writes initial values</b><br/><br/><span style={{color:"#a3e635"}}>producer.produce('user_profiles', key='user-1', value='Alice v1')<br/>producer.produce('user_profiles', key='user-2', value='Bob')</span><br/><br/>At this point: user-1 → Alice v1, user-2 → Bob. Both are in the log with different keys.</>,
    <><b style={{color:meta.color}}>Step 3 — Update user-1 (same key, new value)</b><br/><br/><span style={{color:"#a3e635"}}>producer.produce('user_profiles', key='user-1', value='Alice v3')</span><br/><br/>The log now has TWO messages for 'user-1'. Before compaction: both old and new exist. After compaction: only 'Alice v3' remains.</>,
    <><b style={{color:meta.color}}>Step 4 — Tombstone: delete user-3</b><br/><br/><span style={{color:"#a3e635"}}>producer.produce('user_profiles', key='user-3', value=None)</span><br/><br/>Producing <code>value=None</code> is a <b>tombstone</b>. It tells Kafka: "delete this key during compaction." After compaction runs, user-3 disappears completely.</>,
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
      <div style={{borderRadius:10,background:"rgba(15, 23, 42, 0.4)",border:"1px solid rgba(51, 65, 85, 0.3)",padding:"20px 16px",backdropFilter:"blur(12px)"}}>
        <div style={{fontSize:10,color:"#475569",fontFamily:"system-ui, -apple-system, sans-serif",fontWeight:600,marginBottom:12}}>
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
                background: hidden ? "#080e1a" : isTombstone ? "#1a000040" : `${color}12`,
                border:`1px solid ${hidden ? "rgba(51, 65, 85, 0.5)" : color+"50"}`,
              }}>
                <div style={{fontSize:10,fontFamily:"monospace",color:"#475569",minWidth:60}}>offset={e.offset}</div>
                <div style={{fontSize:11,fontFamily:"monospace",color,fontWeight:"bold",minWidth:60}}>key='{e.key}'</div>
                <div style={{fontSize:11,fontFamily:"monospace",color: isTombstone?"#ef4444":color}}>
                  {isTombstone ? "🪦 TOMBSTONE (value=None)" : `value='${e.val}'`}
                </div>
                {hidden && <div style={{fontSize:10,fontFamily:"monospace",color:"rgba(71, 85, 105, 0.5)",marginLeft:"auto"}}>compacted away</div>}
                {compacted && !hidden && !isTombstone && <div style={{fontSize:10,color:meta.color,marginLeft:"auto"}}>✅ retained</div>}
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
    <div style={{ borderRadius: 8, padding: "6px 10px", border: `1px solid ${active ? color : color + "40"}`, background: active ? color + "20" : "#0a0a0a", transition: "all 0.35s", minWidth: 90, textAlign: "center" }}>
      <div style={{ fontSize: 11, fontWeight: "bold", fontFamily: "monospace", color: active ? color : color + "80" }}>{label}</div>
      {sub && <div style={{ fontSize: 9, fontFamily: "monospace", color: "#475569", marginTop: 2 }}>{sub}</div>}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StepBar current={stage} total={STEPS} color={meta.color} />
      {/* Istiod control plane */}
      <div style={{ textAlign: "center", padding: "8px 0" }}>
        <div style={{ display: "inline-block", borderRadius: 10, padding: "6px 20px", border: `2px solid ${istiodActive ? "#0ea5e9" : "rgba(51, 65, 85, 0.5)"}`, background: istiodActive ? "#0ea5e920" : "#0a0a0a", transition: "all 0.4s" }}>
          <div style={{ fontSize: 12, fontWeight: "bold", fontFamily: "monospace", color: istiodActive ? "#0ea5e9" : "#64748b" }}>🧠 Istiod (Control Plane)</div>
          <div style={{ fontSize: 10, fontFamily: "monospace", color: "#475569", marginTop: 2 }}>Pilot · Citadel · Galley</div>
        </div>
        {istiodActive && <div style={{ fontSize: 10, fontFamily: "monospace", color: "#0ea5e9", marginTop: 4 }}>↓ xDS config push (gRPC)</div>}
      </div>
      {/* Pod */}
      <div style={{ borderRadius: 12, border: `2px solid ${injected ? "#0ea5e9" : "#64748b"}`, padding: 14, background: "#080e1a", transition: "all 0.4s" }}>
        <div style={{ fontSize: 10, fontFamily: "monospace", color: "#475569", marginBottom: 10 }}>
          {stage >= 2 ? "✅ namespace: demo  |  label: istio-injection=enabled" : "namespace: demo  |  no injection label"}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
          {box("📦 App Container", "port :8080", "#22c55e", true)}
          {injected && (
            <>
              <div style={{ fontSize: 16, color: "#0ea5e9" }}>+</div>
              {box("🔷 Envoy Sidecar", "port :15001", "#0ea5e9", traffic)}
            </>
          )}
        </div>
        {traffic && (
          <div style={{ marginTop: 10, fontSize: 10, fontFamily: "monospace", color: "#0ea5e9", textAlign: "center", padding: "4px 8px", background: "#0ea5e910", borderRadius: 6, border: "1px solid #0ea5e930" }}>
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
          <div style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(71, 85, 105, 0.4)", background: "rgba(15, 23, 42, 0.6)", fontSize: 12, fontFamily: "system-ui, -apple-system, sans-serif", color: "#94a3b8", backdropFilter: "blur(8px)" }}>
            {useHeader ? "🌐 Request  [x-version: v2]" : "🌐 Request  [no version header]"}
          </div>
          {stage >= 2 && <div style={{ fontSize: 10, color: "#14b8a6" }}>→</div>}
        </div>
        {/* VirtualService */}
        {stage >= 2 && (
          <div style={{ borderRadius: 10, border: `1px solid #14b8a6`, background: "#14b8a610", padding: "8px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 11, fontWeight: "bold", fontFamily: "monospace", color: "#14b8a6" }}>📋 VirtualService: myapp</div>
            <div style={{ fontSize: 10, fontFamily: "monospace", color: "#475569", marginTop: 4 }}>
              {stage >= 4 ? "match: x-version=v2 → subset: v2 | default → subset: v1" : "default route → subset: v1"}
            </div>
          </div>
        )}
        {/* DestinationRule + subsets */}
        {stage >= 3 && (
          <div style={{ borderRadius: 10, border: "1px solid #8b5cf6", background: "#8b5cf610", padding: "8px 14px" }}>
            <div style={{ fontSize: 11, fontWeight: "bold", fontFamily: "monospace", color: "#8b5cf6", marginBottom: 6 }}>🎯 DestinationRule: myapp</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              {["v1", "v2"].map(v => (
                <div key={v} style={{ borderRadius: 8, padding: "5px 16px", border: `1px solid ${activeSubset === v ? "#22c55e" : "#64748b"}`, background: activeSubset === v ? "#22c55e20" : "#0a0a0a", transition: "all 0.35s", textAlign: "center" }}>
                  <div style={{ fontSize: 11, fontWeight: "bold", fontFamily: "monospace", color: activeSubset === v ? "#22c55e" : "#475569" }}>subset: {v}</div>
                  <div style={{ fontSize: 10, fontFamily: "monospace", color: "#64748b" }}>version={v}</div>
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
      <div style={{ borderRadius: 12, border: "1px solid rgba(51, 65, 85, 0.5)", background: "#080e1a", padding: 16 }}>
        <div style={{ fontSize: 10, fontFamily: "monospace", color: "#475569", marginBottom: 10, textAlign: "center" }}>VirtualService weight split</div>
        <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", height: 32, marginBottom: 10, transition: "all 0.5s" }}>
          {w1 > 0 && <div style={{ flex: w1, background: "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: "bold", fontFamily: "monospace", color: "#fff", transition: "flex 0.5s" }}>{w1}% v1</div>}
          {w2 > 0 && <div style={{ flex: w2, background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: "bold", fontFamily: "monospace", color: "#fff", transition: "flex 0.5s" }}>{w2}% v2</div>}
        </div>
        {/* Pods */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          {[
            { label: "v1 pods", color: "#6366f1", weight: w1 },
            { label: "v2 pods", color: "#22c55e", weight: w2 },
          ].map(({ label, color, weight }) => (
            <div key={label} style={{ textAlign: "center", opacity: weight === 0 ? 0.3 : 1, transition: "opacity 0.4s" }}>
              <div style={{ fontSize: 20 }}>📦📦</div>
              <div style={{ fontSize: 10, fontFamily: "monospace", color, marginTop: 2 }}>{label}</div>
              <div style={{ fontSize: 10, fontFamily: "monospace", color: "#475569" }}>weight: {weight}</div>
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
  const faultColors = { none: "#475569", delay: "#f59e0b", abort: "#ef4444" };
  const fc = faultColors[faultType];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StepBar current={stage} total={STEPS} color={meta.color} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        <div style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid rgba(71, 85, 105, 0.4)", background: "rgba(15, 23, 42, 0.6)", fontSize: 12, fontFamily: "system-ui, -apple-system, sans-serif", color: "#94a3b8", textAlign: "center", backdropFilter: "blur(8px)" }}>
          🌐 Client<br />{headerScoped ? "[x-test-fault: inject]" : "[request]"}
        </div>
        <div style={{ fontSize: 16, color: "#475569" }}>→</div>
        {/* Fault injector */}
        <div style={{ padding: "8px 14px", borderRadius: 8, border: `2px solid ${fc}`, background: fc + "15", fontSize: 11, fontFamily: "monospace", color: fc, textAlign: "center", minWidth: 110, transition: "all 0.4s" }}>
          🔷 Envoy<br />
          {faultType === "delay" && "⏰ +5s delay (50%)"}
          {faultType === "abort" && "💥 503 abort (10%)"}
          {faultType === "none" && "no fault"}
        </div>
        {faultType !== "abort" && <div style={{ fontSize: 16, color: "#475569" }}>→</div>}
        {faultType !== "abort" && (
          <div style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #22c55e55", background: "#022c1c", fontSize: 11, fontFamily: "monospace", color: "#86efac", textAlign: "center" }}>
            📦 Service
          </div>
        )}
        {faultType === "abort" && (
          <div style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #ef4444", background: "#ef444415", fontSize: 11, fontFamily: "monospace", color: "#ef4444" }}>
            ← HTTP 503
          </div>
        )}
      </div>
      {stage >= 4 && (
        <div style={{ borderRadius: 8, padding: "8px 12px", border: "1px solid #f59e0b40", background: "#f59e0b10", fontSize: 10, fontFamily: "monospace", color: "#f59e0b", textAlign: "center" }}>
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
        <div style={{ padding: "6px 20px", borderRadius: 8, border: "1px solid #f97316", background: "#f9731620", fontSize: 11, fontWeight: "bold", fontFamily: "monospace", color: "#f97316" }}>
          ⚖️ Envoy Load Balancer
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {pods.map(p => {
            const color = p.ejected ? "#ef4444" : p.error ? "#f59e0b" : "#22c55e";
            const label = p.ejected ? (p.recovering ? "🔄 PROBE" : "🚫 EJECTED") : p.error ? "⚠️ ERRORS" : "✅ healthy";
            return (
              <div key={p.id} style={{ borderRadius: 10, padding: "10px 14px", border: `2px solid ${color}`, background: color + "15", textAlign: "center", minWidth: 80, transition: "all 0.4s", opacity: p.ejected && !p.recovering ? 0.5 : 1 }}>
                <div style={{ fontSize: 18 }}>📦</div>
                <div style={{ fontSize: 10, fontWeight: "bold", fontFamily: "monospace", color, marginTop: 4 }}>{p.id}</div>
                <div style={{ fontSize: 9, fontFamily: "monospace", color, marginTop: 2 }}>{label}</div>
              </div>
            );
          })}
        </div>
        {pod3Ejected && !pod3Recovering && (
          <div style={{ fontSize: 10, fontFamily: "monospace", color: "#ef4444", padding: "4px 12px", background: "#ef444415", borderRadius: 6, border: "1px solid #ef444430" }}>
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
      <div style={{ padding: "7px 12px", borderRadius: 8, border: `2px solid ${active ? "#8b5cf6" : "rgba(51, 65, 85, 0.5)"}`, background: active ? "#8b5cf620" : "#0a0a0a", textAlign: "center", transition: "all 0.4s", width: "100%" }}>
        <div style={{ fontSize: 16 }}>{icon}</div>
        <div style={{ fontSize: 10, fontWeight: "bold", fontFamily: "monospace", color: active ? "#8b5cf6" : "#64748b", marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: 9, fontFamily: "monospace", color: "#475569", marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StepBar current={stage} total={STEPS} color={meta.color} />
      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
        {step("Internet", "HTTPS :443", stage >= 2, "🌐")}
        <div style={{ fontSize: 12, color: "#475569" }}>→</div>
        {step("Gateway", tlsActive ? "TLS terminated" : "port :443", stage >= 2, "🚪")}
        <div style={{ fontSize: 12, color: "#475569" }}>→</div>
        {step("VirtualService", "host/path rules", vsActive, "🗺️")}
        <div style={{ fontSize: 12, color: "#475569" }}>→</div>
        {step("Service Pod", "app:myapp", svcActive, "📦")}
      </div>
      {tlsActive && (
        <div style={{ borderRadius: 8, padding: "6px 12px", border: "1px solid #06b6d440", background: "#06b6d410", fontSize: 10, fontFamily: "monospace", color: "#06b6d4", textAlign: "center" }}>
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
  const modeColor = { none: "#475569", permissive: "#f59e0b", strict: "#06b6d4" }[mode];
  const NARR = [
    "No Istio: services communicate over plain HTTP. Any compromised pod can intercept or spoof traffic — no identity verification.",
    "Step 1 — Start with PERMISSIVE mode: PeerAuthentication allows both mTLS and plaintext. Safe for gradual migration while old clients catch up.",
    "Step 2 — Deploy sidecars: Envoy automatically negotiates mTLS with peers that support it. Legacy clients still use plaintext.",
    "Step 3 — Switch to STRICT mode: kubectl apply PeerAuthentication with mode=STRICT. All plaintext connections are now rejected with a TLS handshake error.",
    "Step 4 — Certificate exchange: Citadel (inside Istiod) issues SVID certs to each sidecar. Both sides present certs and verify the peer SPIFFE identity.",
    "Step 5 — Encrypted tunnel: all service-to-service data flows through a mutually authenticated TLS 1.3 tunnel. Zero plaintext even inside the cluster.",
  ];
  const serviceBox = (label, sa, side) => (
    <div style={{ borderRadius: 10, border: `2px solid ${encrypted ? "#06b6d4" : mode !== "none" ? "#06b6d460" : "#64748b"}`, background: "#031520", padding: "10px 14px", textAlign: "center", minWidth: 100, transition: "all 0.4s" }}>
      <div style={{ fontSize: 18 }}>📦</div>
      <div style={{ fontSize: 10, fontWeight: "bold", fontFamily: "monospace", color: "#7dd3fc" }}>{label}</div>
      <div style={{ fontSize: 9, fontFamily: "monospace", color: "#475569" }}>sa/{sa}</div>
      {certExchange && <div style={{ marginTop: 4, fontSize: 9, fontFamily: "monospace", color: "#06b6d4" }}>📜 SVID cert</div>}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StepBar current={stage} total={STEPS} color={meta.color} />
      {/* Mode badge */}
      <div style={{ textAlign: "center" }}>
        <span style={{ padding: "3px 14px", borderRadius: 20, fontSize: 11, fontWeight: "bold", fontFamily: "monospace", background: modeColor + "20", border: `1px solid ${modeColor}`, color: modeColor, transition: "all 0.4s" }}>
          PeerAuthentication mode: {mode.toUpperCase()}
        </span>
      </div>
      {/* Service-to-service diagram */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
        {serviceBox("frontend", "frontend")}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{ height: 3, width: 60, borderRadius: 2, background: encrypted ? "#06b6d4" : mode !== "none" ? "#06b6d440" : "#64748b", transition: "all 0.4s" }} />
          <div style={{ fontSize: 9, fontFamily: "monospace", color: encrypted ? "#06b6d4" : "#475569", transition: "all 0.4s" }}>
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
            <div key={c.label} style={{ borderRadius: 8, padding: "8px 12px", border: `1px solid ${c.tried ? (c.allowed ? "#22c55e" : "#ef4444") : "rgba(51, 65, 85, 0.5)"}`, background: "#0a0a0a", textAlign: "center", minWidth: 100, transition: "all 0.4s" }}>
              <div style={{ fontSize: 14 }}>{c.allowed ? "📦" : "☠️"}</div>
              <div style={{ fontSize: 10, fontWeight: "bold", fontFamily: "monospace", color: c.tried ? (c.allowed ? "#22c55e" : "#ef4444") : "#475569" }}>{c.label}</div>
              <div style={{ fontSize: 9, fontFamily: "monospace", color: "#64748b" }}>{c.sa}</div>
              {c.tried && <div style={{ fontSize: 10, marginTop: 4, color: c.allowed ? "#22c55e" : "#ef4444" }}>{c.allowed ? "✅ 200 OK" : "🚫 403"}</div>}
            </div>
          ))}
        </div>
        {/* Policy */}
        {policyActive && (
          <div style={{ borderRadius: 10, border: `1px solid #ec4899`, background: "#ec489910", padding: "10px 14px", minWidth: 180, fontSize: 10, fontFamily: "monospace" }}>
            <div style={{ fontWeight: "bold", color: "#ec4899", marginBottom: 6 }}>🔑 AuthorizationPolicy</div>
            <div style={{ color: "#94a3b8" }}>action: ALLOW</div>
            <div style={{ color: "#94a3b8" }}>from: sa/frontend</div>
            <div style={{ color: "#94a3b8" }}>methods: GET, POST</div>
            <div style={{ color: "#94a3b8" }}>paths: /api/*</div>
            {denyDefault && <div style={{ marginTop: 6, color: "#ef4444" }}>implicit: DENY all others</div>}
          </div>
        )}
        {/* Backend */}
        <div style={{ borderRadius: 10, border: "1px solid #ec489950", background: "#031520", padding: "10px 14px", textAlign: "center", alignSelf: "center", minWidth: 90 }}>
          <div style={{ fontSize: 18 }}>📦</div>
          <div style={{ fontSize: 10, fontWeight: "bold", fontFamily: "monospace", color: "#7dd3fc" }}>backend</div>
          <div style={{ fontSize: 9, fontFamily: "monospace", color: "#475569" }}>sa/backend</div>
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
    <div style={{ borderRadius: 8, padding: "8px 12px", border: `1px solid ${active ? color : "rgba(51, 65, 85, 0.5)"}`, background: active ? color + "15" : "#0a0a0a", textAlign: "center", minWidth: 90, transition: "all 0.4s" }}>
      <div style={{ fontSize: 18 }}>{icon}</div>
      <div style={{ fontSize: 10, fontWeight: "bold", fontFamily: "monospace", color: active ? color : "#64748b" }}>{label}</div>
      {sub && <div style={{ fontSize: 9, fontFamily: "monospace", color: "#475569", marginTop: 1 }}>{sub}</div>}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StepBar current={stage} total={STEPS} color={meta.color} />
      {/* Services row */}
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        {["frontend", "orders", "payment"].map(s => (
          <div key={s} style={{ borderRadius: 8, padding: "6px 10px", border: "1px solid rgba(51, 65, 85, 0.5)", background: "#0a0a0a", textAlign: "center" }}>
            <div style={{ fontSize: 13 }}>📦</div>
            <div style={{ fontSize: 9, fontFamily: "monospace", color: "#475569" }}>{s}</div>
            {metricsFlow && <div style={{ fontSize: 8, color: "#eab308", marginTop: 2 }}>→ metrics</div>}
            {tracingFlow  && <div style={{ fontSize: 8, color: "#a855f7", marginTop: 1 }}>→ traces</div>}
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
        <div style={{ borderRadius: 8, padding: "6px 14px", border: "1px solid #ef4444", background: "#ef444415", fontSize: 10, fontFamily: "monospace", color: "#ef4444", textAlign: "center" }}>
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
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "monospace" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e293b" }}>
              {["Profile", "Control Plane", "Ingress GW", "Egress GW", "~Memory", "Best For"].map(h => (
                <th key={h} style={{ padding: "6px 8px", textAlign: "left", color: "#475569", fontWeight: "bold" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PROFILES.map(p => {
              const active = activeProfile === p.name;
              const highlight = stage >= 2;
              return (
                <tr key={p.name} style={{ borderBottom: "1px solid #0f172a", background: active ? meta.color + "15" : "transparent", transition: "all 0.3s" }}>
                  <td style={{ padding: "7px 8px", fontWeight: "bold", color: active ? meta.color : "#94a3b8" }}>{p.name}</td>
                  <td style={{ padding: "7px 8px", color: p.cp ? "#22c55e" : "#334155" }}>{p.cp ? "✅" : "—"}</td>
                  <td style={{ padding: "7px 8px", color: p.ig ? "#22c55e" : "#334155" }}>{p.ig ? "✅" : "—"}</td>
                  <td style={{ padding: "7px 8px", color: p.eg ? "#22c55e" : "#334155" }}>{p.eg ? "✅" : "—"}</td>
                  <td style={{ padding: "7px 8px", color: "#64748b" }}>{p.mem}</td>
                  <td style={{ padding: "7px 8px", color: "#64748b" }}>{p.use}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {stage >= 4 && (
        <div style={{ borderRadius: 8, padding: "8px 12px", border: "1px solid #38bdf840", background: "#38bdf810", fontSize: 10, fontFamily: "monospace", color: "#38bdf8" }}>
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
    <div style={{ borderRadius: 8, padding: "8px 12px", border: `1px solid ${registered ? "#34d399" : blocked ? "#ef4444" : "#1e293b"}`, background: registered ? "#34d39915" : blocked ? "#ef444415" : "#0a0a0a", transition: "all 0.35s", textAlign: "center", minWidth: 140 }}>
      <div style={{ fontSize: 12 }}>{registered ? "🌐" : blocked ? "🚫" : "🌐"}</div>
      <div style={{ fontSize: 10, fontFamily: "monospace", color: registered ? "#34d399" : blocked ? "#ef4444" : "#475569", fontWeight: "bold" }}>{label}</div>
      <div style={{ fontSize: 9, fontFamily: "monospace", color: "#334155", marginTop: 2 }}>{registered ? "✅ ServiceEntry" : blocked ? "BLOCKED" : "external"}</div>
      {tlsOrig && registered && <div style={{ fontSize: 9, color: "#06b6d4", marginTop: 2 }}>🔐 TLS origination</div>}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StepBar current={stage} total={STEPS} color={meta.color} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
        <div style={{ borderRadius: 10, padding: "10px 14px", border: "1px solid #34d39930", background: "#031520", textAlign: "center" }}>
          <div style={{ fontSize: 16 }}>📦</div>
          <div style={{ fontSize: 10, fontFamily: "monospace", color: "#7dd3fc" }}>app pod</div>
        </div>
        <div style={{ fontSize: 14, color: "#475569" }}>→</div>
        <div style={{ borderRadius: 8, padding: "6px 10px", border: "1px solid #0ea5e940", background: "#031520", textAlign: "center" }}>
          <div style={{ fontSize: 10, fontFamily: "monospace", color: "#0ea5e9" }}>🔷 Envoy</div>
          <div style={{ fontSize: 9, fontFamily: "monospace", color: "#334155" }}>{stage >= 2 ? "REGISTRY_ONLY" : "ALLOW_ANY"}</div>
        </div>
        <div style={{ fontSize: 14, color: "#475569" }}>→</div>
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
    <div style={{ borderRadius: 10, padding: "8px 12px", border: `2px solid ${active ? "#fb7185" : "#1e293b"}`, background: active ? "#fb718515" : "#0a0a0a", textAlign: "center", minWidth: 80, transition: "all 0.35s" }}>
      <div style={{ fontSize: 16 }}>{icon}</div>
      <div style={{ fontSize: 10, fontWeight: "bold", fontFamily: "monospace", color: active ? "#fb7185" : "#475569" }}>{label}</div>
      {sub && <div style={{ fontSize: 9, fontFamily: "monospace", color: "#334155", marginTop: 2 }}>{sub}</div>}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StepBar current={stage} total={STEPS} color={meta.color} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        {node("📦", "App Pod", "namespace", true)}
        <div style={{ fontSize: 11, color: "#475569" }}>→</div>
        {gwActive
          ? node("🚪", "Egress GW", tlsOrig ? "TLS orig" : "istio-system", true)
          : <div style={{ borderRadius: 10, padding: "8px 12px", border: "1px dashed #1e293b", background: "#0a0a0a", textAlign: "center", minWidth: 80 }}>
              <div style={{ fontSize: 10, fontFamily: "monospace", color: "#1e293b" }}>no gateway</div>
            </div>
        }
        <div style={{ fontSize: 11, color: "#475569" }}>→</div>
        {node("🌐", "api.payment.com", ":443 external", gwActive)}
      </div>
      {auditOn && (
        <div style={{ borderRadius: 8, padding: "6px 12px", border: "1px solid #fb718440", background: "#fb718410", fontSize: 10, fontFamily: "monospace", color: "#fb7185", textAlign: "center" }}>
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
    <div style={{ borderRadius: 8, padding: "6px 10px", border: `1px solid ${color}`, background: color + "12", textAlign: "center", fontSize: 10, fontFamily: "monospace", color }}>
      <div style={{ fontSize: 14 }}>{icon}</div>
      <div style={{ fontWeight: "bold" }}>{label}</div>
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StepBar current={stage} total={STEPS} color={meta.color} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
        <div style={{ borderRadius: 10, padding: "10px 12px", border: "1px solid #1e293b", background: "#0a0a0a", textAlign: "center" }}>
          <div style={{ fontSize: 16 }}>🌐</div>
          <div style={{ fontSize: 10, fontFamily: "monospace", color: "#94a3b8" }}>Client</div>
          {validToken && <div style={{ fontSize: 9, color: "#22c55e", marginTop: 2 }}>🎫 JWT token</div>}
          {noToken    && <div style={{ fontSize: 9, color: "#ef4444", marginTop: 2 }}>❌ no token</div>}
        </div>
        <div style={{ fontSize: 12, color: "#475569" }}>→</div>
        {raActive && (
          <div style={{ borderRadius: 10, padding: "8px 12px", border: `1px solid #a78bfa`, background: "#a78bfa12", textAlign: "center", minWidth: 130 }}>
            <div style={{ fontSize: 10, fontWeight: "bold", fontFamily: "monospace", color: "#a78bfa" }}>RequestAuthentication</div>
            <div style={{ fontSize: 9, fontFamily: "monospace", color: "#475569", marginTop: 2 }}>issuer: auth.example.com</div>
            <div style={{ fontSize: 9, fontFamily: "monospace", color: "#475569" }}>jwksUri: /.well-known/jwks</div>
            {combined && <div style={{ fontSize: 9, color: "#ec4899", marginTop: 4 }}>+ AuthzPolicy: role=admin</div>}
          </div>
        )}
        <div style={{ fontSize: 12, color: "#475569" }}>→</div>
        <div style={{ borderRadius: 10, padding: "8px 12px", border: `1px solid ${noToken ? "#ef444450" : validToken ? "#22c55e50" : "#1e293b"}`, background: "#031520", textAlign: "center", transition: "all 0.4s" }}>
          <div style={{ fontSize: 16 }}>📦</div>
          <div style={{ fontSize: 10, fontFamily: "monospace", color: noToken ? "#ef4444" : validToken ? "#22c55e" : "#475569" }}>
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
        <div style={{ borderRadius: 10, border: `1px solid ${active.color}40`, background: "#080e1a", overflow: "hidden" }}>
          <div style={{ padding: "7px 12px", background: active.color + "18", borderBottom: `1px solid ${active.color}30`, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, fontFamily: "monospace", fontWeight: "bold", color: active.color }}>{active.title}</span>
          </div>
          <div style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 10, color: "#4ade80", background: "#020617" }}>
            <div style={{ color: "#475569", marginBottom: 4 }}>$ {active.cmd}</div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "#94a3b8", lineHeight: 1.6 }}>{active.output}</pre>
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
        <div style={{ borderRadius: 10, padding: "8px 12px", border: "1px solid #1e293b", background: "#0a0a0a", textAlign: "center" }}>
          <div style={{ fontSize: 16 }}>🌐</div>
          <div style={{ fontSize: 10, fontFamily: "monospace", color: "#94a3b8" }}>Client</div>
          {headerMod && <div style={{ fontSize: 9, color: "#67e8f9", marginTop: 2 }}>x-source: production</div>}
        </div>
        <div style={{ fontSize: 14, color: "#475569" }}>→</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          <div style={{ borderRadius: 10, padding: "8px 12px", border: "2px solid #6366f1", background: "#6366f115", textAlign: "center", minWidth: 80 }}>
            <div style={{ fontSize: 10, fontWeight: "bold", fontFamily: "monospace", color: "#a5b4fc" }}>📦 v1</div>
            <div style={{ fontSize: 9, fontFamily: "monospace", color: "#22c55e" }}>← response returned</div>
          </div>
          {mirrorOn && (
            <div style={{ borderRadius: 10, padding: "8px 12px", border: `2px dashed #67e8f9`, background: "#67e8f910", textAlign: "center", minWidth: 80, opacity: 0.85 }}>
              <div style={{ fontSize: 10, fontWeight: "bold", fontFamily: "monospace", color: "#67e8f9" }}>📦 v2 (mirror)</div>
              <div style={{ fontSize: 9, fontFamily: "monospace", color: "#475569" }}>response discarded</div>
              {pct > 0 && <div style={{ fontSize: 9, color: "#67e8f9" }}>{pct}% mirrored</div>}
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
      <div style={{ borderRadius: 10, border: "1px solid #1e293b", background: "#080e1a", padding: 12 }}>
        <div style={{ fontSize: 10, fontFamily: "monospace", color: "#475569", marginBottom: 8, textAlign: "center" }}>
          {scoped ? "🔷 Envoy config (scoped — after Sidecar resource)" : "🔷 Envoy config (default — all services)"}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "center" }}>
          {allSvcs.map(s => {
            const needed = neededSvcs.includes(s);
            const visible = !scoped || needed;
            return (
              <div key={s} style={{ padding: "3px 8px", borderRadius: 6, border: `1px solid ${visible ? "#4ade8050" : "#1e293b"}`, background: visible ? "#4ade8010" : "transparent", fontSize: 9, fontFamily: "monospace", color: visible ? "#4ade80" : "#1e293b", transition: "all 0.4s", opacity: visible ? 1 : 0.2 }}>
                {s}
              </div>
            );
          })}
        </div>
        {scoped && (
          <div style={{ marginTop: 8, fontSize: 10, fontFamily: "monospace", color: "#4ade80", textAlign: "center" }}>
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
            <div key={algo.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", borderRadius: 8, border: `1px solid ${isActive ? algo.color : "#1e293b"}`, background: isActive ? algo.color + "15" : "#080e1a", transition: "all 0.35s" }}>
              <span style={{ fontSize: 10, fontFamily: "monospace", fontWeight: "bold", color: isActive ? algo.color : "#334155", minWidth: 130 }}>{algo.name}</span>
              <span style={{ fontSize: 9, fontFamily: "monospace", color: "#64748b", flex: 1 }}>{algo.desc}</span>
              <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: isActive ? algo.color + "25" : "#1e293b", color: isActive ? algo.color : "#334155", fontFamily: "monospace" }}>{algo.tag}</span>
            </div>
          );
        })}
      </div>
      {stage >= 4 && (
        <div style={{ borderRadius: 8, padding: "7px 12px", border: "1px solid #0ea5e940", background: "#0ea5e910", fontSize: 10, fontFamily: "monospace", color: "#0ea5e9" }}>
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
    <div style={{ borderRadius: 8, padding: "6px 10px", border: `1px solid ${active ? "#818cf8" : "#1e293b"}`, background: active ? "#818cf815" : "#0a0a0a", textAlign: "center", minWidth: 70, transition: "all 0.4s" }}>
      <div style={{ fontSize: 12 }}>📦</div>
      <div style={{ fontSize: 9, fontFamily: "monospace", color: active ? "#818cf8" : "#334155" }}>{label}</div>
      {hasEnvoy && <div style={{ fontSize: 8, color: "#f59e0b", marginTop: 1 }}>+Envoy 🔷</div>}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StepBar current={stage} total={STEPS} color={meta.color} />
      {!ambientMode ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 10, fontFamily: "monospace", color: "#475569", textAlign: "center" }}>Sidecar mode — Envoy injected into every pod</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            {["pod-1","pod-2","pod-3","pod-4","pod-5"].map(p => podStyle(p, true, false))}
          </div>
          <div style={{ fontSize: 10, fontFamily: "monospace", color: "#ef4444", textAlign: "center" }}>5 × ~50 MB = ~250 MB proxy overhead</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 10, fontFamily: "monospace", color: "#818cf8", textAlign: "center" }}>Ambient mode — no sidecars, ztunnel on each node</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            {["pod-1","pod-2","pod-3","pod-4","pod-5"].map(p => podStyle(p, false, true))}
          </div>
          <div style={{ borderRadius: 8, padding: "6px 12px", border: "1px solid #818cf840", background: "#818cf810", fontSize: 10, fontFamily: "monospace", color: "#818cf8", textAlign: "center" }}>
            🔷 ztunnel (DaemonSet, 1 per node · ~50 MB) handles L4 mTLS for all pods
          </div>
          {waypointOn && (
            <div style={{ borderRadius: 8, padding: "6px 12px", border: "1px solid #06b6d440", background: "#06b6d410", fontSize: 10, fontFamily: "monospace", color: "#06b6d4", textAlign: "center" }}>
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
        <div style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #1e293b", background: "#0a0a0a", textAlign: "center" }}>
          <div style={{ fontSize: 14 }}>🌐</div>
          <div style={{ fontSize: 9, fontFamily: "monospace", color: "#94a3b8" }}>Request</div>
        </div>
        <div style={{ fontSize: 12, color: "#475569" }}>→</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {PHASES.map(ph => (
            <div key={ph.name} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${ph.active ? ph.color : "#1e293b"}`, background: ph.active ? ph.color + "15" : "#0a0a0a", fontSize: 9, fontFamily: "monospace", color: ph.active ? ph.color : "#334155", transition: "all 0.35s", display: "flex", gap: 8 }}>
              <span style={{ fontWeight: "bold", minWidth: 40 }}>{ph.name}</span>
              <span style={{ color: ph.active ? ph.color + "cc" : "#1e293b" }}>{ph.desc}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "#475569" }}>→</div>
        <div style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${rateLimited ? "#ef4444" : customHeader ? "#22c55e" : "#1e293b"}`, background: "#0a0a0a", textAlign: "center", transition: "all 0.4s" }}>
          <div style={{ fontSize: 14 }}>📦</div>
          <div style={{ fontSize: 9, fontFamily: "monospace", color: rateLimited ? "#ef4444" : customHeader ? "#22c55e" : "#475569" }}>
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
      background: dim ? "#0a0a0a" : (warn ? "#7f1d1d" : color + "18"),
      border: `1.5px solid ${dim ? "#1e293b" : (warn ? "#ef4444" : color + (pulse ? "ff" : "60"))}`,
      boxShadow: pulse && !dim ? `0 0 12px ${color}50` : "none",
      transition: "all 0.4s", opacity: dim ? 0.35 : 1,
    }}>
      <div style={{ fontSize: 11, fontWeight: "bold", color: dim ? "#334155" : (warn ? "#fca5a5" : color), fontFamily: "monospace" }}>{label}</div>
      {sub && <div style={{ fontSize: 9, color: dim ? "#1e293b" : "#475569", marginTop: 2, fontFamily: "monospace" }}>{sub}</div>}
    </div>
  );
}

function ScenarioArrow({ label, active, color = "#0ea5e9", blocked = false, vertical = false }) {
  const C = blocked ? "#ef4444" : (active ? color : "#1e293b");
  return (
    <div style={{
      display: "flex", flexDirection: vertical ? "column" : "row",
      alignItems: "center", gap: 2, minWidth: vertical ? "auto" : 40,
    }}>
      {label && <span style={{ fontSize: 8, fontFamily: "monospace", color: C, whiteSpace: "nowrap" }}>{label}</span>}
      <div style={{
        [vertical ? "width" : "height"]: 2, [vertical ? "height" : "width"]: vertical ? 28 : "100%",
        background: active ? `linear-gradient(90deg, ${C}00, ${C}, ${C}00)` : C,
        minWidth: vertical ? 2 : 30, minHeight: vertical ? 28 : 2,
        transition: "all 0.4s",
        boxShadow: active && !blocked ? `0 0 6px ${C}` : "none",
      }} />
      <span style={{ fontSize: 9, color: C }}>{blocked ? "✗" : "→"}</span>
    </div>
  );
}

function PolicyBadge({ text, color }) {
  return (
    <span style={{
      fontSize: 8, fontFamily: "monospace", padding: "2px 6px", borderRadius: 4,
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
              border: `1.5px solid ${hop.dim ? "#111827" : (hop.warn ? "#ef444460" : hop.active ? hop.color : hop.color + "35")}`,
              boxShadow: hop.active && !hop.dim ? `0 0 10px ${hop.color}30` : "none",
              opacity: hop.dim ? 0.22 : 1, transition: "all 0.35s",
            }}>
              <div style={{ fontSize: 10, fontWeight: "bold", color: hop.dim ? "#1e293b" : (hop.warn ? "#fca5a5" : hop.color), fontFamily: "monospace" }}>{hop.name}</div>
              {hop.sub && <div style={{ fontSize: 8, color: hop.dim ? "#111827" : "#475569", marginTop: 1, fontFamily: "monospace" }}>{hop.sub}</div>}
            </div>
            {hop.sidecarAction && (
              <div style={{
                padding: "2px 6px", borderRadius: 4, fontSize: 8, fontFamily: "monospace",
                background: hop.warn ? "#3f0505" : "#080f1f",
                border: `1px solid ${hop.warn ? "#ef444450" : hop.active ? hop.color + "55" : "#1e293b"}`,
                color: hop.warn ? "#fca5a5" : hop.active ? hop.color : "#334155",
                textAlign: "center", maxWidth: 108,
              }}>
                ⬡ {hop.sidecarAction}
              </div>
            )}
            {hop.sidecarNote && (
              <div style={{ fontSize: 7, color: hop.warn ? "#ef444450" : "#283141", fontFamily: "monospace", maxWidth: 108, textAlign: "center", lineHeight: 1.3 }}>
                {hop.sidecarNote}
              </div>
            )}
          </div>
          {i < hops.length - 1 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", paddingTop: 10, gap: 1, minWidth: 38 }}>
              {arrows && arrows[i] ? (
                <>
                  <span style={{ fontSize: 7, fontFamily: "monospace", color: arrows[i].blocked ? "#ef4444" : arrows[i].active ? (arrows[i].color || "#0ea5e9") : "#1e293b", whiteSpace: "nowrap" }}>{arrows[i].label}</span>
                  <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                    <div style={{ flex: 1, height: 1.5, background: arrows[i].blocked ? "#ef4444" : arrows[i].active ? (arrows[i].color || "#0ea5e9") : "#1e293b" }} />
                    <span style={{ fontSize: 9, color: arrows[i].blocked ? "#ef4444" : arrows[i].active ? (arrows[i].color || "#0ea5e9") : "#1e293b" }}>{arrows[i].blocked ? "✗" : "▶"}</span>
                  </div>
                  {arrows[i].proto && <span style={{ fontSize: 7, fontFamily: "monospace", color: "#1e293b" }}>{arrows[i].proto}</span>}
                </>
              ) : (
                <div style={{ display: "flex", alignItems: "center", width: "100%", marginTop: 9 }}>
                  <div style={{ flex: 1, height: 1, background: "#1e293b" }} />
                  <span style={{ fontSize: 9, color: "#1e293b" }}>▶</span>
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
    <div style={{ background: "#020c18", border: `1px solid ${color}25`, borderRadius: 10, padding: "10px 12px", minWidth: 210 }}>
      <div style={{ fontSize: 9, fontFamily: "monospace", color: "#334155", marginBottom: 7, letterSpacing: "0.04em" }}>⚙ ENVOY FILTER CHAIN</div>
      {filters.map((f, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "flex-start", gap: 7, padding: "4px 7px", borderRadius: 6, marginBottom: 3,
          background: i === active ? color + "12" : "transparent",
          border: `1px solid ${i === active ? color + "45" : "transparent"}`, transition: "all 0.3s",
        }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: i === active ? color : i < active ? color + "45" : "#1e293b", flexShrink: 0, marginTop: 3 }} />
          <div>
            <div style={{ fontSize: 9, fontFamily: "monospace", color: i === active ? color : i < active ? color + "80" : "#334155", fontWeight: i === active ? "bold" : "normal" }}>{f.name}</div>
            {i === active && f.detail && <div style={{ fontSize: 8, color: "#64748b", marginTop: 2, lineHeight: 1.45 }}>{f.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function RequestStateBox({ headers, status, color }) {
  return (
    <div style={{ background: "#020c18", border: `1px solid ${color}25`, borderRadius: 10, padding: "10px 12px", flex: 1, minWidth: 200 }}>
      <div style={{ fontSize: 9, fontFamily: "monospace", color: "#334155", marginBottom: 7, letterSpacing: "0.04em" }}>📋 REQUEST STATE</div>
      {status && (
        <div style={{
          fontSize: 9, fontFamily: "monospace", marginBottom: 7,
          color: status.startsWith("2") ? "#22c55e" : status.startsWith("4") ? "#ef4444" : "#f59e0b",
          padding: "2px 8px", background: "#0a1929", borderRadius: 4, display: "inline-block",
        }}>HTTP {status}</div>
      )}
      {headers.map((h, i) => (
        <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 2 }}>
          {h.badge && (
            <span style={{
              fontSize: 6.5, padding: "1px 3px", borderRadius: 2, flexShrink: 0,
              background: h.badge === "NEW" ? "#14532d" : h.badge === "SET" ? "#1e3a5f" : "#3f0505",
              color: h.badge === "NEW" ? "#4ade80" : h.badge === "SET" ? "#7dd3fc" : "#fca5a5",
              fontFamily: "monospace",
            }}>{h.badge}</span>
          )}
          <span style={{ fontSize: 8, fontFamily: "monospace", color: "#4b5563", flexShrink: 0 }}>{h.k}:</span>
          <span style={{
            fontSize: 8, fontFamily: "monospace", wordBreak: "break-all",
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
    <div style={{ background: "#020c18", border: `1px solid ${color}25`, borderRadius: 10, padding: "10px 12px", flex: 1, minWidth: 210 }}>
      <div style={{ fontSize: 9, fontFamily: "monospace", color: "#334155", marginBottom: 6, letterSpacing: "0.04em" }}>📄 ACTIVE ISTIO CONFIG</div>
      <pre style={{ margin: 0, fontSize: 8, fontFamily: "monospace", color: "#4ade8090", whiteSpace: "pre-wrap", lineHeight: 1.6, maxHeight: 152, overflowY: "auto" }}>{code}</pre>
    </div>
  );
}

function ScenarioShell({ icon, name, subtitle, steps, color }) {
  const [step, setStep] = useState(0);
  const advance = useCallback(() => setStep(s => Math.min(steps.length - 1, s + 1)), [steps.length]);
  const reset   = useCallback(() => setStep(0), []);
  const S = steps[step];
  return (
    <div style={{ background: "#030811", border: `1px solid ${color}20`, borderRadius: 14, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: "bold", color: color + "cc", fontFamily: "monospace" }}>{name}</div>
          <div style={{ fontSize: 10, color: "#475569", fontFamily: "monospace" }}>{subtitle}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {steps.map((_, i) => (
            <div key={i} onClick={() => setStep(i)} style={{
              width: 7, height: 7, borderRadius: "50%", cursor: "pointer", transition: "all 0.2s",
              background: i < step ? color + "50" : i === step ? color : "#1e293b",
              border: i === step ? `1px solid ${color}` : "1px solid transparent",
            }} />
          ))}
        </div>
      </div>
      <div style={{ background: color + "10", border: `1px solid ${color}28`, borderRadius: 8, padding: "7px 14px", marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: "bold", color, fontFamily: "monospace" }}>
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
      <div style={{ background: "#030b15", borderRadius: 10, padding: "12px 16px", borderLeft: `3px solid ${color}`, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: "bold", color, marginBottom: 5 }}>{S.narTitle}</div>
        <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.68 }}>{S.narBody}</div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={reset} style={{ padding: "6px 14px", borderRadius: 8, background: "#0f172a", border: "1px solid #1e293b", color: "#475569", fontSize: 11, fontFamily: "monospace", cursor: "pointer" }}>↺ Reset</button>
        <button onClick={advance} disabled={step === steps.length - 1} style={{ padding: "6px 18px", borderRadius: 8, background: step === steps.length - 1 ? "#0a0a0a" : color + "1a", border: `1px solid ${step === steps.length - 1 ? "#1e293b" : color}`, color: step === steps.length - 1 ? "#1e293b" : color, fontSize: 11, fontFamily: "monospace", cursor: step === steps.length - 1 ? "not-allowed" : "pointer", fontWeight: "bold" }}>Next step →</button>
        <span style={{ marginLeft: "auto", fontSize: 10, fontFamily: "monospace", color: "#283141" }}>Step {step + 1} / {steps.length}</span>
      </div>
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
        { name: "Browser", sub: "user agent", color: "#94a3b8", active: true },
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
        { name: "App :8080", sub: "frontend", color: "#38bdf8", active: true },
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
        { name: "Browser", sub: "Authorization: Bearer eyJ...", color: "#94a3b8", active: true },
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
        { label: "plain HTTP", active: true, color: "#94a3b8" },
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
        { name: "Mobile App", sub: "Bearer JWT", color: "#94a3b8", active: true },
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
        { name: "Mobile App", sub: "Authorization: Bearer eyJ...", color: "#94a3b8", active: true },
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
        { name: "Mobile App", sub: "200+ req/min", color: "#94a3b8", active: true },
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
        { name: "Client", sub: "live request", color: "#94a3b8", active: true },
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
        { name: "Other tenants", sub: "invisible", color: "#334155", active: false, dim: true },
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
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid #0f172a" }}>
        <div style={{ width: 3, height: 32, background: "linear-gradient(180deg,#0ea5e9,#34d399)", borderRadius: 2 }} />
        <div>
          <div style={{ fontSize: 14, fontWeight: "bold", color: "#f1f5f9", fontFamily: "monospace" }}>🏭 Production Scenarios</div>
          <div style={{ fontSize: 10, color: "#475569", fontFamily: "monospace" }}>End-to-end animated walkthroughs — how Istio works in real production systems</div>
        </div>
      </div>

      {/* Scenario selector tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {SCENARIOS.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setActive(i)}
            style={{
              padding: "8px 16px", borderRadius: 10, fontSize: 11, fontFamily: "monospace", cursor: "pointer",
              background: active === i ? s.color + "18" : "#0a0f1a",
              border: `1.5px solid ${active === i ? s.color : "#1e293b"}`,
              color: active === i ? s.color : "#475569",
              fontWeight: active === i ? "bold" : "normal",
              transition: "all 0.2s",
            }}
          >
            {s.icon} {s.title}
            <span style={{ marginLeft: 6, fontSize: 9, opacity: 0.7 }}>{s.tags.join(" · ")}</span>
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
  "kafka-partitions":    KafkaPartitionsLesson,
  "kafka-groups":        KafkaGroupsLesson,
  "kafka-offsets":       KafkaOffsetsLesson,
  "kafka-replication":   KafkaReplicationLesson,
  "kafka-transactions":  KafkaTransactionsLesson,
  "kafka-compaction":    KafkaCompactionLesson,
  "sqs-standard":        SQSStandardLesson,
  "sqs-fifo":            SQSFIFOLesson,
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
};

const GROUP_LABELS = { rabbitmq: "🐰 RabbitMQ", kafka: "⚡ Kafka", sqs: "☁️ AWS SQS", istio: "🔷 Istio" };
const GROUP_COLORS = { rabbitmq: "#3b82f6", kafka: "#6366f1", sqs: "#f59e0b", istio: "#0ea5e9" };

// ─── Home page data ───────────────────────────────────────────────────────────
const HOME_CARDS = [
  {
    key: "rabbitmq",
    icon: "🐰",
    name: "RabbitMQ",
    subtitle: "AMQP Message Broker",
    color: "#3b82f6",
    bg: "#0c1e38",
    description: "Master message queuing with exchanges, bindings, and consumer patterns. Covers pub/sub, routing, topics, RPC, and streams.",
    features: ["Hello World & Work Queues", "Pub/Sub, Routing & Topics", "RPC Request/Reply", "Streams & Offset Tracking"],
    lessonCount: 8,
    stack: "Python · pika 1.3 · rstream",
  },
  {
    key: "kafka",
    icon: "⚡",
    name: "Apache Kafka",
    subtitle: "Distributed Event Streaming",
    color: "#6366f1",
    bg: "#0a0a28",
    description: "Understand distributed log-based messaging: partitions, consumer groups, offsets, replication, transactions, and log compaction.",
    features: ["Partitions & Key Routing", "Consumer Groups & Rebalance", "Offsets, Commits & Replay", "Transactions & Log Compaction"],
    lessonCount: 6,
    stack: "Python · confluent-kafka",
  },
  {
    key: "sqs",
    icon: "☁️",
    name: "AWS SQS",
    subtitle: "Managed Cloud Queue Service",
    color: "#f59e0b",
    bg: "#1a0e00",
    description: "Explore AWS fully managed queues — Standard queues with at-least-once delivery and FIFO queues with strict ordering and deduplication.",
    features: ["Standard Queue & Visibility Timeout", "Long Polling & At-Least-Once", "FIFO & Deduplication IDs", "Dead Letter Queues (DLQ)"],
    lessonCount: 2,
    stack: "Python · boto3",
  },
  {
    key: "istio",
    icon: "🔷",
    name: "Istio Service Mesh",
    subtitle: "Kubernetes-Native Service Mesh",
    color: "#0ea5e9",
    bg: "#031520",
    description: "Learn service mesh patterns: sidecar architecture, intelligent traffic management, mutual TLS security, and zero-code observability.",
    features: ["Sidecar Injection & Architecture", "Canary, Fault Injection & Circuit Breaker", "Ingress Gateway & TLS", "mTLS, AuthzPolicy & Kiali"],
    lessonCount: 19,
    stack: "Kubernetes · Istio · YAML",
  },
];

// ─── Home Page ────────────────────────────────────────────────────────────────
function HomePage({ onNavigate }) {
  return (
    <div style={{ minHeight: "100vh", background: "#020617", color: "#f1f5f9" }}>
      <style>{ANIM_CSS}</style>

      {/* Hero */}
      <div style={{ textAlign: "center", padding: "56px 20px 44px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "7px 20px", borderRadius: 9999, background: "#0c1e38", border: "1px solid #3b82f640", marginBottom: 18 }}>
          <span style={{ fontSize: 20 }}>💬</span>
          <span style={{ fontSize: 14, fontFamily: "monospace", fontWeight: "bold", color: "#93c5fd" }}>Messaging & Service Mesh Tutorials</span>
        </div>
        <h1 style={{ fontSize: 34, fontWeight: "bold", color: "#f1f5f9", margin: "0 0 14px", letterSpacing: -0.5, lineHeight: 1.2 }}>
          Interactive Learning Visualizer
        </h1>
        <p style={{ fontSize: 13, color: "#64748b", fontFamily: "monospace", maxWidth: 500, margin: "0 auto 10px", lineHeight: 1.75 }}>
          Step-through animated visualizations with runnable code examples<br />
          and real-world analogies for every concept.
        </p>
        <div style={{ display: "inline-flex", gap: 16, marginTop: 6 }}>
          {[["25", "Lessons"], ["4", "Technologies"], ["YAML + Python", "Code Examples"]].map(([val, lbl]) => (
            <div key={lbl} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: "bold", fontFamily: "monospace", color: "#e2e8f0" }}>{val}</div>
              <div style={{ fontSize: 10, fontFamily: "monospace", color: "#475569" }}>{lbl}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Cards grid */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, justifyContent: "center", padding: "0 24px 60px", maxWidth: 1080, margin: "0 auto" }}>
        {HOME_CARDS.map(card => (
          <TechCard key={card.key} card={card} onNavigate={onNavigate} />
        ))}
      </div>

      {/* Footer */}
      <div style={{ textAlign: "center", paddingBottom: 32, fontSize: 11, color: "#1e293b", fontFamily: "monospace" }}>
        RabbitMQ pika 1.3.x / rstream  ·  Kafka confluent-kafka  ·  AWS SQS boto3  ·  Istio 1.20+
      </div>
    </div>
  );
}

function TechCard({ card, onNavigate }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={() => onNavigate(card.key)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 230, borderRadius: 18, padding: "22px 20px", cursor: "pointer", userSelect: "none",
        background: card.bg,
        border: `2px solid ${hovered ? card.color + "90" : card.color + "20"}`,
        boxShadow: hovered ? `0 8px 36px ${card.color}22` : "none",
        transform: hovered ? "translateY(-5px)" : "none",
        transition: "all 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
    >
      {/* Icon + name */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: card.color + "18", border: `1px solid ${card.color}35`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
          {card.icon}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: "bold", color: "#f1f5f9", lineHeight: 1.2 }}>{card.name}</div>
          <div style={{ fontSize: 10, fontFamily: "monospace", color: card.color, marginTop: 2 }}>{card.subtitle}</div>
        </div>
      </div>

      {/* Description */}
      <p style={{ fontSize: 11.5, color: "#94a3b8", lineHeight: 1.7, margin: "0 0 14px" }}>{card.description}</p>

      {/* Feature bullets */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 16 }}>
        {card.features.map(f => (
          <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: card.color, flexShrink: 0, marginTop: 5 }} />
            <span style={{ fontSize: 11, fontFamily: "monospace", color: "#64748b", lineHeight: 1.5 }}>{f}</span>
          </div>
        ))}
      </div>

      {/* Footer row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: 12, borderTop: `1px solid ${card.color}18` }}>
        <span style={{ fontSize: 10, fontFamily: "monospace", color: "#334155" }}>{card.stack}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, fontFamily: "monospace", color: card.color, background: card.color + "15", padding: "2px 8px", borderRadius: 6 }}>{card.lessonCount} lessons</span>
          <span style={{ fontSize: 13, color: hovered ? card.color : "#334155", transition: "color 0.2s", fontWeight: "bold" }}>→</span>
        </div>
      </div>
    </div>
  );
}

// ─── Tech Page (lesson viewer for one group) ──────────────────────────────────
function TechPage({ group, onHome }) {
  const groupLessons = LESSONS_META.filter(l => l.group === group);
  const [activeIdx, setActiveIdx] = useState(0);
  const safeIdx = Math.min(activeIdx, groupLessons.length - 1);
  const lesson = groupLessons[safeIdx];
  const LessonComp = LESSON_COMPONENTS[lesson.id];
  const color = GROUP_COLORS[group];
  const card = HOME_CARDS.find(c => c.key === group);

  return (
    <div style={{ minHeight: "100vh", background: "#020617", padding: "16px", color: "#f1f5f9" }}>
      <style>{ANIM_CSS}</style>

      {/* Top nav bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, maxWidth: 1120, margin: "0 auto 18px", flexWrap: "wrap" }}>
        <button
          onClick={onHome}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 10,
            background: "#0f172a", border: "1px solid #1e293b", color: "#94a3b8",
            fontSize: 12, fontFamily: "monospace", cursor: "pointer", transition: "all 0.15s",
            fontWeight: "bold",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.color = color; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#1e293b"; e.currentTarget.style.color = "#94a3b8"; }}
        >
          ← Home
        </button>

        {/* Group title */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>{card?.icon}</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: "bold", color: "#f1f5f9", fontFamily: "monospace" }}>{card?.name}</div>
            <div style={{ fontSize: 10, fontFamily: "monospace", color }}>
              {card?.subtitle}  ·  {groupLessons.length} lessons
            </div>
          </div>
        </div>

        {/* Progress indicator */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ fontSize: 11, fontFamily: "monospace", color: "#334155" }}>
            Lesson {safeIdx + 1} / {groupLessons.length}
          </div>
          <div style={{ display: "flex", gap: 3 }}>
            {groupLessons.map((_, i) => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i === safeIdx ? color : i < safeIdx ? color + "50" : "#1e293b", transition: "all 0.2s", cursor: "pointer" }} onClick={() => setActiveIdx(i)} />
            ))}
          </div>
        </div>
      </div>

      {/* Lesson tabs */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 18, maxWidth: 1120, margin: "0 auto 18px" }}>
        {groupLessons.map((l, i) => (
          <button
            key={l.id}
            onClick={() => setActiveIdx(i)}
            style={{
              padding: "5px 12px", borderRadius: 8, fontSize: 11, fontFamily: "monospace",
              background: i === safeIdx ? l.color + "20" : "rgba(15,23,42,0.6)",
              border: `1px solid ${i === safeIdx ? l.color : "rgba(51,65,85,0.4)"}`,
              color: i === safeIdx ? l.color : "#475569",
              cursor: "pointer", transition: "all 0.15s",
              fontWeight: i === safeIdx ? "bold" : "normal",
            }}
          >
            {l.num} {l.title.split("–")[1]?.trim() || l.title}
          </button>
        ))}
      </div>

      {/* Two-column layout */}
      <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap", maxWidth: 1120, margin: "0 auto" }}>
        <div style={{ width: 278, minWidth: 260, flexShrink: 0 }}>
          <ConceptPanel lesson={lesson} />
        </div>
        <div style={{ flex: 1, minWidth: 300, display: "flex", flexDirection: "column", gap: 12 }}>
          <LessonComp key={lesson.id} meta={lesson} />
        </div>
      </div>

      {/* Prev / Next lesson nav */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 1120, margin: "24px auto 8px", flexWrap: "wrap", gap: 8 }}>
        <button
          onClick={() => setActiveIdx(i => Math.max(0, i - 1))}
          disabled={safeIdx === 0}
          style={{
            padding: "8px 16px", borderRadius: 10, fontSize: 12, fontFamily: "monospace",
            background: safeIdx === 0 ? "#0a0a0a" : "#0f172a",
            border: `1px solid ${safeIdx === 0 ? "#1a1a1a" : color + "50"}`,
            color: safeIdx === 0 ? "#1e293b" : "#94a3b8", cursor: safeIdx === 0 ? "not-allowed" : "pointer",
          }}
        >← Prev lesson</button>

        <span style={{ fontSize: 11, fontFamily: "monospace", color: "#1e293b" }}>
          {lesson.num} · {lesson.title}
        </span>

        <button
          onClick={() => setActiveIdx(i => Math.min(groupLessons.length - 1, i + 1))}
          disabled={safeIdx === groupLessons.length - 1}
          style={{
            padding: "8px 16px", borderRadius: 10, fontSize: 12, fontFamily: "monospace",
            background: safeIdx === groupLessons.length - 1 ? "#0a0a0a" : "#0f172a",
            border: `1px solid ${safeIdx === groupLessons.length - 1 ? "#1a1a1a" : color + "50"}`,
            color: safeIdx === groupLessons.length - 1 ? "#1e293b" : "#94a3b8",
            cursor: safeIdx === groupLessons.length - 1 ? "not-allowed" : "pointer",
          }}
        >Next lesson →</button>
      </div>

      {/* Production Scenarios — Istio only */}
      {group === "istio" && <IstioProductionLab />}
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
