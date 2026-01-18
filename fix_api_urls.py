import os

FRONTEND_DIR = os.path.join(os.getcwd(), 'frontend', 'src')

def fix_urls():
    print(f"Scanning {FRONTEND_DIR}...")
    count = 0
    for root, dirs, files in os.walk(FRONTEND_DIR):
        for file in files:
            if file.endswith('.jsx') or file.endswith('.js'):
                path = os.path.join(root, file)
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                original_content = content
                
                # Replace Single Quotes
                # 'http://localhost:5000 -> 'http://' + window.location.hostname + ':5000
                content = content.replace("'http://localhost:5000", "'http://' + window.location.hostname + ':5000")
                
                # Replace Backticks
                # `http://localhost:5000 -> `http://${window.location.hostname}:5000
                content = content.replace("`http://localhost:5000", "`http://${window.location.hostname}:5000")
                
                # Replace Double Quotes (Just in case)
                # "http://localhost:5000 -> "http://" + window.location.hostname + ":5000
                content = content.replace('"http://localhost:5000', '"http://" + window.location.hostname + ":5000')

                if content != original_content:
                    print(f"Patching {file}")
                    with open(path, 'w', encoding='utf-8') as f:
                        f.write(content)
                    count += 1
    
    print(f"Fixed URLs in {count} files.")

if __name__ == "__main__":
    fix_urls()
