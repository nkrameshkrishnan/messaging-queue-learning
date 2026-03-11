"""Kafka – Lesson 2: Partition-aware consumer

Shows which partitions are assigned to this consumer and
demonstrates that messages with the same key always appear together.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from confluent_kafka import TopicPartition

from kafka.connection import get_consumer
from shared.models import Order

logging.basicConfig(level=logging.INFO, format="%(asctime)s [PARTITION-CONSUMER] %(message)s")
logger = logging.getLogger(__name__)

TOPIC = "orders_regional"
GROUP_ID = "regional-processor-group"


def on_assign(consumer, partitions) -> None:  # type: ignore[no-untyped-def]
    """Callback when partitions are assigned to this consumer."""
    assigned = [p.partition for p in partitions]
    logger.info("📋 Partition assignment: %s", assigned)


def start() -> None:
    consumer = get_consumer(group_id=GROUP_ID)
    consumer.subscribe([TOPIC], on_assign=on_assign)

    logger.info("👂 Listening on topic '%s' — watching partition assignments...", TOPIC)

    # Track message counts per partition to show distribution
    partition_counts: dict[int, int] = {}

    try:
        while True:
            msg = consumer.poll(timeout=1.0)
            if msg is None:
                continue
            if msg.error():
                logger.error("Kafka error: %s", msg.error())
                continue

            order = Order.from_json(msg.value().decode())
            partition = msg.partition()
            partition_counts[partition] = partition_counts.get(partition, 0) + 1

            logger.info(
                "📨 Region=%-8s | Partition=%d | Offset=%d | Count on this partition=%d",
                order.region.value,
                partition,
                msg.offset(),
                partition_counts[partition],
            )
            consumer.commit(asynchronous=False)

    except KeyboardInterrupt:
        logger.info("📊 Partition distribution: %s", partition_counts)
    finally:
        consumer.close()


if __name__ == "__main__":
    start()
