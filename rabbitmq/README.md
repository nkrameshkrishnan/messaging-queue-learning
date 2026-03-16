# RabbitMQ Learning Path

Five hands-on lessons that take you from a basic queue all the way to a full
RPC pattern — using real Python code and a live RabbitMQ broker.

---

## Prerequisites

| Tool | Purpose |
|------|---------|
| Docker + Docker Compose | Run RabbitMQ locally |
| Python ≥ 3.11 | Run the examples |
| `pika` library | Python AMQP client |

Install Python dependencies from the project root:

```bash
pip install -e .          # installs pika + confluent-kafka from pyproject.toml
```

---

## Quick Start — Spin up RabbitMQ

```bash
# From the project root:
docker compose up -d rabbitmq

# Verify it's healthy:
docker compose ps

# Open the management UI:
open http://localhost:15672      # macOS
xdg-open http://localhost:15672  # Linux
# Login: guest / guest
```

RabbitMQ takes ~5 seconds to boot. All examples include automatic
retry logic so you can start them right after `docker compose up`.

---

## Management UI Tips

The web UI at **http://localhost:15672** is your best learning companion.
Use it to:

- **Queues tab** → watch message counts change in real time
- **Exchanges tab** → see all exchange types and their bindings
- **Connections/Channels** → confirm producers/consumers are connected
- **Get messages** → peek at messages sitting in a queue
- Click on a queue name → view its bindings, arguments (`x-dead-letter-*`, etc.)

---

## Lessons

### Lesson 1 — Basic Pub/Sub (`01_basic_pubsub/`)

**What you'll learn:** Send messages to a durable queue; a single consumer
ACKs or NACKs each message. The foundation of all RabbitMQ patterns.

**Key concepts:** `queue_declare`, `basic_publish`, `basic_consume`,
`basic_ack`, `basic_nack`, `DeliveryMode.Persistent`, `prefetch_count=1`

```bash
# Terminal 1 – start consumer first so no messages are lost
python rabbitmq/01_basic_pubsub/consumer.py

# Terminal 2 – publish 5 orders
python rabbitmq/01_basic_pubsub/producer.py
```

**Watch in the UI:** Queues → `orders` — message count ticks up then down.

---

### Lesson 2 — Exchanges (`02_exchanges/`)

**What you'll learn:** Route messages to *multiple* queues using three
exchange types — fanout, direct, and topic.

**Key concepts:**

| Exchange | Routing rule |
|----------|-------------|
| **Fanout** | Broadcast to all bound queues — ignore routing key |
| **Direct** | Exact key match — `"paid"` only goes to payment queue |
| **Topic** | Wildcard match — `order.eu.*` or `*.*.failed` |

```bash
# ── Fanout (broadcast to all services) ──────────────
python rabbitmq/02_exchanges/consumers.py fanout   # Terminal 1
python rabbitmq/02_exchanges/fanout_producer.py    # Terminal 2

# ── Direct (route by order status) ──────────────────
python rabbitmq/02_exchanges/consumers.py direct   # Terminal 1
python rabbitmq/02_exchanges/direct_producer.py    # Terminal 2

# ── Topic (wildcard routing) ─────────────────────────
python rabbitmq/02_exchanges/consumers.py topic    # Terminal 1
python rabbitmq/02_exchanges/topic_producer.py     # Terminal 2
```

**Watch in the UI:** Exchanges → click `order_topic` → Bindings tab to see
the wildcard patterns.

---

### Lesson 3 — Competing Consumers / Work Queues (`03_consumer_groups/`)

**What you'll learn:** Scale processing by running multiple workers on the
same queue. `prefetch_count=1` ensures RabbitMQ only sends a new message
to a worker *after* it has ACKed the previous one — fair dispatch.

**Key concepts:** Competing consumers, `prefetch_count=1`, worker stickiness,
throughput vs. concurrency.

```bash
# Terminal 1 – fast worker (0.3s per order)
python rabbitmq/03_consumer_groups/worker.py A

# Terminal 2 – slow worker (1.2s per order)
python rabbitmq/03_consumer_groups/worker.py B

# Terminal 3 – publish 10 orders
python rabbitmq/03_consumer_groups/producer.py
```

**What to observe:** Worker A processes ~4× more messages than Worker B
because it finishes faster and requests the next message sooner. This is
`prefetch_count=1` fair dispatch in action — *not* round-robin.

---

### Lesson 4 — Dead Letter Queue (`04_dead_letter/`)

**What you'll learn:** Catch unprocessable messages so they don't disappear
or loop forever. A DLQ is essential for production reliability.

