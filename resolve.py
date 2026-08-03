import os
import re

def resolve_file(path, resolution_strategy):
    with open(path, 'r') as f:
        content = f.read()
    
    # regex for conflict blocks
    pattern = re.compile(r'<<<<<<< HEAD\n(.*?)\n=======\n(.*?)\n>>>>>>> [^\n]+\n', re.DOTALL)
    
    def repl(m):
        head = m.group(1)
        theirs = m.group(2)
        if resolution_strategy == 'both':
            return head + '\n' + theirs
        elif resolution_strategy == 'head':
            return head
        elif resolution_strategy == 'theirs':
            return theirs
        elif resolution_strategy == 'custom_utils':
            return head
        elif resolution_strategy == 'custom_settings':
            return theirs
        elif resolution_strategy == 'custom_test_url':
            # head has the 192 url, theirs has 192 url
            # we just take head
            return head
        return m.group(0)

    # for test_settings, we want head for the first conflict (URL), theirs for the second (new test)
    if path.endswith('test_settings_service.py'):
        # Do it manually
        parts = pattern.split(content)
        # parts will be [pre, head1, theirs1, mid, head2, theirs2, post]
        if len(parts) == 7:
            new_content = parts[0] + parts[1] + parts[3] + parts[5] + parts[6]
            with open(path, 'w') as f:
                f.write(new_content)
        return

    new_content = pattern.sub(repl, content)
    with open(path, 'w') as f:
        f.write(new_content)

resolve_file('.jules/sentinel.md', 'both')
resolve_file('backend/settings_service.py', 'head')
resolve_file('backend/utils.py', 'head')
resolve_file('.github/scripts/test_settings_service.py', 'custom')

