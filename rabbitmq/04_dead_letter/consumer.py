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

# '04_dead_letter' starts with a digit so we insert this file's directory
# into sys.path to make `import setup` work without dot-notation.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from setup import EXCHANGE, MAIN_QUEUE, setup_queues  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s [DLQ-CONSUMER] %(message)s")
logger = logging.getLogger(__name__)

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

    # Ensure the full DLQ topology exists (idempotent — safe to call even if
    # producer already ran; defined once in setup.py to avoid duplication).
    setup_queues(channel)
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
