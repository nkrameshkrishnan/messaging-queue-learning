"""Kafka – Lesson 8: Log Compaction

CONCEPT
-------
By default, Kafka retains messages for a time period (log retention) and
then deletes them. With log compaction, Kafka instead guarantees that for
each *key*, the LATEST message value is always retained — forever.

Normal topic (delete policy):
  [user-1:Alice] [user-2:Bob] [user-1:AliceUpdated] [user-2:BobDeleted]
          ← older ───────────────────────────────────── newer →
  After retention window: all messages deleted.

Compacted topic (compact policy):
  Compaction runs periodically in the background, removing older messages
  for keys that have newer ones. Result:
  [user-1:AliceUpdated] [user-2:BobDeleted]
  The LATEST value per key is always available — acts like a KV store.

Tombstone (delete marker):
  Producing a message with value=None for a key marks it for deletion.
  After compaction runs, the key is completely removed.

Use cases:
  • User profile snapshots (latest state per user ID)
  • Configuration / feature flags (latest value per flag name)
  • Materialized views (Kafka Streams state stores use compacted topics)

How to create a compacted topic:
  Topic must be created with cleanup.policy=compact.
  This demo creates it via AdminClient with the right config.

How to run:
  Terminal 1: python kafka/08_log_compaction/consumer.py
  Terminal 2: python kafka/08_log_compaction/producer.py
  (Wait ~30s, then run consumer again to see compacted state)
"""

from __future__ import annotations

import json
import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from confluent_kafka.admin import AdminClient, ConfigResource, NewTopic
from confluent_kafka import Producer
from kafka.connection import BOOTSTRAP_SERVERS

logging.basicConfig(level=logging.INFO, format="%(asctime)s [COMPACTION] %(message)s")
logger = logging.getLogger(__name__)

TOPIC = "user_profiles"   # Will be created with cleanup.policy=compact


def create_compacted_topic() -> None:
    """Create the topic with log compaction enabled."""
    admin = AdminClient({"bootstrap.servers": BOOTSTRAP_SERVERS})

    # cleanup.policy=compact → Kafka keeps latest value per key, forever
    # min.cleanable.dirty.ratio=0.01 → trigger compaction frequently (for demo)
    # segment.ms=10000 → roll log segment every 10s (so compaction can run sooner)
    new_topic = NewTopic(
        topic=TOPIC,
        num_partitions=1,
        replication_factor=1,
        config={
            "cleanup.policy": "compact",
            "min.cleanable.dirty.ratio": "0.01",
            "segment.ms": "10000",        # 10-second segments (faster compaction for demo)
            "delete.retention.ms": "1000", # Tombstones deleted after 1s (demo only)
        },
    )
    futures = admin.create_topics([new_topic])
    for topic_name, future in futures.items():
        try:
            future.result()
            logger.info("✅ Compacted topic '%s' created.", topic_name)
        except Exception as e:
            if "TOPIC_ALREADY_EXISTS" in str(e):
                logger.info("📌 Topic '%s' already exists.", topic_name)
            else:
                logger.error("❌ Failed to create topic: %s", e)


def publish_profile_updates() -> None:
    """Publish multiple updates for the same user keys to demonstrate compaction.

    After compaction runs, only the LATEST value per key will remain.
    """
    producer = Producer({
        "bootstrap.servers": BOOTSTRAP_SERVERS,
        "acks": "all",
    })

    def cb(err, msg) -> None:  # type: ignore[no-untyped-def]
        if err:
            logger.error("❌ %s", err)
        else:
            logger.info(
                "   → %s | key='%s' offset=%d",
                msg.topic(), msg.key().decode() if msg.key() else "-", msg.offset(),
            )

    updates = [
        # user-1: three updates — only the last one survives compaction
        ("user-1", {"name": "Alice",         "email": "alice@v1.com", "tier": "free"}),
        ("user-2", {"name": "Bob",           "email": "bob@v1.com",   "tier": "free"}),
        ("user-3", {"name": "Carol",         "email": "carol@v1.com", "tier": "pro"}),
        ("user-1", {"name": "Alice Updated", "email": "alice@v2.com", "tier": "pro"}),   # overwrites v1
        ("user-2", {"name": "Bob",           "email": "bob@v2.com",   "tier": "pro"}),   # overwrites v1
        ("user-1", {"name": "Alice Final",   "email": "alice@v3.com", "tier": "enterprise"}),  # overwrites v2
        ("user-4", None),  # Tombstone — user-4 is DELETED (None value)
    ]

    logger.info("Publishing %d profile updates…", len(updates))
    logger.info("After compaction: only the LATEST value per key will remain.")

    for key, value in updates:
        if value is None:
            # Tombstone: produces a message with value=None to mark the key for deletion
            producer.produce(
                topic=TOPIC,
                key=key,
                value=None,    # ← Tombstone
                callback=cb,
            )
            logger.info("📤 TOMBSTONE key='%s' → will be deleted after compaction", key)
        else:
            producer.produce(
                topic=TOPIC,
                key=key,
                value=json.dumps(value),
                callback=cb,
            )
            logger.info(
                "📤 UPDATE   key='%s' → %s",
                key, value["name"],
            )

        producer.poll(0)
        time.sleep(0.3)

    producer.flush()

    logger.info("")
    logger.info("─" * 55)
    logger.info("Compaction is a BACKGROUND process.")
    logger.info("After it runs (triggered by segment.ms=10s),")
    logger.info("the log will only contain:")
    logger.info("  user-1 → Alice Final (v3)")
    logger.info("  user-2 → Bob (v2)")
    logger.info("  user-3 → Carol (v1 — only one update, so it's the latest)")
    logger.info("  user-4 → [deleted by tombstone]")
    logger.info("")
    logger.info("Run consumer.py to see the current log state.")
    logger.info("─" * 55)


if __name__ == "__main__":
    create_compacted_topic()
    publish_profile_updates()
