import json
import os

log_path = r"C:\Users\nages\.gemini\antigravity-ide\brain\c8e6ae25-9d6e-44c7-b55d-8339e5c3ea73\.system_generated\logs\transcript.jsonl"

if os.path.exists(log_path):
    with open(log_path, 'r', encoding='utf-8') as f:
        lines = f.read().splitlines()
        print("Total lines in log:", len(lines))
        # Look at the last 5 lines
        for idx in range(max(0, len(lines)-5), len(lines)):
            line = lines[idx]
            try:
                data = json.loads(line)
                source = data.get('source')
                type_val = data.get('type')
                content = data.get('content', '')
                print(f"Index {idx}: source={source}, type={type_val}, content_len={len(content)}")
                if "20022" in content or "ANGEL RANI" in content:
                    print("  Contains ANGEL RANI!")
                    print("  Truncated in content:", "<truncated" in content)
                    print(f"  Snippet: {content[:200]} ... {content[-200:]}")
            except Exception as e:
                print(f"Error parsing index {idx}: {e}")
else:
    print("Log not found")
