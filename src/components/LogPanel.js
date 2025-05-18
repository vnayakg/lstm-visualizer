import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, Activity } from "lucide-react";

const LogPanel = ({ logs }) => {
  const [isOpen, setIsOpen] = useState(true);
  const logContainerRef = useRef(null);

  useEffect(() => {
    // Auto-scroll to top (most recent log) on new log
    if (isOpen && logContainerRef.current) {
      logContainerRef.current.scrollTop = 0;
    }
  }, [logs, isOpen]); // Rerun when logs or isOpen state changes

  return (
    <div className="bg-gray-800 text-white p-4 rounded-lg shadow-lg">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left font-semibold text-gray-100 mb-2 flex items-center"
      >
        {isOpen ? (
          <ChevronDown size={20} className="mr-1" />
        ) : (
          <ChevronRight size={20} className="mr-1" />
        )}
        <Activity size={18} className="mr-2" /> Activity Log
      </button>
      {isOpen && (
        <div
          ref={logContainerRef}
          className="h-60 overflow-y-auto space-y-1 text-sm font-mono border-t border-gray-700 pt-2"
        >
          {logs.length === 0 && (
            <p className="text-gray-400 italic">No activities yet.</p>
          )}
          {logs.map((log, index) => (
            <div
              key={index}
              className="whitespace-pre-wrap hover:bg-gray-700 px-1 rounded"
            >
              <span className="text-gray-400 select-none">{log.time}</span>:{" "}
              <span className="text-gray-200">{log.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
export default LogPanel;
