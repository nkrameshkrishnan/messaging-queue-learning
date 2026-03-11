"""Kafka – Lesson 3: Consumer Groups (Producer)

CONCEPT
-------
In Kafka, CONSUMER GROUPS are the key to both scaling AND fan-out.

  SAME group.id  → messages are SPLIT between consumers (load balancing)
  DIFF group.id  → messages are COPIED to each group (fan-out / pub-sub)

  Topic "orders" (3 partitions)
    ┌─ Group "payment-service"    ─ Consumer A gets partition 0 & 1
    │                              Consumer B gets partition 2
    │
    └─ Group "inventory-service"  ─ Consumer C gets ALL 3 partitions
    │                               (independent from payment-service)
    │
    └─ Group "analytics-service"  ─ Consumer D gets ALL 3 partitions

So every group receives ALL messages, but within a group, work is split.

How to run:
  Terminal 1:  python kafka/03_consumer_groups/service_consumer.py payment
  Terminal 2:  python kafka/03_consumer_groups/service_consumer.py payment   ← 2nd payment worker
  Terminal 3:  python kafka/03_consumer_groups/service_consumer.py inventory
  Terminal 4:  python kafka/03_consumer_groups/service_consumer.py analytics
  Terminal 5:  python kafka/03_consumer_groups/producer.py

Observe:
  • payment-service workers SHARE the messages (each gets ~50%)
  • inventory-service gets ALL messages independently
  • analytics-service also gets ALL messages independently
"""

from __future__ import annotations

import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from kafka.connection import create_topics, get_producer
from shared.models import OrderRegion, make_sample_order

logging.basicConfig(level=logging.INFO, format="%(asctime)s [CG-PRODUCER] %(message)s")
logger = logging.getLogger(__name__)

TOPIC = "orders_cg_demo"
NUM_ORDERS = 12


def delivery_report(err, msg) -> None:  # type: ignore[no-untyped-def]
    if err:
        logger.error("❌ %s", err)
    else:
        logger.debug("✅ partition=%d offset=%d", msg.partition(), msg.offset())


def publish_burst() -> None:
    """Publish a burst of orders for multiple consumer groups to consume."""
    create_topics([(TOPIC, 3, 1)])
    producer = get_producer()

    logger.info("🚀 Publishing %d orders to topic '%s'...", NUM_ORDERS, TOPIC)

    for i in range(1, NUM_ORDERS + 1):
        order = make_sample_order(
            customer_id=f"cust-{i:03d}",
            region=list(OrderRegion)[i % len(OrderRegion)],
        )
        producer.produce(
            topic=TOPIC,
            key=order.customer_id,
            value=order.to_json(),
            callback=delivery_report,
        )
        logger.info("📤 Order %2d/%d | Customer: %s", i, NUM_ORDERS, order.customer_id)
        producer.poll(0)
        time.sleep(0.15)

    producer.flush()
    logger.info("✅ Done! Check your consumer terminals for the distribution.")


if __name__ == "__main__":
    publish_burst()
