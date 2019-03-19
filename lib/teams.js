/**
 * Utilities associated with team management
 * @todo clear cache entries when team mutators are used
 */

var _ = require('underscore');
var fl = require('flux-link');
var users = require('../lib/users.js');
var privs = require('../lib/privs.js');
var audit = require('../lib/audit.js');
var seasons = require('../lib/seasons.js');

var animals = require('animals');
var adjectives = require('superb');

/**
 * Get the players and captains on a team and stick them onto the object
 * @param[in] team The team object to start with
 * @return Same team object with players and captain fields filled in
 */
var addRoster = new fl.Chain(
	function(env, after, team) {
		env.team = team;
		env.filters.signups.select({teamid : team.id})
			.left_join(env.filters.users, 'users')
			.on(['steamid', 'steamid'])
			.exec(after, env.$throw);
	},
	function(env, after, players) {
		// Skip player info if the roster is empty, which happens during creation
		if (players.length > 0)
		{
			var captainIndex = -1;
			env.team.players = players;

			players.forEach(function(v, k) {
				v.linear_medal = users.adjustMedal(v.medal, env.team.season.linearization);
				if (isCaptain(env.team, v)) {
					env.team.captain = v;
					captainIndex = k;
				}
			});

			env.team.players.splice(captainIndex, 1);
			updateMedalAverage(env.team);
		}
		after(env.team);
	}
).use_local_env(true);

/**
 * Synchronous function to compute the average medal for a team
 * @param[in] team The team object whose average medal should be recomputed
 */
function updateMedalAverage(team) {
	team.medal = team.players.reduce(function(memo, v) {
		return memo + users.adjustMedal(v.medal, team.season.linearization);
	}, users.adjustMedal(team.captain.medal, team.season.linearization));
	team.medal = team.medal / (1 + team.players.length);
}

/**
 * Looks up a team matching the given team id (in our terms, not dota's team id
 * @param[in] id The team ID in the database to look up
 * @return Team object
 */
var get = new fl.Chain(
	function(env, after, id) {
		env.filters.teams.select({id : id}).exec(after, env.$throw);
	},
	new fl.Branch(
		function(env, after, results) {
			if (0 == results.length) {
				env.team = {};
				after(false);
			}
			else {
				env.team = results[0];
				after(true);
			}
		},
		new fl.Chain(
			function(env, after) {
				after(env.team.seasonid);
			},
			seasons.getSeasonBasic,
			function(env, after, season) {
				env.team.season = season;
				env.team.disbanded = env.team.disbanded > 0 ? true : false;
				after(env.team);
			},
			addRoster
		),
		function(env, after) {
			after({});
		}
	)
).use_local_env(true);

/**
 * Look up a team using the team cache already in this environment
 * @param[in] id The team id to look for
 * @return Team object
 */
var getCached = new fl.Branch(
	function(env, after, id) {
		if (env._teamCache == undefined)
		   env._teamCache = [];

		env.id = id;
		after(env._teamCache[env.id] !== undefined);
	},
	function(env, after) {
		after(env._teamCache[env.id]);
	},
	new fl.Chain(
		function(env, after) {
			after(env.id);
		},
		get,
		function(env, after, team) {
			env._teamCache[env.id] = team;
			after(team);
		}
	)
).use_local_env(true);

/**
 * Add a player to a team, automatically removing them from their previous team
 * @param[in] user Change this user's team
 * @param[in] team Set it to this team
 */
var setTeam = new fl.Chain(
	function(env, after, user, team) {
		env.player= user;
		env.team = team;
		env.filters.signups.select({
			season : team.seasonid,
			steamid : user.steamid
		}).exec(after, env.$throw);
	},
	new fl.Branch(
		function(env, after, signup) {
			if (0 == signup.length) {
				env.$throw(new Error(
					env.player.display_name + ' isn\'t signed up for the same season '
					+ ' as ' + env.team.name
				));
				return;
			}

			after(signup.teamid > 0);
		},
		new fl.Chain(
			function(env, after) {
				after(env.user, audit.EVENT_REMOVE_PLAYER, env.team, {
					player : env.player.steamid
				});
			},
			audit.logTeamEvent
		),
		function(env, after) {
			after();
		}
	),
	function(env, after) {
		env.filters.signups.update({
			teamid : env.team.id
		}, {
			season : env.team.seasonid,
			steamid : env.player.steamid
		}).exec(after, env.$throw);
	},
	function(env, after) {
		if (env.team.id > 0) {
			// Adding to a team
			after(env.user, audit.EVENT_ADD_PLAYER, env.team, {
				player : env.player.steamid
			});
		}
		else {
			// Removing from a team
			after(env.user, audit.EVENT_REMOVE_PLAYER, env.team, {
				player : env.player.steamid
			});
		}
	},
	audit.logTeamEvent
).use_local_env(true);

/**
 * Removes a player from their current team
 * @param[in] user Remove this person from the team
 * @param[in] team The team remove them from
 */
var removePlayer = new fl.Chain(
	function(env, after, user, team) {
		env.player = user;

		env.filters.signups.update({
			teamid : 0
		}, {
			season : team.seasonid,
			steamid : user.steamid
		}).exec(after, env.$throw);
	},
	function(env, after) {
		after(env.user, audit.EVENT_REMOVE_PLAYER, env.team, {
			player : env.player.steamid
		});
	},
	audit.logTeamEvent
).use_local_env(true);

/**
 * Set a player as a team's captain, adding them to the team as well
 * @param[in] user Change this person to the captain
 * @param[in] team Set them as captain of this team
 */
