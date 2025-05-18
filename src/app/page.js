"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  Trash2,
  Search,
  Edit3,
  Settings as SettingsIcon,
  RotateCcw,
  Zap,
  HelpCircle,
} from "lucide-react";

// --- Constants ---
const MEMTABLE_DEFAULT_MAX_SIZE = 5;
const L0_DEFAULT_MAX_SSTABLES = 3; // Max SSTables in L0 before compacting to L1
const LEVEL_MAX_SSTABLES_FACTOR = 4; // Ln can hold LEVEL_MAX_SSTABLES_FACTOR * L(n-1) max SSTables (approx)
const SSTABLE_DEFAULT_MAX_ITEMS = 10; // Max items per SSTable after compaction
const TOMBSTONE = "__DELETED__";

// --- Utility Functions ---
const generateSSTableId = () =>
  `sstable-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

// Binary search for SSTable (assumes data is sorted by key)
const sstableGet = (data, key) => {
  let low = 0;
  let high = data.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (data[mid][0] === key) {
      return data[mid][1];
    } else if (data[mid][0] < key) {
      low = mid + 1;
    } else {
      high = mid + 1; // Correction: should be high = mid - 1 for standard binary search
      // However, for finding *any* instance or for range scans, this might be part of a different logic.
      // For exact key match, it should be mid - 1. Let's assume it's intended for exact match.
      high = mid - 1;
    }
  }
  return undefined; // Key not found
};

// --- LSM Tree Core Logic ---

class MemTable {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.data = new Map(); // Using Map for O(1) average time complexity for get/set
    this.mutationOrder = []; // To maintain insertion order for flushing if keys are identical (though Map overwrites)
  }

  put(key, value) {
    if (!this.data.has(key)) {
      if (this.mutationOrder.length >= this.maxSize) {
        // This check should ideally be before adding, to prevent exceeding maxSize.
        // Or, isFull() should be checked before calling put by the LSMTree.
      }
      this.mutationOrder.push(key);
    } else {
      // Key already exists, update its position in mutationOrder for flushing recency
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
    return Array.from(this.data.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
  }
}

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
    // Simple linear scan for this visualization, can be optimized with binary search
    // const item = this.data.find(kv => kv[0] === key);
    // return item ? item[1] : undefined;
    return sstableGet(this.data, key);
  }

  getDataForViz() {
    return this.data;
  }

  getKeyRange() {
    return { minKey: this.minKey, maxKey: this.maxKey };
  }

  overlaps(minKey, maxKey) {
    if (!this.minKey || !this.maxKey || !minKey || !maxKey) return false; // No overlap if any range is undefined
    return this.minKey <= maxKey && this.maxKey >= minKey;
  }
}

class LSMTree {
  constructor(config) {
    this.config = {
      memtableMaxSize: MEMTABLE_DEFAULT_MAX_SIZE,
      l0MaxSSTables: L0_DEFAULT_MAX_SSTABLES,
      levelMaxSSTablesFactor: LEVEL_MAX_SSTABLES_FACTOR,
      sstableMaxItems: SSTABLE_DEFAULT_MAX_ITEMS,
      maxLevels: 5, // Max number of levels
      ...config,
    };
    this.memtable = new MemTable(this.config.memtableMaxSize);
    this.levels = Array(this.config.maxLevels)
      .fill(null)
      .map(() => []); // L0, L1, ..., Ln
    this.log = [];
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
      // After flush, if L0 needs compaction, it should be handled.
      // The compaction check is usually done after adding the new SSTable to L0.
    }
    // If still full after an attempted flush (e.g. compaction failed or didn't free space for L0)
    if (this.memtable.isFull()) {
      this._addLog(
        "Write failed: MemTable is still full after attempting flush. Compaction might be needed or L0 is at capacity and cannot be compacted further."
      );
      return;
    }

    const logMsg = this.memtable.put(key, value);
    this._addLog(logMsg);

    if (this.memtable.isFull()) {
      this.flushMemTable();
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
      this._addLog(
        "Delete failed: MemTable is still full. Compaction might be needed."
      );
      return;
    }
    const logMsg = this.memtable.delete(key);
    this._addLog(logMsg);
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

    let path = [];
    this._addLog(`Searching for key "${key}"...`);
    path.push({ component: "MemTable", id: "memtable", status: "Checking" });
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

    for (let i = 0; i < this.levels.length; i++) {
      const levelSSTables = this.levels[i];
      // For L0, search newest to oldest (last element to first)
      // For L1+, tables are non-overlapping, order doesn't strictly matter for correctness but can for perf.
      // Here, we'll search in the order they are stored.
      const tablesToSearch =
        i === 0 ? [...levelSSTables].reverse() : levelSSTables;

      for (const sstable of tablesToSearch) {
        path.push({
          component: `L${i} SSTable`,
          id: sstable.id,
          status: "Checking",
        });
        value = sstable.get(key);
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
    return { value: undefined, path };
  }

  flushMemTable() {
    if (this.memtable.data.size === 0) {
      this._addLog("MemTable is empty, nothing to flush.");
      return;
    }
    this._addLog("MemTable is full or flush triggered. Flushing to L0...");
    const sstableData = this.memtable.flush();
    const newSSTable = new SSTable(generateSSTableId(), 0, sstableData);
    this.levels[0].push(newSSTable); // Add to the end (newest)
    this._addLog(
      `Flushed MemTable to new SSTable ${newSSTable.id} in L0. Contains ${sstableData.length} items.`
    );
  }

  triggerCompactionIfNeeded() {
    // L0 to L1 compaction
    if (this.levels[0].length > this.config.l0MaxSSTables) {
      this.compact(0);
    }
    // Higher level compactions
    for (let i = 0; i < this.config.maxLevels - 1; i++) {
      const maxSSTablesInLevel =
        i === 0
          ? this.config.l0MaxSSTables
          : this.config.l0MaxSSTables *
            Math.pow(this.config.levelMaxSSTablesFactor, i); // Simplified sizing
      if (this.levels[i].length > maxSSTablesInLevel) {
        this.compact(i); // Compact this level to the next
      }
    }
  }

  compact(levelToCompact) {
    if (levelToCompact >= this.config.maxLevels - 1) {
      this._addLog(`Cannot compact L${levelToCompact} as it's the last level.`);
      return;
    }

    const targetLevel = levelToCompact + 1;
    this._addLog(
      `Starting compaction from L${levelToCompact} to L${targetLevel}...`
    );

    let tablesToCompact;
    let overlappingTablesInTargetLevel = [];

    if (levelToCompact === 0) {
      // For L0, compact all SSTables in L0
      tablesToCompact = [...this.levels[0]];
      this.levels[0] = []; // Clear L0
      // Find all tables in L1 that overlap with ANY table from L0
      for (const l0Table of tablesToCompact) {
        if (!l0Table.minKey || !l0Table.maxKey) continue;
        for (const l1Table of this.levels[targetLevel]) {
          if (
            l1Table.overlaps(l0Table.minKey, l0Table.maxKey) &&
            !overlappingTablesInTargetLevel.find((t) => t.id === l1Table.id)
          ) {
            overlappingTablesInTargetLevel.push(l1Table);
          }
        }
      }
      this._addLog(`Selected ${tablesToCompact.length} SSTables from L0.`);
    } else {
      // For L1+ compactions, pick the oldest SSTable (FIFO - first one in the array)
      // This is a simplification. Real systems might use other strategies (size-tiered, etc.)
      if (this.levels[levelToCompact].length === 0) {
        this._addLog(`L${levelToCompact} is empty. No compaction needed.`);
        return;
      }
      tablesToCompact = [this.levels[levelToCompact].shift()]; // Remove oldest from current level
      const tableToCompact = tablesToCompact[0];
      if (!tableToCompact.minKey || !tableToCompact.maxKey) {
        this._addLog(
          `Skipping compaction for ${tableToCompact.id} as it has no key range (empty).`
        );
        // Potentially add it back or handle empty tables. For now, it's removed.
        return;
      }
      // Find overlapping tables in targetLevel
      for (const targetTable of this.levels[targetLevel]) {
        if (
          targetTable.overlaps(tableToCompact.minKey, tableToCompact.maxKey)
        ) {
          overlappingTablesInTargetLevel.push(targetTable);
        }
      }
      this._addLog(
        `Selected SSTable ${tableToCompact.id} from L${levelToCompact}.`
      );
    }

    if (tablesToCompact.length === 0) {
      this._addLog(
        `No tables selected for compaction from L${levelToCompact}.`
      );
      return;
    }

    this._addLog(
      `Found ${overlappingTablesInTargetLevel.length} overlapping SSTables in L${targetLevel}.`
    );

    // Remove overlapping tables from targetLevel as they will be replaced by new merged tables
    this.levels[targetLevel] = this.levels[targetLevel].filter(
      (t) => !overlappingTablesInTargetLevel.find((ot) => ot.id === t.id)
    );

    const allTablesToMerge = [
      ...tablesToCompact,
      ...overlappingTablesInTargetLevel,
    ];
    if (allTablesToMerge.length === 0) {
      this._addLog("No tables to merge in compaction.");
      return;
    }

    this._addLog(`Merging ${allTablesToMerge.map((t) => t.id).join(", ")}.`);

    // Merge sort logic
    let mergedDataMap = new Map();
    // Process tables from higher levels (older data) first, then lower levels (newer data)
    // Within L0, process older SSTables first (if IDs or timestamps allow such sorting)
    // For simplicity, we rely on the order of tablesToCompact and overlappingTablesInTargetLevel
    // and then the inherent order of items within each SSTable.
    // The key is that when a key is encountered, the *last* value written for it (from the newest table) wins.

    // To ensure newest wins: iterate tables from newest to oldest.
    // L0 tables are generally newer than L1 tables.
    // Within L0, if flushed sequentially, last table in `this.levels[0]` before clearing was newest.
    // `tablesToCompact` for L0 contains them. If we want newest first for map setting:
    const sortedAllTablesToMerge = [...allTablesToMerge].sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level; // Lower level number (L0) is newer
      // If same level, could use ID if it implies age. generateSSTableId uses Date.now().
      // So numerically larger ID is newer. Sort descending by ID to process newer first.
      return b.id.localeCompare(a.id);
    });

    for (const table of sortedAllTablesToMerge) {
      for (const [key, value] of table.getDataForViz()) {
        // getDataForViz returns sorted array
        if (!mergedDataMap.has(key)) {
          // Only set if not already set by a newer table
          mergedDataMap.set(key, value);
        }
      }
    }

    // Filter out tombstones that have no corresponding older data
    // This step is tricky. A tombstone should only be removed if it has "done its job"
    // i.e., all older versions of the key in levels below the tombstone's original level are gone.
    // For now, a simple approach: keep tombstones, they will naturally override older data.
    // A more advanced compaction would remove a key entirely if its latest version is a tombstone
    // AND there are no versions of this key in deeper levels.
    // For this visualization, we'll keep tombstones to show they exist.
    // They will be removed if a newer value for the same key is written.

    let finalMergedData = Array.from(mergedDataMap.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    // Filter out tombstones ONLY IF there's no older version of the key in deeper levels.
    // This is complex. For now, we keep all latest versions, including tombstones.
    // A true major compaction would fully remove key if latest is tombstone and no older versions exist.
    // We are doing a level-by-level merge, so tombstones propagate.

    this._addLog(`Merged data has ${finalMergedData.length} unique keys.`);

    // Split merged data into new SSTables for the targetLevel
    for (
      let i = 0;
      i < finalMergedData.length;
      i += this.config.sstableMaxItems
    ) {
      const chunk = finalMergedData.slice(i, i + this.config.sstableMaxItems);
      if (chunk.length > 0) {
        const newSSTable = new SSTable(generateSSTableId(), targetLevel, chunk);
        this.levels[targetLevel].push(newSSTable);
        this._addLog(
          `Created new SSTable ${newSSTable.id} in L${targetLevel} with ${chunk.length} items.`
        );
      }
    }

    // Sort SSTables in target level by minKey (important for L1+ for efficient range scans/overlap checks)
    if (targetLevel > 0) {
      this.levels[targetLevel].sort((a, b) => {
        if (a.minKey === null) return -1;
        if (b.minKey === null) return 1;
        return a.minKey.localeCompare(b.minKey);
      });
    }

    this._addLog(
      `Compaction from L${levelToCompact} to L${targetLevel} complete.`
    );

    // Potentially trigger further compaction if targetLevel is now too full
    this.triggerCompactionIfNeeded();
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
      log: [...this.log],
      config: { ...this.config },
    };
  }

  reset(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.memtable = new MemTable(this.config.memtableMaxSize);
    this.levels = Array(this.config.maxLevels)
      .fill(null)
      .map(() => []);
    this.log = [];
    this._addLog("LSM Tree has been reset.");
  }
}

