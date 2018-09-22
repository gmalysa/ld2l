
var draft = {
	socket : null,
	season : 0,
	options : {}
};

$(window).load(function() {
	var draftTable= $('table#draft-list')[0];
	draft.season = draftTable.dataset.season;
	draft.admin = draftTable.dataset.edit;
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

/**
 * Called by ld2l.showMenu when a context menu should be generated, populate it with
 * draft-page-related options
 */
function showMenu(elem, event) {
	if ("0" == elem.dataset.team) {
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
}

$(document).ready(function() {
	ld2l.registerMenuHandler(showMenu);
});
