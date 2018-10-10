/**
 * Javascript for the teams page mostly for admins
 */

if (undefined === ld2l) {
	var ld2l = {};
}

ld2l.addPlayerToTeam = function() {
	var elem = $('#player');
	if (elem.data('steamid'))
		elem.val(elem.data('steamid'));
	$('#addPlayerForm').submit();
};
