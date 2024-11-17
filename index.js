import { SESMonitor } from "./monitor/SESMonitor.js";

// Run the monitor
const monitor = new SESMonitor();
monitor.monitorAndReport();