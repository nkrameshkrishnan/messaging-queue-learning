# Kafka Learning Path

Eight hands-on lessons covering every major Kafka concept — from basic
publish/subscribe all the way to log compaction and exactly-once semantics.

---

## Prerequisites

| Tool | Purpose |
|------|---------|
| Docker + Docker Compose | Run Kafka + ZooKeeper locally |
| Python ≥ 3.11 | Run the examples |
| `confluent-kafka` | Python Kafka client |

```bash
pip install -e .   # installs confluent-kafka from pyproject.toml
```

---

## Quick Start

```bash
# From the project root:
docker compose up -d kafka zookeeper kafka-ui

# Open the Kafka UI (topics, messages, consumer groups):
open http://localhost:8080
```

Kafka takes ~15–20 seconds to fully start. All lessons use `AdminClient`
to create topics automatically on first run.

---

## Kafka UI Tips

The UI at **http://localhost:8080** shows you everything in real time:

- **Topics** → see partitions, message count, replication state
- **Consumer Groups** → check lag, assigned partitions, committed offsets
- **Messages** → peek at actual message payloads and headers
- **Brokers** → ISR status, partition leaders

---

## Lessons

### Lesson 1 — Basic Pub/Sub (`01_basic_pubsub/`)

**What you'll learn:** Kafka's fundamental model: Producer → Topic → Consumer.
Key difference from RabbitMQ: messages persist after consumption and can be replayed.

```bash
python kafka/01_basic_pubsub/producer.py   # publish 5 orders
python kafka/01_basic_pubsub/consumer.py   # consume them
```

---

### Lesson 2 — Topics, Partitions & Keys (`02_topics_partitions/`)

**What you'll learn:** A topic is split into N partitions for parallelism.
Message keys control which partition a message lands in — same key → same partition always.

```bash
python kafka/02_topics_partitions/consumers.py   # Terminal 1
python kafka/02_topics_partitions/producer.py    # Terminal 2
```

**Watch:** orders from the same region always land on the same partition.

---

### Lesson 3 — Consumer Groups (`03_consumer_groups/`)

**What you'll learn:** Multiple consumers sharing the same `group.id` split
partitions between them. Different group IDs each get a full independent copy.

```bash
python kafka/03_consumer_groups/service_consumer.py payment     # Terminal 1
python kafka/03_consumer_groups/service_consumer.py payment     # Terminal 2 (shares load)
python kafka/03_consumer_groups/service_consumer.py analytics   # Terminal 3 (full copy)
python kafka/03_consumer_groups/producer.py                     # Terminal 4
```

---

### Lesson 4 — Dead Letter Topic (`04_dead_letter/`)

**What you'll learn:** Kafka has no native DLQ — the pattern is implemented
by convention: failed messages are re-published to a `.DLT` topic for investigation.

```bash
python kafka/04_dead_letter/consumer.py      # Terminal 1
python kafka/04_dead_letter/dlt_consumer.py  # Terminal 2
python kafka/04_dead_letter/producer.py      # Terminal 3
```

---

### Lesson 5 — Offsets & Commit Strategies (`05_offsets/`)

**What you'll learn:** Offsets are Kafka's bookmark system. Three strategies:
manual commit (safest), auto-commit (simplest), and seek-to-beginning (replay).

```bash
python kafka/05_offsets/producer.py           # publish 8 orders

# Pick a strategy:
python kafka/05_offsets/consumer.py manual    # explicit commit after each message
python kafka/05_offsets/consumer.py auto      # Kafka commits every 5 seconds
python kafka/05_offsets/consumer.py replay    # seek to offset 0, replay everything
```

**What to observe:** With `manual`, restart the consumer mid-way and notice it
picks up from exactly where it committed — never skips, never duplicates beyond
the last committed point.

---

### Lesson 6 — Replication & Fault Tolerance (`06_replication/`)

**What you'll learn:** How `acks` settings control the durability/latency
trade-off. `acks=all` waits for all ISR replicas — zero data loss guarantee.

