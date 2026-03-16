"""Shared queue setup for the Dead Letter Queue lesson.

Both producer.py and consumer.py need to declare the *same* topology
before they start. This module provides a single source of truth so
that the two files stay in sync automatically.

Queue topology:
  dlq_exchange ──► orders_dlq_demo  (main queue, with DLQ settings)
                       │ on NACK / TTL expiry
                       ▼
  dlq_dead_exchange ──► orders_dead_letter  (dead-letter queue)
"""

from __future__ import annotations

import logging

from pika.adapters.blocking_connection import BlockingChannel

logger = logging.getLogger(__name__)

# ── Topology constants ────────────────────────────────────────────────────────
MAIN_QUEUE   = "orders_dlq_demo"
DLQ_NAME     = "orders_dead_letter"
EXCHANGE     = "dlq_exchange"
DLQ_EXCHANGE = "dlq_dead_exchange"


def setup_queues(channel: BlockingChannel) -> None:
    """Declare all exchanges and queues needed for the DLQ demo.

    Safe to call from multiple processes — all declarations are
    idempotent (RabbitMQ will no-op if they already exist with the
    same arguments).

    Args:
        channel: An open pika BlockingChannel.
    """
    # ── Step 1: Dead-letter exchange + queue ─────────────────────────────
    # Failed messages end up here.
    channel.exchange_declare(exchange=DLQ_EXCHANGE, exchange_type="direct", durable=True)
    channel.queue_declare(queue=DLQ_NAME, durable=True)
    channel.queue_bind(queue=DLQ_NAME, exchange=DLQ_EXCHANGE, routing_key=DLQ_NAME)

    # ── Step 2: Main queue with DLQ policy ───────────────────────────────
    # x-dead-letter-exchange:    where failed messages are re-published
    # x-dead-letter-routing-key: routing key used on the DLX
    # x-message-ttl:             messages expire after 30 s if unconsumed
    channel.exchange_declare(exchange=EXCHANGE, exchange_type="direct", durable=True)
    channel.queue_declare(
        queue=MAIN_QUEUE,
        durable=True,
        arguments={
            "x-dead-letter-exchange":    DLQ_EXCHANGE,
            "x-dead-letter-routing-key": DLQ_NAME,
            "x-message-ttl":             30_000,  # 30 seconds
        },
    )
    channel.queue_bind(queue=MAIN_QUEUE, exchange=EXCHANGE, routing_key=MAIN_QUEUE)

    logger.info(
        "⚙️  Topology ready: [%s] → %s → (on failure) → [%s] → %s",
        EXCHANGE, MAIN_QUEUE, DLQ_EXCHANGE, DLQ_NAME,
    )
