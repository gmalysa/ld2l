/**
 * Audit log used to record things that happen
 */

var _ = require('underscore');
var fl = require('flux-link');
var db = require('db-filters');

const EVENT_ADD_PRIV = 1;
const EVENT_REMOVE_PRIV = 2;
const EVENT_VOUCH = 3;

/**
 * Log an event from a user modifying another user
 * @param[in] source The user doing the action
 * @param[in] type The event type from the list of constants
 * @param[in] target The target user being acted on
 * @param[in] data Additional data to be stored in JSON
 */
var logEvent = new fl.Chain(
	function(env, after, source, type, target, data) {
		env.filters.audit.insert({
			time : db.$now(),
			steamid : source.steamid,
			action : type,
			targetid : target.steamid,
			data : JSON.stringify(data)
		}).exec(after, env.$throw);
	}
);


module.exports = {
	EVENT_ADD_PRIV : EVENT_ADD_PRIV,
	EVENT_REMOVE_PRIV : EVENT_REMOVE_PRIV,
	EVENT_VOUCH : EVENT_VOUCH,

	logEvent : logEvent
};
