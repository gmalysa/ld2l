/**
 * Utilities associated with season management not related to privs
 */

var _ = require('underscore');
var fl = require('flux-link');
var db = require('db-filters');

var users = require('../lib/users.js');
var privs = require('../lib/privs.js');

// Status types for season play state
const SEASON_STATUS_HIDDEN = 0;
const SEASON_STATUS_SIGNUPS = 1;
const SEASON_STATUS_PLAYING = 2;
const SEASON_STATUS_FINISHED = 3;
const SEASON_STATUS_DRAFTING = 4;

// Season types for configuring season
const SEASON_TYPE_DRAFT = 0;			// "normal" season where people are drafted onto teams
const SEASON_TYPE_IHL = 1;				// In-house league season type, no teams

// Season linearization table selections for medal adjustment
const SEASON_LINEAR_2018S1 = 0;		// 2018 ladder season 1 (jan-august)
const SEASON_LINEAR_2018S2 = 1;		// 2018 ladder season 2 (august-end)
const SEASON_LINEAR_MAX_MMR = 2;	// Use max of solo and party mmr

// Linearization tables for different medal sequences
const medalTable = {
	0 : { // LINEARIZATION_2018S1
		10:  0, 11:  0, 12:  0, 13:  0, 14:  0, 15:  0,
		20:  0, 21:  0, 22:  0, 23:  0, 24:  0, 25:  0,
		30:  1, 31:  2, 32:  3, 33:  4, 34:  5, 35:  6,
		40:  7, 41:  8, 42:  9, 43: 10, 44: 11, 45: 12,
		50: 13, 51: 14, 52: 15, 53: 16, 54: 17, 55: 18,
		60: 19, 61: 20, 62: 21, 63: 22, 64: 23, 65: 24
	},
	1 : { // LINEARIZATION_2018S2
		11:  0, 12:  0, 13:  0, 14:  0, 15:  0,
		21:  0, 22:  0, 23:  0, 24:  0, 25:  0,
		31:  1, 32:  2, 33:  3, 34:  4, 35:  5,
		41:  6, 42:  7, 43:  8, 44:  9, 45: 10,
		51: 11, 52: 12, 53: 13, 54: 14, 55: 15,
		61: 16, 62: 17, 63: 18, 64: 19, 65: 20
	}
}

/**
 * Get a user's draft value, which is whatever quantity was used for a particular
 * season based on the linearization constant provided.
 * @param[in] signup The signup object being linearized
 * @param[in] linear The linearization constant which selects a method
 * @return The actual draft value of this signup
 */
function getDraftValue(signup, linear) {
	if (SEASON_LINEAR_MAX_MMR == linear)
		return Math.max(signup.solo_mmr, signup.party_mmr, 1000);
	if (medalTable[linear][signup.medal])
		return medalTable[linear][signup.medal];
	return 0;
}

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
 * Check if the given value is a valid linearization type
 * @param[in] mixed linear The linearization to test
 * @return true if it is an integer and is one of the linearization constants
 */
function isValidLinearization(linear) {
	return (linear >= SEASON_LINEAR_2018S1 && linear <= SEASON_LINEAR_MAX_MMR);
}

/**
 * Check if the given season is accepting signups
 * @param[in] season s The season to check
 * @return bool True if accepting signups
 */
function isAcceptingSignups(s) {
	if (SEASON_STATUS_FINISHED == s.status || SEASON_STATUS_HIDDEN == s.status)
		return false;
	return true;
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
 * @param[in] season The season object to load signups for (of basic type)
 * @param[in] filter Extra db-filter fields for selecting signups
 * @todo add banned/ineligible flags through addVouchStatus
 * @return array of signups
 */
var getSignups = new fl.Chain(
	function(env, after, season, filter) {
		var cond = _.extend({season : season.id}, filter);
		env.season = season;
		env.filters.signups.select(cond)
			.left_join(env.filters.users, 'u')
			.on(['steamid', 'steamid'])
			.order(0, db.$asc('time'))
			.exec(after, env.$throw);
	},
	addVouchStatus,
	function(env, after, signups) {
		signups.forEach(function(v, k) {
			v.linear_medal = getDraftValue(v, env.season.linearization);
			v.id32 = users.getID32(v.steamid);
		});
		after(signups);
	}
).use_local_env(true);

/**
 * Get the list of all standins for a season, which includes both voluntary and forced standins
 * @param[in] season The season object to find standins for
 * @return array of standin signups
 */
var getStandins = new fl.Chain(
	function(env, after, season) {
		env.season = season;
		after(env.season, {valid_standin : 1, teamid : 0, hidden : 0});
	},
	getSignups,
	function(env, after, signups) {
		env.signups = signups;
		after(env.season, {standin : 1, teamid : 0, hidden : 0});
	},
	getSignups,
	function(env, after, signups) {
		signups = _.uniq(env.signups.concat(signups), function(v) {
			return v.steamid;
		});

		after(signups);
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

/**
 * Load season details, which will include all signups (and later, team info, etc.)
 * @param[in] id Season ID
 */
var getSeason = new fl.Chain(
	getSeasonBasic,
	function(env, after, season) {
		env.season = season;
		after(season, {});
	},
	getSignups,
	function(env, after, signups) {
		env.season.signups = signups;
		after(env.season);
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

	LINEARIZATION_2018S1 : SEASON_LINEAR_2018S1,
	LINEARIZATION_2018S2 : SEASON_LINEAR_2018S2,
	LINEARIZATION_MAX_MMR : SEASON_LINEAR_MAX_MMR,

	isValidStatus : isValidStatus,
	isValidType : isValidType,
	isValidLinearization : isValidLinearization,
	isAcceptingSignups : isAcceptingSignups,
	getSeason : getSeason,
	getSeasonBasic : getSeasonBasic,
	getSignups : getSignups,
	getStandins : getStandins,
	getDraftValue : getDraftValue,
};
