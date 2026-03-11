"""Demo App – Inventory Service (Kafka Consumer — group: inventory-service)

Reads from the Kafka order_events topic.
This service uses Kafka because:
  • Multiple services need the SAME events independently
  • Kafka's consumer groups let inventory track its own offset
  • Events can be replayed if we need to re-sync inventory

Run: python demo_app/inventory_service.py
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
GROUP_ID    = "inventory-service"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [INVENTORY-SERVICE] %(message)s",
)
logger = logging.getLogger(__name__)


def reserve_inventory(order: Order) -> None:
    """Simulate reserving stock for the order items."""
    time.sleep(0.2)
    for item in order.items:
        logger.info(
            "📦 Reserved %dx '%s' for order %s",
            item.quantity, item.product_name, order.order_id[:8],
        )


def main() -> None:
    consumer = get_consumer(group_id=GROUP_ID)
    consumer.subscribe([KAFKA_TOPIC])

    logger.info("🏭 Inventory Service listening on Kafka topic '%s' — Ctrl+C to stop", KAFKA_TOPIC)

    try:
        while True:
            msg = consumer.poll(timeout=1.0)
            if msg is None:
                continue
            if msg.error():
                logger.error("Kafka error: %s", msg.error())
                continue

            order = Order.from_json(msg.value().decode())
            logger.info(
                "📥 Received order %s | %d items | partition=%d",
                order.order_id[:8], len(order.items), msg.partition(),
            )
            reserve_inventory(order)
            consumer.commit(asynchronous=False)

    except KeyboardInterrupt:
        logger.info("🛑 Inventory Service shutting down")
    finally:
        consumer.close()


if __name__ == "__main__":
    main()
