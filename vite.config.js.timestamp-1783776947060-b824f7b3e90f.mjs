// vite.config.js
import { defineConfig } from "file:///C:/Users/nages/pyidcc/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/nages/pyidcc/node_modules/@vitejs/plugin-react/dist/index.js";
import fs from "fs";
var vite_config_default = defineConfig({
  plugins: [
    react({
      fastRefresh: false
    }),
    {
      name: "crew-registry-api",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url || "", "http://localhost");
          const pathName = url.pathname;
          const parseBody = () => new Promise((resolve, reject) => {
            let body = "";
            req.on("data", (chunk) => {
              body += chunk;
            });
            req.on("end", () => {
              try {
                resolve(JSON.parse(body));
              } catch (e) {
                reject(e);
              }
            });
            req.on("error", (err) => reject(err));
          });
          if (pathName === "/api/crew/add" && req.method === "POST") {
            console.log("[Crew API] Adding crew member...");
            try {
              const member = await parseBody();
              console.log("[Crew API] Received payload:", member);
              const filesToUpdate = [
                { path: "./src/data/bmrclCrewRegistry.js", jsonLike: false },
                { path: "./src/components/BmrclCrewRegistry.js", jsonLike: true }
              ];
              for (const { path: filePath, jsonLike } of filesToUpdate) {
                const fileContent = fs.readFileSync(filePath, "utf8");
                if (fileContent.includes(`id: "${member.id}"`) || fileContent.includes(`id: '${member.id}'`) || fileContent.includes(`"id": "${member.id}"`)) {
                  console.log(`[Crew API] Member ID ${member.id} already exists in ${filePath}`);
                  continue;
                }
                const lastBracketIndex = fileContent.lastIndexOf("];");
                if (lastBracketIndex !== -1) {
                  const lastBraceIndex = fileContent.lastIndexOf("}", lastBracketIndex);
                  if (lastBraceIndex !== -1) {
                    const before = fileContent.slice(0, lastBraceIndex + 1);
                    const after = fileContent.slice(lastBraceIndex + 1);
                    const entry = jsonLike ? `
  { "id": "${member.id}", "name": "${member.name}", "designation": "${member.designation}", "contact": "${member.contact}", "email": "${member.email}", "competencyExpiry": "${member.competencyExpiry || ""}" }` : `
  { id: "${member.id}", name: "${member.name}", designation: "${member.designation}", contact: "${member.contact}", email: "${member.email}", competencyExpiry: "${member.competencyExpiry || ""}" }`;
                    const updatedContent = before + "," + entry + after;
                    fs.writeFileSync(filePath, updatedContent, "utf8");
                    console.log(`[Crew API] Successfully appended member ID ${member.id} to ${filePath}`);
                  }
                }
              }
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              console.error("[Crew API] Error in add:", err);
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: err.message }));
            }
          } else if (pathName === "/api/crew/edit" && req.method === "POST") {
            console.log("[Crew API] Editing crew member...");
            try {
              const member = await parseBody();
              const filesToUpdate = [
                { path: "./src/data/bmrclCrewRegistry.js", jsonLike: false },
                { path: "./src/components/BmrclCrewRegistry.js", jsonLike: true }
              ];
              for (const { path: filePath, jsonLike } of filesToUpdate) {
                const fileContent = fs.readFileSync(filePath, "utf8");
                const lines = fileContent.split("\n");
                const lineIdx = lines.findIndex((l) => l.includes(`id: "${member.id}"`) || l.includes(`id: '${member.id}'`) || l.includes(`"id": "${member.id}"`));
                if (lineIdx !== -1) {
                  lines[lineIdx] = jsonLike ? `  { "id": "${member.id}", "name": "${member.name}", "designation": "${member.designation}", "contact": "${member.contact}", "email": "${member.email}", "competencyExpiry": "${member.competencyExpiry || ""}" },` : `  { id: "${member.id}", name: "${member.name}", designation: "${member.designation}", contact: "${member.contact}", email: "${member.email}", competencyExpiry: "${member.competencyExpiry || ""}" },`;
                  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
                  console.log(`[Crew API] Successfully edited member ID ${member.id} in ${filePath}`);
                }
              }
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              console.error("[Crew API] Error in edit:", err);
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: err.message }));
            }
          } else if (pathName === "/api/crew/delete" && req.method === "POST") {
            console.log("[Crew API] Deleting crew member...");
            try {
              const { id } = await parseBody();
              const filesToUpdate = [
                "./src/data/bmrclCrewRegistry.js",
                "./src/components/BmrclCrewRegistry.js"
              ];
              for (const filePath of filesToUpdate) {
                const fileContent = fs.readFileSync(filePath, "utf8");
                const lines = fileContent.split("\n");
                const lineIdx = lines.findIndex((l) => l.includes(`id: "${id}"`) || l.includes(`id: '${id}'`) || l.includes(`"id": "${id}"`));
                if (lineIdx !== -1) {
                  const updatedLines = lines.filter((_, idx) => idx !== lineIdx);
                  fs.writeFileSync(filePath, updatedLines.join("\n"), "utf8");
                  console.log(`[Crew API] Successfully deleted member ID ${id} from ${filePath}`);
                }
              }
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              console.error("[Crew API] Error in delete:", err);
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: err.message }));
            }
          } else {
            next();
          }
        });
      }
    }
  ],
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
    // Ensures the server stays on this port to prevent HMR drift
    hmr: {
      // Explicitly configured to resolve WebSocket connection failure
      protocol: "ws",
      host: "localhost"
    },
    watch: {
      usePolling: false
      // Set to true only if HMR fails to detect file changes on Windows
    }
  },
  build: {
    chunkSizeWarningLimit: 1600,
    // Accommodates enterprise modules
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("firebase")) {
              return "vendor-firebase";
            }
            if (id.includes("lucide-react")) {
              return "vendor-ui-icons";
            }
            return "vendor-core-framework";
          }
        }
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxuYWdlc1xcXFxweWlkY2NcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXG5hZ2VzXFxcXHB5aWRjY1xcXFx2aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvbmFnZXMvcHlpZGNjL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnO1xuaW1wb3J0IGZzIGZyb20gJ2ZzJztcblxuLy8gQ29uZmlndXJhdGlvbiBmb3IgUFlJRENDIChQZWVueWEgSW5kdXN0cnkgRGVwb3QgQ3JldyBDb250cm9sKVxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW1xuICAgIHJlYWN0KHtcbiAgICAgIGZhc3RSZWZyZXNoOiBmYWxzZSxcbiAgICB9KSxcbiAgICB7XG4gICAgICBuYW1lOiAnY3Jldy1yZWdpc3RyeS1hcGknLFxuICAgICAgY29uZmlndXJlU2VydmVyKHNlcnZlcikge1xuICAgICAgICBzZXJ2ZXIubWlkZGxld2FyZXMudXNlKGFzeW5jIChyZXEsIHJlcywgbmV4dCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHVybCA9IG5ldyBVUkwocmVxLnVybCB8fCAnJywgJ2h0dHA6Ly9sb2NhbGhvc3QnKTtcbiAgICAgICAgICBjb25zdCBwYXRoTmFtZSA9IHVybC5wYXRobmFtZTtcblxuICAgICAgICAgIGNvbnN0IHBhcnNlQm9keSA9ICgpID0+IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIGxldCBib2R5ID0gJyc7XG4gICAgICAgICAgICByZXEub24oJ2RhdGEnLCBjaHVuayA9PiB7IGJvZHkgKz0gY2h1bms7IH0pO1xuICAgICAgICAgICAgcmVxLm9uKCdlbmQnLCAoKSA9PiB7XG4gICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShKU09OLnBhcnNlKGJvZHkpKTtcbiAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIHJlamVjdChlKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXEub24oJ2Vycm9yJywgZXJyID0+IHJlamVjdChlcnIpKTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGlmIChwYXRoTmFtZSA9PT0gJy9hcGkvY3Jldy9hZGQnICYmIHJlcS5tZXRob2QgPT09ICdQT1NUJykge1xuICAgICAgICAgICAgY29uc29sZS5sb2coXCJbQ3JldyBBUEldIEFkZGluZyBjcmV3IG1lbWJlci4uLlwiKTtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGNvbnN0IG1lbWJlciA9IGF3YWl0IHBhcnNlQm9keSgpO1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIltDcmV3IEFQSV0gUmVjZWl2ZWQgcGF5bG9hZDpcIiwgbWVtYmVyKTtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIGNvbnN0IGZpbGVzVG9VcGRhdGUgPSBbXG4gICAgICAgICAgICAgICAgeyBwYXRoOiAnLi9zcmMvZGF0YS9ibXJjbENyZXdSZWdpc3RyeS5qcycsIGpzb25MaWtlOiBmYWxzZSB9LFxuICAgICAgICAgICAgICAgIHsgcGF0aDogJy4vc3JjL2NvbXBvbmVudHMvQm1yY2xDcmV3UmVnaXN0cnkuanMnLCBqc29uTGlrZTogdHJ1ZSB9XG4gICAgICAgICAgICAgIF07XG5cbiAgICAgICAgICAgICAgZm9yIChjb25zdCB7IHBhdGg6IGZpbGVQYXRoLCBqc29uTGlrZSB9IG9mIGZpbGVzVG9VcGRhdGUpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBmaWxlQ29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhmaWxlUGF0aCwgJ3V0ZjgnKTtcbiAgICAgICAgICAgICAgICBpZiAoZmlsZUNvbnRlbnQuaW5jbHVkZXMoYGlkOiBcIiR7bWVtYmVyLmlkfVwiYCkgfHwgZmlsZUNvbnRlbnQuaW5jbHVkZXMoYGlkOiAnJHttZW1iZXIuaWR9J2ApIHx8IGZpbGVDb250ZW50LmluY2x1ZGVzKGBcImlkXCI6IFwiJHttZW1iZXIuaWR9XCJgKSkge1xuICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYFtDcmV3IEFQSV0gTWVtYmVyIElEICR7bWVtYmVyLmlkfSBhbHJlYWR5IGV4aXN0cyBpbiAke2ZpbGVQYXRofWApO1xuICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY29uc3QgbGFzdEJyYWNrZXRJbmRleCA9IGZpbGVDb250ZW50Lmxhc3RJbmRleE9mKCddOycpO1xuICAgICAgICAgICAgICAgIGlmIChsYXN0QnJhY2tldEluZGV4ICE9PSAtMSkge1xuICAgICAgICAgICAgICAgICAgY29uc3QgbGFzdEJyYWNlSW5kZXggPSBmaWxlQ29udGVudC5sYXN0SW5kZXhPZignfScsIGxhc3RCcmFja2V0SW5kZXgpO1xuICAgICAgICAgICAgICAgICAgaWYgKGxhc3RCcmFjZUluZGV4ICE9PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBiZWZvcmUgPSBmaWxlQ29udGVudC5zbGljZSgwLCBsYXN0QnJhY2VJbmRleCArIDEpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhZnRlciA9IGZpbGVDb250ZW50LnNsaWNlKGxhc3RCcmFjZUluZGV4ICsgMSk7XG4gICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICBjb25zdCBlbnRyeSA9IGpzb25MaWtlXG4gICAgICAgICAgICAgICAgICAgICAgPyBgXFxuICB7IFwiaWRcIjogXCIke21lbWJlci5pZH1cIiwgXCJuYW1lXCI6IFwiJHttZW1iZXIubmFtZX1cIiwgXCJkZXNpZ25hdGlvblwiOiBcIiR7bWVtYmVyLmRlc2lnbmF0aW9ufVwiLCBcImNvbnRhY3RcIjogXCIke21lbWJlci5jb250YWN0fVwiLCBcImVtYWlsXCI6IFwiJHttZW1iZXIuZW1haWx9XCIsIFwiY29tcGV0ZW5jeUV4cGlyeVwiOiBcIiR7bWVtYmVyLmNvbXBldGVuY3lFeHBpcnkgfHwgJyd9XCIgfWBcbiAgICAgICAgICAgICAgICAgICAgICA6IGBcXG4gIHsgaWQ6IFwiJHttZW1iZXIuaWR9XCIsIG5hbWU6IFwiJHttZW1iZXIubmFtZX1cIiwgZGVzaWduYXRpb246IFwiJHttZW1iZXIuZGVzaWduYXRpb259XCIsIGNvbnRhY3Q6IFwiJHttZW1iZXIuY29udGFjdH1cIiwgZW1haWw6IFwiJHttZW1iZXIuZW1haWx9XCIsIGNvbXBldGVuY3lFeHBpcnk6IFwiJHttZW1iZXIuY29tcGV0ZW5jeUV4cGlyeSB8fCAnJ31cIiB9YDtcbiAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHVwZGF0ZWRDb250ZW50ID0gYmVmb3JlICsgJywnICsgZW50cnkgKyBhZnRlcjtcbiAgICAgICAgICAgICAgICAgICAgZnMud3JpdGVGaWxlU3luYyhmaWxlUGF0aCwgdXBkYXRlZENvbnRlbnQsICd1dGY4Jyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBbQ3JldyBBUEldIFN1Y2Nlc3NmdWxseSBhcHBlbmRlZCBtZW1iZXIgSUQgJHttZW1iZXIuaWR9IHRvICR7ZmlsZVBhdGh9YCk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCgyMDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IHN1Y2Nlc3M6IHRydWUgfSkpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJbQ3JldyBBUEldIEVycm9yIGluIGFkZDpcIiwgZXJyKTtcbiAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg1MDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IGVycm9yOiBlcnIubWVzc2FnZSB9KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmIChwYXRoTmFtZSA9PT0gJy9hcGkvY3Jldy9lZGl0JyAmJiByZXEubWV0aG9kID09PSAnUE9TVCcpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiW0NyZXcgQVBJXSBFZGl0aW5nIGNyZXcgbWVtYmVyLi4uXCIpO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgY29uc3QgbWVtYmVyID0gYXdhaXQgcGFyc2VCb2R5KCk7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBjb25zdCBmaWxlc1RvVXBkYXRlID0gW1xuICAgICAgICAgICAgICAgIHsgcGF0aDogJy4vc3JjL2RhdGEvYm1yY2xDcmV3UmVnaXN0cnkuanMnLCBqc29uTGlrZTogZmFsc2UgfSxcbiAgICAgICAgICAgICAgICB7IHBhdGg6ICcuL3NyYy9jb21wb25lbnRzL0JtcmNsQ3Jld1JlZ2lzdHJ5LmpzJywganNvbkxpa2U6IHRydWUgfVxuICAgICAgICAgICAgICBdO1xuXG4gICAgICAgICAgICAgIGZvciAoY29uc3QgeyBwYXRoOiBmaWxlUGF0aCwganNvbkxpa2UgfSBvZiBmaWxlc1RvVXBkYXRlKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZmlsZUNvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMoZmlsZVBhdGgsICd1dGY4Jyk7XG4gICAgICAgICAgICAgICAgY29uc3QgbGluZXMgPSBmaWxlQ29udGVudC5zcGxpdCgnXFxuJyk7XG4gICAgICAgICAgICAgICAgY29uc3QgbGluZUlkeCA9IGxpbmVzLmZpbmRJbmRleChsID0+IGwuaW5jbHVkZXMoYGlkOiBcIiR7bWVtYmVyLmlkfVwiYCkgfHwgbC5pbmNsdWRlcyhgaWQ6ICcke21lbWJlci5pZH0nYCkgfHwgbC5pbmNsdWRlcyhgXCJpZFwiOiBcIiR7bWVtYmVyLmlkfVwiYCkpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGlmIChsaW5lSWR4ICE9PSAtMSkge1xuICAgICAgICAgICAgICAgICAgbGluZXNbbGluZUlkeF0gPSBqc29uTGlrZVxuICAgICAgICAgICAgICAgICAgICA/IGAgIHsgXCJpZFwiOiBcIiR7bWVtYmVyLmlkfVwiLCBcIm5hbWVcIjogXCIke21lbWJlci5uYW1lfVwiLCBcImRlc2lnbmF0aW9uXCI6IFwiJHttZW1iZXIuZGVzaWduYXRpb259XCIsIFwiY29udGFjdFwiOiBcIiR7bWVtYmVyLmNvbnRhY3R9XCIsIFwiZW1haWxcIjogXCIke21lbWJlci5lbWFpbH1cIiwgXCJjb21wZXRlbmN5RXhwaXJ5XCI6IFwiJHttZW1iZXIuY29tcGV0ZW5jeUV4cGlyeSB8fCAnJ31cIiB9LGBcbiAgICAgICAgICAgICAgICAgICAgOiBgICB7IGlkOiBcIiR7bWVtYmVyLmlkfVwiLCBuYW1lOiBcIiR7bWVtYmVyLm5hbWV9XCIsIGRlc2lnbmF0aW9uOiBcIiR7bWVtYmVyLmRlc2lnbmF0aW9ufVwiLCBjb250YWN0OiBcIiR7bWVtYmVyLmNvbnRhY3R9XCIsIGVtYWlsOiBcIiR7bWVtYmVyLmVtYWlsfVwiLCBjb21wZXRlbmN5RXhwaXJ5OiBcIiR7bWVtYmVyLmNvbXBldGVuY3lFeHBpcnkgfHwgJyd9XCIgfSxgO1xuICAgICAgICAgICAgICAgICAgZnMud3JpdGVGaWxlU3luYyhmaWxlUGF0aCwgbGluZXMuam9pbignXFxuJyksICd1dGY4Jyk7XG4gICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgW0NyZXcgQVBJXSBTdWNjZXNzZnVsbHkgZWRpdGVkIG1lbWJlciBJRCAke21lbWJlci5pZH0gaW4gJHtmaWxlUGF0aH1gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICByZXMud3JpdGVIZWFkKDIwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuICAgICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgc3VjY2VzczogdHJ1ZSB9KSk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIltDcmV3IEFQSV0gRXJyb3IgaW4gZWRpdDpcIiwgZXJyKTtcbiAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg1MDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IGVycm9yOiBlcnIubWVzc2FnZSB9KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmIChwYXRoTmFtZSA9PT0gJy9hcGkvY3Jldy9kZWxldGUnICYmIHJlcS5tZXRob2QgPT09ICdQT1NUJykge1xuICAgICAgICAgICAgY29uc29sZS5sb2coXCJbQ3JldyBBUEldIERlbGV0aW5nIGNyZXcgbWVtYmVyLi4uXCIpO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgY29uc3QgeyBpZCB9ID0gYXdhaXQgcGFyc2VCb2R5KCk7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBjb25zdCBmaWxlc1RvVXBkYXRlID0gW1xuICAgICAgICAgICAgICAgICcuL3NyYy9kYXRhL2JtcmNsQ3Jld1JlZ2lzdHJ5LmpzJyxcbiAgICAgICAgICAgICAgICAnLi9zcmMvY29tcG9uZW50cy9CbXJjbENyZXdSZWdpc3RyeS5qcydcbiAgICAgICAgICAgICAgXTtcblxuICAgICAgICAgICAgICBmb3IgKGNvbnN0IGZpbGVQYXRoIG9mIGZpbGVzVG9VcGRhdGUpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBmaWxlQ29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhmaWxlUGF0aCwgJ3V0ZjgnKTtcbiAgICAgICAgICAgICAgICBjb25zdCBsaW5lcyA9IGZpbGVDb250ZW50LnNwbGl0KCdcXG4nKTtcbiAgICAgICAgICAgICAgICBjb25zdCBsaW5lSWR4ID0gbGluZXMuZmluZEluZGV4KGwgPT4gbC5pbmNsdWRlcyhgaWQ6IFwiJHtpZH1cImApIHx8IGwuaW5jbHVkZXMoYGlkOiAnJHtpZH0nYCkgfHwgbC5pbmNsdWRlcyhgXCJpZFwiOiBcIiR7aWR9XCJgKSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKGxpbmVJZHggIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICBjb25zdCB1cGRhdGVkTGluZXMgPSBsaW5lcy5maWx0ZXIoKF8sIGlkeCkgPT4gaWR4ICE9PSBsaW5lSWR4KTtcbiAgICAgICAgICAgICAgICAgIGZzLndyaXRlRmlsZVN5bmMoZmlsZVBhdGgsIHVwZGF0ZWRMaW5lcy5qb2luKCdcXG4nKSwgJ3V0ZjgnKTtcbiAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBbQ3JldyBBUEldIFN1Y2Nlc3NmdWxseSBkZWxldGVkIG1lbWJlciBJRCAke2lkfSBmcm9tICR7ZmlsZVBhdGh9YCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCgyMDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IHN1Y2Nlc3M6IHRydWUgfSkpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJbQ3JldyBBUEldIEVycm9yIGluIGRlbGV0ZTpcIiwgZXJyKTtcbiAgICAgICAgICAgICAgcmVzLndyaXRlSGVhZCg1MDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcbiAgICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IGVycm9yOiBlcnIubWVzc2FnZSB9KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG5leHQoKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgXSxcbiAgc2VydmVyOiB7XG4gICAgaG9zdDogJ2xvY2FsaG9zdCcsXG4gICAgcG9ydDogNTE3MyxcbiAgICBzdHJpY3RQb3J0OiB0cnVlLCAvLyBFbnN1cmVzIHRoZSBzZXJ2ZXIgc3RheXMgb24gdGhpcyBwb3J0IHRvIHByZXZlbnQgSE1SIGRyaWZ0XG4gICAgaG1yOiB7XG4gICAgICAvLyBFeHBsaWNpdGx5IGNvbmZpZ3VyZWQgdG8gcmVzb2x2ZSBXZWJTb2NrZXQgY29ubmVjdGlvbiBmYWlsdXJlXG4gICAgICBwcm90b2NvbDogJ3dzJyxcbiAgICAgIGhvc3Q6ICdsb2NhbGhvc3QnLFxuICAgIH0sXG4gICAgd2F0Y2g6IHtcbiAgICAgIHVzZVBvbGxpbmc6IGZhbHNlLCAvLyBTZXQgdG8gdHJ1ZSBvbmx5IGlmIEhNUiBmYWlscyB0byBkZXRlY3QgZmlsZSBjaGFuZ2VzIG9uIFdpbmRvd3NcbiAgICB9XG4gIH0sXG4gIGJ1aWxkOiB7XG4gICAgY2h1bmtTaXplV2FybmluZ0xpbWl0OiAxNjAwLCAvLyBBY2NvbW1vZGF0ZXMgZW50ZXJwcmlzZSBtb2R1bGVzXG4gICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgb3V0cHV0OiB7XG4gICAgICAgIG1hbnVhbENodW5rcyhpZCkge1xuICAgICAgICAgIC8vIENvZGUtc3BsaXR0aW5nIGxvZ2ljIHRvIHNlcGFyYXRlIGhlYXZ5IHZlbmRvciBkZXBlbmRlbmNpZXNcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ25vZGVfbW9kdWxlcycpKSB7XG4gICAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ2ZpcmViYXNlJykpIHtcbiAgICAgICAgICAgICAgcmV0dXJuICd2ZW5kb3ItZmlyZWJhc2UnOyAvLyBJc29sYXRlcyBjbG91ZCBkYXRhYmFzZSBjb21tdW5pY2F0aW9uIGVuZ2luZXNcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnbHVjaWRlLXJlYWN0JykpIHtcbiAgICAgICAgICAgICAgcmV0dXJuICd2ZW5kb3ItdWktaWNvbnMnOyAvLyBTZXBhcmF0ZXMgY29udHJvbCByb29tIFVJIHZlY3RvciBhc3NldHNcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiAndmVuZG9yLWNvcmUtZnJhbWV3b3JrJzsgLy8gU3RhbmRhcmQgcmVuZGVyaW5nIG1vZHVsZXNcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn0pOyJdLAogICJtYXBwaW5ncyI6ICI7QUFBeVAsU0FBUyxvQkFBb0I7QUFDdFIsT0FBTyxXQUFXO0FBQ2xCLE9BQU8sUUFBUTtBQUdmLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVM7QUFBQSxJQUNQLE1BQU07QUFBQSxNQUNKLGFBQWE7QUFBQSxJQUNmLENBQUM7QUFBQSxJQUNEO0FBQUEsTUFDRSxNQUFNO0FBQUEsTUFDTixnQkFBZ0IsUUFBUTtBQUN0QixlQUFPLFlBQVksSUFBSSxPQUFPLEtBQUssS0FBSyxTQUFTO0FBQy9DLGdCQUFNLE1BQU0sSUFBSSxJQUFJLElBQUksT0FBTyxJQUFJLGtCQUFrQjtBQUNyRCxnQkFBTSxXQUFXLElBQUk7QUFFckIsZ0JBQU0sWUFBWSxNQUFNLElBQUksUUFBUSxDQUFDLFNBQVMsV0FBVztBQUN2RCxnQkFBSSxPQUFPO0FBQ1gsZ0JBQUksR0FBRyxR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
