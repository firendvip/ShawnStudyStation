"""开发用静态服务器：禁用缓存，确保每次刷新都加载最新文件。"""
import http.server
import os
import socketserver

# 始终服务本脚本所在目录（无论从哪个 cwd 启动）
os.chdir(os.path.dirname(os.path.abspath(__file__)))

PORT = 4322


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        super().end_headers()


def main():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), NoCacheHandler) as httpd:
        print(f"Serving on http://localhost:{PORT}")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
