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
