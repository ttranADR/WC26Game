export function createMockFootballProvider() {
  return {
    async getFixturesByDate(date) {
      return [
        fixture("fix_bra_mar", "Brazil", "Morocco", "BRA", "MAR", `${date}T20:00:00.000Z`, 2, 1, 18),
        fixture("fix_arg_jpn", "Argentina", "Japan", "ARG", "JPN", `${date}T23:00:00.000Z`, 1, 1, 43),
        fixture("fix_ger_can", "Germany", "Canada", "GER", "CAN", `${date}T02:00:00.000Z`, 3, 0, 12),
        fixture("fix_esp_crc", "Spain", "Costa Rica", "ESP", "CRC", `${date}T05:00:00.000Z`, 2, 0, 36)
      ];
    },

    async getLiveScores(date) {
      return this.getFixturesByDate(date);
    },

    async getOddsByDate(date) {
      const fixtures = await this.getFixturesByDate(date);
      return fixtures.flatMap((match) => [
        odds(match.id, "MATCH_WINNER", match.homeTeam, 1.7),
        odds(match.id, "MATCH_WINNER", "Draw", 3.4),
        odds(match.id, "MATCH_WINNER", match.awayTeam, 4.8),
        odds(match.id, "TOTAL_GOALS", "Over 2.5", 1.6),
        odds(match.id, "TOTAL_GOALS", "Under 2.5", 2.2),
        odds(match.id, "BOTH_TEAMS_SCORE", "Yes", 1.7),
        odds(match.id, "BOTH_TEAMS_SCORE", "No", 2.0),
        ...["0-0", "1-0", "1-1", "2-1", "2-0", "3-1", "0-1", "1-2", "3-0"].map((score, index) => (
          odds(match.id, "CORRECT_SCORE", score, [7.5, 6.6, 5.8, 6.2, 7.1, 9.5, 10.5, 11.5, 12.0][index])
        ))
      ]);
    },

    async getMatchEvents(matchId) {
      const goalMinutes = {
        fix_bra_mar: [18, 52, 76],
        fix_arg_jpn: [43, 61],
        fix_ger_can: [12, 44, 72],
        fix_esp_crc: [36, 69]
      };
      return (goalMinutes[matchId] || []).map((minute, index) => ({
        id: `${matchId}_event_${index + 1}`,
        type: "GOAL",
        minute
      }));
    }
  };
}

function fixture(externalId, homeTeam, awayTeam, homeTeamCode, awayTeamCode, kickoffAt, homeScore, awayScore, firstGoalMinute) {
  return {
    externalProvider: "mock",
    externalId,
    homeTeam,
    awayTeam,
    homeTeamCode,
    awayTeamCode,
    kickoffAt,
    status: "FINISHED",
    homeScore,
    awayScore,
    firstGoalMinute,
    rawData: { source: "mock" }
  };
}

function odds(tournamentMatchId, marketKey, outcomeName, priceDecimal) {
  return {
    tournamentMatchId,
    provider: "mock",
    marketKey,
    bookmaker: "MockBook",
    outcomeName,
    priceDecimal,
    priceAmerican: null,
    impliedProbability: Number((1 / priceDecimal).toFixed(4)),
    rawData: { source: "mock" },
    capturedAt: new Date().toISOString()
  };
}
