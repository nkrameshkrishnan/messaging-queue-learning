"""Kafka – Lesson 8: Log Compaction Consumer

Reads from the compacted 'user_profiles' topic and displays the current
state of the log — which shows compaction in action over time.

Run BEFORE compaction triggers:
  You'll see ALL updates (multiple values per key)

Run AFTER compaction triggers (~30-60 seconds after producer):
  You'll see only the LATEST value per key

Usage:
  python kafka/08_log_compaction/consumer.py
  python kafka/08_log_compaction/consumer.py snapshot   # print final KV state
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from confluent_kafka import Consumer, TopicPartition
from kafka.connection import BOOTSTRAP_SERVERS

logging.basicConfig(level=logging.INFO, format="%(asctime)s [COMPACTION-READER] %(message)s")
logger = logging.getLogger(__name__)

TOPIC = "user_profiles"


def read_full_log() -> None:
    """Read every message in the topic log from offset 0 to the end."""
    consumer = Consumer({
        "bootstrap.servers": BOOTSTRAP_SERVERS,
        "group.id": "compaction-reader",
        "auto.offset.reset": "earliest",
        "enable.auto.commit": False,
    })

    # Assign explicitly so we can seek to offset 0
    consumer.assign([TopicPartition(TOPIC, 0, 0)])

    logger.info("📖 Reading full log for topic '%s' (from offset 0)…", TOPIC)
    logger.info("   (Run producer first, then wait ~30s for compaction to trigger)")

    messages_seen: list[dict] = []
    empty_polls = 0
    try:
        while empty_polls < 3:
            msg = consumer.poll(timeout=2.0)
            if msg is None:
                empty_polls += 1
                continue
            if msg.error():
                logger.error("Kafka error: %s", msg.error())
                continue

            empty_polls = 0
            key = msg.key().decode() if msg.key() else "<no-key>"

            if msg.value() is None:
                logger.info("   offset=%-3d  key='%s'  → TOMBSTONE (deleted)", msg.offset(), key)
                messages_seen.append({"offset": msg.offset(), "key": key, "value": None})
            else:
                try:
                    value = json.loads(msg.value().decode())
                    name = value.get("name", "?")
                    tier = value.get("tier", "?")
                    logger.info(
                        "   offset=%-3d  key='%s'  → name='%s' tier='%s'",
                        msg.offset(), key, name, tier,
                    )
                    messages_seen.append({"offset": msg.offset(), "key": key, "value": value})
                except json.JSONDecodeError:
                    logger.info(
                        "   offset=%-3d  key='%s'  → %s",
                        msg.offset(), key, msg.value().decode()[:80],
                    )

    except KeyboardInterrupt:
        pass
    finally:
        consumer.close()

    logger.info("")
    logger.info("─" * 55)
    logger.info("Total messages in log: %d", len(messages_seen))

    # Count unique keys
    keys_seen = {m["key"] for m in messages_seen}
    if len(messages_seen) > len(keys_seen):
        logger.info(
            "Unique keys: %d — some keys have MULTIPLE values.",
            len(keys_seen),
        )
        logger.info("Compaction has NOT run yet (or didn't compact all segments).")
        logger.info("Wait 30-60s and re-run to see the compacted state.")
    else:
        logger.info(
            "Unique keys: %d — each key has exactly ONE value.",
            len(keys_seen),
        )
        logger.info("✅ Compaction has run! Only latest values remain.")
    logger.info("─" * 55)


def read_snapshot() -> None:
    """Read the compacted log and build a current key→value snapshot."""
    consumer = Consumer({
        "bootstrap.servers": BOOTSTRAP_SERVERS,
        "group.id": "compaction-snapshot",
        "auto.offset.reset": "earliest",
        "enable.auto.commit": False,
    })
    consumer.assign([TopicPartition(TOPIC, 0, 0)])

    snapshot: dict[str, dict | None] = {}
    empty_polls = 0
    while empty_polls < 3:
        msg = consumer.poll(timeout=2.0)
        if msg is None:
            empty_polls += 1
            continue
        if msg.error():
            continue
        empty_polls = 0

        key = msg.key().decode() if msg.key() else "<no-key>"
        if msg.value() is None:
            snapshot[key] = None  # Tombstone
        else:
            try:
                snapshot[key] = json.loads(msg.value().decode())
            except json.JSONDecodeError:
                snapshot[key] = {"raw": msg.value().decode()}

    consumer.close()

    logger.info("📸 Current snapshot (latest value per key):")
    logger.info("─" * 55)
    for key, value in sorted(snapshot.items()):
        if value is None:
            logger.info("  '%s' → DELETED (tombstone)", key)
        else:
            logger.info("  '%s' → %s", key, json.dumps(value))
    logger.info("─" * 55)
    logger.info(
        "The compacted topic acts as a KEY-VALUE STORE:\n"
        "  • Always queryable by consuming from offset 0\n"
        "  • Old superseded values are automatically removed\n"
        "  • Used by Kafka Streams for state stores (KTables)"
    )


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "log"
    if mode == "snapshot":
        read_snapshot()
    else:
        read_full_log()
