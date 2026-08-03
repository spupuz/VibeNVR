import re

with open('backend/routers/events.py', 'r') as f:
    content = f.read()
    
# We want to replace the first conflict with HEAD + allow_redirects=False
# and the second conflict with HEAD + allow_redirects=False

def repl1(m):
    return """                    with open(image_path, "rb") as f:
                        files = {"photo": f}
                        data = {
                            "chat_id": tg_chat,
                            "caption": caption,
                            "parse_mode": "HTML",
                        }
                        resp = requests.post(
                            url, data=data, files=files, proxies=proxies, timeout=10, allow_redirects=False
                        )"""

def repl2(m):
    return """                    resp = requests.post(
                        url,
                        json={
                            "chat_id": tg_chat,
                            "text": caption,
                            "parse_mode": "HTML",
                        },
                        proxies=proxies,
                        timeout=5,
                        allow_redirects=False
                    )"""

# Instead of regex matching the entire block, we can just match the conflict markers.
pattern = re.compile(r'<<<<<<< HEAD\n.*?\n=======\n.*?\n>>>>>>> [^\n]+\n', re.DOTALL)
matches = pattern.findall(content)
if len(matches) == 2:
    new_content = content.replace(matches[0], repl1(None) + '\n').replace(matches[1], repl2(None) + '\n')
    with open('backend/routers/events.py', 'w') as f:
        f.write(new_content)
    
