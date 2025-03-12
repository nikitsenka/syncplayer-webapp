import { NextRequest } from 'next/server';
import net from 'net';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  let buffer = '';
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const client = new net.Socket();
  
  client.connect(12345, 'localhost', async () => {
    console.log('Connected to TCP server');
    // Send initial connection message
    await writer.write(
      encoder.encode(`data: {"cmd": "STATUS", "status": "connected"}\n\n`)
    );
  });

  client.on('data', async (data: Buffer) => {
    try {
      // Append new data to buffer
      buffer += data.toString();

      // Process complete messages
      while (buffer.includes('\n')) {
        const [message, remaining] = buffer.split('\n', 2);
        buffer = remaining || '';

        if (message.trim()) {
          console.log('Received TCP message:', message);
          // Format as SSE message
          const sseMessage = `data: ${message}\n\n`;
          await writer.write(encoder.encode(sseMessage));
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
      try {
        await writer.write(
          encoder.encode(`data: {"cmd": "ERROR", "error": "${error.message}"}\n\n`)
        );
      } catch (e) {
        console.error('Error sending error message:', e);
      }
    }
  });

  client.on('error', async (error: Error) => {
    console.error('TCP error:', error);
    try {
      await writer.write(
        encoder.encode(`data: {"cmd": "ERROR", "error": "${error.message}"}\n\n`)
      );
    } catch (e) {
      console.error('Error sending error message:', e);
    }
  });

  client.on('close', async () => {
    console.log('TCP connection closed');
    try {
      await writer.write(
        encoder.encode(`data: {"cmd": "STATUS", "status": "disconnected"}\n\n`)
      );
      await writer.close();
    } catch (error) {
      console.error('Error closing writer:', error);
    }
  });

  // Handle client disconnect
  req.signal.addEventListener('abort', () => {
    console.log('Client disconnected, closing TCP connection');
    client.destroy();
  });

  return new Response(stream.readable, { headers });
}

export const dynamic = 'force-dynamic'; 