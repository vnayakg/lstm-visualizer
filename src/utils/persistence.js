// Constants for localStorage keys
const STORAGE_KEYS = {
  LSM_CONFIG: 'lsm_config',
  TREE_STATE: 'tree_state',
  READ_VALUE: 'read_value',
  READ_PATH: 'read_path',
};

// Helper functions for localStorage operations
export const saveToLocalStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('Error saving to localStorage:', error);
  }
};

export const loadFromLocalStorage = (key, defaultValue) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error('Error loading from localStorage:', error);
    return defaultValue;
  }
};

// Custom hook for LSM Tree persistence
export const useLSMPersistence = (initialConfig) => {
  // Load initial state from localStorage or use defaults
  const loadPersistedState = () => {
    const persistedConfig = loadFromLocalStorage(STORAGE_KEYS.LSM_CONFIG, initialConfig);
    const persistedTreeState = loadFromLocalStorage(STORAGE_KEYS.TREE_STATE, null);
    const persistedReadValue = loadFromLocalStorage(STORAGE_KEYS.READ_VALUE, null);
    const persistedReadPath = loadFromLocalStorage(STORAGE_KEYS.READ_PATH, []);

    return {
      config: persistedConfig,
      treeState: persistedTreeState,
      readValue: persistedReadValue,
      readPath: persistedReadPath,
    };
  };

  // Save state to localStorage
  const saveState = (config, treeState, readValue, readPath) => {
    saveToLocalStorage(STORAGE_KEYS.LSM_CONFIG, config);
    saveToLocalStorage(STORAGE_KEYS.TREE_STATE, treeState);
    saveToLocalStorage(STORAGE_KEYS.READ_VALUE, readValue);
    saveToLocalStorage(STORAGE_KEYS.READ_PATH, readPath);
  };

  // Clear persisted state
  const clearPersistedState = () => {
    Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
  };

  return {
    loadPersistedState,
    saveState,
    clearPersistedState,
  };
}; 