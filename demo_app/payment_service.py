"""Demo App – Payment Service (RabbitMQ Consumer)

Reads payment commands from the RabbitMQ queue.
This service uses RabbitMQ because:
  • Payment must be processed EXACTLY ONCE (competing consumers on a queue)
  • Strong delivery guarantees (persistent, durable, ack/nack)
  • Failed payments go to a DLQ for manual review

Run: python demo_app/payment_service.py [worker-id]
"""

from __future__ import annotations

import logging
import random
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rabbitmq.connection import get_connection
from shared.models import Order, OrderStatus

RMQ_PAYMENT_QUEUE = "orders_payment"
DLQ_EXCHANGE      = "payment_dlx"
DLQ_QUEUE         = "orders_payment_failed"

worker_id = sys.argv[1] if len(sys.argv) > 1 else "1"

logging.basicConfig(
    level=logging.INFO,
    format=f"%(asctime)s [PAYMENT-WORKER-{worker_id}] %(message)s",
)
logger = logging.getLogger(__name__)


def charge_payment(order: Order) -> bool:
    """Simulate calling a payment gateway. Fails ~15% of the time."""
    time.sleep(random.uniform(0.3, 0.8))
    success = random.random() > 0.15   # 85% success rate
    return success


def on_payment_message(channel, method, properties, body: bytes) -> None:  # type: ignore[no-untyped-def]
    order = Order.from_json(body.decode())
    logger.info(
        "💳 Charging $%.2f for order %s (customer %s)...",
        order.total_amount, order.order_id[:8], order.customer_id,
    )

    if charge_payment(order):
        logger.info("✅ Payment APPROVED | order=%s", order.order_id[:8])
        channel.basic_ack(delivery_tag=method.delivery_tag)
    else:
        logger.warning("❌ Payment DECLINED | order=%s → sending to DLQ", order.order_id[:8])
        channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)


def main() -> None:
    connection = get_connection()
    channel = connection.channel()

    # Setup DLQ
    channel.exchange_declare(exchange=DLQ_EXCHANGE, exchange_type="direct", durable=True)
    channel.queue_declare(queue=DLQ_QUEUE, durable=True)
    channel.queue_bind(queue=DLQ_QUEUE, exchange=DLQ_EXCHANGE, routing_key=DLQ_QUEUE)

    # Main queue with DLQ config
    channel.queue_declare(
        queue=RMQ_PAYMENT_QUEUE,
        durable=True,
        arguments={
            "x-dead-letter-exchange":    DLQ_EXCHANGE,
            "x-dead-letter-routing-key": DLQ_QUEUE,
        },
    )
    channel.basic_qos(prefetch_count=1)
    channel.basic_consume(queue=RMQ_PAYMENT_QUEUE, on_message_callback=on_payment_message)

    logger.info("💼 Payment Service (Worker %s) ready — Ctrl+C to stop", worker_id)
    try:
        channel.start_consuming()
    except KeyboardInterrupt:
        channel.stop_consuming()
    finally:
        connection.close()


if __name__ == "__main__":
    main()
