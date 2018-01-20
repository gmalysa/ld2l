/**
 * Utilities associated with season management not related to privs
 */

var _ = require('underscore');
var fl = require('flux-link');

const SEASON_STATUS_HIDDEN = 0;
const SEASON_STATUS_SIGNUPS = 1;
const SEASON_STATUS_PLAYING = 2;
const SEASON_STATUS_FINISHED = 3;

/**
 * Check if a value given is a valid season status value
 * @param[in] mixed status The status to test
 * @return true if it is an integer and one of the season status constants, false otherwise
 */
function isValidStatus(status) {
	return (status >= SEASON_STATUS_HIDDEN && status <= SEASON_STATUS_FINISHED);
}

module.exports = {
	STATUS_HIDDEN : SEASON_STATUS_HIDDEN,
	STATUS_SIGNUPS : SEASON_STATUS_SIGNUPS,
	STATUS_PLAYING : SEASON_STATUS_PLAYING,
	STATUS_FINISEHD : SEASON_STATUS_FINISHED,

	isValidStatus : isValidStatus
};
