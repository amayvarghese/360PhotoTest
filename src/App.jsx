import React, { useState } from 'react';
import CaptureView from './components/CaptureView';
import './App.css';

function App() {
  const [started, setStarted] = useState(false);

  const handleStart = async () => {
    // Check for iOS 13+ permission requirement
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function'
    ) {
      try {
        const permissionState = await DeviceOrientationEvent.requestPermission();
        if (permissionState === 'granted') {
          setStarted(true);
        } else {
          alert('Permission to access device orientation was denied');
        }
      } catch (error) {
        console.error(error);
        alert('Error requesting device orientation permission');
      }
    } else {
      // Non-iOS or older devices
      setStarted(true);
    }
  };

  return (
    <div className="app-container">
      {!started ? (
        <div className="intro-screen">
          <h1>360 Capture</h1>
          <p>Create panoramic images directly in your browser.</p>
          <div style={{ margin: '20px 0', opacity: 0.8 }}>
            <p>1. Grant Camera & Orientation Permissions</p>
            <p>2. Rotate your device to align with dots</p>
            <p>3. Capture the full sphere</p>
          </div>
          <button className="btn" onClick={handleStart}>
            Start Capture
          </button>
        </div>
      ) : (
        <CaptureView />
      )}
    </div>
  );
}

export default App;
