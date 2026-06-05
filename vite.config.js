import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: false,
  },
  build: {
    chunkSizeWarningLimit: 1600, // Adjusts the warning threshold to accommodate enterprise modules
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