import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';

// Configuration for PYIDCC (Peenya Industry Depot Crew Control)
export default defineConfig({
  plugins: [
    react({
      // fastRefresh MUST be true — setting false forces full-page reloads
      // on every save and is the primary HMR invalidation cause.
      fastRefresh: true,
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
              try { resolve(JSON.parse(body)); }
              catch (e) { reject(e); }
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
                if (
                  fileContent.includes(`id: "${member.id}"`) ||
                  fileContent.includes(`id: '${member.id}'`) ||
                  fileContent.includes(`"id": "${member.id}"`)
                ) {
                  console.log(`[Crew API] Member ID ${member.id} already exists in ${filePath}`);
                  continue;
                }

                const lastBracketIndex = fileContent.lastIndexOf('];');
                if (lastBracketIndex !== -1) {
                  const lastBraceIndex = fileContent.lastIndexOf('}', lastBracketIndex);
                  if (lastBraceIndex !== -1) {
                    const before = fileContent.slice(0, lastBraceIndex + 1);
                    const after  = fileContent.slice(lastBraceIndex + 1);
                    
                    const entry = jsonLike
                      ? `\n  { "id": "${member.id}", "name": "${member.name}", "designation": "${member.designation}", "contact": "${member.contact}", "email": "${member.email}", "competencyExpiry": "${member.competencyExpiry || ''}" }`
                      : `\n  { id: "${member.id}", name: "${member.name}", designation: "${member.designation}", contact: "${member.contact}", email: "${member.email}", competencyExpiry: "${member.competencyExpiry || ''}" }`;
                    
                    fs.writeFileSync(filePath, before + ',' + entry + after, 'utf8');
                    console.log(`[Crew API] Appended member ID ${member.id} to ${filePath}`);
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
                const lines   = fileContent.split('\n');
                const lineIdx = lines.findIndex(l =>
                  l.includes(`id: "${member.id}"`) ||
                  l.includes(`id: '${member.id}'`) ||
                  l.includes(`"id": "${member.id}"`)
                );
                
                if (lineIdx !== -1) {
                  lines[lineIdx] = jsonLike
                    ? `  { "id": "${member.id}", "name": "${member.name}", "designation": "${member.designation}", "contact": "${member.contact}", "email": "${member.email}", "competencyExpiry": "${member.competencyExpiry || ''}" },`
                    : `  { id: "${member.id}", name: "${member.name}", designation: "${member.designation}", contact: "${member.contact}", email: "${member.email}", competencyExpiry: "${member.competencyExpiry || ''}" },`;
                  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
                  console.log(`[Crew API] Edited member ID ${member.id} in ${filePath}`);
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
                const lines   = fileContent.split('\n');
                const lineIdx = lines.findIndex(l =>
                  l.includes(`id: "${id}"`) ||
                  l.includes(`id: '${id}'`) ||
                  l.includes(`"id": "${id}"`)
                );
                
                if (lineIdx !== -1) {
                  fs.writeFileSync(filePath, lines.filter((_, i) => i !== lineIdx).join('\n'), 'utf8');
                  console.log(`[Crew API] Deleted member ID ${id} from ${filePath}`);
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
    strictPort: true,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      // Prevent false HMR disconnections during slow transforms
      timeout: 5000,
    },
    watch: {
      usePolling: false,
      // ─── KEY FIX ──────────────────────────────────────────────────────────
      // The crew-registry-api plugin above writes to bmrclCrewRegistry.js and
      // BmrclCrewRegistry.js at runtime.  Without this 'ignored' list, every
      // API write causes Vite to re-transform those modules → HMR invalidates
      // all their dependents → browser full-reloads → infinite invalidation.
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/src/data/bmrclCrewRegistry.js',
        '**/src/components/BmrclCrewRegistry.js',
      ],
    },
  },

  build: {
    // Raise the limit to suppress warnings for large enterprise modules
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase'))     return 'vendor-firebase';
            if (id.includes('lucide-react')) return 'vendor-ui-icons';
            return 'vendor-core-framework';
          }
        },
      },
    },
  },
});