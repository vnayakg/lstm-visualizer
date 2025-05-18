import { TOMBSTONE } from "../constants";

class MemTable {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.data = new Map();
    this.mutationOrder = []; // To maintain rough order for visualization if needed
  }

  put(key, value) {
    // If key wasn't present, it's a new addition to mutation order
    if (!this.data.has(key)) {
      // This check should ideally be done by LSMTree before calling put
      // to ensure maxSize isn't exceeded if already full.
      // For simplicity here, we just add.
      this.mutationOrder.push(key);
    } else {
      // Key exists, update its position in mutationOrder for recency if needed for specific flush orders
      this.mutationOrder = this.mutationOrder.filter((k) => k !== key);
      this.mutationOrder.push(key);
    }
    this.data.set(key, value);
    return `Key "${key}" set in MemTable.`;
  }

  get(key) {
    return this.data.get(key);
  }

  delete(key) {
    // Deleting is like putting a tombstone value
    return this.put(key, TOMBSTONE);
  }

  isFull() {
    return this.data.size >= this.maxSize;
  }

  flush() {
    // Sort data by key before flushing
    const sortedData = Array.from(this.data.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    this.data.clear();
    this.mutationOrder = [];
    return sortedData; // Returns array of [key, value]
  }

  getDataForViz() {
    // Return data sorted by key for visualization
    return Array.from(this.data.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
  }
}
export default MemTable;
