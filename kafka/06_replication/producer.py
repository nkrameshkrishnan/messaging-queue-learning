"""Kafka – Lesson 6: Replication & Fault Tolerance

CONCEPT
-------
Kafka replicates each partition across multiple brokers to survive failures.

  Topic "orders" — replication_factor=3, 1 partition:

    Broker 0  [Leader  P0]  ←── writes go HERE
    Broker 1  [Replica P0]  ←── copies from leader
    Broker 2  [Replica P0]  ←── copies from leader

  ISR (In-Sync Replicas): replicas that are fully caught up with the leader.
  If a replica falls too far behind, it's removed from the ISR.

Producer acks settings control the durability/latency trade-off:
  acks=0   Fire-and-forget. Fastest, no guarantee.
  acks=1   Leader acknowledges immediately. Replica lag = possible data loss.
  acks=all Leader waits for ALL ISR replicas to acknowledge. No data loss.

Combined with min.insync.replicas=2 and acks=all → guaranteed durability
even if one broker fails.

NOTE: This demo runs against a single-broker setup (docker-compose).
      Replication factor > 1 requires a multi-broker cluster.
      The code demonstrates the *configuration* and observable behaviour
      (delivery timing differences across acks settings).

How to run:
  python kafka/06_replication/producer.py
"""

from __future__ import annotations

import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from kafka.connection import BOOTSTRAP_SERVERS, create_topics
from confluent_kafka import Producer
from shared.models import OrderRegion, make_sample_order

logging.basicConfig(level=logging.INFO, format="%(asctime)s [REPLICATION] %(message)s")
logger = logging.getLogger(__name__)

TOPIC = "orders_replication_demo"


def _make_producer(acks: str, label: str) -> Producer:
    """Create a producer with the given acks setting."""
    return Producer({
        "bootstrap.servers": BOOTSTRAP_SERVERS,
        "acks": acks,
        "retries": 3,
    })


def _send_and_time(producer: Producer, topic: str, label: str) -> None:
    """Send one order and measure round-trip time."""
    order = make_sample_order(customer_id="cust-acks-demo", region=OrderRegion.EU)
    results: list[tuple[str, int, int]] = []

    def cb(err, msg) -> None:  # type: ignore[no-untyped-def]
        if err:
            logger.error("❌ [%s] Delivery failed: %s", label, err)
        else:
            results.append((msg.topic(), msg.partition(), msg.offset()))

    start = time.perf_counter()
    producer.produce(topic=topic, key=order.customer_id, value=order.to_json(), callback=cb)
    producer.flush()
    elapsed = (time.perf_counter() - start) * 1000

    if results:
        _, part, offset = results[0]
        logger.info(
            "  ✅ [acks=%s] Delivered | partition=%d offset=%d | round-trip=%.1f ms",
            label, part, offset, elapsed,
        )
    else:
        logger.warning("  ⚠️  [acks=%s] No delivery confirmation received.", label)


def demonstrate_acks() -> None:
    """Send one message per acks mode and log the timing difference."""
    create_topics([(TOPIC, 1, 1)])  # Single partition, RF=1 (single-broker limit)

    logger.info("─" * 60)
    logger.info("Demonstrating producer acks settings:")
    logger.info("─" * 60)

    configs = [
        ("0", "acks=0  (fire-and-forget)"),
        ("1", "acks=1  (leader-only ACK)"),
        ("all", "acks=all (wait for all ISR replicas — strongest guarantee)"),
    ]

    for acks_val, description in configs:
        logger.info("")
        logger.info("📡 %s", description)
        if acks_val == "0":
            logger.info(
                "   ⚠️  Fastest but NO guarantee. Message may be lost if leader crashes.",
            )
        elif acks_val == "1":
            logger.info(
                "   ⚠️  Leader acks before replicas copy. Data loss possible if leader fails immediately.",
            )
        else:
            logger.info(
                "   ✅ Safest. Leader waits until all ISR replicas have the message.",
            )

        producer = _make_producer(acks_val, acks_val)
        _send_and_time(producer, TOPIC, acks_val)
        time.sleep(0.3)

    logger.info("")
    logger.info("─" * 60)
    logger.info(
        "In production, always use acks=all + min.insync.replicas=2\n"
        "for zero data-loss guarantees. Add retries + retry.backoff.ms\n"
        "to handle transient leader elections automatically."
    )
    logger.info("─" * 60)
    logger.info(
        "\nReplication config checklist:\n"
        "  Topic level:    replication.factor=3  (at least 3 for HA)\n"
        "  Broker level:   min.insync.replicas=2  (refuse writes if < 2 in-sync)\n"
        "  Producer level: acks=all  retries=5  enable.idempotence=true\n"
    )


if __name__ == "__main__":
    demonstrate_acks()
