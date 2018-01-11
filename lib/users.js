/**
 * Utilities associated with user management that is not related to privs
 */

var _ = require('underscore');
var fl = require('flux-link');
var BigNumber = require('bignumber.js');
var request = require('request');
var config = require('../config.js');

const steamOffset = new BigNumber('76561197960265728');

/**
 * Resolve a steam64, steam32, or steam vanity url into a steam id, without knowing what we were
 * given.
 * @param[in] id The unknown steam id to turn into a 64 bit id
 * @return via after The 64 bit steam id
 * @throws Exception if the ID cannot be turned into a steam ID (i.e. given a non-numeric value
 *         for which steam's resolve vanity url could not find a profile)
 */
var findid64 = new fl.Branch(
	function(env, after, id) {
		env.$push(id);
		after(/^[0-9]+$/.test(id));
	},
	// ID was numeric, coerce into 64 bit
	function(env, after, id) {
		var steamid = new BigNumber(id+'');
		if (steamid.lessThan(steamOffset)) {
			after(steamid.add(steamOffset).toString());
		}
		else {
			after(steamid.toString());
		}
	},
	// ID was not numeric, try to resolve via webapi
	function(env, after, id) {
		request('http://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/' +
			'?key=' + config.steam_api_key +
			'&vanityurl=' + encodeURIComponent(id),
			function(error, response, body) {
				var data = JSON.parse(body);
				if (1 == data.response.success) {
					after(data.response.steamid);
				}
				else {
					env.$throw(new Error('No steamid found matching given id '+id));
				}
			}
		);
	}
);

/**
 * Retrieve a user object for an existing user in the database with the given steam id
 * @param[in] steamid Some kind of steam identifier (32/64/vanity url)
 * @throws Exception if no user is found
 */
var getUser = new fl.Chain(
	findid64,
	function(env, after, steamid) {
		env.filters.users.select({steamid : steamid})
			.exec(after, env.$throw);
	},
	function(env, after, rows) {
		if (rows.length != 1) {
			after(null);
		}
		var steam32 = new BigNumber(rows[0].steamid+'').sub(steamOffset);
		rows[0].id32 = steam32.toString();
		after(rows[0]);
	}
);

/**
 * Create a new user from some sort of identifier, which might be a 32-bit id, a 64-bit id, or an
 * account name.
 */

module.exports = {
	getUser : getUser,
//	addUser : addUser,
	findUserId : findid64
};
