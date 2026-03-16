"""Kafka – Lesson 7: EOS Consumer (read_committed isolation)

Reads from the EOS topics with isolation.level=read_committed so it
only sees messages from committed transactions — never partially-written
or aborted messages.

Compare with isolation.level=read_uncommitted (default):
  • read_uncommitted: sees ALL messages including in-flight transactions
  • read_committed:   only sees messages whose transactions are COMMITTED

Usage:
  python kafka/07_transactions_eos/consumer.py
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from confluent_kafka import Consumer
from kafka.connection import BOOTSTRAP_SERVERS
from shared.models import Order

logging.basicConfig(level=logging.INFO, format="%(asctime)s [EOS-CONSUMER] %(message)s")
logger = logging.getLogger(__name__)

TOPICS = ["eos_orders", "eos_audit"]


def start() -> None:
    consumer = Consumer({
        "bootstrap.servers": BOOTSTRAP_SERVERS,
        "group.id": "eos-consumer-committed",
        "auto.offset.reset": "earliest",
        "enable.auto.commit": False,
        # ── The key EOS consumer setting ────────────────────────────────
        "isolation.level": "read_committed",   # Only see COMMITTED transactions
        # Alternatives:
        #   "read_uncommitted" (default) — sees in-flight and aborted messages too
    })
    consumer.subscribe(TOPICS)

    logger.info(
        "👂 EOS consumer started with isolation.level=read_committed\n"
        "   Subscribed to: %s\n"
        "   Only committed transactions will appear here.", TOPICS,
    )

    count = 0
    try:
        while True:
            msg = consumer.poll(timeout=2.0)
            if msg is None:
                logger.info("   (waiting for committed messages…)")
                continue
            if msg.error():
                logger.error("Kafka error: %s", msg.error())
                continue

            count += 1
            topic = msg.topic()
            value = msg.value().decode()

            if topic == "eos_orders":
                try:
                    order = Order.from_json(value)
                    logger.info(
                        "📥 [%s] P%d offset=%d | order=%s $%.2f",
                        topic, msg.partition(), msg.offset(),
                        order.order_id[:8], order.total_amount,
                    )
                except Exception:
                    logger.info("📥 [%s] raw: %s", topic, value[:80])
            else:
                logger.info(
                    "📥 [%s] P%d offset=%d | %s",
                    topic, msg.partition(), msg.offset(), value[:100],
                )

            consumer.commit(asynchronous=False)

    except KeyboardInterrupt:
        logger.info("🛑 Stopped after %d committed messages.", count)
    finally:
        consumer.close()


if __name__ == "__main__":
    start()
