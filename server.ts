// server.ts
import { createServer } from "https";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { readFile, stat } from "fs/promises";
import { join, extname } from "path";
import { WebSocketServer } from "ws";

const root = join(process.cwd(), "dist");
const keyPath = "./self.key";
const certPath = "./self.crt";

// generate cert if missing
if (!existsSync(keyPath) || !existsSync(certPath)) {
  console.log("Generating self-signed certificate...");
  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout ${keyPath} -out ${certPath} -days 365 -nodes -subj "/CN=localhost"`,
  );
}

const options = {
  key: readFileSync(keyPath),
  cert: readFileSync(certPath),
};

const server = createServer(options, async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/send") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      for (const client of wss.clients)
        if (client.readyState === client.OPEN) client.send(body);
      res.writeHead(200);
      res.end("sent\n");
    });
    return;
  }

  // static file serve
  let filePath = join(root, req.url === "/" ? "index.html" : req.url!);
  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) filePath = join(filePath, "index.html");
    const data = await readFile(filePath);
    const types: Record<string, string> = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".svg": "image/svg+xml",
    };
    res.writeHead(200, {
      "Content-Type": types[extname(filePath)] || "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

const wss = new WebSocketServer({ server });

server.listen(8443, "0.0.0.0", () => {
  console.log(
    "HTTPS server on https://0.0.0.0:8443 and WSS active (self-signed)",
  );
});
