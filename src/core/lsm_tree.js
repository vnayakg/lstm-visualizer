import MemTable from "./memtable";
import SSTable from "./sstable";
import { generateSSTableId } from "../utils";
import {
  TOMBSTONE,
  MEMTABLE_DEFAULT_MAX_SIZE,
  L0_DEFAULT_MAX_SSTABLES,
  LEVEL_MAX_SSTABLES_FACTOR,
  SSTABLE_DEFAULT_MAX_ITEMS,
  MAX_LEVELS,
} from "../constants";

class LSMTree {
  constructor(config = {}) {
    this.config = {
      memtableMaxSize: config.memtableMaxSize || MEMTABLE_DEFAULT_MAX_SIZE,
      l0MaxSSTables: config.l0MaxSSTables || L0_DEFAULT_MAX_SSTABLES,
      levelMaxSSTablesFactor:
        config.levelMaxSSTablesFactor || LEVEL_MAX_SSTABLES_FACTOR,
      sstableMaxItems: config.sstableMaxItems || SSTABLE_DEFAULT_MAX_ITEMS,
      maxLevels: config.maxLevels || MAX_LEVELS,
    };
    this.memtable = new MemTable(this.config.memtableMaxSize);
    this.levels = Array(this.config.maxLevels)
      .fill(null)
      .map(() => []); // L0, L1, ..., Ln
    this.log = [];
    this.metrics = {
      logicalWrites: 0,
      itemsWrittenToSSTables: 0,
      logicalReads: 0,
      sstablesAccessedForRead: 0,
      memtableLookupsForRead: 0,
    };
    this._addLog("LSM Tree initialized.");
  }

  _addLog(message) {
    this.log.unshift({ text: message, time: new Date().toLocaleTimeString() });
    if (this.log.length > 100) this.log.pop(); // Keep log size manageable
  }

  put(key, value) {
    if (!key) {
      this._addLog("Write failed: Key cannot be empty.");
      return;
    }
    if (this.memtable.isFull()) {
      this._addLog("MemTable is full, attempting to flush first.");
      this.flushMemTable();
    }
    if (this.memtable.isFull()) {
      // Check again after potential flush
      this._addLog(
        "Write failed: MemTable is still full. Compaction might be needed or L0 is at capacity and cannot be compacted further."
      );
      return;
    }

    const logMsg = this.memtable.put(key, value);
    this._addLog(logMsg);
    this.metrics.logicalWrites++;

    if (this.memtable.isFull()) {
      this.flushMemTable(); // This might trigger compactions if L0 gets full
    }
    this.triggerCompactionIfNeeded(); // Check all levels after a put that might have flushed.
  }

  delete(key) {
    if (!key) {
      this._addLog("Delete failed: Key cannot be empty.");
      return;
    }
    if (this.memtable.isFull()) {
      this._addLog("MemTable is full, attempting to flush first.");
      this.flushMemTable();
    }
    if (this.memtable.isFull()) {
      // Check again
      this._addLog(
        "Delete failed: MemTable is still full. Compaction might be needed."
      );
      return;
    }
    const logMsg = this.memtable.delete(key); // Uses put with TOMBSTONE
    this._addLog(logMsg);
    this.metrics.logicalWrites++; // Deletes are also logical writes

    if (this.memtable.isFull()) {
      this.flushMemTable();
    }
    this.triggerCompactionIfNeeded();
  }

