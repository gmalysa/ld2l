/**
 * Create and host lobbies using Kaedebot-as-a-Service, with the results to be reported to us
 */

var fl = require('flux-link');
var db = require('db-filters');
var _ = require('underscore');
var request = require('request');
var randomstring = require('randomstring');

var flHelper = require('../lib/fl-helper.js');
var logger = require('../logger.js');
var config = require('../config.js');
var users = require('../lib/users.js');
var matches = require('../lib/matches.js');

// Used to select parser type in parseResults calls
const RESULTS_FORMAT_KAEDEBOT = 0;
const RESULTS_FORMAT_OPENDOTA = 1;

//  Start with invalid cache
const lobbyCacheLifetime = 60 * 1000;
var lobbyCache = {};
var lobbyCacheTime = new Date(2000, 0);

// Handler that only remaps to a fixed property without processing data
const identHandler = function(prop) {
	return function(x, data, player) {
		return {
			property : prop,
			value : x
		};
	}
};

// Handler for items that uses a counter on the data object to make them sequential
const itemHandler = function(v, data) {
	if (v > 0) {
		if (undefined === data.items)
			data.items = 0;

		var result = {
			property : matches.PROPERTY_ITEM_MIN + data.items,
			value : v
		};
		data.items += 1;

		return result;
	}
	else {
		return null;
	}
};

// Handler for additional units to get item data for them too
const unitItemHandler = function(v, data) {
	// Strip 0 items and combine items from all controlled units into a single array
	return  _.flatten(_.map(v, function(items) {
		return  _.map(_.without(items.items, 0), function(item) {
			return itemHandler(item, data);
		});
	}));
};

// Property handlers for kaedebot formatted match data, which matches the lobby proto
var _propHandlers = {
	XPPerMin : identHandler(matches.PROPERTY_XPM),
	assists : identHandler(matches.PROPERTY_ASSISTS),
	deaths : identHandler(matches.PROPERTY_DEATHS),
	denies : identHandler(matches.PROPERTY_DENIES),
	goldPerMin : identHandler(matches.PROPERTY_GPM),
	heroDamage : identHandler(matches.PROPERTY_DAMAGE),
	heroHealing : identHandler(matches.PROPERTY_HEALING),
	heroId : identHandler(matches.PROPERTY_HERO),
	kills : identHandler(matches.PROPERTY_KILLS),
	lastHits : identHandler(matches.PROPERTY_LAST_HITS),
	level : identHandler(matches.PROPERTY_LEVEL),
	netWorth : identHandler(matches.PROPERTY_NET_WORTH),
	towerDamage : identHandler(matches.PROPERTY_TOWER_DAMAGE),

	// Use the heroPickOrder field to generate team/side info
	heroPickOrder : function(v, data) {
		var pick = _.find(data.match.picksBans, function(v) {
			return v.heroId == data.player.heroId;
		});

		var team = matches.PROPERTY_TEAM_HOME;
		if ((1 == pick.team && !data.swap)
			|| (0 == pick.team && data.swap))
			team = matches.PROPERTY_TEAM_AWAY;

		return {
			property : matches.PROPERTY_TEAM,
			value : team
		};
	},

	item0 : itemHandler,
	item1 : itemHandler,
	item2 : itemHandler,
	item3 : itemHandler,
	item4 : itemHandler,
	item5 : itemHandler,
	item6 : itemHandler,
	item7 : itemHandler,
	item8 : itemHandler,

	additionalUnitsInventory : unitItemHandler
};

// Item only handlers for open dota, used with additional units
const _opendotaItemHandlers = {
	item_0 : itemHandler,
	item_1 : itemHandler,
	item_2 : itemHandler,
	item_3 : itemHandler,
	item_4 : itemHandler,
	item_5 : itemHandler,
	backpack_0 : itemHandler,
	backpack_1 : itemHandler,
	backpack_2 : itemHandler,
};

