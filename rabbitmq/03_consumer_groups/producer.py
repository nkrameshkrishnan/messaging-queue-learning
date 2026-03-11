"""RabbitMQ – Lesson 3: Consumer Groups / Competing Consumers (Producer)

CONCEPT
-------
Multiple consumers on the SAME queue share the workload.
This is called the "Competing Consumers" pattern.

  Producer → [orders_work_queue] → Consumer A  (handles ~50% of messages)
                                 → Consumer B  (handles ~50% of messages)

Messages are distributed round-robin. If Consumer A is busy, Consumer B
picks up the slack. This gives you horizontal scaling!

How to run:
  Terminal 1:  python rabbitmq/03_consumer_groups/worker.py A
  Terminal 2:  python rabbitmq/03_consumer_groups/worker.py B
  Terminal 3:  python rabbitmq/03_consumer_groups/producer.py

Watch how messages distribute across workers.
"""

from __future__ import annotations

import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pika

from rabbitmq.connection import get_connection
from shared.models import OrderRegion, make_sample_order

logging.basicConfig(level=logging.INFO, format="%(asctime)s [PRODUCER] %(message)s")
logger = logging.getLogger(__name__)

QUEUE_NAME = "orders_work_queue"
NUM_ORDERS = 10


def publish_work() -> None:
    """Publish 10 orders for multiple workers to share."""
    connection = get_connection()
    channel = connection.channel()

    channel.queue_declare(queue=QUEUE_NAME, durable=True)

    for i in range(1, NUM_ORDERS + 1):
        order = make_sample_order(customer_id=f"cust-{i:03d}")
        channel.basic_publish(
            exchange="",
            routing_key=QUEUE_NAME,
            body=order.to_json(),
            properties=pika.BasicProperties(
                delivery_mode=pika.DeliveryMode.Persistent,
                content_type="application/json",
            ),
        )
        logger.info("📤 Order %d/%d dispatched | ID: %s", i, NUM_ORDERS, order.order_id[:8])
        time.sleep(0.2)

    logger.info("✅ All %d orders queued — watch your workers!", NUM_ORDERS)
    connection.close()


if __name__ == "__main__":
    publish_work()
