r"""
Opens an SSH-forwarded local TCP port to the WordPress/WooCommerce site's
MySQL database (only reachable via SSH tunnel — confirmed live that a
direct connection from this app's network is rejected at the MySQL host-ACL
level, matching how the site's own Navicat client is configured).

Invoked by App\Services\WordPress\WordPressTunnel — never run manually with
credentials on the command line; all connection details come from
environment variables so they never appear in a process listing:

  WP_SSH_HOST, WP_SSH_PORT, WP_SSH_USERNAME, WP_SSH_PASSWORD
  WP_DB_HOST, WP_DB_PORT           (the DB's address as seen FROM the SSH
                                     host — typically "localhost"/3306,
                                     since MySQL there only binds to loopback)
  WP_LOCAL_PORT                     (local port to bind the tunnel entry on)

Prints "TUNNEL READY" to stdout once the local port is accepting
connections, then blocks until killed (SIGTERM/SIGINT) so the parent
process can treat that line as the readiness signal.

Cleanup note: the SIGTERM handler below only actually runs when the parent
kills this process on POSIX. On Windows, Symfony Process (WordPressTunnel's
caller) always force-kills via `taskkill /F /T` regardless of what signal
was requested — this process gets no chance to run its own `finally` block
there. That's fine correctness-wise (the OS closes this process's sockets,
including the local tunnel port, the instant it's killed, whether or not
our own cleanup code ran) — it just means "close the SSH session politely"
never happens on Windows, only "the connection drops."
"""

import os
import signal
import socket
import sys
import threading
import time

import paramiko


class ForwardServer(threading.Thread):
    def __init__(self, transport, local_port, remote_host, remote_port):
        super().__init__(daemon=True)
        self.transport = transport
        self.remote_host = remote_host
        self.remote_port = remote_port
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            self.sock.bind(("127.0.0.1", local_port))
            self.sock.listen(5)
        except OSError as e:
            # Most likely a previous run's tunnel is still holding this
            # port — surfaced as one clear line instead of a raw traceback,
            # so WordPressTunnel::open() (which reads this process's
            # stderr into its RuntimeException message) reports something
            # actionable.
            raise RuntimeError(f"Could not bind local port {local_port}: {e}") from e
        self.running = True

    def run(self):
        while self.running:
            try:
                client_sock, _addr = self.sock.accept()
            except OSError:
                break
            threading.Thread(target=self._handle, args=(client_sock,), daemon=True).start()

    def _handle(self, client_sock):
        try:
            chan = self.transport.open_channel(
                "direct-tcpip", (self.remote_host, self.remote_port), client_sock.getpeername()
            )
        except Exception as e:
            print(f"Channel open failed: {e}", file=sys.stderr)
            client_sock.close()
            return

        def pipe(src, dst):
            try:
                while True:
                    data = src.recv(4096)
                    if not data:
                        break
                    dst.sendall(data)
            except Exception:
                pass
            finally:
                for s in (src, dst):
                    try:
                        s.close()
                    except Exception:
                        pass

        threading.Thread(target=pipe, args=(client_sock, chan), daemon=True).start()
        threading.Thread(target=pipe, args=(chan, client_sock), daemon=True).start()

    def stop(self):
        self.running = False
        try:
            self.sock.close()
        except Exception:
            pass


def main():
    ssh_host = os.environ["WP_SSH_HOST"]
    ssh_port = int(os.environ.get("WP_SSH_PORT", "22"))
    ssh_username = os.environ["WP_SSH_USERNAME"]
    ssh_password = os.environ["WP_SSH_PASSWORD"]
    db_host = os.environ.get("WP_DB_HOST", "localhost")
    db_port = int(os.environ.get("WP_DB_PORT", "3306"))
    local_port = int(os.environ["WP_LOCAL_PORT"])

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(ssh_host, port=ssh_port, username=ssh_username, password=ssh_password, timeout=10)
    transport = client.get_transport()

    try:
        forwarder = ForwardServer(transport, local_port, db_host, db_port)
    except RuntimeError as e:
        print(str(e), file=sys.stderr, flush=True)
        client.close()
        sys.exit(1)

    forwarder.start()
    time.sleep(0.3)

    stop_event = threading.Event()

    def handle_signal(signum, frame):
        stop_event.set()

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    print("TUNNEL READY", flush=True)

    try:
        while not stop_event.is_set():
            time.sleep(0.5)
    finally:
        forwarder.stop()
        client.close()


if __name__ == "__main__":
    main()
