/**
 * @todo this needs audit logging of changes being made
 */

var fl = require('flux-link');
var db = require('db-filters');
var _ = require('underscore');
var request = require('request');

var privs = require('../lib/privs.js');
var users = require('../lib/users.js');
var seasons = require('../lib/seasons.js');
var teams = require('../lib/teams.js');
var matches = require('../lib/matches.js');
var audit = require('../lib/audit.js');
var lobbies = require('../lib/lobbies.js');
var flHelper = require('../lib/fl-helper.js');
var prelobbies = require('../lib/prelobbies.js');

/**
 * Remove all of the links between a player and a particular match
 * @todo: temporary here, make lib and stuff
 */
var remove_player = new fl.Chain(
	function(env, after) {
		var id = parseInt(env.req.params.matchid);
		if (isNaN(id)) {
			env.$throw(new Error('Invalid match ID specified'));
			return;
		}

		var playerid = env.req.params.steamid;
		if (playerid.length != 17) {
			env.$throw(new Error('Invalid user ID specified'));
			return;
		}

		if (!privs.hasPriv(env.user.privs, privs.CREATE_LOBBY)) {
			env.$throw(new Error('You cannot edit match records.'));
			return;
		}

		env.matchid = id;
		env.playerid = playerid;
		env.filters.match_links.select({
			matchid : id,
			steamid : playerid
		}).exec(after, env.$throw);
	},
	function(env, after, links) {
		after(env.user, audit.EVENT_REMOVE_PLAYER, {id : env.matchid}, {links : links});
	},
	audit.logMatchEvent,
	function(env, after) {
		env.filters.match_links.delete({
			matchid : env.matchid,
			steamid : env.playerid
		}).exec(after, env.$throw);
	},
	function(env, after) {
		env.$redirect('/matches/' + env.matchid);
		after();
	}
).use_local_env(true);

/**
 * Add a full record for a user. This has to be reworked in the future but it's used
 * for cheap data entry right now with minimal validation. Just delete and re-enter any
 * rows that are messed up
 * @todo: temporary, make lib, make robust (generate form dynamically possibly)
 */
var add_player = new fl.Chain(
	function(env, after) {
		var id = parseInt(env.req.params.matchid);
		if (isNaN(id)) {
			env.$throw(new Error('Invalid match ID specified'));
			return;
		}

		if (!privs.hasPriv(env.user.privs, privs.CREATE_LOBBY)) {
			env.$throw(new Error('You cannot edit match records.'));
			return;
		}

		env.matchid = id;
		env.steamid = env.req.body.steamid;
		if (env.steamid.length != 17) {
			env.$throw(new Error('Remember to use the 17-digit steam64 ID for the player'));
			return;
		}

		env.filters.match_links.insert({
			matchid : env.matchid,
			steamid : env.steamid,
			property : 1,
			value : parseInt(env.req.body.level)
		}).exec(after, env.$throw);
	},
	function(env, after) {
		env.filters.match_links.insert({
			matchid : env.matchid,
			steamid : env.steamid,
			property : 2,
			value : parseInt(env.req.body.hero)
		}).exec(after, env.$throw);
	},
	function(env, after) {
		env.filters.match_links.insert({
			matchid : env.matchid,
			steamid : env.steamid,
			property : 3,
			value : parseInt(env.req.body.kills)
		}).exec(after, env.$throw);
	},
	function(env, after) {
		env.filters.match_links.insert({
			matchid : env.matchid,
			steamid : env.steamid,
			property : 4,
			value : parseInt(env.req.body.deaths)
		}).exec(after, env.$throw);
	},
	function(env, after) {
		env.filters.match_links.insert({
			matchid : env.matchid,
			steamid : env.steamid,
			property : 5,
			value : parseInt(env.req.body.assists)
		}).exec(after, env.$throw);
	},
	function(env, after) {
		env.filters.match_links.insert({
			matchid : env.matchid,
			steamid : env.steamid,
			property : 6,
			value : parseInt(env.req.body.last_hits)
		}).exec(after, env.$throw);
	},
	function(env, after) {
		env.filters.match_links.insert({
			matchid : env.matchid,
			steamid : env.steamid,
			property : 7,
			value : parseInt(env.req.body.denies)
		}).exec(after, env.$throw);
	},
	function(env, after) {
		env.filters.match_links.insert({
			matchid : env.matchid,
			steamid : env.steamid,
			property : 8,
			value : parseInt(env.req.body.gpm)
		}).exec(after, env.$throw);
	},
	function(env, after) {
		env.filters.match_links.insert({
			matchid : env.matchid,
			steamid : env.steamid,
			property : 9,
			value : parseInt(env.req.body.xpm)
		}).exec(after, env.$throw);
	},
	function(env, after) {
		env.filters.match_links.insert({
			matchid : env.matchid,
			steamid : env.steamid,
			property : 10,
			value : parseInt(env.req.body.damage)
		}).exec(after, env.$throw);
	},
	function(env, after) {
		env.filters.match_links.insert({
			matchid : env.matchid,
			steamid : env.steamid,
			property : 11,
			value : parseInt(env.req.body.healing)
		}).exec(after, env.$throw);
	},
	function(env, after) {
		env.filters.match_links.insert({
			matchid : env.matchid,
			steamid : env.steamid,
			property : 12,
			value : parseInt(env.req.body.tower_damage)
		}).exec(after, env.$throw);
	},
	function(env, after) {
		env.filters.match_links.insert({
			matchid : env.matchid,
			steamid : env.steamid,
			property : 13,
			value : parseInt(env.req.body.team)
		}).exec(after, env.$throw);
	},
	function(env, after) {
		env.filters.match_links.insert({
			matchid : env.matchid,
			steamid : env.steamid,
			property : 14,
			value : parseInt(env.req.body.net_worth)
		}).exec(after, env.$throw);
	},
	function(env, after) {
		env.items = env.req.body.items.split(',');
		env.idx = 0;
		after();
	},
	new fl.LoopChain(
		function(env, after) {
			after(env.idx < env.items.length);
		},
		function(env, after) {
			env.filters.match_links.insert({
				matchid : env.matchid,
				steamid : env.steamid,
				property : 100 + env.idx,
				value : parseInt(env.items[env.idx])
			}).exec(after, env.$throw);
		},
		function(env, after) {
			env.idx += 1;
			after();
		}
	),
	function(env, after) {
		after(env.user, audit.EVENT_ADD_PLAYER, {id : env.matchid}, env.req.body);
	},
	audit.logMatchEvent,
	function(env, after) {
		env.$redirect('/matches/'+env.matchid);
		after();
	}
).use_local_env(true);

