import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Configuration for PYIDCC (Peenya Industry Depot Crew Control)
export default defineConfig({
  plugins: [react()],
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