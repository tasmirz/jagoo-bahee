"""Tiny TCP relay used to prove Docker reachability before Android RNS acceptance runs."""
import socket

listener = socket.socket()
listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
listener.bind(("0.0.0.0", 4242))
listener.listen()
while True:
    connection, _ = listener.accept()
    with connection:
        if connection.recv(64) == b"JAGOO-RNS-E2E":
            connection.sendall(b"OK")