/**
 * Get match information for a matchid that is part of the url
 */
var match_preamble = new fl.Chain(
	function(env, after) {
		var id = parseInt(env.req.params.matchid);
		if (isNaN(id)) {
			env.$throw(new Error('Invalid match ID specified'));
			return;
		}

		env.matchId = id;
		after(id);
	},
	matches.getDetails,
	function(env, after, match) {
		env.match = match;

		var captain = -1;
		if (env.user.steamid) {
			if (match.home.captain
				&& match.home.captain.steamid == env.user.steamid) {
				captain = 0;
			}
			else if (match.away.captain
				&& match.away.captain.steamid == env.user.steamid) {
				captain = 1;
			}
		}

		env.teamCaptain = captain;
		after();
	}
);

/**
 * Show detailed information for the single match specified
 */
var match_details = new fl.Chain(
	function(env, after) {
		after(env.match.id);
	},
	prelobbies.get,
	function(env, after, prelobby) {
		var anyCaptain = (env.teamCaptain >= 0);
		var canEdit = privs.hasPriv(env.user.privs, privs.CREATE_LOBBY);
		var ready = false;
		var preventReady = false;
		var started = false;

		var showStartButton = false;

		// Add captain to player list if we have real teams
		if (env.match.home.id > 0)
			env.match.home.players.push(env.match.home.captain);

		if (env.match.away.id > 0)
			env.match.away.players.push(env.match.away.captain);

		// Only do prelobby stuff if we don't have a match result
		if (null !== prelobby && env.match.result == matches.UNPLAYED) {
			prelobbies.addDetails(prelobby, env.match.home, env.match.away);

			// Only stuff for a captain
			if (anyCaptain) {
				ready = prelobby.teams[env.teamCaptain].ready;
				preventReady = prelobby.teams[env.teamCaptain].players.length != 5;
			}
		}

		env.$output({
			match : env.match,
			canEdit : canEdit,
			captainSide : env.teamCaptain,
			anyCaptain : anyCaptain,
			prelobby : prelobby,
			ready : ready,
			preventReady : preventReady,
			scripts : ['menu', 'autocomplete', 'matches'],
		});

		env.$template('match');
		after();
	}
).use_local_env(true);

/**
 * Captains submit roster information which will be used to create the lobby
 */
