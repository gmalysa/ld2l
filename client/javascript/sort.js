$(document).ready(function() {
	$('th').each(function() {
		var idx = $(this).index();
		var th = this;
		var table = th.closest('table');
		th.dataset.asc = 1;
		$(th).on('click', function() {
			th.dataset.asc = 1 - th.dataset.asc;

			var rows = $(table).find('tbody > tr');
			rows.detach();
			rows.sort(function(a, b) {
				var aText = $(a).children(':nth-child('+(idx+1)+')').text();
				var bText = $(b).children(':nth-child('+(idx+1)+')').text();
				var aInt = parseFloat(aText);
				var bInt = parseFloat(bText);
				if (isNaN(aInt) || isNaN(bInt)) {
					if (th.dataset.asc > 0)
						return aText.localeCompare(bText);
					else
						return bText.localeCompare(aText);
				}
				else {
					if (th.dataset.asc > 0)
						return aInt - bInt;
					else
						return bInt - aInt;
				}
			});
			$(table).append(rows);
		});
	});
});

