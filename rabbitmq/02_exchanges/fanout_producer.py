"""RabbitMQ – Lesson 2b: Fanout Exchange

CONCEPT
-------
A Fanout exchange broadcasts EVERY message to ALL bound queues.
The routing key is IGNORED.

  Producer → [fanout exchange] → queue_A (payment service)
                               → queue_B (notification service)
                               → queue_C (analytics service)

All three services receive the same message simultaneously.

Use case: "Order placed" event that every service needs to know about.

How to run:
  Terminal 1:  python rabbitmq/02_exchanges/consumers.py fanout
  Terminal 2:  python rabbitmq/02_exchanges/fanout_producer.py
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

logging.basicConfig(level=logging.INFO, format="%(asctime)s [FANOUT-PRODUCER] %(message)s")
logger = logging.getLogger(__name__)

EXCHANGE_NAME = "order_broadcast"  # Our fanout exchange


def broadcast_orders() -> None:
    """Broadcast orders to all bound queues via a fanout exchange."""
    connection = get_connection()
    channel = connection.channel()

    # ── Declare a fanout exchange ─────────────────────────────────────────
    channel.exchange_declare(
        exchange=EXCHANGE_NAME,
        exchange_type="fanout",   # ← Broadcast to everyone
        durable=True,
    )
    logger.info("📡 Fanout exchange '%s' declared", EXCHANGE_NAME)

    for i in range(1, 4):
        order = make_sample_order(customer_id=f"cust-{i:03d}", region=OrderRegion.EU)
        payload = order.to_json()

        channel.basic_publish(
            exchange=EXCHANGE_NAME,
            routing_key="",        # ← Ignored by fanout — all queues get this
            body=payload,
            properties=pika.BasicProperties(
                delivery_mode=pika.DeliveryMode.Persistent,
                content_type="application/json",
            ),
        )
        logger.info(
            "📢 Broadcast order #%d → ALL bound queues | Amount: $%.2f",
            i, order.total_amount,
        )
        time.sleep(0.4)

    logger.info("✅ Broadcast complete — every consumer received every message!")
    connection.close()


if __name__ == "__main__":
    broadcast_orders()
