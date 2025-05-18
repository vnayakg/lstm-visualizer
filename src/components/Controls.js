import React, { useState } from "react";
import { Trash2, Search, Edit3, Zap, RotateCcw } from "lucide-react";

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
    if (key.trim()) {
      onWrite(key.trim(), value); // Trim key
      setKey("");
      setValue("");
    } else {
      alert("Key cannot be empty for write.");
    }
  };

  const handleDelete = () => {
    if (key.trim()) {
      onDelete(key.trim()); // Trim key
      setKey("");
      setValue("");
    } else {
      alert("Key cannot be empty for delete.");
    }
  };

  const handleRead = () => {
    if (readKey.trim()) {
      onRead(readKey.trim()); // Trim key
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
      <div className="mt-4 pt-4 border-t border-gray-200 flex flex-wrap gap-2">
        {" "}
        {/* Use flex-wrap and gap for better responsiveness */}
        <button
          onClick={() => onCompact(0)}
          disabled={isCompacting}
          className="px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 disabled:bg-gray-400 flex items-center justify-center transition-colors"
        >
          <Zap size={18} className="mr-2" /> Trigger L0 Compaction
        </button>
        {/* Add button to compact any level later if needed */}
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
export default Controls;
