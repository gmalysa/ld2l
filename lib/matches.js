/**
 * Everything to do with matches and their results
 */

var pairing_options = {
	maxPointsPerRound : 2
};

var _ = require('underscore');
var fl = require('flux-link');
var db = require('db-filters');
var pairing = require('swiss-pairing')(pairing_options);

var teams = require('../lib/teams.js');
var seasons = require('../lib/seasons.js');

const MATCHES_UNPLAYED = 0;
const MATCHES_HOME_WIN = 1;
const MATCHES_AWAY_WIN = 2;
const MATCHES_HOME_FORFEIT = 3;
const MATCHES_AWAY_FORFEIT = 4;
const MATCHES_DOUBLE_FORFEIT = 5;

/**
 * Helper to calculate the current round for a given list of series
 * @param[in] series Array of matchups as produced by parseMatches
 * @return Week/Round number
 */
function findWeek(series) {
	return 1 + _.reduce(series, function(memo, v) {
		return v.round > memo ? v.round : memo;
	}, 0);
}

/**
 * Parse any collection of individual games from the database into a list of match objects
 * Team info is not added at this stage but placeholder nulls are included
 * @param[in] matches Array of results rows from the database
 * @return Object with the series in an unspecified order
 */
var parseMatches = new fl.Chain(
	function(env, after, matches) {
		env.matches = {};

		matches.forEach(function(v, k) {
			var key = v.season + '-' + v.week + '-' + v.home + '-' + v.away;
			if (env.matches[key] === undefined) {
				env.matches[key] = {
					home : {
						id : v.home,
						points : 0,
						ff : 0,
						team : null
					},
					away : {
						id : v.away,
						points : 0,
						ff : 0,
						team : null
					},
					round : v.week,
					season : env.id,
					dotaid : []
				};
			}

			switch (v.result) {
				case MATCHES_HOME_WIN:
					env.matches[key].home.points += 1;
					break;
				case MATCHES_AWAY_WIN:
					env.matches[key].away.points += 1;
					break;
				case MATCHES_HOME_FORFEIT:
					env.matches[key].away.points += 1;
					env.matches[key].home.ff += 1;
					break;
				case MATCHES_AWAY_FORFEIT:
					env.matches[key].home.points += 1;
					env.matches[key].away.ff += 1;
					break;
				case MATCHES_DOUBLE_FORFEIT:
					env.matches[key].home.ff += 1;
					env.matches[key].away.ff += 1;
					break;
			}

			if (v.dotaid) {
				env.matches[key].dotaid.push(v.dotaid);
			}
		});

		after(_.values(env.matches));
	}
).use_local_env(true);

/**
 * Given the result of parseMatches, add team information to each series. Note that
 * caching or being intelligent is up to teams.get to take care of.
 * @param[in] matches list of matches from parseMatches
 * @return Same list but with team objects added
 */
var addTeamInfo = new fl.Chain(
	function(env, after, matches) {
		env.matches = matches;
		env.matchIdx = 0;
		after();
	},
	new fl.LoopChain(
		function(env, after) {
			after(env.matchIdx < env.matches.length);
		},
		function(env, after) {
			after(env.matches[env.matchIdx].home.id);
		},
		teams.get,
		function(env, after, team) {
			env.matches[env.matchIdx].home.team = team;
			after(env.matches[env.matchIdx].away.id);
		},
		teams.get,
		function(env, after, team) {
			env.matches[env.matchIdx].away.team = team;
			env.matchIdx += 1;
			after();
		}
	),
	function(env, after) {
		after(env.matches);
	}
).use_local_env(true);

/**
 * Retrieve series info, without match details, for an entire season, organized into
 * an array by week
 * @param[in] id Season ID to retrieve from
 * @return array of series info, including team objects
 */
var getAllSeries = new fl.Chain(
	function(env, after, id) {
		env.id = id;
		env.filters.matches.select({
			season : id
		}).exec(after, env.$throw);
	},
	parseMatches,
	addTeamInfo,
	function(env, after, series) {
		env.series = {};

		series.forEach(function(v) {
			if (env.series[v.round] === undefined) {
				env.series[v.round] = [];
			}

			env.series[v.round].push(v);
		});

		after(env.series);
	}
).use_local_env(true);

