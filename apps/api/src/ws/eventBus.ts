import type { SocketStream } from "@fastify/websocket";
import type { AgentEvent } from "@wattson/shared";

const clients = new Set<SocketStream>();

export function addClient(conn: SocketStream): void {
  clients.add(conn);
  conn.socket.on("close", () => clients.delete(conn));
}

export function broadcast(event: AgentEvent): void {
  const payload = JSON.stringify(event);
  for (const conn of clients) {
    if (conn.socket.readyState === 1) {
      conn.socket.send(payload);
    }
  }
}

export function clientCount(): number {
  return clients.size;
}