// --- React Components ---

const Tooltip = ({ text, children }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div className="absolute z-10 bottom-full mb-2 left-1/2 transform -translate-x-1/2 px-3 py-2 text-sm font-medium text-white bg-gray-700 rounded-lg shadow-sm whitespace-nowrap">
          {text}
        </div>
      )}
    </div>
  );
};

const SettingsPanel = ({ initialConfig, onSave, onResetDefault }) => {
  const [config, setConfig] = useState(initialConfig);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setConfig(initialConfig);
  }, [initialConfig]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setConfig((prev) => ({ ...prev, [name]: parseInt(value, 10) || 0 }));
  };

  const handleSave = () => {
    onSave(config);
    setIsOpen(false);
  };

  const handleResetDefault = () => {
    const defaultConfig = {
      memtableMaxSize: MEMTABLE_DEFAULT_MAX_SIZE,
      l0MaxSSTables: L0_DEFAULT_MAX_SSTABLES,
      levelMaxSSTablesFactor: LEVEL_MAX_SSTABLES_FACTOR,
      sstableMaxItems: SSTABLE_DEFAULT_MAX_ITEMS,
      maxLevels: 5,
    };
    setConfig(defaultConfig);
    onSave(defaultConfig); // Also save and apply
    setIsOpen(false);
  };

  return (
    <div className="mb-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center transition-colors"
      >
        <SettingsIcon size={20} className="mr-2" />
        Settings
        {isOpen ? (
          <ChevronDown size={20} className="ml-1" />
        ) : (
          <ChevronRight size={20} className="ml-1" />
        )}
      </button>
      {isOpen && (
        <div className="mt-2 p-4 border border-gray-300 rounded-lg bg-gray-50 shadow-sm">
          <h3 className="text-lg font-semibold mb-3 text-gray-700">
            LSM Tree Configuration
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                name: "memtableMaxSize",
                label: "MemTable Max Size",
                tip: "Max items in MemTable before flush.",
              },
              {
                name: "l0MaxSSTables",
                label: "L0 Max SSTables",
                tip: "Max SSTables in L0 before compaction to L1.",
              },
              {
                name: "levelMaxSSTablesFactor",
                label: "Level Max SSTables Factor",
                tip: "Multiplier for max tables in next level (approx). Ln_max = L0_max * factor^n",
              },
              {
                name: "sstableMaxItems",
                label: "SSTable Max Items",
                tip: "Max items per SSTable created during compaction.",
              },
              {
                name: "maxLevels",
                label: "Max Levels",
                tip: "Total number of levels (L0 to L(n-1)).",
              },
            ].map((item) => (
              <div key={item.name} className="flex flex-col">
                <label
                  htmlFor={item.name}
                  className="text-sm font-medium text-gray-600 mb-1 flex items-center"
                >
                  {item.label}
                  <Tooltip text={item.tip}>
                    <HelpCircle
                      size={14}
                      className="ml-1 text-gray-400 cursor-help"
                    />
                  </Tooltip>
                </label>
                <input
                  type="number"
                  id={item.name}
                  name={item.name}
                  value={config[item.name]}
                  onChange={handleChange}
                  min="1"
                  className="p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-700"
                />
              </div>
            ))}
          </div>
          <div className="mt-4 flex space-x-2">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
            >
              Save & Apply
            </button>
            <button
              onClick={handleResetDefault}
              className="px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 transition-colors"
            >
              Reset to Defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const Controls = ({
  onWrite,
  onRead,
  onDelete,
  onCompact,
  onResetTree,
  isCompacting,
}) => {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [readKey, setReadKey] = useState("");

  const handleWrite = () => {
    if (key) {
      onWrite(key, value);
      setKey("");
      setValue("");
    } else {
      alert("Key cannot be empty for write.");
    }
  };

  const handleDelete = () => {
    if (key) {
      onDelete(key);
      setKey("");
      setValue("");
    } else {
      alert("Key cannot be empty for delete.");
    }
  };

  const handleRead = () => {
    if (readKey) {
      onRead(readKey);
    } else {
      alert("Key cannot be empty for read.");
    }
  };

  return (
    <div className="p-4 bg-white shadow-md rounded-lg mb-6">
      <h2 className="text-xl font-semibold mb-4 text-gray-700">Controls</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
        {/* Write/Delete Section */}
        <div className="space-y-3 p-3 border border-gray-200 rounded-md bg-gray-50">
          <h3 className="font-medium text-gray-600">Write / Delete Data</h3>
          <div>
            <label
              htmlFor="key"
              className="block text-sm font-medium text-gray-700"
            >
              Key:
            </label>
            <input
              type="text"
              id="key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Enter key"
              className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-gray-700"
            />
          </div>
          <div>
            <label
              htmlFor="value"
              className="block text-sm font-medium text-gray-700"
            >
              Value (optional for Delete):
            </label>
            <input
              type="text"
              id="value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter value"
              className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-gray-700"
            />
          </div>
          <div className="flex space-x-2">
            <button
              onClick={handleWrite}
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center justify-center transition-colors"
            >
              <Edit3 size={18} className="mr-2" /> Write
            </button>
            <button
              onClick={handleDelete}
              className="flex-1 px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 flex items-center justify-center transition-colors"
            >
              <Trash2 size={18} className="mr-2" /> Delete
            </button>
          </div>
        </div>

        {/* Read Section */}
        <div className="space-y-3 p-3 border border-gray-200 rounded-md bg-gray-50">
          <h3 className="font-medium text-gray-600">Read Data</h3>
          <div>
            <label
              htmlFor="readKey"
              className="block text-sm font-medium text-gray-700"
            >
              Key to Read:
            </label>
            <input
              type="text"
              id="readKey"
              value={readKey}
              onChange={(e) => setReadKey(e.target.value)}
              placeholder="Enter key to read"
              className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-gray-700"
            />
          </div>
          <button
            onClick={handleRead}
            className="w-full px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 flex items-center justify-center transition-colors"
          >
            <Search size={18} className="mr-2" /> Read
          </button>
        </div>
      </div>
      {/* Actions Section */}
      <div className="mt-4 pt-4 border-t border-gray-200 flex space-x-2">
        <button
          onClick={() => onCompact(0)}
          disabled={isCompacting}
          className="px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 disabled:bg-gray-400 flex items-center justify-center transition-colors"
        >
          <Zap size={18} className="mr-2" /> Trigger L0 Compaction
        </button>
        <button
          onClick={onResetTree}
          className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 flex items-center justify-center transition-colors"
        >
          <RotateCcw size={18} className="mr-2" /> Reset Tree
        </button>
      </div>
    </div>
  );
};

