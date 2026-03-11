"""RabbitMQ – Lesson 2: Exchange Consumers

One script that demonstrates consuming from direct, fanout, or topic exchanges.

Usage:
  python rabbitmq/02_exchanges/consumers.py direct
  python rabbitmq/02_exchanges/consumers.py fanout
  python rabbitmq/02_exchanges/consumers.py topic
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from rabbitmq.connection import get_connection
from shared.models import Order

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")


# ── Direct Exchange Consumer ──────────────────────────────────────────────────

def run_direct_consumers() -> None:
    """Set up three queues bound to the direct exchange with different keys."""
    logger = logging.getLogger("DIRECT-CONSUMER")
    connection = get_connection()
    channel = connection.channel()

    EXCHANGE = "order_events"
    channel.exchange_declare(exchange=EXCHANGE, exchange_type="direct", durable=True)

    # Each service only cares about specific statuses
    bindings = {
        "payment_queue":  "pending",   # Payment service handles new orders
        "shipping_queue": "paid",      # Shipping handles paid orders
        "error_queue":    "failed",    # Error handler catches failures
    }

    for queue_name, routing_key in bindings.items():
        channel.queue_declare(queue=queue_name, durable=True)
        channel.queue_bind(
            queue=queue_name,
            exchange=EXCHANGE,
            routing_key=routing_key,  # ← Exact match required
        )
        logger.info("🔗 Bound %s → exchange '%s' (key='%s')", queue_name, EXCHANGE, routing_key)

    def on_message(ch, method, properties, body: bytes) -> None:  # type: ignore[no-untyped-def]
        order = Order.from_json(body.decode())
        logger.info(
            "📨 Queue='%s' | Order=%s | Status=%s",
            method.routing_key, order.order_id[:8], order.status.value,
        )
        ch.basic_ack(delivery_tag=method.delivery_tag)

    for queue_name in bindings:
        channel.basic_consume(queue=queue_name, on_message_callback=on_message)

    logger.info("👂 Listening on 3 queues (direct routing) — Ctrl+C to stop")
    try:
        channel.start_consuming()
    except KeyboardInterrupt:
        channel.stop_consuming()
    finally:
        connection.close()


# ── Fanout Exchange Consumer ──────────────────────────────────────────────────

def run_fanout_consumers() -> None:
    """Create exclusive queues for three services, all bound to the fanout exchange."""
    logger = logging.getLogger("FANOUT-CONSUMER")
    connection = get_connection()
    channel = connection.channel()

    EXCHANGE = "order_broadcast"
    channel.exchange_declare(exchange=EXCHANGE, exchange_type="fanout", durable=True)

    services = ["payment_fanout", "notification_fanout", "analytics_fanout"]

    for service in services:
        channel.queue_declare(queue=service, durable=True)
        channel.queue_bind(
            queue=service,
            exchange=EXCHANGE,
            routing_key="",  # ← Ignored by fanout
        )
        logger.info("📡 Service '%s' bound to fanout exchange", service)

    def on_message(ch, method, properties, body: bytes) -> None:  # type: ignore[no-untyped-def]
        order = Order.from_json(body.decode())
        logger.info(
            "📨 ALL services got | Order=%s | Amount=$%.2f",
            order.order_id[:8], order.total_amount,
        )
        ch.basic_ack(delivery_tag=method.delivery_tag)

    for service in services:
        channel.basic_consume(queue=service, on_message_callback=on_message)

    logger.info("👂 Listening on %d fanout queues — Ctrl+C to stop", len(services))
    try:
        channel.start_consuming()
    except KeyboardInterrupt:
        channel.stop_consuming()
    finally:
        connection.close()


# ── Topic Exchange Consumer ───────────────────────────────────────────────────

def run_topic_consumers() -> None:
    """Bind queues with wildcard patterns to demonstrate topic routing."""
    logger = logging.getLogger("TOPIC-CONSUMER")
    connection = get_connection()
    channel = connection.channel()

    EXCHANGE = "order_topic"
    channel.exchange_declare(exchange=EXCHANGE, exchange_type="topic", durable=True)

    # Different services subscribe to different patterns
    subscriptions = [
        ("all_orders_queue",    "order.#"),              # Catches every order event
        ("eu_queue",            "order.eu.*"),            # Only EU orders
        ("failures_queue",      "*.*.failed"),            # All failures regardless of region
        ("us_pending_queue",    "order.us-east.pending"), # Very specific
    ]

    def on_message(ch, method, properties, body: bytes) -> None:  # type: ignore[no-untyped-def]
        order = Order.from_json(body.decode())
        logger.info(
            "📨 routing_key='%s' | Order=%s | Region=%s | Status=%s",
            method.routing_key, order.order_id[:8],
            order.region.value, order.status.value,
        )
        ch.basic_ack(delivery_tag=method.delivery_tag)

    for queue_name, pattern in subscriptions:
        channel.queue_declare(queue=queue_name, durable=True)
        channel.queue_bind(queue=queue_name, exchange=EXCHANGE, routing_key=pattern)
        logger.info("🎯 Queue '%s' subscribed with pattern '%s'", queue_name, pattern)
        channel.basic_consume(queue=queue_name, on_message_callback=on_message)

    logger.info("👂 Listening with wildcard patterns — Ctrl+C to stop")
    try:
        channel.start_consuming()
    except KeyboardInterrupt:
        channel.stop_consuming()
    finally:
        connection.close()


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "direct"
    runners = {
        "direct": run_direct_consumers,
        "fanout": run_fanout_consumers,
        "topic": run_topic_consumers,
    }
    if mode not in runners:
        print(f"Usage: python consumers.py [direct|fanout|topic]")
        sys.exit(1)
    runners[mode]()
