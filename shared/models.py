"""Shared domain models used across all messaging examples.

These dataclasses represent a simple e-commerce domain:
  Order → Payment → Notification → Inventory update → Analytics
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class OrderStatus(str, Enum):
    PENDING = "pending"
    PAID = "paid"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    FAILED = "failed"
    CANCELLED = "cancelled"


class OrderRegion(str, Enum):
    US_EAST = "us-east"
    US_WEST = "us-west"
    EU = "eu"
    APAC = "apac"


@dataclass
class OrderItem:
    """A single line item in an order."""

    product_id: str
    product_name: str
    quantity: int
    unit_price: float

    @property
    def subtotal(self) -> float:
        """Computed subtotal for this line item."""
        return self.quantity * self.unit_price


@dataclass
class Order:
    """Core order domain object passed between services via messages."""

    order_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    customer_id: str = ""
    customer_email: str = ""
    items: list[OrderItem] = field(default_factory=list)
    status: OrderStatus = OrderStatus.PENDING
    region: OrderRegion = OrderRegion.US_EAST
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    @property
    def total_amount(self) -> float:
        """Total order value across all items."""
        return sum(item.subtotal for item in self.items)

    def to_json(self) -> str:
        """Serialize order to JSON string for message payloads."""
        return json.dumps({
            "order_id": self.order_id,
            "customer_id": self.customer_id,
            "customer_email": self.customer_email,
            "items": [
                {
                    "product_id": i.product_id,
                    "product_name": i.product_name,
                    "quantity": i.quantity,
                    "unit_price": i.unit_price,
                }
                for i in self.items
            ],
            "status": self.status.value,
            "region": self.region.value,
            "total_amount": self.total_amount,
            "created_at": self.created_at,
        })

    @classmethod
    def from_json(cls, payload: str) -> "Order":
        """Deserialize an order from a JSON string."""
        data = json.loads(payload)
        items = [
            OrderItem(
                product_id=i["product_id"],
                product_name=i["product_name"],
                quantity=i["quantity"],
                unit_price=i["unit_price"],
            )
            for i in data.get("items", [])
        ]
        return cls(
            order_id=data["order_id"],
            customer_id=data["customer_id"],
            customer_email=data["customer_email"],
            items=items,
            status=OrderStatus(data["status"]),
            region=OrderRegion(data["region"]),
            created_at=data["created_at"],
        )


# ── Convenience factory for demo data ────────────────────────────────────────

def make_sample_order(
    customer_id: str = "cust-001",
    region: OrderRegion = OrderRegion.US_EAST,
) -> Order:
    """Create a realistic demo order for examples."""
    return Order(
        customer_id=customer_id,
        customer_email=f"{customer_id}@example.com",
        region=region,
        items=[
            OrderItem("prod-001", "Wireless Keyboard", 1, 79.99),
            OrderItem("prod-002", "USB-C Hub", 2, 34.99),
        ],
    )