// Property handlers for opendota-formatted match data, which is similar but slightly
// different
const _opendotaHandlers = {
	xp_per_min : identHandler(matches.PROPERTY_XPM),
	assists : identHandler(matches.PROPERTY_ASSISTS),
	deaths : identHandler(matches.PROPERTY_DEATHS),
	denies : identHandler(matches.PROPERTY_DENIES),
	gold_per_min : identHandler(matches.PROPERTY_GPM),
	hero_damage : identHandler(matches.PROPERTY_DAMAGE),
	hero_healing : identHandler(matches.PROPERTY_HEALING),
	hero_id : identHandler(matches.PROPERTY_HERO),
	kills : identHandler(matches.PROPERTY_KILLS),
	last_hits : identHandler(matches.PROPERTY_LAST_HITS),
	level : identHandler(matches.PROPERTY_LEVEL),
	total_gold : identHandler(matches.PROPERTY_NET_WORTH),
	tower_damage : identHandler(matches.PROPERTY_TOWER_DAMAGE),

	item_0 : itemHandler,
	item_1 : itemHandler,
	item_2 : itemHandler,
	item_3 : itemHandler,
	item_4 : itemHandler,
	item_5 : itemHandler,
	backpack_0 : itemHandler,
	backpack_1 : itemHandler,
	backpack_2 : itemHandler,

	isRadiant : function(v, data) {
		return {
			property : matches.PROPERTY_TEAM,
			value : (v != data.swap ? matches.PROPERTY_TEAM_HOME : matches.PROPERTY_TEAM_AWAY)
		};
	},

	additional_units : function(v, data) {
		return _.without(_.flatten(_.map(v, function(unit) {
			return _.map(unit, function(v, k) {
				if (undefined !== _opendotaItemHandlers[k]) {
					return _opendotaItemHandlers[k](v, data);
				}
				return null;
			});
		})), null);
	}
};

/**
 * Map a server-side player info object into a client-side-safe one. If given a client-
 * side-safe one already, it produces a copy.
 * @param[in]
 */
function clientPlayerInfo(player) {
	return {
		steamid : player.steamid,
		display_name : player.display_name,
		avatar : player.avatar
	};
}

/**
 * Retrieve a list of all currently going lobbies
 * @return array of lobby objects as defined by KBaaS spec (not posted anywhere, good luck)
 */
var getAll = new fl.Branch(
	function(env, after) {
		var delta = (new Date()).getTime() - lobbyCacheTime.getTime();
		console.log('Cache age: '+delta);
		after(delta > lobbyCacheLifetime);
	},
	new fl.Chain(
		function(env, after) {
			request(config.kbaas_url + '/lobbies?key= ' + config.kbaas_key,
			        env.$check(after));
		},
		function(env, after, response, body) {
			var data = JSON.parse(body);
			after(data);
		},
		function(env, after, lobbies) {
			env.lobbies = lobbies.lobbies;
			// Regularize the lobby response objects, sometimes they're missing fields
			_.each(env.lobbies, function(v) {
				if (!v.lobby) {
					v.lobby = {
						members : []
					};
				}
			});

			env.players = _.flatten(_.map(env.lobbies, function(v) {
				return v.lobby.members;
			}));
			var steamids = _.map(env.players, function(v) { return v.id; });

			if (steamids.length > 0) {
				env.filters.users.select({
					steamid : steamids
				}).exec(after, env.$throw);
			}
			else {
				after([]);
			}
		},
		function (env, after, users) {
			// Remap to steamid index table
			var players = {};
			_.each(users, function(u) {
				players[u.steamid] = u;
			});

			// Attach user objects instead of steamids to lobby members
			_.each(env.lobbies, function(lobby) {
				_.each(lobby.lobby.members, function(m) {
					if (undefined !== players[m.id])
						m.player = players[m.id];
				});
			});

			lobbyCache = env.lobbies;
			lobbyCacheTime = new Date();
			after(lobbyCache);
		}
	),
	function(env, after) {
		after(lobbyCache);
	}
).use_local_env(true);

/**
 * Create a new lobby with the given settings
 * @param[in] settings Object of settings, defaults or internal values will be added
 * @return Response from KBaaS, but this is mostly meaningless
 */
