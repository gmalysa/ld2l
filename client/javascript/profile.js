function changePriv(box, steamid, id) {
	$.ajax({
		url : '/profile/'+steamid+'/priv',
		data : {
			priv : id,
			value : box.checked ? '1' : '0'
		},
		method : 'POST',
		accepts : 'application/json'
	}).done(function(data, status, xhr) {
		console.log(data);
		var jbox = $(box).parent();
		jbox.css('color', '#00cc00');
		setTimeout(function() {
			jbox.css('color', 'inherit');
		}, 700);
	});
}

var editing = false;

function editName(el) {
	if (!editing) {
		editing = true;

		var curName = el.dataset.name;
		var newEl = document.createElement('input');
		newEl.setAttribute('type', 'text');
		newEl.setAttribute('value', curName);
		$(newEl).on('blur', submitName.bind(null, curName, newEl));
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

function submitName(oldName, el) {
	var newName = $(el).val();
	var parent = $(el).parent();
	$(el).detach();

	parent.html(newName+'&nbsp;<span class="fa fa-edit"></span>');
	parent.data('name', newName);
	editing = false;

	$.ajax({
		url : '/profile/'+parent.data('steamid')+'/rename',
		data : {
			name : newName
		},
		method : 'POST',
		accepts : 'application/json'
	}).done(function(data, status, xhr) {
		console.log(data);
	});
}
