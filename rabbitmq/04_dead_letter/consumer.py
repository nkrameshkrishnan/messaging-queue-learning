"""RabbitMQ – Lesson 4: DLQ Consumer (deliberately fails some messages)

Every 3rd message is NACKed to simulate a processing error.
Watch dlq_monitor.py to see those messages land in the dead-letter queue.
"""

from __future__ import annotations

import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from rabbitmq.connection import get_connection
from shared.models import Order

logging.basicConfig(level=logging.INFO, format="%(asctime)s [DLQ-CONSUMER] %(message)s")
logger = logging.getLogger(__name__)

MAIN_QUEUE = "orders_dlq_demo"
EXCHANGE   = "dlq_exchange"
DLQ_EXCHANGE = "dlq_dead_exchange"
DLQ_NAME   = "orders_dead_letter"

message_count = 0


def on_message(channel, method, properties, body: bytes) -> None:  # type: ignore[no-untyped-def]
    global message_count
    message_count += 1
    order = Order.from_json(body.decode())

    # Simulate: every 3rd message triggers a processing error
    if message_count % 3 == 0:
        logger.warning(
            "❌ SIMULATED FAILURE on order %s (message #%d) — sending to DLQ",
            order.order_id[:8], message_count,
        )
        # requeue=False + x-dead-letter-exchange config = message goes to DLQ
        channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
    else:
        time.sleep(0.4)
        logger.info(
            "✅ Processed order %s | Amount: $%.2f",
            order.order_id[:8], order.total_amount,
        )
        channel.basic_ack(delivery_tag=method.delivery_tag)


def start() -> None:
    connection = get_connection()
    channel = connection.channel()

    # Re-declare to ensure queues exist (idempotent)
    channel.exchange_declare(exchange=DLQ_EXCHANGE, exchange_type="direct", durable=True)
    channel.queue_declare(queue=DLQ_NAME, durable=True)
    channel.queue_bind(queue=DLQ_NAME, exchange=DLQ_EXCHANGE, routing_key=DLQ_NAME)

    channel.exchange_declare(exchange=EXCHANGE, exchange_type="direct", durable=True)
    channel.queue_declare(
        queue=MAIN_QUEUE,
        durable=True,
        arguments={
            "x-dead-letter-exchange":    DLQ_EXCHANGE,
            "x-dead-letter-routing-key": DLQ_NAME,
            "x-message-ttl":             30_000,
        },
    )
    channel.queue_bind(queue=MAIN_QUEUE, exchange=EXCHANGE, routing_key=MAIN_QUEUE)
    channel.basic_qos(prefetch_count=1)
    channel.basic_consume(queue=MAIN_QUEUE, on_message_callback=on_message)

    logger.info("👂 DLQ Consumer ready — every 3rd order will fail → DLQ")
    try:
        channel.start_consuming()
    except KeyboardInterrupt:
        channel.stop_consuming()
    finally:
        connection.close()


if __name__ == "__main__":
    start()
