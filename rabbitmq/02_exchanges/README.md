# RabbitMQ Exchanges – Lesson 2: Message Routing

## What is an Exchange?

In RabbitMQ, producers never publish **directly** to a queue.
They publish to an **Exchange**, and the exchange decides which queue(s) receive the message.

```
Producer → Exchange → [binding rules] → Queue(s) → Consumer(s)
```

## Exchange Types

| Type       | Routing Rule                          | Use Case                                  |
|------------|---------------------------------------|-------------------------------------------|
| **direct** | Exact routing key match               | Route by severity (error, warn, info)     |
| **fanout** | Broadcast — ignores routing key       | Notifications to all services             |
| **topic**  | Wildcard pattern match (`*`, `#`)     | Multi-dimensional routing                 |
| **headers**| Match on message header attributes    | Complex routing without key limitations   |

## Running the Examples

```bash
# Terminal 1 – Direct exchange (route by order status)
python rabbitmq/02_exchanges/consumers.py direct

# Terminal 2 – In a new terminal, publish
python rabbitmq/02_exchanges/direct_producer.py

# ────────────────────────────────────────────────────

# Terminal 1 – Fanout (broadcast to all services)
python rabbitmq/02_exchanges/consumers.py fanout

# Terminal 2
python rabbitmq/02_exchanges/fanout_producer.py

# ────────────────────────────────────────────────────

# Terminal 1 – Topic (wildcard routing)
python rabbitmq/02_exchanges/consumers.py topic

# Terminal 2
python rabbitmq/02_exchanges/topic_producer.py
```
