"""Kafka – Lesson 2: Topics, Partitions & Message Keys

CONCEPT
-------
Partitions are the unit of parallelism in Kafka.

  Topic "orders" (3 partitions)
    Partition 0 → [msg0, msg3, msg6, ...]   ← US-EAST orders (key hash)
    Partition 1 → [msg1, msg4, msg7, ...]   ← EU orders
    Partition 2 → [msg2, msg5, msg8, ...]   ← APAC orders

Key rules:
  • Same key → always the same partition (ordering per key guaranteed)
  • No key → round-robin distribution across partitions
  • More partitions = more parallelism = more throughput

Use case: Route orders by region so each regional consumer handles
its own partition without stepping on others.

How to run:
  Terminal 1:  python kafka/02_topics_partitions/consumers.py
  Terminal 2:  python kafka/02_topics_partitions/producer.py

Watch which partition each message lands on!
"""

from __future__ import annotations

import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from kafka.connection import create_topics, get_producer
from shared.models import OrderRegion, make_sample_order

logging.basicConfig(level=logging.INFO, format="%(asctime)s [PARTITION-PRODUCER] %(message)s")
logger = logging.getLogger(__name__)

TOPIC = "orders_regional"

# Orders from different regions
REGIONS = [
    OrderRegion.US_EAST,
    OrderRegion.EU,
    OrderRegion.APAC,
    OrderRegion.US_WEST,
    OrderRegion.EU,      # Second EU order → same partition as first EU order
    OrderRegion.US_EAST, # Second US order → same partition
]


def delivery_report(err, msg) -> None:  # type: ignore[no-untyped-def]
    if err:
        logger.error("❌ Delivery failed: %s", err)
    else:
        logger.info(
            "✅ Delivered | key='%s' → partition=%d | offset=%d",
            msg.key().decode() if msg.key() else None,
            msg.partition(), msg.offset(),
        )


def publish_regional_orders() -> None:
    """Publish orders keyed by region to demonstrate partition routing."""
    create_topics([(TOPIC, 4, 1)])  # 4 partitions — one per region
    producer = get_producer()

    for i, region in enumerate(REGIONS, start=1):
        order = make_sample_order(customer_id=f"cust-{i:03d}", region=region)

        # KEY = region name → same region always → same partition
        # This guarantees regional ordering: EU order #1 comes before EU order #2
        producer.produce(
            topic=TOPIC,
            key=region.value,         # ← Partition key
            value=order.to_json(),
            callback=delivery_report,
        )
        logger.info(
            "📤 Order #%d | Region=%s | Key='%s' → will land on deterministic partition",
            i, region.value, region.value,
        )
        producer.poll(0)
        time.sleep(0.2)

    producer.flush()
    logger.info("Done! Notice how same-region messages go to the same partition.")


if __name__ == "__main__":
    publish_regional_orders()
