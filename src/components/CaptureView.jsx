import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { DeviceOrientationControls, Html } from '@react-three/drei';
import * as THREE from 'three';
// import Webcam from 'react-webcam';
import { generateSpherePoints, isPointCentered } from '../utils/math';
import { Camera, Check } from 'lucide-react';

const TargetDot = ({ position, id, captured, onCapture }) => {
    const meshRef = useRef();
    const { camera } = useThree();
    const [isHovered, setIsHovered] = useState(false);

    useFrame(() => {
        if (!meshRef.current || captured) return;

        // Check alignment
        const centered = isPointCentered(new THREE.Vector3(...position), camera, 0.15);
        setIsHovered(centered);

        if (centered) {
            // Simple logic: if centered for a frame, trigger capture. 
            // In reality, we want a timer or stability check. 
            // For MVP, we'll let the parent handle the "trigger" logic or button press.
            // Or we can auto-capture here if we add stability logic.
        }
    });

    return (
        <mesh ref={meshRef} position={position}>
            <sphereGeometry args={[0.5, 16, 16]} />
            <meshBasicMaterial
                color={captured ? '#4caf50' : isHovered ? '#ffeb3b' : '#ffffff'}
                transparent
                opacity={0.8}
            />
            {captured && (
                <Html center>
                    <Check size={24} color="white" />
                </Html>
            )}
        </mesh>
    );
};

const SceneContent = ({ setRotation, dots, capturedDots, handleCaptureAttempt }) => {
    const { camera } = useThree();
    const controlsRef = useRef();

    useFrame(() => {
        // Sync rotation for UI or capture
        if (camera) {
            setRotation(camera.quaternion.clone());

            // Auto-detect best target
            // Find closest dot
            let closestId = null;
            let minAngle = Infinity;

            dots.forEach((dot, index) => {
                if (capturedDots.has(index)) return;
                const dotPos = dot.clone();
                // We need to apply the INVERSE of camera rotation to the dot 
                // OR apply camera rotation to forward vector.
                // Easier: angle between camera forward and dot vector.
                const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
                const angle = forward.angleTo(dotPos.normalize());

                if (angle < minAngle) {
                    minAngle = angle;
                    closestId = index;
                }
            });

            if (minAngle < 0.15 && closestId !== null) {
                handleCaptureAttempt(closestId);
            }
        }
    });

    return (
        <>
            <DeviceOrientationControls ref={controlsRef} />
            <ambientLight intensity={0.5} />
            {dots.map((pos, idx) => (
                <TargetDot
                    key={idx}
                    id={idx}
                    position={[pos.x, pos.y, pos.z]}
                    captured={capturedDots.has(idx)}
                />
            ))}
        </>
    );
};

