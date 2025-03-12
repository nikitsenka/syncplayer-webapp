import { NextRequest } from 'next/server';
import net from 'net';

const tcpClients = new Map<string, net.Socket>();

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const { socket, response } = Deno.upgradeWebSocket(req);
  const clientId = Math.random().toString(36).substring(7);

  // Connect to TCP server
  const tcpSocket = new net.Socket();
  tcpClients.set(clientId, tcpSocket);

  tcpSocket.connect(12345, 'localhost', () => {
    console.log('Connected to TCP server');
  });

  tcpSocket.on('data', (data: Buffer) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(data.toString());
    }
  });

  tcpSocket.on('close', () => {
    console.log('TCP connection closed');
    socket.close();
  });

  tcpSocket.on('error', (error: Error) => {
    console.error('TCP error:', error);
    socket.close();
  });

  socket.onopen = () => {
    console.log('WebSocket client connected');
  };

  socket.onclose = () => {
    console.log('WebSocket client disconnected');
    tcpSocket.destroy();
    tcpClients.delete(clientId);
  };

  socket.onerror = (error: Event) => {
    console.error('WebSocket error:', error);
    tcpSocket.destroy();
    tcpClients.delete(clientId);
  };

  return response;
}

export const dynamic = 'force-dynamic'; 