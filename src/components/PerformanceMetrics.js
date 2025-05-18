import React, { useState } from "react";
import { ChevronDown, ChevronRight, BarChart2, HelpCircle } from "lucide-react";
import Tooltip from "./Tooltip";

const PerformanceMetrics = ({ metrics }) => {
  const [isOpen, setIsOpen] = useState(true);

  const metricItems = [
    {
      label: "Logical Writes",
      value: metrics.logicalWrites,
      tip: "Total 'put' or 'delete' operations initiated by the user.",
    },
    {
      label: "Items Written to SSTables",
      value: metrics.itemsWrittenToSSTables,
      tip: "Total number of items (key-value pairs) physically written to SSTable objects (during flush or compaction).",
    },
    {
      label: "Write Amplification (WA)",
      value: metrics.writeAmplification,
      tip: "(Items Written to SSTables) / (Logical Writes). Ideal is 1. Higher values mean more I/O for writes.",
    },
    {
      label: "Logical Reads",
      value: metrics.logicalReads,
      tip: "Total 'get' operations initiated by the user.",
    },
    {
      label: "MemTable Lookups (Read)",
      value: metrics.memtableLookupsForRead,
      tip: "Number of times MemTable was checked during read operations.",
    },
    {
      label: "SSTables Accessed (Read)",
      value: metrics.sstablesAccessedForRead,
      tip: "Total number of SSTables accessed (opened/checked) during read operations.",
    },
    {
      label: "Read Amplification (SSTables)",
      value: metrics.readAmplificationSSTables,
      tip: "(SSTables Accessed) / (Logical Reads). Average SSTables checked per read. Ideal is low.",
    },
  ];

  if (!metrics) return null; // Don't render if metrics aren't available

  return (
    <div className="p-4 bg-white shadow-md rounded-lg mb-6">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left text-xl font-semibold text-gray-700 mb-3 flex items-center"
      >
        {isOpen ? (
          <ChevronDown size={20} className="mr-2" />
        ) : (
          <ChevronRight size={20} className="mr-2" />
        )}
        <BarChart2 size={22} className="mr-2 text-indigo-600" /> Performance
        Metrics
      </button>
      {isOpen && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {metricItems.map((item) => (
            <div
              key={item.label}
              className="p-3 bg-gray-50 border border-gray-200 rounded-md"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-600">
                  {item.label}
                </h4>
                <Tooltip text={item.tip}>
                  <HelpCircle size={14} className="text-gray-400 cursor-help" />
                </Tooltip>
              </div>
              <p className="text-2xl font-semibold text-indigo-600 mt-1">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
export default PerformanceMetrics;
