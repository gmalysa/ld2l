/**
 * Utilities associated with privilege management
 * Everything is structured to work as part of a flux-link chain or is a constant
 * @todo integrate audit log
 */

var _ = require('underscore');
var fl = require('flux-link');

const PRIVS_MODIFY_ACCOUNT = 1;
const PRIVS_MODIFY_SEASON = 2;

/**
 * Internal helper that synchronously tests for a priv being available in the priv array
 * @param[in] privList array of priv IDs to test against
 * @param[in] priv Numeric priv to check for
 * @return bool true if priv is in privList, false otherwise
 */
function _hasPriv(privList, priv) {
	for (var testPriv : privList) {
		if (priv == privList[testPriv])
			return true;
	}
	return false;
}

/**
 * Internal helper for checking that someone has privs to do stuff
 * @param[in] env.user The user to test for the modify accounts priv
 * @throw insufficient privs if they aren't allowed to modify accounts
 */
function _checkPrivs(env, after, steamid, priv) {
	env.$push(steamid);
	env.$push(priv);
	if (!env.user) {
		env.$throw(new Error('Must be logged in to modify privileges'));
	}
	else {
		after(env.user.steamid);
	}
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
var addPriv = new fl.Chain(
	_checkPrivs,
	getPrivs,
	function(env, after, adminPrivs) {
		var priv = env.$pop(priv);
		var steamid = env.$pop(priv);

		if (!_hasPriv(adminPrivs, PRIVS_MODIFY_ACCOUNT)) {
			env.$throw(new Error('You do not have the ability to modify accounts'));
		}
		else {
			env.filters.privs.insert({steamid : steamid, priv : priv}).exec(after, env.$throw);
		}
	}
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
var removePriv = new fl.Chain(
	_checkPrivs,
	getPrivs,
	function(env, after, adminPrivs) {
		var priv = env.$pop(priv);
		var steamid = env.$pop(priv);

		if (!_hasPriv(adminPrivs, PRIVS_MODIFY_ACCOUNT)) {
			env.$throw(new Error('You do not have the ability to modify accounts'));
		}
		else {
			env.filters.privs.delete({steamid : steamid, priv : priv})
				.limit(1)
				.exec(after, env.$throw);
		}
	}
);
removePriv.name = 'removePriv';

module.exports = {
	MODIFY_ACCOUNT : PRIVS_MODIFY_ACCOUNT,
	MODIFY_SEASON : PRIVS_MODIFY_SEASON,

	getPrivs : getPrivs,
	addPriv : addPrivs,
	removePriv : removePriv
};
