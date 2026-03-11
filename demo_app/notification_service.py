"""Demo App – Notification Service (Kafka Consumer — group: notification-service)

Reads from the same Kafka order_events topic as inventory and analytics.
Sends email/SMS confirmations to customers.

Key point: This consumer group reads ALL the same messages as inventory-service,
but completely independently (separate offset tracking, separate group_id).

Run: python demo_app/notification_service.py
"""

from __future__ import annotations

import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kafka.connection import get_consumer
from shared.models import Order

KAFKA_TOPIC = "order_events"
GROUP_ID    = "notification-service"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [NOTIFICATION-SERVICE] %(message)s",
)
logger = logging.getLogger(__name__)


def send_confirmation(order: Order) -> None:
    """Simulate sending an order confirmation email."""
    time.sleep(0.1)
    logger.info(
        "📧 Confirmation sent to %s | Order %s | $%.2f",
        order.customer_email, order.order_id[:8], order.total_amount,
    )


def main() -> None:
    consumer = get_consumer(group_id=GROUP_ID)
    consumer.subscribe([KAFKA_TOPIC])

    logger.info("📬 Notification Service listening — Ctrl+C to stop")

    try:
        while True:
            msg = consumer.poll(timeout=1.0)
            if msg is None:
                continue
            if msg.error():
                logger.error("Kafka error: %s", msg.error())
                continue

            order = Order.from_json(msg.value().decode())
            send_confirmation(order)
            consumer.commit(asynchronous=False)

    except KeyboardInterrupt:
        logger.info("🛑 Notification Service shutting down")
    finally:
        consumer.close()


if __name__ == "__main__":
    main()
