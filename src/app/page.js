"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import LSMTree from "../core/lsm_tree";
import SettingsPanel from "../components/SettingsPanel";
import Controls from "../components/Controls";
import MemTableVisualizer from "../components/MemTableVisualizer";
import LevelVisualizer from "../components/LevelVisualizer";
import LogPanel from "../components/LogPanel";
import PerformanceMetrics from "../components/PerformanceMetrics";
import {
  TOMBSTONE,
  MEMTABLE_DEFAULT_MAX_SIZE,
  L0_DEFAULT_MAX_SSTABLES,
  LEVEL_MAX_SSTABLES_FACTOR,
  SSTABLE_DEFAULT_MAX_ITEMS,
  MAX_LEVELS,
} from "../constants";

const App = () => {
  // Initial configuration for the LSM Tree
  const initialLSMConfig = useMemo(
    () => ({
      memtableMaxSize: MEMTABLE_DEFAULT_MAX_SIZE,
      l0MaxSSTables: L0_DEFAULT_MAX_SSTABLES,
      levelMaxSSTablesFactor: LEVEL_MAX_SSTABLES_FACTOR,
      sstableMaxItems: SSTABLE_DEFAULT_MAX_ITEMS,
      maxLevels: MAX_LEVELS,
    }),
    []
  );

  const [lsmTreeInstance, setLsmTreeInstance] = useState(
    () => new LSMTree(initialLSMConfig)
  );
  const [treeState, setTreeState] = useState(lsmTreeInstance.getState());
  const [isCompacting, setIsCompacting] = useState(false);
  const [readValue, setReadValue] = useState(null); // Stores { value, path }
  const [readPath, setReadPath] = useState([]); // Stores the path array from readValue for highlighting

  // Callback to update UI state from LSMTree instance
  const updateState = useCallback(() => {
    setTreeState(lsmTreeInstance.getState());
  }, [lsmTreeInstance]);

  // Effect to update state if lsmTreeInstance changes (e.g. after reset with new config)
  useEffect(() => {
    updateState();
  }, [lsmTreeInstance, updateState]);

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
    setReadPath(result.path || []); // Update readPath specifically for highlighting
    updateState(); // This will also update logs
  };

  const handleCompact = async (level = 0) => {
    setIsCompacting(true);
    // Small delay to allow UI to update if needed, though compaction is synchronous here
    await new Promise((resolve) => setTimeout(resolve, 50));
    lsmTreeInstance.compact(level);
    updateState();
    setIsCompacting(false);
    setReadValue(null);
    setReadPath([]);
  };

  // Resets the tree with current or new configuration
  const handleResetTree = (newConfigParams) => {
    const configToUse = newConfigParams || lsmTreeInstance.config; // Use provided or existing config
    // Create a new instance to ensure a full reset, or call a more thorough reset on existing
    setLsmTreeInstance(new LSMTree(configToUse));
    // State will be updated by useEffect on lsmTreeInstance change
    setReadValue(null);
    setReadPath([]);
  };

  // Specifically for saving settings from the SettingsPanel
  const handleSaveSettings = (newConfig) => {
    handleResetTree(newConfig); // This will create a new LSMTree instance with the new config
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-gray-800">
            LSM Tree Visualization
          </h1>
          <p className="text-lg text-gray-600">
            Watch how a Log-Structured Merge Tree works interactively.
          </p>
        </header>

        <SettingsPanel
          initialConfig={lsmTreeInstance.config} // Pass current config
          onSave={handleSaveSettings}
          onResetDefault={() => {
            // Reset to hardcoded default values by passing the initialLSMConfig object
            handleSaveSettings(initialLSMConfig);
          }}
        />

        <Controls
          onWrite={handleWrite}
          onRead={handleRead}
          onDelete={handleDelete}
          onCompact={handleCompact} // Default compacts L0
          onResetTree={() => handleResetTree(lsmTreeInstance.config)} // Reset with current config
          isCompacting={isCompacting}
        />

        {treeState.metrics && (
          <PerformanceMetrics metrics={treeState.metrics} />
        )}

        {readValue && (
          <div className="my-4 p-4 bg-yellow-50 border border-yellow-300 rounded-lg shadow animate-fadeIn">
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

        <div className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <h2 className="text-2xl font-semibold text-gray-700 mb-3">
              LSM Tree Structure
            </h2>
            <MemTableVisualizer
              memtableData={treeState.memtable}
              maxSize={treeState.config.memtableMaxSize}
              readPathItem={readPath?.find((p) => p.id === "memtable")}
            />
            {treeState.levels.map(
              (
                levelData,
                idx // Renamed 'level' to 'levelData' to avoid conflict
              ) => (
                <LevelVisualizer
                  key={idx}
                  level={levelData}
                  levelIdx={idx}
                  readPath={readPath}
                />
              )
            )}
          </div>
          <div className="xl:col-span-1">
            <h2 className="text-2xl font-semibold text-gray-700 mb-3">
              Operations Log
            </h2>
            <LogPanel logs={treeState.log} />
          </div>
        </div>

        <footer className="mt-12 text-center text-sm text-gray-500 py-6 border-t border-gray-200">
          <p>LSM Tree Visualization. Vibe coded with &#10084; by human</p>
        </footer>
      </div>
      {/* Basic CSS for fadeIn animation if not using Tailwind's animation directly */}
      <style jsx global>{`
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-in-out;
        }
        @keyframes fadeIn {
          0% {
            opacity: 0;
            transform: translateY(-10px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-pulse {
          animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
};

export default App;
