import re
with open('backend/health_service.py', 'r') as f:
    content = f.read()

pattern = re.compile(r'<<<<<<< HEAD\n(.*?)\n=======\n(.*?)\n>>>>>>> [^\n]+\n', re.DOTALL)
new_content = pattern.sub(r'\1', content)

with open('backend/health_service.py', 'w') as f:
    f.write(new_content)
