"""Kafka – Lesson 3: Consumer Group Worker

Run this with different service names to demonstrate:
  - Same service name = workers share load (competing consumers)
  - Different service name = each gets its own copy of every message

Usage:
  python kafka/03_consumer_groups/service_consumer.py payment     # Run twice!
  python kafka/03_consumer_groups/service_consumer.py inventory
  python kafka/03_consumer_groups/service_consumer.py analytics
"""

from __future__ import annotations

import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from kafka.connection import get_consumer
from shared.models import Order

TOPIC = "orders_cg_demo"

# Service → group_id mapping
# Same group_id for "payment" means multiple payment workers share partitions
SERVICE_GROUPS: dict[str, str] = {
    "payment":   "payment-service",    # Multiple workers share the load
    "inventory": "inventory-service",  # Gets its own copy of every message
    "analytics": "analytics-service",  # Also gets its own copy
}


def process_message(service: str, order: Order, partition: int, offset: int) -> None:
    """Simulate service-specific processing."""
    actions = {
        "payment":   lambda o: f"💳 Charge ${o.total_amount:.2f}",
        "inventory": lambda o: f"📦 Reserve {sum(i.quantity for i in o.items)} items",
        "analytics": lambda o: f"📊 Record sale for region={o.region.value}",
    }
    action = actions.get(service, lambda o: "🔧 Process")(order)
    time.sleep(0.2)
    logging.getLogger(service).info(
        "%s | order=%s | partition=%d | offset=%d",
        action, order.order_id[:8], partition, offset,
    )


def main(service: str) -> None:
    group_id = SERVICE_GROUPS.get(service)
    if not group_id:
        print(f"Unknown service. Choose: {list(SERVICE_GROUPS)}")
        sys.exit(1)

    logging.basicConfig(
        level=logging.INFO,
        format=f"%(asctime)s [{service.upper()}-{group_id}] %(message)s",
    )
    logger = logging.getLogger(service)

    consumer = get_consumer(group_id=group_id)
    consumer.subscribe([TOPIC])

    logger.info(
        "👂 Service='%s' | group_id='%s' | topic='%s' — Ctrl+C to stop",
        service, group_id, TOPIC,
    )

    message_count = 0
    try:
        while True:
            msg = consumer.poll(timeout=1.0)
            if msg is None:
                continue
            if msg.error():
                logger.error("Kafka error: %s", msg.error())
                continue

            order = Order.from_json(msg.value().decode())
            message_count += 1
            process_message(service, order, msg.partition(), msg.offset())
            consumer.commit(asynchronous=False)

    except KeyboardInterrupt:
        logger.info("🛑 Processed %d messages. Shutting down.", message_count)
    finally:
        consumer.close()


if __name__ == "__main__":
    service_name = sys.argv[1] if len(sys.argv) > 1 else "payment"
    main(service_name)
