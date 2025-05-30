#!/usr/bin/env python3
import http.server
import socketserver
import os

class DownloadHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/governance-methodology.txt':
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Content-Disposition', 'attachment; filename="islanddao-governance-methodology.txt"')
            self.end_headers()
            
            with open('governance-power-methodology.txt', 'rb') as f:
                self.wfile.write(f.read())
                
        elif self.path == '/governance-methodology.md':
            self.send_response(200)
            self.send_header('Content-Type', 'text/markdown')
            self.send_header('Content-Disposition', 'attachment; filename="islanddao-governance-methodology.md"')
            self.end_headers()
            
            with open('formatted-governance-methodology.md', 'rb') as f:
                self.wfile.write(f.read())
                
        elif self.path == '/':
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            
            html = """
            <!DOCTYPE html>
            <html>
            <head>
                <title>IslandDAO Governance Methodology Downloads</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; }
                    h1 { color: #333; }
                    a { color: #0066cc; text-decoration: none; display: block; margin: 20px 0; }
                    a:hover { text-decoration: underline; }
                </style>
            </head>
            <body>
                <h1>IslandDAO Governance Methodology Downloads</h1>
                <p>Download the complete methodology documentation:</p>
                <a href="/governance-methodology.txt">📄 Download Plain Text Version (.txt)</a>
                <a href="/governance-methodology.md">📄 Download Formatted Version (.md)</a>
            </body>
            </html>
            """
            self.wfile.write(html.encode())
        else:
            self.send_error(404)

PORT = 8080
with socketserver.TCPServer(("", PORT), DownloadHandler) as httpd:
    print(f"Download server running at http://localhost:{PORT}/")
    print("Available downloads:")
    print(f"  - http://localhost:{PORT}/governance-methodology.txt")
    print(f"  - http://localhost:{PORT}/governance-methodology.md")
    httpd.serve_forever()