```bash
python kafka/06_replication/producer.py
```

Output compares timing and safety guarantees across `acks=0`, `acks=1`, `acks=all`.

**Production checklist:**
```
replication.factor  = 3    (at the topic level)
min.insync.replicas = 2    (at the broker/topic level)
acks                = all  (producer)
retries             = 5    (producer)
enable.idempotence  = true (producer)
```

---

### Lesson 7 — Transactions & Exactly-Once Semantics (`07_transactions_eos/`)

**What you'll learn:** Two levels of exactly-once guarantees.
- **Idempotent producer** (`enable.idempotence=True`): deduplicates retries to a single partition via PID + sequence number.
- **Transactional producer**: wraps multiple produce calls into one atomic unit — all-or-nothing across multiple topics.

```bash
python kafka/07_transactions_eos/consumer.py              # Terminal 1 (read_committed)
python kafka/07_transactions_eos/producer.py              # Terminal 2 (commit demo)
python kafka/07_transactions_eos/producer.py aborted      # Terminal 2 (abort demo)
```

**What to observe:** The consumer with `isolation.level=read_committed` only sees
messages after `commit_transaction()`. With `aborted`, zero messages appear.

---

### Lesson 8 — Log Compaction (`08_log_compaction/`)

**What you'll learn:** A compacted topic retains only the latest value per key —
forever. It acts like a distributed key-value store. Tombstones (`value=None`)
mark keys for deletion.

```bash
python kafka/08_log_compaction/producer.py        # create compacted topic + publish updates

# Before compaction runs (~30-60s):
python kafka/08_log_compaction/consumer.py        # see all versions

# After compaction runs:
python kafka/08_log_compaction/consumer.py        # see only latest per key
python kafka/08_log_compaction/consumer.py snapshot  # print current KV snapshot
```

**Use cases:** User profile state, feature flags, materialized views, Kafka Streams KTables.

---

## Core Kafka Concepts Summary

| Concept | Lesson | Key takeaway |
|---------|--------|-------------|
| **Topics & Partitions** | 2 | Same key → same partition. Partitions = parallelism. |
| **Offsets** | 5 | Unique message ID. Manual commit = strongest at-least-once. |
| **Consumer Groups** | 3 | Same group = share load. Different group = full copy. |
| **Dead Letter Topic** | 4 | Re-publish failures to `.DLT` for investigation. |
| **Replication** | 6 | `acks=all` + ISR = zero data loss on broker failure. |
| **Idempotent Producer** | 7 | PID + seq deduplication = exactly-once per partition. |
| **Transactions** | 7 | `begin/commit_transaction` = atomic cross-topic writes. |
| **Log Compaction** | 8 | Latest value per key retained forever. `value=None` = delete. |

---

## Project Structure

```
kafka/
├── connection.py               # get_producer(), get_consumer(), create_topics()
├── 01_basic_pubsub/
│   ├── producer.py
│   └── consumer.py
├── 02_topics_partitions/
│   ├── producer.py             # key= controls partition routing
│   └── consumers.py
├── 03_consumer_groups/
│   ├── producer.py
│   └── service_consumer.py    # pass service name: payment/inventory/analytics
├── 04_dead_letter/
│   ├── producer.py
│   ├── consumer.py
│   └── dlt_consumer.py
├── 05_offsets/
│   ├── producer.py
│   └── consumer.py            # modes: manual / auto / replay
├── 06_replication/
│   └── producer.py            # demonstrates acks=0/1/all timing
├── 07_transactions_eos/
│   ├── producer.py            # idempotent + transactional demos
│   └── consumer.py            # isolation.level=read_committed
└── 08_log_compaction/
    ├── producer.py            # creates compacted topic + tombstones
    └── consumer.py            # modes: log (default) / snapshot
```

---

## Stopping

```bash
docker compose down          # stop, keep volumes
docker compose down -v       # stop + wipe all data (clean slate)
```
