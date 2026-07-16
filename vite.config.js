import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';

// Configuration for PYIDCC (Peenya Industry Depot Crew Control)
export default defineConfig({
  plugins: [
    react({
      fastRefresh: false,
    }),
    {
      name: 'crew-registry-api',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url || '', 'http://localhost');
          const pathName = url.pathname;

          const parseBody = () => new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                resolve(JSON.parse(body));
              } catch (e) {
                reject(e);
              }
            });
            req.on('error', err => reject(err));
          });

          if (pathName === '/api/crew/add' && req.method === 'POST') {
            console.log("[Crew API] Adding crew member...");
            try {
              const member = await parseBody();
              console.log("[Crew API] Received payload:", member);
              
              const filesToUpdate = [
                { path: './src/data/bmrclCrewRegistry.js', jsonLike: false },
                { path: './src/components/BmrclCrewRegistry.js', jsonLike: true }
              ];

              for (const { path: filePath, jsonLike } of filesToUpdate) {
                const fileContent = fs.readFileSync(filePath, 'utf8');
                if (fileContent.includes(`id: "${member.id}"`) || fileContent.includes(`id: '${member.id}'`) || fileContent.includes(`"id": "${member.id}"`)) {
                  console.log(`[Crew API] Member ID ${member.id} already exists in ${filePath}`);
                  continue;
                }

                const lastBracketIndex = fileContent.lastIndexOf('];');
                if (lastBracketIndex !== -1) {
                  const lastBraceIndex = fileContent.lastIndexOf('}', lastBracketIndex);
                  if (lastBraceIndex !== -1) {
                    const before = fileContent.slice(0, lastBraceIndex + 1);
                    const after = fileContent.slice(lastBraceIndex + 1);
                    
                    const entry = jsonLike
                      ? `\n  { "id": "${member.id}", "name": "${member.name}", "designation": "${member.designation}", "contact": "${member.contact}", "email": "${member.email}", "competencyExpiry": "${member.competencyExpiry || ''}" }`
                      : `\n  { id: "${member.id}", name: "${member.name}", designation: "${member.designation}", contact: "${member.contact}", email: "${member.email}", competencyExpiry: "${member.competencyExpiry || ''}" }`;
                    
                    const updatedContent = before + ',' + entry + after;
                    fs.writeFileSync(filePath, updatedContent, 'utf8');
                    console.log(`[Crew API] Successfully appended member ID ${member.id} to ${filePath}`);
                  }
                }
              }

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              console.error("[Crew API] Error in add:", err);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          } else if (pathName === '/api/crew/edit' && req.method === 'POST') {
            console.log("[Crew API] Editing crew member...");
            try {
              const member = await parseBody();
              
              const filesToUpdate = [
                { path: './src/data/bmrclCrewRegistry.js', jsonLike: false },
                { path: './src/components/BmrclCrewRegistry.js', jsonLike: true }
              ];

              for (const { path: filePath, jsonLike } of filesToUpdate) {
                const fileContent = fs.readFileSync(filePath, 'utf8');
                const lines = fileContent.split('\n');
                const lineIdx = lines.findIndex(l => l.includes(`id: "${member.id}"`) || l.includes(`id: '${member.id}'`) || l.includes(`"id": "${member.id}"`));
                
                if (lineIdx !== -1) {
                  lines[lineIdx] = jsonLike
                    ? `  { "id": "${member.id}", "name": "${member.name}", "designation": "${member.designation}", "contact": "${member.contact}", "email": "${member.email}", "competencyExpiry": "${member.competencyExpiry || ''}" },`
                    : `  { id: "${member.id}", name: "${member.name}", designation: "${member.designation}", contact: "${member.contact}", email: "${member.email}", competencyExpiry: "${member.competencyExpiry || ''}" },`;
                  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
                  console.log(`[Crew API] Successfully edited member ID ${member.id} in ${filePath}`);
                }
              }

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              console.error("[Crew API] Error in edit:", err);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          } else if (pathName === '/api/crew/delete' && req.method === 'POST') {
            console.log("[Crew API] Deleting crew member...");
            try {
              const { id } = await parseBody();
              
              const filesToUpdate = [
                './src/data/bmrclCrewRegistry.js',
                './src/components/BmrclCrewRegistry.js'
              ];

              for (const filePath of filesToUpdate) {
                const fileContent = fs.readFileSync(filePath, 'utf8');
                const lines = fileContent.split('\n');
                const lineIdx = lines.findIndex(l => l.includes(`id: "${id}"`) || l.includes(`id: '${id}'`) || l.includes(`"id": "${id}"`));
                
                if (lineIdx !== -1) {
                  const updatedLines = lines.filter((_, idx) => idx !== lineIdx);
                  fs.writeFileSync(filePath, updatedLines.join('\n'), 'utf8');
                  console.log(`[Crew API] Successfully deleted member ID ${id} from ${filePath}`);
                }
              }

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              console.error("[Crew API] Error in delete:", err);
              res.writeHead(500, { 'Content-Type': 'application/json' });
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
    host: 'localhost',
    port: 5173,
    strictPort: true, // Ensures the server stays on this port to prevent HMR drift
    hmr: {
      // Explicitly configured to resolve WebSocket connection failure
      protocol: 'ws',
      host: 'localhost',
    },
    watch: {
      usePolling: false, // Set to true only if HMR fails to detect file changes on Windows
    }
  },
  build: {
    chunkSizeWarningLimit: 1600, // Accommodates enterprise modules
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Code-splitting logic to separate heavy vendor dependencies
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) {
              return 'vendor-firebase'; // Isolates cloud database communication engines
            }
            if (id.includes('lucide-react')) {
              return 'vendor-ui-icons'; // Separates control room UI vector assets
            }
            return 'vendor-core-framework'; // Standard rendering modules
          }
        }
      }
    }
  }
});