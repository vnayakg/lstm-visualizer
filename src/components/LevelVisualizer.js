import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import SSTableVisualizer from "./SSTableVisualizer";

const LevelVisualizer = ({ level, levelIdx, readPath }) => {
  const [isOpen, setIsOpen] = useState(true);
  // Define a broader range of distinct colors for levels
  const levelColors = [
    "bg-purple-100 border-purple-300", // L0
    "bg-indigo-100 border-indigo-300", // L1
    "bg-sky-100 border-sky-300", // L2
    "bg-teal-100 border-teal-300", // L3
    "bg-emerald-100 border-emerald-300", // L4
    "bg-lime-100 border-lime-300", // L5
    "bg-amber-100 border-amber-300", // L6
  ];
  const levelColor = levelColors[levelIdx % levelColors.length]; // Cycle through colors if more levels than defined

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
export default LevelVisualizer;
