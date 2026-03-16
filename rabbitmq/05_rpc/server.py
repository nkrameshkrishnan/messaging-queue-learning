"""RabbitMQ – Lesson 5: RPC Pattern (Server / Worker)

CONCEPT
-------
Remote Procedure Call (RPC) over RabbitMQ lets a client send a request
and *block* until the server sends back a result — all asynchronously,
via message queues.

Architecture:
  Client                    Server
  ──────                    ──────
  1. Create exclusive reply queue   (auto-named, e.g. amq.gen-xyz)
  2. Publish request  ──────────►  RPC_QUEUE
                                   3. Process request
  5. Read reply       ◄──────────  4. Publish to reply_to + correlation_id

Key properties on the request message:
  • reply_to        – the exclusive queue the server should reply to
  • correlation_id  – UUID so the client can match the reply to the request
                      (important when making concurrent RPC calls)

This server computes Fibonacci numbers. The client sends the number n
as the message body, and the server replies with fib(n).

How to run:
  Terminal 1:  python rabbitmq/05_rpc/server.py
  Terminal 2:  python rabbitmq/05_rpc/client.py
  Terminal 2:  python rabbitmq/05_rpc/client.py 10   # custom n
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pika

from rabbitmq.connection import get_connection

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [RPC-SERVER] %(message)s",
)
logger = logging.getLogger(__name__)

RPC_QUEUE = "rpc_fibonacci"


# ── Pure business logic ───────────────────────────────────────────────────────

def fibonacci(n: int) -> int:
    """Compute the n-th Fibonacci number recursively.

    Kept deliberately simple so it takes measurable time for large n.
    fib(0)=0, fib(1)=1, fib(2)=1, fib(3)=2, fib(4)=3, fib(5)=5 …
    """
    if n < 0:
        raise ValueError(f"n must be ≥ 0, got {n}")
    if n == 0:
        return 0
    if n == 1:
        return 1
    return fibonacci(n - 1) + fibonacci(n - 2)


# ── RPC handler ──────────────────────────────────────────────────────────────

def on_request(
    channel: pika.adapters.blocking_connection.BlockingChannel,
    method: pika.spec.Basic.Deliver,
    properties: pika.spec.BasicProperties,
    body: bytes,
) -> None:
    """Handle an incoming RPC request.

    Reads n from the body, computes fib(n), and publishes the result
    back to the exclusive reply queue the client created.
    """
    n = int(body.decode())
    logger.info("📥 Request received: fib(%d)  [corr_id: %s]", n, properties.correlation_id[:8])

    try:
        result = fibonacci(n)
        logger.info("🔢 fib(%d) = %d — publishing reply", n, result)
    except ValueError as exc:
        result = -1
        logger.warning("⚠️  Invalid input: %s", exc)

    # Publish the reply to the callback queue the client specified
    channel.basic_publish(
        exchange="",
        routing_key=properties.reply_to,      # client's exclusive reply queue
        properties=pika.BasicProperties(
            correlation_id=properties.correlation_id,  # echo back so client can match
        ),
        body=str(result),
    )

    # Acknowledge the request only AFTER the reply has been published
    channel.basic_ack(delivery_tag=method.delivery_tag)
    logger.info("✅ Reply sent → queue '%s'", properties.reply_to)


# ── Entry point ───────────────────────────────────────────────────────────────

def serve() -> None:
    connection = get_connection()
    channel = connection.channel()

    # Declare the well-known RPC queue.
    # durable=False is fine here – if the server restarts, clients will retry.
    channel.queue_declare(queue=RPC_QUEUE)

    # Fair dispatch: only send one request at a time to this server.
    # This matters when you run multiple server instances.
    channel.basic_qos(prefetch_count=1)

    channel.basic_consume(queue=RPC_QUEUE, on_message_callback=on_request)

    logger.info("🚀 RPC Server ready — listening on queue '%s'", RPC_QUEUE)
    logger.info("   Send requests with:  python rabbitmq/05_rpc/client.py [n]")
    logger.info("   Press Ctrl+C to stop")

    try:
        channel.start_consuming()
    except KeyboardInterrupt:
        channel.stop_consuming()
        logger.info("🛑 Server stopped.")
    finally:
        connection.close()


if __name__ == "__main__":
    serve()
