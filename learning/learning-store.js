export class LearningStore {
  constructor() {
    this.statsByCountry = new Map();
  }

  createStats() {
    return {
      correctCount: 0,
      wrongCount: 0,
      currentCorrectStreak: 0,
      lastSeen: null,
      difficultyScore: 0
    };
  }

  getStats(countryName) {
    if (!countryName) return null;
    if (!this.statsByCountry.has(countryName)) {
      this.statsByCountry.set(countryName, this.createStats());
    }
    return this.statsByCountry.get(countryName);
  }

  getDifficulty(countryName) {
    const stats = this.statsByCountry.get(countryName);
    return stats ? Number(stats.difficultyScore) || 0 : 0;
  }

  calculateDifficulty(stats, nowMs = Date.now()) {
    if (!stats) return 0;

    const wrong = Number(stats.wrongCount) || 0;
    const correct = Number(stats.correctCount) || 0;
    const lastSeen = Number(stats.lastSeen) || 0;
    const streak = Number(stats.currentCorrectStreak) || 0;

    let timePenalty = 0;
    if (!lastSeen) {
      timePenalty = 2;
    } else {
      const daysSince = Math.max(0, (nowMs - lastSeen) / 86400000);
      timePenalty = Math.min(3, daysSince * 0.2);
    }

    let raw = wrong * 2 - correct + timePenalty;
    if (streak >= 5) {
      raw *= 0.3;
    }
    return Math.max(0, Math.min(10, raw));
  }

  updateCountryStats(countryName, wasCorrect, nowMs = Date.now()) {
    const stats = this.getStats(countryName);
    if (!stats) return null;

    if (wasCorrect) {
      stats.correctCount += 1;
      stats.currentCorrectStreak += 1;
    } else {
      stats.wrongCount += 1;
      stats.currentCorrectStreak = 0;
    }

    stats.lastSeen = nowMs;
    stats.difficultyScore = this.calculateDifficulty(stats, nowMs);
    return stats;
  }

  computeSummary() {
    let hard = 0;
    let medium = 0;
    let mastered = 0;
    let totalCorrect = 0;
    let totalWrong = 0;

    for (const stats of this.statsByCountry.values()) {
      const difficulty = Number(stats.difficultyScore) || 0;
      const streak = Number(stats.currentCorrectStreak) || 0;
      totalCorrect += Number(stats.correctCount) || 0;
      totalWrong += Number(stats.wrongCount) || 0;

      if (streak >= 5) {
        mastered += 1;
      } else if (difficulty >= 7) {
        hard += 1;
      } else if (difficulty >= 4) {
        medium += 1;
      }
    }

    const totalAttempts = totalCorrect + totalWrong;
    const accuracy = totalAttempts ? (totalCorrect / totalAttempts) * 100 : 0;

    return { hard, medium, mastered, accuracy };
  }
}
