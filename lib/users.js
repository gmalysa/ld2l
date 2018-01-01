/**
 * Utilities associated with user management that is not related to privs
 */

var _ = require('underscore');
var fl = require('flux-link');
var BigNumber = require('bignumber.js');

/**
 * Retrieve a user object for an existing user in the database with the given steam id
 * @param[in] steamid 64 bit steam id of a user we're looking for
 * @todo fallback to 32 bit id search and name search
 * @throws Exception if no user is found
 */
var getUser = new fl.Chain(
	function(env, after, steamid) {
		env.filters.users.select({steamid : steamid})
			.exec(after, env.$throw);
	},
	function(env, after, rows) {
		if (rows.length != 1) {
			after(null);
		}
		var steamoffset = new BigNumber('76561197960265728');
		var steam32 = new BigNumber(rows[0].steamid+'').sub(steamoffset);
		rows[0].id32 = steam32.toString();
		after(rows[0]);
	}
);

module.exports.getUser = getUser;
