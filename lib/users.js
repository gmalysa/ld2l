/**
 * Utilities associated with user management that is not related to privs
 */

var _ = require('underscore');
var fl = require('flux-link');
var db = require('db-filters');
var BigNumber = require('bignumber.js');
var request = require('request');
var config = require('../config.js');

var privs = require('../lib/privs.js');
var audit = require('../lib/audit.js');

const steamOffset = new BigNumber('76561197960265728');

/**
 * Convert a given 64 bit ID to 32 bits
 * @param[in] id 64 bit steam ID, not checked for validity
 * @return 32 bit version of that ID, still as a string
 */
function getID32(id) {
	var steam32 = new BigNumber(id+'').sub(steamOffset);
	return steam32.toString();
}

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
 * Search for a user given a partially matching string. If the string is all numbers
 * then it will also look for a matching steam id 64 or id 64. This will check steam
 * name, display name, and discord name if available
 * @param[in] name Partial name string
 * @return array of matching user records
 */
var search = new fl.Chain(
	function(env, after, name) {
		env.name = name;
		env.matches = [];
		env.str = '%'+env.name+'%';
		after();
	},
	new fl.Branch(
		function(env, after) {
			after(/^[0-9]+$/.test(env.name));
		},
		new fl.Chain(
			function(env, after) {
				env.filters.users.select({steamid : db.$like(env.str)})
					.exec(after, env.$throw);
			},
			function(env, after, results) {
				if (results.length > 0) {
					Array.prototype.push.apply(env.matches, results);
				}
				after();
			}
		),
		function(env, after) {
			// Dummy else clause to skip to the next block
			after();
		}
	),
	function(env, after) {
		env.filters.users.select({name : db.$like(env.str)})
			.exec(after, env.$throw);
	},
	function(env, after, results) {
		if (results.length > 0) {
			Array.prototype.push.apply(env.matches, results);
		}

		env.filters.users.select({display_name : db.$like(env.str)})
			.exec(after, env.$throw);
	},
	function(env, after, results) {
		if (results.length > 0) {
			Array.prototype.push.apply(env.matches, results);
		}

		env.filters.users.select({discord_name : db.$like(env.str)})
			.exec(after, env.$throw);
	},
	function(env, after, results) {
		if (results.length > 0) {
			Array.prototype.push.apply(env.matches, results);
		}

		after(_.map(_.uniq(env.matches, function(e) {
			return e.steamid;
		}), function(v, k) {
			return _.pick(v, ['steamid', 'display_name', 'avatar']);
		}));
	}
).use_local_env(true);

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
				display_name : env.profile.displayName,
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
 * Rename a user
 * @param[in] actor The user object doing the renaming
 * @param[in] name The new name to set
 * @param[in] user The user being renamed
 */
var rename = new fl.Chain(
	function(env, after, actor, name, user) {
		if (null == user) {
			env.$throw(new Error('Invalid user supplied to rename.'));
			return;
		}

		if (!(actor.steamid == user.steamid
			|| privs.hasPriv(actor.privs, privs.MODIFY_ACCOUNT))) {
			env.$throw(new Error(actor.display_name + ' does not have the ability to '
				+ ' rename ' + user.steamid));
			return;
		}

		env.actor = actor;
		env.newName = name;
		env.renameUser = user;

		env.filters.users.update({
			display_name : name
		}, {
			steamid : user.steamid
		}).limit(1).exec(after, env.$throw);
	},
	function(env, after) {
		after(env.actor, audit.EVENT_RENAME, env.renameUser, {
			old : env.renameUser.display_name,
			new : env.newName
		});
	},
	audit.logUserEvent
).use_local_env(true);

/**
 * Get a user's signup/team history
 * @param[in] user The user to get history for
 */
var getSignupHistory = new fl.Chain(
	function(env, after, user) {
		if (null === user) {
			env.$throw(new Error('Invalid user supplied to history'));
			return;
		}

		env.player = user;
		env.filters.signups.select({steamid : user.steamid}).exec(after, env.$throw);
	},
	function(env, after, signups) {
		env.signups = signups;
		env.idx = 0;
		env.filters.seasons.select({
			id : env.signups.map(function(v, k) { return v.season; })
		}).exec(after, env.$throw);
	},
	function(env, after, results) {
		var seasons = {};
		_.each(results, function(v, k) {
			seasons[v.id] = v;
		});

		// Replace season id with season row
		env.signups.forEach(function(v, k) {
			v.season = seasons[v.season];
		});

		after(env.signups);
	}
).use_local_env(true);

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
	audit.logUserEvent,
	function(env, after) {
		env.filters.privs.insert({
			steamid : env.player.steamid,
			priv : privs.JOIN_SEASON
		}).exec(after, env.$throw);
	}
).use_local_env(true);

const medalTable = {
	10:  0, 11:  0, 12:  0, 13:  0, 14:  0, 15:  0,
	20:  0, 21:  0, 22:  0, 23:  0, 24:  0, 25:  0,
	30:  1, 31:  2, 32:  3, 33:  4, 34:  5, 35:  6,
	40:  7, 41:  8, 42:  9, 43: 10, 44: 11, 45: 12,
	50: 13, 51: 14, 52: 15, 53: 16, 54: 17, 55: 18
};

/**
 * Map a medal from the valve numbers to the number that should be used for determining
 * draft order
 * @param[in] medal The integer medal value
 * @return The linearized/adjusted medal value
 */
function adjustMedal(medal) {
	if (medalTable[medal])
		return medalTable[medal];
	return 0;
}

module.exports = {
	getUser : getUser,
	addUser : addUser,
	findUserId : findid64,
	getMedal : getMedal,
	vouchUser : vouchUser,
	adjustMedal : adjustMedal,
	getID32 : getID32,
	rename : rename,
	getSignupHistory : getSignupHistory,
	search : search
};
