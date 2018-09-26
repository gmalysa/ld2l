/**
 * Ratings/rankings/stats optimizer for inhouses
 */

var _ = require('underscore');
var fl = require('flux-link');
var db = require('db-filters');

var mysql = require('./mysql');
var logger = require('./logger');
var teams = require('./lib/teams.js');
var matches = require('./lib/matches.js');

const DEFAULT_MMR = 25;
const LAMBDA = 10;
const ITERATIONS = 100;

mysql.init();

// Load databse filter definitions
db.init(process.cwd() + '/filters', function(file) {
	logger.info('Adding database definition ' + file.blue.bold + '...', 'db-filters');
}, db.l_info);

db.set_log(function(msg) {
	logger.info(msg, 'db-filters');
});

/**
 * Get the mmr avg for the given team from the players list
 * @return mmr avg of team
 */
function team_mmr(env, team) {
	return _.reduce(_.map(team, function(v) {
		return env.players[v].mmr;
	}), function(memo, mmr) {
		return memo + mmr;
	}, 0);
}

var preprocess = new fl.Chain(
	mysql.init_db,
	function(env, after) {
		after(6);
	},
	teams.getAllTeams,
	function(env, after, teams) {
		env.teams = teams;
		env.filters.matches.select({season : 5}).exec(after, env.$throw);
	},

	// Create basic lookup tables for each match to find players
	function getMatches(env, after, games) {
		env.matches = {};
		_.each(games, function(v) {
			env.matches[v.id] = {
				id : v.id,
				home : [],
				away : [],
				home_score : 0,
				away_score : 0,
				home_norm : 1,
				away_norm : 1,
				result : (v.result == matches.HOME_WIN ? 1 : 0)
			};
		});

		var ids = _.map(games, function(v) { return v.id; });
		env.filters.match_links.select({
			matchid : ids,
			property : matches.PROPERTY_TEAM
		}).exec(after, env.$throw);
	},

	function addPlayerLinks(env, after, links) {
		env.players = {};

		// create player-> match tables and add player pointers to existing matches
		_.each(links, function(v) {
			var match = env.matches[v.matchid];
			if (matches.PROPERTY_TEAM_HOME == v.value)
				match.home.push(v.steamid);
			else
				match.away.push(v.steamid);

			if (undefined === env.players[v.steamid]) {
				env.players[v.steamid] = {
					steamid : v.steamid,
					mmr : DEFAULT_MMR,
					matches : [],
					derivatives : []
				};
			}

			env.players[v.steamid].matches.push(v.matchid);
		});

		// Purge matches with less than 8 players
		var allMatches = env.matches;
		env.matches = {};
		_.each(allMatches, function(m) {
			if (m.home.length + m.away.length >= 8)
				env.matches[m.id] = m;
		});

		// Update each match with count of players for appropriate mmr normalization
		// @todo table or efficient method of finding matches with the same teams
		_.each(env.matches, function(v) {
			v.home_norm = v.home.length;
			v.away_norm = v.away.length;
		});

		env.idx = 0;
		env.iter = ITERATIONS;
		after();
	},
	new fl.LoopChain(
		function(env, after) {
			after(env.idx < env.iter);
		},
		// Compute the objective function and relevant derivatives
		function objective(env, after) {
			// Find R_s and R_t for each match
			_.each(env.matches, function(v) {
				v.home_score = team_mmr(env, v.home);
				v.away_score = team_mmr(env, v.away);
			});

			// Compute objective function with L2 loss
			var J = _.reduce(env.matches, function(memo, v) {
				var err = v.result - (v.home_score)/(v.home_score + v.away_score);
				return memo + err*err;
			}, 0);

			// Clear previous derivatives
			_.each(env.players, function(p) {
				p.derivatives = [];
			});

			// Compute derivatives for all players in each match
			_.each(env.matches, function(m) {
				var den = m.home_score + m.away_score;
				var RsRt = m.home_score * m.away_score;
				var Rssq = m.home_score * m.home_score;
				var Rtsq = m.away_score * m.away_score;
				var Okm1 = m.result - 1;

				den = den*den*den;
				var dRs = -2 * (RsRt*Okm1 + Rtsq*m.result) / den;
				var dRt = 2 * (Rssq*Okm1 + RsRt*m.result) / den;

				logger.info(dRs+', '+dRt, 'Derivatives');
				_.each(m.home, function(p) {
					env.players[p].derivatives.push(dRs);
				});

				_.each(m.away, function(p) {
					env.players[p].derivatives.push(dRt);
				});
			});

			// Compute total change for each player and scale
			_.each(env.players, function(p) {
				if (p.derivatives.length > 4) {
					var err = _.reduce(p.derivatives, function(memo, d) {
						return memo + d;
					}, 0);

					if (err != 0) {
						var delta = LAMBDA * err;
						logger.info('Delta: '+delta, p.steamid);
						p.mmr -= delta;
						if (p.mmr < 0)
							p.mmr = 0;
					}
				}
			});

			logger.info(J, 'J');
			after();
		},
		function(env, after) {
			var players = _.sortBy(env.players, function(p) {
				return -p.mmr;
			});

			players = _.map(players, function(p) {
				return {
					steamid : p.steamid,
					mmr : p.mmr
				};
			});

			logger.info(JSON.stringify(players), 'iter');

			env.idx += 1;
			after();
		}
	),
	function(env, after) {
		env.filters.users.select({
			steamid : _.map(env.players, function(p) { return p.steamid; })
		}).exec(after, env.$throw);
	},
	function(env, after, users) {
		// Attach names to player objects
		_.each(users, function(u) {
			env.players[u.steamid].display_name = u.display_name;
		});

		var players = _.sortBy(env.players, function(p) {
			return -p.mmr;
		});

		_.each(players, function(p) {
			logger.info(p.display_name+': '+p.mmr, 'Player MMR');
		});

		_.each(env.teams, function(t) {
			_.each(t.players, function(p) {
				p.mmr = env.players[p.steamid].mmr;
			});

			t.mmr = _.reduce(t.players, function(memo, p) {
				return memo + p.mmr;
			}, 0);
		});

		env.teams = _.sortBy(env.teams, function(t) {
			return -t.mmr;
		});

		_.each(env.teams, function(t) {
			logger.info(t.name + ': '+t.mmr, 'Team MMR');
		});
	},
	mysql.cleanup_db
);

var env = new fl.Environment();
preprocess.call(null, env, function() {});
