# 🎓 Messaging Queue Learning Project
### Practical hands-on learning with **RabbitMQ** and **Kafka** in Python

---

## 🗺️ What You'll Learn

| Concept | RabbitMQ | Kafka |
|---|---|---|
| Basic publish / subscribe | ✅ Lesson 1 | ✅ Lesson 1 |
| Message routing & exchanges | ✅ Lesson 2 (direct, fanout, topic) | ✅ Lesson 2 (topics, partitions, keys) |
| Consumer groups & load balancing | ✅ Lesson 3 (competing consumers) | ✅ Lesson 3 (consumer groups) |
| Dead letter queues / topics | ✅ Lesson 4 (DLQ) | ✅ Lesson 4 (DLT) |
| Full microservices demo | ✅ demo_app/ | ✅ demo_app/ |

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Start the brokers
```bash
docker compose up -d
```

Wait ~20 seconds for everything to boot, then open:
- **RabbitMQ UI** → http://localhost:15672 (guest / guest)
- **Kafka UI**     → http://localhost:8080

### 3. Run any lesson (see below)

---

## 📂 Project Structure

```
messaging-queue-learning/
├── docker-compose.yml          ← RabbitMQ + Kafka + Zookeeper + Kafka-UI
├── shared/
│   └── models.py               ← Order, OrderItem dataclasses (shared domain)
├── rabbitmq/
│   ├── connection.py           ← RabbitMQ connection helper
│   ├── 01_basic_pubsub/        ← Lesson 1: Simple producer → queue → consumer
│   ├── 02_exchanges/           ← Lesson 2: Direct, Fanout, Topic exchanges
│   ├── 03_consumer_groups/     ← Lesson 3: Competing consumers (load balancing)
│   └── 04_dead_letter/         ← Lesson 4: DLQ — catching failed messages
├── kafka/
│   ├── connection.py           ← Kafka producer/consumer factory
│   ├── 01_basic_pubsub/        ← Lesson 1: Topic producer + consumer
│   ├── 02_topics_partitions/   ← Lesson 2: Partition routing by message key
│   ├── 03_consumer_groups/     ← Lesson 3: Multiple groups (fan-out + sharing)
│   └── 04_dead_letter/         ← Lesson 4: Dead Letter Topic pattern
└── demo_app/                   ← Full e-commerce demo tying everything together
    ├── order_service.py        ← Publishes to BOTH RabbitMQ and Kafka
    ├── payment_service.py      ← RabbitMQ consumer (exactly-once processing)
    ├── inventory_service.py    ← Kafka consumer (independent offset)
    ├── notification_service.py ← Kafka consumer (independent offset)
    └── analytics_service.py   ← Kafka consumer (independent offset)
```

---

## 🐰 RabbitMQ Lessons

### Lesson 1 — Basic Publish / Subscribe
The simplest possible pattern: one producer, one consumer, one queue.

```bash
# Terminal 1
python rabbitmq/01_basic_pubsub/producer.py

# Terminal 2
python rabbitmq/01_basic_pubsub/consumer.py
```

**What to observe:** Open http://localhost:15672 → Queues.
Run the producer first, watch messages pile up.
Then start the consumer and watch them drain.

**Key concepts learned:**
- `queue_declare` (idempotent)
- `basic_publish` with `delivery_mode=Persistent`
- `basic_ack` and `basic_nack`
- `prefetch_count=1` (fair dispatch)

---

### Lesson 2 — Exchanges (Message Routing)

#### 2a. Direct Exchange — exact routing key match
```bash
# Terminal 1 — start consumers first
python rabbitmq/02_exchanges/consumers.py direct

# Terminal 2
python rabbitmq/02_exchanges/direct_producer.py
```

**What to observe:** Only the matching queue receives each message.
`pending` orders go to payment_queue, `paid` to shipping_queue, etc.