var submit_roster = new fl.Chain(
	function(env, after) {
		if (env.teamCaptain < 0) {
			env.$throw(new Error('You must be a team captain to submit a roster'));
			return;
		}

		var players = [];
		var standin = {};
		env.use_standin = false;

		_.each(env.req.body, function(v, k) {
			// For selected checkboxes, their presence implies selection
			if (k.substring(0, 5) == 'check') {
				var steamid = k.substring(6);
				players.push({steamid : steamid});
			}

			if (k == 'standin') {
				standin.steamid = v;
			}

			if (k == 'use-standin') {
				env.use_standin = true;
			}
		});

		// Check that it's a valid steamid by length
		if (env.use_standin && standin.steamid.length == 17)
			players.push(standin);

		if (players.length > 5) {
			env.$throw(new Error('You may not select more than five players'));
			return;
		}

		env.players = players;
		env.standin = standin;
		after();
	},
	flHelper.IfTrue('use_standin',
		function(env, after) {
			after(env.standin.steamid);
		},
		users.getUser,
		function(env, after, user) {
			env.standin.avatar = user.avatar;
			env.standin.display_name = user.display_name;
			env.filters.signups.select({
				steamid : env.standin.steamid,
				season : env.match.season.id
			}).exec(after, env.$throw);
		},
		function(env, after, signup) {
			env.standin.medal = signup[0].medal;
			after();
		}
	),
	function(env, after) {
		after(env.match.id);
	},
	prelobbies.get,
	function(env, after, prelobby) {
		after(prelobby, env.teamCaptain, env.players);
	},
	prelobbies.setRoster,
	function(env, after) {
		env.$redirect('/matches/'+env.match.id);
		after();
	}
).use_local_env(true);

/**
 * Used to cancel a lobby that has been started but not launched
 */
var cancel_match = new fl.Chain(
	function(env, after) {
		if (env.teamCaptain < 0) {
			env.$throw(new Error('You are not allowed to cancel this lobby'));
			return;
		}

		after(env.match.id);
	},
	prelobbies.get,
	prelobbies.cancel,
	function(env, after) {
		env.$redirect('/matches/'+env.match.id);
		after();
	}
).use_local_env(true);

/**
 * Used by a captain to mark themselves ready
 */
var ready = new fl.Chain(
	function(env, after) {
		if (env.teamCaptain < 0) {
			env.$throw(new Error('You\'re not the team captain!'));
			return;
		}

		after(env.match.id);
	},
	prelobbies.get,
	function(env, after, prelobby) {
		after(prelobby, env.teamCaptain);
	},
	prelobbies.ready,
	function(env, after) {
		env.$redirect('/matches/'+env.match.id);
		after();
	}
).use_local_env(true);

/**
 * Used by a captain to mark themselves unready
 */
var unready = new fl.Chain(
	function(env, after) {
		if (env.teamCaptain < 0) {
			env.$throw(new Error('You\'re not the team captain!'));
			return;
		}

		after(env.match.id);
	},
	prelobbies.get,
	function(env, after, prelobby) {
		after(prelobby, env.teamCaptain);
	},
	prelobbies.unready,
	function(env, after) {
		env.$redirect('/matches/'+env.match.id);
		after();
	}
).use_local_env(true);

/**
 * Set (or, more often, reset) the results for a particular match
 */
var set_result = new fl.Chain(
	function(env, after) {
		if (!privs.hasPriv(env.user.privs, privs.MODIFY_SEASON)) {
			env.$throw(new Error('You do not have the ability to modify results'));
			return;
		}

		env.data = {
			result : parseInt(env.req.body.result)
		};

		if (undefined !== env.req.body.clear_id) {
			env.data.dotaid = 0;
		}

		env.filters.matches.update(
			env.data,
			{id : env.match.id}
		).exec(after, env.$throw);
	},
	function(env, after) {
		env.$redirect('/matches/'+env.match.id);
		after(env.user, audit.EVENT_EDIT, env.match, env.data);
	},
	audit.logMatchEvent
).use_local_env(true);

/**
 * Parse a dota ID onto the specified match
 */
