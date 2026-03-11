"""Kafka – Lesson 1: Basic Publish / Subscribe (Consumer)

CONCEPT
-------
A Kafka consumer reads messages from a topic partition by partition.

Key ideas:
  • OFFSET: Each message has a sequential number (offset) in its partition.
    Kafka remembers where you left off via committed offsets.
  • CONSUMER GROUP: Consumers in the same group.id share partitions.
    In this lesson, we use a unique group so we read ALL messages from the start.
  • REPLAY: You can reset to offset 0 and re-read every message ever published.

How to run (after running the producer):
  python kafka/01_basic_pubsub/consumer.py
"""

from __future__ import annotations

import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from kafka.connection import get_consumer
from shared.models import Order

logging.basicConfig(level=logging.INFO, format="%(asctime)s [KAFKA-CONSUMER] %(message)s")
logger = logging.getLogger(__name__)

TOPIC = "orders"
GROUP_ID = "payment-service-group-1"  # Change this to re-read from the beginning


def process_order(order: Order, partition: int, offset: int) -> None:
    """Simulate payment processing."""
    logger.info(
        "💳 Payment processing | Order: %s | Partition: %d | Offset: %d | $%.2f",
        order.order_id[:8], partition, offset, order.total_amount,
    )
    time.sleep(0.3)


def start_consuming() -> None:
    """Subscribe to the orders topic and process messages."""
    consumer = get_consumer(group_id=GROUP_ID)
    consumer.subscribe([TOPIC])

    logger.info(
        "👂 Kafka Consumer (group='%s') subscribed to topic '%s' — Ctrl+C to stop",
        GROUP_ID, TOPIC,
    )

    try:
        while True:
            # poll() waits up to 1 second for a message
            msg = consumer.poll(timeout=1.0)

            if msg is None:
                continue  # No message in this polling window

            if msg.error():
                logger.error("❌ Kafka error: %s", msg.error())
                continue

            # ── Process the message ───────────────────────────────────────
            order = Order.from_json(msg.value().decode())
            process_order(order, msg.partition(), msg.offset())

            # ── Commit offset ─────────────────────────────────────────────
            # This tells Kafka: "I've processed up to this offset."
            # If we crash, Kafka will re-deliver from the last committed offset.
            consumer.commit(asynchronous=False)

    except KeyboardInterrupt:
        logger.info("🛑 Consumer shutting down")
    finally:
        # Always close to trigger partition rebalancing
        consumer.close()
        logger.info("👋 Consumer closed")


if __name__ == "__main__":
    start_consuming()
