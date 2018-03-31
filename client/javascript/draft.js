
var draft = {
	socket : null,
	season : 0,
	options : {}
};

$(window).load(function() {
	var draftTable= $('table#draft-list')[0];
	draft.season = draftTable.dataset.season;
	draft.admin = draftTable.dataset.edit;
	console.log(draft.admin);
	draft.socket = io('/draft-'+draft.season);

	draft.socket.on('log', function(data) {
		console.log('Got a log event');
		console.log(data);
		draftLog(data);
	});

	draft.socket.on('clearDrafters', function() {
		console.log('Cleared drafters');
		$('#draft-order').html('');
	});

	draft.socket.on('drafter', function(data) {
		console.log('Added drafter '+data.name);
		addDrafter(data);
	});

	draft.socket.on('round', function(data) {
		console.log('Set round to '+data);
		$('#draft-round').html('Round '+data);
	});

	draft.socket.on('team', function(data) {
		console.log('Received team update:');
		console.log(data);
		updateTeam(data);
	});

	draft.socket.on('drafted', function(data) {
		// For now set the teamid to nonzero value to make them "drafted"
		$('#drafter-'+data.steamid).wrap('<s></s>');
		$('tr[data-steamid="'+data.drafted+'"]')[0].dataset.team = 1;
		$('tr[data-steamid="'+data.drafted+'"] > #team').html(data.team);
	});
});

function draftLog(messages) {
	var logList = $('#draft-log');
	messages.forEach(function(v, k) {
		logList.append('<li>'+v+'</li>');
	});
}

function addDrafter(user) {
	var draftOrder = $('#draft-order');
	if (user.drafted) {
		draftOrder.append('<li id="drafter-'+user.steamid+'"><s>'+user.name+'</s></li>');
	}
	else {
		draftOrder.append('<li id="drafter-'+user.steamid+'">'+user.name+'</li>');
	}
}

function updateTeam(data) {
	$('#team-'+data.id+'-count').html(data.players);
	$('#team-'+data.id+'-medal').html(data.medal);
}

function createTeam(steamid) {
	console.log('Creating new team in season '+draft.season+' run by '+steamid);
//	var row = $('tr[data-steamid="'+steamid+'"]')[0];

	$.ajax({
		url : '/seasons/new_team',
		data : {
			season : draft.season,
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

function draftPlayer(steamid) {
	console.log('Drafting player '+steamid+' to your team');
	$.ajax({
		url : '/draft/choose/'+draft.season,
		data : {
			steamid : steamid
		},
		method : 'POST',
		dataType : 'json'
	}).done(function(data, status, xhr) {

	});
}

function setDraftable(steamid, draftable) {
	console.log('Setting draftable to '+draftable+' for player '+steamid+' in season '+draft.season);
	$.ajax({
		url : '/draft/toggle',
		data : {
			steamid : steamid,
			draftable : draftable,
			season : draft.season
		},
		method : 'POST',
		dataType : 'json'
	}).done(function(data, status, xhr) {
		var row = $('tr[data-steamid="'+steamid+'"]')[0];
		var draftableElem = $('tr[data-steamid="'+steamid+'"] > #draftable');
		if (draftable) {
			row.dataset.draftable = "1";
			draftableElem.html(1);
		}
		else {
			row.dataset.draftable = "0";
			draftableElem.html(0);
		}
	});
}

function setFreeAgent(steamid, free) {
	console.log('Setting free agent to '+free+' for player '+steamid+' in season '+draft.season);
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
	var menu = $('#draft-menu');
	menu.html('');

	if (draft.admin && "0" == elem.dataset.vouched && "0" == elem.dataset.standin) {
		menu.append('<li class="pure-menu-item">' +
				    '<a href="#"' +
				    '    onclick="vouch(\''+elem.dataset.steamid+'\');"' +
				    '    class="ld2l-menu-link">Vouch</a></li>');
	}

	if ("0" == elem.dataset.team) {
		if (draft.admin) {
			menu.append('<li class="pure-menu-item">' +
						'<a href="#"' +
						'    onclick="createTeam(\''+elem.dataset.steamid+'\');"' +
						'    class="ld2l-menu-link">Create team</a></li>');
		}
		if ("1" == elem.dataset.draftable) {
			menu.append('<li class="pure-menu-item">' +
						'<a href="#"' +
						'    onclick="draftPlayer(\''+elem.dataset.steamid+'\');"' +
						'    class="ld2l-menu-link">Draft</a></li>');
		}
	}
	else {
//		Can't remove people yet
//		menu.append('<li class="pure-menu-item">' +
//				    '<a href="#"' +
//				    '    onclick="removePlayer(\''+elem.dataset.steamid+'\', \''+elem.dataset.team+'\');"' +
//				    '    class="ld2l-menu-link">Remove from team</a></li>');
	}

	if (draft.admin && "0" == elem.dataset.draftable) {
		menu.append('<li class="pure-menu-item">' +
				    '<a href="#"' +
				    '    onclick="setDraftable(\''+elem.dataset.steamid+'\', true);"' +
				    '    class="ld2l-menu-link">Mark Draftable</a></li>');
	}
	else if (draft.admin) {
		menu.append('<li class="pure-menu-item">' +
				    '<a href="#"' +
				    '    onclick="setDraftable(\''+elem.dataset.steamid+'\', false);"' +
				    '    class="ld2l-menu-link">Mark Undraftable</a></li>');
	}

	if (draft.admin && "0" == elem.dataset.freeagent) {
		menu.append('<li class="pure-menu-item">' +
				    '<a href="#"' +
				    '    onclick="setFreeAgent(\''+elem.dataset.steamid+'\', true);"' +
				    '    class="ld2l-menu-link">Make Free Agent</a></li>');
	}
	else if (draft.admin) {
		menu.append('<li class="pure-menu-item">' +
				    '<a href="#"' +
				    '    onclick="setFreeAgent(\''+elem.dataset.steamid+'\', false);"' +
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
