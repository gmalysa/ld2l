/**
 * Audit log used to record things that happen
 */

var _ = require('underscore');
var fl = require('flux-link');
var db = require('db-filters');

const EVENT_ADD_PRIV = 1;
const EVENT_REMOVE_PRIV = 2;
const EVENT_VOUCH = 3;

const TARGET_USER = 0;
const TARGET_SEASON = 1;
const TARGET_TEAM = 2;

/**
 * Get the ID from a target, which is a different field based on the type of object
 * @param[in] type The type of the target from the above constants
 * @param[in] target The target object itself
 * @return The identifier that should be used to reference this object in the audit log
 */
function getTargetID(type, target) {
	switch (type) {
		case TARGET_USER:
			return target.steamid;
		case TARGET_SEASON:
			return target.id;
		case TARGET_TEAM:
			return target.id;
	}

	return 0;
}

/**
 * Log an event from a user modifying another user
 * @param[in] source The user doing the action
 * @param[in] evtType The event type from the list of constants
 * @param[in] targetType The type of target object (user, season, team, etc.)
 * @param[in] target The target user being acted on
 * @param[in] data Additional data to be stored in JSON
 */
var logEvent = new fl.Chain(
	function(env, after, source, evtType, targetType, target, data) {
		env.filters.audit.insert({
			time : db.$now(),
			steamid : source.steamid,
			action : evtType,
			targettype : targetType,
			targetid : getTargetID(targetType, target),
			data : JSON.stringify(data)
		}).exec(after, env.$throw);
	}
);

/**
 * Shorthand to log an event targeting a user
 * @see logEvent
 */
var logUserEvent = new fl.Chain(
	function(env, after, source, evtType, target, data) {
		after(source, evtType, TARGET_USER, target, data);
	},
	logEvent
);

/**
 * Shorthand to log an event targeting a season
 * @see logEvent
 */
var logSeasonEvent = new fl.Chain(
	function(env, after, source, evtType, target, data) {
		after(source, evtType, TARGET_SEASON, target, data);
	},
	logEvent
);

/**
 * Shorthand to log an event targeting a team
 * @see logEvent
 */
var logTeamEvent = new fl.Chain(
	function(env, after, source, evtType, target, data) {
		after(source, evtType, TARGET_TEAM, target, data);
	},
	logEvent
);

module.exports = {
	EVENT_ADD_PRIV : EVENT_ADD_PRIV,
	EVENT_REMOVE_PRIV : EVENT_REMOVE_PRIV,
	EVENT_VOUCH : EVENT_VOUCH,

	TARGET_USER : TARGET_USER,
	TARGET_SEASON : TARGET_SEASON,
	TARGET_TEAM : TARGET_TEAM,

	logEvent : logEvent,
	logUserEvent : logUserEvent,
	logSeasonEvent : logSeasonEvent,
	logTeamEvent : logTeamEvent
};
