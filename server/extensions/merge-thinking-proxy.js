// Local SSE proxy: merge.dev streams GLM thinking in `delta.thinking`,
// pi only parses `delta.reasoning_content`. This proxy rewrites the field.
// Registered via pi.registerProvider override, so it survives pi updates.
import http from "http";
const https = (await import("https")).default;
const UPSTREAM = "https://api-gateway.merge.dev";
const PORT = 8791;

function rewriteLine(line) {
  if (!line.startsWith("data:")) return line;
  const payload = line.slice(5).trim();
  if (!payload || payload === "[DONE]") return line;
  try {
    const obj = JSON.parse(payload);
    for (const choice of obj.choices ?? []) {
      const d = choice.delta;
      if (d && typeof d.thinking === "string") {
        d.reasoning_content = d.thinking;
      }
    }
    return "data: " + JSON.stringify(obj);
  } catch {
    return line;
  }
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const body = Buffer.concat(chunks);
        const headers = { "content-type": req.headers["content-type"] || "application/json" };
        if (req.headers["authorization"]) headers["authorization"] = req.headers["authorization"];
        if (req.headers["accept"]) headers["accept"] = req.headers["accept"];
        if (req.headers["user-agent"]) headers["user-agent"] = req.headers["user-agent"];
        const up = https.request(
          UPSTREAM + req.url,
          { method: req.method, headers },
          (ur) => {
            res.writeHead(ur.statusCode, ur.headers);
            let buf = "";
            ur.on("data", (c) => {
              buf += c.toString();
              let idx;
              while ((idx = buf.indexOf("\n")) !== -1) {
                const line = buf.slice(0, idx + 1);
                buf = buf.slice(idx + 1);
                res.write(rewriteLine(line.trimEnd()) + "\n");
              }
            });
            ur.on("end", () => {
              if (buf) res.write(rewriteLine(buf.trimEnd()) + "\n");
              res.end();
            });
          }
        );
        up.on("error", () => {
          if (!res.headersSent) res.writeHead(502);
          res.end("proxy error");
        });
        up.end(body);
      });
    });
    server.on("error", () => resolve(false)); // already running
    server.listen(PORT, "127.0.0.1", () => resolve(true));
  });
}

export default async function (pi) {
  await startServer();
  pi.registerProvider("merge-gateway", {
    baseUrl: `http://127.0.0.1:${PORT}/v1/openai`,
  });
}
