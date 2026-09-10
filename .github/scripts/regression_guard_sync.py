import sys
import re

def check_file(path, patterns_forbidden, patterns_required):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    for pat in patterns_forbidden:
        if re.search(pat, content):
            print(f"[FAIL] Regression detected in {path}: Found forbidden pattern '{pat}'")
            return False
            
    for pat in patterns_required:
        if not re.search(pat, content):
            print(f"[FAIL] Regression detected in {path}: Missing required pattern '{pat}'")
            return False
            
    print(f"[OK] {path} is free of regressions.")
    return True

def main():
    success = True
    
    # 1. MP4 Duration Accumulation & RAM Bloat Guard
    success &= check_file(
        "engine/recording_manager.py",
        patterns_forbidden=[
            r"\.add_stream_from_template\(", # Causes MP4 exponential duration bug (ensure not in code)
            r"flush_packets['\"]\s*:\s*['\"]0['\"]" # Causes severe RAM memory bloat
        ],
        patterns_required=[
            r"use_editlist"              # Prevents empty edits accumulation
        ]
    )
    
    # 2. RTSP Ring Buffer Memory Leak Guard
    success &= check_file(
        "engine/stream_reader.py",
        patterns_forbidden=[
            r"time_sec - self\.packet_ring_buffer\[0\]\[2\] > self\.pre_buffer_duration" # Old bug: using packet pts for buffer expiry
        ],
        patterns_required=[
            r"real_time = time\.time\(\)" # Must use OS time to survive PTS jumps
        ]
    )
    
    # 3. Bulk Delete Events Guard
    success &= check_file(
        "backend/routers/events.py",
        patterns_forbidden=[],
        patterns_required=[
            r"db_type = \"snapshot\" if event_type == \"picture\" else event_type"
        ]
    )
    
    # 4. PyAV Ubuntu 24.04 HW Acceleration Patch Guard
    success &= check_file(
        "engine/Dockerfile",
        patterns_forbidden=[],
        patterns_required=[
            r"AV_HWDEVICE_TYPE_D3D12VA"
        ]
    )
    
    if not success:
        print("\n[ERROR] Regression checks failed! Do not commit!")
        sys.exit(1)
        
    print("\n[SUCCESS] All regression guards passed!")

if __name__ == "__main__":
    main()
