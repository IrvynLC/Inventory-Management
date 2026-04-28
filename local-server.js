const http = require("http");
const fs = require("fs");
const path = require("path");

const host = "127.0.0.1";
const port = 3000;
const root = __dirname;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

http
  .createServer((req, res) => {
    const requestPath = (req.url || "/").split("?")[0];
    const relativePath = requestPath === "/" ? "inventory.html" : decodeURIComponent(requestPath.replace(/^\/+/, ""));
    const filePath = path.join(root, relativePath);

    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const extension = path.extname(filePath);
      res.setHeader("Content-Type", mimeTypes[extension] || "application/octet-stream");
      res.end(data);
    });
  })
  .listen(port, host, () => {
    console.log(`Frontend available at http://${host}:${port}`);
  });
