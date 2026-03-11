"""RabbitMQ – Lesson 3: Competing Consumer Worker

Run multiple instances of this worker to observe load balancing.

Usage:
  python rabbitmq/03_consumer_groups/worker.py A   # Fast worker
  python rabbitmq/03_consumer_groups/worker.py B   # Slow worker (shows fair dispatch)
"""

from __future__ import annotations

import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from rabbitmq.connection import get_connection
from shared.models import Order

QUEUE_NAME = "orders_work_queue"


def main(worker_id: str) -> None:
    # Simulate different processing speeds to demonstrate fair dispatch
    processing_time = 0.3 if worker_id == "A" else 1.2

    logging.basicConfig(
        level=logging.INFO,
        format=f"%(asctime)s [WORKER-{worker_id}] %(message)s",
    )
    logger = logging.getLogger(__name__)

    connection = get_connection()
    channel = connection.channel()
    channel.queue_declare(queue=QUEUE_NAME, durable=True)

    # ── Fair dispatch ─────────────────────────────────────────────────────
    # prefetch_count=1 means: "give me a new message only after I've acked the last."
    # Without this, RabbitMQ would round-robin regardless of processing speed —
    # slow workers would pile up a backlog while fast workers sit idle.
    channel.basic_qos(prefetch_count=1)

    def on_message(ch, method, properties, body: bytes) -> None:  # type: ignore[no-untyped-def]
        order = Order.from_json(body.decode())
        logger.info(
            "🔧 Processing order %s | $%.2f (takes %.1fs)...",
            order.order_id[:8], order.total_amount, processing_time,
        )
        time.sleep(processing_time)  # Simulate work
        ch.basic_ack(delivery_tag=method.delivery_tag)
        logger.info("✅ Done with order %s", order.order_id[:8])

    channel.basic_consume(queue=QUEUE_NAME, on_message_callback=on_message)

    logger.info(
        "👷 Worker %s ready (speed=%.1fs/order) | prefetch=1 — Ctrl+C to stop",
        worker_id, processing_time,
    )
    try:
        channel.start_consuming()
    except KeyboardInterrupt:
        logger.info("🛑 Worker %s shutting down", worker_id)
        channel.stop_consuming()
    finally:
        connection.close()


if __name__ == "__main__":
    worker_id = sys.argv[1] if len(sys.argv) > 1 else "A"
    main(worker_id)