#### 2b. Fanout Exchange — broadcast to all
```bash
python rabbitmq/02_exchanges/consumers.py fanout
python rabbitmq/02_exchanges/fanout_producer.py
```

**What to observe:** ALL three service queues receive EVERY message.

#### 2c. Topic Exchange — wildcard routing
```bash
python rabbitmq/02_exchanges/consumers.py topic
python rabbitmq/02_exchanges/topic_producer.py
```

**What to observe:** The `all_orders_queue` (pattern `order.#`) gets everything.
The `eu_queue` (pattern `order.eu.*`) only gets EU orders.
The `failures_queue` (pattern `*.*.failed`) catches ALL failures regardless of region.

---

### Lesson 3 — Competing Consumers (Load Balancing)
Multiple workers on the SAME queue share the workload.

```bash
# Terminal 1 — fast worker (0.3s per order)
python rabbitmq/03_consumer_groups/worker.py A

# Terminal 2 — slow worker (1.2s per order)
python rabbitmq/03_consumer_groups/worker.py B

# Terminal 3 — publish 10 orders
python rabbitmq/03_consumer_groups/producer.py
```

**What to observe:** Because of `prefetch_count=1` (fair dispatch),
the FAST worker processes many more messages than the slow one.
Without prefetch, round-robin would overwhelm the slow worker.

---

### Lesson 4 — Dead Letter Queue
Failed messages are automatically routed to a DLQ.

```bash
# Terminal 1 — DLQ monitor (start first)
python rabbitmq/04_dead_letter/dlq_monitor.py

# Terminal 2 — consumer (fails every 3rd message)
python rabbitmq/04_dead_letter/consumer.py

# Terminal 3 — producer
python rabbitmq/04_dead_letter/producer.py
```

**What to observe:**
- Every 3rd message gets NACKed by the consumer
- Those messages appear in `dlq_monitor.py` with `x-death` metadata
- The `x-death` header tells you the reason, queue, and time of failure

---

## ☁️ Kafka Lessons

### Lesson 1 — Basic Publish / Subscribe
```bash
# Terminal 1
python kafka/01_basic_pubsub/producer.py

# Terminal 2
python kafka/01_basic_pubsub/consumer.py
```

**What to observe:** Open http://localhost:8080 → Topics → `orders`.
You can see each message, its partition, offset, key, and value.

**Key differences from RabbitMQ:**
- Messages stay in Kafka even after consumption (log retention)
- Change `GROUP_ID` in consumer.py to re-read all messages from the beginning
- Each message has an immutable `offset` (sequence number)

---

### Lesson 2 — Topics, Partitions & Message Keys
```bash
# Terminal 1
python kafka/02_topics_partitions/consumers.py

# Terminal 2
python kafka/02_topics_partitions/producer.py
```

**What to observe:**
- All EU orders land on the SAME partition (same key = same partition)
- `partition_counts` at the end shows the distribution
- In Kafka UI, inspect `orders_regional` topic → see partition assignment

**Key rule:** Same key → same partition → ordering guaranteed within that key.

---

### Lesson 3 — Consumer Groups (Fan-out + Load Balancing)

```bash
# Open 4 terminals

# Terminal 1 & 2 — Two payment workers sharing the load (SAME group)
python kafka/03_consumer_groups/service_consumer.py payment
python kafka/03_consumer_groups/service_consumer.py payment

# Terminal 3 — Inventory gets its OWN copy (DIFFERENT group)
python kafka/03_consumer_groups/service_consumer.py inventory

# Terminal 4 — Analytics also gets its OWN copy
python kafka/03_consumer_groups/service_consumer.py analytics

# Terminal 5 — Publish 12 orders
python kafka/03_consumer_groups/producer.py
```

**What to observe:**
- Two `payment` workers together process all 12 orders (~6 each)
- `inventory` gets all 12 orders independently
- `analytics` also gets all 12 orders independently
- In Kafka UI: Consumer Groups → see partition assignments