const DataItem = ({ itemKey, itemValue, isTombstone, highlight }) => (
  <div
    className={`px-2 py-1 border ${
      isTombstone ? "border-red-400 bg-red-100" : "border-gray-300 bg-gray-100"
    } rounded-md text-xs ${highlight ? "ring-2 ring-blue-500" : ""}`}
  >
    <span className="font-semibold text-blue-700">{itemKey}:</span>
    <span
      className={`${isTombstone ? "text-red-700 italic" : "text-gray-700"}`}
    >
      {isTombstone ? " (TOMBSTONE)" : ` ${itemValue}`}
    </span>
  </div>
);

const MemTableVisualizer = ({ memtableData, maxSize, readPathItem }) => {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <div
      className={`p-4 border rounded-lg shadow-sm mb-4 ${
        readPathItem?.status === "Checking"
          ? "ring-2 ring-yellow-400"
          : readPathItem?.status?.startsWith("Found")
          ? "ring-2 ring-green-400"
          : "border-blue-300"
      } bg-blue-50`}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left font-semibold text-blue-700 mb-2 flex items-center"
      >
        {isOpen ? (
          <ChevronDown size={20} className="mr-1" />
        ) : (
          <ChevronRight size={20} className="mr-1" />
        )}
        MemTable (Size: {memtableData.length} / {maxSize})
        {readPathItem && (
          <span
            className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
              readPathItem.status === "Found"
                ? "bg-green-200 text-green-800"
                : readPathItem.status === "Found (Tombstone)"
                ? "bg-red-200 text-red-800"
                : readPathItem.status === "Checking"
                ? "bg-yellow-200 text-yellow-800"
                : "bg-gray-200 text-gray-800"
            }`}
          >
            {readPathItem.status}
          </span>
        )}
      </button>
      {isOpen && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {memtableData.length === 0 && (
            <p className="text-sm text-gray-500 italic col-span-full">Empty</p>
          )}
          {memtableData.map(([key, value]) => (
            <DataItem
              key={key}
              itemKey={key}
              itemValue={value}
              isTombstone={value === TOMBSTONE}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const SSTableVisualizer = ({ sstable, readPathItem }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div
      className={`p-3 border rounded-lg mb-2 shadow-sm relative ${
        readPathItem?.status === "Checking"
          ? "ring-2 ring-yellow-400"
          : readPathItem?.status?.startsWith("Found")
          ? "ring-2 ring-green-400"
          : "border-gray-300"
      } bg-gray-50`}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left text-sm font-medium text-gray-700 mb-1 flex items-center"
      >
        {isOpen ? (
          <ChevronDown size={18} className="mr-1" />
        ) : (
          <ChevronRight size={18} className="mr-1" />
        )}
        SSTable: {sstable.id.substring(sstable.id.length - 5)} (
        {sstable.data.length} items)
        {readPathItem && (
          <span
            className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
              readPathItem.status === "Found"
                ? "bg-green-200 text-green-800"
                : readPathItem.status === "Found (Tombstone)"
                ? "bg-red-200 text-red-800"
                : readPathItem.status === "Checking"
                ? "bg-yellow-200 text-yellow-800"
                : "bg-gray-200 text-gray-800"
            }`}
          >
            {readPathItem.status}
          </span>
        )}
      </button>
      {sstable.minKey && sstable.maxKey && (
        <div className="text-xs text-gray-500 mb-1 ml-5">
          Range: [{sstable.minKey} - {sstable.maxKey}]
        </div>
      )}
      {isOpen && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1 pl-2">
          {sstable.data.length === 0 && (
            <p className="text-xs text-gray-400 italic col-span-full">Empty</p>
          )}
          {sstable.data.map(([key, value]) => (
            <DataItem
              key={key}
              itemKey={key}
              itemValue={value}
              isTombstone={value === TOMBSTONE}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const LevelVisualizer = ({ level, levelIdx, readPath }) => {
  const [isOpen, setIsOpen] = useState(true);
  const levelColor =
    levelIdx === 0
      ? "bg-purple-100 border-purple-300"
      : `bg-indigo-${100 + levelIdx * 100} border-indigo-${
          300 + levelIdx * 100
        }`;

  return (
    <div className={`p-3 border rounded-lg mb-3 shadow ${levelColor}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left text-md font-semibold text-gray-800 mb-2 flex items-center"
      >
        {isOpen ? (
          <ChevronDown size={20} className="mr-1" />
        ) : (
          <ChevronRight size={20} className="mr-1" />
        )}
        Level {levelIdx} ({level.length} SSTables)
      </button>
      {isOpen &&
        (level.length === 0 ? (
          <p className="text-sm text-gray-500 italic ml-5">Empty</p>
        ) : (
          <div className="space-y-2">
            {level.map((sstable) => (
              <SSTableVisualizer
                key={sstable.id}
                sstable={sstable}
                readPathItem={readPath?.find((p) => p.id === sstable.id)}
              />
            ))}
          </div>
        ))}
    </div>
  );
};

const LogPanel = ({ logs }) => {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <div className="mt-6 bg-gray-800 text-white p-4 rounded-lg shadow-lg">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left font-semibold text-gray-100 mb-2 flex items-center"
      >
        {isOpen ? (
          <ChevronDown size={20} className="mr-1" />
        ) : (
          <ChevronRight size={20} className="mr-1" />
        )}
        Activity Log
      </button>
      {isOpen && (
        <div className="h-48 overflow-y-auto space-y-1 text-sm font-mono">
          {logs.map((log, index) => (
            <div key={index} className="whitespace-pre-wrap">
              <span className="text-gray-400">{log.time}</span>:{" "}
              <span className="text-gray-200">{log.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const App = () => {
  const [lsmTreeInstance, setLsmTreeInstance] = useState(() => new LSMTree({}));
  const [treeState, setTreeState] = useState(lsmTreeInstance.getState());
  const [isCompacting, setIsCompacting] = useState(false);
  const [readValue, setReadValue] = useState(null);
  const [readPath, setReadPath] = useState([]); // For highlighting search path

  const updateState = useCallback(() => {
    setTreeState(lsmTreeInstance.getState());
  }, [lsmTreeInstance]);

  const handleWrite = (key, value) => {
    lsmTreeInstance.put(key, value);
    updateState();
    setReadValue(null);
    setReadPath([]);
  };

  const handleDelete = (key) => {
    lsmTreeInstance.delete(key);
    updateState();
    setReadValue(null);
    setReadPath([]);
  };

  const handleRead = (key) => {
    const result = lsmTreeInstance.get(key);
    setReadValue(result);
    setReadPath(result.path || []); // Store the path
    updateState(); // Logs will be updated
  };

  const handleCompact = async (level = 0) => {
    // Make it async for potential future animation delays
    setIsCompacting(true);
    lsmTreeInstance.compact(level); // Trigger compaction for a specific level
    updateState();
    setIsCompacting(false);
    setReadValue(null);
    setReadPath([]);
  };

  const handleResetTree = (newConfig) => {
    const conf = newConfig || lsmTreeInstance.config; // Use current config if not overridden by settings save
    lsmTreeInstance.reset(conf);
    updateState();
    setReadValue(null);
    setReadPath([]);
  };

  const handleSaveSettings = (newConfig) => {
    lsmTreeInstance.reset(newConfig); // Reset with new config
    updateState();
    setReadValue(null);
    setReadPath([]);
  };

  const initialLSMConfig = useMemo(
    () => ({
      memtableMaxSize: MEMTABLE_DEFAULT_MAX_SIZE,
      l0MaxSSTables: L0_DEFAULT_MAX_SSTABLES,
      levelMaxSSTablesFactor: LEVEL_MAX_SSTABLES_FACTOR,
      sstableMaxItems: SSTABLE_DEFAULT_MAX_ITEMS,
      maxLevels: 5,
    }),
    []
  );

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-gray-800">
            LSM Tree Visualization
          </h1>
          <p className="text-lg text-gray-600">
            Watch how a Log-Structured Merge Tree works interactively.
          </p>
        </header>

        <SettingsPanel
          initialConfig={lsmTreeInstance.config}
          onSave={handleSaveSettings}
          onResetDefault={() => {
            handleSaveSettings(initialLSMConfig); // Pass the default config object
          }}
        />

        <Controls
          onWrite={handleWrite}
          onRead={handleRead}
          onDelete={handleDelete}
          onCompact={handleCompact}
          onResetTree={() => handleResetTree()} // Simple reset without config change from button
          isCompacting={isCompacting}
        />

        {readValue && (
          <div className="my-4 p-4 bg-yellow-50 border border-yellow-300 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-yellow-800">
              Read Result:
            </h3>
            {readValue.value === undefined && (
              <p className="text-yellow-700">Key not found.</p>
            )}
            {readValue.value === TOMBSTONE && (
              <p className="text-red-700">
                Key found: Marked as DELETED (TOMBSTONE).
              </p>
            )}
            {readValue.value !== undefined && readValue.value !== TOMBSTONE && (
              <p className="text-yellow-700">
                Key found:{" "}
                <span className="font-bold">
                  {JSON.stringify(readValue.value)}
                </span>
              </p>
            )}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <h2 className="text-2xl font-semibold text-gray-700 mb-3">
              LSM Tree Structure
            </h2>
            <MemTableVisualizer
              memtableData={treeState.memtable}
              maxSize={treeState.config.memtableMaxSize}
              readPathItem={readPath?.find((p) => p.id === "memtable")}
            />
            {treeState.levels.map((level, idx) => (
              <LevelVisualizer
                key={idx}
                level={level}
                levelIdx={idx}
                readPath={readPath}
              />
            ))}
          </div>
          <div className="lg:col-span-1">
            <h2 className="text-2xl font-semibold text-gray-700 mb-3">
              Operations Log
            </h2>
            <LogPanel logs={treeState.log} />
          </div>
        </div>

        <footer className="mt-12 text-center text-sm text-gray-500">
          <p>LSM Tree Visualization vibe coded by Human</p>
        </footer>
      </div>
    </div>
  );
};

export default App;
