"""Demo App – Analytics Service (Kafka Consumer — group: analytics-service)

Reads from the same Kafka order_events topic.
Tracks revenue, order counts, and regional breakdowns in memory.

Key learning: This service runs behind its own offset cursor.
Even if it was down for hours, it will catch up from where it left off
when it restarts — a core Kafka strength.

Run: python demo_app/analytics_service.py
"""

from __future__ import annotations

import logging
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kafka.connection import get_consumer
from shared.models import Order

KAFKA_TOPIC = "order_events"
GROUP_ID    = "analytics-service"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [ANALYTICS-SERVICE] %(message)s",
)
logger = logging.getLogger(__name__)


class AnalyticsDashboard:
    """Simple in-memory analytics tracker."""

    def __init__(self) -> None:
        self.total_orders: int = 0
        self.total_revenue: float = 0.0
        self.orders_by_region: dict[str, int] = defaultdict(int)
        self.revenue_by_region: dict[str, float] = defaultdict(float)

    def record(self, order: Order) -> None:
        self.total_orders += 1
        self.total_revenue += order.total_amount
        self.orders_by_region[order.region.value] += 1
        self.revenue_by_region[order.region.value] += order.total_amount

    def print_summary(self) -> None:
        logger.info(
            "📊 ANALYTICS SUMMARY\n"
            "       Total orders:  %d\n"
            "       Total revenue: $%.2f\n"
            "       By region:     %s",
            self.total_orders,
            self.total_revenue,
            dict(self.revenue_by_region),
        )


def main() -> None:
    consumer = get_consumer(group_id=GROUP_ID)
    consumer.subscribe([KAFKA_TOPIC])
    dashboard = AnalyticsDashboard()

    logger.info("📈 Analytics Service listening — Ctrl+C to see summary")

    try:
        while True:
            msg = consumer.poll(timeout=1.0)
            if msg is None:
                continue
            if msg.error():
                logger.error("Kafka error: %s", msg.error())
                continue

            order = Order.from_json(msg.value().decode())
            dashboard.record(order)
            logger.info(
                "📈 Recorded | Order=%s | Region=%s | $%.2f | Total orders so far: %d",
                order.order_id[:8], order.region.value,
                order.total_amount, dashboard.total_orders,
            )
            consumer.commit(asynchronous=False)

    except KeyboardInterrupt:
        dashboard.print_summary()
        logger.info("🛑 Analytics Service shutting down")
    finally:
        consumer.close()


if __name__ == "__main__":
    main()
