"""RabbitMQ – Lesson 1: Basic Publish / Subscribe (Producer side)

CONCEPT
-------
The most fundamental messaging pattern:
  Producer → [Queue] → Consumer

Key ideas:
  • A producer sends a message to a named queue.
  • Messages persist in the queue until a consumer reads them.
  • If no consumer is running, messages wait — this is the power of decoupling!

How to run:
  1. Start RabbitMQ:  docker compose up -d rabbitmq
  2. Run this file:   python rabbitmq/01_basic_pubsub/producer.py
  3. Open the UI:     http://localhost:15672  (guest/guest)
     → You'll see the "orders" queue holding messages.
  4. Then run:        python rabbitmq/01_basic_pubsub/consumer.py
"""

from __future__ import annotations

import logging
import sys
import time
from pathlib import Path

# Allow imports from project root
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pika

from rabbitmq.connection import get_connection
from shared.models import OrderRegion, make_sample_order

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [PRODUCER] %(message)s",
)
logger = logging.getLogger(__name__)

QUEUE_NAME = "orders"
NUM_ORDERS = 5


def publish_orders() -> None:
    """Connect to RabbitMQ and publish a batch of sample orders."""
    connection = get_connection()
    channel = connection.channel()

    # ── Step 1: Declare the queue ─────────────────────────────────────────
    # durable=True means the queue survives a broker restart.
    # If the queue already exists with the same params, this is a no-op.
    channel.queue_declare(queue=QUEUE_NAME, durable=True)
    logger.info("📦 Queue '%s' declared", QUEUE_NAME)

    # ── Step 2: Publish messages ──────────────────────────────────────────
    for i in range(1, NUM_ORDERS + 1):
        order = make_sample_order(
            customer_id=f"cust-{i:03d}",
            region=OrderRegion.US_EAST,
        )
        payload = order.to_json()

        channel.basic_publish(
            exchange="",           # Empty string = default exchange (routes by queue name)
            routing_key=QUEUE_NAME,
            body=payload,
            properties=pika.BasicProperties(
                delivery_mode=pika.DeliveryMode.Persistent,  # Survives broker restart
                content_type="application/json",
            ),
        )
        logger.info(
            "📤 Published order #%d | ID: %s | Total: $%.2f",
            i, order.order_id[:8], order.total_amount,
        )
        time.sleep(0.3)  # Slow down so you can watch the queue grow in the UI

    logger.info("✅ Published %d orders to queue '%s'", NUM_ORDERS, QUEUE_NAME)
    connection.close()


if __name__ == "__main__":
    publish_orders()
