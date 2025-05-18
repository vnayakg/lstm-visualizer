import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import DataItem from "./DataItem";

const MemTableVisualizer = ({ memtableData, maxSize, readPathItem }) => {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <div
      className={`p-4 border rounded-lg shadow-sm mb-4 transition-all duration-300 ease-in-out ${
        readPathItem?.status === "Checking"
          ? "ring-2 ring-yellow-400 animate-pulse"
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
            <DataItem key={`mem-${key}`} itemKey={key} itemValue={value} />
          ))}
        </div>
      )}
    </div>
  );
};
export default MemTableVisualizer;
