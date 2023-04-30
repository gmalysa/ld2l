/**
 * Audit log used to record things that happen
 */

var _ = require('underscore');
var fl = require('flux-link');
var db = require('db-filters');

const EVENT_ADD_PRIV = 1;
const EVENT_REMOVE_PRIV = 2;
const EVENT_VOUCH = 3;
const EVENT_DISBAND = 4;
const EVENT_UNDISBAND = 5;
const EVENT_RENAME = 6;
const EVENT_CREATE = 7;
const EVENT_ADD_PLAYER = 8;
const EVENT_REMOVE_PLAYER = 9;
const EVENT_SET_CAPTAIN = 10;
const EVENT_EDIT = 11;
const EVENT_SIGNUP_FLAG = 12;
const EVENT_SET_STARTING_CASH = 13;

const TARGET_USER = 0;
const TARGET_SEASON = 1;
const TARGET_TEAM = 2;
const TARGET_MATCH = 3;

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
		case TARGET_MATCH:
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

/**
 * Shorthand to log an event targeting a match
 * @see logEvent
 */
var logMatchEvent = new fl.Chain(
	function(env, after, source, evtType, target, data) {
		after(source, evtType, TARGET_MATCH, target, data);
	},
	logEvent
);

/**
 * Translation table for events to be used when building UIs to act on audit log events
 */
var eventList = [{
	id : EVENT_ADD_PRIV,
	label : 'Add Privilege',
}, {
	id : EVENT_REMOVE_PRIV,
	label : 'Remove Privilege',
}, {
	id : EVENT_VOUCH,
	label : 'Vouch',
}, {
	id : EVENT_DISBAND,
	label : 'Disband',
}, {
	id : EVENT_UNDISBAND,
	label : 'Un-Disband',
}, {
	id : EVENT_RENAME,
	label : 'Rename',
}, {
	id : EVENT_CREATE,
	label : 'Create',
}, {
	id : EVENT_ADD_PLAYER,
	label : 'Add Player',
}, {
	id : EVENT_REMOVE_PLAYER,
	label : 'Remove Player',
}, {
	id : EVENT_SET_CAPTAIN,
	label : 'Set Captain',
}, {
	id : EVENT_EDIT,
	label : 'Edit',
}, {
	id : EVENT_SIGNUP_FLAG,
	label : 'Toggle Signup Flag'
}, {
	id : EVENT_SET_STARTING_CASH,
	label : 'Set team starting cash'
}];

module.exports = {
	EVENT_ADD_PRIV : EVENT_ADD_PRIV,
	EVENT_REMOVE_PRIV : EVENT_REMOVE_PRIV,
	EVENT_VOUCH : EVENT_VOUCH,
	EVENT_DISBAND : EVENT_DISBAND,
	EVENT_UNDISBAND : EVENT_UNDISBAND,
	EVENT_RENAME : EVENT_RENAME,
	EVENT_CREATE : EVENT_CREATE,
	EVENT_ADD_PLAYER : EVENT_ADD_PLAYER,
	EVENT_REMOVE_PLAYER : EVENT_REMOVE_PLAYER,
	EVENT_SET_CAPTAIN : EVENT_SET_CAPTAIN,
	EVENT_EDIT : EVENT_EDIT,
	EVENT_SIGNUP_FLAG : EVENT_SIGNUP_FLAG,
	EVENT_SET_STARTING_CASH : EVENT_SET_STARTING_CASH,

	TARGET_USER : TARGET_USER,
	TARGET_SEASON : TARGET_SEASON,
	TARGET_TEAM : TARGET_TEAM,
	TARGET_MATCH : TARGET_MATCH,

	eventList : eventList,

	logEvent : logEvent,
	logUserEvent : logUserEvent,
	logSeasonEvent : logSeasonEvent,
	logTeamEvent : logTeamEvent,
	logMatchEvent : logMatchEvent
};
