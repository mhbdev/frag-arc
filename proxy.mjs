// Arc Studio preview proxy: forwards port 5173 → Next.js on 3001
import http from "http";
import httpProxy from "http-proxy";

const proxy = httpProxy.createProxyServer({
  target: "http://localhost:3001",
  ws: true,
  changeOrigin: true,
});

proxy.on("error", (err, req, res) => {
  if (res && !res.headersSent) {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("Proxy error: " + err.message);
  }
});

const server = http.createServer((req, res) => {
  proxy.web(req, res);
});

server.on("upgrade", (req, socket, head) => {
  proxy.ws(req, socket, head);
});

server.listen(5173, "0.0.0.0", () => {
  console.log("Arc Studio proxy: 5173 → 3001");
});
