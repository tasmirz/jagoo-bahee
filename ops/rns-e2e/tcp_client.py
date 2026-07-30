import socket
import sys

with socket.create_connection((sys.argv[1], 4242), timeout=10) as connection:
    connection.sendall(b"JAGOO-RNS-E2E")
    assert connection.recv(2) == b"OK"
print("TCP relay path: PASS")
