import React from 'react';
import { SocketProvider } from './context/SocketContext';
import ControlPanel from './components/ControlPanel';
import FleetMap from './components/FleetMap';

export default function App() {
  return (
    <SocketProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-gray-100 antialiased">
        <ControlPanel />
        <main className="flex-1 h-screen relative bg-gray-200">
          <FleetMap />
        </main>
      </div>
    </SocketProvider>
  );
}