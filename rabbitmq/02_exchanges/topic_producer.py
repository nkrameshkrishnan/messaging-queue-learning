"""RabbitMQ – Lesson 2c: Topic Exchange

CONCEPT
-------
A Topic exchange routes messages using WILDCARD patterns on the routing key.
Routing keys are dot-separated words: "word1.word2.word3"

Wildcards in binding keys:
  *  matches exactly ONE word        →  "order.*"  matches "order.placed" but NOT "order.us.placed"
  #  matches ZERO or MORE words      →  "order.#"  matches "order.placed", "order.us.placed", etc.

Example routing:
  "order.us-east.placed"    → matched by "order.#" and "order.us-east.*"
  "order.eu.failed"         → matched by "order.#" and "*.eu.*"
  "payment.us-west.retry"   → matched by "payment.#" and "*.us-west.*"

Use case: Route events by region AND event type simultaneously.

How to run:
  Terminal 1:  python rabbitmq/02_exchanges/consumers.py topic
  Terminal 2:  python rabbitmq/02_exchanges/topic_producer.py
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

logging.basicConfig(level=logging.INFO, format="%(asctime)s [TOPIC-PRODUCER] %(message)s")
logger = logging.getLogger(__name__)

EXCHANGE_NAME = "order_topic"

# Routing key pattern: "domain.region.event"
EVENTS: list[tuple[OrderRegion, OrderStatus]] = [
    (OrderRegion.US_EAST, OrderStatus.PENDING),
    (OrderRegion.EU, OrderStatus.PAID),
    (OrderRegion.US_WEST, OrderStatus.FAILED),
    (OrderRegion.APAC, OrderStatus.SHIPPED),
    (OrderRegion.EU, OrderStatus.FAILED),    # EU failed orders are special
]


def publish_topic_events() -> None:
    """Publish orders with multi-dimensional routing keys."""
    connection = get_connection()
    channel = connection.channel()

    channel.exchange_declare(
        exchange=EXCHANGE_NAME,
        exchange_type="topic",    # ← Wildcard routing
        durable=True,
    )
    logger.info("🎯 Topic exchange '%s' declared", EXCHANGE_NAME)

    for region, status in EVENTS:
        order = make_sample_order(region=region)
        order.status = status

        # Build a meaningful routing key: "order.<region>.<status>"
        routing_key = f"order.{region.value}.{status.value}"

        channel.basic_publish(
            exchange=EXCHANGE_NAME,
            routing_key=routing_key,
            body=order.to_json(),
            properties=pika.BasicProperties(
                delivery_mode=pika.DeliveryMode.Persistent,
                content_type="application/json",
            ),
        )
        logger.info("📤 Sent event | routing_key='%s'", routing_key)
        time.sleep(0.3)

    connection.close()


if __name__ == "__main__":
    publish_topic_events()
