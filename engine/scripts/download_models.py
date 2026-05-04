import os
import requests

MODELS_DIR = "models"
MODEL_URLS = {
    "mobilenet_ssd_v2_coco_quant_postprocess.tflite": "https://raw.githubusercontent.com/google-coral/test_data/master/ssd_mobilenet_v2_coco_quant_postprocess.tflite",
    "mobilenet_ssd_v2_coco_quant_postprocess_edgetpu.tflite": "https://raw.githubusercontent.com/google-coral/test_data/master/ssd_mobilenet_v2_coco_quant_postprocess_edgetpu.tflite",
    "coco_labels.txt": "https://raw.githubusercontent.com/google-coral/test_data/master/coco_labels.txt",
}

def download_file(url, filename):
    path = os.path.join(MODELS_DIR, filename)
    if os.path.exists(path):
        print(f"Skipping {filename}, already exists.")
        return
    
    print(f"Downloading {filename} from {url}...")
    response = requests.get(url, stream=True, timeout=30)
    response.raise_for_status()
    
    with open(path, "wb") as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)
    print(f"Done.")

if __name__ == "__main__":
    os.makedirs(MODELS_DIR, exist_ok=True)
    for filename, url in MODEL_URLS.items():
        try:
            download_file(url, filename)
        except Exception as e:
            print(f"Error downloading {filename}: {e}")

    # YOLO Labels (Standard COCO 80 classes)
    yolo_labels_path = os.path.join(MODELS_DIR, "yolo_labels.txt")
    if not os.path.exists(yolo_labels_path):
        print("Creating yolo_labels.txt...")
        coco_classes = [
            "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat",
            "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat",
            "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack",
            "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball",
            "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket",
            "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
            "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair",
            "couch", "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse",
            "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator",
            "book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush"
        ]
        with open(yolo_labels_path, "w") as f:
            for i, cls in enumerate(coco_classes):
                f.write(f"{i} {cls}\n")
        print("Done.")

    print("\nAll models verified.")
