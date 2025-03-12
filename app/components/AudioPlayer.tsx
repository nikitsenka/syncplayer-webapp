'use client';

import { useEffect, useRef, useState } from 'react';

interface AudioPlayerProps {
  serverUrl: string;
  serverPort: number;
  calibration?: number;
  debug?: boolean;
}

interface DebugInfo {
  receivedStartTime?: number;
  targetTime?: number;
  currentTime?: number;
  calibration: number;
  lastCommand?: string;
  lastError?: string;
}

interface CommandLog {
  timestamp: number;
  command: string;
  rawMessage: string;
}

export default function AudioPlayer({ serverUrl, serverPort, calibration = 0, debug = false }: AudioPlayerProps) {
  const [status, setStatus] = useState<'disconnected' | 'connected' | 'playing'>('disconnected');
  const [currentFile, setCurrentFile] = useState<string>('');
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({ calibration });
  const [commandHistory, setCommandHistory] = useState<CommandLog[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const audioBufferCache = useRef<Map<string, AudioBuffer>>(new Map());
  const messageBufferRef = useRef<string>('');

  const DELAY_TO_SYNC_SEC = 3;
  const MAX_COMMAND_HISTORY = 50;

  const addCommandToHistory = (command: string, rawMessage: string) => {
    setCommandHistory(prev => {
      const newHistory = [
        { timestamp: Date.now(), command, rawMessage },
        ...prev
      ].slice(0, MAX_COMMAND_HISTORY);
      return newHistory;
    });
  };

  useEffect(() => {
    const connectEventSource = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      console.log('Connecting to EventSource...');
      const eventSource = new EventSource('/api/events');
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('EventSource connection opened');
        setStatus('connected');
        setDebugInfo(prev => ({ ...prev, lastError: undefined }));
      };

      eventSource.onerror = (error) => {
        console.error('EventSource error:', error);
        setStatus('disconnected');
        setDebugInfo(prev => ({ 
          ...prev, 
          lastError: 'Connection error, attempting to reconnect...'
        }));
      };

      eventSource.onmessage = async (event) => {
        console.log('Received SSE message:', event.data);
        try {
          const message = JSON.parse(event.data);
          
          // Handle status messages
          if (message.cmd === 'STATUS') {
            if (message.status === 'connected') {
              setStatus('connected');
              setDebugInfo(prev => ({ ...prev, lastError: undefined }));
            } else if (message.status === 'disconnected') {
              setStatus('disconnected');
            }
            return;
          }

          // Handle error messages
          if (message.cmd === 'ERROR') {
            setDebugInfo(prev => ({ ...prev, lastError: message.error }));
            return;
          }

          // Handle regular commands
          console.log('Processing command:', message);
          addCommandToHistory(message.cmd, event.data);
          await handleMessage(message);
        } catch (error) {
          console.error('Error handling message:', error);
          setDebugInfo(prev => ({ 
            ...prev, 
            lastError: `Message error: ${error}. Raw data: ${event.data}`
          }));
        }
      };
    };

    const handleMessage = async (msg: any) => {
      const cmd = msg.cmd;
      const currentTimeMs = Date.now();
      setDebugInfo(prev => ({ ...prev, lastCommand: cmd, currentTime: currentTimeMs }));
      console.log(`Current time: ${currentTimeMs}`);

      if (cmd === 'PLAY') {
        const filename = msg.filename;
        const targetTimeNs = msg.startTime + (DELAY_TO_SYNC_SEC * 1000000000);
        
        setDebugInfo(prev => ({
          ...prev,
          receivedStartTime: msg.startTime,
          targetTime: targetTimeNs,
          lastError: undefined
        }));

        if (filename) {
          setCurrentFile(filename);
          
          if (!audioContextRef.current) {
            audioContextRef.current = new AudioContext();
          }

          try {
            let audioBuffer = audioBufferCache.current.get(filename);
            
            if (!audioBuffer) {
              console.log(`Fetching audio file: ${filename}`);
              const response = await fetch(`/api/audio/${filename}`);
              if (!response.ok) {
                throw new Error(`Failed to fetch audio file: ${response.status} ${response.statusText}`);
              }
              console.log('Audio file fetched successfully');
              const arrayBuffer = await response.arrayBuffer();
              console.log(`Decoding audio data of size: ${arrayBuffer.byteLength} bytes`);
              audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
              console.log('Audio data decoded successfully');
              audioBufferCache.current.set(filename, audioBuffer);
            }

            // Wait for the precise start time
            console.log(`Waiting for target time: ${targetTimeNs}`);
            while (Date.now() * 1000000 < targetTimeNs) {
              await new Promise(resolve => setTimeout(resolve, 0));
              setDebugInfo(prev => ({ ...prev, currentTime: Date.now() }));
            }
            console.log('Target time reached');

            // Apply calibration
            if (calibration > 0) {
              console.log(`Applying calibration delay: ${calibration}ms`);
            }
            await new Promise(resolve => setTimeout(resolve, calibration));

            // Start playback
            console.log('Creating and connecting audio source');
            const source = audioContextRef.current.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContextRef.current.destination);
            audioSourceRef.current = source;
            console.log('Starting audio playback');
            source.start();
            setStatus('playing');
            console.log('Audio playback started');

          } catch (error) {
            console.error('Error loading audio:', error);
            setDebugInfo(prev => ({ ...prev, lastError: `Audio error: ${error}` }));
          }
        }
      } else if (cmd === 'STOP') {
        if (audioSourceRef.current) {
          audioSourceRef.current.stop();
          audioSourceRef.current = null;
        }
        setStatus('connected');
      }
    };

    connectEventSource();

    return () => {
      console.log('Cleaning up EventSource connection');
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (audioSourceRef.current) {
        audioSourceRef.current.stop();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const formatTime = (timeNs?: number) => {
    if (!timeNs) return 'N/A';
    return new Date(timeNs / 1000000).toISOString();
  };

  return (
    <div className="p-4 border rounded-lg shadow-sm">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${
            status === 'disconnected' ? 'bg-red-500' :
            status === 'connected' ? 'bg-yellow-500' :
            'bg-green-500'
          }`} />
          <span className="capitalize">{status}</span>
        </div>
        
        {currentFile && (
          <div className="text-sm text-gray-600">
            Now playing: {currentFile}
          </div>
        )}

        {debug && (
          <>
              <h3 className="font-bold mb-2">Debug Information:</h3>
              <div className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1">
                <span>Last Command:</span>
                <span>{debugInfo.lastCommand || 'N/A'}</span>

                <span>Received Start Time:</span>
                <span>{debugInfo.receivedStartTime}</span>

                <span>Target Time:</span>
                <span>{debugInfo.targetTime}</span>

                <span>Current Time:</span>
                <span>{debugInfo.currentTime}</span>

                <span>Time to Target:</span>
                <span>{debugInfo.targetTime}</span>

                <span>Calibration:</span>
                <span>{debugInfo.calibration}ms</span>

                {debugInfo.lastError && (
                  <>
                    <span className="text-red-500">Error:</span>
                    <span className="text-red-500">{debugInfo.lastError}</span>
                  </>
                )}
              </div>
            <div className="text-xs font-mono bg-gray-100 p-3 rounded">
              <h3 className="font-bold mb-2">Command History:</h3>
              <div className="max-h-40 overflow-y-auto">
                {commandHistory.map((log, index) => (
                  <div key={index} className="mb-2 pb-2 border-b border-gray-200 last:border-0">
                    <div className="flex justify-between text-gray-500">
                      <span>{new Date(log.timestamp).toISOString()}</span>
                      <span className="font-bold">{log.command}</span>
                    </div>
                    <div className="mt-1 text-gray-600 break-all">
                      {log.rawMessage}
                    </div>
                  </div>
                ))}
                {commandHistory.length === 0 && (
                  <div className="text-gray-500 italic">No commands received yet</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
} 