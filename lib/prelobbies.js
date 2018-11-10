/**
 * Store pre-lobby information, which is the configuration of team rosters, etc. that
 * captains agree upon before launching in the client
 */

var fl = require('flux-link');
var db = require('db-filters');
var _ = require('underscore');

var matches = require('../lib/matches.js');
var lobbies = require('../lib/lobbies.js');
var flHelper = require('../lib/fl-helper.js');

// Possible KaedeBot states for a lobby, see KaedeBot repository
const KB_STATE_CREATED = 0;
const KB_STATE_CREATING = 1;
const KB_STATE_FAILED = 2;
const KB_STATE_REMOVED = 3;
const KB_STATE_STARTED = 4;
const KB_STATE_COMPLETE = 5;

// List of prelobby objects
var _prelobbies = {};

/**
 * Save the prelobby object to the master list, used when it no longer has default
 * values
 * @param[in] lobby Prelobby object to save
 */
function _save(lobby) {
	_prelobbies[lobby.matchid] = lobby;
}

/**
 * Remove the prelobby from the master list, which will reset it to defaults
 * @param[in] lobby Prelobby object to remove
 */
function _clear(lobby) {
	delete _prelobbies[lobby.matchid];
}

/**
 * Get or create the prelobby object for a specific match
 * @param[in] The match id that we want a prelobby for
 */
function get(env, after, id) {
	if (id > 0) {
		if (undefined  === _prelobbies[id]) {
			after({
				matchid : id,
				ident : 'ld2l-match-'+id,
				teams : [{
					ready : false,
					players : [],
					captain : null,
				}, {
					ready : false,
					players : [],
					captain : null,
				}],
				started : false,
				kb_state : -1,
				kb_reason : 'No reason'
			});
		}
		else {
			after(_prelobbies[id]);
		}
	}
	else {
		after(null);
	}
}

/**
 * Set the roster for a specific side in the prelobby, also forces the prelobby
 * to be tracked
 * @param[in] lobby
 * @param[in] side
 * @param[in] players
 */
function setRoster(env, after, lobby, side, players) {
	_save(lobby);
	lobby.teams[side].players = players;
	lobby.teams[side].ready = false;
	// @todo socket notification of roster change
	after();
}

/**
 * Synchronous helper to add selected player info to the match object
 * @param[inout] team The team object to update
 * @param[in] lobbyTeam The lobby definition's team object
 */
function addTeamDetails(team, lobbyTeam) {
	team.ready = lobbyTeam.ready;
	_.each(lobbyTeam.players, function(lobbyPlayer) {
		var found = false;
		_.each(team.players, function(player) {
			if (player.steamid == lobbyPlayer.steamid) {
				player.inGameRoster = true;
				found = true;
			}
		});

		// Standin isn't on the normal roster
		if (!found) {
			team.standin = lobbyPlayer;
		}
	});
}

/**
 * Interface function to add details for both the home and away teams
 * @param[in] lobby The prelobby object to read data from
 * @param[in] home The home team object
 * @param[in] away The away team object
 */
function addDetails(lobby, home, away) {
	addTeamDetails(home, lobby.teams[0]);
	addTeamDetails(away, lobby.teams[1]);
}

/**
 * Mark a side as ready, if both sides are ready at the same time the
 * lobby is started
 * @param[in] prelobby The prelobby to update
 * @param[in] side The side that is now ready
 */
var ready = new fl.Chain(
	function(env, after, lobby, side) {
		_save(lobby);

		// Ignore ready-ups from teams without enough players selected
		if (lobby.teams[side].players.length == 5)
			lobby.teams[side].ready = true;

		// Determine if we're ready to start
		env.launch = lobby.teams[0].ready && lobby.teams[1].ready;
		env.lobby = lobby;

		after();
	},
	flHelper.IfTrue('launch',
		function(env, after) {
			after(env.lobby.matchid);
		},
		matches.getDetails,
		function(env, after, match) {
			var getSteamid = function(v) { return v.steamid; };

			// @xxx technically this should be after lobbies.create to
			// ensure it doesn't throw, but we put it here for testing
			env.lobby.started = true;

			// Remap objects to be flat arrays with only steamids
			var teams = [{
				captain : env.lobby.teams[0].players[0].steamid,
				players : _.map(env.lobby.teams[0].players, getSteamid)
			}, {
				captain : env.lobby.teams[1].players[0].steamid,
				players : _.map(env.lobby.teams[1].players, getSteamid)
			}];

			after({
				name : 'LD2L - '+match.home.name+' vs '+match.away.name,
				ident : env.lobby.ident,
				teams : teams,
				tournament : match.season.ticket,
				config : {
					selection_priority_rules : 1
				}
			});
		},
		lobbies.create
	)
).use_local_env(true);

/**
 * Mark a side as unready, unless the lobby has already started.
 * @param[in] prelobby The prelobby to update
 * @param[in] side The side that is no longer ready
 */
var unready = new fl.Chain(
	function(env, after, lobby, side) {
		_save(lobby);

		// Use cancel to stop lobbies we've sent to KBaaS
		if (!lobby.started) {
			lobby.teams[side].ready = false;
		}

		after();
	}
).use_local_env(true);

/**
 * Cancel a lobby that has been started, but only if the current status allows it
 * @param[in] prelobby The lobby object to cancel
 */
var cancel = new fl.Chain(
	function(env, after, prelobby) {
		// We can't stop lobbies after the game started
		env.stop = prelobby.started && prelobby.kb_state < KB_STATE_STARTED;
		env.prelobby = prelobby;
		after();
	},
	flHelper.IfTrue('stop',
		function(env, after) {
			env.prelobby.started = false;
			env.prelobby.teams[0].ready = false;
			env.prelobby.teams[1].ready = false;
			after(env.prelobby.ident);
		},
		lobbies.remove
	)
).use_local_env(true);

/**
 * Update a prelobby with status codes from kaedebot, if given.
 * This assumes the key was verified in the route handler
 */
var KBUpdate = new fl.Chain(
	function(env, after) {
		// ld2l-match-####
		var idents = env.req.body.ident.split('-');
		var id = parseInt(idents[2]);
		env.update = false;
		env.results = false;

		// Make sure it is a match with a prelobby
		if (idents[0] == 'ld2l' && idents[1] == 'match' && !isNaN(id)) {
			env.id = id;
			env.update = true;
		}

		// Check if this is reporting the end of a match
		if (KB_STATE_COMPLETE == env.req.body.state) {
			env.results = true;
		}

		after();
	},
	flHelper.IfTrue('update',
		function(env, after) {
			after(env.id);
		},
		get,
		function(env, after, prelobby) {
			prelobby.kb_state = env.req.body.state;
			prelobby.kb_reason = env.req.body.reason;
			_save(prelobby);
			after();
		}
	),
	flHelper.IfTrue('results',
		function(env, after) {
			after(env.req.body, lobbies.RESULTS_FORMAT_KAEDEBOT, env.id);
		},
		lobbies.parseResults
	)
).use_local_env(true);

module.exports = {
	get : get,
	addDetails : addDetails,
	setRoster : setRoster,
	ready : ready,
	unready : unready,
	cancel : cancel,
	KBUpdate: KBUpdate
};
