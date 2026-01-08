import cv2
import numpy as np
import io
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List
from fastapi.responses import Response

app = FastAPI()

# Enable CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for dev; restrict in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "running", "message": "Stitching backend is active. POST to /stitch to use."}

@app.post("/stitch")
async def stitch_images(images: List[UploadFile] = File(...)):
    print(f"Received {len(images)} images for stitching")
    
    if len(images) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 images to stitch")

    cv_images = []
    
    try:
        for img_file in images:
            # Read image bytes
            contents = await img_file.read()
            # Convert to numpy array
            nparr = np.frombuffer(contents, np.uint8)
            # Decode image
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                print(f"Failed to decode {img_file.filename}")
                continue
            cv_images.append(img)
            
        if len(cv_images) < 2:
             raise HTTPException(status_code=400, detail="Could not decode enough images")

        print("Stitching...")
        stitcher = cv2.Stitcher_create(cv2.Stitcher_PANORAMA)
        # Reduce confidence threshold to accept matches more easily (default is usually around 1.0 or 0.6 depending on version)
        stitcher.setPanoConfidenceThresh(0.1)
        
        status, pano = stitcher.stitch(cv_images)

        if status != cv2.Stitcher_OK:
            error_msg = f"Stitching failed with error code {status}"
            print(error_msg)
            # Map common errors
            if status == cv2.Stitcher_ERR_NEED_MORE_IMGS:
                error_msg += " (Need more images)"
            elif status == cv2.Stitcher_ERR_HOMOGRAPHY_EST_FAIL:
                 error_msg += " (Homography estimation failed - not enough overlap?)"
            elif status == cv2.Stitcher_ERR_CAMERA_PARAMS_ADJUST_FAIL:
                 error_msg += " (Camera params adjust failed)"

            raise HTTPException(status_code=500, detail=error_msg)

        print("Stitching success!")
        # Encode result back to JPEG
        success, buffer = cv2.imencode(".jpg", pano)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to encode result")
            
        return Response(content=buffer.tobytes(), media_type="image/jpeg")

    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