  get(key) {
    if (!key) {
      this._addLog("Read failed: Key cannot be empty.");
      return { value: undefined, path: [] };
    }

    let path = []; // To trace the read path for visualization
    this._addLog(`Searching for key "${key}"...`);
    this.metrics.logicalReads++;

    // 1. Check MemTable
    path.push({ component: "MemTable", id: "memtable", status: "Checking" });
    this.metrics.memtableLookupsForRead++;
    let value = this.memtable.get(key);
    if (value !== undefined) {
      if (value === TOMBSTONE) {
        this._addLog(`Key "${key}" found in MemTable as TOMBSTONE.`);
        path[path.length - 1].status = "Found (Tombstone)";
        return { value: TOMBSTONE, path };
      }
      this._addLog(`Key "${key}" found in MemTable. Value: "${value}".`);
      path[path.length - 1].status = "Found";
      return { value, path };
    }
    path[path.length - 1].status = "Not Found";

    // 2. Check SSTables, from L0 to deeper levels
    for (let i = 0; i < this.levels.length; i++) {
      const levelSSTables = this.levels[i];
      // For L0, search newest to oldest (last element to first because new SSTables are pushed)
      // For L1+, tables are non-overlapping, order doesn't strictly matter for correctness of finding the key,
      // but specific search strategies (e.g. using min/max keys) would be used in real systems.
      // Here, we'll search in the order they are stored for L1+ (which should be sorted by minKey).
      const tablesToSearch =
        i === 0 ? [...levelSSTables].reverse() : levelSSTables;

      for (const sstable of tablesToSearch) {
        // Optimization: If L > 0 and key is outside sstable's range, skip.
        if (
          i > 0 &&
          sstable.minKey &&
          sstable.maxKey &&
          (key < sstable.minKey || key > sstable.maxKey)
        ) {
          // path.push({ component: `L${i} SSTable`, id: sstable.id, status: 'Skipped (Out of Range)' });
          continue; // Skip this SSTable
        }

        path.push({
          component: `L${i} SSTable`,
          id: sstable.id,
          status: "Checking",
        });
        this.metrics.sstablesAccessedForRead++;
        value = sstable.get(key); // Assumes sstable.get uses binary search or similar
        if (value !== undefined) {
          if (value === TOMBSTONE) {
            this._addLog(
              `Key "${key}" found in SSTable ${sstable.id} (L${i}) as TOMBSTONE.`
            );
            path[path.length - 1].status = "Found (Tombstone)";
            return { value: TOMBSTONE, path };
          }
          this._addLog(
            `Key "${key}" found in SSTable ${sstable.id} (L${i}). Value: "${value}".`
          );
          path[path.length - 1].status = "Found";
          return { value, path };
        }
        path[path.length - 1].status = "Not Found";
      }
    }

    this._addLog(`Key "${key}" not found in any SSTable.`);
    return { value: undefined, path }; // Key not found anywhere
  }

  flushMemTable() {
    if (this.memtable.data.size === 0) {
      this._addLog("MemTable is empty, nothing to flush.");
      return false; // Indicate no flush happened
    }
    this._addLog("Flushing MemTable to L0...");
    const sstableData = this.memtable.flush(); // Data is already sorted by key
    const newSSTable = new SSTable(generateSSTableId(), 0, sstableData);
    this.levels[0].push(newSSTable); // Add to the end of L0 (newest)
    this._addLog(
      `Flushed MemTable to new SSTable ${newSSTable.id} in L0. Contains ${sstableData.length} items.`
    );
    this.metrics.itemsWrittenToSSTables += sstableData.length;
    return true; // Indicate flush happened
  }

  triggerCompactionIfNeeded() {
    // L0 to L1 compaction
    if (this.levels[0].length > this.config.l0MaxSSTables) {
      this.compact(0); // Compact L0 to L1
    }
    // Higher level compactions (Ln to L(n+1))
    // This is a simplified model. Real LSMs have more sophisticated triggers.
    for (let i = 0; i < this.config.maxLevels - 1; i++) {
      // Iterate up to second to last level
      // Calculate max SSTables for level 'i' based on L0 max and factor
      // This is a very simplified sizing strategy. Real systems are more complex.
      const maxSSTablesInLevel =
        i === 0
          ? this.config.l0MaxSSTables
          : this.config.l0MaxSSTables *
            Math.pow(this.config.levelMaxSSTablesFactor, i);
      if (this.levels[i].length > maxSSTablesInLevel) {
        this.compact(i); // Compact level 'i' to 'i+1'
      }
    }
  }

