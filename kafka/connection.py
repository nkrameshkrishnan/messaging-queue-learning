"""Kafka connection helpers.

Provides factory functions for Kafka producers and consumers
using the confluent-kafka client, with retry logic for startup.
"""

from __future__ import annotations

import logging
import time

from confluent_kafka import Consumer, Producer
from confluent_kafka.admin import AdminClient, NewTopic

logger = logging.getLogger(__name__)

BOOTSTRAP_SERVERS = "localhost:9092"


def get_producer(extra_config: dict[str, str] | None = None) -> Producer:
    """Create and return a Kafka Producer.

    Args:
        extra_config: Additional producer config overrides.

    Returns:
        A configured confluent_kafka.Producer instance.
    """
    config: dict[str, str | int] = {
        "bootstrap.servers": BOOTSTRAP_SERVERS,
        "acks": "all",                  # Wait for all replicas to ack (reliability)
        "retries": 3,                   # Retry on transient failures
        "linger.ms": 5,                 # Batch messages for up to 5ms (throughput)
        "compression.type": "snappy",   # Compress batches
    }
    if extra_config:
        config.update(extra_config)
    return Producer(config)  # type: ignore[arg-type]


def get_consumer(
    group_id: str,
    auto_offset_reset: str = "earliest",
    extra_config: dict[str, str] | None = None,
) -> Consumer:
    """Create and return a Kafka Consumer.

    Args:
        group_id:          Consumer group ID (consumers in the same group
                           share partitions, each message goes to one).
        auto_offset_reset: Where to start reading: "earliest" or "latest".
        extra_config:      Additional consumer config overrides.

    Returns:
        A configured confluent_kafka.Consumer instance.
    """
    config: dict[str, str | int | bool] = {
        "bootstrap.servers": BOOTSTRAP_SERVERS,
        "group.id": group_id,
        "auto.offset.reset": auto_offset_reset,
        "enable.auto.commit": False,    # Manual commit for reliability
        "max.poll.interval.ms": 300_000,
    }
    if extra_config:
        config.update(extra_config)
    return Consumer(config)  # type: ignore[arg-type]


def create_topics(
    topics: list[tuple[str, int, int]],
    retries: int = 10,
    delay: float = 3.0,
) -> None:
    """Create Kafka topics if they don't already exist.

    Args:
        topics:  List of (topic_name, num_partitions, replication_factor).
        retries: Number of connection attempts.
        delay:   Seconds between retries.
    """
    admin = AdminClient({"bootstrap.servers": BOOTSTRAP_SERVERS})

    for attempt in range(1, retries + 1):
        try:
            new_topics = [
                NewTopic(name, num_partitions=partitions, replication_factor=replicas)
                for name, partitions, replicas in topics
            ]
            futures = admin.create_topics(new_topics)
            for topic, future in futures.items():
                try:
                    future.result()
                    logger.info("✅ Topic '%s' created", topic)
                except Exception as e:
                    if "TOPIC_ALREADY_EXISTS" in str(e):
                        logger.info("📌 Topic '%s' already exists", topic)
                    else:
                        logger.error("❌ Failed to create topic '%s': %s", topic, e)
            return
        except Exception as exc:
            logger.warning("⏳ Kafka not ready (%d/%d): %s", attempt, retries, exc)
            time.sleep(delay)

    raise RuntimeError(f"Could not connect to Kafka after {retries} attempts")
