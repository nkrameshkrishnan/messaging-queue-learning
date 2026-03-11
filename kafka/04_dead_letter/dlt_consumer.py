"""Kafka – Lesson 4: Dead Letter Topic Monitor

Reads failed messages from the DLT, logs them, and could trigger
alerting, automated retry, or storage for manual review.
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from kafka.connection import get_consumer
from shared.models import Order

logging.basicConfig(level=logging.INFO, format="%(asctime)s [DLT-MONITOR] %(message)s")
logger = logging.getLogger(__name__)

DLT_TOPIC = "orders_dlt_demo.DLT"
GROUP_ID  = "dlt-monitor-group"

total_dead_letters = 0


def handle_dead_letter(dlt_record: dict) -> None:  # type: ignore[type-arg]
    """Inspect and log a dead-lettered message."""
    global total_dead_letters
    total_dead_letters += 1

    original = Order.from_json(dlt_record["original_value"])

    logger.warning(
        "☠️  DEAD LETTER #%d\n"
        "       Order:     %s\n"
        "       Customer:  %s | Amount: $%.2f\n"
        "       Error:     %s\n"
        "       Failed at: %s\n"
        "       Source:    topic=%s partition=%d offset=%d",
        total_dead_letters,
        original.order_id,
        original.customer_id, original.total_amount,
        dlt_record["error"],
        dlt_record["failed_at"],
        dlt_record["original_topic"],
        dlt_record["original_partition"],
        dlt_record["original_offset"],
    )
    # In production: insert into DB, send Slack alert, schedule retry, etc.


def start_monitoring() -> None:
    consumer = get_consumer(group_id=GROUP_ID, auto_offset_reset="earliest")
    consumer.subscribe([DLT_TOPIC])

    logger.info("🔍 DLT Monitor watching '%s' — Ctrl+C to stop", DLT_TOPIC)

    try:
        while True:
            msg = consumer.poll(timeout=1.0)
            if msg is None:
                continue
            if msg.error():
                logger.error("Kafka error: %s", msg.error())
                continue

            dlt_record = json.loads(msg.value().decode())
            handle_dead_letter(dlt_record)
            consumer.commit(asynchronous=False)

    except KeyboardInterrupt:
        logger.info("📊 Total dead letters processed: %d", total_dead_letters)
    finally:
        consumer.close()


if __name__ == "__main__":
    start_monitoring()
