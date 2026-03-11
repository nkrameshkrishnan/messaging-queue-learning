"""Kafka – Lesson 4: DLT Consumer (fails every 3rd message → DLT)

This consumer simulates processing failures by reading the "will_fail"
header, and re-publishes failures to the Dead Letter Topic with error context.
"""

from __future__ import annotations

import json
import logging
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from kafka.connection import get_consumer, get_producer
from shared.models import Order

logging.basicConfig(level=logging.INFO, format="%(asctime)s [DLT-CONSUMER] %(message)s")
logger = logging.getLogger(__name__)

TOPIC     = "orders_dlt_demo"
DLT_TOPIC = f"{TOPIC}.DLT"
GROUP_ID  = "dlt-demo-processor"


def publish_to_dlt(
    producer,  # type: ignore[no-untyped-def]
    original_msg,  # type: ignore[no-untyped-def]
    error_message: str,
) -> None:
    """Forward a failed message to the Dead Letter Topic with error metadata."""
    # Enrich with error context so the DLT consumer knows what went wrong
    dlt_payload = {
        "original_value": original_msg.value().decode(),
        "error": error_message,
        "failed_at": datetime.utcnow().isoformat(),
        "original_topic": original_msg.topic(),
        "original_partition": original_msg.partition(),
        "original_offset": original_msg.offset(),
    }
    producer.produce(
        topic=DLT_TOPIC,
        key=original_msg.key(),
        value=json.dumps(dlt_payload),
        headers={"error": error_message, "source-topic": TOPIC},
    )
    producer.flush()
    logger.warning("☠️  Message sent to DLT | error='%s'", error_message)


def start() -> None:
    consumer = get_consumer(group_id=GROUP_ID)
    dlt_producer = get_producer()
    consumer.subscribe([TOPIC])

    logger.info("👂 Consumer listening on '%s' — every 3rd will go to DLT", TOPIC)

    msg_count = 0
    try:
        while True:
            msg = consumer.poll(timeout=1.0)
            if msg is None:
                continue
            if msg.error():
                logger.error("Kafka error: %s", msg.error())
                continue

            msg_count += 1
            order = Order.from_json(msg.value().decode())

            # Simulate: every 3rd message triggers a processing error
            if msg_count % 3 == 0:
                error = f"Simulated payment gateway timeout for order {order.order_id[:8]}"
                logger.error("❌ FAILED | %s", error)
                publish_to_dlt(dlt_producer, msg, error)
            else:
                time.sleep(0.3)
                logger.info(
                    "✅ Processed order %s | $%.2f | partition=%d",
                    order.order_id[:8], order.total_amount, msg.partition(),
                )

            consumer.commit(asynchronous=False)

    except KeyboardInterrupt:
        logger.info("🛑 Shutting down")
    finally:
        consumer.close()


if __name__ == "__main__":
    start()