var create = new fl.Chain(
	function(env, after, settings) {
		var args = _.extend({
			name : 'LD2L Lobby '+randomstring.generate(8),
			password : 'ld2l',
			ident : 'ld2l-lobby-'+randomstring.generate(8),
			key : config.kbaas_key,
			hook : config.base_url + '/lobbies/results',
			tournament : 0,
			teams : [],
			config : {}
		}, settings);

		if (args.teams.length != 2) {
			env.$throw(new Error('Must create a lobby with two teams'));
			return;
		}

		if (args.teams[0].players.length != 5 || args.teams[1].players.length != 5) {
			env.$throw(new Error('Both teams must have exactly 5 players'));
			return;
		}

		if (!args.teams[0].captain || !args.teams[1].captain) {
			env.$throw(new Error('Both teams must have a captain specified'));
			return;
		}

		logger.var_dump(args, 'Lobby');

		request.post(config.kbaas_url + '/lobbies/create', {
			'content-type' : 'application/json',
			body : JSON.stringify(args)
		}, env.$check(after));
	},
	function(env, after, response, body) {
		after(JSON.parse(body));
	}
);

/**
 * Remove a lobby with the given identifier
 * @param[in] ident The lobby ident string passed to KBaaS earlier
 */
var remove = new fl.Chain(
	function(env, after, ident) {
		var args = {
			key : config.kbaas_key,
			ident : ident
		};

		request.post(config.kbaas_url + '/lobbies/remove', {
			'content-type' : 'application/json',
			body : JSON.stringify(args)
		}, env.$check(after));
	},
	function(env, after, response, body) {
		after(JSON.parse(body));
	}
);

/**
 * Determine if home == radiant or if home == dire for side-swap option
 * @param[in] lobby The lobby result object to test
 * @param[in] format The format of the lobby result object
 * @param[in] match The match id to use for lookup
 * @return true if home == dire, false if home == radiant
 */
var isSwapNeeded = new fl.Chain(
	function(env, after, lobby, format, match) {
		env.lobby = lobby;
		env.format = format;
		env.match = match;
		env.check = match > 0;
		env.result = false;
		after();
	},
	flHelper.IfTrue('check',
		function(env, after) {
			after(env.match);
		},
		matches.getDetails,
		function(env, after, match) {
			if (RESULTS_FORMAT_KAEDEBOT == env.format) {
				// p is a user object from our db
				var found = _.find(match.home.players, function(p) {
					// Look for a player with the same id on radiant
					return _.find(env.lobby.match.players, function(dotaPlayer) {
						var steamid = users.getID64(dotaPlayer.accountId);

						// Get their team info by matching to a pick
						var pick = _.find(env.lobby.match.picksBans, function(v) {
							return v.heroId == dotaPlayer.heroId;
						});

						// 0 is radiant, which we match to home
						return steamid == p.steamid && pick.team == 0;
					});
				});

				// If a match was found, home is radiant and swap is false
				env.result = (undefined === found);
			}
			else if (RESULTS_FORMAT_OPENDOTA == env.format) {
				// Simpler logic here, test if anyone on the home team is in game
				// and has the isRadiant flag set
				var found = _.find(match.home.players, function(p) {
					return _.find(env.lobby.players, function(dotaPlayer) {
						var steamid = users.getID64(dotaPlayer.account_id);
						return steamid == p.steamid && dotaPlayer.isRadiant;
					});
				});

				env.result = (undefined === found);
			}

			after();
		}
	),
	function(env, after) {
		after(env.result);
	}
).use_local_env(true);

/**
 * Parse the results of a lobby game and save to database
 * @param[in] lobby Data structure containing lobby details
 * @param[in] format Format of the data, see above constants
 * @param[in] matchid If >0, use this match id instead
 * @return id The ld2l match id assigned to this game
 */