  compact(levelToCompact) {
    if (levelToCompact >= this.config.maxLevels - 1) {
      this._addLog(
        `Cannot compact L${levelToCompact} as it's the last configured level.`
      );
      return;
    }

    const targetLevel = levelToCompact + 1;
    this._addLog(
      `Attempting compaction from L${levelToCompact} to L${targetLevel}...`
    );

    let tablesToCompactFromSource;
    let overlappingTablesInTarget = [];

    if (levelToCompact === 0) {
      // Compacting L0
      // Select all SSTables from L0 for compaction
      if (
        this.levels[0].length <= this.config.l0MaxSSTables &&
        this.levels[0].length > 0
      ) {
        // If L0 is not over its limit but we were explicitly asked to compact L0
        // (e.g., by user button), we compact all of L0.
        tablesToCompactFromSource = [...this.levels[0]];
        this.levels[0] = []; // Clear L0 as these tables are being compacted
      } else if (this.levels[0].length > this.config.l0MaxSSTables) {
        // Standard L0 compaction: take all tables
        tablesToCompactFromSource = [...this.levels[0]];
        this.levels[0] = [];
      } else {
        this._addLog(
          `L0 has ${this.levels[0].length} tables, not exceeding limit of ${this.config.l0MaxSSTables}. No L0 compaction triggered by threshold.`
        );
        return; // Nothing to compact based on L0 threshold
      }

      this._addLog(
        `Selected ${tablesToCompactFromSource.length} SSTables from L0 for compaction.`
      );

      // Find all tables in L(targetLevel) that overlap with *any* key range from the L0 tables
      for (const l0Table of tablesToCompactFromSource) {
        if (!l0Table.minKey || !l0Table.maxKey) continue; // Skip empty/invalid tables
        for (const targetTable of this.levels[targetLevel]) {
          if (
            targetTable.overlaps(l0Table.minKey, l0Table.maxKey) &&
            !overlappingTablesInTarget.find((t) => t.id === targetTable.id)
          ) {
            overlappingTablesInTarget.push(targetTable);
          }
        }
      }
    } else {
      // Compacting L1 or higher (Ln -> L(n+1))
      // Simplified: Pick the oldest SSTable from levelToCompact (first in array)
      // Real systems have more complex selection (e.g., size-tiered, pick by total size, etc.)
      if (this.levels[levelToCompact].length === 0) {
        this._addLog(`L${levelToCompact} is empty. No compaction needed.`);
        return;
      }
      // For Ln (n>0) compaction, usually a single table (or a few) is chosen.
      // Let's pick the oldest one (at the beginning of the array, assuming new tables are pushed)
      tablesToCompactFromSource = [this.levels[levelToCompact].shift()]; // Take and remove the oldest
      const tableToCompact = tablesToCompactFromSource[0];
      this._addLog(
        `Selected oldest SSTable ${tableToCompact.id} from L${levelToCompact}.`
      );

      // Find overlapping tables in targetLevel
      if (tableToCompact.minKey && tableToCompact.maxKey) {
        for (const targetTable of this.levels[targetLevel]) {
          if (
            targetTable.overlaps(tableToCompact.minKey, tableToCompact.maxKey)
          ) {
            overlappingTablesInTarget.push(targetTable);
          }
        }
      }
    }

    if (tablesToCompactFromSource.length === 0) {
      this._addLog(
        `No tables selected for compaction from L${levelToCompact}. Compaction aborted.`
      );
      // If we shifted a table from Ln but it was empty/invalid, it's already removed.
      return;
    }

    this._addLog(
      `Found ${overlappingTablesInTarget.length} overlapping SSTables in L${targetLevel} to include in merge.`
    );

    // Remove the overlapping tables from targetLevel as they will be replaced by new merged tables
    this.levels[targetLevel] = this.levels[targetLevel].filter(
      (t) => !overlappingTablesInTarget.find((ot) => ot.id === t.id)
    );

    const allTablesToMerge = [
      ...tablesToCompactFromSource,
      ...overlappingTablesInTarget,
    ];
    if (allTablesToMerge.length === 0) {
      this._addLog("No tables to merge in compaction process. Aborting.");
      // Add back tablesToCompactFromSource to their original level if they were removed optimistically
      if (levelToCompact > 0)
        this.levels[levelToCompact].unshift(...tablesToCompactFromSource);
      else this.levels[levelToCompact].push(...tablesToCompactFromSource); // L0 tables are pushed
      return;
    }

    this._addLog(
      `Merging the following SSTables: ${allTablesToMerge
        .map((t) => `${t.id}(L${t.level})`)
        .join(", ")}.`
    );

    // K-way merge logic
    // 1. Collect all key-value pairs from all tables to be merged.
    // 2. Sort them. Newest version of a key wins. Tombstones are respected.
    let mergedDataMap = new Map(); // Use a Map to handle latest version of keys easily

    // Process tables ensuring newer data overwrites older data.
    // Sort tables by level (lower level = newer), then by ID (higher ID = newer, assuming time-based IDs)
    const sortedAllTablesToMerge = [...allTablesToMerge].sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level; // L0 (newer) before L1
      // Assuming generateSSTableId creates sequentially increasing IDs for newer tables
      return b.id.localeCompare(a.id); // Higher ID (newer) first
    });

    for (const table of sortedAllTablesToMerge) {
      for (const [key, value] of table.getDataForViz()) {
        // getDataForViz returns sorted array
        if (!mergedDataMap.has(key)) {
          // Only set if not already set by a newer table (processed earlier)
          mergedDataMap.set(key, value);
        }
      }
    }

    // Convert map to array and sort by key for new SSTables
    // Tombstones are kept at this stage. They are actual data.
    // A "major" compaction might fully remove keys if their latest version is a tombstone
    // and there are no older versions of this key in levels deeper than the tombstone's origin.
    // This simplified compaction propagates tombstones.
    let finalMergedData = Array.from(mergedDataMap.entries())
      .filter(
        ([key, value]) =>
          value !== TOMBSTONE || levelToCompact < this.config.maxLevels - 2
      ) // Basic tombstone cleanup for non-last level compactions
      .sort((a, b) => a[0].localeCompare(b[0]));

    this._addLog(
      `Merged data resulted in ${finalMergedData.length} unique, live keys.`
    );
    this.metrics.itemsWrittenToSSTables += finalMergedData.length; // Count items written to new SSTables

    // Split merged data into new SSTables for the targetLevel, respecting sstableMaxItems
    for (
      let i = 0;
      i < finalMergedData.length;
      i += this.config.sstableMaxItems
    ) {
      const chunk = finalMergedData.slice(i, i + this.config.sstableMaxItems);
      if (chunk.length > 0) {
        const newSSTable = new SSTable(generateSSTableId(), targetLevel, chunk);
        this.levels[targetLevel].push(newSSTable); // Add to target level
        this._addLog(
          `Created new SSTable ${newSSTable.id} in L${targetLevel} with ${chunk.length} items.`
        );
      }
    }

    // SSTables in L1+ should be sorted by their minKey to allow efficient searching/overlap checks
    if (targetLevel > 0) {
      this.levels[targetLevel].sort((a, b) => {
        if (a.minKey === null && b.minKey === null) return 0;
        if (a.minKey === null) return -1; // Empty tables first or last? Convention varies.
        if (b.minKey === null) return 1;
        return a.minKey.localeCompare(b.minKey);
      });
    }

    this._addLog(
      `Compaction from L${levelToCompact} to L${targetLevel} complete.`
    );

    // After compaction, the target level might now be too full, potentially triggering another compaction.
    this.triggerCompactionIfNeeded();
  }

  getMetrics() {
    const wa =
      this.metrics.logicalWrites > 0
        ? this.metrics.itemsWrittenToSSTables / this.metrics.logicalWrites
        : 0;
    // Read amplification: average SSTables accessed per logical read.
    // A more precise RA might consider only reads that go to disk.
    const ra_sstables =
      this.metrics.logicalReads > 0
        ? this.metrics.sstablesAccessedForRead / this.metrics.logicalReads
        : 0;
    // Could also define RA including memtable lookups: (memtableLookups + sstablesAccessed) / logicalReads
    return {
      ...this.metrics,
      writeAmplification: wa.toFixed(2),
      readAmplificationSSTables: ra_sstables.toFixed(2), // Renamed for clarity
    };
  }

  getState() {
    return {
      memtable: this.memtable.getDataForViz(),
      levels: this.levels.map((level) =>
        level.map((sstable) => ({
          id: sstable.id,
          level: sstable.level,
          data: sstable.getDataForViz(),
          minKey: sstable.minKey,
          maxKey: sstable.maxKey,
        }))
      ),
      log: [...this.log], // Return a copy
      config: { ...this.config }, // Return a copy
      metrics: this.getMetrics(),
    };
  }

  reset(newConfigParams) {
    // Re-initialize with new or existing config
    this.config = {
      memtableMaxSize:
        newConfigParams.memtableMaxSize || MEMTABLE_DEFAULT_MAX_SIZE,
      l0MaxSSTables: newConfigParams.l0MaxSSTables || L0_DEFAULT_MAX_SSTABLES,
      levelMaxSSTablesFactor:
        newConfigParams.levelMaxSSTablesFactor || LEVEL_MAX_SSTABLES_FACTOR,
      sstableMaxItems:
        newConfigParams.sstableMaxItems || SSTABLE_DEFAULT_MAX_ITEMS,
      maxLevels: newConfigParams.maxLevels || MAX_LEVELS,
    };
    this.memtable = new MemTable(this.config.memtableMaxSize);
    this.levels = Array(this.config.maxLevels)
      .fill(null)
      .map(() => []);
    this.log = [];
    this.metrics = {
      // Reset metrics
      logicalWrites: 0,
      itemsWrittenToSSTables: 0,
      logicalReads: 0,
      sstablesAccessedForRead: 0,
      memtableLookupsForRead: 0,
    };
    this._addLog("LSM Tree has been reset with new configuration.");
  }
}
export default LSMTree;
