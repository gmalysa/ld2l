/**
 * Utilities associated with season management not related to privs
 */

var pairing_options = {
	maxPointsPerRound : 2
};

var _ = require('underscore');
var fl = require('flux-link');
var db = require('db-filters');
var pairing = require('swiss-pairing')(pairing_options);

var privs = require('../lib/privs.js');
var teams = require('../lib/teams.js');

const SEASON_STATUS_HIDDEN = 0;
const SEASON_STATUS_SIGNUPS = 1;
const SEASON_STATUS_PLAYING = 2;
const SEASON_STATUS_FINISHED = 3;
const SEASON_STATUS_DRAFTING = 4;

/**
 * Check if a value given is a valid season status value
 * @param[in] mixed status The status to test
 * @return true if it is an integer and one of the season status constants, false otherwise
 */
function isValidStatus(status) {
	return (status >= SEASON_STATUS_HIDDEN && status <= SEASON_STATUS_DRAFTING);
}

/**
 * Get the vouch status for an array of signups
 * @param[in] signups The array of signups to get vouch status for
 * @return Array of signups with vouched property added
 */
var addVouchStatus = new fl.Chain(
	function(env, after, signups) {
		env.signups = signups;
		if (signups.length > 0) {
			env.filters.privs.select({
				steamid : signups.map(function(v, k) {
					return v.steamid;
				}),
				priv : privs.JOIN_SEASON
			}).exec(after, env.$throw);
		}
		else {
			after([]);
		}
	},
	function(env, after, results) {
		var privTable = {};
		results.forEach(function(v, k) {
			privTable[v.steamid] = 1;
		});
		env.signups.forEach(function(v, k) {
			if (privTable[v.steamid] !== undefined)
				v.vouched = 1;
			else
				v.vouched = 0;
		});
		after(env.signups);
	}
).use_local_env(true);

/**
 * Load signup details which will include vouch status for each signup
 * @param[in] id Season ID to load for
 */
var getSignups = new fl.Chain(
	function(env, after, id) {
		env.filters.signups.select({season : id})
			.left_join(env.filters.users, 'u')
			.on(['steamid', 'steamid'])
			.order(0, db.$asc('time'))
			.exec(after, env.$throw);
	},
	addVouchStatus
).use_local_env(true);

/**
 * Load season details, which will include all signups (and later, team info, etc.)
 * @param[in] id Season ID
 */
var getSeason = new fl.Chain(
	function(env, after, id) {
		env.id = id;
		env.filters.seasons.select({id : id}).exec(after, env.$throw);
	},
	function(env, after, results) {
		if (0 == results.length) {
			env.$throw(new Error('No matching season found'));
			return;
		}

		env.season = results[0];
		after(env.id);
	},
	getSignups,
	function(env, after, signups) {
		env.season.signups = signups;
		after(env.season);
	}
).use_local_env(true);

/**
 * Get current matchups from the database for the given season
 * @param[in] id Season id
 * @return Array of series to play with team objects added to each
 */
var getCurrentMatchups = new fl.Chain(
	function(env, after, id) {
		env.id = id;
		env.filters.matches.select({
			season : id
		}).exec(after, env.$throw);
	},
	function(env, after, matches) {
		var week = matches.reduce(function(memo, v) {
			return memo > v.week ? memo : v.week;
		}, 0);

		// Get only the last week
		matches = matches.filter(function(v) {
			return v.week == week;
		});

		// Remove second game of each series
		matches = _.uniq(matches, function(v) {
			return v.home+' '+v.away;
		});

		env.matches = matches;
		env.teams = [].concat(matches.map(function(v) {
			return v.home;
		}), matches.map(function(v) {
			return v.away;
		}));

		env.teamidx = 0;
		env.team_info = {};
		after();
	},
	new fl.LoopChain(
		function(env, after) {
			after(env.teamidx < env.teams.length);
			env.teamidx += 1;
		},
		function(env, after) {
			env.filters.teams.select({
				id : env.teams[env.teamidx-1]
			}).exec(after, env.$throw);
		},
		function(env, after, team) {
			if (team.length > 0) {
				env.team_info[team[0].id] = team[0];
			}
			after();
		}
	),
	function(env, after) {
		env.matches.forEach(function(v) {
			v.home = env.team_info[v.home];
			v.away = env.team_info[v.away];
		});
		after(env.matches);
	}
).use_local_env(true);

/**
 * Create new matchups
 * @todo use previous week results, this just always generates week 0 right now
 * @param[in] season The season ID to generate matchups for
 */
var generateMatchups = new fl.Chain(
	function(env, after, season) {
		env.season = season;
		after(season);
	},
	teams.getAllTeams,
	function(env, after, teams) {
		var participants = teams.map(function(v) {
			return {
				id : v.id,
				seed : v.medal
			};
		});

		env.matchups = pairing.getMatchups(1, participants, []);
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
				week : 1,
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

module.exports = {
	STATUS_HIDDEN : SEASON_STATUS_HIDDEN,
	STATUS_SIGNUPS : SEASON_STATUS_SIGNUPS,
	STATUS_PLAYING : SEASON_STATUS_PLAYING,
	STATUS_FINISEHD : SEASON_STATUS_FINISHED,
	STATUS_DRAFTING : SEASON_STATUS_DRAFTING,

	isValidStatus : isValidStatus,
	getSeason : getSeason,
	getCurrentMatchups : getCurrentMatchups,
	generateMatchups : generateMatchups
};