// Main Component
export default function CaptureView() {
    const videoRef = useRef(null);
    const [cameraReady, setCameraReady] = useState(false);
    const [capturedDots, setCapturedDots] = useState(new Set());
    const [currentRotation, setCurrentRotation] = useState(new THREE.Quaternion());
    const [capturing, setCapturing] = useState(false);

    const [capturedImages, setCapturedImages] = useState([]);
    const [isStitching, setIsStitching] = useState(false);
    const [stitchedResult, setStitchedResult] = useState(null);

    // Generate sphere points
    const dots = useMemo(() => generateSpherePoints(20, 10), []);

    const handleFinish = async () => {
        if (capturedImages.length < 2) {
            alert("Capture at least 2 images to stitch.");
            return;
        }
        setIsStitching(true);

        try {
            const formData = new FormData();

            // capturedImages are ImageData. Convert to Blob for upload.
            // Downscale to max 800px width to save bandwidth and server memory
            const blobs = await Promise.all(capturedImages.map(async (imgData, i) => {
                const canvas = document.createElement('canvas');

                // Calculate scale to keep aspect ratio but max width 800
                const maxDim = 800;
                let width = imgData.width;
                let height = imgData.height;

                if (width > maxDim || height > maxDim) {
                    const ratio = Math.min(maxDim / width, maxDim / height);
                    width *= ratio;
                    height *= ratio;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');

                // Draw original ImageData to a temp canvas first to scale it
                // We can't draw ImageData directly with scaling
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = imgData.width;
                tempCanvas.height = imgData.height;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.putImageData(imgData, 0, 0);

                // Draw scaled
                ctx.drawImage(tempCanvas, 0, 0, width, height);

                return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
            }));

            blobs.forEach((blob, i) => {
                formData.append('images', blob, `image_${i}.jpg`);
            });

            // Use environment variable or default to localhost
            const API_URL = import.meta.env.VITE_API_URL
                ? `${import.meta.env.VITE_API_URL}/stitch`
                : 'http://localhost:8000/stitch';

            console.log(`Sending to backend at ${API_URL}...`);
            const response = await fetch(API_URL, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || 'Stitching request failed');
            }

            const blob = await response.blob();
            const stitchedBitmap = await createImageBitmap(blob);

            // Draw to a canvas to get ImageData for consistency with existing state (stitchedResult)
            const canvas = document.createElement('canvas');
            canvas.width = stitchedBitmap.width;
            canvas.height = stitchedBitmap.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(stitchedBitmap, 0, 0);
            const stitchedImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            setStitchedResult(stitchedImageData);
            console.log("Stitched success!");

        } catch (err) {
            console.error(err);
            // Show the URL we TRIED to hit, so we know if env var worked
            const urlUsed = import.meta.env.VITE_API_URL
                ? `${import.meta.env.VITE_API_URL}/stitch`
                : 'http://localhost:8000/stitch';
            alert(`Stitching failed!\n\nTarget: ${urlUsed}\nError: ${err.message}`);
        } finally {
            setIsStitching(false);
        }
    };

    useEffect(() => {
        const startCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
                });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current.play();
                        setCameraReady(true);
                    };
                }
            } catch (err) {
                console.error("Camera access denied:", err);
                alert("Camera access is required for this app.");
            }
        };
        startCamera();
    }, []);

    const captureFrame = (dotId) => {
        if (capturing) return;
        if (capturedDots.has(dotId)) return;

        setCapturing(true);
        // Simulate capture delay or stability
        setTimeout(() => {
            // In a real app, check stability again

            // Capture from video
            if (videoRef.current && cameraReady) {
                const canvas = document.createElement('canvas');
                canvas.width = videoRef.current.videoWidth;
                canvas.height = videoRef.current.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(videoRef.current, 0, 0);


                // const dataUrl = canvas.toDataURL('image/jpeg');
                // Store dataUrl associated with dotId and orientation

                // Get ImageData for OpenCV
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                setCapturedImages(prev => [...prev, imageData]);

                setCapturedDots(prev => new Set(prev).add(dotId));
                console.log(`Captured dot ${dotId}`);
            }
            setCapturing(false);
        }, 500);
    };

    if (stitchedResult) {
        return (
            <div className="app-container">
                <canvas
                    ref={canvas => {
                        if (canvas && stitchedResult) {
                            canvas.width = stitchedResult.width;
                            canvas.height = stitchedResult.height;
                            const ctx = canvas.getContext('2d');
                            ctx.putImageData(stitchedResult, 0, 0);
                        }
                    }}
                    style={{ maxWidth: '100%', maxHeight: '100vh' }}
                />
                <div className="ui-layer">
                    <button className="btn" onClick={() => window.location.reload()}>Restart</button>
                </div>
            </div>
        );
    }

    return (
        <div className="app-container">
            {/* Background Camera Feed */}
            <video
                ref={videoRef}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                playsInline
                muted
            />

            {/* AR Overlay */}
            <div className="overlay">
                <Canvas camera={{ position: [0, 0, 0], fov: 60 }}>
                    <SceneContent
                        setRotation={setCurrentRotation}
                        dots={dots}
                        capturedDots={capturedDots}
                        handleCaptureAttempt={captureFrame}
                    />
                </Canvas>
            </div>

            {/* UI Layer */}
            <div className="ui-layer">
                <div style={{ color: 'white', background: 'rgba(0,0,0,0.5)', padding: '4px 12px', borderRadius: '12px' }}>
                    {capturedDots.size} / {dots.length} Captured
                </div>

                {/* Debug Info for Mobile */}
                <div style={{ pointerEvents: 'none', position: 'absolute', top: '60px', left: '10px', color: 'yellow', fontSize: '10px', maxWidth: '300px', background: 'rgba(0,0,0,0.7)', padding: '5px' }}>
                    Debug: {import.meta.env.VITE_API_URL ? 'Remote' : 'Local'} <br />
                    Status: {isStitching ? 'Stitching...' : 'Idle'} <br />
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn" onClick={() => window.location.reload()}>
                        Reset
                    </button>
                    <button className="btn" style={{ background: '#4caf50', color: 'white' }} onClick={handleFinish} disabled={isStitching}>
                        {isStitching ? 'Stitching...' : 'Finish'}
                    </button>
                </div>
            </div>

            {/* Reticle - Static center */}
            <div style={{
                position: 'absolute', top: '50%', left: '50%',
                width: '20px', height: '20px',
                border: '2px solid white', borderRadius: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 15, pointerEvents: 'none',
                backgroundColor: capturing ? 'rgba(0,255,0,0.5)' : 'transparent'
            }} />
        </div>
    );
}
