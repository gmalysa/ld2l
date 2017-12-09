/**
 * Utilities associated with privilege management
 * Everything is structured to work as part of a flux-link chain or is a constant
 * @todo integrate audit log
 */

var _ = require('underscore');
var fl = require('flux-link');

const PRIVS_MODIFY_ACCOUNT = 1;
const PRIVS_MODIFY_SEASON = 2;
const PRIVS_JOIN_SEASON = 3;
const PRIVS_VIEW_PRIVS = 4;

/**
 * Helper that synchronously tests for a priv being available in the priv array
 * @param[in] privList array of priv IDs to test against
 * @param[in] priv Numeric priv to check for
 * @return bool true if priv is in privList, false otherwise
 */
function _hasPriv(privList, priv) {
	for (var testPriv in privList) {
		if (priv == privList[testPriv])
			return true;
	}
	return false;
}

/**
 * Generate an exception when called
 * @throw exception for not being logged in
 */
function _generateLoginException(env, after) {
	env.$throw(new Error('You must be logged in.'));
}

/**
 * Internal helper for checking that someone has privs to do stuff with getPrivs
 * @param[in] env.user The user to test for the modify accounts priv
 */
function _pushSteamID(env, after) {
	after(env.user.steamid);
}

/**
 * This loads privilege information for an arbitrary steamid
 * @param[in] steamid User steamid to load priv information
 * @return privs array passed as parameter to next function
 */
function getPrivs(env, after, steamid) {
	env.filters.privs.select({steamid : steamid}).exec(function(rows) {
		var privs = _.map(rows, function(v, k) {
			return v.priv;
		});
		after(privs);
	}, env.$throw);
}

/**
 * Add a priv to a given steamid, this requires that the env.user has the PRIVS_MODIFY_ACCOUNT priv
 * available to them
 * @param[in] env.user The user doing the action to test privs against
 * @param[in] steamid The Steam ID we're adding a priv to
 * @param[in] priv The numerical priv being added
 * @throw If env.user does not have the right privs
 */
var addPriv = new fl.Branch(
	isLoggedIn,
	new fl.Chain(
		_pushSteamID,
		getPrivs,
		function(env, after, adminPrivs) {
			var priv = env.$pop();
			var steamid = env.$pop();

			if (!_hasPriv(adminPrivs, PRIVS_MODIFY_ACCOUNT)) {
				env.$throw(new Error('You do not have the ability to modify accounts'));
			}
			else {
				env.filters.privs.insert({steamid : steamid, priv : priv}).exec(after, env.$throw);
			}
		}
	),
	_generateLoginException
);
addPriv.name = 'addPriv';

/**
 * Remove a priv from a given steamid, regardless of whether it exists. This requires that env.user
 * has the PRIVS_MODIFY_ACCOUNT priv available to them
 * @param[in] env.user The user doing the action to test privs against
 * @param[in] steamid The Steam ID we're removing a priv from
 * @param[in] priv The numerical priv being added
 * @throw If env.user does not have the right privs
 */
var removePriv = new fl.Branch(
	isLoggedIn,
	new fl.Chain(
		_pushSteamID,
		getPrivs,
		function(env, after, adminPrivs) {
			var priv = env.$pop();
			var steamid = env.$pop();

			if (!_hasPriv(adminPrivs, PRIVS_MODIFY_ACCOUNT)) {
				env.$throw(new Error('You do not have the ability to modify accounts'));
			}
			else {
				env.filters.privs.delete({steamid : steamid, priv : priv})
					.limit(1)
					.exec(after, env.$throw);
			}
		}
	),
	_generateLoginException
);
removePriv.name = 'removePriv';

/**
 * Determine if there is a user account logged in on the current environment variable
 * @param[in] env.user checked for existence
 * @return true if user is logged in, false otherwise
 */
function isLoggedIn(env, after) {
	if (env.req.user && env.req.user.steamid) {
		env.user = env.req.user;
		after(true);
	}
	else {
		after(false);
	}
}

module.exports = {
	MODIFY_ACCOUNT : PRIVS_MODIFY_ACCOUNT,
	MODIFY_SEASON : PRIVS_MODIFY_SEASON,
	JOIN_SEASON : PRIVS_JOIN_SEASON,
	VIEW_PRIVS : PRIVS_VIEW_PRIVS,

	getPrivs : getPrivs,
	addPriv : addPriv,
	removePriv : removePriv,
	isLoggedIn : isLoggedIn,
	hasPriv : _hasPriv
};