---

### Lesson 4 — Dead Letter Topic
```bash
# Terminal 1 — DLT monitor
python kafka/04_dead_letter/dlt_consumer.py

# Terminal 2 — consumer that fails some messages
python kafka/04_dead_letter/consumer.py

# Terminal 3 — producer
python kafka/04_dead_letter/producer.py
```

**What to observe:**
- Failed messages are re-published to `orders_dlt_demo.DLT`
- DLT records include the original value + error + source partition/offset
- Unlike RabbitMQ, Kafka DLT records are just regular messages you can replay

---

## 🛒 Full Demo App — E-Commerce Order Pipeline

This wires everything together in a realistic architecture.

```
Customer places order
    │
    ▼
Order Service
    ├── RabbitMQ → [orders_payment]     → Payment Service   (exactly-once)
    └── Kafka    → [order_events]       → Inventory Service (independent)
                                        → Notification Service (independent)
                                        → Analytics Service (independent)
```

**Why RabbitMQ for payments?**
Payment must be processed by exactly ONE worker. If the worker dies mid-process,
RabbitMQ re-delivers the message. Task queues with strong guarantees.

**Why Kafka for everything else?**
Multiple services need the same events independently. Kafka's consumer groups
give each service its own offset cursor. Events can be replayed if a service
needs to re-sync (e.g., after a bug fix or new service deployment).

```bash
# Start all services in separate terminals
python demo_app/payment_service.py
python demo_app/inventory_service.py
python demo_app/notification_service.py
python demo_app/analytics_service.py

# Then place orders
python demo_app/order_service.py
```

---

## 📖 Key Concepts Cheatsheet

### RabbitMQ vs Kafka — When to Use Which

| | RabbitMQ | Kafka |
|---|---|---|
| **Paradigm** | Message broker / task queue | Event log / stream |
| **Message retention** | Deleted after ACK | Retained for days/weeks |
| **Replay** | ❌ Not possible | ✅ Replay from any offset |
| **Routing** | Rich (exchanges, bindings) | Simple (topics + keys) |
| **Fan-out** | Fanout exchange | Different consumer groups |
| **Best for** | Task queues, RPC, workflows | Event sourcing, analytics, audit logs |
| **Ordering** | Per-queue | Per-partition (with same key) |
| **Throughput** | Moderate | Very high (millions/sec) |

### RabbitMQ Core Vocabulary

| Term | Meaning |
|---|---|
| **Exchange** | Entry point — routes messages to queues |
| **Queue** | Buffer that holds messages until consumed |
| **Binding** | Rule connecting exchange → queue (with routing key) |
| **ACK** | Consumer says "I processed this successfully" |
| **NACK** | Consumer says "I failed — requeue or DLQ" |
| **DLQ** | Dead Letter Queue — catches failed messages |

### Kafka Core Vocabulary

| Term | Meaning |
|---|---|
| **Topic** | Named category (like a table in a DB) |
| **Partition** | Ordered sub-log within a topic (unit of parallelism) |
| **Offset** | Sequential message number within a partition |
| **Consumer Group** | Set of consumers sharing partitions of a topic |
| **group.id** | Identifier for a consumer group — determines offset tracking |
| **DLT** | Dead Letter Topic — where failed messages are sent |

---

## 🧪 Experimenting Ideas

1. **Scale the payment workers**: Start 3 workers and watch Kafka rebalance partitions
2. **Kill a worker mid-processing**: See RabbitMQ re-deliver the unacked message
3. **Restart a Kafka consumer**: Change `group.id` to replay all messages from offset 0
4. **Increase message rate**: Reduce `time.sleep()` in producers and observe throughput
5. **Watch the DLQ fill up**: Stop the DLQ monitor and see messages queue up

---

## 🛑 Stop Everything
```bash
docker compose down
```

To also remove stored data:
```bash
docker compose down -v
```