var parse = new fl.Chain(
	function(env, after) {
		if (!privs.hasPriv(env.user.privs, privs.MODIFY_SEASON)) {
			env.$throw(new Error('You do not have the ability to report results'));
			return;
		}

		var id = parseInt(env.req.params.matchid);
		if (isNaN(id)) {
			env.$throw(new Error('Invalid match ID specified'));
			return;
		}

		var dotaid = parseInt(env.req.body.dotaid);
		if (isNaN(dotaid)) {
			env.$throw(new Error('Invalid dota match ID specified'));
			return;
		}

		env.matchid = id;
		env.dotaid = dotaid;
		request('https://api.opendota.com/api/matches/'+dotaid,
		        env.$check(after));
	},
	function(env, after, response, body) {
		after(JSON.parse(body), lobbies.RESULTS_FORMAT_OPENDOTA, env.matchid);
	},
	lobbies.parseResults,
	function(env, after) {
		env.$redirect('/matches/'+env.matchid);
		after();
	}
).use_local_env(true);

/**
 * Show all matches from the given season
 * @param[in] season id
 */
var show_matches = new fl.Chain(
	function(env, after) {
		after(env.season.id);
	},
	matches.getAllSeries,
	function(env, after, series) {
		var week = _.reduce(series, function(memo, v) {
			return v[0].round > memo ? v[0].round : memo;
		}, 0);

		var current = [];
		var past = [];
		_.each(series, function(v, k) {
			if (week == k) {
				current = v;
			}
			else {
				past.push({
					matchups : v,
					week : v[0].round
				});
			}
		});

		past.sort(function(a, b) {
			return b.week - a.week;
		});

		env.$template('schedule');
		env.$output({
			week : week,
			matchups : current,
			past_matchups : past,
			scripts : ['schedule'],
		});
		after();
	}
);

/**
 * Show the matches for a given season in summary format
 */
var show_season_matches = new fl.Chain(
	function(env, after) {
		env.filters.matches.select({season : env.season.id})
			.order(db.$desc('id'))
			.exec(after, env.$throw);
	},
	matches.addSummaryInfo,
	function(env, after, matches) {
		env.matches = matches;
		env.$template('season_matches');
		env.$output({
			matches : matches
		});
		after();
	}
);

/**
 * Generate new matchups in swiss format
 */
var generate_matchups = new fl.Chain(
	function(env, after) {
		if (!privs.hasPriv(env.user.privs, privs.MODIFY_SEASON)) {
			env.$throw(new Error('You do not have the ability to generate matchups'));
			return;
		}

		after(env.season.id);
	},
	matches.generateMatchups,
	function(env, after) {
		env.$redirect('/schedule/'+env.season.id);
		after();
	}
);

module.exports.init_routes = function(server) {
	server.add_pre_hook(match_preamble, 'match');

	// @todo add match hook to all routes with :matchid
	server.add_route('/schedule/:seasonid', {
		fn : show_matches,
		pre : ['default', 'optional_user', 'season'],
		post : ['default']
	}, 'get');

	server.add_route('/schedule/:seasonid/next', {
		fn : generate_matchups,
		pre : ['default', 'require_user', 'season'],
		post : ['default']
	}, 'get');

	server.add_route('/matches/:matchid', {
		fn : match_details,
		pre : ['default', 'optional_user', 'match'],
		post : ['default']
	}, 'get');

	server.add_route('/seasons/:seasonid/matches', {
		fn : show_season_matches,
		pre : ['default', 'optional_user', 'season'],
		post : ['default']
	}, 'get');

	server.add_route('/matches/:matchid/remove_player/:steamid', {
		fn : remove_player,
		pre : ['default', 'require_user'],
		post : ['default']
	}, 'get');

	server.add_route('/matches/:matchid/add_player', {
		fn : add_player,
		pre : ['default', 'require_user'],
		post : ['default']
	}, 'post');

	server.add_route('/matches/:matchid/set_result', {
		fn : set_result,
		pre : ['default', 'require_user', 'match'],
		post : ['default']
	}, 'post');

	server.add_route('/matches/:matchid/parse', {
		fn : parse,
		pre : ['default', 'require_user'],
		post : ['default']
	}, 'post');

	server.add_route('/matches/:matchid/roster', {
		fn : submit_roster,
		pre : ['default', 'require_user', 'match'],
		post : ['default']
	}, 'post');

	server.add_route('/matches/:matchid/cancel', {
		fn : cancel_match,
		pre : ['default', 'require_user', 'match'],
		post : ['default']
	}, 'get');

	server.add_route('/matches/:matchid/ready', {
		fn : ready,
		pre : ['default', 'require_user', 'match'],
		post : ['default']
	}, 'get');

	server.add_route('/matches/:matchid/unready', {
		fn : unready,
		pre : ['default', 'require_user', 'match'],
		post : ['default']
	}, 'get');
};