**A message is dead-lettered when:**
1. A consumer NACKs it with `requeue=False`
2. The message TTL expires (30 s in this demo)
3. The queue exceeds its max length

**Queue topology:**

```
Producer → [orders_dlq_demo] ──────────────────► Consumer
                │                                  (NACKs every 3rd)
                │ x-dead-letter-exchange
                ▼
           [dlq_dead_exchange]
                │
                ▼
           [orders_dead_letter] ──► DLQ Monitor
```

```bash
# Terminal 1 – consumer (deliberately fails every 3rd message)
python rabbitmq/04_dead_letter/consumer.py

# Terminal 2 – DLQ monitor (reads dead-lettered messages)
python rabbitmq/04_dead_letter/dlq_monitor.py

# Terminal 3 – publish 6 orders
python rabbitmq/04_dead_letter/producer.py
```

**What to observe:** Messages 3 and 6 are NACKed by the consumer → they
appear instantly in `orders_dead_letter`. The DLQ monitor prints the
`x-death` header showing the death reason and original queue.

**Files in this lesson:**

| File | Role |
|------|------|
| `setup.py` | Shared queue topology — imported by both producer and consumer |
| `producer.py` | Publishes 6 orders (every 3rd flagged as "will fail") |
| `consumer.py` | Processes orders; NACKs #3 and #6 |
| `dlq_monitor.py` | Watches the dead-letter queue |

---

### Lesson 5 — RPC Pattern (`05_rpc/`)

**What you'll learn:** Make a *synchronous-feeling* request over RabbitMQ
and wait for a reply — all without HTTP. This is the foundation of
microservice-to-microservice calls over a message broker.

**How it works:**

```
Client                               Server
──────                               ──────
1. Create exclusive reply queue
   (auto-named, e.g. amq.gen-xyz)

2. Publish to rpc_fibonacci ──────►  3. Receive request
   reply_to = "amq.gen-xyz"             Compute fib(n)
   correlation_id = "uuid-1234"      4. Publish result
                                        routing_key = reply_to
                                        correlation_id = "uuid-1234"
5. Poll until reply arrives  ◄──────
6. Match via correlation_id
7. Return result
```

**Key concepts:** Exclusive queues, `reply_to`, `correlation_id`,
`process_data_events()`, request-reply over AMQP.

```bash
# Terminal 1 – start the Fibonacci RPC server
python rabbitmq/05_rpc/server.py

# Terminal 2 – compute fib(10) (default)
python rabbitmq/05_rpc/client.py

# Compute a specific value
python rabbitmq/05_rpc/client.py 30

# Make multiple calls in one run
python rabbitmq/05_rpc/client.py 5 10 15 20
```

**What to observe:**
- The server prints each request with its `correlation_id`
- The client prints the matched reply and final result
- In the UI: `rpc_fibonacci` queue momentarily has 1 message while the
  server is computing; the exclusive reply queue (amq.gen-*) appears and
  disappears automatically

---

## Project Structure

```
messaging-queue-learning/
├── docker-compose.yml          # RabbitMQ + Kafka + kafka-ui
├── pyproject.toml              # pika, confluent-kafka dependencies
├── shared/
│   └── models.py               # Order, OrderItem, OrderStatus, OrderRegion
└── rabbitmq/
    ├── connection.py           # get_connection() with retry logic
    ├── 01_basic_pubsub/
    │   ├── producer.py
    │   └── consumer.py
    ├── 02_exchanges/
    │   ├── fanout_producer.py
    │   ├── direct_producer.py
    │   ├── topic_producer.py
    │   ├── consumers.py        # select mode via CLI arg: direct/fanout/topic
    │   └── README.md
    ├── 03_consumer_groups/
    │   ├── producer.py
    │   └── worker.py           # pass "A" or "B" as CLI arg
    ├── 04_dead_letter/
    │   ├── setup.py            # shared queue topology
    │   ├── producer.py
    │   ├── consumer.py
    │   └── dlq_monitor.py
    └── 05_rpc/
        ├── server.py           # Fibonacci RPC server
        └── client.py           # FibonacciRPCClient class
```

---

## Recommended Learning Order

1. **01_basic_pubsub** — understand ACK/NACK and durable queues
2. **03_consumer_groups** — see why `prefetch_count=1` matters before exchanges
3. **02_exchanges** — fanout → direct → topic (progressively more selective)
4. **04_dead_letter** — add resilience; understand what happens to bad messages
5. **05_rpc** — tie it all together with request-reply semantics

---

## Stopping Everything

```bash
docker compose down          # stop containers, keep volumes (queues preserved)
docker compose down -v       # stop and wipe all volumes (clean slate)
```
