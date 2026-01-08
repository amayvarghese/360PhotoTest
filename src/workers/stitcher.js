/* eslint-disable no-restricted-globals */
/* eslint-disable no-undef */

// Setup Module global for OpenCV.js
var Module = {
    onRuntimeInitialized: function () {
        console.log('OpenCV.js is ready');
        self.postMessage({ type: 'status', message: 'OpenCV Ready' });
    }
};

// Load OpenCV.js
if (typeof cv === 'undefined') {
    try {
        importScripts('https://docs.opencv.org/4.8.0/opencv.js');
    } catch (e) {
        console.error("Failed to load OpenCV in worker", e);
    }
}

function waitForOpenCV(timeout = 30000) {
    return new Promise((resolve, reject) => {
        if (cv && cv.Mat) {
            resolve();
            return;
        }

        // If not ready, poll
        const start = Date.now();
        const timer = setInterval(() => {
            if (cv && cv.Mat) {
                clearInterval(timer);
                resolve();
            } else if (Date.now() - start > timeout) {
                clearInterval(timer);
                reject(new Error("OpenCV load timeout"));
            }
        }, 100);
    });
}

self.onmessage = async (e) => {
    const { images, type } = e.data;

    if (type === 'stitch') {
        try {
            await waitForOpenCV();

            if (!cv.Stitcher) {
                throw new Error("OpenCV 'Stitcher' module not found. The standard OpenCV.js build does not include stitching. A custom build is required.");
            }

            console.log('Worker: Starting stitching of ' + images.length + ' images');

            const matVector = new cv.MatVector();

            for (const imgData of images) {
                // Create Mat from ImageData
                const mat = cv.matFromImageData(imgData);
                matVector.push_back(mat);
            }

            const stitcher = cv.Stitcher.create(cv.Stitcher_PANORAMA);
            const result = new cv.Mat();
            const status = stitcher.stitch(matVector, result);

            if (status === cv.Stitcher_OK) {
                console.log('Worker: Stitching success');

                // Convert result to ImageData to send back
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
            console.error(err);
            self.postMessage({ success: false, error: err.message });
        }
    }
};
