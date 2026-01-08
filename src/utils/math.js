import * as THREE from 'three';

export function generateSpherePoints(count = 50, radius = 10) {
  const points = [];
  const phi = Math.PI * (3 - Math.sqrt(5)); // golden angle

  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2; // y goes from 1 to -1
    const radiusAtY = Math.sqrt(1 - y * y); // radius at y

    const theta = phi * i; // golden angle increment

    const x = Math.cos(theta) * radiusAtY;
    const z = Math.sin(theta) * radiusAtY;

    points.push(new THREE.Vector3(x * radius, y * radius, z * radius));
  }
  return points;
}

export function isPointCentered(point, camera, threshold = 0.15) { // Threshold in radians approx
    // Transform point to camera space
    const pLocal = point.clone().applyMatrix4(camera.matrixWorldInverse);
    
    // Check if point is roughly in front (z < 0) and close to the center
    // Normalized device coordinates would be easier, but checking angle is robust
    // Vector pointing to forward (-z)
    const forward = new THREE.Vector3(0, 0, -1);
    pLocal.normalize();
    
    return pLocal.angleTo(forward) < threshold;
}
