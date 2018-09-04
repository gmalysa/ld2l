/**
 * Utilities associated with season management not related to privs
 */

var _ = require('underscore');
var fl = require('flux-link');
var db = require('db-filters');

var users = require('../lib/users.js');
var privs = require('../lib/privs.js');
var teams = require('../lib/teams.js');

// Status types for season play state
const SEASON_STATUS_HIDDEN = 0;
const SEASON_STATUS_SIGNUPS = 1;
const SEASON_STATUS_PLAYING = 2;
const SEASON_STATUS_FINISHED = 3;
const SEASON_STATUS_DRAFTING = 4;

// Season types for configuring season
const SEASON_TYPE_DRAFT = 0;			// "normal" season where people are drafted onto teams
const SEASON_TYPE_IHL = 1;				// In-house league season type, no teams

/**
 * Check if a value given is a valid season status value
 * @param[in] mixed status The status to test
 * @return true if it is an integer and one of the season status constants, false otherwise
 */
function isValidStatus(status) {
	return (status >= SEASON_STATUS_HIDDEN && status <= SEASON_STATUS_DRAFTING);
}

/**
 * Check if a given value is a valid season type value
 * @param[in] mixed type The type to test
 * @return true if it is an integer and one of the type constants, false otherwise
 */
function isValidType(type) {
	return (type >= SEASON_TYPE_DRAFT && type <= SEASON_TYPE_IHL);
}

/**
 * Get the vouch status for an array of signups
 * @param[in] signups The array of signups to get vouch status for
 * @return Array of signups with vouched property added
 */
var addVouchStatus = new fl.Chain(
	function(env, after, signups) {
		env.signups = signups;
		if (signups.length > 0) {
			env.filters.privs.select({
				steamid : signups.map(function(v, k) {
					return v.steamid;
				}),
				priv : privs.JOIN_SEASON
			}).exec(after, env.$throw);
		}
		else {
			after([]);
		}
	},
	function(env, after, results) {
		var privTable = {};
		results.forEach(function(v, k) {
			privTable[v.steamid] = 1;
		});
		env.signups.forEach(function(v, k) {
			if (privTable[v.steamid] !== undefined)
				v.vouched = 1;
			else
				v.vouched = 0;
		});
		after(env.signups);
	}
).use_local_env(true);

/**
 * Load signup details which will include vouch status for each signup
 * @param[in] id Season ID to load for
 * @return array of signups
 */
var getSignups = new fl.Chain(
	function(env, after, id) {
		env.filters.signups.select({season : id})
			.left_join(env.filters.users, 'u')
			.on(['steamid', 'steamid'])
			.order(0, db.$asc('time'))
			.exec(after, env.$throw);
	},
	addVouchStatus,
	function(env, after, signups) {
		signups.forEach(function(v, k) {
			v.linear_medal = users.adjustMedal(v.medal);
			v.id32 = users.getID32(v.steamid);
		});
		after(signups);
	}
).use_local_env(true);

/**
 * Load season details, which will include all signups (and later, team info, etc.)
 * @param[in] id Season ID
 */
var getSeason = new fl.Chain(
	function(env, after, id) {
		env.id = id;
		env.filters.seasons.select({id : id}).exec(after, env.$throw);
	},
	function(env, after, results) {
		if (0 == results.length) {
			env.$throw(new Error('No matching season found'));
			return;
		}

		env.season = results[0];
		after(env.id);
	},
	getSignups,
	function(env, after, signups) {
		env.season.signups = signups;
		after(env.season);
	}
).use_local_env(true);

/**
 * Load basic season details which does not include signups
 * @param[in] id The season ID to load
 */
var getSeasonBasic = new fl.Chain(
	function(env, after, id) {
		env.filters.seasons.select({id : id}).exec(after, env.$throw);
	},
	function(env, after, results) {
		if (0 == results.length) {
			env.$throw(new Error('No matching season found.'));
			return;
		}

		after(results[0]);
	}
).use_local_env(true);

module.exports = {
	STATUS_HIDDEN : SEASON_STATUS_HIDDEN,
	STATUS_SIGNUPS : SEASON_STATUS_SIGNUPS,
	STATUS_PLAYING : SEASON_STATUS_PLAYING,
	STATUS_FINISHED : SEASON_STATUS_FINISHED,
	STATUS_DRAFTING : SEASON_STATUS_DRAFTING,

	TYPE_DRAFT : SEASON_TYPE_DRAFT,
	TYPE_IHL : SEASON_TYPE_IHL,

	isValidStatus : isValidStatus,
	isValidType : isValidType,
	getSeason : getSeason,
	getSeasonBasic : getSeasonBasic
};
