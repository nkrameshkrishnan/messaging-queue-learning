"""Kafka – Lesson 7: Transactions & Exactly-Once Semantics (EOS)

CONCEPT
-------
By default Kafka offers *at-least-once* delivery: if a producer retries
after a network glitch, the broker may receive the same message twice.

Kafka solves this with two complementary features:

1. IDEMPOTENT PRODUCER (enable.idempotence=True)
   • Each producer instance gets a unique PID (producer ID).
   • Each message carries a monotonically increasing sequence number.
   • If the broker gets a duplicate (same PID + sequence), it silently drops it.
   • Result: exactly-once delivery to a SINGLE partition.

2. TRANSACTIONAL PRODUCER (transactional.id='...')
   • Wraps multiple produce() calls (across partitions/topics) into one atomic unit.
   • Either ALL messages are committed (visible to consumers) or NONE are.
   • Consumers set isolation.level=read_committed to only see committed messages.
   • Result: exactly-once delivery across multiple partitions / topics.

Use cases for transactions:
  • Consume from one topic, transform, produce to another — atomically.
  • Update multiple topics in a single atomic operation.
  • Kafka Streams uses transactions internally for EOS processing guarantees.

How to run:
  Terminal 1: python kafka/07_transactions_eos/consumer.py
  Terminal 2: python kafka/07_transactions_eos/producer.py
  Terminal 2: python kafka/07_transactions_eos/producer.py aborted  # see abort demo
"""

from __future__ import annotations

import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from confluent_kafka import Producer
from kafka.connection import BOOTSTRAP_SERVERS, create_topics
from shared.models import OrderRegion, make_sample_order

logging.basicConfig(level=logging.INFO, format="%(asctime)s [EOS-PRODUCER] %(message)s")
logger = logging.getLogger(__name__)

TOPIC_ORDERS  = "eos_orders"
TOPIC_AUDIT   = "eos_audit"     # Second topic — shows cross-topic atomicity


def delivery_report(err, msg) -> None:  # type: ignore[no-untyped-def]
    if err:
        logger.error("❌ Delivery failed: %s", err)
    else:
        logger.debug(
            "   → delivered to %s P%d offset=%d",
            msg.topic(), msg.partition(), msg.offset(),
        )


# ── Part 1: Idempotent producer ───────────────────────────────────────────────

def demonstrate_idempotent() -> None:
    """Show idempotent producer — duplicate messages are deduplicated by broker."""
    logger.info("─" * 60)
    logger.info("PART 1 — Idempotent Producer (single-partition exactly-once)")
    logger.info("─" * 60)

    producer = Producer({
        "bootstrap.servers": BOOTSTRAP_SERVERS,
        "enable.idempotence": True,   # Enables: acks=all, retries=INT_MAX, max.in.flight=5
        "acks": "all",
        "retries": 5,
    })

    order = make_sample_order(customer_id="cust-idempotent", region=OrderRegion.US_WEST)

    logger.info("📤 Sending same message 3 times (simulating network retry)…")
    for attempt in range(1, 4):
        producer.produce(
            topic=TOPIC_ORDERS,
            key=order.customer_id,
            value=order.to_json(),
            headers={"attempt": str(attempt)},
            callback=delivery_report,
        )
        logger.info(
            "   Attempt %d → broker checks PID + sequence number", attempt,
        )
        producer.poll(0)
        time.sleep(0.2)

    producer.flush()
    logger.info(
        "✅ Even though we sent 3 times, the broker only kept 1 copy.\n"
        "   (PID + sequence deduplication in action)"
    )


# ── Part 2: Transactional producer ───────────────────────────────────────────

def demonstrate_transaction(abort: bool = False) -> None:
    """Show transactional producer — atomic write to two topics."""
    label = "ABORT" if abort else "COMMIT"
    logger.info("")
    logger.info("─" * 60)
    logger.info("PART 2 — Transactional Producer (%s demo)", label)
    logger.info("─" * 60)

    producer = Producer({
        "bootstrap.servers": BOOTSTRAP_SERVERS,
        "transactional.id": "eos-demo-producer-v1",  # Must be unique per producer
        "enable.idempotence": True,
        "acks": "all",
    })

    # Idempotent producers must call init_transactions() once before use
    producer.init_transactions()
    logger.info("🔑 Transactions initialized (transactional.id set)")

    order = make_sample_order(customer_id="cust-txn-001", region=OrderRegion.EU)

    logger.info("🚀 begin_transaction()")
    producer.begin_transaction()

    # ── Write 1: order event ──────────────────────────────────────────────
    producer.produce(
        topic=TOPIC_ORDERS,
        key=order.customer_id,
        value=order.to_json(),
        callback=delivery_report,
    )
    logger.info("   📤 Produced to '%s' (PENDING — not yet visible)", TOPIC_ORDERS)

    # ── Write 2: audit log (second topic — atomic!) ───────────────────────
    import json
    audit = json.dumps({
        "event": "order_placed",
        "order_id": order.order_id,
        "amount": order.total_amount,
    })
    producer.produce(
        topic=TOPIC_AUDIT,
        key=order.customer_id,
        value=audit,
        callback=delivery_report,
    )
    logger.info("   📤 Produced to '%s' (PENDING — not yet visible)", TOPIC_AUDIT)

    if abort:
        # Simulate a processing error — roll back the whole transaction
        producer.abort_transaction()
        logger.info(
            "🚫 abort_transaction() — NEITHER message is visible to consumers.\n"
            "   read_committed consumers won't see any of these messages."
        )
    else:
        producer.commit_transaction()
        logger.info(
            "✅ commit_transaction() — BOTH messages are now visible atomically.\n"
            "   read_committed consumers see BOTH or neither — never a partial view."
        )


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    create_topics([
        (TOPIC_ORDERS, 3, 1),
        (TOPIC_AUDIT,  1, 1),
    ])

    demonstrate_idempotent()
    time.sleep(1)

    abort_mode = len(sys.argv) > 1 and sys.argv[1] == "aborted"
    demonstrate_transaction(abort=abort_mode)
