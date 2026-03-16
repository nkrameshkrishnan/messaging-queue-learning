"""Kafka – Lesson 5: Offsets & Offset Management (Producer)

CONCEPT
-------
An *offset* is the unique sequential ID of a message within a partition.
Offsets are how Kafka tracks consumer progress.

  Partition 0:  [offset=0] [offset=1] [offset=2] [offset=3] [offset=4]
                  msg A       msg B       msg C       msg D       msg E
                              ↑
                        committed offset = 1  (consumer has processed B)
                        consumer lag = 3      (C, D, E still unread)

Key configuration choices:
  enable.auto.commit = True   Auto-commit every auto.commit.interval.ms (5s).
                              Simple but risks message loss on crash.
  enable.auto.commit = False  Manual commit. You decide WHEN progress is saved.
                              More work, but guaranteed at-least-once semantics.

auto.offset.reset (first time a group reads a topic — no saved offset yet):
  earliest   Start from the very first message in the partition.
  latest     Skip all existing messages; only process new ones from now on.

How to run:
  Terminal 1: python kafka/05_offsets/consumer.py manual     # manual commit demo
  Terminal 2: python kafka/05_offsets/consumer.py auto       # auto-commit demo
  Terminal 3: python kafka/05_offsets/consumer.py replay     # seek to beginning
  Terminal 4: python kafka/05_offsets/producer.py            # publish orders
"""

from __future__ import annotations

import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from kafka.connection import create_topics, get_producer
from shared.models import OrderRegion, make_sample_order

logging.basicConfig(level=logging.INFO, format="%(asctime)s [OFFSET-PRODUCER] %(message)s")
logger = logging.getLogger(__name__)

TOPIC = "orders_offset_demo"
NUM_ORDERS = 8


def delivery_report(err, msg) -> None:  # type: ignore[no-untyped-def]
    if err:
        logger.error("❌ Delivery failed: %s", err)
    else:
        logger.info(
            "📬 Delivered | key='%s' partition=%d offset=%d",
            msg.key().decode() if msg.key() else "-",
            msg.partition(), msg.offset(),
        )


def publish_orders() -> None:
    """Publish orders so consumers can experiment with offset management."""
    create_topics([(TOPIC, 3, 1)])
    producer = get_producer()

    for i in range(1, NUM_ORDERS + 1):
        order = make_sample_order(
            customer_id=f"cust-{i:03d}",
            region=OrderRegion.US_EAST,
        )
        producer.produce(
            topic=TOPIC,
            key=order.customer_id,
            value=order.to_json(),
            callback=delivery_report,
        )
        logger.info("📤 Order #%d | ID: %s", i, order.order_id[:8])
        producer.poll(0)
        time.sleep(0.2)

    producer.flush()
    logger.info(
        "✅ Published %d orders to '%s'.\n"
        "   Now run the consumers to see different offset strategies!",
        NUM_ORDERS, TOPIC,
    )


if __name__ == "__main__":
    publish_orders()
