"""RabbitMQ – Lesson 2a: Direct Exchange

CONCEPT
-------
A Direct exchange routes messages to queues whose binding key
EXACTLY matches the message's routing key.

  Producer → [direct exchange] → routing_key="payment"  → payment_queue
                               → routing_key="shipping"  → shipping_queue
                               → routing_key="error"     → error_queue

Use case: Route an order to the correct service based on its status.

How to run:
  Terminal 1:  python rabbitmq/02_exchanges/consumers.py direct
  Terminal 2:  python rabbitmq/02_exchanges/direct_producer.py
"""

from __future__ import annotations

import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pika

from rabbitmq.connection import get_connection
from shared.models import OrderRegion, OrderStatus, make_sample_order

logging.basicConfig(level=logging.INFO, format="%(asctime)s [DIRECT-PRODUCER] %(message)s")
logger = logging.getLogger(__name__)

EXCHANGE_NAME = "order_events"  # Our direct exchange

# Routing keys map to different downstream services
ROUTING_KEYS = [
    OrderStatus.PENDING.value,   # → payment service
    OrderStatus.PAID.value,      # → shipping service
    OrderStatus.FAILED.value,    # → error handler / refund service
]


def publish_with_routing() -> None:
    """Publish orders with different routing keys to a direct exchange."""
    connection = get_connection()
    channel = connection.channel()

    # ── Declare a direct exchange ─────────────────────────────────────────
    # exchange_type="direct" means exact routing key matching.
    channel.exchange_declare(
        exchange=EXCHANGE_NAME,
        exchange_type="direct",
        durable=True,
    )
    logger.info("🔀 Direct exchange '%s' declared", EXCHANGE_NAME)

    # Publish one order per routing key
    for routing_key in ROUTING_KEYS:
        order = make_sample_order(region=OrderRegion.US_EAST)
        order.status = OrderStatus(routing_key)
        payload = order.to_json()

        channel.basic_publish(
            exchange=EXCHANGE_NAME,
            routing_key=routing_key,   # ← This determines which queue gets it
            body=payload,
            properties=pika.BasicProperties(
                delivery_mode=pika.DeliveryMode.Persistent,
                content_type="application/json",
            ),
        )
        logger.info("📤 Sent order (status=%s) → routing_key='%s'", routing_key, routing_key)
        time.sleep(0.3)

    logger.info("✅ Done. Check the consumers to see selective routing!")
    connection.close()


if __name__ == "__main__":
    publish_with_routing()
