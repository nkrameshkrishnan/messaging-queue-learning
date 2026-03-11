"""Kafka – Lesson 4: Dead Letter Topic (Producer)

CONCEPT
-------
Kafka doesn't have native DLQ support like RabbitMQ, but the pattern
is implemented by convention: when processing fails, the consumer
publishes the failed message to a separate "dead letter topic" (DLT).

  Normal flow:    Topic "orders"  →  Consumer  →  SUCCESS
  Failure flow:   Topic "orders"  →  Consumer  →  FAIL  →  Topic "orders.DLT"

The DLT consumer then handles investigation, alerting, and retry logic.

Benefits over RabbitMQ DLQ:
  • The failed message + error context is stored as a Kafka record
  • You get full Kafka replay/retention on the DLT
  • Can build an automated retry pipeline by replaying from DLT

How to run:
  Terminal 1:  python kafka/04_dead_letter/consumer.py
  Terminal 2:  python kafka/04_dead_letter/dlt_consumer.py
  Terminal 3:  python kafka/04_dead_letter/producer.py
"""

from __future__ import annotations

import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from kafka.connection import create_topics, get_producer
from shared.models import OrderRegion, make_sample_order

logging.basicConfig(level=logging.INFO, format="%(asctime)s [DLT-PRODUCER] %(message)s")
logger = logging.getLogger(__name__)

TOPIC = "orders_dlt_demo"
NUM_ORDERS = 6


def delivery_report(err, msg) -> None:  # type: ignore[no-untyped-def]
    if err:
        logger.error("❌ Delivery failed: %s", err)
    else:
        logger.debug("✅ Delivered to partition=%d offset=%d", msg.partition(), msg.offset())


def publish_orders() -> None:
    """Publish orders, some of which will be dead-lettered by the consumer."""
    create_topics([
        (TOPIC, 3, 1),
        (f"{TOPIC}.DLT", 1, 1),  # Dead Letter Topic — typically 1 partition
    ])

    producer = get_producer()

    for i in range(1, NUM_ORDERS + 1):
        order = make_sample_order(customer_id=f"cust-{i:03d}", region=OrderRegion.EU)
        will_fail = (i % 3 == 0)

        producer.produce(
            topic=TOPIC,
            key=order.customer_id,
            value=order.to_json(),
            headers={"will_fail": "true" if will_fail else "false"},
            callback=delivery_report,
        )
        hint = "⚠️  (consumer will fail this)" if will_fail else "✅"
        logger.info("📤 Order #%d %s | ID: %s", i, hint, order.order_id[:8])
        producer.poll(0)
        time.sleep(0.3)

    producer.flush()
    logger.info("Done. Watch dlt_consumer.py for dead letters!")


if __name__ == "__main__":
    publish_orders()
