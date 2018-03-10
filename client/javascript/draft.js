function createTeam(season, steamid) {
	console.log('Creating new team in season '+season+' run by '+steamid);
//	var row = $('tr[data-steamid="'+steamid+'"]')[0];

	$.ajax({
		url : '/seasons/new_team',
		data : {
			season : season,
			steamid : steamid
		},
		method : 'POST',
		dataType : 'json'
	}).done(function(data, status, xhr) {
		console.log(data);
		console.log(status);
	});
}

function vouch(steamid) {
	$.ajax({
		url : '/profile/'+steamid+'/vouch',
		method : 'GET',
		dataType : 'json'
	}).done(function(data, status, xhr) {
		if (data.success) {
			var row = $('tr[data-steamid="'+steamid+'"]')[0];
			row.dataset.vouched = "1";
		}
	});
}

function removePlayer(steamid, team) {
	console.log('Removing player '+steamid+' from team '+team);
}

function draft(steamid) {
	console.log('Drafting player '+steamid+' to currently drafting team');
}

function setDraftable(season, steamid, draftable) {
	console.log('Setting draftable to '+draftable+' for player '+steamid+' in season '+season);
}

function setFreeAgent(season, steamid, free) {
	console.log('Setting free agent to '+free+' for player '+steamid+' in season '+season);
}

function clearMenu() {
	$('#draft-menu').css({display : 'none'});
	$('body').off('click');
}

/**
 * @todo use a dust template to render the menu contents more intelligently; do it inline for now
 * to expedite the design cycle
 */
function showMenu(elem, event) {
	var seasonId = $('#draft-list')[0].dataset.season;
	var menu = $('#draft-menu');
	menu.html('');

	if ("0" == elem.dataset.vouched) {
		menu.append('<li class="pure-menu-item">' +
				    '<a href="#"' +
				    '    onclick="vouch(\''+elem.dataset.steamid+'\');"' +
				    '    class="ld2l-menu-link">Vouch</a></li>');
	}

	if ("0" == elem.dataset.team) {
		menu.append('<li class="pure-menu-item">' +
				    '<a href="#"' +
				    '    onclick="createTeam('+seasonId+', \''+elem.dataset.steamid+'\');"' +
				    '    class="ld2l-menu-link">Create team</a></li>');
		if ("1" == elem.dataset.draftable) {
			menu.append('<li class="pure-menu-item">' +
						'<a href="#"' +
						'    onclick="draft('+seasonId+', \''+elem.dataset.steamid+'\');"' +
						'    class="ld2l-menu-link">Draft</a></li>');
		}
	}
	else {
		menu.append('<li class="pure-menu-item">' +
				    '<a href="#"' +
				    '    onclick="removePlayer(\''+elem.dataset.steamid+'\', \''+elem.dataset.team+'\');"' +
				    '    class="ld2l-menu-link">Remove from team</a></li>');
	}

	if ("0" == elem.dataset.draftable) {
		menu.append('<li class="pure-menu-item">' +
				    '<a href="#"' +
				    '    onclick="setDraftable('+seasonId+', \''+elem.dataset.steamid+'\', false);"' +
				    '    class="ld2l-menu-link">Mark Undraftable</a></li>');
	}
	else {
		menu.append('<li class="pure-menu-item">' +
				    '<a href="#"' +
				    '    onclick="setDraftable('+seasonId+', \''+elem.dataset.steamid+'\', true);"' +
				    '    class="ld2l-menu-link">Mark Draftable</a></li>');
	}

	if ("0" == elem.dataset.freeagent) {
		menu.append('<li class="pure-menu-item">' +
				    '<a href="#"' +
				    '    onclick="setFreeAgent('+seasonId+', \''+elem.dataset.steamid+'\', true);"' +
				    '    class="ld2l-menu-link">Make Free Agent</a></li>');
	}
	else {
		menu.append('<li class="pure-menu-item">' +
				    '<a href="#"' +
				    '    onclick="setFreeAgent('+seasonId+', \''+elem.dataset.steamid+'\', false);"' +
				    '    class="ld2l-menu-link">Remove Free Agent</a></li>');
	}

	menu.wrap('<ul class="pure-menu-list"></ul>');
	menu.css({
		top : event.clientY,
		left : event.clientX,
		display : 'block'
	});

	$('body').on('click', clearMenu);
	event.stopPropagation();
}
