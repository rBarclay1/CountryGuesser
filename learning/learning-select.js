export function getWeightedRandomCountry(candidates, learningStore) {
  if (!Array.isArray(candidates) || !candidates.length) return null;

  const weighted = [];
  let totalWeight = 0;

  for (const feature of candidates) {
    const name = feature?.properties?.name;
    if (!name) continue;
    const difficulty = learningStore ? learningStore.getDifficulty(name) : 0;
    const weight = 1 + difficulty * 5;
    totalWeight += weight;
    weighted.push({ name, weight });
  }

  if (!weighted.length || totalWeight <= 0) return null;

  let roll = Math.random() * totalWeight;
  for (const item of weighted) {
    roll -= item.weight;
    if (roll <= 0) return item.name;
  }

  return weighted[weighted.length - 1].name;
}

export function pickReviewCountry(candidates, learningStore, threshold = 5) {
  if (!Array.isArray(candidates) || !candidates.length) return null;

  const reviewPool = candidates.filter(feature => {
    const name = feature?.properties?.name;
    if (!name) return false;
    const difficulty = learningStore ? learningStore.getDifficulty(name) : 0;
    return difficulty > threshold;
  });

  if (!reviewPool.length) return null;
  const index = Math.floor(Math.random() * reviewPool.length);
  return reviewPool[index];
}
