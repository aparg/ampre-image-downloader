// STEP 1: Create a new file called "monitoring.js" in your project root
// monitoring.js

const { performance } = require("perf_hooks");

// Simple event loop lag detection
function startMonitoring() {
  console.log("🔍 Starting performance monitoring...");

  // Monitor event loop lag (detects blocking operations)
  let start = performance.now();
  setInterval(() => {
    const lag = performance.now() - start - 100; // Expected 100ms
    if (lag > 10) {
      // Alert if lag > 10ms
      console.warn(
        `⚠️  BLOCKING DETECTED: Event loop blocked for ${lag.toFixed(
          2
        )}ms at ${new Date().toISOString()}`
      );
    }
    start = performance.now();
  }, 100);

  // Monitor memory usage
  setInterval(() => {
    const usage = process.memoryUsage();
    const heapUsed = (usage.heapUsed / 1024 / 1024).toFixed(2);
    console.log(`📊 Memory: ${heapUsed}MB used`);
  }, 30000); // Every 30 seconds
}

// Middleware to track slow HTTP requests
const slowRequestMiddleware = (req, res, next) => {
  const start = Date.now();
  const originalSend = res.send;

  res.send = function (...args) {
    const duration = Date.now() - start;

    if (duration > 500) {
      // Log requests taking > 500ms
      console.warn(
        `🐌 SLOW REQUEST: ${req.method} ${req.url} took ${duration}ms`
      );
    }

    originalSend.apply(this, args);
  };

  next();
};

module.exports = { startMonitoring, slowRequestMiddleware };
