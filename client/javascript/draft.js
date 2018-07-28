
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
		$('#drafter-'+data.steamid).wrap('<s></s>');
		$('tr[data-steamid="'+data.drafted+'"]')[0].dataset.team = data.team;
		$('tr[data-steamid="'+data.drafted+'"] > #team').html(data.team);
		$('tr[data-steamid="'+data.drafted+'"]').addClass('drafted');
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
		accepts : 'application/json'
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

function setStandin(steamid, free) {
	console.log('Setting standin to '+free+' for player '+steamid+' in season '+draft.season);
	$.ajax({
		url : '/standin/toggle',
		data : {
			steamid : steamid,
			standin : free,
			season : draft.season
		},
		method : 'POST',
		dataType : 'json'
	}).done(function(data, status, xhr) {
		var row = $('tr[data-steamid="'+steamid+'"]')[0];
		if (free) {
			row.dataset.validstandin = "1";
		}
		else
		{
			row.dataset.validstandin = "0";
		}
	});
}

/**
 * Called by ld2l.showMenu when a context menu should be generated, populate it with
 * draft-page-related options
 */
function showMenu(elem, event) {
	if (draft.admin && "0" == elem.dataset.vouched && "0" == elem.dataset.standin) {
		ld2l.addMenuItem('Vouch', vouch.bind(null, elem.dataset.steamid));
	}

	if ("0" == elem.dataset.team) {
		if (draft.admin) {
			ld2l.addMenuItem('Create Team',
			                 createTeam.bind(null, elem.dataset.steamid));
		}
		if ("1" == elem.dataset.draftable) {
			ld2l.addMenuItem('Draft', draftPlayer.bind(null, elem.dataset.steamid));
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
		ld2l.addMenuItem('Make Draftable',
		                 setDraftable.bind(null, elem.dataset.steamid, true));
	}
	else if (draft.admin) {
		ld2l.addMenuItem('Make Undraftable',
		                 setDraftable.bind(null, elem.dataset.steamid, false));
	}

	if (draft.admin && "0" == elem.dataset.validstandin) {
		ld2l.addMenuItem('Make Standin',
		                 setStandin.bind(null, elem.dataset.steamid, true));
	}
	else if (draft.admin) {
		ld2l.addMenuItem('Remove Standin',
		                 setStandin.bind(null, elem.dataset.steamid, false));
	}
}

$(document).ready(function() {
	ld2l.registerMenuHandler(showMenu);
});
