"""Kafka – Lesson 5: Offsets & Offset Management (Consumer)

Three modes selectable via CLI argument:

  manual   Manual commit with consumer.commit() — you control progress.
           ✅ Strongest guarantee: offsets only advance when YOU say so.

  auto     Auto-commit (enable.auto.commit=True, every 5 seconds).
           ⚠️  If the consumer crashes between the auto-commit tick and
               processing, those messages are silently lost.

  replay   Seek every partition to offset 0 (beginning) before consuming.
           Useful for: replay after a bug fix, reprocessing for a new service.

Usage:
  python kafka/05_offsets/consumer.py manual    # default
  python kafka/05_offsets/consumer.py auto
  python kafka/05_offsets/consumer.py replay
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from confluent_kafka import Consumer, TopicPartition
from kafka.connection import BOOTSTRAP_SERVERS
from shared.models import Order

TOPIC = "orders_offset_demo"


def _make_logger(mode: str) -> logging.Logger:
    logging.basicConfig(
        level=logging.INFO,
        format=f"%(asctime)s [OFFSET-{mode.upper()}] %(message)s",
    )
    return logging.getLogger(mode)


# ── Mode 1: Manual commit ─────────────────────────────────────────────────────

def run_manual(logger: logging.Logger) -> None:
    """Consume with explicit manual commits after each message.

    Guarantees: if the process crashes after processing but before commit,
    the message will be redelivered on restart (at-least-once).
    """
    consumer = Consumer({
        "bootstrap.servers": BOOTSTRAP_SERVERS,
        "group.id": "offsets-demo-manual",
        "auto.offset.reset": "earliest",
        "enable.auto.commit": False,     # ← Manual commit
    })
    consumer.subscribe([TOPIC])
    logger.info("👂 Manual-commit consumer started. Press Ctrl+C to stop.")

    try:
        while True:
            msg = consumer.poll(timeout=2.0)
            if msg is None:
                logger.info("   (no messages — waiting…)")
                continue
            if msg.error():
                logger.error("Kafka error: %s", msg.error())
                continue

            order = Order.from_json(msg.value().decode())
            logger.info(
                "📥 P%d | offset=%d | order=%s | $%.2f",
                msg.partition(), msg.offset(), order.order_id[:8], order.total_amount,
            )

            # ── Commit AFTER successful processing ────────────────────────
            consumer.commit(asynchronous=False)
            logger.info(
                "   ✅ Committed P%d offset=%d", msg.partition(), msg.offset(),
            )

    except KeyboardInterrupt:
        logger.info("🛑 Manual-commit consumer stopped.")
    finally:
        consumer.close()


# ── Mode 2: Auto-commit ───────────────────────────────────────────────────────

def run_auto(logger: logging.Logger) -> None:
    """Consume with Kafka's automatic offset commit (every 5 seconds).

    Simpler to write but carries the risk of message loss if the process
    crashes between auto-commits.
    """
    consumer = Consumer({
        "bootstrap.servers": BOOTSTRAP_SERVERS,
        "group.id": "offsets-demo-auto",
        "auto.offset.reset": "earliest",
        "enable.auto.commit": True,          # ← Auto-commit
        "auto.commit.interval.ms": 5_000,    # Commit every 5 seconds
    })
    consumer.subscribe([TOPIC])
    logger.info(
        "👂 Auto-commit consumer started (commits every 5s). Press Ctrl+C to stop.",
    )

    try:
        while True:
            msg = consumer.poll(timeout=2.0)
            if msg is None:
                logger.info("   (no messages — waiting…)")
                continue
            if msg.error():
                logger.error("Kafka error: %s", msg.error())
                continue

            order = Order.from_json(msg.value().decode())
            logger.info(
                "📥 P%d | offset=%d | order=%s (offset will auto-commit in ≤5s)",
                msg.partition(), msg.offset(), order.order_id[:8],
            )

    except KeyboardInterrupt:
        logger.info("🛑 Auto-commit consumer stopped.")
    finally:
        consumer.close()


# ── Mode 3: Replay from beginning ────────────────────────────────────────────

def run_replay(logger: logging.Logger) -> None:
    """Seek to offset 0 on every partition and replay all messages.

    Use case: re-process all historical messages after a bug fix,
    or populate a new downstream service with full history.
    """
    consumer = Consumer({
        "bootstrap.servers": BOOTSTRAP_SERVERS,
        "group.id": "offsets-demo-replay",   # Fresh group — no saved offsets
        "auto.offset.reset": "earliest",
        "enable.auto.commit": False,
    })

    # ── Assign partitions explicitly so we can seek before consuming ──────
    # (subscribe() triggers async assignment; assign() is synchronous)
    partitions = [TopicPartition(TOPIC, p) for p in range(3)]
    consumer.assign(partitions)

    # ── Seek each partition to the very beginning ─────────────────────────
    for tp in partitions:
        consumer.seek(TopicPartition(TOPIC, tp.partition, 0))
        logger.info("⏮️  Seeked partition %d to offset 0", tp.partition)

    logger.info("▶️  Replaying ALL messages from the start. Press Ctrl+C to stop.")

    replayed = 0
    try:
        while True:
            msg = consumer.poll(timeout=3.0)
            if msg is None:
                if replayed > 0:
                    logger.info("🏁 No more messages — replayed %d total.", replayed)
                    break
                continue
            if msg.error():
                logger.error("Kafka error: %s", msg.error())
                continue

            order = Order.from_json(msg.value().decode())
            replayed += 1
            logger.info(
                "🔁 REPLAY #%d | P%d | offset=%d | order=%s",
                replayed, msg.partition(), msg.offset(), order.order_id[:8],
            )

    except KeyboardInterrupt:
        logger.info("🛑 Replay stopped after %d messages.", replayed)
    finally:
        consumer.close()


# ── Entry point ───────────────────────────────────────────────────────────────

MODES = {"manual": run_manual, "auto": run_auto, "replay": run_replay}

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "manual"
    if mode not in MODES:
        print(f"Unknown mode '{mode}'. Choose: {list(MODES)}")
        sys.exit(1)
    lg = _make_logger(mode)
    MODES[mode](lg)
