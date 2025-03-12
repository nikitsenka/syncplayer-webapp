import { NextRequest } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  try {
    const filename = params.filename;
    const musicDir = process.env.MUSIC_DIR || '.';
    const filePath = path.join(musicDir, filename);

    const fileBuffer = await readFile(filePath);
    
    return new Response(fileBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Error serving audio file:', error);
    return new Response('File not found', { status: 404 });
  }
} 