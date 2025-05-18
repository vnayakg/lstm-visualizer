import React, { useState, useEffect } from "react";
import {
  Settings as SettingsIcon,
  ChevronDown,
  ChevronRight,
  HelpCircle,
} from "lucide-react";
import Tooltip from "./Tooltip";
import {
  MEMTABLE_DEFAULT_MAX_SIZE,
  L0_DEFAULT_MAX_SSTABLES,
  LEVEL_MAX_SSTABLES_FACTOR,
  SSTABLE_DEFAULT_MAX_ITEMS,
  MAX_LEVELS,
} from "../constants";

const SettingsPanel = ({ initialConfig, onSave, onResetDefault }) => {
  const [config, setConfig] = useState(initialConfig);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setConfig(initialConfig);
  }, [initialConfig]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    // Ensure positive integers, provide a default if parsing fails or value is too low
    const parsedValue = parseInt(value, 10);
    setConfig((prev) => ({
      ...prev,
      [name]: parsedValue > 0 ? parsedValue : 1,
    }));
  };

  const handleSave = () => {
    onSave(config);
    setIsOpen(false);
  };

  const handleResetDefault = () => {
    const defaultConfigValues = {
      memtableMaxSize: MEMTABLE_DEFAULT_MAX_SIZE,
      l0MaxSSTables: L0_DEFAULT_MAX_SSTABLES,
      levelMaxSSTablesFactor: LEVEL_MAX_SSTABLES_FACTOR,
      sstableMaxItems: SSTABLE_DEFAULT_MAX_ITEMS,
      maxLevels: MAX_LEVELS,
    };
    setConfig(defaultConfigValues);
    onSave(defaultConfigValues); // Save and apply defaults
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
                tip: "Multiplier for max tables in next level (approx). Ln_max = L0_max * factor^(n-1) for L1+",
              },
              {
                name: "sstableMaxItems",
                label: "SSTable Max Items",
                tip: "Max items per SSTable created during compaction.",
              },
              {
                name: "maxLevels",
                label: "Max Levels",
                tip: "Total number of levels (L0 to L(N-1)). Min 2.",
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
                  min="1" // MaxLevels min should be 2 if there's L0 and L1
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
export default SettingsPanel;
