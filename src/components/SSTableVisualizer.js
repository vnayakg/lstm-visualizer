import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import DataItem from "./DataItem";

const SSTableVisualizer = ({ sstable, readPathItem }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 10); // Stagger animation slightly
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`p-3 border rounded-lg mb-2 shadow-sm relative transition-all duration-500 ease-in-out transform ${
        mounted ? "opacity-100 scale-100" : "opacity-0 scale-95"
      } ${
        readPathItem?.status === "Checking"
          ? "ring-2 ring-yellow-400 animate-pulse"
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
        SSTable:{" "}
        <span className="font-mono text-xs ml-1 mr-1 px-1 bg-gray-200 rounded">
          {sstable.id.substring(sstable.id.length - 5)}
        </span>{" "}
        ({sstable.data.length} items)
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
              key={`${sstable.id}-${key}`}
              itemKey={key}
              itemValue={value}
            />
          ))}
        </div>
      )}
    </div>
  );
};
export default SSTableVisualizer;
