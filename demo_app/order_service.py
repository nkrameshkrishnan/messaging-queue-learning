"""Demo App – Order Service

The entry point of the e-commerce flow.
When a customer places an order, this service:
  1. Publishes to RabbitMQ → Payment Service (needs immediate, reliable processing)
  2. Publishes to Kafka    → Analytics, Inventory, Notification services (fan-out)

This demonstrates when you'd use RabbitMQ vs Kafka:
  • RabbitMQ: Task queues, request-reply, reliable command delivery
  • Kafka:    Event streaming, audit log, multiple consumers, replay

Architecture:
  Order Service
    ├── RabbitMQ → [orders_payment]   → Payment Service  (must be processed once)
    └── Kafka    → [order_events]     → Analytics Service  (reads its own copy)
                                      → Inventory Service  (reads its own copy)
                                      → Notification Service (reads its own copy)

How to run:
  1. docker compose up -d
  2. python demo_app/payment_service.py     &
  3. python demo_app/inventory_service.py  &
  4. python demo_app/notification_service.py &
  5. python demo_app/analytics_service.py  &
  6. python demo_app/order_service.py
"""

from __future__ import annotations

import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pika

from kafka.connection import create_topics, get_producer
from rabbitmq.connection import get_connection
from shared.models import OrderRegion, make_sample_order

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [ORDER-SERVICE] %(message)s",
)
logger = logging.getLogger(__name__)

# RabbitMQ config
RMQ_PAYMENT_QUEUE = "orders_payment"

# Kafka config
KAFKA_TOPIC = "order_events"
NUM_ORDERS  = 8


class OrderService:
    """Orchestrates order creation and event publishing."""

    def __init__(self) -> None:
        logger.info("🛒 Order Service starting up...")

        # ── RabbitMQ connection (for payment commands) ─────────────────────
        self._rmq_connection = get_connection()
        self._rmq_channel = self._rmq_connection.channel()
        self._rmq_channel.queue_declare(queue=RMQ_PAYMENT_QUEUE, durable=True)
        logger.info("✅ Connected to RabbitMQ — payment queue ready")

        # ── Kafka producer (for event streaming) ──────────────────────────
        create_topics([(KAFKA_TOPIC, 3, 1)])
        self._kafka_producer = get_producer()
        logger.info("✅ Connected to Kafka — order_events topic ready")

    def place_order(self, customer_id: str, region: OrderRegion) -> None:
        """Place a new order and publish to both messaging systems."""
        order = make_sample_order(customer_id=customer_id, region=region)
        logger.info(
            "📋 New order placed | ID: %s | Customer: %s | $%.2f | Region: %s",
            order.order_id[:8], order.customer_id,
            order.total_amount, order.region.value,
        )

        # ── 1. RabbitMQ: Send payment command (exactly-once processing) ───
        # RabbitMQ ensures this is processed by exactly ONE payment worker.
        # If the payment worker is down, the message waits in the queue.
        self._rmq_channel.basic_publish(
            exchange="",
            routing_key=RMQ_PAYMENT_QUEUE,
            body=order.to_json(),
            properties=pika.BasicProperties(
                delivery_mode=pika.DeliveryMode.Persistent,
                content_type="application/json",
                message_id=order.order_id,
            ),
        )
        logger.info("  → RabbitMQ: Payment command queued ✉️")

        # ── 2. Kafka: Publish order event (fan-out to multiple services) ──
        # Every consumer group (analytics, inventory, notifications) gets
        # its own independent copy of this event.
        def delivery_cb(err, msg) -> None:  # type: ignore[no-untyped-def]
            if err:
                logger.error("  → Kafka delivery failed: %s", err)
            else:
                logger.info(
                    "  → Kafka: Event streamed to partition=%d offset=%d 📡",
                    msg.partition(), msg.offset(),
                )

        self._kafka_producer.produce(
            topic=KAFKA_TOPIC,
            key=order.customer_id,
            value=order.to_json(),
            callback=delivery_cb,
        )
        self._kafka_producer.poll(0)

    def shutdown(self) -> None:
        """Gracefully close all connections."""
        self._kafka_producer.flush()
        self._rmq_connection.close()
        logger.info("👋 Order Service shut down cleanly")


def main() -> None:
    """Place a stream of orders from different customers/regions."""
    service = OrderService()
    regions = list(OrderRegion)

    try:
        for i in range(1, NUM_ORDERS + 1):
            region = regions[i % len(regions)]
            service.place_order(
                customer_id=f"cust-{i:03d}",
                region=region,
            )
            time.sleep(0.8)   # One order every ~0.8s

    except KeyboardInterrupt:
        logger.info("🛑 Interrupted by user")
    finally:
        service.shutdown()


if __name__ == "__main__":
    main()
