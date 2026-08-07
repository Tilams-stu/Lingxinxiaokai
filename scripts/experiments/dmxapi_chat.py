import json
import requests

URL = "https://www.dmxapi.com/v1/chat/completions"
API_KEY = "sk-m4NtLNqZUJqevQXRKzaOHqPEbYFOaaJkMBPt3WxxtKg6rAYA"
USE_BEARER = False  # 设为 True 使用 "Bearer <key>"；False 使用 "sk-..." 直接传入

payload = {
    "model": "gpt-4o-mini",
    "stream": True,
    "messages": [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "周树人和鲁迅是兄弟吗？"},
    ],
}
headers = {
    "Accept": "application/json",
    "Authorization": (f"Bearer {API_KEY}" if USE_BEARER else API_KEY),
    "Content-Type": "application/json",
}

def run_chat():
    try:
        with requests.post(URL, headers=headers, json=payload, stream=True, timeout=120) as response:
            response.raise_for_status()
            buffer = ""
            for chunk in response.iter_content(chunk_size=None):
                if not chunk:
                    continue
                buffer += chunk.decode("utf-8", errors="ignore")
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    s = line.strip()
                    if not s:
                        continue
                    if s.startswith("data: "):
                        data_line = s[len("data: ") :].strip()
                        if data_line == "[DONE]":
                            print()  # end line after stream
                            return
                        try:
                            data = json.loads(data_line)
                            delta = data["choices"][0]["delta"]
                            content = delta.get("content", "")
                            if content:
                                print(content, end="", flush=True)
                        except (json.JSONDecodeError, KeyError, IndexError, TypeError):
                            # 数据不完整或结构变化，累计后续内容
                            buffer = line + "\n" + buffer
                            break
    except requests.RequestException as e:
        print(f"请求失败: {e}")

if __name__ == "__main__":
    run_chat()