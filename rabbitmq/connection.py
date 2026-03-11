"""RabbitMQ connection helper.

Wraps pika's BlockingConnection with retry logic so examples
can start even while RabbitMQ is still booting up.
"""

from __future__ import annotations

import logging
import time

import pika
from pika.adapters.blocking_connection import BlockingChannel, BlockingConnection

logger = logging.getLogger(__name__)

RABBITMQ_URL = "amqp://guest:guest@localhost:5672/"


def get_connection(retries: int = 10, delay: float = 2.0) -> BlockingConnection:
    """Return a connected pika BlockingConnection, with retry on failure.

    Args:
        retries: Maximum number of connection attempts.
        delay:   Seconds to wait between retries.

    Returns:
        An open BlockingConnection to the local RabbitMQ broker.

    Raises:
        pika.exceptions.AMQPConnectionError: If all retries are exhausted.
    """
    params = pika.URLParameters(RABBITMQ_URL)
    for attempt in range(1, retries + 1):
        try:
            connection = pika.BlockingConnection(params)
            logger.info("✅ Connected to RabbitMQ (attempt %d)", attempt)
            return connection
        except pika.exceptions.AMQPConnectionError:
            logger.warning(
                "⏳ RabbitMQ not ready – retrying in %.1fs (%d/%d)...",
                delay, attempt, retries,
            )
            time.sleep(delay)
    raise pika.exceptions.AMQPConnectionError(
        f"Could not connect to RabbitMQ after {retries} attempts"
    )


def get_channel(connection: BlockingConnection) -> BlockingChannel:
    """Open and return a channel from an existing connection."""
    return connection.channel()
