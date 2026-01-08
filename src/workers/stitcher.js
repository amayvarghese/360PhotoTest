/* eslint-disable no-restricted-globals */
/* eslint-disable no-undef */

// Load OpenCV.js
// We use a try-catch or check if already loaded
if (typeof cv === 'undefined') {
    try {
        importScripts('https://docs.opencv.org/4.8.0/opencv.js');
    } catch (e) {
        console.error("Failed to load OpenCV in worker", e);
    }
}

self.onmessage = async (e) => {
    const { images, type } = e.data;

    if (type === 'stitch') {
        if (!cv || !cv.Stitcher) {
            // WaitForOpenCV? Usually importScripts is synchronous.
            if (typeof cv === 'undefined') {
                self.postMessage({ error: 'OpenCV not loaded' });
                return;
            }
        }

        // Wait for runtime to be ready if needed
        if (cv.getBuildInformation) {
            // console.log(cv.getBuildInformation());
        } else {
            // It might be a promise in some versions, but usually 4.8.0 docs says it's ready after script load 
            // or we need to wait for cv.onRuntimeInitialized
        }

        try {
            console.log('Worker: Starting stitching of ' + images.length + ' images');

            const matVector = new cv.MatVector();

            for (const imgData of images) {
                // imgData is expected to be ImageData or similar. 
                // In worker, we might receive ArrayBuffer or OffscreenCanvas output.
                // If we receive base64, we need to decode. 
                // Best to send ImageData from OffscreenCanvas or similar buffer.

                // Assuming we receive { width, height, data } (ImageData-like)
                const mat = cv.matFromImageData(imgData);
                matVector.push_back(mat);
            }

            const stitcher = cv.Stitcher.create(cv.Stitcher_PANORAMA);
            const result = new cv.Mat();
            const status = stitcher.stitch(matVector, result);

            if (status === cv.Stitcher_OK) {
                console.log('Worker: Stitching success');

                // Convert result to ImageData to send back
                // cv.imshow requires a canvas, but we can get data
                const imgData = new ImageData(
                    new Uint8ClampedArray(result.data),
                    result.cols,
                    result.rows
                );

                self.postMessage({ success: true, imageData: imgData });
                result.delete();
            } else {
                console.error('Worker: Stitching failed with error code ' + status);
                self.postMessage({ success: false, error: 'Stitching failed: ' + status });
            }

            matVector.delete();
            stitcher.delete();

        } catch (err) {
            self.postMessage({ success: false, error: err.message });
        }
    }
};
