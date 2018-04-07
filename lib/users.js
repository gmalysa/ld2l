/**
 * Utilities associated with user management that is not related to privs
 */

var _ = require('underscore');
var fl = require('flux-link');
var BigNumber = require('bignumber.js');
var request = require('request');
var config = require('../config.js');

var privs = require('../lib/privs.js');
var audit = require('../lib/audit.js');

const steamOffset = new BigNumber('76561197960265728');

/**
 * Resolve a steam64, steam32, or steam vanity url into a steam id, without knowing what we were
 * given.
 * @param[in] id The unknown steam id to turn into a 64 bit id
 * @return via after The 64 bit steam id
 * @throws Exception if the ID cannot be turned into a steam ID (i.e. given a non-numeric value
 *         for which steam's resolve vanity url could not find a profile)
 * @todo consider caching steam api results locally
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
 * Get someone's medal from opendota
 * @param[in] id32 32-bit steam id
 * @after medal from opendota's api, or 0 if nothing was found
 */
var getMedal = new fl.Chain(
	function(env, after, id32) {
		request('https://api.opendota.com/api/players/' + id32, after);
	},
	function(env, after, error, response, body) {
		var data = JSON.parse(body);
		if (data.rank_tier)
			after(data.rank_tier);
		else
			after(0);
	}
);

/**
 * Retrieve a user object for an existing user in the database with the given steam id
 * @param[in] steamid Some kind of steam identifier (32/64/vanity url)
 * @return user object if they're registered, null if not
 * @throws Exception if steamid is invalid or does not resolve properly
 */
var getUser = new fl.Chain(
	findid64,
	function(env, after, steamid) {
		env.filters.users.select({steamid : steamid})
			.exec(after, env.$throw);
	},
	new fl.Branch(
		function(env, after, rows) {
			if (rows.length != 1) {
				after(false);
			}
			else {
				var steam32 = new BigNumber(rows[0].steamid+'').sub(steamOffset);
				rows[0].id32 = steam32.toString();
				env.getUser$user = rows[0];
				after(true);
			}
		},
		new fl.Chain(
			function(env, after) {
				after(env.getUser$user.steamid);
			},
			privs.getPrivs,
			function(env, after, userPrivs) {
				env.getUser$user.privs = userPrivs;
				after(env.getUser$user);
			}
		),
		function(env, after) {
			after(null);
		}
	)
);

/**
 * Create a new user from some sort of identifier, which might be a 32-bit id, a 64-bit id, or an
 * account name.
 * @param[in] steamid Some kind of steam identifier (32/64/vanity url)
 * @return user object that was created
 */
var addUser = new fl.Chain(
	getUser,
	function(env, after, user) {
		if (user !== null) {
			env.addUser$user = user;
			after();
		}
		else {
			user = {
				steamid : env.profile.id,
				name : env.profile.displayName,
				avatar : env.profile._json.avatar,
			};
			env.addUser$user = user;
			env.filters.users.insert(user).exec(after, env.$throw);
		}
	},
	function(env, after) {
		var steam32 = new BigNumber(env.addUser$user.steamid+'').sub(steamOffset);
		var id32 = steam32.toString();
		env.addUser$user.id32 = id32;
		after(env.addUser$user);
	}
);

/**
 * Vouch a user as another user. This requires that the vouching user has the PRIVS_VOUCH priv
 * @param[in] voucher The person doing vouching
 * @param[in] player The person being vouched
 * @throws Exception on priv error for person doing the vouching
 */
var vouchUser = new fl.Chain(
	function(env, after, voucher, player) {
		if (!privs.hasPriv(voucher.privs, privs.VOUCH)) {
			env.$throw(new Error('You do not have the ability to vouch players'));
			return;
		}
		else {
			env.player = player;
			after(voucher, audit.EVENT_VOUCH, player, {});
		}
	},
	audit.logEvent,
	function(env, after) {
		env.filters.privs.insert({
			steamid : env.player.steamid,
			priv : privs.JOIN_SEASON
		}).exec(after, env.$throw);
	}
).use_local_env(true);

module.exports = {
	getUser : getUser,
	addUser : addUser,
	findUserId : findid64,
	getMedal : getMedal,
	vouchUser : vouchUser
};
