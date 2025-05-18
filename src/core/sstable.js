import { sstableGet } from "../utils";

class SSTable {
  constructor(id, level, data = []) {
    // data is an array of [key, value] sorted by key
    this.id = id;
    this.level = level;
    this.data = data; // Data is expected to be sorted by key
    this.minKey = data.length > 0 ? data[0][0] : null;
    this.maxKey = data.length > 0 ? data[data.length - 1][0] : null;
  }

  get(key) {
    return sstableGet(this.data, key);
  }

  getDataForViz() {
    return this.data;
  }

  getKeyRange() {
    return { minKey: this.minKey, maxKey: this.maxKey };
  }

  // Check if this SSTable's key range overlaps with a given key range
  overlaps(minKey, maxKey) {
    if (!this.minKey || !this.maxKey || !minKey || !maxKey) return false; // No overlap if any range is undefined
    // Overlap exists if one range's start is before the other's end, AND one range's end is after the other's start.
    return this.minKey <= maxKey && this.maxKey >= minKey;
  }
}
export default SSTable;
