/**
 * Show/hide schedule matchup details
 */

if (undefined === ld2l) {
	var ld2l = {};
}

ld2l.expandedSeries = null;

ld2l.expandSeries = function(key) {
	if (ld2l.expandedSeries) {
		$('tr[data-series="'+ld2l.expandedSeries+'"]').css('display', 'none');

		if (key == ld2l.expandedSeries) {
			ld2l.expandedSeries = null;
			return;
		}
	}

	$('tr[data-series="'+key+'"]').css('display', 'table-row');
	ld2l.expandedSeries = key;
};
