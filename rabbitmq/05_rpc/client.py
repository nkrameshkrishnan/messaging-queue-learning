"""RabbitMQ – Lesson 5: RPC Pattern (Client)

CONCEPT
-------
The RPC client:
  1. Creates a *temporary, exclusive* reply queue (auto-named by RabbitMQ).
  2. Sends a request to the well-known RPC_QUEUE with two special properties:
       • reply_to       = the name of our exclusive reply queue
       • correlation_id = a UUID to match this response to this request
  3. Polls connection.process_data_events() in a tight loop until the
     reply arrives in our exclusive queue.
  4. Returns the reply value.

The exclusive reply queue:
  • exclusive=True   → only this connection can access it
  • auto-delete=True → RabbitMQ deletes it when the connection closes
  → No cleanup needed, no naming conflicts between clients.

The correlation_id:
  • Each call generates a fresh UUID.
  • When the server replies, it echoes this ID back.
  • The _on_reply() callback ignores responses with the wrong ID
    (safety net for late / stray replies on long-lived connections).

Usage:
  python rabbitmq/05_rpc/client.py          # computes fib(10) by default
  python rabbitmq/05_rpc/client.py 30       # computes fib(30)
  python rabbitmq/05_rpc/client.py 5 10 15  # makes 3 calls in a row
"""

from __future__ import annotations

import logging
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pika

from rabbitmq.connection import get_connection

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [RPC-CLIENT] %(message)s",
)
logger = logging.getLogger(__name__)

RPC_QUEUE = "rpc_fibonacci"


class FibonacciRPCClient:
    """Synchronous RPC client that computes Fibonacci numbers via RabbitMQ.

    Usage:
        client = FibonacciRPCClient()
        result = client.call(10)
        client.close()

    Or use as a context manager:
        with FibonacciRPCClient() as client:
            print(client.call(10))
    """

    def __init__(self) -> None:
        self.connection = get_connection()
        self.channel = self.connection.channel()

        # ── Create a temporary, exclusive reply queue ─────────────────────
        # queue="" → let RabbitMQ auto-generate a unique name (e.g. amq.gen-abc)
        # exclusive=True → only this connection can use it; auto-deleted on close
        result = self.channel.queue_declare(queue="", exclusive=True)
        self.callback_queue: str = result.method.queue
        logger.info("📬 Reply queue created: '%s'", self.callback_queue)

        # Start consuming from our reply queue; replies are handled by _on_reply
        self.channel.basic_consume(
            queue=self.callback_queue,
            on_message_callback=self._on_reply,
            auto_ack=True,  # replies don't need explicit ACK — we own this queue
        )

        self.response: str | None = None
        self.current_corr_id: str = ""

    def _on_reply(
        self,
        _channel: pika.adapters.blocking_connection.BlockingChannel,
        _method: pika.spec.Basic.Deliver,
        properties: pika.spec.BasicProperties,
        body: bytes,
    ) -> None:
        """Called when a message arrives on our reply queue.

        Only accepts the reply if the correlation_id matches.
        This guards against stale or mis-routed replies.
        """
        if properties.correlation_id == self.current_corr_id:
            self.response = body.decode()
            logger.info(
                "📨 Reply received (corr_id: %s): %s",
                properties.correlation_id[:8],
                self.response,
            )
        else:
            logger.warning(
                "⚠️  Discarded stale reply  got=%s  expected=%s",
                properties.correlation_id[:8],
                self.current_corr_id[:8],
            )

    def call(self, n: int) -> int:
        """Send an RPC request for fib(n) and block until the result arrives.

        Args:
            n: Non-negative integer to compute Fibonacci for.

        Returns:
            fib(n) as an integer.
        """
        self.response = None
        self.current_corr_id = str(uuid.uuid4())

        logger.info(
            "📤 Requesting fib(%d)  [corr_id: %s]",
            n,
            self.current_corr_id[:8],
        )

        self.channel.basic_publish(
            exchange="",
            routing_key=RPC_QUEUE,          # the well-known server queue
            properties=pika.BasicProperties(
                reply_to=self.callback_queue,           # "send reply here"
                correlation_id=self.current_corr_id,   # "tag the reply with this"
            ),
            body=str(n),
        )

        # Poll until _on_reply() sets self.response
        # process_data_events() checks for new I/O without blocking forever
        while self.response is None:
            self.connection.process_data_events(time_limit=1)

        return int(self.response)

    def close(self) -> None:
        """Close the connection and clean up."""
        if self.connection and self.connection.is_open:
            self.connection.close()
            logger.info("🔌 Connection closed.")

    def __enter__(self) -> "FibonacciRPCClient":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    # Accept one or more n values from CLI; default to [10]
    args = sys.argv[1:]
    values = [int(a) for a in args] if args else [10]

    with FibonacciRPCClient() as client:
        for n in values:
            logger.info("─" * 50)
            try:
                result = client.call(n)
                print(f"\n  fib({n}) = {result}\n")
            except ValueError:
                logger.error("Invalid input: %r — n must be a non-negative integer", n)


if __name__ == "__main__":
    main()
