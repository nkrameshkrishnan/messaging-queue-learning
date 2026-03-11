"""RabbitMQ – Lesson 4: Dead Letter Queue (Producer)

CONCEPT
-------
A Dead Letter Queue (DLQ) catches messages that could not be processed.
A message is "dead-lettered" when:
  1. A consumer NACKs it with requeue=False
  2. The message TTL expires
  3. The queue exceeds its max length

Architecture:
  Producer → [orders_dlq_demo]  →  Consumer (sometimes crashes)
                 ↓ (on failure)
             [orders_dead_letter]  →  DLQ Monitor

This prevents bad messages from looping forever, and lets you:
  • Alert on dead letters
  • Inspect what failed and why
  • Replay messages after fixing a bug

How to run:
  Terminal 1:  python rabbitmq/04_dead_letter/consumer.py
  Terminal 2:  python rabbitmq/04_dead_letter/dlq_monitor.py
  Terminal 3:  python rabbitmq/04_dead_letter/producer.py
"""

from __future__ import annotations

import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pika

from rabbitmq.connection import get_connection
from shared.models import OrderRegion, make_sample_order

logging.basicConfig(level=logging.INFO, format="%(asctime)s [DLQ-PRODUCER] %(message)s")
logger = logging.getLogger(__name__)

MAIN_QUEUE = "orders_dlq_demo"
DLQ_NAME   = "orders_dead_letter"
EXCHANGE   = "dlq_exchange"
DLQ_EXCHANGE = "dlq_dead_exchange"


def setup_queues(channel) -> None:  # type: ignore[no-untyped-def]
    """Declare main queue with DLQ configuration and the dead letter queue."""
    # ── Step 1: Create the dead-letter exchange and queue ────────────────
    channel.exchange_declare(exchange=DLQ_EXCHANGE, exchange_type="direct", durable=True)
    channel.queue_declare(queue=DLQ_NAME, durable=True)
    channel.queue_bind(queue=DLQ_NAME, exchange=DLQ_EXCHANGE, routing_key=DLQ_NAME)

    # ── Step 2: Create the main queue with DLQ settings ──────────────────
    # x-dead-letter-exchange: where failed messages go
    # x-dead-letter-routing-key: routing key in the DLX
    # x-message-ttl: messages expire after 30s if not consumed (also dead-lettered)
    channel.exchange_declare(exchange=EXCHANGE, exchange_type="direct", durable=True)
    channel.queue_declare(
        queue=MAIN_QUEUE,
        durable=True,
        arguments={
            "x-dead-letter-exchange":    DLQ_EXCHANGE,
            "x-dead-letter-routing-key": DLQ_NAME,
            "x-message-ttl":             30_000,  # 30 seconds TTL
        },
    )
    channel.queue_bind(queue=MAIN_QUEUE, exchange=EXCHANGE, routing_key=MAIN_QUEUE)
    logger.info("⚙️  Main queue '%s' configured with DLQ → '%s'", MAIN_QUEUE, DLQ_NAME)


def publish_orders() -> None:
    """Publish 6 orders — some will be processed, some will fail."""
    connection = get_connection()
    channel = connection.channel()
    setup_queues(channel)

    for i in range(1, 7):
        order = make_sample_order(customer_id=f"cust-{i:03d}", region=OrderRegion.US_EAST)
        payload = order.to_json()

        channel.basic_publish(
            exchange=EXCHANGE,
            routing_key=MAIN_QUEUE,
            body=payload,
            properties=pika.BasicProperties(
                delivery_mode=pika.DeliveryMode.Persistent,
                content_type="application/json",
                headers={"attempt": 1},
            ),
        )
        status_hint = "⚠️  (will fail)" if i % 3 == 0 else "✅ (should succeed)"
        logger.info("📤 Order #%d %s | ID: %s", i, status_hint, order.order_id[:8])
        time.sleep(0.3)

    logger.info("Done. Watch consumer.py — every 3rd order will be dead-lettered.")
    connection.close()


if __name__ == "__main__":
    publish_orders()
