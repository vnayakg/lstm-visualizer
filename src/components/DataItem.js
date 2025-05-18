import React, { useState, useEffect } from "react";
import { TOMBSTONE } from "../constants";

const DataItem = ({ itemKey, itemValue, highlight }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 10); // Small delay for transition
    return () => clearTimeout(timer);
  }, []);

  const isTombstone = itemValue === TOMBSTONE;

  return (
    <div
      className={`px-2 py-1 border rounded-md text-xs transition-all duration-500 ease-in-out transform ${
        mounted ? "opacity-100 scale-100" : "opacity-0 scale-90"
      } ${
        isTombstone
          ? "border-red-400 bg-red-100"
          : "border-gray-300 bg-gray-100"
      } ${highlight ? "ring-2 ring-blue-500 shadow-lg" : ""}`}
    >
      <span className="font-semibold text-blue-700 break-all">{itemKey}:</span>
      <span
        className={`${
          isTombstone ? "text-red-700 italic" : "text-gray-700"
        } break-all`}
      >
        {isTombstone ? " (TOMBSTONE)" : ` ${itemValue}`}
      </span>
    </div>
  );
};
export default DataItem;