/**
 * Generate the next round of matches after results have been recorded
 * @param[in] id The season ID to generate the next round of matches for
 */
var generateMatchups = new fl.Chain(
	function(env, after, season) {
		env.season = season;
		env.id = season;
		after(season);
	},
	teams.getAllTeams,
	function(env, after, teams) {
		env.participants = teams.map(function(v) {
			return {
				id : v.id,
				seed : v.medal,
				droppedOut : v.disbanded
			};
		});

		env.filters.matches.select({
			season : env.season
		}).exec(after, env.$throw);
	},
	parseMatches,
	function(env, after, series) {
		var week = findWeek(series);
		env.matchups = pairing.getMatchups(week, env.participants, series);
		env.week = week;
		env.matchIdx = 0;
		after();
	},
	new fl.LoopChain(
		function(env, after) {
			after(env.matchIdx < env.matchups.length);
		},
		function(env, after) {
			var data = {
				season : env.season,
				week : env.week,
				home : env.matchups[env.matchIdx].home,
				away : env.matchups[env.matchIdx].away,
				result : 0
			};
			env.filters.matches.insert(data).exec(after, env.$throw);
			env.filters.matches.insert(data).exec(function() {}, env.$throw);
			env.matchIdx += 1;
		}
	)
).use_local_env(true);

/**
 * Add win/loss information and season standings + points to the given array of teams
 * @param[in] teams Array of team objects
 * @param[in] seasonId Season ID to use for finding matches
 * @return New teams array with the updated objects (old objects are modified too)
 */
var addStandings = new fl.Chain(
	function(env, after, teams, seasonId) {
		env.id = seasonId;
		env.teams = {};
		teams.forEach(function(v) {
			env.teams[v.id] = v;
		});
		env.participants = teams.map(function(v) {
			return {
				id : v.id,
				seed : v.medal
			};
		});

		env.filters.matches.select({
			season : seasonId
		}).exec(after, env.$throw);
	},
	parseMatches,
	function(env, after, series) {
		var week = findWeek(series);
		var standings = pairing.getStandings(week, env.participants, series);
		standings.forEach(function(v) {
			env.teams[v.id].wins = v.wins;
			env.teams[v.id].losses = v.losses;
			env.teams[v.id].tiebreaker = v.tiebreaker;
		});
		var teams = _.values(env.teams);
		teams.sort(function(a, b) {
			if (a.wins != b.wins) {
				return b.wins - a.wins;
			}
			return b.tiebreaker - a.tiebreaker;
		});
		after(teams);
	}
).use_local_env(true);

/**
 * Get the win-loss record of a given team without generating full matchups for the
 * season
 * @param[in] team The team object
 * @return Team object modified with wins/losses fields
 */
var addRecord = new fl.Chain(
	function(env, after, team) {
		env.team = team;
		env.team.wins = 0;
		env.team.losses = 0;
		env.filters.matches.select({home : env.team.id}).exec(after, env.$throw);
	},
	function(env, after, games) {
		_.each(games, function(v, k) {
			if (MATCHES_HOME_WIN == v.result || MATCHES_AWAY_FORFEIT == v.result)
				env.team.wins += 1;
			else if (MATCHES_UNPLAYED != v.result)
				env.team.losses += 1;
		});
		env.filters.matches.select({away : env.team.id}).exec(after, env.$throw);
	},
	function(env, after, games) {
		_.each(games, function(v, k) {
			if (MATCHES_AWAY_WIN == v.result || MATCHES_HOME_FORFEIT == v.result)
				env.team.wins += 1;
			else if (MATCHES_UNPLAYED != v.result)
				env.team.losses += 1;
		});

		after(env.team);
	}
).use_local_env(true);

module.exports = {
	UNPLAYED : MATCHES_UNPLAYED,
	HOME_WIN : MATCHES_HOME_WIN,
	AWAY_WIN : MATCHES_AWAY_WIN,
	HOME_FORFEIT : MATCHES_HOME_FORFEIT,
	AWAY_FORFEIT : MATCHES_AWAY_FORFEIT,
	DOUBLE_FORFEIT : MATCHES_DOUBLE_FORFEIT,

	getAllSeries : getAllSeries,
	generateMatchups : generateMatchups,
	addStandings : addStandings,
	addRecord : addRecord,
};
