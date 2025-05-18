export const generateSSTableId = () =>
  `sstable-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

export const sstableGet = (data, key) => {
  let low = 0;
  let high = data.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (data[mid][0] === key) {
      return data[mid][1];
    } else if (data[mid][0] < key) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return undefined;
};
