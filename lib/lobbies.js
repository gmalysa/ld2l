/**
 * Create and host lobbies using Kaedebot-as-a-Service, with the results to be reported to us
 */

var fl = require('flux-link');
var db = require('db-filters');
var _ = require('underscore');
var request = require('request');

var logger = require('../logger.js');
var config = require('../config.js');
var users = require('../lib/users.js');
var matches = require('../lib/matches.js');

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
		if (1 == pick.team)
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
			request(config.kbaas_url + '/lobbies'
				+ '?key= ' + config.kbaas_key,
				function(error, response, body) {
					logger.debug(body, 'KBaaS');
					var data = JSON.parse(body);
					after(data);
				}
			);
		},
		function(env, after, lobbies) {
			env.lobbies = lobbies.lobbies;
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
 */
var create = new fl.Chain(
	function(env, after, settings) {
		var args = _.extend({
			name : 'LD2L Lobby',
			password : 'ld2l',
			ident : 'ld2l-lobby',
			key : config.kbaas_key,
			hook : config.base_url + '/lobbies/results',
			tournament : 0,
			teams : [],
			config : {}
		}, settings);

		console.log(settings);

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

		request.post(config.kbaas_url + '/lobbies/create', {
			'content-type' : 'application/json',
			body : JSON.stringify(args)
		}, function(err, response, body) {
			after(JSON.parse(body));
		});
	}
);

/**
 * Save the results of a lobby game
 * @param[in] LobbyResponse lobby LobbyResponse object from KBaaS summarizing the game
 */
var saveResults = new fl.Chain(
	function(env, after, lobby) {
		// @todo verify api key here

		var result = matches.HOME_WIN;
		if (lobby.match.matchOutcome == "k_EMatchOutcome_DireVictory")
			result = matches.AWAY_WIN;

		// @todo this should be tied to actual match at some point for season/week
		//       and team IDs, but these are the fixed values for inhouse season
		var match = {
			// @xxx fix season id for live server
			season : 4,
			week : 1,
			home : 0,
			away : 0,
			result : result,
			dotaid : parseInt(lobby.match.matchId)
		};

		env.match = lobby.match;
		env.filters.matches.insert(match).exec(after, env.$throw);
	},
	function(env, after, match) {
		var id = match.insertId;
		var links = [];

		// Parse into an array of match links
		_.each(env.match.players, function(player) {
			var templ = {
				matchid : id,
				steamid : users.getID64(player.accountId)
			};

			// Helper data for handlers to use
			var data = {
				match : env.match,
				player : player
			};

			// Find the processor for each property to create a link
			_.each(player, function(v, k) {
				if (undefined !== _propHandlers[k]) {
					var result = _propHandlers[k](v, data);

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
	)
);

module.exports = {
	getAll : getAll,
	create : create,
	saveResults : saveResults,
	clientPlayerInfo : clientPlayerInfo
};