var setCaptain = new fl.Chain(
	function(env, after, user, team) {
		env.captain  = user;
		env.team = team;
		env.filters.teams.update(
			{captainid : user.steamid},
			{id : team.id}
		).exec(after, env.$throw);
	},
	function(env, after, result) {
		after(env.captain, env.team);
	},
	setTeam,
	function(env, after) {
		after(env.user, audit.EVENT_SET_CAPTAIN, env.team, {
			captain : env.captain.steamid
		});
	},
	audit.logTeamEvent
).use_local_env(true);

/**
 * Create a new team in the database
 * @param[in] user The user creating this team
 * @param[in] captain User object for the captain
 * @param[in] season Season ID to create team for
 * @return team object
 */
var create = new fl.Chain(
	function(env, after, user, captain, season) {
		if (!privs.hasPriv(user.privs, privs.MODIFY_SEASON)) {
			env.$throw(new Error(user.name+' cannot create new teams.'));
			return;
		}

		var name = adjectives() + ' ' + animals();

		env.actor = user;
		env.captain = captain;
		env.filters.teams.insert({
			captainid : captain.steamid,
			seasonid : season,
			name : name
		}).exec(after, env.$throw);
	},
	function(env, after, result) {
		if (result.insertId > 0) {
			after(result.insertId);
		}
		else {
			env.$throw(new Error('DB error creating a new team'));
		}
	},
	get,
	function(env, after, team) {
		env.team = team;
		after(env.actor, audit.EVENT_CREATE, env.team, {
			captain : env.captain.steamid
		});
	},
	audit.logTeamEvent,
	function(env, after) {
		after(env.captain, env.team);
	},
	setTeam,
	function(env, after) {
		after(env.team);
	}
).use_local_env(true);

/**
 * Determine if the given user is the captain of the given team
 * @param[in] team The team to check
 * @param[in] captain The captain to check
 * @return true if he is the captain, false otherwise
 */
function isCaptain(team, captain) {
	return team.captainid == captain.steamid;
}

/**
 * Determine if the given user is a member of the given team
 * @param[in] team The team to chekc
 * @param[in] player The player to check
 * @return true if they are on the team as player or captain
 */
function isOnTeam(team, player) {
	var match = _.find(team.players, function(v) {
		return v.steamid == player.steamid;
	});

	if (undefined === match)
		return isCaptain(team, player);
	return true;
}

/**
 * Rename a team, available to captains and admins
 * @param[in] user The user renaming the team
 * @param[in] team The team object to rename
 * @param[in] name The new name to give the team
 */
var rename = new fl.Chain(
	function(env, after, user, team, name) {
		if (!(privs.hasPriv(user.privs, privs.MODIFY_SEASON)
		      || isCaptain(team, user))) {
			env.$throw(new Error(user.display_name + ' is not authorized to rename teams.'));
			return;
		}

		env.team = team;
		env.name = name;

		after(user, audit.EVENT_RENAME, team, {
			old : team.name,
			new : name
		});
	},
	audit.logTeamEvent,
	function(env, after) {
		env.filters.teams.update({
			name : env.name
		}, {
			id : env.team.id
		}).exec(after, env.$throw);
	}
).use_local_env(true);

/**
 * Disband a team, available to admins only
 * @param[in] user The user disbanding the team
 * @param[in] team The team being disbanded
 */
var disband = new fl.Chain(
	function(env, after, user, team) {
		if (!privs.hasPriv(user.privs, privs.MODIFY_SEASON)) {
			env.$throw(new Error(user.display_name + ' is not authorized to disband teams'));
			return;
		}

		env.actor = user;
		env.team = team;

		env.filters.teams.update({disbanded : 1}, {id : team.id})
			.exec(after, env.$throw);
	},
	function(env, after) {
		after(env.actor, audit.EVENT_DISBAND, env.team, {});
	},
	audit.logTeamEvent
).use_local_env(true);

/**
 * Un-disband a team, available to admins only
 * @param[in] user The user un-disbanding the team
 * @param[in] team The team being un-disbanded
 */
var undisband = new fl.Chain(
	function(env, after, user, team) {
		if (!privs.hasPriv(user.privs, privs.MODIFY_SEASON)) {
			env.$throw(new Error(user.display_name + ' is not authorized to un-disband teams'));
			return;
		}

		env.actor = user;
		env.team = team;

		env.filters.teams.update({disbanded : 0}, {id : team.id})
			.exec(after, env.$throw);
	},
	function(env, after) {
		after(env.actor, audit.EVENT_UNDISBAND, env.team, {});
	},
	audit.logTeamEvent
).use_local_env(true);

/**
 * Get a list of all teams in a season, with all information populated onto them
 * @param[in] season ID of the season to get teams for
 * @return Array of team objects
 */
var getAllTeams = new fl.Chain(
	function(env, after, season) {
		env.filters.teams.select({
			seasonid : season
		}).exec(after, env.$throw);
	},
	function(env, after, teams) {
		env.teams = teams;
		env.idx = 0;
		after();
	},
	new fl.LoopChain(
		function(env, after) {
			after(env.idx < env.teams.length);
		},
		function(env, after) {
			after(env.teams[env.idx].id);
		},
		getCached,
		function(env, after, team) {
			env.teams[env.idx] = team;
			env.idx += 1;
			after();
		}
	),
	function(env, after) {
		after(env.teams);
	}
).use_local_env(true);

module.exports = {
	create : create,
	get : get,
	getCached : getCached,
	rename : rename,
	isCaptain : isCaptain,
	isOnTeam : isOnTeam,
	setTeam : setTeam,
	setCaptain : setCaptain,
	removePlayer : removePlayer,
	getAllTeams : getAllTeams,
	updateMedalAverage : updateMedalAverage,
	disband : disband,
	undisband : undisband
};
