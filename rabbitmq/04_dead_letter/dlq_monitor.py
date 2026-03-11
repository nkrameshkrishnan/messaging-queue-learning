"""RabbitMQ – Lesson 4: Dead Letter Queue Monitor

This service monitors the DLQ. In production, this would:
  • Log the failed messages for investigation
  • Alert an on-call engineer
  • Attempt retry after a delay
  • Store in a database for manual review

Run alongside consumer.py to see dead letters arrive here.
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from rabbitmq.connection import get_connection
from shared.models import Order

logging.basicConfig(level=logging.INFO, format="%(asctime)s [DLQ-MONITOR] %(message)s")
logger = logging.getLogger(__name__)

DLQ_NAME     = "orders_dead_letter"
DLQ_EXCHANGE = "dlq_dead_exchange"

dead_letter_count = 0


def on_dead_letter(channel, method, properties, body: bytes) -> None:  # type: ignore[no-untyped-def]
    """Handle a dead-lettered message."""
    global dead_letter_count
    dead_letter_count += 1

    order = Order.from_json(body.decode())

    # RabbitMQ adds x-death headers with info about WHY the message died
    x_death = (properties.headers or {}).get("x-death", [{}])
    death_reason = x_death[0].get("reason", "unknown") if x_death else "unknown"
    original_queue = x_death[0].get("queue", "unknown") if x_death else "unknown"

    logger.warning(
        "☠️  DEAD LETTER #%d | Order: %s | Reason: %s | From: %s | Amount: $%.2f",
        dead_letter_count,
        order.order_id[:8],
        death_reason,
        original_queue,
        order.total_amount,
    )

    # In production: store in DB, alert, schedule retry...
    # For now, just acknowledge so it doesn't pile up
    channel.basic_ack(delivery_tag=method.delivery_tag)


def start_monitoring() -> None:
    connection = get_connection()
    channel = connection.channel()

    channel.exchange_declare(exchange=DLQ_EXCHANGE, exchange_type="direct", durable=True)
    channel.queue_declare(queue=DLQ_NAME, durable=True)
    channel.queue_bind(queue=DLQ_NAME, exchange=DLQ_EXCHANGE, routing_key=DLQ_NAME)
    channel.basic_qos(prefetch_count=1)
    channel.basic_consume(queue=DLQ_NAME, on_message_callback=on_dead_letter)

    logger.info("🔍 DLQ Monitor watching '%s' — Ctrl+C to stop", DLQ_NAME)
    try:
        channel.start_consuming()
    except KeyboardInterrupt:
        logger.info("🛑 Monitor stopped. Total dead letters caught: %d", dead_letter_count)
        channel.stop_consuming()
    finally:
        connection.close()


if __name__ == "__main__":
    start_monitoring()
