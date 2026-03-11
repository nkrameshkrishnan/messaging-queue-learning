"""Kafka – Lesson 1: Basic Publish / Subscribe (Producer)

CONCEPT
-------
Kafka's fundamental model:
  Producer → [Topic] → Consumer

Key differences from RabbitMQ:
  • Messages are stored in a LOG — they persist even after consumption.
  • Consumers can replay old messages by seeking to an earlier offset.
  • Kafka does NOT delete messages when consumed (configurable retention).
  • Kafka uses TOPICS (like categories) instead of queues.

How to run:
  1. Start Kafka:   docker compose up -d kafka zookeeper kafka-ui
  2. Run producer:  python kafka/01_basic_pubsub/producer.py
  3. Open Kafka UI: http://localhost:8080  → explore the topic
  4. Run consumer:  python kafka/01_basic_pubsub/consumer.py
"""

from __future__ import annotations

import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from kafka.connection import create_topics, get_producer
from shared.models import OrderRegion, make_sample_order

logging.basicConfig(level=logging.INFO, format="%(asctime)s [KAFKA-PRODUCER] %(message)s")
logger = logging.getLogger(__name__)

TOPIC = "orders"
NUM_ORDERS = 5


def delivery_report(err, msg) -> None:  # type: ignore[no-untyped-def]
    """Callback invoked when a message is acknowledged by the broker."""
    if err is not None:
        logger.error("❌ Message delivery failed: %s", err)
    else:
        logger.info(
            "📬 Delivered to topic='%s' partition=%d offset=%d",
            msg.topic(), msg.partition(), msg.offset(),
        )


def publish_orders() -> None:
    """Create the topic and publish sample orders."""
    # ── Step 1: Create topic (3 partitions for load distribution) ────────
    create_topics([(TOPIC, 3, 1)])  # (name, partitions, replication_factor)

    producer = get_producer()

    for i in range(1, NUM_ORDERS + 1):
        order = make_sample_order(
            customer_id=f"cust-{i:03d}",
            region=OrderRegion.US_EAST,
        )

        # ── Step 2: Produce a message ─────────────────────────────────────
        # key= is used for partition assignment:
        #   Same key → always same partition (ordering guarantee per key)
        producer.produce(
            topic=TOPIC,
            key=order.customer_id,    # Messages from same customer → same partition
            value=order.to_json(),
            callback=delivery_report,
        )

        logger.info(
            "📤 Produced order #%d | ID: %s | Key: %s",
            i, order.order_id[:8], order.customer_id,
        )

        # poll() lets the producer handle delivery callbacks
        producer.poll(0)
        time.sleep(0.3)

    # ── Step 3: Flush ensures all buffered messages are sent ─────────────
    logger.info("⏳ Flushing producer...")
    producer.flush()
    logger.info("✅ All %d orders published to topic '%s'", NUM_ORDERS, TOPIC)


if __name__ == "__main__":
    publish_orders()