var parseResults = new fl.Chain(
	function(env, after, lobby, format, matchid) {
		env.lobby = lobby;
		env.format = format;
		env.matchid = matchid;
		after(lobby, format, matchid);
	},
	isSwapNeeded,
	function(env, after, swap) {
		env.swap = swap;

		// @todo this should be tied to actual match at some point for season/week
		//       and team IDs, but these are the fixed values for inhouse season
		var match = {
			season : 5,
			week : 1,
			home : 0,
			away : 0,
			result : 0,
			dotaid : 0
		};

		if (RESULTS_FORMAT_KAEDEBOT == env.format) {
			var dire_win = (env.lobby.match.matchOutcome == "k_EMatchOutcome_DireVictory");

			// XOR dire win with swap
			var result = matches.HOME_WIN;
			if (dire_win != env.swap)
				result = matches.AWAY_WIN;

			match.result = result;
			match.dotaid = parseInt(env.lobby.match.matchId);
			env.match = env.lobby.match;
			env.handlers = _propHandlers;
		}
		else if (RESULTS_FORMAT_OPENDOTA == env.format) {
			// XOR radiant win with swap
			match.result = (env.lobby.radiant_win != env.swap) ? matches.HOME_WIN : matches.AWAY_WIN;
			match.dotaid = env.lobby.match_id;
			env.match = env.lobby;
			env.handlers = _opendotaHandlers;
		}
		else {
			env.$throw(new Error('Invalid results format supplied: '+env.format));
			return;
		}

		env.matchDetails = match;
		if (env.matchid > 0) {
			env.filters.matches.select({id : env.matchid}).exec(after, env.$throw);
		}
		else {
			env.filters.matches.select({dotaid : match.dotaid})
				.exec(after, env.$throw);
		}
	},
	function(env, after, results) {
		// Only bail if we've already recorded a dota match id
		if (results.length > 0 && results[0].dotaid > 0) {
			env.$throw(new Error('Match '+env.matchDetails.dotaid+' has already been recorded'));
			return;
		}

		if (results.length == 0) {
			env.filters.matches.insert(env.matchDetails).exec(after, env.$throw);
		}
		else {
			// Update and fake a db response with an insert ID
			env.filters.matches.update({
				dotaid : env.matchDetails.dotaid,
				result : env.matchDetails.result
			}, {
				id : results[0].id
			}).exec(function() {
				after({insertId : results[0].id});
			}, env.$throw);
		}
	},
	function(env, after, match) {
		var id = match.insertId;
		env.matchId = id;
		var links = [];

		// Parse into an array of match links
		_.each(env.match.players, function(player) {
			var templ = {
				matchid : id
			};

			if (RESULTS_FORMAT_KAEDEBOT == env.format) {
				templ.steamid = users.getID64(player.accountId);
			}
			else if (RESULTS_FORMAT_OPENDOTA == env.format) {
				templ.steamid = users.getID64(player.account_id);
			}

			// Helper data for handlers to use
			var data = {
				match : env.match,
				swap : env.swap,
				player : player
			};

			// Find the processor for each property to create a link
			_.each(player, function(v, k) {
				if (undefined !== env.handlers[k]) {
					var result = env.handlers[k](v, data);

					if (Array.isArray(result)) {
						_.each(result, function(v) {
							links.push(_.extend({}, templ, v));
						});
					}
					else if (null !== result) {
						links.push(_.extend({}, templ, result));
					}
				}
			});
		});

		env.links = links;
		env.idx = 0;
		after();
	},
	new fl.LoopChain(
		function(env, after) {
			after(env.idx < env.links.length);
		},
		function(env, after) {
			env.filters.match_links.insert(env.links[env.idx])
				.exec(after, env.$throw);
		},
		function(env, after, result) {
			env.idx += 1;
			after();
		}
	),
	function(env, after) {
		after(env.matchId);
	}
);

module.exports = {
	RESULTS_FORMAT_KAEDEBOT : RESULTS_FORMAT_KAEDEBOT,
	RESULTS_FORMAT_OPENDOTA : RESULTS_FORMAT_OPENDOTA,
	getAll : getAll,
	create : create,
	remove : remove,
	parseResults : parseResults,
	isSwapNeeded : isSwapNeeded,
	clientPlayerInfo : clientPlayerInfo
};
