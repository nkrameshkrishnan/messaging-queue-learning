"""RabbitMQ – Lesson 1: Basic Publish / Subscribe (Consumer side)

CONCEPT
-------
The consumer side of the basic pub/sub pattern.

Key ideas:
  • basic_ack() tells RabbitMQ "I processed this — remove it from the queue."
  • If you don't ack, the message is re-queued when your consumer disconnects.
  • prefetch_count=1 means: "give me one message at a time" (fair dispatch).

How to run:
  1. First publish some messages:  python rabbitmq/01_basic_pubsub/producer.py
  2. Run this consumer:             python rabbitmq/01_basic_pubsub/consumer.py
     → Press Ctrl+C to stop.
"""

from __future__ import annotations

import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from rabbitmq.connection import get_connection
from shared.models import Order

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [CONSUMER] %(message)s",
)
logger = logging.getLogger(__name__)

QUEUE_NAME = "orders"


def process_order(order: Order) -> None:
    """Simulate payment processing for an order."""
    logger.info(
        "💳 Processing payment for order %s | Customer: %s | Amount: $%.2f",
        order.order_id[:8],
        order.customer_id,
        order.total_amount,
    )
    time.sleep(0.5)  # Simulate work (e.g., calling a payment gateway)
    logger.info("✅ Payment approved for order %s", order.order_id[:8])


def on_message(channel, method, properties, body: bytes) -> None:  # type: ignore[no-untyped-def]
    """Callback invoked each time a message is delivered.

    Args:
        channel:    The pika channel.
        method:     Delivery metadata (delivery_tag, routing_key, etc.).
        properties: Message properties (content_type, headers, etc.).
        body:       Raw message bytes.
    """
    try:
        order = Order.from_json(body.decode())
        process_order(order)

        # ── ACK: Tell RabbitMQ this message was handled successfully ──────
        # Without this, the message would be re-delivered if we crash.
        channel.basic_ack(delivery_tag=method.delivery_tag)

    except Exception as exc:
        logger.error("❌ Failed to process message: %s", exc)
        # NACK with requeue=False sends the message to the dead-letter queue
        # (we'll set that up in lesson 4)
        channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)


def start_consuming() -> None:
    """Start the payment service consumer."""
    connection = get_connection()
    channel = connection.channel()

    # Declare the same queue (idempotent – safe to call even if it exists)
    channel.queue_declare(queue=QUEUE_NAME, durable=True)

    # ── Fair dispatch: don't give this worker more than 1 unacked message ─
    # This prevents a fast producer from overwhelming a slow consumer.
    channel.basic_qos(prefetch_count=1)

    channel.basic_consume(
        queue=QUEUE_NAME,
        on_message_callback=on_message,
    )

    logger.info("👂 Payment Service listening on queue '%s' — Ctrl+C to stop", QUEUE_NAME)
    try:
        channel.start_consuming()
    except KeyboardInterrupt:
        logger.info("🛑 Shutting down consumer")
        channel.stop_consuming()
    finally:
        connection.close()


if __name__ == "__main__":
    start_consuming()
