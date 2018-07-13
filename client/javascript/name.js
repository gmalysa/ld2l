/**
 * Handle renaming things via ajax
 */

if (undefined === ld2l) {
	var ld2l = {};
}

ld2l.editingName = false;

ld2l.editName = function(el) {
	if (!ld2l.editingName) {
		ld2l.editingName = true;

		var curName = el.dataset.name;
		var newEl = document.createElement('input');
		newEl.setAttribute('type', 'text');
		newEl.setAttribute('value', curName);
		$(newEl).on('blur', function() {
			var newName = $(newEl).val();
			var parent = $(el);
			$(newEl).detach();

			parent.html(newName+'&nbsp;<span class="fa fa-edit"></span>');
			parent.data('name', newName);
			ld2l.editingName = false;

			if (newName != curName) {
				$.ajax({
					url : parent.data('renameUrl'),
					data : {
						name : newName
					},
					method : 'POST',
					accepts : 'application/json'
				}).done(function(data, status, xhr) {
				});
			}
		});
		$(newEl).on('keydown', function(e) {
			if (e.key === 'Enter') {
				$(newEl).blur();
			}
		});

		$(el).empty();
		$(el).append(newEl);
		$(newEl).focus();
	}
}
