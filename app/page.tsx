'use client';

import AudioPlayer from './components/AudioPlayer';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">
        SyncPlayer
      </h1>
      <AudioPlayer 
        serverUrl={process.env.NEXT_PUBLIC_SERVER_URL || 'localhost'} 
        serverPort={parseInt(process.env.NEXT_PUBLIC_SERVER_PORT || '12345')}
        calibration={parseInt(process.env.NEXT_PUBLIC_CALIBRATION || '0')}
        debug={process.env.NEXT_PUBLIC_DEBUG === 'true'}
      />
    </main>
  );
} 