/**
 * Utilities associated with team management
 * @todo integrate audit log here
 */

var _ = require('underscore');
var fl = require('flux-link');
var users = require('../lib/users.js');
var privs = require('../lib/privs.js');

var animals = require('animals');
var adjectives = require('superb');

/**
 * Looks up a team matching the given team id (in our terms, not dota's team id
 * @param[in] id The team ID in the database to look up
 * @return Team object
 */
var get = new fl.Chain(
	function(env, after, id) {
		env.filters.teams.select({id : id}).exec(after, env.$throw);
	},
	function(env, after, results) {
		if (0 == results.length) {
			after({});
		}
		else {
			// @todo add captain and player objects
			after(results[0]);
		}
	}
);

/**
 * Add a player to a team, automatically removing them from their previous team
 * @param[in] user Change this user's team
 * @param[in] team Set it to this team
 */
var setTeam = new fl.Chain(
	function(env, after, user, team) {
		env.setTeam$user = user;
		env.setTeam$team = team;
		env.filters.signups.select({
			season : team.seasonid,
			steamid : user.steamid
		}).exec(after, env.$throw);
	},
	function(env, after, signup) {
		if (0 == signup.length) {
			env.$throw(new Error(
				`{user.name} isn't signed up for the same season as {env.setTeam$team.name}`
			));
			return;
		}
		else {
			env.filters.signups.update({
				teamid : env.setTeam$team.id
			}, {
				season : env.setTeam$team.seasonid,
				steamid : env.setTeam$user.steamid
			}).exec(after, env.$throw);
		}
	}
);

/**
 * Set a player as a team's captain, adding them to the team as well
 * @param[in] user Change this person to the captain
 * @param[in] team Set them as captain of this team
 */
var setCaptain = new fl.Chain(
	function(env, after, user, team) {
		env.setCaptain$user = user;
		env.setCaptain$team = team;
		env.filters.teams.update(
			{captainid : captain.steamid},
			{id : team.id}
		).exec(after, env.$throw);
	},
	function(env, after, result) {
		after(env.setCaptain$user, env.setCaptain$team);
	},
	setTeam
);

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

		env.create$captain = captain;
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
		env.create$team = team;
		after(env.create$captain, team);
	},
	setTeam,
	function(env, after) {
		after(env.create$team);
	}
);

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
 * Rename a team, available to captains and admins
 * @param[in] user The user renaming the team
 * @param[in] team The team object to rename
 * @param[in] name The new name to give the team
 */
var rename = new fl.Chain(
	function(env, after, user, team, name) {
		if (!(privs.hasPriv(user.privs, privs.MODIFY_SEASON)
		      || isCaptain(team, user))) {
			env.$throw(new Error(user.name + ' is not authorized to rename teams.'));
			return;
		}

		env.filters.teams.update({name : name}, {id : team.id}).exec(after, env.$throw);
	}
);

module.exports = {
	create : create,
	get : get,
	rename : rename,
	isCaptain : isCaptain,
	setTeam : setTeam,
	setCaptain : setCaptain
};
